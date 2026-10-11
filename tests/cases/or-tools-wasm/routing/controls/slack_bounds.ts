import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runSlackBounds({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const manager = new api.RoutingIndexManager(3, 1, 0);
  const model = new api.RoutingModel(manager);
  const transit = model.registerTransitCallback(() => 1);
  model.setArcCostEvaluatorOfAllVehicles(transit);
  model.addDimension(transit, 10, 30, true, 'time');
  model.setNextValue(model.start(0), 1);
  model.setNextValue(1, 2);
  model.setNextValue(2, model.end(0));
  const time = model.getDimensionOrDie('time');
  const waiting = time.slackVar(1);
  assert(Object.keys(waiting).join(',') === 'kind,model,dimensionName,index' && !Reflect.set(waiting, 'index', 2),
    'Slack handles must preserve immutable enumerable identity');
  time.slackVar(model.start(0)).setRange(2, 2);
  waiting.setMin(4);
  time.slackVar(1).setMax(6);
  waiting.setRange(5, 7);
  time.slackVar(2).setMax(0);
  time.setCumulVarRange(2, 9, 9);
  for (const invalid of [() => time.slackVar(model.end(0)), () => time.slackVar(-1),
    () => time.slackVar(NaN), () => waiting.setRange(4, 3), () => waiting.setMin(NaN),
    () => waiting.setMax(Number.MAX_SAFE_INTEGER + 1), () => waiting.setMin(1n << 63n)]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid slack inputs must be rejected without altering the model');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 3n, 'Waiting must preserve arc-only objective costs');
    assert(assignment.value(time.cumulVar(1)) === 3n && assignment.value(time.cumulVar(2)) === 9n
      && assignment.value(time.cumulVar(model.end(0))) === 10n, 'Native cumul values must reflect start/customer waiting and intersecting bounds');
    assert(assignment.value(waiting) === 5n && assignment.min(waiting) === 5n && assignment.max(waiting) === 5n
      && assignment.value(time.slackVar(model.start(0))) === 2n,
      'Native assignments capture waiting values on ordinary, warm and restored routes');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }));
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }));
  check(await model.readAssignmentFromRoutes([[1, 2]], false, { executor }));
  model.addConstraints(waiting.le(4));
  assert(await model.solveWithParameters({}, { executor }) === null, 'Conflicting slack intersections must fail safely');
  assert(solution.value(time.cumulVar(2)) === 9n, 'Prior cumul snapshots must survive later slack changes');
  results.push({ id: 'routing.correctness.slack_bounds', name: 'Native waiting bounds and cumul range convenience',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  for (const kind of ['initial-capacity', 'negative-maximum', 'zero-slack', 'time-window']) {
    const impossible = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    const callback = impossible.registerTransitCallback(() => 1);
    impossible.addDimension(callback, kind === 'zero-slack' ? 0 : 10, 30, true, 'time');
    const dimension = impossible.getDimensionOrDie('time');
    if (kind === 'initial-capacity') impossible.addConstraints(dimension.slackVar(1).ge(11));
    if (kind === 'negative-maximum') impossible.addConstraints(dimension.slackVar(1).le(-1));
    if (kind === 'zero-slack') impossible.addConstraints(dimension.slackVar(1).ge(1));
    if (kind === 'time-window') {
      impossible.setNextValue(impossible.start(0), 1);
      impossible.setNextValue(1, 2);
      impossible.setNextValue(2, impossible.end(0));
      dimension.slackVar(impossible.start(0)).setRange(2, 2);
      dimension.slackVar(1).setMax(4);
      dimension.setCumulVarRange(2, 9, 9);
    }
    assert(await impossible.solveWithParameters({}, { executor }) === null, `Impossible waiting must produce no solution (${kind}/${mode})`);
  }
  results.push({ id: 'routing.correctness.slack_conflicts', name: 'Slack capacity, constant-domain and time-window conflicts',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const exact = 9_007_199_254_741_003n;
  const large = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  large.addDimension(large.registerTransitCallback(() => 0), exact, exact, true, 'time');
  const largeTime = large.getDimensionOrDie('time');
  largeTime.slackVar(large.start(0)).setRange(exact, exact);
  largeTime.slackVar(1).setRange(0, 0);
  const largeAssignment = await large.solveWithParameters({}, { executor });
  assert(largeAssignment && largeAssignment.value(largeTime.cumulVar(1)) === exact
    && largeAssignment.value(largeTime.cumulVar(large.end(0))) === exact, 'Bigint slack must remain exact beyond JavaScript safe integers');
  assert(largeAssignment.value(largeTime.slackVar(large.start(0))) === exact
    && largeAssignment.max(largeTime.transitVar(large.start(0))) === exact
    && largeAssignment.value(largeTime.fixedTransitVar(large.start(0))) === 0n,
    'Captured waiting and transit remain exact beyond safe integers');

  const ranged = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  ranged.addConstantDimensionWithSlack(1, 30, 10, true, 'time');
  const rangedTime = ranged.getDimensionOrDie('time');
  const rangedAssignment = await ranged.readAssignmentFromRoutes([[1]], false, { executor });
  assert(rangedAssignment && rangedAssignment.min(rangedTime.slackVar(0)) === 0n
    && rangedAssignment.max(rangedTime.slackVar(0)) === 10n
    && rangedAssignment.value(rangedTime.slackVar(0)) === 0n
    && rangedAssignment.min(rangedTime.transitVar(0)) === 1n
    && rangedAssignment.max(rangedTime.transitVar(0)) === 11n,
    'Unbound native assignment ranges remain visible without finalizing waiting');
  results.push({ id: 'routing.correctness.slack_exact_int64', name: 'Exact int64 waiting bounds across bridge/runtime paths',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
