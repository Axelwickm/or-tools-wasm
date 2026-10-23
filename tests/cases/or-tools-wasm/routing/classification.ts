import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
async function rejects(action: () => Promise<unknown>) {
  try { await action(); } catch { return; }
  throw new Error('Expected Routing inspection to reject');
}

export const routingClassificationCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.matching_model', name: 'Native matching detection preserves unary capacity and disjunction restrictions', solver: 'routing',
  source: 'ortools/constraint_solver/routing_flow.cc:IsMatchingModel', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode);
    for (const [variant, expected] of [['unary', true], ['capacity', false], ['binary', false], ['overlap', false], ['cardinality', false]] as const) {
      const manager = new api.RoutingIndexManager(4, 3, 0), model = new api.RoutingModel(manager);
      const transit = variant === 'binary' ? model.registerTransitCallback(() => 1)
        : model.registerUnaryTransitCallback(index => manager.indexToNode(index) === 0 ? 0 : 1);
      model.addDimension(transit, 0, variant === 'capacity' ? 2 : 1, true, 'capacity');
      if (variant === 'overlap') { model.addDisjunction([1, 2], 10); model.addDisjunction([2, 3], 10); }
      if (variant === 'cardinality') model.addDisjunction([1, 2], 10, 2);
      assert(await model.isMatchingModel(options) === expected, `Native detection: ${variant}`);
      assert(await model.isMatchingModel(options) === expected, 'Repeated queries preserve configuration');
    }
    const plain = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    assert(!await plain.isMatchingModel(options), 'No qualifying dimension is not detected as matching');
    assert((await plain.solve(options)).hasSolution, 'Inspection does not prevent solving');
    return {};
  },
}, {
  id: 'routing.inspection.route_interdependence', name: 'Native route coupling uses supplied parameters and resource/optimizer metadata', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:AreRoutesInterdependent', tags: ['native-contract', 'snapshot'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    assert(!await model.areRoutesInterdependent({}, options), 'Ordinary routes are independent');
    for (const strategy of [api.LocalSearchMetaheuristic.TABU_SEARCH, api.LocalSearchMetaheuristic.GENERIC_TABU_SEARCH])
      assert(await model.areRoutesInterdependent({ localSearchMetaheuristic: strategy }, options), 'Native tabu settings couple routes');
    assert(!await model.areRoutesInterdependent({ localSearchMetaheuristic: api.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH }, options), 'No JS approximation treating all metaheuristics alike');
    assert(!await model.areRoutesInterdependent({}, options), 'Previous query parameters do not persist');
    model.addConstantDimension(1, 100, false, 'time');
    assert(!await model.areRoutesInterdependent({}, options), 'A plain dimension does not couple routes');
    model.getDimensionOrDie('time').setGlobalSpanCostCoefficient(1);
    assert(await model.areRoutesInterdependent({}, options), 'Global optimizer metadata couples routes');
    assert(!await model.areRoutesInterdependent({ disableSchedulingBewareThisMayDegradePerformance: true }, options), 'Supplied scheduling parameters also control model closure');
    const resources = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    resources.addConstantDimension(1, 100, true, 'time');
    const group = resources.addResourceGroup();
    group.addResource({}, 'time'); group.notifyVehicleRequiresAResource(0);
    assert(await resources.areRoutesInterdependent({}, options), 'Native dimension resource association couples routes');
    assert((await model.solve(options)).hasSolution, 'Query does not solve or retain search settings');
    return {};
  },
}, {
  id: 'routing.inspection.classification_recovery', name: 'Classification rejects invalid search parameters and cancellation without retaining failure', solver: 'routing',
  source: 'javascript/routing_search_parameters.h', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    await rejects(() => model.areRoutesInterdependent({ timeLimit: { seconds: -1 } }, options));
    const controller = new AbortController(); controller.abort();
    await rejects(() => model.isMatchingModel({ ...options, signal: controller.signal }));
    await rejects(() => model.areRoutesInterdependent({}, { ...options, signal: controller.signal }));
    assert(!await model.isMatchingModel(options) && !await model.areRoutesInterdependent({}, options), 'Executor recovers after invalid and aborted inspections');
    return {};
  },
}];
