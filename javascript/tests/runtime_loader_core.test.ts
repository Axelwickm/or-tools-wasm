import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntimeLoader } from '../lib/runtime_loader_core.ts';
import type { OrToolsWasmModule } from '../lib/wasm_module_types.ts';

test('runtime-specific resolvers share one cache and teardown across families and flavors', async () => {
  const started: string[] = [], stopped: string[] = [];
  const loader = createRuntimeLoader({
    async loadFactory(url) {
      started.push(url);
      return async () => ({ PThread: { terminateAllThreads: () => stopped.push(url) } }) as unknown as OrToolsWasmModule;
    },
  });
  const asset = (name: string) => (flavor: 'jspi' | 'asyncify') => ({
    jsUrl: `${name}:${flavor}`, locateFile: (file: string) => file,
  });
  const [first, shared] = await Promise.all([
    loader.loadRuntime('cp_sat_runtime', asset('cp'), 'jspi'),
    loader.loadRuntime('cp_sat_runtime', asset('unused'), 'jspi'),
  ]);
  assert.equal(first, shared);
  const fallback = await loader.loadRuntime('cp_sat_runtime', asset('cp'), 'asyncify');
  assert.notEqual(first, fallback);
  await loader.loadRuntime('routing_runtime', asset('routing'), 'jspi');
  assert.deepEqual(started, ['cp:jspi', 'cp:asyncify', 'routing:jspi']);
  await loader.terminateLoadedRuntimeThreads();
  assert.deepEqual(stopped, started);
  assert.notEqual(await loader.loadRuntime('cp_sat_runtime', asset('cp'), 'jspi'), first);
  assert.equal(started.length, 4);
});

test('runtime startup failures release assets and allow a shared retry', async t => {
  for (const stage of ['asset', 'factory', 'module'] as const) {
    await t.test(stage, async () => {
      let attempts = 0, cleanups = 0;
      const module = {} as OrToolsWasmModule;
      const resolveAsset = () => {
        ++attempts;
        if (stage === 'asset' && attempts === 1) throw new Error('startup failed');
        return { jsUrl: 'test', locateFile: (value: string) => value, cleanupGlobalState: () => { ++cleanups; } };
      };
      const loader = createRuntimeLoader({
        async loadFactory() {
          if (stage === 'factory' && attempts === 1) throw new Error('startup failed');
          return async () => {
            if (stage === 'module' && attempts === 1) throw new Error('startup failed');
            return module;
          };
        },
      });
      const load = () => loader.loadRuntime('cp_sat_runtime', resolveAsset, 'asyncify');
      await assert.rejects(load(), /startup failed/);
      assert.deepEqual(await Promise.all([load(), load()]), [module, module]);
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
    async loadFactory() {
      return ++attempts === 1 ? () => new Promise<OrToolsWasmModule>((_, reject) => { fail = reject; }) : async () => module;
    },
  });
  const load = () => loader.loadRuntime('cp_sat_runtime', () => ({ jsUrl: 'test', locateFile: value => value }), 'asyncify');
  const first = load();
  const rejected = assert.rejects(first, /startup failed/);
  await Promise.resolve(); await Promise.resolve();
  const stopping = loader.terminateLoadedRuntimeThreads();
  // Retrying in a failure observer can precede teardown's finally handler.
  const replacement = first.catch(load);
  fail(new Error('startup failed'));
  await rejected; await stopping;
  assert.equal(await replacement, module);
  assert.equal(await load(), module);
  assert.equal(attempts, 2);
});
