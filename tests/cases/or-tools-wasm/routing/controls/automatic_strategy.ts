import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runAutomaticStrategy({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  for (const kind of ['ordinary', 'pickup-delivery', 'precedence'] as const) {
    const manager = new api.RoutingIndexManager(3, 1, 0);
    const model = new api.RoutingModel(manager);
    const transit = model.registerTransitCallback(() => 1n);
    model.setArcCostEvaluatorOfAllVehicles(transit);
    model.addDimension(transit, 0, 10, true, 'order');
    const dimension = model.getDimensionOrDie('order');
    if (kind === 'pickup-delivery') model.addPickupAndDelivery(1, 2);
    if (kind === 'precedence') dimension.addNodePrecedence(1, 2, 1n);
    const expected = kind === 'ordinary' ? api.FirstSolutionStrategy.PATH_CHEAPEST_ARC
      : api.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION;
    const restored = await model.readAssignmentFromRoutes([[1, 2]], false, { executor });
    assert(restored && restored.automaticFirstSolutionStrategy === expected,
      `Route reads must return the actual native automatic strategy (${kind}/${mode})`);
    if (kind === 'precedence') {
      assert(await model.readAssignmentFromRoutes([[2, 1]], false, { executor }) === null,
        'Node precedence must reject a restored route in reverse order');
      assert(restored.automaticFirstSolutionStrategy === expected,
        'A failed route read must preserve the earlier assignment diagnostics');
      assert(await model.readAssignmentFromRoutes([[1, 2]], false, { executor }), 'Precedence model must remain reusable');
      for (const [first, second, offset] of [[-1, 2, 0], [1, manager.getNumberOfIndices(), 0], [1, 2, NaN]]) {
        let rejected = false;
        try { dimension.addNodePrecedence(first, second, offset); } catch { rejected = true; }
        assert(rejected, 'Precedence indices and integer offsets must be validated');
      }
    }
    const requested = kind === 'ordinary' ? api.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
      : api.FirstSolutionStrategy.PATH_CHEAPEST_ARC;
    const optimized = await model.solveWithParameters({ firstSolutionStrategy: requested }, { executor });
    assert(optimized && optimized.automaticFirstSolutionStrategy === expected,
      'Automatic query must report the native automatic choice independently of the requested strategy');
    if (kind === 'precedence') assert(optimized.value(dimension.cumulVar(2)) >= optimized.value(dimension.cumulVar(1)) + 1n,
      'Node precedence offset must reach native optimization');
    const warm = await model.solveFromAssignmentWithParameters(restored, {}, { executor });
    assert(warm && warm.automaticFirstSolutionStrategy === expected, 'Warm solves must report the native automatic choice');
    assert(restored.objectiveValue() === 3n, 'Strategy queries must leave prior assignments unchanged');
  }
  results.push({ id: 'routing.correctness.native_automatic_strategy',
    name: 'Native automatic strategy for ordinary, pickup/delivery and precedence models', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
