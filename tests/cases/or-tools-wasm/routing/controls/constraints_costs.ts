import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runConstraintsCosts({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const costManager = new api.RoutingIndexManager(3, 2, 0);
  const costModel = new api.RoutingModel(costManager);
  for (const unsupported of [undefined, null, {}, { type: 'unknown' }]) {
    let rejected = false;
    try { costModel.addConstraints(unsupported as never); }
    catch (error) { rejected = error instanceof Error && /unsupported constraint/i.test(error.message); }
    assert(rejected, `Unsupported solver constraints must be rejected (${mode})`);
  }
  const commonCost = costModel.registerTransitCallback(() => 7n);
  const firstCost = costModel.registerTransitCallback((from, to) =>
    from === costModel.start(0) ? 2n : to === costModel.end(0) ? 3n : 7n);
  const secondCost = costModel.registerTransitCallback((from, to) =>
    from === costModel.start(1) ? 5n : to === costModel.end(1) ? 11n : 13n);
  costModel.setArcCostEvaluatorOfAllVehicles(commonCost);
  costModel.setArcCostEvaluatorOfVehicle(firstCost, 0);
  costModel.setArcCostEvaluatorOfVehicle(secondCost, 1);
  const demands = costModel.registerUnaryTransitVector([0, 1, 1]);
  costModel.addDimensionWithVehicleCapacity(demands, 0, [1, 1], true, 'load');
  const costParameters = { firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC };
  const priced = await costModel.solveWithParameters(costParameters, { executor });
  assert(priced && priced.objectiveValue() === 21n, `Vehicle/index-specific native costs must total 21 (${mode})`);
  let routeCost = 0n;
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    let index = costModel.start(vehicle);
    for (let steps = 0; !costModel.isEnd(index); ++steps) {
      assert(steps < costManager.getNumberOfIndices(), 'Costed route must terminate');
      const next = priced.value(costModel.nextVar(index));
      routeCost += await costModel.getArcCostForVehicle(index, next, vehicle, { executor });
      index = next;
    }
  }
  assert(routeCost === priced.objectiveValue(), `Public arc costs must match native objective (${mode})`);
  assert(await costModel.getArcCostForVehicle(1, 1, 0, { executor }) === 0n, 'Self arcs cost zero');
  assert(await costModel.getArcCostForVehicle(1, 2, -1, { executor }) === 0n, 'Unassigned vehicles cost zero');
  assert(await costModel.getArcCostForVehicle(costModel.start(1), costModel.end(1), 1, { executor }) === 0n, 'Empty routes cost zero');
  const warm = await costModel.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(warm, 'Feasible route assignment must be restored natively');
  assert(warm.objectiveValue() === 21n, 'Route snapshots must use vehicle-specific costs');
  const warmed = await costModel.solveFromAssignmentWithParameters(warm, costParameters, { executor });
  assert(warmed && warmed.objectiveValue() === 21n, `Warm solves must retain vehicle costs (${mode})`);
  costModel.setArcCostEvaluatorOfAllVehicles(commonCost);
  const reset = await costModel.solveWithParameters(costParameters, { executor });
  assert(reset && reset.objectiveValue() === 28n, `All-vehicle setter must replace overrides (${mode})`);
  assert(priced.objectiveValue() === 21n, 'Prior assignment must retain its objective');
  results.push({ id: 'routing.correctness.constraints_vehicle_costs',
    name: 'Unsupported constraints fail and vehicle/index-specific costs reach native solves', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  const sharedManager = new api.RoutingIndexManager(4, 3, 0);
  const sharedModel = new api.RoutingModel(sharedManager);
  const defaultCost = sharedModel.registerTransitCallback(() => 7n);
  let sampledCost = 2n, samples = 0;
  const sharedCost = sharedModel.registerTransitCallback(() => { ++samples; return sampledCost; });
  sharedModel.setArcCostEvaluatorOfAllVehicles(defaultCost);
  for (let vehicle = 0; vehicle < 3; ++vehicle) sharedModel.setArcCostEvaluatorOfVehicle(sharedCost, vehicle);
  sharedModel.setArcCostEvaluatorOfVehicle(defaultCost, 2);
  sharedModel.addDimensionWithVehicleCapacity(sharedModel.registerUnaryTransitVector([0, 1, 1, 1]), 0, [1, 1, 1], true, 'load');
  const first = await sharedModel.solveWithParameters(costParameters, { executor });
  assert(first && first.objectiveValue() === 22n, 'Both vehicles sharing an evaluator receive its native costs');
  assert(samples === sharedManager.getNumberOfIndices() ** 2, 'One request samples the shared evaluator once');
  sampledCost = 3n; samples = 0;
  const second = await sharedModel.solveWithParameters(costParameters, { executor });
  assert(second && second.objectiveValue() === 26n && first.objectiveValue() === 22n, 'The next request resamples costs without changing the previous answer');
  assert(samples === sharedManager.getNumberOfIndices() ** 2, 'Each subsequent request still samples once');
  sharedModel.setArcCostEvaluatorOfAllVehicles(sharedCost); samples = 0;
  const resetShared = await sharedModel.solveWithParameters(costParameters, { executor });
  assert(resetShared && resetShared.objectiveValue() === 18n, 'All-vehicle setter replaces every grouped override');
  assert(samples === sharedManager.getNumberOfIndices() ** 2, 'The default evaluator is not redundantly sampled');
  results.push({ id: 'routing.correctness.shared_vehicle_evaluator', name: 'Shared vehicle evaluators are sampled and registered once per request', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['binding-contract', 'snapshot', 'model-correctness'], mode, ok: true as const });
  return results;
}
