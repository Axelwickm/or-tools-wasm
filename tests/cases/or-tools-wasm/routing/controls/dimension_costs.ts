import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runDimensionCosts({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const manager = new api.RoutingIndexManager(4, 2, 0);
  const model = new api.RoutingModel(manager);
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 4));
  model.addDimension(model.registerTransitCallback(() => 1), 10, 30, true, 'time');
  const time = model.getDimensionOrDie('time');
  const routes = [[1], [2, 3]], waiting = [[2, 3], [1, 2, 0]];
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    const path = [model.start(vehicle), ...routes[vehicle], model.end(vehicle)];
    for (let position = 0; position < path.length - 1; ++position) {
      model.setNextValue(path[position], path[position + 1]);
      time.slackVar(path[position]).setRange(waiting[vehicle][position], waiting[vehicle][position]);
    }
  }
  time.setSpanUpperBoundForVehicle(6, 0);
  time.setSpanUpperBoundForVehicle(7, 0);
  time.setSpanUpperBoundForVehicle(6, 1);
  time.setSpanCostCoefficientForVehicle(99, 0);
  time.setSpanCostCoefficientForAllVehicles(2);
  time.setSpanCostCoefficientForVehicle(5, 1);
  time.setSlackCostCoefficientForVehicle(88, 1);
  time.setSlackCostCoefficientForAllVehicles(3);
  time.setSlackCostCoefficientForVehicle(7, 0);
  time.setGlobalSpanCostCoefficient(99);
  time.setGlobalSpanCostCoefficient(11);
  for (const invalid of [() => time.setSpanUpperBoundForVehicle(-1, 0),
    () => time.setSpanUpperBoundForVehicle(10, 2), () => time.setSpanCostCoefficientForVehicle(2, -1),
    () => time.setSlackCostCoefficientForVehicle(2, NaN), () => time.setSpanCostCoefficientForAllVehicles(-1),
    () => time.setSlackCostCoefficientForAllVehicles(NaN), () => time.setGlobalSpanCostCoefficient(Number.MAX_SAFE_INTEGER + 1)]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid dimension settings must leave previously recorded costs and limits intact');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 185n,
      'Objective must include arc costs 20, vehicle spans 44, vehicle slack 44 and global span 77');
    assert(assignment.value(time.cumulVar(model.end(0))) === 7n && assignment.value(time.cumulVar(model.end(1))) === 6n,
      'Vehicle span limits must permit the exact fixed waiting schedules');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }));
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    const path = [model.start(vehicle), ...routes[vehicle], model.end(vehicle)];
    for (let position = 0; position < path.length - 1; ++position) {
      assert(await model.getArcCostForVehicle(path[position], path[position + 1], vehicle, { executor }) === (vehicle === 0 ? 6n : 9n),
        'Arc inspection includes vehicle span transit costs but excludes waiting/global-span penalties');
    }
  }
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }));
  check(await model.readAssignmentFromRoutes(routes, false, { executor }));
  time.setSpanUpperBoundForVehicle(6, 0);
  assert(await model.solveWithParameters({}, { executor }) === null, 'A shorter span limit must make the fixed route infeasible');
  time.setSpanUpperBoundForVehicle(7, 0);
  time.setSpanCostCoefficientForAllVehicles(0);
  time.setSlackCostCoefficientForAllVehicles(0);
  time.setGlobalSpanCostCoefficient(0);
  const reset = await model.solveWithParameters({}, { executor });
  assert(reset && reset.objectiveValue() === 20n && solution.objectiveValue() === 185n,
    'Later native settings replace earlier costs/limits while prior assignments remain independent');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.dimension_costs_limits', name: 'Vehicle/global span costs, waiting costs and route-span limits',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  const exact = 9_007_199_254_741_003n;
  const largeManager = new api.RoutingIndexManager(2, 1, 0);
  const large = new api.RoutingModel(largeManager);
  large.addDimension(large.registerUnaryTransitCallback(index => largeManager.indexToNode(index) === 1 ? 1 : 0), 0, 1, true, 'distance');
  large.getDimensionOrDie('distance').setSpanCostCoefficientForVehicle(exact, 0);
  const priced = await large.solveWithParameters({}, { executor });
  assert(await large.getArcCostForVehicle(1, large.end(0), 0, { executor }) === exact, 'Arc inspection preserves exact int64 dimension transit costs');
  assert(priced && priced.objectiveValue() === exact, 'Native span coefficients must preserve exact int64 objective costs');
  results.push({ id: 'routing.correctness.dimension_exact_costs', name: 'Exact int64 dimension objective coefficients',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
