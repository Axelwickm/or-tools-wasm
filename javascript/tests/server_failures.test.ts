import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { SolverJobEvent } from '../lib/solver_executor.ts';
import { create, toBinary } from '@bufbuild/protobuf';

test('server failures distinguish HTTP, transport and protocol errors', async (t) => {
  const bundled = await build({
    stdin: {
      contents: `export { SolverServerExecutor } from './solver_server_executor.ts';
        export { executeSolverJob } from './solver_job.ts';
        export { SolverFailureKind, SolverJobState, createSolverFailureEvent, createSolverJobStatusEvent } from './solver_executor.ts';
        export { SolverEventBatchSchema } from './generated/bridge/job_pb.ts';
        export * from './solver_bridge.ts';`,
      resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  const {
    SolverServerExecutor, executeSolverJob, SolverFailureKind: Kind, SolverJobState: State,
    createSolverFailureEvent, createSolverJobStatusEvent,
    encodeSolverBridgeFailure, encodeSolverBridgeStatus, encodeSolverBridgeResult,
    encodeSolverBridgeCallbackRequest,
    SolverEventBatchSchema, decodeSolverBridgeRequest, decodeSolverBridgeResponse,
  } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const codec = { solver: 'test', label: 'Test', encodeRequest: () => new Uint8Array(), decodeResult: () => 1 };
  await t.test('a malformed streamed result preserves its decoder error after cleanup', async () => {
    const error = new Error('Malformed native result');
    const requests: string[] = [];
    const accepted = encodeSolverBridgeStatus(1, 'test',
      createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n);
    const terminal = encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 2n);
    const executor = new SolverServerExecutor({ ...codec, decodeResult: () => { throw error; } }, {
      url: 'http://unused.invalid', fetch: async (url: URL, init?: RequestInit) => {
        requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
        if (url.pathname === '/jobs') return new Response(accepted, { status: 202 });
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        if (url.pathname.endsWith('/stream')) return new Response(`data: ${Buffer.from(terminal).toString('base64')}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } });
        throw new Error('Protocol failure must not resume polling');
      },
    });
    await assert.rejects(executor.execute({}, { onEvent: () => {} }).result, failure => failure === error);
    assert.deepEqual(requests, ['POST /jobs', 'GET /jobs/7/stream', 'DELETE /jobs/7']);
  });
  for (const solver of ['cp-sat', 'mathopt', 'mp-solver']) {
    for (const stage of ['headers', 'body'] as const) {
      await t.test(`${solver} cancellation during submission ${stage} settles even if fetch ignores abort`, async () => {
        let signal: AbortSignal | undefined;
        let deliver!: (response: Response) => void;
        let body: ReadableStreamDefaultController<Uint8Array> | undefined;
        const cancellations: string[] = [];
        const events: SolverJobEvent[] = [];
        const accepted = encodeSolverBridgeStatus(1, solver,
          createSolverJobStatusEvent(solver, 1, State.RUNNING, 0n).status, 7n, 1n);
        const executor = new SolverServerExecutor({ ...codec, solver }, { url: 'http://unused.invalid',
          fetch: async (url: URL, init?: RequestInit) => {
            if (url.pathname === '/jobs') {
              signal = init?.signal ?? undefined;
              if (stage === 'headers') return new Promise<Response>(resolve => { deliver = resolve; });
              return new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }), { status: 202 });
            }
            cancellations.push(url.pathname);
            return new Response(null, { status: 204 });
          },
        });
        const job = executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } });
        const rejected = assert.rejects(job.result, { name: 'AbortError' });
        await nextTurn();
        await job.cancel();
        await rejected;
        assert.equal(signal?.aborted, true);
        assert.equal(events[events.length - 1]?.type, 'failure');
        const failure = events[events.length - 1];
        assert.equal(failure?.type === 'failure' && failure.failure.kind, Kind.CANCELLED);
        assert.deepEqual(cancellations, [], 'No job id is available yet');
        // A custom fetch can still deliver a late accepted job. Clean it up.
        if (stage === 'headers') deliver(new Response(accepted, { status: 202 }));
        else { body!.enqueue(accepted); body!.close(); }
        await nextTurn();
        assert.deepEqual(cancellations, [`/jobs/7/${solver === 'mathopt' ? 'interrupt' : 'cancel'}`]);
      });
    }
  }
  await t.test('high-level signal cancellation settles a stalled server submission', async () => {
    const controller = new AbortController();
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid',
      fetch: async () => new Promise<Response>(() => {}),
    });
    const result = executeSolverJob(executor, {}, { signal: controller.signal });
    const rejected = assert.rejects(result, { name: 'AbortError' });
    controller.abort();
    await rejected;
  });
  for (const stalled of ['request', 200, 409, 503] as const) {
    await t.test(`callback deadline covers a stalled ${stalled === 'request' ? 'request' : `${stalled} response body`}`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const accepted = encodeSolverBridgeStatus(1, 'test',
        createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n);
      const callback = decodeSolverBridgeResponse(encodeSolverBridgeCallbackRequest(1, 'test', 1n, new Uint8Array(), 7n, 2n));
      const events: SolverJobEvent[] = [];
      let signal: AbortSignal | undefined;
      let sendHeaders: ((response: Response) => void) | undefined;
      let body: ReadableStreamDefaultController<Uint8Array> | undefined;
      let cancellations = 0;
      let settled = false;
      const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid',
        fetch: async (url: URL, init?: RequestInit) => {
          if (url.pathname === '/jobs') return new Response(accepted, { status: 202 });
          if (url.pathname.endsWith('/events')) return new Response(toBinary(SolverEventBatchSchema,
            create(SolverEventBatchSchema, { responses: [callback] })));
          if (url.pathname.endsWith('/callback')) {
            signal = init?.signal ?? undefined;
            // Deliberately ignore abort to verify the executor still settles.
            return new Promise<Response>(resolve => { sendHeaders = resolve; });
          }
          if (url.pathname.endsWith('/cancel')) {
            ++cancellations;
            return new Response(null, { status: 204 });
          }
          throw new Error('Timed-out callback incorrectly continued to polling');
        },
      });
      const result = executor.execute({}, {
        onEvent: (event: SolverJobEvent) => { events.push(event); },
        onCallback: () => new Uint8Array(),
      }).result;
      void result.then(() => { settled = true; }, () => { settled = true; });
      const rejected = assert.rejects(result, { name: 'TimeoutError', message: 'Solver callback reply timed out.' });
      try {
        await nextTurn();
        assert.ok(signal, 'callback POST has an abort signal');
        t.mock.timers.tick(29_000);
        if (stalled !== 'request') {
          const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }),
            { status: stalled, headers: { 'content-type': 'application/x-protobuf' } });
          sendHeaders!(response);
          await nextTurn();
          assert.ok(response.body?.locked, 'response body consumption has started');
        }
        t.mock.timers.tick(999);
        await nextTurn();
        assert.equal(settled, false, 'one deadline covers both receiving headers and reading the body');
        t.mock.timers.tick(1);
        await rejected;
        await nextTurn();
        assert.equal(signal.aborted, true);
        assert.equal(signal.reason.name, 'TimeoutError');
        assert.equal(cancellations, 1, 'timeout attempts native cancellation once');
        const failures = events.filter(event => event.type === 'failure');
        assert.equal(failures.length, 1);
        assert.equal(failures[0].failure.kind, Kind.TIMEOUT);
        assert.equal(failures[0].failure.retryable, true);
      } finally {
        body?.error(new Error('release stalled test body'));
      }
    });
  }
  await t.test('a completed callback reply clears its deadline', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let signal: AbortSignal | undefined;
    const accepted = encodeSolverBridgeStatus(1, 'test',
      createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n);
    const callback = encodeSolverBridgeCallbackRequest(1, 'test', 1n, new Uint8Array(), 7n, 2n);
    const terminal = encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 3n);
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid',
      fetch: async (url: URL, init?: RequestInit) => {
        if (url.pathname === '/jobs') return new Response(accepted, { status: 202 });
        if (url.pathname.endsWith('/events')) return new Response(toBinary(SolverEventBatchSchema,
          create(SolverEventBatchSchema, { responses: [callback, terminal].map(decodeSolverBridgeResponse) })));
        if (url.pathname.endsWith('/callback')) {
          signal = init?.signal ?? undefined;
          return new Response('acknowledged');
        }
        assert.equal(init?.method, 'DELETE');
        return new Response(null, { status: 204 });
      },
    });
    assert.equal(await executor.execute({}, { onEvent: () => {}, onCallback: () => new Uint8Array() }).result, 1);
    t.mock.timers.tick(30_000);
    assert.equal(signal?.aborted, false, 'no stale timer aborts an acknowledged reply');
  });
  await t.test('callback reply connection failure rejects without falling back to result polling', async () => {
    const accepted = encodeSolverBridgeStatus(1, 'test', createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n);
    const callback = encodeSolverBridgeCallbackRequest(1, 'test', 1n, Uint8Array.of(7), 7n, 2n);
    let cancelled = 0;
    const events: SolverJobEvent[] = [];
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid', fetch: async (url: URL) => {
      if (url.pathname === '/jobs') return new Response(accepted, {status:202});
      if (url.pathname.endsWith('/events')) return new Response(toBinary(SolverEventBatchSchema,
        create(SolverEventBatchSchema, {responses:[decodeSolverBridgeResponse(callback)]})));
      if (url.pathname.endsWith('/callback')) throw new TypeError('callback link lost');
      if (url.pathname.endsWith('/cancel')) { ++cancelled; return new Response(accepted); }
      throw new Error('Callback failure incorrectly continued to result polling');
    } });
    await assert.rejects(executor.execute({}, {onEvent:(event:SolverJobEvent)=>{events.push(event);}, onCallback:()=>new Uint8Array()}).result,
      /callback link lost/);
    assert.equal(cancelled, 1);
    assert.equal(events.find(event=>event.type==='failure')?.failure.kind, Kind.SERVER_DISCONNECTED);
  });
  await t.test('a callback closed by interruption settles through the native terminal response', async () => {
    const accepted = encodeSolverBridgeStatus(1, 'test', createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n);
    const callback = encodeSolverBridgeCallbackRequest(1, 'test', 1n, new Uint8Array(), 7n, 2n);
    const result = encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 3n);
    const executor = new SolverServerExecutor(codec, {url:'http://unused.invalid',fetch:async (url:URL, options?:RequestInit)=>{
      if (url.pathname === '/jobs') return new Response(accepted,{status:202});
      if (url.pathname.endsWith('/events')) return new Response(toBinary(SolverEventBatchSchema,
        create(SolverEventBatchSchema, {responses:[callback,result].map(decodeSolverBridgeResponse)})));
      if (url.pathname.endsWith('/callback')) return new Response('Callback already closed',{status:409});
      if (options?.method === 'DELETE') return new Response('');
      throw new Error('Unexpected request after interrupted callback');
    }});
    assert.equal(await executor.execute({}, {onEvent:()=>{},onCallback:()=>new Uint8Array()}).result, 1);
  });
  await t.test('six concurrent callback solves leave HTTP/1.1 connections available for replies', {timeout:2000}, async () => {
    let activeConnections = 0;
    const waiting: Array<() => void> = [];
    const replies = new Set<bigint>();
    let callbacks = 0;
    const requests: string[] = [];
    const executor = new SolverServerExecutor(codec, {url:'http://unused.invalid',statusIntervalMs:0,
      fetch:async (url:URL, init?:RequestInit) => {
        if (activeConnections === 6) await new Promise<void>(resolve => waiting.push(resolve));
        else ++activeConnections;
        const release = () => {
          const next = waiting.shift();
          if (next) next();
          else --activeConnections;
        };
        requests.push(url.pathname);
        const id = BigInt(url.pathname.split('/')[2] ?? 0);
        let response: Response;
        if (url.pathname === '/jobs') {
          const request = decodeSolverBridgeRequest(new Uint8Array(init!.body as ArrayBuffer));
          response = new Response(encodeSolverBridgeStatus(request.requestId, 'test',
            createSolverJobStatusEvent('test',request.requestId,State.RUNNING,0n).status,BigInt(request.requestId),1n), {status:202});
        } else if (url.pathname.endsWith('/stream')) {
          // An SSE connection stays occupied until its native solve completes.
          return new Response(new ReadableStream(), {headers:{'content-type':'text/event-stream'}});
        } else if (url.pathname.endsWith('/events')) {
          const event = replies.has(id)
            ? encodeSolverBridgeResult(Number(id),'test',new Uint8Array(),id,3n)
            : encodeSolverBridgeCallbackRequest(Number(id),'test',1n,new Uint8Array(),id,2n);
          response = new Response(toBinary(SolverEventBatchSchema,create(SolverEventBatchSchema,{responses:[decodeSolverBridgeResponse(event)]})));
        } else if (url.pathname.endsWith('/callback')) {
          const reply = decodeSolverBridgeRequest(new Uint8Array(init!.body as ArrayBuffer));
          assert.equal(reply.requestId, Number(id));
          assert.equal(reply.operation.case, 'callbackReply');
          replies.add(id);
          response = new Response('');
        } else if (url.pathname.endsWith('/result')) {
          assert.ok(replies.has(id), 'native solve has received its callback reply');
          response = new Response(encodeSolverBridgeResult(Number(id),'test',new Uint8Array(),id,3n));
        } else {
          assert.equal(init?.method,'DELETE');
          release();
          return new Response(null,{status:204});
        }
        const read = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => { try {return await read();} finally {release();} };
        return response;
      }});
    const results = await Promise.all(Array.from({length:6},()=>executor.execute({}, {
      onEvent:()=>{},onCallback:()=>{++callbacks; return new Uint8Array();},
    }).result));
    assert.deepEqual(results,Array(6).fill(1));
    assert.equal(callbacks,6);
    assert.equal(activeConnections,0);
    assert.ok(!requests.some(path=>path.endsWith('/stream')));
  });
  for (const statusIntervalMs of [undefined, 5000, 5]) {
    await t.test(`callback polling stays responsive with status interval ${statusIntervalMs ?? 'default'}`, async t => {
      t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
      const pollTimes: number[] = [];
      let polls = 0;
      let replies = 0;
      let replyTime = 0;
      let repollPending = false;
      const executor = new SolverServerExecutor(codec, {
        url: 'http://unused.invalid', statusIntervalMs,
        fetch: async (url: URL, init?: RequestInit) => {
          if (url.pathname === '/jobs') return new Response(encodeSolverBridgeStatus(1, 'test',
            createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n), { status: 202 });
          if (url.pathname.endsWith('/events')) {
            ++polls;
            pollTimes.push(Date.now());
            if (repollPending) {
              assert.equal(Date.now(), replyTime, 'callback reply triggers an immediate event poll');
              repollPending = false;
            }
            // Two idle polls exercise the callback-specific delay; subsequent
            // callbacks are only produced after the previous reply is accepted.
            if (polls <= 2) return new Response(new Uint8Array());
            const event = replies === 4
              ? encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 6n)
              : encodeSolverBridgeCallbackRequest(1, 'test', BigInt(replies + 1), Uint8Array.of(replies), 7n, BigInt(replies + 2));
            assert.equal(url.searchParams.get('after'), String(replies + 1));
            return new Response(toBinary(SolverEventBatchSchema,
              create(SolverEventBatchSchema, { responses: [decodeSolverBridgeResponse(event)] })));
          }
          if (url.pathname.endsWith('/callback')) {
            const reply = decodeSolverBridgeRequest(new Uint8Array(init!.body as ArrayBuffer));
            assert.equal(reply.operation.value.callbackId, BigInt(replies + 1));
            ++replies;
            repollPending = true;
            replyTime = Date.now();
            return new Response('');
          }
          if (url.pathname.endsWith('/result')) {
            assert.ok(!repollPending, 'callback replies are followed by events, not result polling');
            return new Response(null, { status: 204 });
          }
          assert.equal(init?.method, 'DELETE');
          return new Response(null, { status: 204 });
        },
      });
      let calls = 0;
      let settled = false;
      const result = executor.execute({}, { onEvent: () => {}, onCallback: (data: Uint8Array) => {
        assert.equal(data[0], calls++);
        return new Uint8Array();
      } }).result;
      void result.then(() => { settled = true; }, () => { settled = true; });
      for (let elapsed = 0; elapsed < 100 && !settled; ++elapsed) {
        await nextTurn();
        if (!settled) t.mock.timers.tick(1);
      }
      assert.equal(settled, true, 'callback exchange completes without advancing to the status or I/O deadlines');
      assert.equal(await result, 1);
      assert.equal(calls, 4);
      const idleDelays = pollTimes.slice(1, 3).map((time, index) => time - pollTimes[index]);
      assert.ok(idleDelays.every(ms => ms > 0 && ms <= 20 && ms <= (statusIntervalMs ?? 2000)),
        'callback delays stay short and respect a faster configured interval');
    });
  }
  await t.test('ordinary result polling retains the configured status interval', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let polls = 0;
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid', statusIntervalMs: 5000,
      fetch: async (url: URL, init?: RequestInit) => {
        if (url.pathname === '/jobs') return new Response(encodeSolverBridgeStatus(1, 'test',
          createSolverJobStatusEvent('test', 1, State.RUNNING, 0n).status, 7n, 1n), { status: 202 });
        if (url.pathname.endsWith('/stream')) return new Response(null, { status: 409 });
        if (url.pathname.endsWith('/events')) {
          if (++polls === 1) return new Response(new Uint8Array());
          const result = encodeSolverBridgeResult(1, 'test', new Uint8Array(), 7n, 2n);
          return new Response(toBinary(SolverEventBatchSchema,
            create(SolverEventBatchSchema, { responses: [decodeSolverBridgeResponse(result)] })));
        }
        if (url.pathname.endsWith('/result')) return new Response(null, { status: 204 });
        assert.equal(init?.method, 'DELETE');
        return new Response(null, { status: 204 });
      },
    });
    const result = executor.execute({}, { onEvent: () => {} }).result;
    await nextTurn();
    assert.equal(polls, 1);
    t.mock.timers.tick(4999);
    await nextTurn();
    assert.equal(polls, 1, 'ordinary polling still waits for its configured interval');
    t.mock.timers.tick(1);
    assert.equal(await result, 1);
  });
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
  for (const path of ['stream', 'events', 'result'] as const) {
    for (const nativeFailure of [false, true]) {
      for (const stalled of ['request', 'body'] as const) {
        await t.test(`${path}: stalled cleanup ${stalled} preserves the native ${nativeFailure ? 'failure' : 'result'}`, async t => {
          t.mock.timers.enable({ apis: ['setTimeout'] });
          const events: SolverJobEvent[] = [];
          const terminal = nativeFailure ? failureBytes : resultBytes;
          let cleanupSignal: AbortSignal | undefined;
          let sendHeaders: ((response: Response) => void) | undefined;
          let body: ReadableStreamDefaultController<Uint8Array> | undefined;
          let cleanupResponse: Response | undefined;
          let releases = 0;
          let settled = false;
          const executor = new SolverServerExecutor(codec, {
            url: 'http://unused.invalid',
            fetch: async (url: URL, init?: RequestInit) => {
              if (url.pathname === '/jobs') return new Response(accepted, { status: 202 });
              if (init?.method === 'DELETE') {
                ++releases;
                cleanupSignal = init.signal ?? undefined;
                // Ignore abort to prove cleanup cannot keep the solve pending.
                if (stalled === 'request') return new Promise<Response>(resolve => { sendHeaders = resolve; });
                cleanupResponse = new Response(new ReadableStream<Uint8Array>({ start(controller) { body = controller; } }));
                return cleanupResponse;
              }
              if (url.pathname.endsWith('/stream')) {
                if (path !== 'stream') return new Response(null, { status: 409 });
                return new Response(`data: ${Buffer.from(terminal).toString('base64')}\n\n`,
                  { headers: { 'content-type': 'text/event-stream' } });
              }
              if (url.pathname.endsWith('/events')) {
                if (path === 'result') return new Response(new Uint8Array());
                return new Response(toBinary(SolverEventBatchSchema,
                  create(SolverEventBatchSchema, { responses: [decodeSolverBridgeResponse(terminal)] })));
              }
              if (url.pathname.endsWith('/result')) return new Response(terminal);
              throw new Error(`Unexpected request ${url.pathname}`);
            },
          });
          const result = executor.execute({}, { onEvent: (event: SolverJobEvent) => { events.push(event); } }).result;
          void result.then(() => { settled = true; }, () => { settled = true; });
          const checked = nativeFailure
            ? assert.rejects(result, { message: remoteFailure.message, stack: remoteFailure.trace })
            : result.then((value: number) => assert.equal(value, 1));
          try {
            await nextTurn();
            assert.ok(cleanupSignal, 'cleanup receives an abort signal');
            if (stalled === 'body') assert.ok(cleanupResponse?.body?.locked, 'cleanup response is consumed');
            t.mock.timers.tick(999);
            await nextTurn();
            assert.equal(settled, false, 'cleanup gets its bounded opportunity to finish');
            t.mock.timers.tick(1);
            await checked;
            assert.equal(cleanupSignal.aborted, true, 'the stalled cleanup request is aborted');
            assert.equal(releases, 1);
            // A late reply must not resume terminal handling or add a new failure.
            sendHeaders?.(new Response(null, { status: 204 }));
            await nextTurn();
            assert.deepEqual(events.filter(event => event.type === 'failure'),
              nativeFailure ? [{ type: 'failure', failure: remoteFailure }] : []);
          } finally { body?.error(new Error('release stalled cleanup test body')); }
        });
      }
    }
  }
  await t.test('successful cleanup consumes its response and clears its deadline', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let cleanupSignal: AbortSignal | undefined;
    let consumed = false;
    const executor = new SolverServerExecutor(codec, { url: 'http://unused.invalid',
      fetch: async (url: URL, init?: RequestInit) => {
        if (url.pathname === '/jobs') return new Response(accepted, { status: 202 });
        if (init?.method === 'DELETE') {
          cleanupSignal = init.signal ?? undefined;
          const response = new Response('released');
          const read = response.arrayBuffer.bind(response);
          response.arrayBuffer = async () => { consumed = true; return await read(); };
          return response;
        }
        return new Response(`data: ${Buffer.from(resultBytes).toString('base64')}\n\n`,
          { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    assert.equal(await executor.execute({}, { onEvent: () => {} }).result, 1);
    assert.equal(consumed, true);
    t.mock.timers.tick(30_000);
    assert.equal(cleanupSignal?.aborted, false, 'no stale timer aborts completed cleanup');
  });
});
