import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVehicleCosts({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(5, 2, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 10));
  model.addDimensionWithVehicleCapacity(model.registerUnaryTransitCallback(index => index === model.start(0) || index === model.start(1) ? 0 : 1), 0, [2, 2], true, 'load');
  const routes = [[1, 2], [3, 4]];
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    const path = [model.start(vehicle), ...routes[vehicle], model.end(vehicle)];
    for (let position = 0; position < path.length - 1; ++position) model.setNextValue(path[position], path[position + 1]);
  }
  assert(model.getMaximumNumberOfActiveVehicles() === 2 && model.getFixedCostOfVehicle(0) === 0n
    && model.getAmortizedLinearCostFactorOfVehicles().every(value => value === 0n)
    && model.getAmortizedQuadraticCostFactorOfVehicles().every(value => value === 0n)
    && !model.isVehicleUsedWhenEmpty(0), 'Vehicle configuration getters must report native defaults');
  model.setFixedCostOfVehicle(99, 0); model.setFixedCostOfAllVehicles(7); model.setFixedCostOfVehicle(11, 1);
  assert(model.getFixedCostOfVehicle(0) === 7n && model.getFixedCostOfVehicle(1) === 11n, 'Fixed settings replace prior per-vehicle/all-vehicle values');
  model.setMaximumNumberOfActiveVehicles(1);
  assert(await model.solveWithParameters({}, { executor }) === null, 'One active vehicle cannot satisfy two required fixed routes');
  model.setMaximumNumberOfActiveVehicles(2);
  for (const invalid of [() => model.setMaximumNumberOfActiveVehicles(-1), () => model.setMaximumNumberOfActiveVehicles(NaN),
    () => model.setMaximumNumberOfActiveVehicles(2 ** 31), () => model.setFixedCostOfAllVehicles(-1),
    () => model.setFixedCostOfVehicle(1, 2), () => model.setFixedCostOfVehicle(Number.MAX_SAFE_INTEGER + 1, 0),
    () => model.setAmortizedCostFactorsOfAllVehicles(1, -1), () => model.setAmortizedCostFactorsOfVehicle(1, 1, -1),
    () => model.setAmortizedCostFactorsOfAllVehicles((1n << 63n) - 1n, 1n),
    () => model.setVehicleUsedWhenEmpty(true, 2), () => model.setVehicleUsedWhenEmpty(1 as unknown as boolean, 0),
    () => model.getFixedCostOfVehicle(-1), () => model.isVehicleUsedWhenEmpty(2)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid vehicle settings must fail atomically');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>, objective: bigint) => {
    assert(assignment && assignment.objectiveValue() === objective, 'Native objective must include only configured nonempty-route fixed costs');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }), 78n);
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    const path = [model.start(vehicle), ...routes[vehicle], model.end(vehicle)];
    let arcTotal = 0n;
    for (let position = 0; position + 1 < path.length; ++position) {
      arcTotal += await model.getArcCostForVehicle(path[position], path[position + 1], vehicle, { executor });
    }
    assert(arcTotal === 30n + model.getFixedCostOfVehicle(vehicle), 'Arc inspection includes fixed costs on the first nonempty arc');
  }
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }), 78n);
  check(await model.readAssignmentFromRoutes(routes, false, { executor }), 78n);
  model.setMaximumNumberOfActiveVehicles(0);
  assert(await model.readAssignmentFromRoutes(routes, false, { executor }) === null && solution.objectiveValue() === 78n,
    'Restoration must honor active limits and preserve older assignment snapshots');
  model.setMaximumNumberOfActiveVehicles(5); model.setFixedCostOfAllVehicles(0);
  assert(model.getMaximumNumberOfActiveVehicles() === 5, 'A configured limit above fleet size remains valid and nonbinding');
  check(await model.solveWithParameters({}, { executor }), 60n);
  const optional = new api.RoutingModel(new api.RoutingIndexManager(2, 2, 0));
  optional.addDisjunction([1], 9); optional.setFixedCostOfAllVehicles(100); optional.setMaximumNumberOfActiveVehicles(0);
  const dropped = await optional.solveWithParameters({}, { executor });
  assert(dropped && dropped.objectiveValue() === 9n && dropped.value(optional.activeVar(1)) === 0,
    'A zero active limit may drop optional nodes without charging fixed vehicle costs');
  const preferred = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  preferred.setArcCostEvaluatorOfAllVehicles(preferred.registerTransitCallback(() => 1));
  preferred.setFixedCostOfVehicle(100, 0); preferred.setFixedCostOfVehicle(4, 1);
  const optimum = await preferred.solveWithParameters({}, { executor });
  assert(optimum && optimum.objectiveValue() === 7n && optimum.value(preferred.vehicleVar(1)) === 1
    && optimum.value(preferred.vehicleVar(2)) === 1, 'Native fixed costs must affect vehicle selection');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.vehicle_fixed_costs_limits', name: 'Fixed costs, active vehicle limits and native vehicle selection',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  const amortized = new api.RoutingModel(new api.RoutingIndexManager(4, 2, 0));
  amortized.setArcCostEvaluatorOfAllVehicles(amortized.registerTransitCallback(() => 10));
  const amortizedRoutes = [[1, 2], [3]];
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    const path = [amortized.start(vehicle), ...amortizedRoutes[vehicle], amortized.end(vehicle)];
    for (let position = 0; position < path.length - 1; ++position) amortized.setNextValue(path[position], path[position + 1]);
  }
  amortized.setFixedCostOfAllVehicles(3); amortized.setFixedCostOfVehicle(5, 1);
  amortized.setAmortizedCostFactorsOfVehicle(99, 1, 1); amortized.setAmortizedCostFactorsOfAllVehicles(20, 2);
  amortized.setAmortizedCostFactorsOfVehicle(10, 1, 1);
  const linear = amortized.getAmortizedLinearCostFactorOfVehicles(), quadratic = amortized.getAmortizedQuadraticCostFactorOfVehicles();
  assert(linear.join(',') === '20,10' && quadratic.join(',') === '2,1', 'Amortized getters must reflect per-vehicle overrides');
  linear[0] = 99n; quadratic.push(99n);
  assert(amortized.getAmortizedLinearCostFactorOfVehicles().join(',') === '20,10'
    && amortized.getAmortizedQuadraticCostFactorOfVehicles().join(',') === '2,1', 'Returned factor arrays must be independent snapshots');
  const amortizedCheck = (assignment: Awaited<ReturnType<typeof amortized.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 79n, 'Amortized objective must include arcs 50, fixed costs 8 and factors 20 - 2*4 + 10 - 1');
    return assignment;
  };
  const priced = amortizedCheck(await amortized.solveWithParameters({}, { executor }));
  amortizedCheck(await amortized.solveFromAssignmentWithParameters(priced, {}, { executor }));
  amortizedCheck(await amortized.readAssignmentFromRoutes(amortizedRoutes, false, { executor }));
  amortized.setAmortizedCostFactorsOfAllVehicles(0, 0);
  const reset = await amortized.solveWithParameters({}, { executor });
  assert(reset && reset.objectiveValue() === 58n && priced.objectiveValue() === 79n, 'Zero factors replace previous costs while prior objectives remain independent');
  const dense = new api.RoutingModel(new api.RoutingIndexManager(5, 2, 0));
  dense.setArcCostEvaluatorOfAllVehicles(dense.registerTransitCallback(() => 1)); dense.setAmortizedCostFactorsOfAllVehicles(30, 2);
  const density = await dense.solveWithParameters({}, { executor });
  assert(density && density.objectiveValue() === 3n, 'Native quadratic factor must reward concentrating four customers in one route');
  const exact = 9_007_199_254_741_003n;
  const large = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  large.setFixedCostOfVehicle(exact, 0);
  const fixedExact = await large.solveWithParameters({}, { executor });
  assert(fixedExact && fixedExact.objectiveValue() === exact && large.getFixedCostOfVehicle(0) === exact, 'Fixed costs preserve exact bigint objectives');
  large.setFixedCostOfVehicle(0, 0); large.setAmortizedCostFactorsOfVehicle(exact, 0, 0);
  const factorExact = await large.solveWithParameters({}, { executor });
  assert(factorExact && factorExact.objectiveValue() === exact, 'Amortized factors preserve exact bigint objectives');
  results.push({ id: 'routing.correctness.vehicle_amortized_costs', name: 'Native route density factors, replacement and exact bigint costs',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const empty = new api.RoutingModel(new api.RoutingIndexManager(1, 2, 0));
  empty.setArcCostEvaluatorOfAllVehicles(empty.registerTransitCallback(() => 5));
  empty.setFixedCostOfAllVehicles(100); empty.setAmortizedCostFactorsOfAllVehicles(7, 1); empty.setMaximumNumberOfActiveVehicles(0);
  const unused = await empty.solveWithParameters({}, { executor });
  assert(unused && unused.objectiveValue() === 0n, 'Empty routes have zero cost by default');
  empty.setVehicleUsedWhenEmpty(true, 0);
  const used = await empty.solveWithParameters({}, { executor });
  assert(used && used.objectiveValue() === 5n && empty.isVehicleUsedWhenEmpty(0) && !empty.isVehicleUsedWhenEmpty(1),
    'Counting an empty route charges its transit arc but no fixed/amortized cost and does not consume an active slot');
  assert(await empty.getArcCostForVehicle(empty.start(0), empty.end(0), 0, { executor }) === 5n
    && await empty.getArcCostForVehicle(empty.start(1), empty.end(1), 1, { executor }) === 0n,
    'Arc inspection honors each start vehicle empty-route usage flag without adding fixed costs');
  empty.setVehicleUsedWhenEmpty(true, 1);
  const both = await empty.readAssignmentFromRoutes([[], []], false, { executor });
  assert(both && both.objectiveValue() === 10n, 'Restored empty routes honor individual usage flags');
  empty.setVehicleUsedWhenEmpty(false, 0); empty.setVehicleUsedWhenEmpty(false, 1);
  const cleared = await empty.solveWithParameters({}, { executor });
  assert(cleared && cleared.objectiveValue() === 0n && used.objectiveValue() === 5n, 'Usage flags replace prior values without changing previous assignment snapshots');
  results.push({ id: 'routing.correctness.vehicle_empty_usage', name: 'Empty-route usage costs and distinction from active vehicles',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
