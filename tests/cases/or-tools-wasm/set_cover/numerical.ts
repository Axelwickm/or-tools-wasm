import type * as Api from 'or-tools-wasm/set-cover';
import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
type CoverApi = Pick<typeof Api, 'SetCoverModel' | 'SetCoverInvariant' | 'SetCover' | 'TrivialSolutionGenerator' | 'SteepestSearch'>;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => unknown) {
  let rejected = false;
  try { action(); } catch (error) { rejected = error instanceof RangeError; }
  assert(rejected, 'Invalid input must reject before mutation');
}
function execution(mode: ExecutorFixtureMode = 'direct') {
  return { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
}

export const setCoverNumericalCases: SharedCase<CoverApi,
  { cost: number; numUncoveredElements: number }, ExecutorFixtureMode>[] = [
  {
    id: 'set_cover.numerical.atomic_model_inputs', name: 'Set Cover index bounds and atomic imports', solver: 'set-cover',
    source: 'ortools/set_cover/base_types.h', tags: ['native-contract', 'invalid-input', 'ownership'],
    async run(api, context) {
      const model = new api.SetCoverModel(); model.setName('preserved');
      model.addEmptySubset(7); model.addElementToLastSubset(0); model.createSparseRowView();
      const snapshot = JSON.stringify(model.exportModelAsProto());
      for (const index of [-1, 0.5, NaN, Infinity, 2147483647, 4294967296, Number.MAX_SAFE_INTEGER]) {
        rejects(() => model.addElementToSubset(index, 3));
        rejects(() => model.addElementToSubset(0, index));
        rejects(() => model.setSubsetCost(index, 2));
        rejects(() => model.importModelFromProto({ name: 'rejected', subset: [{ cost: 2, element: [index] }] }));
        assert(JSON.stringify(model.exportModelAsProto()) === snapshot && model.rowViewIsValid,
          'Rejected indices preserve name, arrays and cached row view');
      }
      for (const count of [-1, 0.5, NaN, Infinity, 2147483648]) rejects(() => model.resizeNumSubsets(count));
      for (const cost of [NaN, Infinity, -Infinity]) {
        rejects(() => model.addEmptySubset(cost)); rejects(() => model.setSubsetCost(3, cost));
        rejects(() => model.importModelFromProto({ name: 'rejected', subset: [
          { cost: 2, element: [0] }, { cost, element: [1] },
        ] }));
      }
      assert(JSON.stringify(model.exportModelAsProto()) === snapshot, 'Rejected imports do not partially replace a model');
      const input = { name: 'captured', subset: [{ cost: 3, element: [0] }] };
      model.importModelFromProto(input); input.subset[0].element[0] = 9; input.subset[0].cost = 99;
      const result = await api.SetCover.solve(model, execution(context.mode));
      assert(result.hasSolution && result.cost === 3 && model.numElements === 1, 'Valid imports own their arrays and recover after errors');
      return { cost: result.cost, numUncoveredElements: result.numUncoveredElements };
    },
  },
  {
    id: 'set_cover.numerical.nonfinite_native_results', name: 'Native overflowing costs survive result transport', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_invariant.cc', tags: ['native-contract', 'floating-point', 'ownership'],
    async run(api, context) {
      const model = new api.SetCoverModel();
      for (const element of [0, 1]) { model.addEmptySubset(1e308); model.addElementToLastSubset(element); }
      const options = execution(context.mode);
      const invariant = new api.SetCoverInvariant(model); invariant.loadSolution([true, true]);
      const inspected = await invariant.inspect(options);
      assert(inspected.cost === Infinity && inspected.numUncoveredElements === 0
        && String(inspected.coverage) === '1,1' && inspected.selected.every(Boolean),
        'One inspection exposes native cost, coverage and selection together');
      assert(!('sessionHandle' in inspected) && !('nextSolution' in inspected) && !('trace' in inspected),
        'Inspection exposes state fields without bridge commands or search bookkeeping');
      assert(await invariant.cost(options) === Infinity, 'Native double cost overflow survives inspection without JSON failure');
      const result = await api.SetCover.solve(model, { ...options, algorithm: 'trivial' });
      assert(result.hasSolution && result.cost === Infinity && String(result.selectedSubsets()) === '0,1',
        'Native construction returns its actual nonfinite cost and selected cover');
      model.setSubsetCost(0, 2); model.setSubsetCost(1, 3);
      inspected.selected[0] = false; inspected.coverage[0] = 99;
      const updated = await invariant.inspect(options);
      assert(updated.cost === 5 && updated.selected.every(Boolean) && String(updated.coverage) === '1,1'
        && inspected.cost === Infinity, 'Inspection snapshots are independent of model changes and caller edits');
      assert(await invariant.cost(options) === 5 && result.cost === Infinity,
        'Overflowing results are owned independently and subsequent native queries recover');
      const empty = new api.SetCoverInvariant(new api.SetCoverModel());
      assert(await empty.cost(options) === 0, 'Empty model remains inspectable');
      return { cost: result.cost, numUncoveredElements: result.numUncoveredElements };
    },
  },
  {
    id: 'set_cover.numerical.native_cost_update_recovery', name: 'Native search cost cache survives rounding and overflow', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_invariant.cc', tags: ['native-contract', 'native-regression', 'floating-point'],
    async run(api, context) {
      const options = execution(context.mode);
      for (const costs of [[1e20, 1], [1e20, 1, 5e5], [1e308, 1e308, 1e308]]) {
        const model = new api.SetCoverModel();
        for (const cost of costs) { model.addEmptySubset(cost); model.addElementToLastSubset(0); }
        const invariant = new api.SetCoverInvariant(model); invariant.loadSolution(costs.map(() => true));
        const search = new api.SteepestSearch(invariant); search.setMaxIterations(costs.length - 1);
        await search.nextSolution(undefined, options);
        const remaining = invariant.isSelected().flatMap((selected, index) => selected ? [index] : []);
        assert(remaining.length === 1 && await invariant.cost(options) === costs[remaining[0]],
          'Native cost repair recovers the actual remaining cost after cancellation/overflow');
        assert(await invariant.numUncoveredElements(options) === 0, 'Numerical repair preserves the native cover');
        invariant.clear(); invariant.loadSolution(costs.map(() => true));
        await search.nextSolution(undefined, options);
        assert(invariant.isSelected().filter(Boolean).length === 1, 'Clear and bulk load rebuild the native cost cache');
      }
      return { cost: 1, numUncoveredElements: 0 };
    },
  },
  {
    id: 'set_cover.numerical.large_column', name: 'Large valid columns serialize without argument limits', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_model.cc', tags: ['native-contract', 'large-input'],
    async run(api, context) {
      const model = new api.SetCoverModel(); model.addEmptySubset(7);
      for (let element = 0; element < 150000; ++element) model.addElementToLastSubset(element);
      const columns = await model.computeColumnStats(execution(context.mode));
      assert(columns.min === 150000 && columns.max === 150000 && columns.mean === 150000,
        'Valid native column sizes exceed the JavaScript function-argument limit');
      return { cost: 7, numUncoveredElements: 0 };
    },
  },
];
