import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runSoftCumulBounds({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  const transit = model.registerTransitCallback(() => 4);
  model.setArcCostEvaluatorOfAllVehicles(transit);
  model.addDimension(transit, 0, 30, true, 'time');
  model.setNextValue(model.start(0), 1); model.setNextValue(1, 2); model.setNextValue(2, model.end(0));
  const time = model.getDimensionOrDie('time');
  assert(!time.hasCumulVarSoftUpperBound(1) && !time.hasCumulVarSoftLowerBound(1)
    && await time.getCumulVarSoftUpperBound(1, { executor }) === 30n && await time.getCumulVarSoftLowerBound(1, { executor }) === 0n
    && await time.getCumulVarSoftUpperBound(model.start(0), { executor }) === 0n
    && time.getCumulVarSoftUpperBoundCoefficient(1) === 0n && time.getCumulVarSoftLowerBoundCoefficient(1) === 0n,
    'Unset soft bounds must expose configured hard bounds and zero coefficients');
  time.setCumulVarRange(1, 2, 20);
  assert(await time.getCumulVarSoftUpperBound(1, { executor }) === 20n && await time.getCumulVarSoftLowerBound(1, { executor }) === 2n,
    'Unset bound defaults must track explicit hard-bound intersections');
  assert(time.getSpanUpperBoundForVehicle(0) === (1n << 63n) - 1n
    && time.getSpanCostCoefficientForVehicle(0) === 0n && time.getSlackCostCoefficientForVehicle(0) === 0n
    && time.globalSpanCostCoefficient() === 0n, 'Dimension cost/limit getters must expose native defaults');
  time.setCumulVarSoftUpperBound(2, 99, 99);
  model.getDimensionOrDie('time').setCumulVarSoftUpperBound(2, 5, 3);
  time.setCumulVarSoftLowerBound(1, 7, 2);
  time.setCumulVarSoftUpperBound(model.end(0), 10, 5);
  time.setCumulVarSoftLowerBound(model.start(0), -5, 2);
  assert(time.hasCumulVarSoftUpperBound(2) && await time.getCumulVarSoftUpperBound(2, { executor }) === 5n
    && time.getCumulVarSoftUpperBoundCoefficient(2) === 3n && await time.getCumulVarSoftLowerBound(1, { executor }) === 7n
    && time.getCumulVarSoftLowerBoundCoefficient(1) === 2n, 'Soft settings replace prior values and persist across dimension handles');
  for (const invalid of [() => time.setCumulVarSoftUpperBound(-1, 4, 1),
    () => time.setCumulVarSoftLowerBound(model.end(0) + 1, 4, 1), () => time.setCumulVarSoftUpperBound(2, 4, -1),
    () => time.setCumulVarSoftLowerBound(1, NaN, 2), () => time.setCumulVarSoftUpperBound(2, 1n << 63n, 2),
    () => time.setCumulVarSoftLowerBound(1, 4, Number.MAX_SAFE_INTEGER + 1), () => time.hasCumulVarSoftUpperBound(NaN),
    () => time.getCumulVarSoftLowerBoundCoefficient(-1), () => time.getSpanUpperBoundForVehicle(1),
    () => time.getSpanCostCoefficientForVehicle(-1), () => time.getSlackCostCoefficientForVehicle(NaN),
    () => time.setSoftSpanUpperBoundForVehicle(new api.BoundCost(10, -1), 0),
    () => time.setQuadraticCostSoftSpanUpperBoundForVehicle(new api.BoundCost(10, 1), 1)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Malformed soft-bound inputs must be rejected atomically');
  }
  assert(!time.hasSoftSpanUpperBounds() && !time.hasQuadraticCostSoftSpanUpperBounds(), 'Rejected span settings must not change metadata');
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>, objective: bigint) => {
    assert(assignment && assignment.objectiveValue() === objective && assignment.value(time.cumulVar(1)) === 4n
      && assignment.value(time.cumulVar(2)) === 8n && assignment.value(time.cumulVar(model.end(0))) === 12n,
      'Native objective must include exact early/late penalties without imposing hard feasibility bounds');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }), 37n);
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }), 37n);
  check(await model.readAssignmentFromRoutes([[1, 2]], false, { executor }), 37n);
  const bound = new api.BoundCost(10, 2);
  time.setSoftSpanUpperBoundForVehicle(bound, 0);
  Reflect.set(bound, 'cost', 99n);
  Reflect.set(time.getSoftSpanUpperBoundForVehicle(0), 'bound', 0n);
  assert(time.getSoftSpanUpperBoundForVehicle(0).bound === 10n
    && time.getSoftSpanUpperBoundForVehicle(0).cost === 2n, 'Caller/getter mutation must not change recorded span bounds');
  time.setQuadraticCostSoftSpanUpperBoundForVehicle(new api.BoundCost(9, 1), 0);
  check(await model.solveWithParameters({}, { executor }), 50n);
  assert(solution.objectiveValue() === 37n, 'Prior assignment objectives must remain independent');
  time.setCumulVarSoftUpperBound(2, 5, 0); time.setCumulVarSoftLowerBound(1, 7, 0);
  time.setCumulVarSoftUpperBound(model.end(0), 10, 0);
  time.setSoftSpanUpperBoundForVehicle(new api.BoundCost(10, 0), 0);
  time.setQuadraticCostSoftSpanUpperBoundForVehicle(new api.BoundCost(9, 0), 0);
  check(await model.solveWithParameters({}, { executor }), 12n);
  assert(time.hasCumulVarSoftUpperBound(2) && time.getCumulVarSoftUpperBoundCoefficient(2) === 0n,
    'Zero coefficient disables costs while retaining configured-bound presence');

  const configured = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  configured.addDimensionWithVehicleCapacity(configured.registerTransitCallback(() => 0), 0, [10, 20], true, 'capacity');
  const capacity = configured.getDimensionOrDie('capacity');
  assert(await capacity.getCumulVarSoftUpperBound(1, { executor }) === 20n && await capacity.getCumulVarSoftUpperBound(configured.end(0), { executor }) === 10n
    && await capacity.getCumulVarSoftUpperBound(configured.end(1), { executor }) === 20n, 'Unset soft bounds honor per-vehicle terminal capacities');
  capacity.setSpanCostCoefficientForAllVehicles(3); capacity.setSpanCostCoefficientForVehicle(7, 1);
  capacity.setSlackCostCoefficientForAllVehicles(2); capacity.setSpanUpperBoundForVehicle(9, 0); capacity.setGlobalSpanCostCoefficient(4);
  const another = configured.getDimensionOrDie('capacity');
  assert(another.getSpanCostCoefficientForVehicle(0) === 3n && another.getSpanCostCoefficientForVehicle(1) === 7n
    && another.getSlackCostCoefficientForVehicle(1) === 2n && another.getSpanUpperBoundForVehicle(0) === 9n
    && another.globalSpanCostCoefficient() === 4n, 'Cost/limit getters report last per-vehicle/all-vehicle configuration');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.soft_cumul_bounds', name: 'Soft early/late penalties, configuration inspection and validated span bounds',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  const optimized = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  const callback = optimized.registerTransitCallback(() => 4);
  optimized.setArcCostEvaluatorOfAllVehicles(callback); optimized.addDimension(callback, 10, 30, true, 'time');
  optimized.setNextValue(0, 1); optimized.setNextValue(1, 2); optimized.setNextValue(2, optimized.end(0));
  const schedule = optimized.getDimensionOrDie('time');
  schedule.setCumulVarSoftLowerBound(1, 7, 2); schedule.setCumulVarSoftUpperBound(2, 8, 1);
  const optimum = await optimized.solveWithParameters({}, { executor });
  assert(optimum && optimum.objectiveValue() === 15n && optimum.value(schedule.cumulVar(1)) === 7n
    && optimum.value(schedule.cumulVar(2)) === 11n, 'Native optimizer must trade waiting against early/late penalties');
  const optional = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  const optionalCallback = optional.registerTransitCallback(() => 4);
  optional.setArcCostEvaluatorOfAllVehicles(optionalCallback); optional.addDimension(optionalCallback, 0, 30, true, 'time');
  optional.addDisjunction([1], 2);
  const optionalTime = optional.getDimensionOrDie('time');
  optionalTime.setCumulVarSoftUpperBound(1, 0, 10); optionalTime.setCumulVarSoftLowerBound(1, 7, 2);
  const dropped = await optional.solveWithParameters({}, { executor });
  assert(dropped && dropped.objectiveValue() === 10n && dropped.value(optional.activeVar(1)) === 0,
    'Soft cumul penalties must not charge dropped optional nodes');
  const exact = 9_007_199_254_741_003n;
  const large = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  large.addDimension(large.registerTransitCallback(() => 0), 0, 1, true, 'time');
  const largeTime = large.getDimensionOrDie('time');
  largeTime.setCumulVarSoftUpperBound(1, -1, exact);
  const priced = await large.solveWithParameters({}, { executor });
  assert(priced && priced.objectiveValue() === exact && largeTime.getCumulVarSoftUpperBoundCoefficient(1) === exact,
    'Signed soft bounds and bigint coefficients must remain exact');
  results.push({ id: 'routing.correctness.soft_cumul_optimization', name: 'Native early/late tradeoffs, dropped nodes and exact bigint penalties',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  const partial = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  partial.addConstantDimension(1, 10, true, 'time');
  const partialTime = partial.getDimensionOrDie('time');
  for (const getter of [() => partialTime.getSoftSpanUpperBoundForVehicle(0),
    () => partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(1)]) {
    let rejected = false; try { getter(); } catch { rejected = true; }
    assert(rejected, 'An entirely unconfigured soft-span family must not fabricate a bound');
  }
  partialTime.setSoftSpanUpperBoundForVehicle(new api.BoundCost(1, 3), 0);
  assert(partialTime.hasSoftSpanUpperBounds() && !partialTime.hasQuadraticCostSoftSpanUpperBounds(),
    'Ordinary and quadratic bound families have independent configuration state');
  const unset = partialTime.getSoftSpanUpperBoundForVehicle(1);
  assert(unset.bound === (1n << 63n) - 1n && unset.cost === 0n,
    'Untouched vehicles in a configured family have the native INT64_MAX/zero default');
  const first = await partial.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(first && first.objectiveValue() === 3n, 'An untouched vehicle adds no ordinary span penalty');
  partialTime.setQuadraticCostSoftSpanUpperBoundForVehicle(new api.BoundCost(1, 5), 1);
  const quadraticDefault = partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(0);
  assert(quadraticDefault.bound === (1n << 63n) - 1n && quadraticDefault.cost === 0n,
    'Quadratic defaults match the native partially configured fleet');
  const both = await partial.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(both && both.objectiveValue() === 8n && first.objectiveValue() === 3n,
    'Each configured family charges only its selected vehicle and retains prior assignment snapshots');
  Reflect.set(unset, 'bound', 0n);
  assert(partialTime.getSoftSpanUpperBoundForVehicle(1).bound === (1n << 63n) - 1n,
    'Changing returned defaults cannot change model configuration');
  results.push({ id: 'routing.correctness.soft_span_defaults', name: 'Absent and partially configured ordinary/quadratic soft-span bounds',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
