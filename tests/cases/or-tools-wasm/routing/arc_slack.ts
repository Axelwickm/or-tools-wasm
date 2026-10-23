import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown | Promise<unknown>) {
  try { await action(); } catch { return; }
  throw new Error('Expected Routing inspection rejection');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });

export const routingArcSlackCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.arc_comparison', name: 'Native arc comparison preserves end, mandatory, dimension and tie preferences', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:ArcIsMoreConstrainedThanArc', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0)), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(1, 100, true, 'time');
    model.addDisjunction([3], 100);
    const start = model.start(0), end = model.end(0);
    assert(await model.arcIsMoreConstrainedThanArc(start, 1, end, options), 'Customer preferred over end');
    assert(!await model.arcIsMoreConstrainedThanArc(start, end, 1, options), 'End not preferred over customer');
    assert(await model.arcIsMoreConstrainedThanArc(start, 1, 3, options), 'Mandatory preferred over optional');
    assert(await model.arcIsMoreConstrainedThanArc(start, 1, 2, options), 'Equal destinations break ties by index');
    assert(!await model.arcIsMoreConstrainedThanArc(start, 1, 1, options), 'Identical destinations compare false');
    model.getDimensionOrDie('time').cumulVar(2).setMax(5);
    model.setPrimaryConstrainedDimension('time');
    assert(await model.arcIsMoreConstrainedThanArc(start, 2, 1, options), 'Primary dimension upper bound wins');
    model.setPrimaryConstrainedDimension('');
    assert(!await model.arcIsMoreConstrainedThanArc(start, 2, 1, options), 'Queries use current configuration');
    for (const [from, to1, to2] of [[end, 1, 2], [-1, 1, 2], [start, end + 1, 2], [start, 1, -1]])
      await rejects(() => model.arcIsMoreConstrainedThanArc(from, to1, to2, options));
    assert((await model.solve(options)).hasSolution, 'Inspection preserves future solving');
    return {};
  },
}, {
  id: 'routing.inspection.shortest_slack', name: 'Native slack inspection restores an owned self-dependent assignment', solver: 'routing',
  source: 'ortools/constraint_solver/routing_search.cc:ShortestTransitionSlack', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    const fixed = model.registerTransitCallback(() => 1);
    const dependent = model.registerStateDependentTransitCallback(() => ({ x: [0, 100], y: [2, 2] }), { domainStart: 0, domainEnd: 101 });
    model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, 10, [100], true, 'time');
    const time = model.getDimensionOrDie('time');
    time.cumulVar(1).setMin(6);
    const answer = await model.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(answer, 'Native assignment exists');
    const objective = answer.objectiveValue(), original = answer.value(time.cumulVar(0));
    assert(await time.shortestTransitionSlack(answer, 0, options) === 3n, 'Earliest feasible next transition');
    assert(await time.shortestTransitionSlack(answer, 2, options) === 0n, 'Last customer uses native slack lower bound');
    assert(await time.shortestTransitionSlack(answer, 0, options) === 3n, 'Repeated inspection is independent');
    assert(answer.objectiveValue() === objective && answer.value(time.cumulVar(0)) === original, 'Source snapshot unchanged');
    await rejects(() => time.shortestTransitionSlack(answer, model.end(0), options));
    const other = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    other.addConstantDimension(1, 100, true, 'time');
    const foreign = (await other.solve(options)).assignment;
    assert(foreign, 'Other model solves');
    await rejects(() => time.shortestTransitionSlack(foreign, 0, options));
    await rejects(() => other.getDimensionOrDie('time').shortestTransitionSlack(foreign, 0, options));
    const seed = await model.transferAssignmentFrom(answer, options);
    await rejects(() => time.shortestTransitionSlack(seed as unknown as typeof answer, 0, options));
    const restored = await model.restoreAssignment(answer, options);
    assert(restored && await time.shortestTransitionSlack(restored, 0, options) === 3n, 'Native restoration still works after rejections');
    return {};
  },
}, {
  id: 'routing.inspection.slack_optimum', name: 'Native slack query minimizes the next state-dependent transition', solver: 'routing',
  source: 'ortools/constraint_solver/routing_search.cc:ShortestTransitionSlack', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    const fixed = model.registerTransitCallback(() => 1);
    const dependent = model.registerStateDependentTransitCallback((from) => from === 1
      ? { x: [0, 5, 100], y: [10, 0, 0] } : { x: [0, 100], y: [0, 0] }, { domainStart: 0, domainEnd: 101 });
    model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, 10, [100], true, 'time');
    const answer = await model.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(answer, 'Native piecewise schedule exists');
    const time = model.getDimensionOrDie('time');
    assert(await time.shortestTransitionSlack(answer, 0, options) === 4n, 'Waiting until departure time 5 minimizes next arrival');
    return {};
  },
}, {
  id: 'routing.inspection.slack_preconditions', name: 'Slack inspection preserves positive bounds and rejects unbound and dropped nodes', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:ShortestTransitionSlack', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode);
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const fixed = model.registerTransitCallback(() => 1);
    const dependent = model.registerStateDependentTransitCallback(() => ({ x: [0, 100], y: [2, 2] }), { domainStart: 0, domainEnd: 101 });
    model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, 10, [100], false, 'time');
    model.addDisjunction([2], 0);
    const time = model.getDimensionOrDie('time');
    time.slackVar(1).setMin(4);
    const answer = await model.readAssignmentFromRoutes([[1]], false, options);
    assert(answer, 'Ranged native schedule exists');
    assert(await time.shortestTransitionSlack(answer, 1, options) === 4n, 'End-arc query preserves positive minimum with unbound cumul');
    await rejects(() => time.shortestTransitionSlack(answer, 0, options));
    await rejects(() => time.shortestTransitionSlack(answer, 2, options));
    assert((await model.solve(options)).hasSolution, 'Failed inspections leave executor usable');
    return {};
  },
}];
