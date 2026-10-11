import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runResourceVariables({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
  model.addConstantDimension(1, 100, false, 'time');
  const groups = [model.addResourceGroup(), model.addResourceGroup()];
  for (const group of groups) {
    for (let resource = 0; resource < 3; ++resource) group.addResource({ startDomain: [[0, 0]], endDomain: [[2, 2]] }, 'time');
    for (const vehicle of [0, 1]) group.notifyVehicleRequiresAResource(vehicle);
  }
  model.setAllowedVehiclesForIndex([0], 1); model.setAllowedVehiclesForIndex([1], 2);
  const first = model.resourceVar(0, groups[0]), second = model.resourceVar(0, 1);
  const initial = await second.domain({ executor });
  assert(initial.min === -1n && initial.max === (1n << 63n) - 1n, 'Native resource bounds before model closure');
  first.setValues([0, 2]); first.removeValue(0);
  const restricted = await first.domain({ executor });
  assert(restricted.min === 2n && restricted.max === 2n && restricted.bound && restricted.size === 1n,
    'Resource domain operations reach native variables');
  assert(await first.contains(2, { executor }) && !await second.contains(-2, { executor }), 'Resource domain membership');
  second.setRange(0, 2); second.removeInterval(2, 2);
  model.addConstraints(first.sub(second).eq(1));
  model.addConstraints(model.resourceVar(1, 0).eq(0).onlyEnforceIf(model.activeVehicleVar(1).eq(1)));
  // A finalizer target is a hint; the native scheduler may bind resources first.
  model.addWeightedVariableTargetToFinalizer(model.resourceVar(1, groups[1]), 0, 2);
  const assignment = await model.solveWithParameters({}, { executor });
  assert(assignment && assignment.value(first) === 2 && assignment.min(first) === 2 && assignment.max(first) === 2
    && assignment.value(second) === 1 && assignment.value(model.resourceVar(1, 0)) === 0
    && [0, 2].includes(assignment.value(model.resourceVar(1, 1))), `Native resource expressions, conditions and finalizers preserve group identity: ${JSON.stringify(assignment ? groups.map(group => [0, 1].map(vehicle => assignment.value(model.resourceVar(vehicle, group)))) : null)}`);
  assert(assignment.value(second) === assignment.resourceIndex(0, groups[1]), 'Variable and convenience assignment reads agree');
  const warm = await model.solveFromAssignmentWithParameters(assignment, {}, { executor });
  const restored = await model.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(warm?.value(first) === 2 && restored?.value(second) === 1, 'Warm and restored assignments capture resource variables');
  second.setValue(0);
  assert(await model.solveWithParameters({}, { executor }) === null && assignment.value(second) === 1,
    'Native conflicting resource constraints are infeasible and old assignments remain independent');
  const foreign = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  const foreignGroup = foreign.addResourceGroup();
  for (const invalid of [() => model.resourceVar(0, foreignGroup), () => model.resourceVar(2, 0),
    () => model.resourceVar(0, 2), () => assignment.value(foreign.resourceVar(0, foreignGroup))]) {
    let rejected = false; try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid or foreign resource handles reject');
  }
  return [{ id: 'routing.resources.variable_handles', name: 'Native resource variable domains, expressions, finalizers and snapshots',
    solver: 'routing', source: 'ortools/constraint_solver/routing.h:ResourceVar', tags: ['contract', 'resources'], mode, ok: true }];
}
