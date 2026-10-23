import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function rejects(action: () => Promise<unknown>) {
  try { await action(); } catch (error) { assert(error instanceof Error, 'Expected an Error'); return error; }
  throw new Error('Expected mutation to reject');
}
function invariant(api: SolveResultApis['cover']) {
  const model = new api.SetCoverModel();
  for (const [index, element] of [0, 0, 1].entries()) {
    model.addEmptySubset(index + 1); model.addElementToLastSubset(element);
  }
  return new api.SetCoverInvariant(model);
}
function execution(mode: ExecutorFixtureMode = 'direct') { return { executor: mode === 'server' ? serverExecutorConfiguration() : mode }; }

export const setCoverMutationCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.mutations.perturbation', name: 'Native perturbations preserve focus and intersection semantics', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.cc:832', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const inv = invariant(api), options = execution(mode);
    inv.loadSolution([true, true, true]);
    const old = await inv.inspect(options), focus = [0];
    const pending = inv.clearRandomSubsets(1, { ...options, focus });
    focus[0] = 2;
    equal(await pending, [0]); equal(inv.isSelected(), [false, false, true]);
    equal(old.selected, [true, true, true]);
    equal(inv.trace().map(item => [item.subset(), item.decision()]), [[0, true], [1, true], [2, true], [0, false], [1, false]]);
    await new api.GreedySolutionGenerator(inv).nextSolution(undefined, options);
    assert((await inv.inspect(options)).numUncoveredElements === 0, 'Native construction repairs the perturbed cover');

    inv.loadSolution([true, true, true]);
    equal(await inv.clearMostCoveredElements(1, { ...options, focus: [0] }), [0]);
    equal(inv.isSelected(), [false, true, true]);
    inv.loadSolution([true, true, true]);
    for (const method of ['clearRandomSubsets', 'clearMostCoveredElements'] as const) {
      equal(await inv[method](100, { ...options, focus: [] }), []);
      equal(await inv[method](0, options), []); equal(inv.isSelected(), [true, true, true]);
      await rejects(() => inv[method](-1, options)); await rejects(() => inv[method](1.5, options));
      await rejects(() => inv[method](0x80000000, options)); await rejects(() => inv[method](1, { ...options, focus: [3] }));
    }
    equal((await inv.clearMostCoveredElements(100, options)).sort(), [0, 1]); equal(inv.isSelected(), [false, false, true]);
    inv.loadSolution([true, true, true]);
    equal((await inv.clearRandomSubsets(100, options)).sort(), [0, 1, 2]); equal(inv.isSelected(), [false, false, false]);
    const empty = new api.SetCoverInvariant(new api.SetCoverModel());
    equal(await empty.clearRandomSubsets(10, options), []); equal(await empty.clearMostCoveredElements(10, options), []);
    return {};
  },
}, {
  id: 'set_cover.mutations.removability', name: 'Native updates return owned removability notifications', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_invariant.cc:353', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const inv = invariant(api), options = execution(mode);
    inv.loadSolution([true, false, true]);
    const selected = await inv.updateSelection(1, true, options);
    equal(selected, { changed: true, newlyRemovableSubsets: [0, 1, 1], newlyNonRemovableSubsets: [] });
    equal(inv.isSelected(), [true, true, true]);
    const removed = await inv.updateSelection(1, false, options);
    equal(removed, { changed: true, newlyRemovableSubsets: [], newlyNonRemovableSubsets: [0] });
    equal(selected.newlyRemovableSubsets, [0, 1, 1]);
    selected.newlyRemovableSubsets.length = 0;
    equal(await inv.updateSelection(1, false, options), { changed: false, newlyRemovableSubsets: [], newlyNonRemovableSubsets: [] });
    inv.clear();
    equal(await inv.updateSelection(2, true, options), { changed: true, newlyRemovableSubsets: [], newlyNonRemovableSubsets: [2] });
    equal((await inv.inspect(options)).coverage, [0, 1]);
    await rejects(() => inv.updateSelection(3, true, options)); await rejects(() => inv.updateSelection(-1, false, options));
    equal(inv.isSelected(), [false, false, true]);
    return {};
  },
}, {
  id: 'set_cover.mutations.lifecycle', name: 'Mutation snapshots reject stale state, concurrent calls and pre-abort', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts', tags: ['gap-regression', 'lifecycle'],
  async run({ cover: api }, { mode }) {
    const inv = invariant(api), options = execution(mode);
    inv.loadSolution([true, true, true]);
    const controller = new AbortController(), reason = new Error('Skip perturbation'); controller.abort(reason);
    assert(await rejects(() => inv.clearRandomSubsets(1, { ...options, signal: controller.signal })) === reason, 'Abort preserves the original reason');
    equal(inv.isSelected(), [true, true, true]);
    const pending = inv.clearRandomSubsets(1, { ...options, focus: [0] });
    await rejects(() => inv.updateSelection(2, false, options));
    await pending;
    inv.loadSolution([true, true, true]);
    const stale = inv.clearRandomSubsets(1, { ...options, focus: [0] });
    inv.deselect(2);
    const error = await rejects(() => stale);
    assert(error.message.includes('stale'), 'Edited selection rejects the stale native mutation');
    equal(inv.isSelected(), [true, true, false]);
    inv.loadSolution([true, true, true]);
    const staleModel = inv.clearMostCoveredElements(1, { ...options, focus: [0] });
    inv.model().setSubsetCost(0, 7);
    assert((await rejects(() => staleModel)).message.includes('stale'), 'Model edits also reject stale mutation');
    equal(inv.isSelected(), [true, true, true]);
    equal(await inv.clearMostCoveredElements(1, { ...options, focus: [0] }), [0]);
    equal(inv.isSelected(), [false, true, true]);
    return {};
  },
}, {
  id: 'set_cover.search.lazy_steepest_focus', name: 'Native lazy steepest search preserves sparse focus IDs and accepts its native ignored limit', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.cc:537', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const focus of [[1], [false, true], []] as Array<number[] | boolean[]>) {
      const model = new api.SetCoverModel();
      for (const cost of [10, 1]) { model.addEmptySubset(cost); model.addElementToLastSubset(0); }
      const invariant = new api.SetCoverInvariant(model); invariant.loadSolution([true, true]);
      const search = new api.LazySteepestSearch(invariant); search.setMaxIterations(0);
      assert(await search.nextSolution(focus, execution), 'Native lazy search runs even though the inherited iteration limit is unused');
      assert(invariant.isSelected()[0] && invariant.isSelected()[1] === (focus.length === 0), 'Only the focused subset is deselected');
      assert(await invariant.numUncoveredElements(execution) === 0, 'Native lazy removal preserves coverage');
    }
    return {};
  },
}];
