import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVehicleEligibility({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const eligibilityManager = new api.RoutingIndexManager(4, 2, 0);
  const eligibility = new api.RoutingModel(eligibilityManager);
  eligibility.setArcCostEvaluatorOfAllVehicles(eligibility.registerTransitCallback(() => 5n));
  eligibility.addDisjunction([3], 0n);
  const allowed = [1, 1];
  eligibility.setAllowedVehiclesForIndex(allowed, 1);
  allowed.splice(0, allowed.length, 0);
  eligibility.setAllowedVehiclesForIndex([0], 2);
  eligibility.setAllowedVehiclesForIndex([1], 3);
  for (const invalid of [() => eligibility.setAllowedVehiclesForIndex([-1], 1),
    () => eligibility.setAllowedVehiclesForIndex([2], 1), () => eligibility.setAllowedVehiclesForIndex([NaN], 1),
    () => eligibility.setAllowedVehiclesForIndex([0.5], 1), () => eligibility.setAllowedVehiclesForIndex([1, 2], 1),
    () => eligibility.setAllowedVehiclesForIndex([], -1),
    () => eligibility.setAllowedVehiclesForIndex([], eligibilityManager.getNumberOfIndices())]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid eligibility must fail before recording a partial operation');
  }
  const originalEligibility = await eligibility.readAssignmentFromRoutes([[2], [1]], false, { executor });
  assert(originalEligibility && originalEligibility.value(eligibility.vehicleVar(1)) === 1
    && originalEligibility.value(eligibility.vehicleVar(2)) === 0
    && originalEligibility.value(eligibility.vehicleVar(3)) === -1,
    'Copied eligibility lists must bind required customers and permit optional drops');
  assert(originalEligibility.automaticFirstSolutionStrategy === api.FirstSolutionStrategy.PATH_MOST_CONSTRAINED_ARC,
    'Single-vehicle restrictions, including duplicate IDs, must select the native constrained strategy');
  assert(await eligibility.readAssignmentFromRoutes([[1], [2]], false, { executor }) === null,
    'Route restoration must reject ineligible vehicle visits');
  const optimizedEligibility = await eligibility.solveWithParameters({}, { executor });
  assert(optimizedEligibility && optimizedEligibility.value(eligibility.vehicleVar(1)) === 1
    && optimizedEligibility.value(eligibility.vehicleVar(2)) === 0
    && optimizedEligibility.value(eligibility.vehicleVar(3)) === -1,
    'Optimization must obey eligibility and retain optional dropping');
  assert(await eligibility.solveFromAssignmentWithParameters(originalEligibility, {}, { executor }),
    'Eligible assignments must support warm optimization');
  eligibility.setAllowedVehiclesForIndex([0], 1);
  assert(await eligibility.readAssignmentFromRoutes([[2], [1]], false, { executor }) === null,
    'Later eligibility calls must replace earlier lists');
  const replacedEligibility = await eligibility.readAssignmentFromRoutes([[1, 2], []], false, { executor });
  assert(replacedEligibility && replacedEligibility.value(eligibility.vehicleVar(1)) === 0
    && originalEligibility.value(eligibility.vehicleVar(1)) === 1,
    'Replacement must allow the new vehicle and preserve old assignment snapshots');
  eligibility.setAllowedVehiclesForIndex([], 1);
  eligibility.setAllowedVehiclesForIndex([], 2);
  eligibility.setAllowedVehiclesForIndex([0, 1], 3);
  const cleared = await eligibility.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(cleared, 'Empty eligibility lists must restore all vehicles');
  assert(cleared.automaticFirstSolutionStrategy === api.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
    'Cleared and multi-vehicle lists must restore the ordinary native strategy');
  assert(await eligibility.readAssignmentFromRoutes([[2], [1]], false, { executor }),
    'Cleared eligibility must permit both route allocations');
  const depotManager = new api.RoutingIndexManager(4, 2, [2, 2], [0, 0]);
  const depotEligibility = new api.RoutingModel(depotManager);
  const customer = depotManager.nodeToIndex(1);
  depotEligibility.setAllowedVehiclesForIndex([1], customer);
  const depotAssignment = await depotEligibility.readAssignmentFromRoutes([[depotManager.nodeToIndex(3)], [customer]], false, { executor });
  assert(depotAssignment && depotAssignment.value(depotEligibility.vehicleVar(customer)) === 1,
    'Eligibility must address native routing indices with repeated starts and end-only depots');
  assert(await depotEligibility.readAssignmentFromRoutes([[customer], [depotManager.nodeToIndex(3)]], false, { executor }) === null,
    'Depot index mapping must not shift customer eligibility');
  results.push({ id: 'routing.correctness.vehicle_eligibility', name: 'Native vehicle eligibility and replacement semantics',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
