import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runTransitVehicleVariables({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const options = { executor };
  const model = new api.RoutingModel(new api.RoutingIndexManager(2, 2, 0));
  model.addConstantDimensionWithSlack(3, 30, 4, true, 'time');
  const time = model.getDimensionOrDie('time');
  const transit = time.transitVar(model.start(0)), fixed = time.fixedTransitVar(model.start(0));
  transit.setRange(5, 7); transit.removeValue(6);
  const domain = await transit.domain(options);
  assert(domain.min === 5n && domain.max === 7n && domain.size === 2n && !await transit.contains(6, options),
    'Transit handles inspect native domains and remove holes');
  fixed.setValues([3, 5, 5]); fixed.removeInterval(4, 5);
  assert(await fixed.value(options) === 3n && await fixed.bound(options), 'Fixed transit handles restrict native travel values');
  const active = model.activeVehicleVar(0), empty = model.activeVehicleVar(1);
  assert(await active.min(options) === 0n && await active.max(options) === 1n && await active.size(options) === 2n,
    'Vehicle activity uses a native Boolean domain indexed by vehicle ID');
  active.removeValues([0]); empty.setValue(0);
  model.setNextValue(model.start(0), 1); model.setNextValue(1, model.end(0));
  model.setNextValue(model.start(1), model.end(1));
  model.addConstraints(transit.eq(fixed.add(time.slackVar(model.start(0)))), active.add(empty).eq(1));
  model.addVariableMinimizedByFinalizer(transit);
  model.addWeightedVariableTargetToFinalizer(time.transitVar(1), 7, 1);
  model.addVariableTargetToFinalizer(fixed, 3);
  model.addWeightedVariableMaximizedByFinalizer(active, 0);
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.value(time.cumulVar(1)) === 5n
      && assignment.value(time.cumulVar(model.end(0))) === 12n
      && assignment.value(model.nextVar(model.start(1))) === model.end(1),
      'Native transit finalizers choose waiting times while vehicle activity keeps the other route empty');
    assert(assignment.value(time.slackVar(model.start(0))) === 2n
      && assignment.min(time.slackVar(1)) === 4n && assignment.max(time.slackVar(1)) === 4n
      && assignment.value(transit) === 5n && assignment.min(transit) === 5n && assignment.max(transit) === 5n
      && assignment.value(fixed) === 3n && assignment.value(time.transitVar(1)) === 7n
      && assignment.value(active) === 1 && assignment.min(empty) === 0 && assignment.max(empty) === 0,
      'Assignments retain native waiting, transit and vehicle activity bounds');
    assert(assignment.value(model.vehicleRouteConsideredVar(0)) === 1
      && assignment.min(model.vehicleRouteConsideredVar(1)) === 0 && assignment.max(model.vehicleRouteConsideredVar(1)) === 0,
      'Native route consideration follows nonempty and unused empty routes on ordinary/warm/restored assignments');
    return assignment;
  };
  const assignment = check(await model.solveWithParameters({}, options));
  check(await model.solveFromAssignmentWithParameters(assignment, {}, options));
  check(await model.readAssignmentFromRoutes([[1], []], false, options));
  model.addConstraints(time.fixedTransitVar(1).ne(3));
  assert(await model.solveWithParameters({}, options) === null, 'Fixed transit comparisons reach native route feasibility');

  assert(assignment.value(transit) === 5n && assignment.value(active) === 1, 'Captured assignments survive later infeasible solves');

  const costed = new api.RoutingModel(new api.RoutingIndexManager(1, 1, 0));
  costed.setArcCostEvaluatorOfAllVehicles(costed.registerTransitCallback(() => 7));
  costed.setVehicleUsedWhenEmpty(true, 0);
  costed.addConstraints(costed.activeVehicleVar(0).eq(0));
  const considered = costed.vehicleRouteConsideredVar(0);
  assert(await considered.min(options) === 0n && await considered.max(options) === 1n,
    'Route consideration exposes its native construction domain');
  considered.setValues([1]);
  costed.addConstraints(considered.eq(costed.activeVehicleVar(0).add(1)));
  costed.addWeightedVariableTargetToFinalizer(considered, 1, 1);
  const costedAssignment = await costed.solveWithParameters({}, options);
  assert(costedAssignment && costedAssignment.objectiveValue() === 7n && costedAssignment.value(costed.activeVehicleVar(0)) === 0,
    'An empty route remains inactive even when native settings charge its arc cost');
  const checkCosted = (assignment: Awaited<ReturnType<typeof costed.solveWithParameters>>) => {
    assert(assignment && assignment.value(considered) === 1 && assignment.min(considered) === 1
      && assignment.max(considered) === 1 && assignment.value(costed.activeVehicleVar(0)) === 0,
      'A costed empty route is natively considered while remaining inactive');
    return assignment;
  };
  checkCosted(costedAssignment);
  checkCosted(await costed.solveFromAssignmentWithParameters(costedAssignment, {}, options));
  checkCosted(await costed.readAssignmentFromRoutes([[]], false, options));
  costed.addConstraints(considered.eq(0));
  assert(await costed.solveWithParameters({}, options) === null, 'Contradictory route consideration must reach native feasibility');
  checkCosted(costedAssignment);

  return [{ id: 'routing.correctness.transit_vehicle_variables', name: 'Native transit, fixed transit and vehicle activity handles',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];
}
