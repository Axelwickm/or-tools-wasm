import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { initializeBunPthread } from '../../scripts/bun_pthread_bootstrap.ts';

test('Bun pthread bootstrap preserves early messages and hands off to the runtime', async () => {
  const received: string[] = [];
  const worker = { onmessage: null as ((event: { data: string }) => void) | null };
  let finishImport!: () => void;
  const imported = new Promise<void>((resolve) => { finishImport = resolve; });
  const context = {
    self: worker,
    loadRuntime: async () => {
      await imported;
      worker.onmessage = (event) => {
        received.push(event.data);
        // Emscripten changes its handler after receiving the load command.
        worker.onmessage = (next) => { received.push(`runtime:${next.data}`); };
      };
    },
  };
  const ready = runInNewContext(`(${initializeBunPthread.toString()})(loadRuntime)`, context);
  worker.onmessage!({ data: 'load' });
  worker.onmessage!({ data: 'run' });
  assert.deepEqual(received, []);
  finishImport();
  await ready;
  worker.onmessage!({ data: 'later' });
  assert.deepEqual(received, ['load', 'runtime:run', 'runtime:later']);
  assert.equal(Reflect.get(context, '__ORTOOLS_WASM_PTHREAD'), true);
});

test('Bun pthread bootstrap propagates runtime import failures', async () => {
  const error = new Error('runtime import failed');
  const ready = runInNewContext(`(${initializeBunPthread.toString()})(loadRuntime)`, {
    self: {},
    loadRuntime: async () => { throw error; },
  });
  await assert.rejects(ready, (actual) => actual === error);
});
