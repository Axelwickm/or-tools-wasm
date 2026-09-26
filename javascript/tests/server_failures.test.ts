import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { SolverJobEvent } from '../lib/solver_executor.ts';

test('server failures distinguish HTTP, transport and protocol errors', async (t) => {
  const bundled = await build({
    stdin: {
      contents: `export { SolverServerExecutor } from './solver_server_executor.ts';
        export { SolverFailureKind, SolverJobState, createSolverFailureEvent, createSolverJobStatusEvent } from './solver_executor.ts';
        export * from './solver_bridge.ts';`,
      resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  const {
    SolverServerExecutor, SolverFailureKind: Kind, SolverJobState: State,
    createSolverFailureEvent, createSolverJobStatusEvent,
    encodeSolverBridgeFailure, encodeSolverBridgeStatus, encodeSolverBridgeResult,
  } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const codec = { solver: 'test', label: 'Test', encodeRequest: () => new Uint8Array(), decodeResult: () => 1 };
  for (const [status, kind, retryable] of [
    [400, Kind.INVALID_REQUEST, false], [401, Kind.UNAUTHENTICATED, false],
    [403, Kind.UNAUTHENTICATED, false], [404, Kind.INVALID_REQUEST, false],
    [408, Kind.TIMEOUT, true], [429, Kind.QUEUE_FULL, true],
    [500, Kind.EXECUTOR_ERROR, true], [503, Kind.EXECUTOR_ERROR, true], [504, Kind.TIMEOUT, true],
  ] as const) {
    const executor = new SolverServerExecutor(codec, {
      url: 'http://unused.invalid', fetch: async () => new Response('detail', { status }),
    });
    const events: SolverJobEvent[] = [];
    await assert.rejects(executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } }).result,
      new RegExp(`submission failed \\(${status}.*detail`));
    const failure = events.find((event) => event.type === 'failure');
    assert.equal(failure?.failure.kind, kind, `HTTP ${status}`);
    assert.equal(failure?.failure.retryable, retryable, `HTTP ${status}`);
  }
  for (const [fetch, kind, retryable] of [
    [async () => { throw new TypeError('offline'); }, Kind.SERVER_DISCONNECTED, true],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, Kind.TIMEOUT, true],
    [async () => { throw new DOMException('aborted', 'AbortError'); }, Kind.CANCELLED, false],
    [async () => new Response(Uint8Array.of(255)), Kind.EXECUTOR_ERROR, false],
  ] as const) {
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid', fetch });
    const events: SolverJobEvent[] = [];
    await assert.rejects(executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } }).result);
    const failure = events.find((event) => event.type === 'failure');
    assert.equal(failure?.failure.kind, kind);
    assert.equal(failure?.failure.retryable, retryable);
  }

  const remoteFailure = createSolverFailureEvent('test', 1, 'native failure detail', Kind.UNSUPPORTED_SOLVER, 'remote trace', false).failure;
  const failureBytes = encodeSolverBridgeFailure(1, 'test', remoteFailure, 7n, 3n);
  await t.test('structured failure takes precedence over HTTP status', async () => {
    const executor = new SolverServerExecutor(codec, {
      url: 'http://unused.invalid', fetch: async () => new Response(failureBytes, {
        status: 503, headers: { 'content-type': 'application/x-protobuf' },
      }),
    });
    const events: SolverJobEvent[] = [];
    await assert.rejects(executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } }).result,
      { message: remoteFailure.message, stack: remoteFailure.trace });
    assert.deepEqual(events, [{ type: 'failure', failure: remoteFailure }]);
  });

  const accepted = encodeSolverBridgeStatus(1, 'test', createSolverJobStatusEvent('test', 1, State.QUEUED, 0n).status, 7n, 1n);
  const running = encodeSolverBridgeStatus(1, 'test', createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 2n);
  const resultBytes = encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 3n);
  for (const streamMode of ['connection failure', 'broken stream', 'closed stream'] as const) {
    for (const terminalFailure of [false, true]) {
      await t.test(`${streamMode}: polling resumes and releases a terminal ${terminalFailure ? 'failure' : 'result'}`, async () => {
        const requests: string[] = [];
        const events: SolverJobEvent[] = [];
        const executor = new SolverServerExecutor(codec, {
          url: 'http://unused.invalid', statusIntervalMs: 0,
          fetch: async (input: URL, init?: RequestInit) => {
            const path = input.pathname + input.search;
            requests.push(`${init?.method ?? 'GET'} ${path}`);
            if (path === '/jobs') return new Response(accepted, { status: 202 });
            if (path === '/jobs/7/stream?after=1') {
              if (streamMode === 'connection failure') throw new TypeError('stream unavailable');
              let sent = false;
              const body = new ReadableStream<Uint8Array>({ pull(controller) {
                if (!sent) {
                  sent = true;
                  controller.enqueue(new TextEncoder().encode(`data: ${Buffer.from(running).toString('base64')}\n\n`));
                } else if (streamMode === 'broken stream') controller.error(new TypeError('stream disconnected'));
                else controller.close();
              } }, { highWaterMark: 0 });
              return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
            }
            if (path.startsWith('/jobs/7/events?')) return new Response(new Uint8Array());
            if (path === '/jobs/7/result') return new Response(terminalFailure ? failureBytes : resultBytes);
            if (path === '/jobs/7' && init?.method === 'DELETE') return new Response(null, { status: 204 });
            throw new Error(`Unexpected request ${path}`);
          },
        });
        const job = executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } });
        if (terminalFailure) await assert.rejects(job.result, { message: remoteFailure.message });
        else assert.equal(await job.result, 1);
        assert.deepEqual(requests, [
          'POST /jobs', 'GET /jobs/7/stream?after=1',
          `GET /jobs/7/events?after=${streamMode === 'connection failure' ? 1 : 2}`,
          'GET /jobs/7/result', 'DELETE /jobs/7',
        ]);
        assert.deepEqual(events.filter((event) => event.type === 'failure'),
          terminalFailure ? [{ type: 'failure', failure: remoteFailure }] : []);
        assert.equal(events.filter((event) => event.type === 'status').length,
          streamMode === 'connection failure' ? 1 : 2);
      });
    }
  }

  await t.test('stream and polling connection failures produce one terminal failure', async () => {
    const events: SolverJobEvent[] = [];
    const requests: string[] = [];
    const executor = new SolverServerExecutor(codec, {
      url: 'http://unused.invalid', fetch: async (input: URL) => {
        requests.push(input.pathname);
        if (input.pathname === '/jobs') return new Response(accepted, { status: 202 });
        throw new TypeError('server disconnected');
      },
    });
    await assert.rejects(executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } }).result,
      /server disconnected/);
    const failures = events.filter((event) => event.type === 'failure');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].failure.kind, Kind.SERVER_DISCONNECTED);
    assert.equal(failures[0].failure.retryable, true);
    // No remote terminal response was observed; do not delete a possibly running job.
    assert.deepEqual(requests, ['/jobs', '/jobs/7/stream', '/jobs/7/events']);
  });

  await t.test('failed cleanup does not replace a terminal result or failure', async () => {
    for (const terminal of [resultBytes, failureBytes]) {
      let releases = 0;
      const events: SolverJobEvent[] = [];
      const executor = new SolverServerExecutor(codec, {
        url: 'http://unused.invalid', fetch: async (input: URL, init?: RequestInit) => {
          if (input.pathname === '/jobs') return new Response(accepted, { status: 202 });
          if (init?.method === 'DELETE') { releases++; throw new TypeError('cleanup unavailable'); }
          return new Response(`data: ${Buffer.from(terminal).toString('base64')}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          });
        },
      });
      const job = executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } });
      if (terminal === failureBytes) await assert.rejects(job.result, { message: remoteFailure.message });
      else assert.equal(await job.result, 1);
      assert.equal(releases, 1);
      assert.equal(events.filter((event) => event.type === 'failure').length, terminal === failureBytes ? 1 : 0);
    }
  });
});
