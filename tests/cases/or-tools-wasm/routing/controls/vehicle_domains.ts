import type * as Api from 'or-tools-wasm/routing';
import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVehicleDomains({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const domainManager = new api.RoutingIndexManager(5, 3, 0);
  const domainModel = new api.RoutingModel(domainManager);
  domainModel.setArcCostEvaluatorOfAllVehicles(domainModel.registerTransitCallback(() => 5n));
  domainModel.addDisjunction([3], 100n);
  domainModel.addDisjunction([4], 0n);
  const domain = domainModel.vehicleVar(1);
  const values = [2, 0, 2];
  domain.setValues(values);
  values.splice(0, values.length, 1);
  domainModel.vehicleVar(2).setValue(0);
  domainModel.vehicleVar(3).setValue(-1);
  domainModel.vehicleVar(4).setValues([-1, 2]);
  domainModel.vehicleVar(4).setValue(2);
  for (const invalid of [() => domain.setValue(-2), () => domain.setValue(3),
    () => domain.setValue(NaN), () => domain.setValue(0.5),
    () => domain.setValue(Number.MAX_SAFE_INTEGER + 1), () => domain.setValues([0, 3]),
    () => domain.setValues(new Array(1))]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid vehicle domain values must not partially alter the model');
  }
  const checkDomain = (assignment: Api.Assignment | null) => {
    assert(assignment, 'Compatible vehicle domains must have a solution');
    assert([0, 2].includes(assignment.value(domain)) && assignment.value(domainModel.vehicleVar(2)) === 0
      && assignment.value(domainModel.vehicleVar(3)) === -1 && assignment.value(domainModel.vehicleVar(4)) === 2,
      'Native domains must exclude missing IDs, force drops and force optional visits');
    return assignment;
  };
  const originalDomain = checkDomain(await domainModel.readAssignmentFromRoutes([[1, 2], [], [4]], false, { executor }));
  assert(originalDomain.objectiveValue() === 125n, 'Forced optional drops must retain native disjunction penalties');
  assert(await domainModel.readAssignmentFromRoutes([[2], [1], [4]], false, { executor }) === null,
    'Noncontiguous domains must reject visits by excluded vehicles');
  assert(await domainModel.readAssignmentFromRoutes([[1, 2], [], []], false, { executor }) === null,
    'A fixed nonnegative vehicle value must force an optional node to be visited');
  checkDomain(await domainModel.solveWithParameters({}, { executor }));
  checkDomain(await domainModel.solveFromAssignmentWithParameters(originalDomain, {}, { executor }));
  domain.setValue(2);
  domainModel.vehicleVar(1).setValues([-1, 0, 1, 2]);
  assert(await domainModel.readAssignmentFromRoutes([[1, 2], [], [4]], false, { executor }) === null,
    'Narrowed domains must invalidate earlier vehicle allocations');
  const narrowed = checkDomain(await domainModel.readAssignmentFromRoutes([[2], [], [1, 4]], false, { executor }));
  assert(narrowed.value(domain) === 2 && originalDomain.value(domain) === 0,
    'Wider subsequent lists must not loosen domains or mutate prior assignment snapshots');
  domain.setValues([0]);
  assert(await domainModel.solveWithParameters({}, { executor }) === null,
    'Contradictory domains must return no solution without aborting native construction');
  assert(await domainModel.readAssignmentFromRoutes([[2], [], [1, 4]], false, { executor }) === null,
    'Contradictory domains must reject route reads');
  assert(await domainModel.solveFromAssignmentWithParameters(originalDomain, {}, { executor }) === null,
    'Contradictory domains must reject warm assignments');
  for (const kind of ['mandatory-drop', 'eligibility'] as const) {
    const impossible = new api.RoutingModel(new api.RoutingIndexManager(2, 2, 0));
    if (kind === 'mandatory-drop') impossible.vehicleVar(1).setValue(-1);
    if (kind === 'eligibility') { impossible.vehicleVar(1).setValue(1); impossible.setAllowedVehiclesForIndex([0], 1); }
    assert(await impossible.solveWithParameters({}, { executor }) === null,
      `Conflicting vehicle domains must fail safely (${kind}/${mode})`);
  }
  const depotManager = new api.RoutingIndexManager(4, 2, [2, 2], [0, 0]);
  const depotDomains = new api.RoutingModel(depotManager);
  const customer = depotManager.nodeToIndex(1);
  depotDomains.vehicleVar(customer).setValue(1);
  const depotAssignment = await depotDomains.readAssignmentFromRoutes([[depotManager.nodeToIndex(3)], [customer]], false, { executor });
  assert(depotAssignment && depotAssignment.value(depotDomains.vehicleVar(customer)) === 1,
    'Vehicle domains must use native indices with repeated starts and end-only depots');
  results.push({ id: 'routing.correctness.vehicle_domains', name: 'Native intersecting vehicle domains and forced optional activity',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
