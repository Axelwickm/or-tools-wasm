import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runNonlinearExpressions({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
  model.addConstantDimensionWithSlack(1, 100, 10, true, 'time');
  const time = model.getDimensionOrDie('time'), x = time.cumulVar(1), y = time.cumulVar(2), z = time.cumulVar(3);
  const product = model.product(x, y), gap = model.abs(x.sub(y));
  const smallest = model.min(x, y, z), largest = model.max(x, y, z);
  const nested = model.abs(model.product(gap, largest).sub(product));
  const signed = model.product(x.sub(10), y), square = model.product(x, x);
  const truth = model.reify(gap.le(3));
  assert((await product.domain({ executor })).max === 10000n && (await gap.domain({ executor })).min === 0n,
    'Native product/absolute domains before narrowing');
  product.setValues([10, 20]); product.removeValue(20);
  assert(await product.value({ executor }) === 10n && !await product.contains(20, { executor }), 'Native nonlinear result domain controls');
  x.setValue(2); y.setValue(5); z.setValue(7);
  model.setNextValue(0, 1); model.setNextValue(1, 2); model.setNextValue(2, 3); model.setNextValue(3, model.end(0));
  model.addConstraints(truth.eq(1), smallest.lt(largest).onlyEnforceIf(truth));
  model.addWeightedVariableTargetToFinalizer(gap, 3, 2);
  const assignment = await model.solveWithParameters({}, { executor });
  assert(assignment && assignment.value(product) === 10n && assignment.value(gap) === 3n && assignment.min(gap) === 3n && assignment.max(gap) === 3n
    && assignment.value(smallest) === 2n && assignment.value(largest) === 7n && assignment.value(nested) === 11n
    && assignment.value(signed) === -40n && assignment.value(square) === 4n && assignment.value(truth) === 1,
    'Native product, absolute, min/max, nesting, signed products, squares and reification');
  const status = model.status(); await nested.domain({ executor });
  assert(model.status() === status && assignment.value(nested) === 11n, 'Nonlinear domain queries preserve solve state');
  const warm = await model.solveFromAssignmentWithParameters(assignment, {}, { executor });
  const restored = await model.readAssignmentFromRoutes([[1, 2, 3]], false, { executor });
  assert(warm?.value(signed) === -40n && restored?.value(nested) === 11n, 'Warm and restored assignments capture nonlinear variables');
  model.addConstraints(nested.le(10));
  assert(await model.solveWithParameters({}, { executor }) === null && assignment.value(nested) === 11n,
    'Native nonlinear contradictions are infeasible and older snapshots remain independent');
  const exact = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0)), base = 9007199254740993n;
  const exactProduct = exact.product(base, 3), exactAbs = exact.abs(-base);
  const exactMin = exact.min(exactProduct, -base, base), exactMax = exact.max(base, exactProduct);
  const unary = exact.min(exactMax), bothNegative = exact.product(-3, -5);
  const result = await exact.solveWithParameters({}, { executor });
  assert(result && result.value(exactProduct) === base * 3n && result.value(exactAbs) === base && result.value(exactMin) === -base
    && result.value(exactMax) === base * 3n && result.value(unary) === base * 3n && result.value(bothNegative) === 15n,
    'Nonlinear constants and singleton extrema preserve native exact int64 results');
  const foreign = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0)); foreign.addConstantDimension(1, 100, true, 'time');
  const other = foreign.getDimensionOrDie('time').cumulVar(1);
  for (const invalid of [() => model.product(x, other), () => model.abs(other), () => model.min(x, other),
    () => model.max(), () => model.min(), () => model.product(x, Number.MAX_SAFE_INTEGER + 1), () => assignment.value(foreign.abs(other))]) {
    let rejected = false; try { invalid(); } catch { rejected = true; } assert(rejected, 'Invalid or foreign nonlinear operands reject');
  }
  const unbound = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  unbound.addConstantDimensionWithSlack(1, 100, 10, false, 'time');
  unbound.setNextValue(0, 1); unbound.setNextValue(1, unbound.end(0));
  const start = unbound.getDimensionOrDie('time').cumulVar(0);
  const expressions = [
    { variable: unbound.abs(start.sub(50)), min: 0n, max: 50n, boundValue: 40n },
    { variable: unbound.product(start, 2), min: 0n, max: 196n, boundValue: 20n },
    { variable: unbound.min(start, 50), min: 0n, max: 50n, boundValue: 10n },
    { variable: unbound.max(start, 50), min: 50n, max: 98n, boundValue: 50n },
  ];
  const ranges = await unbound.solveWithParameters({}, { executor });
  assert(ranges, 'Routing solution with unbound nonlinear expressions');
  const checkRanges = () => {
    for (const { variable, min, max } of expressions) {
      assert(ranges.min(variable) === min && ranges.max(variable) === max, 'Native unbound nonlinear assignment bounds');
      let error: unknown;
      try { ranges.value(variable); } catch (caught) { error = caught; }
      assert(error instanceof Error && /not bound/.test(error.message), 'Unbound nonlinear value rejects instead of returning a bound');
    }
  };
  checkRanges();
  start.setValue(10);
  const bound = await unbound.solveWithParameters({}, { executor });
  assert(bound, 'Routing solution after binding nonlinear operands');
  for (const { variable, boundValue } of expressions) {
    assert(bound.value(variable) === boundValue && bound.min(variable) === boundValue && bound.max(variable) === boundValue,
      'Bound nonlinear assignment values and bounds agree');
  }
  checkRanges();
  return [
    { id: 'routing.correctness.nonlinear_expressions', name: 'Native product, absolute value, extrema and nonlinear assignment snapshots',
      solver: 'routing', source: 'ortools/constraint_solver/constraint_solver.h', tags: ['contract', 'model-correctness'], mode, ok: true },
    { id: 'routing.correctness.unbound_nonlinear_assignments', name: 'Unbound nonlinear assignment ranges, value rejection and detached snapshots',
      solver: 'routing', source: 'ortools/constraint_solver/constraint_solver.h', tags: ['contract', 'model-correctness'], mode, ok: true },
  ];
}
