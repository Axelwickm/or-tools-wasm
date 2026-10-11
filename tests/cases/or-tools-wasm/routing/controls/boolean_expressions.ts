import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runBooleanExpressions({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
  model.addConstantDimension(1, 100, true, 'time');
  const time = model.getDimensionOrDie('time');
  model.addDisjunction([1], 0); model.addDisjunction([2], 0);
  const a = model.activeVar(1), b = model.activeVar(2); b.setValue(0);
  const aTruth = model.reify(a.eq(1)), notB = model.reify(api.RoutingBoolExpr.from(b).not());
  const both = model.reify(api.RoutingBoolExpr.and(aTruth, notB));
  const before = await aTruth.domain({ executor });
  assert(before.min === 0n && before.max === 1n && await aTruth.contains(1, { executor }), 'Native reified Boolean domains');
  model.addConstraints(true, api.RoutingBoolExpr.or(a, b), both.add(aTruth).eq(2));
  model.addConstraints(time.cumulVar(1).lt(time.cumulVar(3)).onlyEnforceIf(a.eq(1), a.eq(1).asBool().and(notB).or(false)));
  model.addConstraints(time.cumulVar(1).gt(time.cumulVar(3)).onlyEnforceIf(api.RoutingBoolExpr.from(b).or(false)));
  model.addVariableTargetToFinalizer(both, 0);
  const exact = 9007199254740993n;
  const equal = a.add(exact), expected = [1, 0, 1, 1, 0, 0];
  const comparisons = [equal.eq(exact + 1n), equal.ne(exact + 1n), equal.le(exact + 1n), equal.ge(exact + 1n), equal.lt(exact + 1n), equal.gt(exact + 1n)];
  const truth = comparisons.map(predicate => model.reify(predicate));
  const assignment = await model.solveWithParameters({}, { executor });
  assert(assignment && assignment.value(a) === 1 && assignment.value(b) === 0 && assignment.value(aTruth) === 1
    && assignment.value(notB) === 1 && assignment.value(both) === 1 && assignment.min(both) === 1 && assignment.max(both) === 1,
    'Native OR forces an optional stop, NOT/AND and Boolean arithmetic preserve truth');
  assert(truth.every((variable, index) => assignment.value(variable) === expected[index]), 'All six native comparisons reify exact int64 expressions');
  assert(assignment.value(time.cumulVar(1)) < assignment.value(time.cumulVar(3)), 'Compound Boolean enforcement reaches native comparisons');
  const status = model.status(); await both.domain({ executor });
  assert(model.status() === status && assignment.value(both) === 1, 'Boolean domain inspection preserves solve state');
  const warm = await model.solveFromAssignmentWithParameters(assignment, {}, { executor });
  const restored = await model.readAssignmentFromRoutes([[1, 3]], false, { executor });
  assert(warm?.value(both) === 1 && restored?.value(aTruth) === 1, 'Warm and restored assignments capture native Boolean variables');
  model.addConstraints(api.RoutingBoolExpr.from(both).not());
  assert(await model.solveWithParameters({}, { executor }) === null && assignment.value(both) === 1, 'Contradictory Boolean constraints are infeasible; prior assignments remain detached');
  const foreign = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  for (const invalid of [() => api.RoutingBoolExpr.or(a, foreign.activeVar(1)), () => model.reify(foreign.activeVar(1).eq(1)),
    () => model.reify(time.cumulVar(1).eq(2).onlyEnforceIf(a.eq(1))), () => api.RoutingBoolExpr.and()]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid Boolean expressions reject');
  }
  for (const [first, second] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const table = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    table.addDisjunction([1], 0); table.addDisjunction([2], 0);
    const x = table.activeVar(1), y = table.activeVar(2); x.setValue(first); y.setValue(second);
    const and = table.reify(api.RoutingBoolExpr.and(x, y)), or = table.reify(api.RoutingBoolExpr.or(x, y));
    const not = table.reify(api.RoutingBoolExpr.from(x).not()), yes = table.reify(true), no = table.reify(false);
    const result = await table.solveWithParameters({}, { executor });
    assert(result && result.value(and) === Number(Boolean(first && second)) && result.value(or) === Number(Boolean(first || second))
      && result.value(not) === 1 - first && result.value(yes) === 1 && result.value(no) === 0, 'Complete native Boolean truth table and constants');
  }
  const impossible = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0)); impossible.addConstraints(false);
  assert(await impossible.solveWithParameters({}, { executor }) === null, 'A false Boolean constraint is natively infeasible');
  return [{ id: 'routing.correctness.boolean_expressions', name: 'Native Boolean composition, reified comparison variables and guarded constraints',
    solver: 'routing', source: 'ortools/constraint_solver/constraint_solver.h', tags: ['contract', 'model-correctness'], mode, ok: true }];
}
