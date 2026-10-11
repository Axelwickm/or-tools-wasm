import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVariableExpressions({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const options = { executor };
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  model.addConstantDimensionWithSlack(1, 20, 10, true, 'time');
  const time = model.getDimensionOrDie('time'), arrival = time.cumulVar(1), wait = time.slackVar(1);
  arrival.setValues([1, 3, 7, 9, 9]); arrival.removeValue(3); arrival.removeInterval(8, 10);
  let domain = await arrival.domain(options);
  assert(domain.min === 1n && domain.max === 7n && domain.size === 2n && !domain.bound, 'Native domains retain sparse membership');
  assert(!await arrival.contains(3, options) && await arrival.contains(7, options), 'Membership reads actual native holes');
  let unbound = false; try { await arrival.value(options); } catch { unbound = true; }
  assert(unbound, 'Reading an unbound native variable must reject');
  arrival.setMin(4);
  assert(await arrival.value(options) === 7n && await arrival.bound(options), 'Range intersections account for holes');
  assert(await time.getCumulVarSoftLowerBound(1, { executor }) === 7n && await time.getCumulVarSoftUpperBound(1, { executor }) === 7n,
    'Existing configured-bound getters track sparse domain changes');
  wait.setValues([0, 2, 4]); wait.removeValues([2, 2]);
  assert(await wait.size(options) === 2n && !await wait.contains(2, options), 'Slack values and removals reach native domains');
  wait.setValue(4);
  const next = model.nextVarHandle(1); next.setValues([2]);
  model.setNextValue(model.start(0), 1); model.setNextValue(2, model.end(0));
  model.vehicleVar(1).setValue(0); model.activeVar(2).removeValue(0);
  assert(await next.value(options) === 2n && await model.vehicleVar(1).min(options) === 0n
    && await model.activeVar(2).bound(options), 'Successor, vehicle and active handles support native inspection');
  const solved = await model.solveWithParameters({}, options);
  assert(solved && solved.value(arrival) === 7n && solved.value(next) === 2, 'Domain changes affect real routes and preserve numeric successor access');
  const previousStatus = model.status(), previousStrategy = solved.automaticFirstSolutionStrategy;
  domain = await arrival.domain(options);
  assert(domain.bound && model.status() === previousStatus && solved.automaticFirstSolutionStrategy === previousStrategy
    && solved.value(arrival) === 7n, 'Inspection must preserve prior solve state and assignment snapshots');

  const huge = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  huge.addConstantDimension(0, (1n << 63n) - 1n, true, 'time');
  const exact = 9_007_199_254_741_003n, hugeVar = huge.getDimensionOrDie('time').cumulVar(1);
  assert(await hugeVar.size(options) === 1n << 63n, 'Unsigned domain cardinality must remain exact');
  hugeVar.removeInterval(0, exact - 1n); hugeVar.setMax(exact + 10n); hugeVar.removeValue(exact + 5n);
  domain = await hugeVar.domain(options);
  assert(domain.min === exact && domain.max === exact + 10n && domain.size === 10n
    && !await hugeVar.contains(exact + 5n, options), 'Exact int64 boundaries and narrowed interior removals are preserved');

  const arithmetic = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  arithmetic.addConstantDimensionWithSlack(1, 30, 10, true, 'time');
  arithmetic.addConstantDimension(2, 30, true, 'distance');
  const a = arithmetic.getDimensionOrDie('time').cumulVar(1), w = arithmetic.getDimensionOrDie('time').slackVar(0);
  const b = arithmetic.getDimensionOrDie('distance').cumulVar(1);
  const expression = a.mul(2).add(w).sub(1);
  arithmetic.addConstraints(expression.eq(4), a.eq(b), a.ge(2), a.le(2), a.gt(1), a.lt(3), a.ne(0), w.eq(1), a.neg().eq(-2));
  const check = (assignment: Awaited<ReturnType<typeof arithmetic.solveWithParameters>>) => {
    assert(assignment && assignment.value(a) === 2n && assignment.value(b) === 2n && assignment.objectiveValue() === 0n,
      'Arithmetic and all six comparisons must be enforced across dimensions by native solving');
    return assignment;
  };
  const assignment = check(await arithmetic.solveWithParameters({}, options));
  check(await arithmetic.solveFromAssignmentWithParameters(assignment, {}, options));
  check(await arithmetic.readAssignmentFromRoutes([[1]], false, options));
  arithmetic.addConstraints(a.ne(2));
  assert(await arithmetic.solveWithParameters({}, options) === null, 'Contradictory expressions produce no solution');
  const precise = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  precise.addConstantDimension(0, exact + 10n, false, 'time');
  const preciseVar = precise.getDimensionOrDie('time').cumulVar(1);
  precise.addConstraints(preciseVar.add(1).eq(exact + 1n));
  const preciseSolution = await precise.solveWithParameters({}, options);
  assert(preciseSolution && preciseSolution.value(preciseVar) === exact, 'Expression offsets and comparison values retain exact int64 values');
  return [
    { id: 'routing.correctness.variable_domains', name: 'Native variable domain inspection, holes and exact cardinalities', solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true },
    { id: 'routing.correctness.linear_expressions', name: 'Native linear arithmetic and cross-dimension comparisons', solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true },
  ];
}
