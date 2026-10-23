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
export const setCoverLagrangianCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.lagrangian.bound', name: 'Native Lagrangian relaxation returns a bound and owned vectors without selecting a cover', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_lagrangian.cc:ComputeLowerBound', tags: ['native-contract'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode), inv = new api.SetCoverInvariant(model);
    inv.loadSolution([true, true, false]);
    const before = JSON.stringify(model.exportModelAsProto());
    const result = await model.computeLagrangianLowerBound(2, options);
    assert(Math.abs(result.lowerBound - 1.5) < 1e-9, 'Triangle fractional bound is 1.5, below integer optimum 2');
    assert(result.reducedCosts.length === 3 && result.multipliers.length === 3, 'Vectors use full native subset/element indexing');
    assert(result.reducedCosts.every(Number.isFinite) && result.multipliers.every(Number.isFinite), 'Triangle native vectors are finite');
    assert(inv.isSelected().join() === 'true,true,false' && JSON.stringify(model.exportModelAsProto()) === before, 'No selection or model mutation');
    result.reducedCosts[0] = 999;
    const repeated = await model.computeLagrangianLowerBound(2, options);
    assert(repeated.reducedCosts[0] !== 999 && result.reducedCosts[0] === 999, 'Independent owned results');
    return {};
  },
}, {
  id: 'set_cover.lagrangian.snapshot', name: 'Lagrangian operation snapshots models and preserves native nonfinite iteration state', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_lagrangian.cc:UpdateMultipliers', tags: ['native-contract', 'lifecycle'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    const pending = model.computeLagrangianLowerBound(2, options);
    model.addEmptySubset(5); model.addElementToLastSubset(3);
    assert((await pending).multipliers.length === 3, 'Pending request owns its model snapshot');
    assert((await model.computeLagrangianLowerBound(7, options)).multipliers.length === 4, 'Next request sees edits');
    const singleton = new api.SetCoverModel(); singleton.addEmptySubset(1); singleton.addElementToLastSubset(0);
    const native = await singleton.computeLagrangianLowerBound(2, options);
    assert(Math.abs(native.lowerBound - 1) < 1e-9 && Number.isNaN(native.multipliers[0]), 'Native zero-subgradient NaN is preserved, not repaired');
    return {};
  },
}, {
  id: 'set_cover.lagrangian.validation', name: 'Invalid Lagrangian inputs and cancellation reject with executor recovery', solver: 'set-cover',
  source: 'javascript/set_cover_lagrangian.h', tags: ['gap-regression', 'validation'],
  async run({ cover: api }, { mode }) {
    const model = triangle(api), options = execution(mode);
    for (const upper of [NaN, Infinity, -1]) await rejects(() => model.computeLagrangianLowerBound(upper, options));
    await rejects(() => new api.SetCoverModel().computeLagrangianLowerBound(0, options));
    const gap = new api.SetCoverModel(); gap.addEmptySubset(1); gap.addElementToLastSubset(1);
    await rejects(() => gap.computeLagrangianLowerBound(1, options));
    const negative = new api.SetCoverModel(); negative.addEmptySubset(-1); negative.addElementToLastSubset(0);
    await rejects(() => negative.computeLagrangianLowerBound(0, options));
    const controller = new AbortController(); controller.abort();
    await rejects(() => model.computeLagrangianLowerBound(2, { ...options, signal: controller.signal }));
    assert(Math.abs((await model.computeLagrangianLowerBound(2, options)).lowerBound - 1.5) < 1e-9, 'Recovery');
    return {};
  },
}];
