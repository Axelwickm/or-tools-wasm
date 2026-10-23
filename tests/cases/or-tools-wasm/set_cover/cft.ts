import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
function triangle(api: SolveResultApis['cover'], scale = 1) {
  const model = new api.SetCoverModel();
  for (const elements of [[0, 1], [0, 1], [1, 2], [0, 2]]) {
    model.addEmptySubset(model.numSubsets === 0 ? 10 : scale); for (const element of elements) model.addElementToLastSubset(element);
  }
  return model;
}
async function rejects(action: () => Promise<unknown>, match: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && match.test(error.message), String(error)); return; }
  throw new Error('Expected rejection');
}
export const setCoverCftCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.cft.primal_dual', name: 'CFT returns native full-model cover and dual snapshots', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_cft.cc:RunCftHeuristic', tags: ['native-contract'],
  async run({ cover: api }, { mode }) {
    for (const scale of [1, 0.1]) {
      const model = triangle(api, scale), before = JSON.stringify(model.exportModelAsProto());
      const result = await api.SetCover.solveCft(model, execution(mode));
      assert(result.cover.hasSolution && Math.abs(result.cover.cost - 2 * scale) < 1e-12, 'Native triangle cover');
      assert(!result.cover.contains(0) && result.cover.selectedSubsets().length === 2, 'Expensive leading duplicate preserves original IDs');
      assert(result.dual.multipliers.length === 3 && result.dual.reducedCosts.length === 4, 'Dual vectors use full-model IDs');
      assert(result.dual.lowerBound >= 0 && result.dual.lowerBound <= result.cover.cost + 1e-12, 'Native lower bound');
      if (scale === 1) assert(Math.abs(result.dual.lowerBound - 1.5) < 1e-6, 'Native triangle lower bound');
      const columns = [[0, 1], [0, 1], [1, 2], [0, 2]];
      for (let j = 0; j < columns.length; ++j) {
        const reduced = (j === 0 ? 10 : scale) - columns[j].reduce((sum, i) => sum + result.dual.multipliers[i], 0);
        assert(Math.abs(result.dual.reducedCosts[j] - reduced) < 1e-8, 'Reduced costs align with original element and subset IDs');
      }
      assert(JSON.stringify(model.exportModelAsProto()) === before, 'Model remains unchanged');
      assert(result.cover.statistics === null, 'No invented native timing API');
    }
    return {};
  },
}, {
  id: 'set_cover.cft.ownership', name: 'CFT snapshots inputs and owns results across proto imports and repeated solves', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts:SetCover.solveCft', tags: ['lifecycle'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    const proto = model.exportModelAsProto();
    const pending = api.SetCover.solveCft(model, options);
    model.addEmptySubset(1); model.addElementToLastSubset(3);
    const first = await pending;
    assert(first.cover.cost === 2 && first.dual.multipliers.length === 3, 'Call snapshots inputs before awaiting');
    const selected = first.cover.selectedSubsets(); selected.length = 0;
    assert(first.cover.selectedSubsets().length === 2, 'Cover selection is owned');
    first.dual.multipliers[0] = -999; first.dual.reducedCosts.length = 0;
    const imported = new api.SetCoverModel(); imported.importModelFromProto(proto);
    const again = await api.SetCover.solveCft(imported, options);
    assert(again.cover.cost === 2 && again.dual.multipliers[0] >= 0 && again.dual.reducedCosts.length === 4, 'Result mutation cannot affect later solves');
    const changed = await api.SetCover.solveCft(model, options);
    assert(changed.cover.cost === 3 && changed.cover.contains(4) && changed.dual.multipliers.length === 4, 'Later solve uses changed model');
    return {};
  },
}, {
  id: 'set_cover.cft.validation', name: 'Unsupported native CFT inputs reject safely and leave the executor usable', solver: 'set-cover',
  source: 'javascript/set_cover_cft.h:RunSetCoverCft', tags: ['validation'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode);
    await rejects(() => api.SetCover.solveCft(new api.SetCoverModel(), options), /nonempty/);
    await rejects(() => api.SetCover.solveCft(triangle(api, -1), options), /non-negative costs/);
    const zero = await api.SetCover.solveCft(triangle(api, 0), options);
    assert(zero.cover.hasSolution && zero.cover.cost === 0 && zero.dual.lowerBound === 0, 'Native zero-cost cover');
    const emptySubset = triangle(api); emptySubset.addEmptySubset(1);
    await rejects(() => api.SetCover.solveCft(emptySubset, options), /nonempty subsets/);
    const gap = new api.SetCoverModel(); gap.addEmptySubset(1); gap.addElementToLastSubset(1);
    await rejects(() => api.SetCover.solveCft(gap, options), /coverable/);
    const controller = new AbortController(); controller.abort();
    await rejects(() => api.SetCover.solveCft(triangle(api), { ...options, signal: controller.signal }), /abort/i);
    assert((await api.SetCover.solveCft(triangle(api), options)).cover.hasSolution, 'Executor recovers after rejection');
    return {};
  },
}, {
  id: 'set_cover.cft.initial_cover', name: 'CFT accepts and improves an owned native incumbent', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_cft.cc:RunCftHeuristic', tags: ['native-contract', 'lifecycle'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    const seed = [0, 1, 2, 3, 3];
    const pending = api.SetCover.solveCft(model, { ...options, initialSelectedSubsets: seed });
    seed.length = 0;
    const result = await pending;
    assert(result.cover.hasSolution && result.cover.cost === 2, 'Native CFT improves the redundant expensive cover');
    assert(result.cover.numUncoveredElements === 0 && !result.cover.contains(0), 'Seed is an incumbent, not fixed selections');
    const optimal = result.cover.selectedSubsets();
    const again = await api.SetCover.solveCft(model, { ...options, initialSelectedSubsets: optimal });
    assert(again.cover.hasSolution && again.cover.cost === 2, 'An already optimal incumbent is accepted');
    assert(optimal.length === 2 && model.numSubsets === 4, 'Caller selection and model remain owned');
    const zero = await api.SetCover.solveCft(triangle(api, 0), { ...options, initialSelectedSubsets: [1, 2] });
    assert(zero.cover.hasSolution && zero.cover.cost === 0, 'Zero-cost incumbent uses native handling');
    const tied = new api.SetCoverModel();
    for (let j = 0; j < 2; ++j) { tied.addEmptySubset(1); tied.addElementToLastSubset(0); }
    for (const subset of [0, 1]) {
      const incumbent = await api.SetCover.solveCft(tied, { ...options, initialSelectedSubsets: [subset] });
      assert(incumbent.cover.cost === 1 && incumbent.cover.selectedSubsets().length === 1 && incumbent.cover.contains(subset),
        'Native strict-improvement rule retains each equal-cost incumbent; the seed cannot be ignored');
    }
    return {};
  },
}, {
  id: 'set_cover.cft.initial_cover_validation', name: 'Incomplete and malformed CFT incumbents reject with executor recovery', solver: 'set-cover',
  source: 'javascript/set_cover_cft.h:RunSetCoverCft', tags: ['validation'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    for (const seed of [[], [0], [1]])
      await rejects(() => api.SetCover.solveCft(model, { ...options, initialSelectedSubsets: seed }), /complete cover/);
    for (const seed of [[-1], [4], [0.5], [NaN]])
      await rejects(() => api.SetCover.solveCft(model, { ...options, initialSelectedSubsets: seed }), /subset/i);
    assert((await api.SetCover.solveCft(model, options)).cover.cost === 2, 'Omitting a seed still uses native initialization after errors');
    return {};
  },
}];
