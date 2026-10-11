import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntimeLoader } from '../lib/runtime_loader_core.ts';
import type { OrToolsWasmModule } from '../lib/wasm_module_types.ts';

test('runtime startup failures release assets and allow a shared retry', async t => {
  for (const stage of ['asset', 'factory', 'module'] as const) {
    await t.test(stage, async () => {
      let attempts = 0, cleanups = 0;
      const module = {} as OrToolsWasmModule;
      const loader = createRuntimeLoader({
        resolveAsset() {
          ++attempts;
          if (stage === 'asset' && attempts === 1) throw new Error('startup failed');
          return { jsUrl: 'test', locateFile: value => value, cleanupGlobalState: () => { ++cleanups; } };
        },
        async loadFactory() {
          if (stage === 'factory' && attempts === 1) throw new Error('startup failed');
          return async () => {
            if (stage === 'module' && attempts === 1) throw new Error('startup failed');
            return module;
          };
        },
      });
      await assert.rejects(loader.loadRuntimeAsyncify(), /startup failed/);
      assert.deepEqual(await Promise.all([loader.loadRuntimeAsyncify(), loader.loadRuntimeAsyncify()]), [module, module]);
      assert.equal(attempts, 2);
      assert.equal(cleanups, stage === 'asset' ? 1 : 2);
    });
  }
});

test('cleanup of a rejected runtime does not discard a newer startup', async () => {
  let fail!: (error: Error) => void;
  let attempts = 0;
  const module = {} as OrToolsWasmModule;
  const loader = createRuntimeLoader({
    resolveAsset: () => ({ jsUrl: 'test', locateFile: value => value }),
    async loadFactory() {
      return ++attempts === 1 ? () => new Promise<OrToolsWasmModule>((_, reject) => { fail = reject; }) : async () => module;
    },
  });
  const first = loader.loadRuntimeAsyncify();
  const rejected = assert.rejects(first, /startup failed/);
  await Promise.resolve(); await Promise.resolve();
  const stopping = loader.terminateLoadedRuntimeThreads();
  // Retrying in a failure observer can precede teardown's finally handler.
  const replacement = first.catch(() => loader.loadRuntimeAsyncify());
  fail(new Error('startup failed'));
  await rejected; await stopping;
  assert.equal(await replacement, module);
  assert.equal(await loader.loadRuntimeAsyncify(), module);
  assert.equal(attempts, 2);
});
