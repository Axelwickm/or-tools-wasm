import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runNumerical({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  const unit = 9_007_199_254_740_993n;
  let callbackCost = unit;
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((from, to) => from === to ? 0n : callbackCost));
  model.addConstantDimension(unit, 3n * unit, true, 'exact');
  const pending = model.solveWithParameters({ solutionLimit: 1n }, { executor }); callbackCost = 1n;
  const assignment = await pending;
  assert(assignment && assignment.objectiveValue() === 3n * unit &&
    assignment.value(model.getDimensionOrDie('exact').cumulVar(model.end(0))) === 3n * unit,
    'Native Routing costs and cumuls retain exact int64 values and captured transit data');
  const bad = model.registerTransitCallback(() => NaN);
  model.setArcCostEvaluatorOfAllVehicles(bad);
  let rejected = false;
  try { await model.solveWithParameters({}, { executor }); } catch { rejected = true; }
  assert(rejected, 'Nonfinite transit callbacks reject before native dispatch');
  for (const value of [Number.MAX_SAFE_INTEGER + 1, 1n << 63n, -(1n << 63n) - 1n]) {
    rejected = false;
    try { model.registerTransitMatrix([[0, value, 1], [1, 0, 1], [1, 1, 0]]); } catch { rejected = true; }
    assert(rejected, 'Invalid transit quantities cannot silently round or wrap');
  }
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((from, to) => from === to ? 0n : unit));
  const recovered = await model.solveWithParameters({ solutionLimit: 1n }, { executor });
  assert(recovered && recovered.objectiveValue() === 3n * unit && assignment.objectiveValue() === 3n * unit,
    'Rejected callbacks and input boundaries preserve subsequent solves and old assignments');
  return [{ id: 'routing.numerical.exact_transits_recovery', name: 'Exact native transit costs and numerical rejection recovery',
    solver: 'routing', source: 'ortools/constraint_solver/routing.h', tags: ['native-contract', 'int64', 'ownership'], mode, ok: true }];
}
