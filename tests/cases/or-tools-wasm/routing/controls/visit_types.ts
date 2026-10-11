import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVisitTypes({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const policies = api.VisitTypePolicy;
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
  model.setVisitType(1, 0, policies.TYPE_ADDED_TO_VEHICLE); model.setVisitType(2, 1, policies.TYPE_ADDED_TO_VEHICLE);
  const baseline = await model.solveWithParameters({}, { executor });
  assert(baseline && baseline.objectiveValue() === 3n && !model.hasHardTypeIncompatibilities(), 'Visit types alone do not split vehicles');
  model.addHardTypeIncompatibility(0, 1);
  const separated = await model.solveWithParameters({}, { executor });
  assert(separated && separated.objectiveValue() === 4n && separated.value(model.vehicleVar(1)) !== separated.value(model.vehicleVar(2)),
    'Hard incompatible types must use separate routes');
  assert((await model.solveFromAssignmentWithParameters(separated, {}, { executor }))?.objectiveValue() === 4n
    && (await model.readAssignmentFromRoutes([[1], [2]], false, { executor }))?.objectiveValue() === 4n,
    'Hard incompatibilities reach warm and restored routes');
  assert(await model.readAssignmentFromRoutes([[1, 2], []], false, { executor }) === null
    && baseline.objectiveValue() === 3n, 'Invalid restored routes are rejected while prior assignments remain independent');
  const optional = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  optional.setArcCostEvaluatorOfAllVehicles(optional.registerTransitCallback(() => 1));
  optional.setVisitType(1, 0, policies.TYPE_ADDED_TO_VEHICLE); optional.setVisitType(2, 1, policies.TYPE_ADDED_TO_VEHICLE);
  optional.addHardTypeIncompatibility(0, 1);
  assert(await optional.solveWithParameters({}, { executor }) === null, 'Mandatory incompatible types cannot fit one vehicle');
  optional.addDisjunction([2], 1);
  const dropped = await optional.solveWithParameters({}, { executor });
  assert(dropped && dropped.objectiveValue() === 3n && dropped.value(optional.activeVar(2)) === 0, 'Optional visits may be dropped to satisfy hard incompatibilities');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.hard_visit_types', name: 'Native hard type route separation, optional dropping and restoration',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  for (const policy of [policies.TYPE_ADDED_TO_VEHICLE, policies.ADDED_TYPE_REMOVED_FROM_VEHICLE,
    policies.TYPE_ON_VEHICLE_UP_TO_VISIT, policies.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED]) {
    const typed = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    typed.setArcCostEvaluatorOfAllVehicles(typed.registerTransitCallback(() => 1));
    typed.setVisitType(1, 0, policy); typed.setVisitType(2, 1, policies.TYPE_ADDED_TO_VEHICLE); typed.addHardTypeIncompatibility(0, 1);
    const assignment = await typed.solveWithParameters({}, { executor });
    assert(assignment && assignment.objectiveValue() === (policy === policies.ADDED_TYPE_REMOVED_FROM_VEHICLE ? 3n : 4n)
      && typed.getVisitTypePolicy(1) === policy, 'All four visit policies retain native occurrence semantics');
  }
  const self = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  self.setArcCostEvaluatorOfAllVehicles(self.registerTransitCallback(() => 1));
  self.setVisitType(1, 0, policies.TYPE_ADDED_TO_VEHICLE); self.setVisitType(2, 0, policies.TYPE_ADDED_TO_VEHICLE); self.addHardTypeIncompatibility(0, 0);
  assert((await self.solveWithParameters({}, { executor }))?.objectiveValue() === 4n, 'Self-incompatibility separates occurrences of the same type');
  const starts = new api.RoutingModel(new api.RoutingIndexManager(2, 2, 0));
  starts.setVisitType(starts.start(0), 0, policies.TYPE_ADDED_TO_VEHICLE); starts.setVisitType(1, 1, policies.TYPE_ADDED_TO_VEHICLE);
  starts.addHardTypeIncompatibility(0, 1);
  const anchored = await starts.solveWithParameters({}, { executor });
  assert(anchored && anchored.value(starts.vehicleVar(1)) === 1, 'Start-node visit types participate in route constraints');
  results.push({ id: 'routing.correctness.visit_type_policies', name: 'Native visit-policy forwarding, self-incompatibility and typed starts',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const metadata = new api.RoutingModel(new api.RoutingIndexManager(6, 1, 0));
  assert(metadata.getNumberOfVisitTypes() === 0 && metadata.getVisitType(1) === -1
    && metadata.getVisitTypePolicy(1) === policies.TYPE_ADDED_TO_VEHICLE, 'Untyped native defaults');
  metadata.addPickupAndDelivery(3, 4); metadata.addPickupAndDelivery(1, 2);
  for (const index of [1, 2, 3, 4, 5]) metadata.setVisitType(index, 2, index === 2 || index === 4
    ? policies.ADDED_TYPE_REMOVED_FROM_VEHICLE : policies.TYPE_ADDED_TO_VEHICLE);
  metadata.setVisitType(0, 3, policies.TYPE_ON_VEHICLE_UP_TO_VISIT);
  assert(metadata.getNumberOfVisitTypes() === 4 && metadata.getSingleNodesOfType(2).join(',') === '5'
    && metadata.getSingleNodesOfType(3).join(',') === '0' && metadata.getPairIndicesOfType(2).join(',') === '1,0'
    && metadata.getSingleNodesOfType(0).length === 0, 'Type count includes sparse IDs; singleton/pair order follows native node scanning');
  metadata.getSingleNodesOfType(2).push(99); metadata.getPairIndicesOfType(2).reverse();
  assert(metadata.getSingleNodesOfType(2).join(',') === '5' && metadata.getPairIndicesOfType(2).join(',') === '1,0', 'Returned type lists are independent snapshots');
  metadata.setVisitType(5, 4, policies.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED);
  metadata.setVisitType(5, -1, policies.ADDED_TYPE_REMOVED_FROM_VEHICLE);
  assert(metadata.getNumberOfVisitTypes() === 5 && metadata.getVisitType(5) === -1 && metadata.getSingleNodesOfType(4).length === 0
    && metadata.getVisitTypePolicy(5) === policies.ADDED_TYPE_REMOVED_FROM_VEHICLE, 'Clearing/replacement preserves the native highest-type count and configured policy');
  metadata.addHardTypeIncompatibility(2, 3); metadata.addHardTypeIncompatibility(3, 2); metadata.addHardTypeIncompatibility(2, 2);
  metadata.getHardTypeIncompatibilitiesOfType(2).push(99);
  assert(metadata.getHardTypeIncompatibilitiesOfType(2).join(',') === '2,3' && metadata.getHardTypeIncompatibilitiesOfType(3).join(',') === '2'
    && metadata.getHardTypeIncompatibilitiesOfType(0).length === 0 && metadata.hasHardTypeIncompatibilities(), 'Hard incompatibilities are symmetric, deduplicated snapshots');
  for (const invalid of [() => metadata.setVisitType(metadata.end(0), 0, policies.TYPE_ADDED_TO_VEHICLE),
    () => metadata.setVisitType(-1, 0, policies.TYPE_ADDED_TO_VEHICLE), () => metadata.setVisitType(1, -2, policies.TYPE_ADDED_TO_VEHICLE),
    () => metadata.setVisitType(1, 2147483647, policies.TYPE_ADDED_TO_VEHICLE), () => metadata.setVisitType(1, NaN, policies.TYPE_ADDED_TO_VEHICLE),
    () => metadata.setVisitType(1, 0, 4 as Parameters<typeof metadata.setVisitType>[2]),
    () => metadata.addHardTypeIncompatibility(0, 5), () => metadata.addHardTypeIncompatibility(-1, 0),
    () => metadata.getSingleNodesOfType(5), () => metadata.getPairIndicesOfType(-1), () => metadata.getVisitType(99),
    () => metadata.getHardTypeIncompatibilitiesOfType(NaN)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid visit types/policies/indices reject before mutation or native access');
  }
  assert(metadata.getVisitType(1) === 2 && metadata.getVisitTypePolicy(1) === policies.TYPE_ADDED_TO_VEHICLE
    && metadata.getNumberOfVisitTypes() === 5 && metadata.getHardTypeIncompatibilitiesOfType(0).length === 0, 'Rejected operations preserve prior configuration');
  results.push({ id: 'routing.contract.visit_type_inspection', name: 'Native visit metadata defaults, replacement, pair membership and invalid-input recovery',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
