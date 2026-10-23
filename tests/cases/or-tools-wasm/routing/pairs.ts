import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { try { action(); } catch { return; } throw new Error('Expected invalid pair configuration to reject'); }

export const routingPairCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.pairs.alternatives', name: 'Native pickup/delivery alternatives and combination limits change the selected visits', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1035', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const preferredDelivery of [3, 4]) {
      const manager = new api.RoutingIndexManager(5, 1, 0), model = new api.RoutingModel(manager);
      model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((_from, to) => [2, preferredDelivery === 3 ? 4 : 3].includes(manager.indexToNode(to)) ? 10 : 1));
      model.addConstantDimension(1, 100, true, 'time');
      const pickups = [1, 2], deliveries = [3, 4];
      const pickup = model.addDisjunction(pickups), delivery = model.addDisjunction(deliveries);
      const pair = model.addPickupAndDeliverySets(pickup, delivery); pickups.length = 0; deliveries.length = 0;
      assert(pair === 0, 'Alternative pairs return their native pair index');
      const time = model.getDimensionOrDie('time'); assert(!time.hasPickupToDeliveryLimits(), 'New dimensions have no configured limits');
      const parameters = { firstSolutionStrategy: api.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION };
      const baseline = (await model.solve({ ...execution, ...parameters })).assignment;
      assert(baseline?.value(model.nextVar(0)) === 1 && baseline.value(model.nextVar(1)) === preferredDelivery && baseline.objectiveValue() === 3n,
        'Native search initially serves the cheapest pickup and delivery');
      let restrictPreferred = true; const samples: Array<[number, number]> = [];
      time.setPickupToDeliveryLimitFunctionForPair((pickupAlternative, deliveryAlternative) => {
        samples.push([pickupAlternative, deliveryAlternative]);
        return restrictPreferred && pickupAlternative === 0 && deliveryAlternative === preferredDelivery - 3 ? 0 : 1;
      }, pair);
      assert(time.hasPickupToDeliveryLimits() && model.getDimensionOrDie('time').hasPickupToDeliveryLimits(), 'Limit configuration is shared by dimension handles');
      const pending = model.solve({ ...execution, ...parameters }); restrictPreferred = false;
      const answer = (await pending).assignment;
      assert(answer && (answer.value(model.activeVar(1)) === 0 || answer.value(model.activeVar(preferredDelivery)) === 0),
        'Copied native limit table excludes the previously cheapest combination');
      assert(samples.map(value => value.join(',')).join(';') === '0,0;0,1;1,0;1,1', 'The finite alternative table is sampled once in native index order');
      assert(answer.value(model.activeVar(1)) + answer.value(model.activeVar(2)) === 1
        && answer.value(model.activeVar(3)) + answer.value(model.activeVar(4)) === 1, 'Exactly one pickup and one delivery are selected');
      const selectedPickup = answer.value(model.activeVar(1)) ? 1 : 2, selectedDelivery = answer.value(model.activeVar(3)) ? 3 : 4;
      assert(answer.value(time.cumulVar(selectedDelivery)) - answer.value(time.cumulVar(selectedPickup)) <= 1n,
        'Selected alternatives obey their native ride-time limit');
      const warm = await model.solveFromAssignmentWithParameters(answer, parameters, execution);
      assert(warm && warm.objectiveValue() <= answer.objectiveValue(), 'Native warm search reuses an alternative assignment');
      assert(baseline.value(model.nextVar(1)) === preferredDelivery && answer.value(model.activeVar(selectedPickup)) === 1, 'Previous assignments remain independent');
      time.setPickupToDeliveryLimitFunctionForPair(() => 1, pair);
      assert((await model.solve({ ...execution, ...parameters })).assignment?.objectiveValue() === 3n, 'Replacing the limit function restores the cheapest combination');
      throws(() => model.addPickupAndDeliverySets(-1, delivery)); throws(() => model.addPickupAndDeliverySets(pickup, 99));
      throws(() => time.setPickupToDeliveryLimitFunctionForPair(() => 1, 99));
      time.setPickupToDeliveryLimitFunctionForPair(() => Number.POSITIVE_INFINITY, pair);
      let rejected = false; try { await model.solve(execution); } catch { rejected = true; }
      assert(rejected, 'Invalid callback values reject before native execution');
      time.setPickupToDeliveryLimitFunctionForPair(() => 1, pair);
      assert((await model.solve(execution)).assignment, 'A rejected table does not poison later solves');
    }
    return {};
  },
}, {
  id: 'routing.pairs.singleton_limits', name: 'Native singleton limits reject infeasible rides without an invalid CP-SAT fallback', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:3432', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(1, 100, true, 'time');
    const pair = model.addPickupAndDelivery(1, 2), time = model.getDimensionOrDie('time');
    assert(pair === 0, 'Singleton pairs use the same native indexing as alternative sets');
    time.setPickupToDeliveryLimitFunctionForPair(() => 0, pair);
    assert(!(await model.solve(execution)).assignment, 'Default fallback cannot return a route that bypasses a zero ride-time limit');
    time.setPickupToDeliveryLimitFunctionForPair(() => 1, pair);
    const answer = (await model.solve(execution)).assignment;
    assert(answer, 'A feasible singleton limit permits a solution');
    assert(answer.value(time.cumulVar(2)) - answer.value(time.cumulVar(1)) === 1n, 'A feasible singleton limit is applied by native Routing');
    const restored = await model.restoreAssignment(answer, execution);
    assert(restored?.objectiveValue() === answer.objectiveValue(), 'A feasible limited assignment can be restored');
    time.setPickupToDeliveryLimitFunctionForPair(() => 0, pair);
    assert(await model.restoreAssignment(answer, execution) === null, 'Native schedule restoration rejects a newly infeasible pair limit');
    assert(await model.readAssignmentFromRoutes([[1, 2]], false, execution) === null, 'Route restoration also enforces the native limit');
    assert(await model.solveFromAssignmentWithParameters(answer, {}, execution) === null, 'Warm search cannot reuse a limit-violating schedule');
    assert(!(await model.solve({ ...execution, useCp: 'BOOL_FALSE', useCpSat: 'BOOL_TRUE' })).assignment,
      'Explicit CP-SAT conversion declines the unsupported pair-limit family');
    time.setPickupToDeliveryLimitFunctionForPair(() => 9007199254740993n, pair);
    assert((await model.solve(execution)).assignment, 'Exact int64 limits larger than safe numbers pass through the native table');
    const aborted = new AbortController(); aborted.abort();
    let rejected = false; try { await model.solve({ ...execution, signal: aborted.signal }); } catch { rejected = true; }
    assert(rejected && (await model.solve(execution)).assignment, 'Pre-aborted solves reject and the model remains reusable');
    return {};
  },
}, {
  id: 'routing.pairs.mixed_indices', name: 'Alternative and singleton pair indices remain consistent across multiple vehicles', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1074', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = new api.RoutingModel(new api.RoutingIndexManager(7, 2, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(1, 100, true, 'time');
    const alternative = model.addPickupAndDeliverySets(model.addDisjunction([1, 2]), model.addDisjunction([3, 4]));
    const singleton = model.addPickupAndDelivery(5, 6);
    assert(alternative === 0 && singleton === 1, 'Both pair families share native insertion order');
    for (const pickup of [1, 2]) for (const delivery of [3, 4]) {
      model.addConstraints(model.vehicleVar(pickup).eq(model.vehicleVar(delivery))
        .onlyEnforceIf(model.activeVar(pickup), model.activeVar(delivery)));
    }
    model.addConstraints(model.vehicleVar(5).eq(model.vehicleVar(6)));
    const time = model.getDimensionOrDie('time');
    time.setPickupToDeliveryLimitFunctionForPair((pickup, delivery) => pickup === delivery ? 1 : 2, alternative);
    time.setPickupToDeliveryLimitFunctionForPair(() => 1, singleton);
    const answer = (await model.solve({ ...execution, firstSolutionStrategy: api.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION })).assignment;
    assert(answer, 'Native search combines alternative and singleton shipments');
    const pickup = answer.value(model.activeVar(1)) ? 1 : 2, delivery = answer.value(model.activeVar(3)) ? 3 : 4;
    assert(answer.value(model.vehicleVar(pickup)) === answer.value(model.vehicleVar(delivery))
      && answer.value(model.vehicleVar(5)) === answer.value(model.vehicleVar(6)), 'Selected shipment nodes share a vehicle');
    assert(answer.value(time.cumulVar(delivery)) - answer.value(time.cumulVar(pickup)) <= (pickup - 1 === delivery - 3 ? 1n : 2n)
      && answer.value(time.cumulVar(6)) - answer.value(time.cumulVar(5)) === 1n, 'Each native pair uses its own correctly indexed limit table');
    return {};
  },
}];
