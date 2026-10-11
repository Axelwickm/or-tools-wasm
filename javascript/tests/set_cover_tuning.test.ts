import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('one Set Cover inspection owns its fields without exposing bridge bookkeeping or caching answers', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.tabu-tuning-', import.meta.url)));
  const inspection = { cost: 7, numUncoveredElements: 0, selected: [true], coverage: [1],
    numFreeElements: [0], numCoverageLe1Elements: [1], isRedundant: [false],
    computedRedundancy: [false], costLowerBound: 2,
    sessionHandle: 123n, nextSolution: false, trace: [{ subset: 0, selected: true }] };
  const calls: unknown[] = [];
  const state = { inspection, calls };
  (globalThis as Record<string, unknown>).__setCoverInspectionTest = state;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { contents: `export * from './api.ts';`,
      resolveDir: fileURLToPath(new URL('../lib/set_cover/', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'native-inspection', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectSetCoverExecutor {
            execute(operation) {
              const state = globalThis.__setCoverInspectionTest;
              state.calls.push(operation);
              return { result: Promise.resolve(state.inspection) };
            }
          }` }));
      } }] });
    const { SetCoverModel, SetCoverInvariant } = await import(outfile);
    const model = new SetCoverModel(); model.addEmptySubset(7); model.addElementToLastSubset(0);
    const countElements = Object.getOwnPropertyDescriptor(SetCoverModel.prototype, 'numElements')!.get!;
    let scans = 0;
    Object.defineProperty(model, 'numElements', { configurable: true, get() { ++scans; return countElements.call(this); } });
    assert.equal(model.computeFeasibility(), true);
    assert.equal(scans, 1, 'Feasibility scans the model once to determine its element count');
    Reflect.deleteProperty(model, 'numElements');
    const invariant = new SetCoverInvariant(model); invariant.loadSolution([true]);
    const first = await invariant.inspect({ executor: 'direct' });
    assert.equal(first.cost, 7); assert.deepEqual(first.coverage, [1]);
    assert.equal(first.costLowerBound, 2);
    assert.equal(calls.length, 1, 'Reading several snapshot fields makes one native request');
    for (const field of ['sessionHandle', 'nextSolution', 'trace', 'consistent']) assert.equal(field in first, false);
    inspection.selected[0] = false; inspection.coverage[0] = 99;
    assert.deepEqual(first.selected, [true]); assert.deepEqual(first.coverage, [1]);
    first.isRedundant[0] = true;
    assert.deepEqual(inspection.isRedundant, [false]);
    state.inspection = { ...inspection, cost: 11, selected: [false], coverage: [0] };
    invariant.clear(); model.setSubsetCost(0, 11);
    const second = await invariant.inspect({ executor: 'direct' });
    assert.equal(calls.length, 2, 'A new inspection always queries native state');
    assert.equal(second.cost, 11); assert.equal(first.cost, 7);
    assert.deepEqual(second.selected, [false]);
  } finally {
    delete (globalThis as Record<string, unknown>).__setCoverInspectionTest;
    await rm(directory, { recursive: true, force: true });
  }
});

test('guided tabu settings preserve optional zeros and reach native search without query replay', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.tabu-tuning-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: { contents: `export * from './api.ts'; export { setCoverProtocol } from './protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib/set_cover/', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'native-runtime', setup(builder) {
        builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function loadSetCoverRuntime() { return globalThis.__setCoverTuningModule; }' }));
      } }],
    });
    const api = await import(outfile);
    const partial = { type: 'guidedTabuParameters', parameters: { epsilon: 0, penaltyFactor: 0 } };
    const decoded = api.setCoverProtocol.decodeRequest(api.setCoverProtocol.encodeRequest(partial));
    assert.equal(decoded.parameters.epsilon, 0); assert.equal(decoded.parameters.penaltyFactor, 0);
    assert.equal(decoded.parameters.tabuListSize, undefined); assert.equal(decoded.parameters.lagrangianFactor, undefined);
    const calls: Array<{ name: string; args: number[] }> = [];
    const allocated = new Set<number>(); let nextPointer = 8;
    const nativeParameters = { lagrangianFactor: 100, epsilon: 1e-6, penaltyFactor: 0.3, tabuListSize: 17 };
    const result = { ok: true, nextSolution: true, cost: 1, numUncoveredElements: 0, selected: [true],
      coverage: [1], numFreeElements: [0], numCoverageLe1Elements: [1], isRedundant: [false], trace: [{ subset: 0, selected: true }] };
    const handle = 0xfedcba9876543210n;
    const command = { type: 'sessionDelete', handle };
    assert.deepEqual(api.setCoverProtocol.decodeRequest(api.setCoverProtocol.encodeRequest(command)), command);
    const module = { HEAPU8: new Uint8Array(1024),
      _malloc(size: number) { const pointer = nextPointer; nextPointer += size; allocated.add(pointer); return pointer; },
      _free(pointer: number) { assert.ok(allocated.delete(pointer)); },
      ccall(name: string, _return: unknown, _types: unknown, args: number[], options: { async?: boolean }) {
        calls.push({ name, args }); assert.equal(options.async, true);
        if (name === 'set_cover_guided_tabu_parameters') return JSON.stringify({ ok: true, guidedTabuParameters: nativeParameters });
        if (name === 'set_cover_session_create') return JSON.stringify({ ...result, sessionHandle: String(handle) });
        if (name === 'set_cover_session_delete') return '{"ok":true}';
        assert.equal(name, 'set_cover_session_next');
        assert.equal(args.length, 12);
        assert.deepEqual(args.slice(0, 2), [0x76543210, 0xfedcba98]);
        return JSON.stringify(result);
      },
    };
    (globalThis as Record<string, unknown>).__setCoverTuningModule = module;
    const model = new api.SetCoverModel(); model.addEmptySubset(1); model.addElementToLastSubset(0);
    const invariant = new api.SetCoverInvariant(model); invariant.loadSolution([true]);
    const search = new api.GuidedTabuSearch(invariant);
    assert.equal(await search.getPenaltyFactor({ executor: 'direct' }), 0.3);
    assert.deepEqual(calls[0].args, [0, 0, 0, 0, 0, 0, 0]);
    search.setLagrangianFactor(0); search.setEpsilon(0); search.setPenaltyFactor(0.625); search.setTabuListSize(5);
    search.setMaxIterations(3);
    const query = search.getEpsilon({ executor: 'direct' }); search.setPenaltyFactor(0.75);
    await query;
    assert.deepEqual(calls[1].args, [15, 0, 0, 0.625, 5, 0, 0], 'getter captures the configuration before yielding');
    const before = calls.length;
    await search.nextSolution(undefined, { executor: 'direct', onEvent(event: { type: string; status?: { state: number } }) {
      if (event.type === 'status' && event.status?.state === 3) search.setTabuListSize(9);
    } });
    assert.equal(calls.length, before + 2, 'first search creates a session without a native defaults query');
    assert.deepEqual(calls[before].args.slice(7), [15, 0, 0, 0.75, 5], 'creation captures settings before observers can modify them');
    assert.deepEqual(calls[calls.length - 1].args.slice(7), [0, 0, 0, 0, 0], 'search preserves parameters already applied during creation');
    await search.nextSolution(undefined, { executor: 'direct' });
    assert.deepEqual(calls[calls.length - 1].args.slice(7), [8, 0, 0, 0, 9], 'pending setter is forwarded exactly once');
    await search.nextSolution(undefined, { executor: 'direct' });
    assert.deepEqual(calls[calls.length - 1].args.slice(7), [0, 0, 0, 0, 0], 'unchanged tabu size is not reapplied or reset');
    assert.equal(allocated.size, 0);
    assert.deepEqual(invariant.isSelected(), [true]);
    await search.close(); await search.close();
    assert.deepEqual(calls[calls.length - 1], { name: 'set_cover_session_delete', args: [0x76543210, 0xfedcba98] });
  } finally {
    delete (globalThis as Record<string, unknown>).__setCoverTuningModule;
    await rm(directory, { recursive: true, force: true });
  }
});
