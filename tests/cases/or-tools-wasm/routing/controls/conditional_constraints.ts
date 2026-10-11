import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runConditionalConstraints({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const options = { executor };
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  model.addConstantDimensionWithSlack(1, 20, 20, true, 'time');
  const time = model.getDimensionOrDie('time');
  time.cumulVar(1).setValue(6); time.cumulVar(2).setValue(2);
  model.addDisjunction([1], 100); model.addDisjunction([2], 10);
  const order = time.cumulVar(1).lt(time.cumulVar(2));
  const firstPresent = model.activeVar(1).eq(1), secondPresent = model.activeVar(2).eq(1);
  const guarded = order.onlyEnforceIf(firstPresent).onlyEnforceIf(secondPresent);
  assert(!order.conditions && guarded.conditions?.length === 2 && Object.isFrozen(guarded)
    && Object.isFrozen(guarded.conditions), 'Conditional comparisons remain immutable and chaining conjoins guards');
  model.addConstraints(guarded);
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.value(model.activeVar(1)) === 1 && assignment.value(model.activeVar(2)) === 0
      && assignment.objectiveValue() === 10n, 'False guards permit dropping optional stops without enforcing impossible ordering');
    return assignment;
  };
  const assignment = check(await model.solveWithParameters({}, options));
  check(await model.solveFromAssignmentWithParameters(assignment, {}, options));
  check(await model.readAssignmentFromRoutes([[1]], false, options));
  assert(await model.readAssignmentFromRoutes([[2, 1]], false, options) === null,
    'Native route restoration enforces the ordering when both stops are visited');
  model.addConstraints(model.activeVar(2).eq(1), model.activeVar(1).eq(1));
  assert(await model.solveWithParameters({}, options) === null, 'True guards enforce the impossible ordering');
  check(assignment);

  const pairs = { eq: [2, 2], ne: [2, 3], le: [2, 3], ge: [3, 2], lt: [2, 3], gt: [3, 2] } as const;
  for (const comparison of ['eq', 'ne', 'le', 'ge', 'lt', 'gt'] as const) {
    for (const enabled of [true, false]) {
      const constant = new api.RoutingModel(new api.RoutingIndexManager(1, 1, 0));
      const [left, right] = pairs[comparison];
      const guard = api.RoutingLinearExpr.from(left)[comparison](right);
      // Negate the guard by exchanging its comparison with its complement.
      const complement = { eq: 'ne', ne: 'eq', le: 'gt', ge: 'lt', lt: 'ge', gt: 'le' } as const;
      const condition = enabled ? guard : api.RoutingLinearExpr.from(left)[complement[comparison]](right);
      constant.addConstraints(api.RoutingLinearExpr.from(0).eq(1).onlyEnforceIf(condition));
      assert(Boolean(await constant.solveWithParameters({}, options)) === !enabled,
        `Native conditional ${comparison} must implement implication (${enabled}/${mode})`);
    }
  }
  const precise = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  const exact = 9_007_199_254_741_003n;
  precise.addConstantDimension(0, exact + 1n, false, 'time');
  const value = precise.getDimensionOrDie('time').cumulVar(1);
  precise.addConstraints(value.eq(exact).onlyEnforceIf(precise.activeVar(1).eq(1)));
  const preciseAssignment = await precise.solveWithParameters({}, options);
  assert(preciseAssignment && preciseAssignment.value(value) === exact, 'Guarded expression transport retains exact int64 values');
  return [{ id: 'routing.correctness.conditional_constraints', name: 'Native conditional comparisons and optional-stop feasibility',
    solver: 'routing', source: 'javascript/lib/routing/expressions.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];
}
