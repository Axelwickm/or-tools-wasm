import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';
export async function runResources({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const create = (nodes = 3, vehicles = 2) => {
    const model = new api.RoutingModel(new api.RoutingIndexManager(nodes, vehicles, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(1, 100, false, 'time');
    return model;
  };
  const model = create(), group = model.addResourceGroup();
  const intervals: [bigint, bigint][] = [[0n, 0n]];
  assert(group.addResource({ startDomain: intervals, endDomain: [[2n, 2n]] }, 'time') === 0, 'Resource index zero');
  intervals[0][0] = 90n;
  group.addResource({ startDomain: [[10n, 10n]], endDomain: [[12n, 12n]] }, 'time');
  for (const vehicle of [0, 1]) { group.notifyVehicleRequiresAResource(vehicle); group.setAllowedResourcesForVehicle(vehicle, [vehicle]); }
  model.setAllowedVehiclesForIndex([0], 1); model.setAllowedVehiclesForIndex([1], 2);
  assert(group.size() === 2 && model.getResourceGroup(0) === group && model.getResourceGroups()[0] === group
    && model.getDimensionResourceGroupIndex('time') === 0 && model.getDimensionResourceGroupIndices('time').join(',') === '0', 'Registered group/dimension metadata');
  const assignment = await model.solveWithParameters({}, { executor });
  assert(assignment && assignment.resourceIndex(0, group) === 0 && assignment.resourceIndex(1, 0) === 1, 'Native vehicle resource assignment');
  const time = model.getDimensionOrDie('time');
  assert(assignment.min(time.cumulVar(model.start(0))) === 0n && assignment.min(time.cumulVar(model.end(0))) === 2n
    && assignment.min(time.cumulVar(model.start(1))) === 10n && assignment.min(time.cumulVar(model.end(1))) === 12n,
    'Resource attributes constrain native start/end cumuls and snapshot input intervals');
  const warm = await model.solveFromAssignmentWithParameters(assignment, {}, { executor });
  assert(warm?.resourceIndex(1, group) === 1, 'Resource assignment survives warm solves');
  const restored = await model.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(restored?.resourceIndex(0, group) === 0 && restored.resourceIndex(1, group) === 1, 'Restored routes assign resources natively');
  group.setAllowedResourcesForVehicle(1, [0]);
  assert(await model.solveWithParameters({}, { executor }) === null && assignment.resourceIndex(1, group) === 1,
    'At most one requiring vehicle per resource; prior assignments remain independent');
  group.clearAllowedResourcesForVehicle(1);
  assert(group.getResourcesMarkedAllowedForVehicle(1).length === 0 && group.isResourceAllowedForVehicle(1, 1)
    && (await model.solveWithParameters({}, { executor }))?.resourceIndex(1, group) === 1, 'Clearing eligibility restores all native resources');
  const unused = create(2, 2), unusedGroup = unused.addResourceGroup();
  unusedGroup.addResource({}, 'time');
  for (const vehicle of [0, 1]) unusedGroup.notifyVehicleRequiresAResource(vehicle);
  unused.setAllowedVehiclesForIndex([0], 1);
  const one = await unused.solveWithParameters({}, { executor });
  assert(one && one.resourceIndex(0, unusedGroup) === 0 && one.resourceIndex(1, unusedGroup) === -1,
    'Unused vehicles do not consume resources');
  unused.setVehicleUsedWhenEmpty(true, 1);
  assert(await unused.solveWithParameters({}, { executor }) === null, 'Considered empty routes require resources natively');
  const empty = create(2, 1), emptyGroup = empty.addResourceGroup();
  assert((await empty.solveWithParameters({}, { executor }))?.resourceIndex(0, emptyGroup) === -1, 'An unused empty resource group follows native semantics');
  emptyGroup.notifyVehicleRequiresAResource(0);
  assert(await empty.solveWithParameters({}, { executor }) === null, 'A requiring vehicle with no resources is infeasible');
  const exact = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  const base = 9007199254740993n;
  exact.addConstantDimension(1, base + 10n, false, 'time');
  const exactGroup = exact.addResourceGroup();
  exactGroup.addResource({ startDomain: [[base, base]], endDomain: [[base + 2n, base + 2n]] }, 'time'); exactGroup.notifyVehicleRequiresAResource(0);
  // Native LP scheduling uses doubles; explicitly select the native CP-only
  // scheduling path for exact resource bounds beyond 2^53.
  const exactAssignment = await exact.solveWithParameters({ disableSchedulingBewareThisMayDegradePerformance: true }, { executor });
  assert(exactAssignment && exactAssignment.min(exact.getDimensionOrDie('time').cumulVar(exact.start(0))) === base,
    'Resource bounds retain exact integers beyond Number safety');
  let foreignRejected = false;
  try { assignment.resourceIndex(0, unusedGroup); } catch { foreignRejected = true; }
  assert(foreignRejected, 'Foreign resource groups reject');
  const malformed = create(2, 1), malformedGroup = malformed.addResourceGroup();
  malformedGroup.addResource({ startDomain: [] }, 'time'); malformedGroup.notifyVehicleRequiresAResource(0);
  let invalidRejected = false;
  try { await malformed.solveWithParameters({}, { executor }); } catch { invalidRejected = true; }
  assert(invalidRejected, 'Empty attribute domains reject before native Domain::Min access');
  assert((await model.solveWithParameters({}, { executor }))?.resourceIndex(0, group) === 0, 'Resource error recovery');
  return [{ id: 'routing.resources.native_assignment', name: 'Native resource groups, eligibility, domains and assignment snapshots', solver: 'routing',
    source: 'ortools/constraint_solver/routing.h', tags: ['contract', 'resources'], mode, ok: true }];
}
