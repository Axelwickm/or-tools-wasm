import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { patchSingleThreadBrowser } from '../../scripts/patch_single_thread_browser.ts';

test('runtime patch preserves isolated/server pools and permits one local solver thread', () => {
  const source = 'var pthreadPoolSize=navigator.hardwareConcurrency+1;function capacity(){return PThread.unusedWorkers.length}function routing(){return Math.max(0,PThread.unusedWorkers.length-1)}';
  const patched = patchSingleThreadBrowser(source);
  assert.equal(patchSingleThreadBrowser(patched), patched);
  for (const isolated of [false, true, undefined]) {
    const context = vm.createContext({ crossOriginIsolated: isolated, SharedArrayBuffer,
      navigator: { hardwareConcurrency: 4 }, PThread: { unusedWorkers: [1,2,3,4,5] } });
    vm.runInContext(patched, context);
    assert.equal(vm.runInContext('pthreadPoolSize', context), isolated === false ? 0 : 5);
    assert.equal(vm.runInContext('capacity()', context), isolated === false ? 1 : 5);
    assert.equal(vm.runInContext('routing()', context), isolated === false ? 1 : 4);
  }
  assert.throws(() => patchSingleThreadBrowser('unknown glue'), /Unsupported/);
});
