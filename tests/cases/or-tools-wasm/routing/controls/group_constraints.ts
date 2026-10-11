import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runGroupConstraints({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
  model.setNextValue(model.start(0), 1); model.setNextValue(1, model.end(0));
  model.setNextValue(model.start(1), 2); model.setNextValue(2, model.end(1));
  const nodes = [2, 1, 2];
  model.addSoftSameVehicleConstraint(nodes, 7); nodes.splice(0, nodes.length, 99);
  model.addSoftSameVehicleConstraint([], 9);
  model.addSoftSameVehicleConstraint([1, 2], 3);
  model.addSoftSameVehicleConstraint([1], 0);
  assert(model.getNumberOfSoftSameVehicleConstraints() === 3 && model.getSoftSameVehicleCost(0) === 7n
    && model.getSoftSameVehicleIndices(0).join(',') === '2,1,2', 'Groups retain copied input/order, exact costs and native empty/zero behavior');
  model.getSoftSameVehicleIndices(0).push(99);
  assert(model.getSoftSameVehicleIndices(0).join(',') === '2,1,2', 'Returned group indices are independent snapshots');
  for (const invalid of [() => model.addSoftSameVehicleConstraint([model.end(0)], 1), () => model.addSoftSameVehicleConstraint([1], -1), () => model.addSoftSameVehicleConstraint([1, 99], 1),
    () => model.addSoftSameVehicleConstraint(new Array(1), 1), () => model.addSoftSameVehicleConstraint([1], Number.MAX_SAFE_INTEGER + 1),
    () => model.getSoftSameVehicleCost(3), () => model.getSoftSameVehicleIndices(-1)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid group operations fail atomically');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 14n, 'Each extra used vehicle incurs each group penalty, in addition to four arc costs'); return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }));
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }));
  check(await model.readAssignmentFromRoutes([[1], [2]], false, { executor }));
  const together = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  together.setArcCostEvaluatorOfAllVehicles(together.registerTransitCallback(() => 1));
  together.addSoftSameVehicleConstraint([1, 2], 50);
  const optimum = await together.solveWithParameters({}, { executor });
  assert(optimum && optimum.objectiveValue() === 3n && optimum.value(together.vehicleVar(1)) === optimum.value(together.vehicleVar(2)),
    'Native optimizer must account for grouped vehicle penalties');
  const optional = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  optional.setArcCostEvaluatorOfAllVehicles(optional.registerTransitCallback(() => 1)); optional.addDisjunction([1], 1);
  optional.activeVar(1).setValue(0); optional.addSoftSameVehicleConstraint([1, 2], 10);
  const dropped = await optional.solveWithParameters({}, { executor });
  assert(dropped && dropped.objectiveValue() === 3n, 'Unperformed nodes must not count as an extra used vehicle');
  const exact = 9_007_199_254_741_003n;
  const large = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
  large.vehicleVar(1).setValue(0); large.vehicleVar(2).setValue(1); large.addSoftSameVehicleConstraint([1, 2], exact);
  const priced = await large.solveWithParameters({}, { executor });
  assert(priced && priced.objectiveValue() === exact && large.getSoftSameVehicleCost(0) === exact, 'Group costs must preserve exact bigint objectives');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.soft_same_vehicle', name: 'Grouped vehicle penalties, native optimization and exact bigint costs',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];

  const policies = api.PickupAndDeliveryPolicy;
  const pairs = new api.RoutingModel(new api.RoutingIndexManager(5, 2, 0));
  pairs.setArcCostEvaluatorOfAllVehicles(pairs.registerTransitCallback(() => 1)); pairs.addPickupAndDelivery(1, 3); pairs.addPickupAndDelivery(2, 4);
  assert(pairs.getPickupAndDeliveryPolicyOfVehicle(0) === policies.PICKUP_AND_DELIVERY_NO_ORDER, 'Default policy allows either delivery order');
  pairs.setPickupAndDeliveryPolicyOfAllVehicles(policies.PICKUP_AND_DELIVERY_FIFO);
  const path = [pairs.start(0), 1, 2, 3, 4, pairs.end(0)];
  for (let index = 0; index < path.length - 1; ++index) pairs.setNextValue(path[index], path[index + 1]);
  pairs.setNextValue(pairs.start(1), pairs.end(1));
  const fifo = await pairs.solveWithParameters({}, { executor });
  assert(fifo && fifo.objectiveValue() === 5n && pairs.getPickupAndDeliveryPolicyOfVehicle(1) === policies.PICKUP_AND_DELIVERY_FIFO,
    'FIFO policies must permit deliveries in pickup order');
  assert(await pairs.solveFromAssignmentWithParameters(fifo, {}, { executor }) !== null
    && await pairs.readAssignmentFromRoutes([[1, 2, 3, 4], []], false, { executor }) !== null, 'Warm/restored routes honor FIFO policies');
  for (const invalid of [() => pairs.setPickupAndDeliveryPolicyOfAllVehicles(3 as Parameters<typeof pairs.setPickupAndDeliveryPolicyOfAllVehicles>[0]), () => pairs.setPickupAndDeliveryPolicyOfVehicle(-1 as Parameters<typeof pairs.setPickupAndDeliveryPolicyOfVehicle>[0], 0),
    () => pairs.setPickupAndDeliveryPolicyOfVehicle(0, 2), () => pairs.getPickupAndDeliveryPolicyOfVehicle(-1)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid policies/vehicles must be rejected atomically');
  }
  pairs.setPickupAndDeliveryPolicyOfVehicle(policies.PICKUP_AND_DELIVERY_LIFO, 0);
  assert(await pairs.solveWithParameters({}, { executor }) === null
    && await pairs.readAssignmentFromRoutes([[1, 2, 3, 4], []], false, { executor }) === null, 'LIFO rejects the fixed FIFO route');
  pairs.setPickupAndDeliveryPolicyOfVehicle(policies.PICKUP_AND_DELIVERY_NO_ORDER, 0);
  assert(await pairs.solveWithParameters({}, { executor }) !== null && fifo.objectiveValue() === 5n, 'Repeated policies replace settings while prior assignments remain independent');
  const stack = new api.RoutingModel(new api.RoutingIndexManager(5, 1, 0));
  stack.addPickupAndDelivery(1, 3); stack.addPickupAndDelivery(2, 4); stack.setPickupAndDeliveryPolicyOfAllVehicles(policies.PICKUP_AND_DELIVERY_LIFO);
  const reverse = [stack.start(0), 1, 2, 4, 3, stack.end(0)];
  for (let index = 0; index < reverse.length - 1; ++index) stack.setNextValue(reverse[index], reverse[index + 1]);
  assert(await stack.solveWithParameters({}, { executor }) !== null
    && await stack.readAssignmentFromRoutes([[1, 2, 4, 3]], false, { executor }) !== null, 'LIFO permits reverse delivery order');
  results.push({ id: 'routing.correctness.pickup_delivery_policies', name: 'Native FIFO/LIFO route ordering and policy replacement',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const behavior = api.PenaltyCostBehavior;
  for (const [policy, expected] of [[behavior.PENALIZE_ONCE, 10n], [behavior.PENALIZE_PER_INACTIVE, 20n]] as const) {
    const choices = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    choices.addDisjunction([1, 2, 3], 10, 2, policy);
    for (const index of [1, 2, 3]) choices.activeVar(index).setValue(0);
    const assignment = await choices.solveWithParameters({}, { executor });
    assert(assignment && assignment.objectiveValue() === expected, 'Penalty behavior must distinguish once-only from per-missing-cardinality costs');
    const restored = await choices.readAssignmentFromRoutes([[]], false, { executor });
    assert(restored && restored.objectiveValue() === expected, 'Restoration preserves cardinality penalty behavior');
  }
  const required = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  required.setArcCostEvaluatorOfAllVehicles(required.registerTransitCallback(() => 1));
  assert(required.addDisjunction([1, 2, 3], undefined, 2) === 0, 'Adding cardinality options preserves disjunction IDs');
  const mandatory = await required.solveWithParameters({}, { executor });
  assert(mandatory && mandatory.objectiveValue() === 3n, 'No penalty requires exactly the requested cardinality');
  assert(await required.readAssignmentFromRoutes([[1, 2]], false, { executor }) !== null
    && await required.readAssignmentFromRoutes([[1]], false, { executor }) === null, 'Mandatory cardinality constrains restored routes');
  for (const invalid of [() => required.addDisjunction([1], 1, 0), () => required.addDisjunction([1], 1, -1),
    () => required.addDisjunction([1], 1, Number.MAX_SAFE_INTEGER + 1), () => required.addDisjunction([1], 1, 1, 2 as Parameters<typeof required.addDisjunction>[3]),
    () => required.addDisjunction([required.start(0)], 1), () => required.addDisjunction([required.end(0)], 1)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid disjunction options must not consume IDs or mutate the model');
  }
  assert(required.addDisjunction([1], 0) === 1, 'Existing two-argument calls and IDs remain valid after rejected additions');
  const shortage = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  shortage.setArcCostEvaluatorOfAllVehicles(shortage.registerTransitCallback(() => 1)); shortage.addDisjunction([1], 5, 2, behavior.PENALIZE_PER_INACTIVE);
  const shortfall = await shortage.solveWithParameters({}, { executor });
  assert(shortfall && shortfall.objectiveValue() === 7n, 'Optional cardinality above group size charges unavoidable missing visits');
  results.push({ id: 'routing.correctness.disjunction_cardinality', name: 'Disjunction cardinality, penalty modes and backward-compatible defaults',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  const metadata = new api.RoutingModel(new api.RoutingIndexManager(5, 2, 0));
  assert(metadata.getNumberOfDisjunctions() === 0 && !metadata.hasMandatoryDisjunctions()
    && !metadata.hasMaxCardinalityConstrainedDisjunctions(), 'Empty models have no disjunction flags');
  const members = [2, 1, 2];
  const first = metadata.addDisjunction(members, exact, 2, behavior.PENALIZE_PER_INACTIVE);
  members.fill(4);
  assert(first === 0 && metadata.getDisjunctionIndices(2).join(',') === '0,0'
    && metadata.getDisjunctionIndices(1).join(',') === '0' && metadata.getDisjunctionIndices(4).length === 0
    && metadata.getDisjunctionIndices(metadata.start(1)).length === 0, 'Membership queries take node indices, retain duplicates and copy inputs');
  metadata.getDisjunctionIndices(2).push(99);
  assert(metadata.getDisjunctionIndices(2).join(',') === '0,0'
    && metadata.getDisjunctionPenalty(first) === exact && metadata.getDisjunctionMaxCardinality(first) === 2n
    && metadata.getDisjunctionPenaltyCostBehavior(first) === behavior.PENALIZE_PER_INACTIVE
    && metadata.hasMaxCardinalityConstrainedDisjunctions() && !metadata.hasMandatoryDisjunctions(), 'Metadata preserves exact costs, modes and independent memberships');
  metadata.addDisjunction([2], -2, exact);
  assert(!metadata.hasMandatoryDisjunctions(), 'Native mandatory inspection recognizes only the -1 sentinel, despite all negative penalties enforcing visits');
  const defaultId = metadata.addDisjunction([3]);
  assert(metadata.hasMandatoryDisjunctions() && metadata.getDisjunctionPenalty(defaultId) === -1n
    && metadata.getDisjunctionMaxCardinality(defaultId) === 1n
    && metadata.getDisjunctionPenaltyCostBehavior(defaultId) === behavior.PENALIZE_ONCE
    && metadata.getDisjunctionIndices(2).join(',') === '0,0,1', 'Defaults and overlapping memberships match native getters');
  const unconstrained = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  unconstrained.addDisjunction([1, 2], 0, 2); unconstrained.addDisjunction([1], 0, exact);
  assert(!unconstrained.hasMaxCardinalityConstrainedDisjunctions(), 'Equal or larger cardinality does not constrain group size');
  for (const index of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 3]) {
    for (const get of [() => metadata.getDisjunctionPenalty(index), () => metadata.getDisjunctionMaxCardinality(index),
      () => metadata.getDisjunctionPenaltyCostBehavior(index)]) {
      let rejected = false; try { get(); } catch { rejected = true; } assert(rejected, 'Invalid disjunction IDs are rejected');
    }
  }
  for (const index of [-1, 0.5, NaN, Infinity, metadata.end(0)]) {
    let rejected = false; try { metadata.getDisjunctionIndices(index); } catch { rejected = true; } assert(rejected, 'Invalid/end node membership indices are rejected');
  }
  for (const invalid of [() => metadata.addDisjunction([1], Number.MAX_SAFE_INTEGER + 1), () => metadata.addDisjunction([1], 0, 0)]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid additions reject before storing metadata');
  }
  assert(metadata.getNumberOfDisjunctions() === 3 && metadata.getDisjunctionIndices(1).join(',') === '0', 'Rejected additions leave IDs and memberships unchanged');
  results.push({ id: 'routing.contract.disjunction_inspection', name: 'Native disjunction membership, exact metadata, sentinel flags and invalid IDs',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
