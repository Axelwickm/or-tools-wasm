import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { try { action(); } catch { return; } throw new Error('Expected assignment ownership rejection'); }

export const routingReuseCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.reuse.locks', name: 'Native locks preserve committed prefixes, optional visits and detached preassignments', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1695', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const manager = new api.RoutingIndexManager(5, 2, 0), model = new api.RoutingModel(manager);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const routes = [[manager.nodeToIndex(2), manager.nodeToIndex(1)], [manager.nodeToIndex(3)]];
    const applied = model.applyLocksToAllVehicles(routes, false, execution);
    routes[0].length = 0; routes[1][0] = 4;
    assert(await applied, 'Copied route prefixes are accepted natively');
    const pre = await model.inspectPreAssignment(execution);
    assert(pre.nextValues.get(model.start(0)) === 2 && pre.nextValues.get(2) === 1 && pre.nextValues.get(model.start(1)) === 3,
      'Native preassignment exposes the committed arcs for both vehicles');
    assert(!pre.nextValues.has(1) && !pre.nextValues.has(3), 'Open lock tails remain unbound');
    (pre.nextValues as Map<number, number>).clear();
    assert((await model.inspectPreAssignment(execution)).nextValues.get(2) === 1, 'Inspection results are detached');
    const answer = (await model.solve(execution)).assignment;
    assert(answer && answer.value(model.nextVar(model.start(0))) === 2 && answer.value(model.nextVar(2)) === 1
      && answer.value(model.nextVar(model.start(1))) === 3, 'Native solve preserves both committed prefixes');
    assert(await model.applyLocksToAllVehicles([], false, execution), 'Empty open locks clear preassignment');
    assert((await model.inspectPreAssignment(execution)).nextValues.size === 0, 'Cleared preassignment has no bound arcs');
    assert(answer.value(model.nextVar(2)) === 1, 'Earlier solution owns its route');
    const single = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    single.setArcCostEvaluatorOfAllVehicles(single.registerTransitCallback(() => 1));
    assert(!(await single.applyLocksToAllVehicles([[1, 1]], false, execution)), 'Native duplicate lock rejection returns false');
    assert((await single.inspectPreAssignment(execution)).nextValues.get(0) === 1, 'Native partial preassignment survives rejected locks');
    assert(await single.applyLocksToAllVehicles([[1, 3]], true, execution), 'Closed routes can be applied before feasibility is known');
    assert(!(await single.solve(execution)).assignment, 'Closed routes cannot omit mandatory stops');
    single.addDisjunction([2], 100);
    const closed = (await single.solve(execution)).assignment;
    assert(closed?.value(single.nextVar(3)) === single.end(0) && closed.value(single.activeVar(2)) === 0,
      'Closed routes drop omitted optional nodes natively');
    await single.applyLocksToAllVehicles([], false, execution);
    const aborted = new AbortController(); aborted.abort();
    let rejected = false;
    try { await single.inspectPreAssignment({ ...execution, signal: aborted.signal }); } catch { rejected = true; }
    assert(rejected && (await single.solve(execution)).assignment, 'Pre-aborted inspection rejects and the model recovers');
    return {};
  },
}, {
  id: 'routing.reuse.hints', name: 'Native local insertion consumes first-solution hints while locks retain precedence', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1662', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const manager = new api.RoutingIndexManager(4, 1, 0), model = new api.RoutingModel(manager);
    const costs = [[0, 1, 8, 8], [8, 0, 1, 1], [1, 1, 0, 1], [1, 8, 8, 0]];
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((from, to) => costs[manager.indexToNode(from)][manager.indexToNode(to)]));
    const seed = await model.readAssignmentFromRoutes([[2, 1, 3]], false, execution);
    assert(seed, 'Feasible hint is restored without optimization');
    model.setFirstSolutionHint(seed);
    for (const firstSolutionStrategy of [api.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION, api.FirstSolutionStrategy.LOCAL_CHEAPEST_COST_INSERTION]) {
      const hinted = (await model.solve({ ...execution, firstSolutionStrategy, solutionLimit: 1 })).assignment;
      assert(hinted?.value(model.nextVar(0)) === 2 && hinted.value(model.nextVar(2)) === 1 && hinted.value(model.nextVar(1)) === 3,
        'Native local insertion uses the full hinted route');
    }
    assert(await model.applyLocksToAllVehicles([[2]], false, execution), 'A matching saved prefix can be locked');
    const matchingWarm = await model.solveFromAssignmentWithParameters(seed, {}, execution);
    assert(matchingWarm?.value(model.nextVar(0)) === 2, 'Warm search preserves matching committed arcs');
    assert(await model.applyLocksToAllVehicles([[1]], false, execution), 'A different committed first stop can be locked');
    const locked = (await model.solve({ ...execution, firstSolutionStrategy: api.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION, solutionLimit: 1 })).assignment;
    assert(locked?.value(model.nextVar(0)) === 1, 'Native locks override conflicting hint arcs');
    model.setFirstSolutionHint(null);
    const conflictingWarm = await model.solveFromAssignmentWithParameters(seed, {}, execution);
    assert(conflictingWarm === null || conflictingWarm.value(model.nextVar(0)) === 1,
      'A conflicting warm start can fail natively, but any returned solution preserves locks');
    const restored = await model.restoreAssignment(seed, execution);
    assert(restored?.value(model.nextVar(0)) === 2, 'Native restoration checks feasibility independently of search preassignment');
    await model.applyLocksToAllVehicles([], false, execution);
    const plain = (await model.solve({ ...execution, firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC })).assignment;
    assert(plain && plain.objectiveValue() <= seed.objectiveValue(), 'Clearing the hint restores ordinary native search');
    const foreign = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    throws(() => foreign.setFirstSolutionHint(seed));
    let rejected = false;
    try { await foreign.restoreAssignment(seed, execution); } catch { rejected = true; }
    assert(rejected, 'Restoration rejects assignments belonging to another model');
    assert(seed.value(model.nextVar(0)) === 2, 'Hinting and solving leave the original assignment intact');
    return {};
  },
}, {
  id: 'routing.reuse.snapshot', name: 'Portable native snapshots preserve breaks, resources, custom variables and exact cumul bounds', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1650', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const offset of [0n, 9007199254740993n]) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      const transit = model.registerTransitCallback(() => 1);
      model.setArcCostEvaluatorOfAllVehicles(transit);
      model.addDimension(transit, 10, offset + 30n, false, 'time');
      const time = model.getDimensionOrDie('time'); time.cumulVar(model.start(0)).setRange(offset, offset);
      const rest = model.addBreakInterval({ startMin: offset + 1n, startMax: offset + 1n, duration: 2 });
      time.setBreakIntervalsOfVehicle([rest], 0, { preTravelEvaluator: -1, postTravelEvaluator: -1 });
      const group = offset === 0n ? model.addResourceGroup() : null;
      if (group) {
        group.addResource({ startDomain: [[offset, offset]], endDomain: [[offset + 5n, offset + 30n]] }, 'time');
        group.notifyVehicleRequiresAResource(0);
      }
      const truth = model.reify(time.cumulVar(model.end(0)).ge(offset + 5n));
      model.addConstraints(truth.eq(1));
      const absoluteStart = model.abs(time.cumulVar(model.start(0)));
      const seed = (await model.solve(execution)).assignment;
      assert(seed, 'Native schedule combines breaks and Boolean constraints, with resources at ordinary timestamps');
      const start = time.cumulVar(model.start(0)), end = time.cumulVar(model.end(0));
      const restored = await model.restoreAssignment(seed, execution);
      assert(restored && restored !== seed && restored.min(start) === offset && restored.max(start) === offset,
        'Restoration returns an independent assignment with exact int64 start bounds');
      assert(restored.min(end) === seed.min(end) && restored.max(end) === seed.max(end), 'Native restoration preserves captured cumul ranges');
      assert(restored.breakInterval(rest).endMax === offset + 3n && (!group || restored.resourceIndex(0, group) === 0)
        && restored.value(truth) === 1 && restored.value(absoluteStart) === offset,
        'Restored interval, resource and custom Boolean bounds survive the shared transport');
      const warm = await model.solveFromAssignmentWithParameters(seed, {}, execution);
      assert(warm?.breakInterval(rest).endMax === offset + 3n && (!group || warm.resourceIndex(0, group) === 0),
        'Native warm search consumes the complete snapshot');
      const crossExecutor = await model.restoreAssignment(seed, { executor: mode === 'direct' ? 'worker' : 'direct' });
      assert(crossExecutor?.min(start) === offset && crossExecutor.value(absoluteStart) === offset,
        'Snapshots can be restored by a different executor on the same model');
      const routes: number[] = [];
      for (let index = seed.value(model.nextVar(model.start(0))); !model.isEnd(index); index = seed.value(model.nextVar(index))) routes.push(index);
      time.cumulVar(model.start(0)).setRange(offset + 1n, offset + 1n);
      assert(await model.restoreAssignment(seed, execution) === null, 'Conflicting captured start bounds fail native restoration');
      assert(seed.min(start) === offset && restored.breakInterval(rest).endMax === offset + 3n, 'Old snapshots remain readable after model edits');
      assert(routes.length === 2, 'The saved route includes every mandatory visit');
    }
    return {};
  },
}];
