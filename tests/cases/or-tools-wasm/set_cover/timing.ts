import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
function measured(value: import('or-tools-wasm/set-cover').SetCoverSearchStatistics | null) {
  assert(value && Number.isFinite(value.runTimeSeconds) && value.runTimeSeconds >= 0 && Number.isFinite(value.runTimeMicroseconds) && value.runTimeMicroseconds >= 0, 'Native timing metadata is present and finite');
  assert(value.runTimeMicroseconds <= value.runTimeSeconds * 1e6 + 1 && value.runTimeSeconds * 1e6 - value.runTimeMicroseconds < 1.01, 'Native microsecond truncation is preserved');
  return value;
}
async function rejects(action: () => unknown | Promise<unknown>) { try { await action(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected timing query rejection'); }
function fixture(api: SolveResultApis['cover']) { const model = new api.SetCoverModel(); for (const cost of [1, 2, 3]) { model.addEmptySubset(cost); model.addElementToLastSubset(0); } return model; }
export const setCoverTimingCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'set_cover.timing.result', name: 'Native timing is returned in owned one-shot and generator result metadata', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.h:run_time_in_seconds', tags: ['gap-regression', 'native-contract'],
  async run({ cover: api }, { mode }) {
    const model = fixture(api), options = execution(mode);
    const result = await api.SetCover.solve(model, options); const stats = measured(result.statistics);
    assert(result.hasSolution, 'One-shot timing accompanies the existing result');
    const inv = new api.SetCoverInvariant(model), greedy = new api.GreedySolutionGenerator(inv);
    const search = await greedy.nextSolutionWithStats(undefined, options); measured(search.statistics);
    assert(search.nextSolution && inv.isSelected().some(Boolean), 'Timed generator calls retain Boolean success and commit invariant state');
    assert(typeof await greedy.nextSolution(undefined, options) === 'boolean', 'Existing nextSolution still returns its native Boolean');
    const retained = stats.runTimeSeconds; await api.SetCover.solve(model, options); assert(stats.runTimeSeconds === retained, 'Later searches do not mutate old timing snapshots');
    return {};
  },
}, {
  id: 'set_cover.timing.session', name: 'Guided timing queries read the existing native last-call timing with lifecycle checks', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.cc:GuidedLocalSearch::NextSolution', tags: ['gap-regression', 'lifecycle'],
  async run({ cover: api }, { mode }) {
    const options = execution(mode);
    for (const Search of [api.GuidedLocalSearch, api.GuidedTabuSearch]) {
      const inv = new api.SetCoverInvariant(fixture(api)); inv.loadSolution([true, true, true]);
      const search = new Search(inv); search.setMaxIterations(2);
      await rejects(() => search.statistics(options));
      try {
        await search.initialize(options); const initial = measured(await search.statistics(options));
        const first = await search.nextSolutionWithStats(undefined, options), native = measured(first.statistics);
        const queried = measured(await search.statistics(options));
        assert(queried.runTimeSeconds === native.runTimeSeconds && queried.runTimeSeconds >= initial.runTimeSeconds, 'Query reads the same native counter without rerunning search');
        const second = measured((await search.nextSolutionWithStats(undefined, options)).statistics);
        assert(measured(await search.statistics(options)).runTimeSeconds === second.runTimeSeconds, 'Continuation reports the latest native call duration');
        const before = inv.isSelected().join(); await search.statistics(options); assert(inv.isSelected().join() === before, 'Timing inspection does not commit or mutate selection');
        await search.initialize(options);
        assert(measured(await search.statistics(options)).runTimeSeconds === second.runTimeSeconds, 'Native initialization preserves the latest duration');
      } finally { await search.close(); }
      await rejects(() => search.statistics(options));
    }
    return {};
  },
}];
