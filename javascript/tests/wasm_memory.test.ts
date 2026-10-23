import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('WASM allocations fail before native access and release earlier buffers', async t => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)), contents: `
    export * from './wasm_memory.ts';
    export {DirectNetworkFlowExecutor} from './network_flow/direct_executor.ts';
    export {DirectSetCoverExecutor} from './set_cover/direct_executor.ts';
    export {DirectCpSatExecutor} from './cp_sat/direct_executor.ts';
    export {executeKnapsackWithModule} from './knapsack/native_runtime.ts';
  ` }, bundle: true, write: false, platform: 'node', format: 'esm' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const events = { onEvent: () => {} };
  const cases = [
    { name: 'max flow', allocations: 3, run: (module: any) => new api.DirectNetworkFlowExecutor(async () => module).execute({
      type: 'maxFlow', tails: [0], heads: [1], capacities: [1n], source: 0, sink: 1,
    }, events).result },
    { name: 'min cost flow', allocations: 5, run: (module: any) => new api.DirectNetworkFlowExecutor(async () => module).execute({
      type: 'minCostFlow', tails: [0], heads: [1], capacities: [1n], unitCosts: [1n], supplies: [1n, -1n],
    }, events).result },
    { name: 'assignment', allocations: 3, run: (module: any) => new api.DirectNetworkFlowExecutor(async () => module).execute({
      type: 'linearSumAssignment', leftNodes: [0], rightNodes: [0], costs: [1n],
    }, events).result },
    { name: 'Knapsack', allocations: 5, run: (module: any) => api.executeKnapsackWithModule(
      module, 2, 'test', true, Infinity, 1, [1n], [[1n]], [1n]) },
    { name: 'Set Cover', allocations: 5, run: (module: any) => new api.DirectSetCoverExecutor(async () => module).execute({
      type: 'nextSolution', algorithm: 'greedy', costs: [1], starts: [0, 1], elements: [0], selected: [false], focus: [true], maxIterations: 1,
    }, events).result },
    { name: 'Set Cover CFT', allocations: 3, run: (module: any) => new api.DirectSetCoverExecutor(async () => module).execute({
      type: 'cft', costs: [1], starts: [0, 1], elements: [0],
    }, events).result },
    { name: 'Set Cover MIP runtime', allocations: 5, run: (module: any) => new api.DirectSetCoverExecutor(
      async () => { throw new Error('MIP must use the MPSolver runtime'); }, async () => module).execute({
      type: 'mip', costs: [1], starts: [0, 1], elements: [0], selected: [false], focusIndices: [0],
      lpRelaxation: false, timeLimitSeconds: 0,
    }, events).result },
    { name: 'CP-SAT', allocations: 3, run: (module: any) => new api.DirectCpSatExecutor(async () => module).execute({
      type: 'solve', model: Uint8Array.of(1), parameters: Uint8Array.of(1), callbacks: { solution: false, bestBound: false, log: false },
    }, events).result },
  ];
  for (const item of cases) for (const failure of ['null', 'throw'] as const) {
    await t.test(`${item.name}: ${failure} at every allocation`, async () => {
      for (let failAt = 1; failAt <= item.allocations; ++failAt) {
        const live = new Set<number>();
        let attempts = 0;
        const module = {
          HEAPU8: new Uint8Array(4096).fill(77),
          _malloc() {
            if (++attempts === failAt) {
              if (failure === 'throw') throw new Error('allocation failed');
              return 0;
            }
            const pointer = attempts * 64; live.add(pointer); return pointer;
          },
          _free(pointer: number) { if (pointer) assert.ok(live.delete(pointer), 'Buffers are released exactly once'); },
          ccall() { throw new Error('Native access must not precede successful allocation'); },
        };
        await assert.rejects(item.run(module), /allocate WASM memory|allocation failed/);
        assert.deepEqual([...live], [], `Allocation ${failAt} leaked earlier buffers`);
        assert.deepEqual([...module.HEAPU8.subarray(0, 16)], Array(16).fill(77), 'Null allocation never writes address zero');
      }
    });
  }
  await t.test('a failed heap copy and failed result release still clean up', async () => {
    const live = new Set<number>();
    const module = { HEAPU8: new Uint8Array(32), _malloc: () => { live.add(24); return 24; },
      _free: (pointer: number) => { assert.ok(live.delete(pointer)); } };
    assert.throws(() => api.allocateWasmBytes(module, new Uint8Array(16)), RangeError);
    assert.equal(live.size, 0);
    await assert.rejects(api.readWasmResult(module, () => {
      new DataView(module.HEAPU8.buffer).setUint32(24, 1, true); return 8;
    }, () => { throw new Error('release failed'); }), /release failed/);
    assert.equal(live.size, 0, 'The length buffer is released even if the custom result releaser throws');
  });
});
