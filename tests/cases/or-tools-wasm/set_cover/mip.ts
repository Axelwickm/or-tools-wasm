import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
function triangle(api: SolveResultApis['cover']) {
  const model = new api.SetCoverModel();
  for (const elements of [[0, 1], [1, 2], [0, 2]]) {
    model.addEmptySubset(1); for (const element of elements) model.addElementToLastSubset(element);
  }
  return model;
}
async function rejects(action: () => unknown | Promise<unknown>) { try { await action(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected rejection'); }
export const setCoverMipCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.mip.integer_and_relaxation', name: 'Native SCIP covers and GLOP relaxation objectives have distinct result contracts', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_mip.cc:NextSolution', tags: ['native-contract'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode), before = JSON.stringify(model.exportModelAsProto());
    const integer = await api.SetCover.solveMip(model, options);
    assert(integer.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && integer.nextSolution, 'Native integer status and Boolean');
    assert(integer.cover.hasSolution && integer.cover.cost === 2 && integer.cover.selectedSubsets().length === 2, 'Optimal unseeded full cover');
    assert(integer.cover.statistics && integer.cover.statistics.runTimeSeconds >= 0, 'Native timing');
    const relaxation = await api.SetCover.solveLpRelaxation(model, options);
    assert(relaxation.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && relaxation.nextSolution && relaxation.objectiveValue === 1.5, 'Fractional triangle objective');
    assert(!('cover' in relaxation) && !('selectedSubsets' in relaxation), 'LP result does not claim a cover or unavailable fractional assignment');
    assert(JSON.stringify(model.exportModelAsProto()) === before, 'Solves preserve caller model');
    const empty = await api.SetCover.solveMip(new api.SetCoverModel(), options);
    assert(empty.cover.hasSolution && empty.cover.cost === 0, 'Native empty model');
    const zero = new api.SetCoverModel(); zero.addEmptySubset(0); zero.addElementToLastSubset(0);
    assert((await api.SetCover.solveMip(zero, options)).cover.hasSolution, 'Native zero-cost subset');
    const negative = new api.SetCoverModel();
    for (const cost of [-1, -2]) { negative.addEmptySubset(cost); negative.addElementToLastSubset(0); }
    const negativeCover = await api.SetCover.solveMip(negative, options);
    assert(negativeCover.cover.cost === -3 && negativeCover.cover.selectedSubsets().length === 2, 'Native bounded negative-cost subsets are preserved');
    assert((await api.SetCover.solveLpRelaxation(negative, options)).objectiveValue === -3, 'Negative-cost LP objective');
    return {};
  },
}, {
  id: 'set_cover.mip.focus_and_seed', name: 'Native seeded selection and focused objective semantics remain observable', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_mip.cc:NextSolution', tags: ['native-contract'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    const seeded = await api.SetCover.solveMip(model, { ...options, initialSelectedSubsets: [0, 1, 2] });
    assert(seeded.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && seeded.cover.cost === 3 && seeded.cover.hasSolution, 'Native optimal subproblem retains all redundant seeds');
    const partial = await api.SetCover.solveMip(model, { ...options, focus: [0] });
    assert(partial.nextSolution && partial.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && !partial.cover.hasSolution && partial.cover.numUncoveredElements === 1, 'Focused native success is not full-model feasibility');
    assert(partial.cover.selectedSubsets().join() === '0', 'Focus uses original subset IDs');
    const filled = await api.SetCover.solveMip(model, { ...options, initialSelectedSubsets: [2], focus: [0] });
    assert(filled.cover.hasSolution && filled.cover.cost === 2 && filled.cover.contains(2), 'Outside-focus selection is retained');
    const lp = await api.SetCover.solveLpRelaxation(model, { ...options, initialSelectedSubsets: [2], focus: [0] });
    assert(lp.objectiveValue === 1, 'Native focused objective excludes outside-focus selected cost');
    const noFocus = await api.SetCover.solveMip(model, { ...options, focus: [] });
    assert(noFocus.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && noFocus.cover.selectedSubsets().length === 0 && !noFocus.cover.hasSolution, 'Empty explicit focus differs from all subsets');
    assert((await api.SetCover.solveLpRelaxation(model, { ...options, focus: [] })).objectiveValue === 0, 'Empty focus native LP objective');
    const gap = new api.SetCoverModel(); gap.addEmptySubset(1); gap.addElementToLastSubset(1);
    const gapResult = await api.SetCover.solveMip(gap, options);
    assert(gapResult.subproblemStatus === api.SetCoverMipStatus.OPTIMAL && !gapResult.cover.hasSolution, 'Native omission of uncoverable elements is preserved');
    return {};
  },
}, {
  id: 'set_cover.mip.snapshots', name: 'MIP calls snapshot models, selections and focus; results own their arrays', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts:SetCover.solveMip', tags: ['lifecycle'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode), selected = [2], focus = [0];
    const pending = api.SetCover.solveMip(model, { ...options, initialSelectedSubsets: selected, focus });
    selected.push(1); focus.length = 0; model.addEmptySubset(5); model.addElementToLastSubset(3);
    const first = await pending;
    assert(first.cover.hasSolution && first.cover.cost === 2 && first.cover.selectedSubsets().join() === '0,2', 'Pending snapshots unaffected by edits');
    const list = first.cover.selectedSubsets(); list.length = 0;
    const next = await api.SetCover.solveMip(model, options);
    assert(next.cover.cost === 7 && first.cover.cost === 2 && first.cover.selectedSubsets().length === 2, 'Results remain independent');
    const imported = new api.SetCoverModel(); imported.importModelFromProto(triangle(api).exportModelAsProto());
    assert((await api.SetCover.solveLpRelaxation(imported, options)).objectiveValue === 1.5, 'Imported proto models use the same native path');
    return {};
  },
}, {
  id: 'set_cover.mip.validation', name: 'Unsafe focus/time inputs reject and native calls recover', solver: 'set-cover',
  source: 'javascript/set_cover_mip.h', tags: ['validation'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    for (const solve of [api.SetCover.solveMip, api.SetCover.solveLpRelaxation]) {
      for (const timeLimitSeconds of [-1, NaN, Infinity, 1e20]) await rejects(() => solve(model, { ...options, timeLimitSeconds }));
      for (const focus of [[-1], [3], [0, 0], [0.5]]) await rejects(() => solve(model, { ...options, focus }));
      await rejects(() => solve(model, { ...options, initialSelectedSubsets: [3] }));
      const controller = new AbortController(); controller.abort();
      await rejects(() => solve(model, { ...options, signal: controller.signal }));
      const recovered = await solve(model, { ...options, timeLimitSeconds: 0.0001 });
      assert(recovered.subproblemStatus === api.SetCoverMipStatus.OPTIMAL, 'Native truncation to zero milliseconds is unlimited; rejection does not poison executor');
    }
    return {};
  },
}];
