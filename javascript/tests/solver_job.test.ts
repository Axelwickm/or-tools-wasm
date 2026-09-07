import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeSolverJob } from '../lib/solver_job.ts';
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

const abortError = (signal: AbortSignal) => signal.reason;

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
      abortError,
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
      abortError,
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
      abortError,
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
      abortError,
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
    abortError,
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
      abortError,
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
    abortError,
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
      abortError,
      onEvent: () => { throw new Error('callback failed'); },
    }),
    jobError,
  );
});
