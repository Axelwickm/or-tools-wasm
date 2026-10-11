import type * as Api from 'or-tools-wasm/routing';
import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';
import { routingParametersDescriptor } from '../../../../../javascript/lib/generated/routing_schemas.ts';
function routingModel(api: typeof Api, unchecked = false) {
  const manager = new api.RoutingIndexManager(16, 1, 0);
  const model = new api.RoutingModel(manager, unchecked ? { solverParameters: { checkSolutionPeriod: 100 } } : undefined);
  const matrix = Array.from({ length: 16 }, (_, row) => Array.from({ length: 16 }, (_, col) =>
    row === col ? 0 : ((row * 131 + col * 71 + row * col * 13) % 97 + 1)));
  const transit = model.registerTransitCallback((from, to) => matrix[manager.indexToNode(from)][manager.indexToNode(to)]);
  model.setArcCostEvaluatorOfAllVehicles(transit);
  return model;
}

export async function runProgressCancellation({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const parameters = { firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
    localSearchMetaheuristic: api.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH,
    timeLimit: { seconds: 1n }, solutionLimit: 6n };
  const model = routingModel(api);
  let calls = 0, events = 0;
  const costs: bigint[] = [];
  model.addAtSolutionCallback(event => { ++calls; costs.push(event.objectiveValue); });
  const solution = await model.solveWithParameters(parameters, { executor, onEvent: event => {
    if (event.type !== 'solution') return;
    ++events;
    assert(!event.unchecked, 'Default events must be checked native solutions');
    assert(event.objectiveValue === costs[costs.length - 1], 'Callback facade must reflect its native candidate');
    assert(typeof event.solutionCount === 'bigint', 'Native solution count must remain exact');
  } });
  assert(solution && calls > 1 && events === calls, `Live native callbacks missing (${mode})`);
  const incumbent = solution.objectiveValue();

  for (const warm of mode === 'direct' ? [] : [false, true]) for (const callbackFailure of [false, true]) {
    const controller = new AbortController();
    const failure = new Error('Routing deliberate callback failure');
    const request = { ...parameters, solutionLimit: 9223372036854775807n, timeLimit: { seconds: 30n } };
    let progress = false, rejected = false;
    const began = Date.now();
    const options = { executor, signal: controller.signal, onEvent: (event: Api.RoutingEvent) => {
      if (event.type !== 'solution' || progress) return;
      progress = true;
      if (callbackFailure) throw failure;
      setTimeout(() => controller.abort(), 0);
    } };
    try {
      if (warm) {
        const initial = await model.readAssignmentFromRoutes([Array.from({ length: 15 }, (_, i) => i + 1)], true, { executor });
        assert(initial, 'Warm-start assignment must exist');
        await model.solveFromAssignmentWithParameters(initial, request, options);
      } else await model.solveWithParameters(request, options);
    } catch (error) {
      rejected = callbackFailure ? error === failure : error instanceof Error && error.name === 'AbortError';
      if (!rejected) throw error;
    }
    assert(progress && rejected, `Native normal/warm cancellation failed (${mode})`);
    assert(Date.now() - began < 10000, `Routing interruption was not prompt (${mode})`);
    const reused = await model.solveWithParameters(parameters, { executor });
    assert(reused, `Cancellation poisoned Routing reuse (${mode})`);
    assert(solution.objectiveValue() === incumbent, 'Original assignment snapshot changed after reuse');
  }

  const uncheckedModel = routingModel(api, true);
  let checkedCalls = 0, allCalls = 0, uncheckedEvents = 0;
  uncheckedModel.addAtSolutionCallback(() => { ++checkedCalls; });
  uncheckedModel.addAtSolutionCallback(() => { ++allCalls; }, true);
  // Isolate a first-accept, non-LNS neighborhood so native fast local search
  // actually emits unchecked candidates instead of checking every neighbor.
  const operatorFields = routingParametersDescriptor.nested.operations_research.nested.RoutingSearchParameters.nested.LocalSearchNeighborhoodOperators.fields;
  const localSearchOperators = Object.fromEntries(Object.keys(operatorFields).map(name =>
    [name, name === 'useTwoOpt' ? api.BOOL_TRUE : api.BOOL_FALSE]));
  await uncheckedModel.solveWithParameters({ ...parameters,
    firstSolutionStrategy: api.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE,
    localSearchOperators, solutionLimit: 9223372036854775807n,
    timeLimit: { nanos: 50000000 } }, { executor, onEvent: event => {
      if (event.type === 'solution' && event.unchecked) ++uncheckedEvents;
    } });
  assert(uncheckedEvents > 0 && allCalls >= checkedCalls && allCalls === checkedCalls + uncheckedEvents,
    'Unchecked events must reach only callbacks that requested them');

  results.push({ id: 'routing.controls.progress_cancellation_reuse',
    name: 'Routing native callbacks, normal/warm cancellation and reuse', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'solver-control'], mode, ok: true as const });
  return results;
}
