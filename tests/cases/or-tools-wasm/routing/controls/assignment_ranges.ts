import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runAssignmentRanges({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const rangeManager = new api.RoutingIndexManager(2, 1, 0);
  const rangeModel = new api.RoutingModel(rangeManager);
  const one = rangeModel.registerTransitCallback(() => 1n);
  rangeModel.setArcCostEvaluatorOfAllVehicles(one);
  rangeModel.addDimension(one, 5, 10, true, 'time');
  const rangeOptions = { executor, firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC };
  const restored = await rangeModel.readAssignmentFromRoutes([[1]], false, rangeOptions);
  assert(restored && restored.objectiveValue() === 2n, `Native route restoration must produce an assignment (${mode})`);
  const time = rangeModel.getDimensionOrDie('time');
  const customer = time.cumulVar(1), end = time.cumulVar(rangeModel.end(0));
  assert(restored.min(customer) === 1n && restored.max(customer) === 6n,
    `Native cumul interval must remain [1,6] rather than a single value (${mode})`);
  assert(restored.min(end) === 2n && restored.max(end) === 10n, 'End cumul range must be preserved');
  assert(restored.value(customer) === 1n && restored.min(rangeModel.nextVar(0)) === 1
    && restored.max(rangeModel.nextVar(0)) === 1, 'Bound route values and cumul value compatibility must remain');
  for (const routes of [[], [[]], [[1, 1]], [[rangeModel.start(0), 1]], [[rangeModel.end(0)]], [[1], []]]) {
    for (const ignoreInactive of [false, true]) {
      assert(await rangeModel.readAssignmentFromRoutes(routes, ignoreInactive, rangeOptions) === null,
        `Invalid routes must fail native restoration rather than report success (${mode})`);
      assert(rangeModel.status() !== api.RoutingSearchStatus.ROUTING_SUCCESS,
        'Rejected assignment must not leave a success status');
    }
  }
  const reusedRanges = await rangeModel.readAssignmentFromRoutes([[1]], false, rangeOptions);
  assert(reusedRanges && reusedRanges.max(customer) === 6n, 'Invalid route reads must not poison reuse');
  const optimized = await rangeModel.solveWithParameters({}, { executor });
  assert(optimized && optimized.max(customer) > optimized.min(customer), 'Normal solves must transport native cumul intervals too');
  assert(restored.max(end) === 10n && restored.objectiveValue() === 2n, 'Restored assignments must retain their own snapshot');

  const capacityModel = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  const transit = capacityModel.registerTransitCallback(() => 1n);
  capacityModel.setArcCostEvaluatorOfAllVehicles(transit);
  capacityModel.addDimension(transit, 0, 1, true, 'too-short');
  assert(await capacityModel.readAssignmentFromRoutes([[1]], false, { executor }) === null,
    'A complete route that exceeds dimension capacity must be rejected');
  const optionalModel = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  optionalModel.addDisjunction([1], 13n);
  const dropped = await optionalModel.readAssignmentFromRoutes([[]], false, { executor });
  assert(dropped && dropped.objectiveValue() === 13n && dropped.value(1) === 1,
    'Native restoration must account for optional nodes and their penalties');
  const routeModel = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  routeModel.setArcCostEvaluatorOfAllVehicles(routeModel.registerTransitCallback((from, to) =>
    (from === 0 && to === 1) || (from === 1 && to === 2) || (from === 2 && to === 3) ? 9n : 1n));
  const locked = await routeModel.readAssignmentFromRoutes([[1, 2]], false, { executor });
  assert(locked && locked.objectiveValue() === 27n && locked.value(0) === 1,
    'Reading an assignment must validate the submitted route without optimizing it');
  results.push({ id: 'routing.correctness.assignment_feasibility_ranges',
    name: 'Native route feasibility and cumul min/max intervals', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
