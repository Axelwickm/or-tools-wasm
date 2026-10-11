import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runTemporalTypes({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const policies = api.VisitTypePolicy;
  const sequential = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  sequential.setArcCostEvaluatorOfAllVehicles(sequential.registerTransitCallback(() => 1));
  sequential.setVisitType(1, 0, policies.TYPE_ADDED_TO_VEHICLE);
  sequential.setVisitType(2, 0, policies.ADDED_TYPE_REMOVED_FROM_VEHICLE);
  sequential.setVisitType(3, 1, policies.TYPE_ADDED_TO_VEHICLE);
  sequential.addTemporalTypeIncompatibility(0, 1);
  const assignment = await sequential.solveWithParameters({}, { executor });
  assert(assignment && assignment.objectiveValue() === 4n, 'Optimizer finds a route without temporal overlap');
  assert((await sequential.solveFromAssignmentWithParameters(assignment, {}, { executor }))?.objectiveValue() === 4n
    && (await sequential.readAssignmentFromRoutes([[1, 2, 3]], false, { executor }))?.objectiveValue() === 4n,
    'Removal allows later incompatible addition in normal, warm and restored routes');
  assert(await sequential.readAssignmentFromRoutes([[1, 3, 2]], false, { executor }) === null,
    'Incompatible types cannot overlap before removal');
  sequential.addHardTypeIncompatibility(0, 1);
  assert(await sequential.solveWithParameters({}, { executor }) === null, 'Hard incompatibility still forbids sharing after removal');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.temporal_visit_types', name: 'Temporal overlap and removal across normal, warm and restored routes',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  for (const policy of [policies.TYPE_ADDED_TO_VEHICLE, policies.ADDED_TYPE_REMOVED_FROM_VEHICLE,
    policies.TYPE_ON_VEHICLE_UP_TO_VISIT, policies.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED]) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    model.setVisitType(1, 0, policy); model.setVisitType(2, 1, policies.TYPE_ADDED_TO_VEHICLE);
    model.addTemporalTypeIncompatibility(0, 1);
    const before = await model.readAssignmentFromRoutes([[1, 2]], false, { executor });
    const after = await model.readAssignmentFromRoutes([[2, 1]], false, { executor });
    assert(Boolean(before) === (policy !== policies.TYPE_ADDED_TO_VEHICLE)
      && Boolean(after) === (policy === policies.ADDED_TYPE_REMOVED_FROM_VEHICLE),
      'Temporal rules honor all four policies and the presence of up-to-visit types from route start');
  }
  const self = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  self.setVisitType(1, 0, policies.TYPE_ADDED_TO_VEHICLE); self.setVisitType(2, 0, policies.ADDED_TYPE_REMOVED_FROM_VEHICLE);
  self.setVisitType(3, 0, policies.TYPE_ADDED_TO_VEHICLE); self.addTemporalTypeIncompatibility(0, 0);
  assert(await self.readAssignmentFromRoutes([[1, 2, 3]], false, { executor }) !== null
    && await self.readAssignmentFromRoutes([[1, 3, 2]], false, { executor }) === null, 'Self incompatibility allows sequential occurrences only');
  const optional = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  optional.setArcCostEvaluatorOfAllVehicles(optional.registerTransitCallback(() => 1));
  optional.setVisitType(0, 0, policies.TYPE_ADDED_TO_VEHICLE); optional.setVisitType(2, 1, policies.TYPE_ADDED_TO_VEHICLE);
  optional.addTemporalTypeIncompatibility(0, 1); optional.addDisjunction([2], 1);
  const dropped = await optional.solveWithParameters({}, { executor });
  assert(dropped && dropped.value(optional.activeVar(2)) === 0 && dropped.objectiveValue() === 3n, 'Typed starts constrain optional visits');
  results.push({ id: 'routing.correctness.temporal_type_policies', name: 'Temporal visit policies, self incompatibility, typed starts and optional dropping',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const metadata = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  assert(!metadata.hasTemporalTypeIncompatibilities(), 'Temporal flag defaults false');
  metadata.setVisitType(1, 3, policies.TYPE_ADDED_TO_VEHICLE);
  assert(metadata.getTemporalTypeIncompatibilitiesOfType(0).length === 0, 'Sparse existing types have empty rules');
  metadata.addTemporalTypeIncompatibility(3, 1); metadata.addTemporalTypeIncompatibility(1, 3); metadata.addTemporalTypeIncompatibility(3, 3);
  metadata.getTemporalTypeIncompatibilitiesOfType(3).push(99);
  assert(metadata.hasTemporalTypeIncompatibilities() && !metadata.hasHardTypeIncompatibilities()
    && metadata.getTemporalTypeIncompatibilitiesOfType(3).join(',') === '1,3'
    && metadata.getTemporalTypeIncompatibilitiesOfType(1).join(',') === '3', 'Rules are symmetric, deduplicated sorted snapshots independent of hard rules');
  for (const value of [-1, 4, NaN, Infinity, 0.5]) {
    for (const invalid of [() => metadata.addTemporalTypeIncompatibility(0, value), () => metadata.getTemporalTypeIncompatibilitiesOfType(value)]) {
      let rejected = false; try { invalid(); } catch { rejected = true; }
      assert(rejected, 'Invalid temporal type IDs reject atomically');
    }
  }
  assert(metadata.getTemporalTypeIncompatibilitiesOfType(0).length === 0, 'Invalid second type leaves first type unchanged');
  results.push({ id: 'routing.contract.temporal_type_inspection', name: 'Temporal metadata and invalid-input recovery',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
