import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../lib/solver_job.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { executeSolverJob }: typeof import('../lib/solver_job.ts') =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
import type {
  SolverExecutionOptions,
  SolverExecutor,
  SolverJob,
} from '../lib/solver_executor.ts';

type TestEvent = { type: 'test'; sequence: number };

function executorWith(
  execute: (
    options: SolverExecutionOptions<TestEvent>,
  ) => SolverJob<number>,
): SolverExecutor<string, number, TestEvent> {
  return {
    solver: 'test',
    execute: (_request, options) => execute(options),
    load: async () => {},
    terminate: () => {},
  };
}

test('does not start a job for an already-aborted signal', async () => {
  const controller = new AbortController();
  const reason = new Error('already aborted');
  controller.abort(reason);
  let starts = 0;
  const executor = executorWith(() => {
    starts += 1;
    return { requestId: 1, result: Promise.resolve(1), cancel: async () => {} };
  });

  await assert.rejects(
    executeSolverJob(executor, 'request', {
      signal: controller.signal,
    }),
    reason,
  );
  assert.equal(starts, 0);
});

test('preserves falsy callback failures and suppresses later callbacks', async () => {
  const executor = executorWith((options) => ({
    requestId: 1,
    result: (async () => {
      await options.onEvent({ type: 'test', sequence: 1 });
      await options.onEvent({ type: 'test', sequence: 2 });
      return 1;
    })(),
    cancel: async () => {},
  }));
  let callbacks = 0;
  let successCommitted = false;
  let rejected = false;
  try {
    await executeSolverJob(executor, 'request', {
      onSuccess: () => { successCommitted = true; },
      onEvent: () => {
        callbacks += 1;
        throw undefined;
      },
    });
  } catch (error) {
    rejected = true;
    assert.equal(error, undefined);
  }
  assert.equal(rejected, true);
  assert.equal(callbacks, 1);
  assert.equal(successCommitted, true);
});

test('serializes asynchronous callbacks and retains the first failure', async () => {
  let releaseFirst!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const order: string[] = [];
  const callbackError = new Error('first callback failed');
  const executor = executorWith((options) => ({
    requestId: 1,
    result: (async () => {
      const first = options.onEvent({ type: 'test', sequence: 1 });
      const second = options.onEvent({ type: 'test', sequence: 2 });
      await Promise.resolve();
      assert.deepEqual(order, ['start 1']);
      releaseFirst();
      await Promise.all([first, second]);
      return 1;
    })(),
    cancel: async () => {},
  }));

  await assert.rejects(
    executeSolverJob(executor, 'request', {
      onEvent: async (event) => {
        if (event.type !== 'test') return;
        order.push(`start ${event.sequence}`);
        if (event.sequence === 1) {
          await firstMayFinish;
          order.push('end 1');
          throw callbackError;
        }
        order.push('end 2');
      },
    }),
    callbackError,
  );
  assert.deepEqual(order, ['start 1', 'end 1']);
});

test('catches an abort raised while the executor is starting', async () => {
  const controller = new AbortController();
  const reason = new Error('aborted during startup');
  let cancellations = 0;
  const executor = executorWith((options) => ({
    requestId: 1,
    result: Promise.resolve(options.onEvent({ type: 'test', sequence: 1 })).then(() => 1),
    cancel: async () => {
      cancellations += 1;
      throw new Error('cancellation transport failed');
    },
  }));

  await assert.rejects(
    executeSolverJob(executor, 'request', {
      signal: controller.signal,
      onEvent: () => controller.abort(reason),
    }),
    reason,
  );
  assert.equal(cancellations, 1);
});

test('waits for the job to settle after requesting cancellation', async () => {
  const controller = new AbortController();
  const reason = new Error('aborted');
  let finishJob!: () => void;
  let cancellations = 0;
  const executor = executorWith(() => ({
    requestId: 1,
    result: new Promise<number>((resolve) => {
      finishJob = () => resolve(1);
    }),
    cancel: async () => { cancellations += 1; },
  }));

  let settled = false;
  const execution = executeSolverJob(executor, 'request', {
    signal: controller.signal,
  }).finally(() => { settled = true; });
  controller.abort(reason);
  await Promise.resolve();
  assert.equal(cancellations, 1);
  assert.equal(settled, false);
  finishJob();
  await assert.rejects(execution, reason);
});

test('gives a callback failure precedence over abort after a successful job', async () => {
  const controller = new AbortController();
  const callbackError = new Error('callback failed');
  const executor = executorWith((options) => ({
    requestId: 1,
    result: Promise.resolve(options.onEvent({ type: 'test', sequence: 1 })).then(() => 1),
    cancel: async () => {},
  }));

  await assert.rejects(
    executeSolverJob(executor, 'request', {
      signal: controller.signal,
      onEvent: () => {
        controller.abort(new Error('aborted'));
        throw callbackError;
      },
    }),
    callbackError,
  );
});

test('removes the abort listener after completion', async () => {
  const controller = new AbortController();
  const signal = controller.signal;
  const removeEventListener = signal.removeEventListener.bind(signal);
  let removals = 0;
  signal.removeEventListener = ((...args: Parameters<AbortSignal['removeEventListener']>) => {
    removals += 1;
    return removeEventListener(...args);
  }) as AbortSignal['removeEventListener'];
  const executor = executorWith(() => ({
    requestId: 1,
    result: Promise.resolve(1),
    cancel: async () => {},
  }));

  assert.equal(await executeSolverJob(executor, 'request', {
    signal,
  }), 1);
  assert.equal(removals, 1);
});

test('gives a job rejection precedence over callback and abort failures', async () => {
  const controller = new AbortController();
  const jobError = new Error('job failed');
  const executor = executorWith((options) => ({
    requestId: 1,
    result: Promise.resolve(options.onEvent({ type: 'test', sequence: 1 })).then(() => {
      controller.abort(new Error('aborted'));
      throw jobError;
    }),
    cancel: async () => {},
  }));

  await assert.rejects(
    executeSolverJob(executor, 'request', {
      signal: controller.signal,
      onEvent: () => { throw new Error('callback failed'); },
    }),
    jobError,
  );
});


test('preserves callback failure when native cancellation rejects the job', async () => {
  const controller = new AbortController();
  const callbackError = new Error('callback failed while stopping');
  const executor = executorWith((options) => ({
    requestId: 1,
    result: Promise.resolve(options.onEvent({ type: 'test', sequence: 1 })).then(() => {
      throw new DOMException('native job cancelled', 'AbortError');
    }),
    cancel: async () => {},
  }));
  await assert.rejects(executeSolverJob(executor, 'request', {
    signal: controller.signal,
    onEvent: () => { controller.abort(); throw callbackError; },
  }), callbackError);
});

test('preserves the caller abort reason when cancellation rejects the job', async () => {
  for (const reason of [new Error('caller cancellation'), 'caller cancellation', undefined]) {
    const controller = new AbortController();
    const executor = executorWith(options => ({
      requestId: 1,
      result: Promise.resolve(options.onEvent({ type: 'test', sequence: 1 })).then(() => {
        throw new DOMException('executor cancellation', 'AbortError');
      }),
      cancel: async () => {},
    }));
    await assert.rejects(executeSolverJob(executor, 'request', {
      signal: controller.signal,
      onEvent: () => controller.abort(reason),
    }), error => reason instanceof Error || reason === undefined
      ? error === controller.signal.reason
      : error instanceof Error && error.name === 'AbortError' && error.message === reason);
  }
});

test('preserves executor cancellation errors when the caller has not aborted', async () => {
  const failure = new DOMException('executor cancellation', 'AbortError');
  const executor = executorWith(() => ({
    requestId: 1, result: Promise.reject(failure), cancel: async () => {},
  }));
  await assert.rejects(executeSolverJob(executor, 'request', {}), error => error === failure);
});


test('requests native cancellation promptly after a progress callback fails', async () => {
  const failure = new Error('observer failed');
  let cancellations = 0;
  let rejectJob!: (error: Error) => void;
  const executor = executorWith(options => {
    const result = new Promise<number>((_resolve, reject) => { rejectJob = reject; });
    void options.onEvent({ type: 'test', sequence: 1 });
    return { requestId: 1, result, cancel: async () => {
      ++cancellations;
      rejectJob(new DOMException('Native search interrupted', 'AbortError'));
    } };
  });
  await assert.rejects(executeSolverJob(executor, 'request', {
    onEvent: () => { throw failure; },
  }), failure);
  assert.equal(cancellations, 1);
});

test('native interruption returns a stopped result and removes its listener', async () => {
  const controller = new AbortController();
  let finish!: (value: number) => void;
  let cancels = 0;
  const executor = executorWith(() => ({
    requestId: 1,
    result: new Promise<number>(resolve => { finish = resolve; }),
    cancel: async () => { ++cancels; finish(7); },
  }));
  const result = executeSolverJob(executor, '', { interruptSignal: controller.signal });
  controller.abort();
  assert.equal(await result, 7);
  assert.equal(cancels, 1);
  const lateController = new AbortController();
  const completed = executorWith(() => ({ requestId: 2, result: Promise.resolve(9),
    cancel: async () => { ++cancels; } }));
  assert.equal(await executeSolverJob(completed, '', { interruptSignal: lateController.signal }), 9);
  lateController.abort();
  assert.equal(cancels, 1);
});

test('pre-interrupted native requests retain their encoded termination path', async () => {
  const controller = new AbortController();
  controller.abort();
  let cancels = 0;
  const executor = executorWith(() => ({ requestId: 1, result: Promise.resolve(3),
    cancel: async () => { ++cancels; } }));
  assert.equal(await executeSolverJob(executor, '', { interruptSignal: controller.signal }), 3);
  assert.equal(cancels, 0);
});

test('commits a stopped native result before preserving a callback reply failure', async () => {
  const failure = new Error('native callback failed');
  let committed = false;
  const executor = executorWith(options => ({ requestId: 1,
    result: Promise.resolve().then(() => {
      try { options.onCallback!(new Uint8Array()); } catch {}
      return 7;
    }), cancel: async () => {},
  }));
  await assert.rejects(executeSolverJob(executor, '', {
    onCallback: () => { throw failure; },
    onSuccess: response => { assert.equal(response, 7); committed = true; },
  }), error => error === failure);
  assert.equal(committed, true);
});

test('synchronous observers run inside event emission and retain failures until native state commits', async () => {
  const failure = new Error('live observer failed');
  const delivered: number[] = [];
  let cancellations = 0, committed = false;
  const executor = executorWith(options => {
    // Emit before execute() has returned the job, as a synchronous native hook can.
    void options.onEvent({ type: 'test', sequence: 1 });
    assert.deepEqual(delivered, [1], 'observer runs before native emission returns');
    void options.onEvent({ type: 'test', sequence: 2 });
    void options.onEvent({ type: 'test', sequence: 3 });
    return { requestId: 1, result: Promise.resolve(7), cancel: async () => { ++cancellations; } };
  });
  await assert.rejects(executeSolverJob(executor, '', {
    onEventSync: event => {
      if (event.type !== 'test') return;
      delivered.push(event.sequence);
      if (event.sequence === 2) throw failure;
    },
    onSuccess: value => { assert.equal(value, 7); committed = true; },
  }), error => error === failure);
  assert.deepEqual(delivered, [1, 2], 'later emissions are suppressed after failure');
  assert.equal(cancellations, 1);
  assert.equal(committed, true);
});
