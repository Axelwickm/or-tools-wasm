import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let directory: string;
let DirectCpSatExecutor: any;
before(async () => {
  directory = await mkdtemp(fileURLToPath(new URL('.cp-interrupt-cleanup-', import.meta.url)));
  const outfile = path.join(directory, 'executor.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../lib/cp_sat/direct_executor.ts', import.meta.url))],
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'injected-runtime', setup(builder) {
      builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function loadRuntime() { throw new Error("Inject the test runtime"); }' }));
    } }] });
  ({ DirectCpSatExecutor } = await import(pathToFileURL(outfile).href));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function runtime() {
  const heap = new Uint8Array(new SharedArrayBuffer(65536));
  let next = 128;
  const entries: number[] = [];
  const module: any = {
    HEAPU8: heap, afterNativeReturn: undefined, fail: undefined,
    _malloc: (size: number) => { const pointer = next; next += Math.max(8, size); return pointer; },
    _free: () => {}, _free_buffer: () => {},
    ccall(name: string, _result: unknown, _types: unknown, args: number[]) {
      if (name === 'cp_sat_interrupt_address') return 8;
      if (name === 'cp_sat_statistics_failed') return 0;
      const output = () => {
        const pointer = module._malloc(1); heap[pointer] = 1;
        new DataView(heap.buffer).setUint32(args[args.length - 1], 1, true);
        return pointer;
      };
      if (name === 'cp_sat_statistics') return output();
      assert.equal(name, 'solve_model');
      entries.push(Atomics.load(heap, 8));
      // The C++ exit guard runs before its async ccall promise resumes in JS.
      Atomics.store(heap, 8, 0);
      return (async () => {
        await module.afterNativeReturn?.();
        if (module.fail) throw module.fail;
        return output();
      })();
    },
  };
  return { module, entries, interrupted: () => Atomics.load(heap, 8) };
}
const request = { type: 'solve', model: new Uint8Array([1]), parameters: new Uint8Array() };
for (const fails of [false, true]) {
  test(`a late stop after native ${fails ? 'failure' : 'completion'} cannot poison the next solve`, async () => {
    const { module, entries, interrupted } = runtime();
    const executor = new DirectCpSatExecutor(async () => module);
    let job: any;
    const error = new Error('native result failure');
    module.afterNativeReturn = () => job.cancel();
    if (fails) module.fail = error;
    job = executor.execute(request, { onEvent() {} });
    if (fails) await assert.rejects(job.result, (failure: unknown) => failure === error);
    else await job.result;
    assert.equal(interrupted(), 0, 'Release the flag after JS cancellation races with the native exit guard');
    module.afterNativeReturn = module.fail = undefined;
    await executor.execute(request, { onEvent() {} }).result;
    assert.deepEqual(entries, [0, 0]);
  });
}

test('a stop requested before native execution still reaches that solve', async () => {
  const { module, entries, interrupted } = runtime();
  const executor = new DirectCpSatExecutor(async () => module);
  const job = executor.execute(request, { onEvent() {} });
  await job.cancel();
  await job.result;
  assert.deepEqual(entries, [1]);
  assert.equal(interrupted(), 0);
});

test('an interrupt already written by a worker client is preserved until native execution', async () => {
  const { module, entries, interrupted } = runtime();
  Atomics.store(module.HEAPU8, 8, 1);
  const executor = new DirectCpSatExecutor(async () => module);
  await executor.execute(request, { onEvent() {} }).result;
  assert.deepEqual(entries, [1]);
  assert.equal(interrupted(), 0);
});
