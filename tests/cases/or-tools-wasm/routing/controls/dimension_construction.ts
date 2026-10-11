import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runDimensionConstruction({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const manager = new api.RoutingIndexManager(3, 2, 1);
  const model = new api.RoutingModel(manager);
  const evaluators = [model.registerTransitCallback(from => from === model.start(0) ? 3 : 1),
    model.registerTransitCallback(from => from === model.start(1) ? 5 : 2)];
  const capacities = [4n, 7n];
  for (const invalid of [() => model.addDimensionWithVehicleTransitAndCapacity([], 0, capacities, true, 'fleet'),
    () => model.addDimensionWithVehicleTransitAndCapacity(evaluators, 0, [4], true, 'fleet'),
    () => model.addDimensionWithVehicleTransitAndCapacity(evaluators, -1, capacities, true, 'fleet'),
    () => model.addDimensionWithVehicleTransitAndCapacity(evaluators, 0, [4, -1], true, 'fleet'),
    () => model.addDimensionWithVehicleTransitAndCapacity([evaluators[0], 99], 0, capacities, true, 'fleet'),
    () => model.addDimensionWithVehicleTransitAndCapacity(new Array(2), 0, capacities, true, 'fleet')]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected && !model.hasDimension('fleet'), 'Invalid construction must not reserve the dimension name');
  }
  assert(model.addDimensionWithVehicleTransitAndCapacity(evaluators, 0, capacities, true, 'fleet'), 'Combined dimension must be created');
  evaluators.fill(99); capacities.fill(99n);
  assert(!model.addDimensionWithVehicleTransitAndCapacity([], 0, [], true, 'fleet'), 'Duplicate names do not replace existing dimensions');
  model.vehicleVar(manager.nodeToIndex(0)).setValue(0); model.vehicleVar(manager.nodeToIndex(2)).setValue(1);
  const dimension = model.getDimensionOrDie('fleet');
  assert(await dimension.getCumulVarSoftUpperBound(model.end(0), { executor }) === 4n && await dimension.getCumulVarSoftUpperBound(model.end(1), { executor }) === 7n,
    'Configured vehicle cumul bounds preserve copied capacities');
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment, 'Different vehicle evaluators/capacities must allow the selected routes');
    for (let vehicle = 0; vehicle < 2; ++vehicle) assert(assignment.value(dimension.cumulVar(model.end(vehicle))) === (vehicle === 0 ? 4n : 7n),
      'Native cumul transits must use routing indices, including duplicate nonzero depots');
    return assignment;
  };
  const solved = check(await model.solveWithParameters({}, { executor }));
  check(await model.solveFromAssignmentWithParameters(solved, {}, { executor }));
  check(await model.readAssignmentFromRoutes([[manager.nodeToIndex(0)], [manager.nodeToIndex(2)]], false, { executor }));
  results.push({ id: 'routing.correctness.vehicle_transit_capacity_dimension', name: 'Combined per-vehicle evaluator/capacity construction and route restoration',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const waiting = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  for (const invalid of [() => waiting.addConstantDimensionWithSlack(1, -1, 5, true, 'wait'),
    () => waiting.addConstantDimensionWithSlack(1, 10, -1, true, 'wait'),
    () => waiting.addConstantDimensionWithSlack(Number.MAX_SAFE_INTEGER + 1, 10, 5, true, 'wait'),
    () => waiting.addConstantDimensionWithSlack(1, 10, 5, 1 as unknown as boolean, 'wait'),
    () => waiting.addConstantDimensionWithSlack(1, 10, 5, true, 'bad\0name')]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected && !waiting.hasDimension('wait'), 'Invalid constant dimensions reject atomically');
  }
  const [constant, added] = waiting.addConstantDimensionWithSlack(1, 10, 5, true, 'wait');
  assert(added && constant === 1, 'Rejected creation cannot consume evaluator IDs');
  waiting.setArcCostEvaluatorOfAllVehicles(constant);
  const time = waiting.getDimensionOrDie('wait'); time.cumulVar(1).setRange(6, 6); time.setGlobalSpanCostCoefficient(1);
  const [duplicate, duplicateAdded] = waiting.addConstantDimensionWithSlack(9, 10, 0, true, 'wait');
  assert(!duplicateAdded && duplicate === constant + 1, 'Native duplicate creation still returns a reusable evaluator');
  assert(waiting.addDimension(duplicate, 0, 100, true, 'reused'), 'Duplicate-call evaluator remains reusable');
  const checkWaiting = (assignment: Awaited<ReturnType<typeof waiting.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 9n && assignment.value(time.cumulVar(waiting.end(0))) === 7n,
      'Native constant dimension permits waiting and charges its actual span');
    assert(assignment.value(waiting.getDimensionOrDie('reused').cumulVar(waiting.end(0))) === 18n, 'Returned duplicate evaluator retains its own transit value');
    return assignment;
  };
  const waited = checkWaiting(await waiting.solveWithParameters({}, { executor }));
  checkWaiting(await waiting.solveFromAssignmentWithParameters(waited, {}, { executor }));
  checkWaiting(await waiting.readAssignmentFromRoutes([[1]], false, { executor }));
  const exact = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  exact.addConstantDimensionWithSlack(0, 9007199254740993n, 9007199254740993n, true, 'exact');
  exact.getDimensionOrDie('exact').cumulVar(1).setRange(9007199254740993n, 9007199254740993n);
  const precise = await exact.solveWithParameters({}, { executor });
  assert(precise && precise.value(exact.getDimensionOrDie('exact').cumulVar(1)) === 9007199254740993n, 'Constant waiting preserves exact int64 values');
  results.push({ id: 'routing.correctness.constant_dimension_slack', name: 'Constant transit waiting, exact values and reusable duplicate evaluator',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const names = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  assert(names.getDimensions().length === 0 && names.getAllDimensionNames().length === 0 && !names.hasDimension('missing'), 'Empty dimension metadata');
  for (const name of ['z', 'a', '𐀀', '\uE000']) names.addConstantDimension(1, 10, true, name);
  const creationOrder = names.getDimensions().map(item => item.cumulVar(names.start(0)).dimensionName);
  assert(creationOrder.join(',') === 'z,a,𐀀,\uE000' && names.getAllDimensionNames().join(',') === 'a,z,\uE000,𐀀', 'Dimension names use native UTF-8 sorting; handles retain creation order');
  names.getDimensions()[0].setGlobalSpanCostCoefficient(3);
  assert(names.getDimensionOrDie('z').globalSpanCostCoefficient() === 3n, 'Listed dimensions share model state');
  names.getAllDimensionNames().push('fake'); names.getDimensions().splice(0, 1);
  assert(names.getDimensions().length === 4 && names.hasDimension('z') && !names.hasDimension('fake'), 'Metadata lists are independent snapshots');
  const listed = await names.solveWithParameters({}, { executor });
  assert(listed && listed.objectiveValue() === 6n, 'Listed dimension handles affect native objective');
  results.push({ id: 'routing.contract.dimension_inspection', name: 'Native dimension metadata ordering and shared handle state',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
