import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { try { action(); } catch { return; } throw new Error('Expected break operation to reject'); }

export const routingBreakCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.breaks.native_intervals', name: 'Native driver breaks preserve time windows, optionality, service exclusion and independent assignments', solver: 'routing',
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    function fixture(slack = 10, optional = false, service = false) {
      const manager = new api.RoutingIndexManager(3, 1, 0), model = new api.RoutingModel(manager);
      const transit = model.registerTransitCallback(() => service ? 3 : 1);
      model.setArcCostEvaluatorOfAllVehicles(transit); model.addDimension(transit, slack, 30, true, 'time');
      const dimension = model.getDimensionOrDie('time');
      const interval = model.addBreakInterval({ startMin: 1, startMax: 1, duration: 2, optional, name: 'rest' });
      const intervals = [interval];
      dimension.setBreakIntervalsOfVehicle(intervals, 0, service ? { preTravelEvaluator: model.registerTransitCallback(() => 2) } : {});
      intervals.length = 0;
      return { manager, model, dimension, interval };
    }
    const { manager, model, dimension, interval } = fixture();
    const solved = await model.solve(execution), assignment = solved.assignment;
    assert(assignment, 'A route with native rest exists');
    const rest = assignment.breakInterval(interval);
    assert(rest.performed === true && rest.startMin === 1n && rest.startMax === 1n && rest.endMin === 3n && rest.endMax === 3n, 'Break occurs in the native interval window');
    assert(assignment.min(dimension.cumulVar(model.end(0))) === 5n, 'Rest consumes native time slack');
    rest.startMin = 99n;
    assert(assignment.breakInterval(interval).startMin === 1n, 'Break reads are independent snapshots');
    const foreign = fixture();
    throws(() => dimension.setBreakIntervalsOfVehicle([foreign.interval], 0));
    throws(() => assignment.breakInterval(foreign.interval));
    throws(() => model.addBreakInterval({ startMin: 2, startMax: 1, duration: 2 }));
    throws(() => model.addBreakInterval({ startMin: 0, startMax: 1, duration: -1 }));
    throws(() => model.addBreakInterval({ startMin: 0, startMax: 9223372036854775807n, duration: 1 }));
    throws(() => dimension.setBreakIntervalsOfVehicle([interval], 1));
    throws(() => dimension.setBreakIntervalsOfVehicle([interval], 0, { postTravelEvaluator: 999 }));
    throws(() => dimension.setBreakDistanceDurationOfVehicle(-1, 1, 0));
    const warm = await model.solveFromAssignmentWithParameters(assignment, {}, execution);
    assert(warm && warm.breakInterval(interval).startMin === 1n, 'Warm solve retains native breaks');
    const routes = [] as number[];
    for (let index = assignment.value(model.nextVar(model.start(0))); !model.isEnd(index); index = assignment.value(model.nextVar(index))) routes.push(index);
    const restored = await model.readAssignmentFromRoutes([routes], true, execution);
    assert(restored && restored.breakInterval(interval).performed, 'Route restoration checks and retains native break feasibility');
    const mandatory = fixture(0);
    assert(!(await mandatory.model.solve(execution)).assignment, 'Mandatory break is infeasible without waiting slack');
    const optional = fixture(0, true), skipped = (await optional.model.solve(execution)).assignment;
    assert(skipped, 'Optional break can be skipped');
    const absent = skipped.breakInterval(optional.interval);
    assert(absent.performed === false && absent.startMin === undefined && absent.endMax === undefined, 'Unperformed break has no fabricated times');
    const service = fixture(10, false, true);
    assert(!(await service.model.solve(execution)).assignment, 'Native pre-travel service excludes overlapping breaks');
    const repeated = await model.solve(execution);
    assert(repeated.assignment?.breakInterval(interval).endMin === 3n && assignment.breakInterval(interval).endMin === 3n, 'Reuse and previous break assignments remain valid');
    dimension.setBreakDistanceDurationOfVehicle(2, 1, 0);
    assert((await model.solve(execution)).assignment?.breakInterval(interval).performed, 'A qualifying break satisfies the distance rule');
    // A distance rule with no qualifying breaks must constrain the native route.
    const distanceManager = new api.RoutingIndexManager(3, 1, 0), distanceModel = new api.RoutingModel(distanceManager);
    const distance = distanceModel.registerTransitCallback(() => 1);
    distanceModel.setArcCostEvaluatorOfAllVehicles(distance); distanceModel.addDimension(distance, 10, 30, true, 'time');
    distanceModel.getDimensionOrDie('time').setBreakDistanceDurationOfVehicle(2, 1, 0);
    assert(!(await distanceModel.solve(execution)).assignment, 'Distance/duration rule forbids a long uninterrupted route');
    const offset = 9007199254740993n, exactModel = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const exactTransit = exactModel.registerTransitCallback(() => 1);
    exactModel.setArcCostEvaluatorOfAllVehicles(exactTransit);
    exactModel.addDimension(exactTransit, 10, offset + 30n, false, 'time');
    const exactTime = exactModel.getDimensionOrDie('time'); exactTime.cumulVar(exactModel.start(0)).setRange(offset, offset);
    const exactBreak = exactModel.addBreakInterval({ startMin: offset + 1n, startMax: offset + 1n, duration: 2 });
    exactTime.setBreakIntervalsOfVehicle([exactBreak], 0, { preTravelEvaluator: -1, postTravelEvaluator: -1 });
    const exactAnswer = (await exactModel.solve(execution)).assignment;
    assert(exactAnswer?.breakInterval(exactBreak).endMax === offset + 3n, 'Break times remain exact beyond the safe-number range');
    assert(manager.getNumberOfIndices() === 4, 'Fixture covers the native end index');
    return {};
  },
}];
