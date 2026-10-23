import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
async function rejects(action: () => unknown | Promise<unknown>, match: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && match.test(error.message), String(error)); return; }
  throw new Error('Expected Routing seed rejection');
}

export const routingTransferCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.transfer.costs_and_schedules', name: 'Native transfer copies routes and recomputes target costs and schedules only on restoration', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:SetAssignmentFromOtherModelAssignment', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const source = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    let forbidSourceCallbacks = false;
    source.setArcCostEvaluatorOfAllVehicles(source.registerTransitCallback(() => {
      if (forbidSourceCallbacks) throw new Error('Source callbacks must not run during transfer');
      return 1;
    }));
    source.addConstantDimension(2, 100, true, 'source_time');
    const original = await source.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(original && original.objectiveValue() === 3n, 'Source assignment');
    forbidSourceCallbacks = true;
    const target = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    target.setArcCostEvaluatorOfAllVehicles(target.registerTransitCallback(() => 2));
    target.addConstantDimension(5, 100, true, 'target_time');
    const seed = await target.transferAssignmentFrom(original, options);
    assert(seed instanceof api.RoutingAssignmentSeed && !(seed instanceof api.Assignment), 'Partial seeds have their own public type');
    assert(!('objectiveValue' in seed) && !('hasSolution' in seed), 'Seed claims no evaluated objective or feasibility');
    for (let i = 0; i < 3; ++i) assert(seed.value(target.nextVar(i)) === original.value(source.nextVar(i)), 'Native successor copy');
    await rejects(() => seed.value(target.vehicleVar(1)), /no bound value/);
    await rejects(() => seed.value(target.getDimensionOrDie('target_time').cumulVar(1) as unknown as Parameters<typeof seed.value>[0]), /only successor/);
    const restored = await target.restoreAssignment(seed, options);
    assert(restored && restored.objectiveValue() === 6n, 'Restoration evaluates target costs');
    assert(restored.value(target.getDimensionOrDie('target_time').cumulVar(target.end(0))) === 15n, 'Target schedule is solved independently');
    assert(original.objectiveValue() === 3n && original.value(source.getDimensionOrDie('source_time').cumulVar(source.end(0))) === 6n, 'Source snapshot stays unchanged');
    assert(seed.value(target.nextVar(0)) === 1, 'Seed survives native model destruction and restoration');
    return {};
  },
}, {
  id: 'routing.transfer.heterogeneous_vehicles', name: 'Heterogeneous native transfer retains vehicle values, dropped nodes and multiple depots', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:SetAssignmentFromOtherModelAssignment', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode);
    const source = new api.RoutingModel(new api.RoutingIndexManager(5, 2, [0, 4], [4, 0]));
    source.setArcCostEvaluatorOfAllVehicles(source.registerTransitCallback(() => 1));
    source.addDisjunction([3], 0);
    const original = await source.readAssignmentFromRoutes([[1], [2]], false, options);
    assert(original, 'Native source routes');
    const target = new api.RoutingModel(new api.RoutingIndexManager(5, 2, [0, 4], [4, 0]));
    target.setArcCostEvaluatorOfVehicle(target.registerTransitCallback(() => 2), 0);
    target.setArcCostEvaluatorOfVehicle(target.registerTransitCallback(() => 4), 1);
    target.addDisjunction([3], 0);
    const seed = await target.transferAssignmentFrom(original, options);
    for (const index of [target.start(0), target.start(1), 1, 2, 3, target.end(0), target.end(1)])
      assert(seed.value(target.vehicleVar(index)) === original.value(source.vehicleVar(index)), 'Native per-vehicle and endpoint values');
    assert(seed.value(target.vehicleVar(3)) === -1 && seed.value(target.nextVar(3)) === 3, 'Dropped node remains dropped');
    const restored = await target.restoreAssignment(seed, options);
    assert(restored && restored.objectiveValue() === 12n, 'Costs belong to the target vehicles');
    assert(restored.value(target.nextVar(target.start(0))) === 1 && restored.value(target.nextVar(target.start(1))) === 2, 'Route-to-vehicle mapping is preserved');
    return {};
  },
}, {
  id: 'routing.transfer.warm_starts', name: 'Route seeds work with ordinary and multiple warm starts and native feasibility checks', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:SolveFromAssignmentsWithParameters', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), source = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    source.setArcCostEvaluatorOfAllVehicles(source.registerTransitCallback(() => 1));
    const original = await source.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(original, 'Source assignment');
    const target = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    target.setArcCostEvaluatorOfAllVehicles(target.registerTransitCallback(() => 2));
    target.addConstantDimension(5, 100, true, 'time');
    const seed = await target.transferAssignmentFrom(original, options);
    assert(await target.checkIfAssignmentIsFeasible(seed, false, options), 'Explicit native feasibility checking accepts a route seed');
    const single = await target.solveFromAssignmentWithParameters(seed, {}, options);
    assert(single && single.objectiveValue() === 6n && single.value(target.getDimensionOrDie('time').cumulVar(target.end(0))) === 15n, 'Ordinary warm start produces a complete result');
    const multiple = await target.solveFromAssignmentsWithParameters([seed, single], {}, options);
    assert(multiple.assignment?.objectiveValue() === 6n, 'Mixed full assignments and seeds use native multiple-start solving');
    await rejects(() => target.fastSolveFromAssignmentWithParameters(seed as unknown as typeof original, {}, true, options), /restored assignment/);
    await rejects(() => target.compactAssignment(seed as unknown as typeof original, options), /restored assignment/);
    await rejects(() => target.packCumulsOfOptimizerDimensionsFromAssignment(seed as unknown as typeof original, 1, options), /restored assignment/);
    await rejects(() => target.setFirstSolutionHint(seed as unknown as typeof original), /restored assignment/);
    const fast = await target.fastSolveFromAssignmentWithParameters(single, {}, true, options);
    assert(fast.assignment?.objectiveValue() === 6n, 'Restored complete assignments remain accepted by fast solving');
    return {};
  },
}, {
  id: 'routing.transfer.infeasible_seed', name: 'Transfer preserves routes even when target constraints reject their restoration', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:SetAssignmentFromOtherModelAssignment', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), source = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const original = await source.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(original, 'Source route');
    const target = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    target.nextVarHandle(1).removeValue(2);
    const seed = await target.transferAssignmentFrom(original, options);
    assert(seed.value(target.nextVar(1)) === 2, 'Transfer does not repair or validate the route');
    assert(await target.restoreAssignment(seed, options) === null, 'Native restoration rejects incompatible routes');
    assert(!await target.checkIfAssignmentIsFeasible(seed, false, options), 'Explicit native feasibility returns false');
    assert((await target.solve(options)).assignment, 'Native solving remains usable after a rejected restoration');
    return {};
  },
}, {
  id: 'routing.transfer.ownership_and_layout', name: 'Transfer rejects incompatible layouts and preserves seed ownership across later model edits', solver: 'routing',
  source: 'javascript/lib/routing/api.ts:transferAssignmentFrom', tags: ['validation', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), source = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const original = await source.readAssignmentFromRoutes([[1, 2]], false, options);
    assert(original, 'Source route');
    for (const manager of [new api.RoutingIndexManager(3, 1, 1), new api.RoutingIndexManager(3, 2, 0), new api.RoutingIndexManager(4, 1, 0)])
      await rejects(() => new api.RoutingModel(manager).transferAssignmentFrom(original, options), /index-manager layout/);
    const target = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    await rejects(() => target.transferAssignmentFrom({} as typeof original, options), /not registered/);
    const pending = target.transferAssignmentFrom(original, options);
    target.nextVarHandle(1).removeValue(2);
    const seed = await pending;
    assert(seed.value(target.nextVar(1)) === 2, 'Returned seed is an owned native snapshot');
    await rejects(() => seed.value(source.nextVarHandle(1)), /different Routing model/);
    await rejects(() => source.restoreAssignment(seed, options), /another model/);
    const other = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    await rejects(() => other.solveFromAssignmentWithParameters(seed, {}, options), /another model/);
    const controller = new AbortController(); controller.abort();
    await rejects(() => other.transferAssignmentFrom(original, { ...options, signal: controller.signal }), /abort/i);
    assert((await other.restoreAssignment(await other.transferAssignmentFrom(original, options), options)) !== null, 'Executor recovers after invalid and cancelled transfers');
    return {};
  },
}];
