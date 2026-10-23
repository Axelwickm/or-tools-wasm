import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown | Promise<unknown>, pattern: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && pattern.test(error.message), `Unexpected rejection: ${String(error)}`); return; }
  throw new Error('Expected Routing rejection');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });

export const routingSearchInspectionCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.search.first_evaluator', name: 'Native evaluator strategy uses its dedicated evaluator independently of arc costs', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1357', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(4, 1, 0), model = new api.RoutingModel(manager);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const parameters = { firstSolutionStrategy: api.FirstSolutionStrategy.EVALUATOR_STRATEGY, solutionLimit: 1 };
    const absent = await model.solve({ ...execution(mode), ...parameters });
    assert(!absent.assignment && absent.status === api.RoutingSearchStatus.ROUTING_INVALID, 'Native evaluator strategy requires its setter');
    const rank = model.registerTransitCallback((from, to) => {
      const a = manager.indexToNode(from), b = manager.indexToNode(to);
      return (a === 0 && b === 3) || b === a - 1 ? 1 : 100;
    });
    model.setFirstSolutionEvaluator(rank);
    const solved = await model.solve({ ...execution(mode), ...parameters });
    assert(solved.assignment && solved.assignment.value(model.start(0)) === 3 && solved.assignment.value(3) === 2
      && solved.assignment.value(2) === 1 && solved.assignment.objectiveValue() === 4n, 'Dedicated native ranking selects reverse order while arc costs remain one');
    await rejects(() => model.setFirstSolutionEvaluator(999), /evaluator/i);
    model.setFirstSolutionEvaluator(model.registerTransitCallback((a, b) => manager.indexToNode(b) === (manager.indexToNode(a) + 1) % 4 ? 1 : 100));
    assert((await model.solve({ ...execution(mode), ...parameters })).assignment?.value(model.start(0)) === 1, 'Replacing the evaluator applies to the next native model');
    assert(solved.assignment.value(model.start(0)) === 3, 'Earlier result snapshots remain unchanged');
    return {};
  },
}, {
  id: 'routing.search.primary_dimension', name: 'Primary constrained dimension selects tighter destination bounds and can be cleared', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:4439', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const transit = model.registerTransitCallback(() => 1);
    model.setArcCostEvaluatorOfAllVehicles(transit); model.addDimension(transit, 0, 100, true, 'time');
    model.getDimensionOrDie('time').cumulVar(2).setMax(2);
    assert(model.getPrimaryConstrainedDimension() === '', 'The native configuration starts without a primary dimension');
    await rejects(() => model.setPrimaryConstrainedDimension('missing'), /dimension/i);
    model.setPrimaryConstrainedDimension('time');
    assert(model.getPrimaryConstrainedDimension() === 'time', 'Configured primary dimension is readable');
    const options = { ...execution(mode), firstSolutionStrategy: api.FirstSolutionStrategy.PATH_MOST_CONSTRAINED_ARC, solutionLimit: 1 };
    assert((await model.solve(options)).assignment?.value(model.start(0)) === 2, 'Native comparison prefers the tighter cumul upper bound');
    model.setPrimaryConstrainedDimension('');
    assert(model.getPrimaryConstrainedDimension() === '' && (await model.solve(options)).assignment?.value(model.start(0)) === 1, 'Clearing restores native cost/index tie breaking');
    return {};
  },
}, {
  id: 'routing.search.optimizer_inspection', name: 'Optimizer lists and predicates reflect the closed native model', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:820', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const transit = model.registerUnaryTransitCallback(() => 1);
    model.setArcCostEvaluatorOfAllVehicles(transit); model.addDimension(transit, 10, 100, false, 'time');
    assert(!await model.hasGlobalCumulOptimizer('time', execution(mode)) && !await model.hasLocalCumulOptimizer('time', execution(mode)), 'A dimension without optimizer costs has no cumul optimizer');
    assert((await model.getDimensionsWithGlobalCumulOptimizers(execution(mode))).length === 0 && (await model.getDimensionsWithLocalCumulOptimizers(execution(mode))).length === 0, 'Native empty lists are preserved');
    model.getDimensionOrDie('time').setGlobalSpanCostCoefficient(1);
    assert(await model.hasGlobalCumulOptimizer('time', execution(mode)), 'Native global span cost enables the global optimizer');
    const disabled = { ...execution(mode), disableSchedulingBewareThisMayDegradePerformance: true };
    assert(!await model.hasGlobalCumulOptimizer('time', disabled)
      && (await model.getDimensionsWithGlobalCumulOptimizers(disabled)).length === 0, 'Inspection closes with caller-selected scheduling parameters');
    const local = model.getDimensionOrDie('time');
    local.setCumulVarSoftLowerBound(1, 2, 1); local.setCumulVarSoftUpperBound(2, 10, 1);
    assert(await model.hasLocalCumulOptimizer('time', execution(mode))
      && (await model.getDimensionsWithLocalCumulOptimizers(execution(mode))).length === 1, 'Native soft bounds also enable the local optimizer');
    const dimensions = await model.getDimensionsWithGlobalCumulOptimizers(execution(mode));
    assert(dimensions.length === 1 && await dimensions[0].cumulVar(model.end(0)).max(execution(mode)) === 100n, 'Dimension lists return usable model handles');
    dimensions.length = 0;
    assert((await model.getDimensionsWithGlobalCumulOptimizers(execution(mode))).length === 1, 'Inspection results are independent snapshots');
    await rejects(() => model.hasLocalCumulOptimizer('missing', execution(mode)), /dimension/i);
    await rejects(() => model.getDimensionsWithGlobalCumulOptimizers({ ...execution(mode), firstSolutionStrategy: api.FirstSolutionStrategy.EVALUATOR_STRATEGY }), /Invalid.*search parameters/i);
    const solved = await model.solve(execution(mode));
    assert(solved.assignment, 'Inspection leaves ordinary solving available');
    return {};
  },
}, {
  id: 'routing.search.assignment_check', name: 'Native feasibility checks honor monitors, limits and ownership without changing saved results', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:3211', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const input = await model.readAssignmentFromRoutes([[1, 2, 3]], true, execution(mode));
    assert(input, 'Native check input is feasible');
    let callbacks = 0;
    model.addAtSolutionCallback(() => { ++callbacks; });
    assert(await model.checkIfAssignmentIsFeasible(input, false, execution(mode)) && callbacks === 0, 'Default checking does not invoke solution monitors');
    assert(await model.checkIfAssignmentIsFeasible(input, true, execution(mode)) && Number(callbacks) > 0, 'Opted-in checking invokes native solution monitors');
    assert(!await model.checkIfAssignmentIsFeasible(input, false, { ...execution(mode), timeLimit: { seconds: 0 } }), 'Exhausted native checking limits preserve the native false result');
    const foreign = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    await rejects(() => foreign.checkIfAssignmentIsFeasible(input, false, execution(mode)), /another model/);
    model.nextVarHandle(model.start(0)).setValue(2);
    assert(!await model.checkIfAssignmentIsFeasible(input, false, execution(mode)), 'Incompatible saved routes fail native CP restoration');
    assert(input.value(model.start(0)) === 1 && input.objectiveValue() === 4n, 'Checking preserves the input snapshot');
    assert((await model.solve(execution(mode))).assignment, 'Normal solving recovers after failed checks');
    return {};
  },
}];
