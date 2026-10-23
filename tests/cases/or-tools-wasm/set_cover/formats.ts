import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown | Promise<unknown>) {
  try { await action(); } catch (error) { assert(error instanceof Error, `Unexpected rejection: ${String(error)}`); return error; }
  throw new Error('Expected Set Cover format rejection');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const setCoverFormatCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.formats.orlib_roundtrip', name: 'Native OR-Library readers and writers preserve costs and incidence across formats', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_reader.cc:ReadOrlibScp', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode), model = new api.SetCoverModel();
    model.addEmptySubset(0.10000000000000002); model.addElementToLastSubset(0); model.addElementToLastSubset(1);
    model.addEmptySubset(2); model.addElementToLastSubset(1); model.addElementToLastSubset(2);
    model.addEmptySubset(3); model.addElementToLastSubset(2);
    const expected = JSON.stringify(model.exportModelAsProto().subset);
    for (const format of ['orlibScp', 'orlibRail'] as const) {
      const text = await model.exportText(format, options), restored = await api.SetCoverModel.fromText(text.trimEnd(), format, options);
      assert(JSON.stringify(restored.exportModelAsProto().subset) === expected, 'Native round-trip retains exact doubles and incidence without a final newline');
      assert((await api.SetCover.solve(restored, options)).hasSolution, 'Imported model can be solved through the same executor');
      const other = format === 'orlibScp' ? 'orlibRail' : 'orlibScp';
      assert(JSON.stringify((await api.SetCoverModel.fromText(await restored.exportText(other, options), other, options)).exportModelAsProto().subset) === expected, 'Native formats interoperate');
      const empty = new api.SetCoverModel();
      assert((await api.SetCoverModel.fromText(await empty.exportText(format, options), format, options)).numSubsets === 0, 'Native empty model round-trips');
      empty.addEmptySubset(0);
      const zero = await api.SetCoverModel.fromText(await empty.exportText(format, options), format, options);
      assert(zero.numSubsets === 1 && zero.subsetCosts[0] === 0 && zero.numElements === 0, 'Zero-cost empty subsets preserve protobuf defaults');
    }
    const controller = new AbortController(), reason = new Error('skip import'); controller.abort(reason);
    assert(await rejects(() => api.SetCoverModel.fromText('0 0', 'orlibScp', { ...options, signal: controller.signal })) === reason, 'Import honors pre-abort');
    return {};
  },
}, {
  id: 'set_cover.formats.preserve_universe', name: 'Imports never silently discard declared uncovered elements', solver: 'set-cover',
  source: 'javascript/set_cover_formats.h:ReadSetCoverText', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode);
    for (const [format, input] of [
      ['orlibScp', '2 1\n1\n1 1\n0'], ['orlibScp', '2 1\n1\n0\n0'],
      ['orlibRail', '2 1\n1 1 1'], ['orlibRail', '2 1\n1 0'],
    ] as const) {
      const error = await rejects(() => api.SetCoverModel.fromText(input, format, options));
      assert(/trailing uncovered elements/.test(error.message), 'Unrepresentable universes explicitly reject');
    }
    for (const [format, input] of [
      ['orlibScp', '2 1\n1\n0\n1 1'], ['orlibRail', '2 1\n1 1 2'],
    ] as const) {
      const model = await api.SetCoverModel.fromText(input, format, options);
      assert(model.numElements === 2, 'Representable uncovered elements remain in the imported universe');
      const result = await api.SetCover.solve(model, options);
      assert(!result.hasSolution && result.numUncoveredElements === 1, 'Import preserves mathematical infeasibility');
    }
    const valid = await api.SetCoverModel.fromText('1 1\n1\n1 1', 'orlibScp', options);
    assert((await api.SetCover.solve(valid, options)).hasSolution, 'Valid imports and solving recover after rejection');
    return {};
  },
}, {
  id: 'set_cover.formats.fimi', name: 'Native FIMI reader normalizes labels and removes within-subset duplicates', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_reader.cc:ReadFimiDat', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode), model = await api.SetCoverModel.fromText('10 11 11\n11 12\n12', 'fimi', options);
    assert(model.numSubsets === 3 && model.numElements === 3, 'Native labels shift to the minimum label');
    const subsets = model.exportModelAsProto().subset;
    assert(JSON.stringify(subsets.map(value => value.element)) === '[[0,1],[1,2],[2]]' && subsets.every(value => value.cost === 1), 'Native normalization, duplicate handling and unit costs are preserved');
    assert((await api.SetCover.solve(model, options)).hasSolution, 'FIMI model is executable');
    assert((await api.SetCoverModel.fromText('', 'fimi', options)).numSubsets === 0, 'Empty FIMI input yields an empty native model');
    await rejects(() => model.exportText('fimi' as 'orlibScp', options));
    return {};
  },
}, {
  id: 'set_cover.formats.invalid_recovery', name: 'Malformed native formats return errors without aborting or poisoning later imports', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_reader.cc:ParseNextInteger', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode);
    for (const [format, input] of [
      ['orlibScp', ''], ['orlibScp', '1 1\nwat\n1 1'], ['orlibScp', '1 1\n1\n1'],
      ['orlibScp', '1 1\nnan\n1 1'], ['orlibScp', '1 1\n1\n1 2'], ['orlibScp', '-1 1'],
      ['orlibRail', '1 1\n1 1 0'], ['orlibRail', '1 1\n1 2 1'], ['fimi', 'one'], ['fimi', '-1'],
    ] as const) {
      await rejects(() => api.SetCoverModel.fromText(input, format, options));
      assert((await api.SetCoverModel.fromText('1 1\n1\n1 1', 'orlibScp', options)).numSubsets === 1, 'Native module/server remains usable after malformed input');
    }
    const whitespace = await api.SetCoverModel.fromText('  \n\t1 1\n  \n1\n\n1 1', 'orlibScp', options);
    assert(whitespace.numElements === 1, 'Native whitespace and empty-line handling is preserved');
    for (const invalid of ['unknown', 'constructor', 'toString']) await rejects(() => api.SetCoverModel.fromText('0 0', invalid as 'orlibScp', options));
    return {};
  },
}];
