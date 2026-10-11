import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runDimensionEvaluators({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  for (const kind of ['constant', 'vector', 'matrix'] as const) {
    // A nonzero shared depot exposes routing-index/node mixups at duplicate starts/ends.
    const manager = new api.RoutingIndexManager(4, 2, 2);
    const model = new api.RoutingModel(manager);
    const vector = [11, 3, 5, 7];
    const matrix = Array.from({ length: 4 }, (_, from) =>
      Array.from({ length: 4 }, (_, to) => from * 4 + to + 1));
    let rejected = false;
    try {
      if (kind === 'constant') model.addConstantDimension(NaN, 100, true, 'source');
      else if (kind === 'vector') model.addVectorDimension([1], 100, true, 'source');
      else model.addMatrixDimension([[1]], 100, true, 'source');
    } catch { rejected = true; }
    assert(rejected, 'Malformed dimension data must fail before reserving its name');
    const [evaluator, added] = kind === 'constant'
      ? model.addConstantDimension(2, 100, true, 'source')
      : kind === 'vector' ? model.addVectorDimension(vector, 100, true, 'source')
        : model.addMatrixDimension(matrix, 100, true, 'source');
    assert(added, `Dimension creation must survive invalid input (${kind}/${mode})`);
    vector.fill(99);
    matrix.forEach(row => row.fill(99));
    assert(model.addConstantDimension(1, 100, true, 'source')[1] === false,
      'Duplicate dimension names must remain rejected');
    assert(model.registerTransitCallback(() => 0n) === evaluator + 1,
      'Failed duplicate creation must not consume an evaluator handle');
    model.setArcCostEvaluatorOfAllVehicles(evaluator);
    model.setArcCostEvaluatorOfVehicle(evaluator, 1);
    assert(model.addDimension(evaluator, 0, 100, true, 'reused'), 'Returned evaluator must support another dimension');
    const assignment = await model.readAssignmentFromRoutes(
      [[manager.nodeToIndex(0), manager.nodeToIndex(1)], [manager.nodeToIndex(3)]], false, { executor });
    const totals = kind === 'constant' ? [6n, 4n] : kind === 'vector' ? [19n, 12n] : [18n, 27n];
    assert(assignment && assignment.objectiveValue() === totals[0] + totals[1],
      `Returned ${kind} evaluator must price native routes by node (${mode})`);
    for (let vehicle = 0; vehicle < 2; ++vehicle) {
      for (const name of ['source', 'reused']) {
        const end = model.getDimensionOrDie(name).cumulVar(model.end(vehicle));
        assert(assignment.min(end) === totals[vehicle] && assignment.max(end) === totals[vehicle],
          `Original and reused ${kind} dimensions must agree (${mode})`);
      }
    }
    const optimized = await model.solveWithParameters({}, { executor });
    assert(optimized && optimized.objectiveValue() > 0n, 'Returned evaluators must also support normal optimization');
    assert(assignment.objectiveValue() === totals[0] + totals[1], 'Prior restored assignments remain independent');
  }
  results.push({ id: 'routing.correctness.dimension_evaluator_reuse',
    name: 'Constant/vector/matrix dimension evaluator handles are reusable', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
