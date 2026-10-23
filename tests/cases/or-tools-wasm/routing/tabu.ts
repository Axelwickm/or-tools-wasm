import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(run: () => unknown) { try { run(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected rejection'); }

export const routingTabuCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.search.generic_tabu_variables', name: 'Native generic tabu receives owned variable selections, replacement and reset', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::SetupMetaheuristics', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(5, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((from, to) => from === to ? 0 : 1));
    model.addConstantDimension(1, 10, true, '旅行');
    const dimension = model.getDimensionOrDie('旅行');
    const selection = [model.nextVarHandle(0), model.vehicleVar(1), model.activeVar(1),
      dimension.cumulVar(model.end(0)), dimension.slackVar(0), dimension.transitVar(0), dimension.fixedTransitVar(0)];
    model.setTabuVars(selection); selection.length = 0;
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode,
      firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
      localSearchMetaheuristic: api.LocalSearchMetaheuristic.GENERIC_TABU_SEARCH,
      solutionLimit: 8, timeLimit: { nanos: 50000000 } };
    const first = (await model.solve(options)).assignment;
    assert(first && first.objectiveValue() === 5n, 'Native generic tabu solves using the copied mixed variable selection');
    assert(await model.checkIfAssignmentIsFeasible(first, false, { executor: options.executor }), 'Returned assignment satisfies native feasibility');
    for (const selected of [[], null, [model.nextVarHandle(1)]] as const) {
      model.setTabuVars(selected);
      assert((await model.solve(options)).assignment?.objectiveValue() === 5n, 'Empty, reset and replacement selections retain native solve behavior');
    }
    assert((await model.solve({ ...options, localSearchMetaheuristic: api.LocalSearchMetaheuristic.TABU_SEARCH })).assignment,
      'Custom generic-tabu variables do not change ordinary native tabu search');
    const other = new api.RoutingModel(new api.RoutingIndexManager(5, 1, 0));
    rejects(() => model.setTabuVars([model.nextVarHandle(0), other.nextVarHandle(1)]));
    rejects(() => model.setTabuVars([0] as never));
    assert((await model.solve(options)).assignment && first.objectiveValue() === 5n,
      'Invalid selections do not mutate the configuration or earlier result');
    return {};
  },
}];
