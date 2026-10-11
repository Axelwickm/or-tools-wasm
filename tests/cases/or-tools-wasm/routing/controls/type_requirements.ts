import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runTypeRequirements({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const policy = api.VisitTypePolicy;
  const same = new api.RoutingModel(new api.RoutingIndexManager(4, 2, 0));
  same.setArcCostEvaluatorOfAllVehicles(same.registerTransitCallback(() => 1));
  for (const [index, type] of [[1, 0], [2, 1], [3, 2]]) same.setVisitType(index, type, policy.TYPE_ADDED_TO_VEHICLE);
  same.addSameVehicleRequiredTypeAlternatives(0, [1, 2]); same.addSameVehicleRequiredTypeAlternatives(0, [2]);
  const grouped = await same.solveWithParameters({}, { executor });
  assert(grouped && grouped.value(same.vehicleVar(1)) === grouped.value(same.vehicleVar(3)), 'Optimizer puts a required alternative on the dependent route');
  assert(await same.readAssignmentFromRoutes([[1, 3], [2]], false, { executor }) !== null
    && await same.readAssignmentFromRoutes([[3, 1], [2]], false, { executor }) !== null,
    'Same-vehicle requirements allow an alternative before or after the dependent visit');
  assert(await same.readAssignmentFromRoutes([[1, 2], [3]], false, { executor }) === null,
    'Alternatives within a list are OR; separate requirement lists are AND');
  assert(await same.solveFromAssignmentWithParameters(grouped, {}, { executor }) !== null, 'Same-vehicle rules reach warm solving');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.same_vehicle_type_requirements', name: 'Same-vehicle type requirements, alternatives and multiple lists',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  const temporal = new api.RoutingModel(new api.RoutingIndexManager(6, 1, 0));
  temporal.setArcCostEvaluatorOfAllVehicles(temporal.registerTransitCallback(() => 1));
  temporal.setVisitType(1, 1, policy.TYPE_ADDED_TO_VEHICLE); temporal.setVisitType(2, 1, policy.ADDED_TYPE_REMOVED_FROM_VEHICLE);
  temporal.setVisitType(3, 0, policy.TYPE_ADDED_TO_VEHICLE); temporal.setVisitType(4, 0, policy.ADDED_TYPE_REMOVED_FROM_VEHICLE);
  temporal.setVisitType(5, 2, policy.TYPE_ADDED_TO_VEHICLE);
  temporal.addRequiredTypeAlternativesWhenAddingType(0, [1]); temporal.addRequiredTypeAlternativesWhenRemovingType(0, [2]);
  const assignment = await temporal.solveWithParameters({}, { executor });
  assert(assignment && assignment.objectiveValue() === 6n, 'Optimizer respects separate addition/removal requirements');
  assert((await temporal.solveFromAssignmentWithParameters(assignment, {}, { executor }))?.objectiveValue() === 6n
    && (await temporal.readAssignmentFromRoutes([[1, 3, 2, 5, 4]], false, { executor }))?.objectiveValue() === 6n,
    'Temporal requirements reach normal/warm/restored solving');
  assert(await temporal.readAssignmentFromRoutes([[1, 2, 3, 5, 4]], false, { executor }) === null
    && await temporal.readAssignmentFromRoutes([[1, 3, 2, 4, 5]], false, { executor }) === null,
    'A removed provider cannot satisfy addition; a later provider cannot satisfy removal');
  for (const kind of ['adding', 'removing'] as const) {
    for (const visitPolicy of [policy.TYPE_ADDED_TO_VEHICLE, policy.ADDED_TYPE_REMOVED_FROM_VEHICLE,
      policy.TYPE_ON_VEHICLE_UP_TO_VISIT, policy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED]) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      model.setVisitType(1, 0, visitPolicy); model.setVisitType(2, 1, policy.TYPE_ADDED_TO_VEHICLE);
      if (kind === 'adding') model.addRequiredTypeAlternativesWhenAddingType(0, [1]);
      else model.addRequiredTypeAlternativesWhenRemovingType(0, [1]);
      assert(await model.readAssignmentFromRoutes([[2, 1]], false, { executor }) !== null, 'Earlier active provider satisfies applicable policies');
      const required = kind === 'adding' ? visitPolicy === policy.TYPE_ADDED_TO_VEHICLE || visitPolicy === policy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED
        : visitPolicy === policy.TYPE_ON_VEHICLE_UP_TO_VISIT || visitPolicy === policy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED;
      assert(Boolean(await model.readAssignmentFromRoutes([[1, 2]], false, { executor })) === !required,
        'Requirements honor each policy; unmatched removal has no effect');
    }
  }
  const anchored = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  anchored.setVisitType(0, 1, policy.TYPE_ADDED_TO_VEHICLE); anchored.setVisitType(1, 0, policy.TYPE_ADDED_TO_VEHICLE);
  anchored.addRequiredTypeAlternativesWhenAddingType(0, [1]);
  assert(await anchored.solveWithParameters({}, { executor }) !== null, 'Typed starts satisfy temporal requirements');
  results.push({ id: 'routing.correctness.temporal_type_requirements', name: 'Native temporal requirements, all policies, ordering and typed starts',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const metadata = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  assert(!metadata.hasTypeRegulations() && !metadata.hasSameVehicleTypeRequirements() && !metadata.hasTemporalTypeRequirements(), 'Requirement flags default false');
  metadata.setVisitType(1, 4, policy.TYPE_ADDED_TO_VEHICLE);
  const alternatives = [3, 1, 3]; metadata.addSameVehicleRequiredTypeAlternatives(4, alternatives); alternatives.push(2);
  metadata.addSameVehicleRequiredTypeAlternatives(4, [1, 3]);
  metadata.addRequiredTypeAlternativesWhenAddingType(4, [2]); metadata.addRequiredTypeAlternativesWhenRemovingType(4, [0, 2]);
  const copied = metadata.getSameVehicleRequiredTypeAlternativesOfType(4); copied[0].push(99); copied.pop();
  metadata.getRequiredTypeAlternativesWhenAddingType(4)[0].push(99); metadata.getRequiredTypeAlternativesWhenRemovingType(4)[0].reverse();
  assert(JSON.stringify(metadata.getSameVehicleRequiredTypeAlternativesOfType(4)) === '[[1,3],[1,3]]'
    && JSON.stringify(metadata.getRequiredTypeAlternativesWhenAddingType(4)) === '[[2]]'
    && JSON.stringify(metadata.getRequiredTypeAlternativesWhenRemovingType(4)) === '[[0,2]]'
    && metadata.getSameVehicleRequiredTypeAlternativesOfType(0).length === 0
    && metadata.hasTypeRegulations() && metadata.hasSameVehicleTypeRequirements() && metadata.hasTemporalTypeRequirements(),
    'Requirement lists retain insertion order and repeated calls, deduplicate each set, and copy both levels');
  for (const invalid of [-1, 5, 0.5, NaN, Infinity]) {
    for (const operation of [() => metadata.addSameVehicleRequiredTypeAlternatives(invalid, [0]),
      () => metadata.addRequiredTypeAlternativesWhenAddingType(0, [1, invalid]),
      () => metadata.addRequiredTypeAlternativesWhenRemovingType(0, [invalid]),
      () => metadata.getSameVehicleRequiredTypeAlternativesOfType(invalid),
      () => metadata.getRequiredTypeAlternativesWhenAddingType(invalid), () => metadata.getRequiredTypeAlternativesWhenRemovingType(invalid)]) {
      let rejected = false; try { operation(); } catch { rejected = true; } assert(rejected, 'Invalid dependent/alternative IDs reject atomically');
    }
  }
  assert(metadata.getRequiredTypeAlternativesWhenAddingType(0).length === 0
    && metadata.getRequiredTypeAlternativesWhenRemovingType(0).length === 0, 'Invalid later alternatives preserve metadata');
  for (const kind of ['same', 'adding', 'removing'] as const) {
    for (const visitPolicy of [policy.TYPE_ADDED_TO_VEHICLE, policy.ADDED_TYPE_REMOVED_FROM_VEHICLE,
      policy.TYPE_ON_VEHICLE_UP_TO_VISIT, policy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED]) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
      model.setVisitType(1, 0, visitPolicy);
      if (kind === 'same') model.addSameVehicleRequiredTypeAlternatives(0, []);
      else if (kind === 'adding') model.addRequiredTypeAlternativesWhenAddingType(0, []);
      else model.addRequiredTypeAlternativesWhenRemovingType(0, []);
      assert(!model.hasTypeRegulations() && !model.hasSameVehicleTypeRequirements() && !model.hasTemporalTypeRequirements()
        && model.getSameVehicleRequiredTypeAlternativesOfType(0).length === 0
        && model.getRequiredTypeAlternativesWhenAddingType(0).length === 0 && model.getRequiredTypeAlternativesWhenRemovingType(0).length === 0,
        'Native empty requirements are excluded from getter lists and flags');
      const infeasible = kind === 'same' ? visitPolicy !== policy.ADDED_TYPE_REMOVED_FROM_VEHICLE
        : kind === 'adding' ? visitPolicy === policy.TYPE_ADDED_TO_VEHICLE || visitPolicy === policy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED
        : visitPolicy !== policy.TYPE_ADDED_TO_VEHICLE;
      assert(Boolean(await model.solveWithParameters({}, { executor })) === !infeasible, 'Empty requirements disable only native matching policies');
      if (infeasible) {
        model.addDisjunction([1], 7); const dropped = await model.solveWithParameters({}, { executor });
        assert(dropped && dropped.value(model.activeVar(1)) === 0 && dropped.objectiveValue() === 7n, 'Optional dependent nodes may be dropped');
      }
    }
  }
  for (const kind of ['hard', 'temporal'] as const) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0)); model.setVisitType(1, 0, policy.TYPE_ADDED_TO_VEHICLE);
    if (kind === 'hard') model.addHardTypeIncompatibility(0, 0); else model.addTemporalTypeIncompatibility(0, 0);
    assert(model.hasTypeRegulations() && !model.hasSameVehicleTypeRequirements() && !model.hasTemporalTypeRequirements(), 'Combined flag includes each incompatibility family');
  }
  results.push({ id: 'routing.contract.type_requirement_inspection', name: 'Copied requirement metadata, flags, validation and empty-set policy behavior',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
