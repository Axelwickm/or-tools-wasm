import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
import type * as Api from 'or-tools-wasm/routing';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown) {
  try { await run(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid secondary-model configuration to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
const cost = (a: number, b: number) => a === b ? 0 : 1 + (a * 7 + b * 11 + a * b * 3) % 71;
function build(api: typeof Api, locations = 14) {
  const model = new api.RoutingModel(new api.RoutingIndexManager(locations, 1, 0));
  const evaluator = model.registerTransitCallback(cost);
  model.setArcCostEvaluatorOfAllVehicles(evaluator);
  return model;
}
function childParameters(api: typeof Api, strategy = api.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION) {
  return { firstSolutionStrategy: strategy, localSearchMetaheuristic: api.LocalSearchMetaheuristic.GREEDY_DESCENT,
    timeLimit: { seconds: 1 }, solutionLimit: 9223372036854775807n };
}
function mainParameters(api: typeof Api, period = 1) {
  return { firstSolutionStrategy: api.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION,
    localSearchMetaheuristic: api.LocalSearchMetaheuristic.GREEDY_DESCENT, firstSolutionOptimizationPeriod: period,
    timeLimit: { seconds: 1 }, solutionLimit: 1 };
}

export const routingSecondaryCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.secondary.native_insertion', name: 'Both insertion strategies execute native secondary search with native period semantics', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::SecondaryOptimizer', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), primary = build(api), secondary = build(api);
    let childEntries = 0, childSolutions = 0;
    secondary.addEnterSearchCallback(() => { ++childEntries; });
    secondary.addAtSolutionCallback(() => { ++childSolutions; });
    for (const strategy of [api.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION, api.FirstSolutionStrategy.LOCAL_CHEAPEST_COST_INSERTION]) {
      primary.setSecondaryModel(secondary, childParameters(api, strategy));
      for (const [period, objective] of [[0, 210n], [1, 163n], [3, 139n]] as const) {
        const result = await primary.solve({ ...options, ...mainParameters(api, period), firstSolutionStrategy: strategy });
        assert(result.assignment?.objectiveValue() === objective, 'First solution matches the independent native probe, without final local-search improvement');
        assert(await primary.checkIfAssignmentIsFeasible(result.assignment, false, options), 'Native final CP feasibility check accepts the returned primary assignment');
      }
    }
    assert(childEntries === 0 && childSolutions === 0, 'Native unchecked secondary search does not dispatch ordinary entry/solution monitors');
    assert(secondary.status() === api.RoutingSearchStatus.ROUTING_NOT_SOLVED, 'Sub-solving does not overwrite the secondary TypeScript facade status');
    return {};
  },
}, {
  id: 'routing.secondary.snapshots_and_reset', name: 'Secondary configuration is captured per execution and supports replacement, reset and independent models', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:RoutingModel::SetSecondaryModel', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), primary = build(api), secondary = build(api), parameters = childParameters(api);
    primary.setSecondaryModel(secondary, parameters);
    parameters.localSearchMetaheuristic = api.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH;
    const pending = primary.solve({ ...options, ...mainParameters(api) });
    primary.setArcCostEvaluatorOfAllVehicles(primary.registerTransitCallback(() => 1));
    secondary.setArcCostEvaluatorOfAllVehicles(secondary.registerTransitCallback(() => 1));
    const original = await pending;
    assert(original.assignment?.objectiveValue() === 163n, 'Both models and copied child parameters are captured before asynchronous execution');
    assert((await primary.solve({ ...options, ...mainParameters(api) })).assignment?.objectiveValue() === 14n, 'The next solve sees current model edits');
    const replacement = build(api);
    primary.setSecondaryModel(replacement, childParameters(api));
    assert((await primary.solve({ ...options, ...mainParameters(api) })).assignment?.objectiveValue() === 14n, 'Replacement keeps native primary objective accounting');
    primary.setSecondaryModel(null);
    await rejects(() => primary.solve({ ...options, ...mainParameters(api) }));
    assert((await primary.solve({ ...options, ...mainParameters(api, 0) })).assignment?.objectiveValue() === 14n, 'Reset removes the hook without affecting ordinary search');
    const parent = build(api), child = build(api), grandchild = build(api);
    child.setSecondaryModel(grandchild, childParameters(api));
    parent.setSecondaryModel(child, childParameters(api));
    assert((await parent.solve({ ...options, ...mainParameters(api) })).assignment?.objectiveValue() === 163n, 'Acyclic secondary chains are constructed and released in native ownership order');
    assert(original.assignment.objectiveValue() === 163n, 'Earlier assignment remains independent of later models and solves');
    return {};
  },
}, {
  id: 'routing.secondary.callbacks_and_errors', name: 'Unsafe native callback and cost combinations reject, and native event cancellation recovers', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:FastSolveFromAssignmentWithParameters', tags: ['native-contract', 'callbacks', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), primary = build(api, 6), secondary = build(api, 6);
    const search = { ...mainParameters(api), timeLimit: { seconds: 10 } };
    const child = { ...childParameters(api), timeLimit: { nanos: 100000000 } };
    await rejects(() => primary.setSecondaryModel(primary));
    await rejects(() => primary.setSecondaryModel(new api.RoutingModel(new api.RoutingIndexManager(13, 1, 0))));
    await rejects(() => primary.setSecondaryModel(new api.RoutingModel(new api.RoutingIndexManager(6, 1, 1))));
    primary.setSecondaryModel(secondary, child);
    await rejects(() => secondary.setSecondaryModel(primary));
    await rejects(() => primary.solve({ ...options, ...search, firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC }));
    primary.setSecondaryModel(secondary, { ...child, localSearchMetaheuristic: api.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH });
    await rejects(() => primary.solve({ ...options, ...search }));
    primary.setSecondaryModel(secondary, { ...child, madeUpParameter: 1 } as never);
    await rejects(() => primary.solve({ ...options, ...search }));
    primary.setSecondaryModel(secondary, child);
    secondary.addRouteConstraint(() => 0, true);
    await rejects(() => primary.solve({ ...options, ...search }));
    primary.setSecondaryModel(build(api, 6), child);
    primary.addRouteConstraint(() => 0, true);
    await rejects(() => primary.solve({ ...options, ...search }));
    const cancellable = build(api, 30);
    cancellable.setSecondaryModel(build(api, 30), child);
    const abort = new AbortController(); abort.abort();
    await rejects(() => cancellable.solve({ ...options, ...search, signal: abort.signal }));
    const controller = new AbortController(); let cancelled = false;
    await rejects(() => cancellable.solve({ ...options, ...search, signal: controller.signal,
      onEvent(event) { if (event.type === 'searchEntered') { cancelled = true; controller.abort(); } },
    }));
    assert(cancelled, 'Cancellation starts from a real native search-entry event');
    assert((await cancellable.solve({ ...options, ...search })).assignment, 'Cancellation leaves the executor reusable');
    const multi = new api.RoutingModel(new api.RoutingIndexManager(6, 2, 0));
    const heterogeneous = new api.RoutingModel(new api.RoutingIndexManager(6, 2, 0));
    multi.setArcCostEvaluatorOfAllVehicles(multi.registerTransitCallback(() => 1));
    heterogeneous.setArcCostEvaluatorOfAllVehicles(heterogeneous.registerTransitCallback(() => 1));
    heterogeneous.setArcCostEvaluatorOfVehicle(heterogeneous.registerTransitCallback(() => 2), 1);
    multi.setSecondaryModel(heterogeneous, child);
    await rejects(() => multi.solve({ ...options, ...search }));
    heterogeneous.setArcCostEvaluatorOfAllVehicles(heterogeneous.registerTransitCallback(() => 1));
    const homogeneous = await multi.solve({ ...options, ...search });
    assert(homogeneous.assignment && await multi.checkIfAssignmentIsFeasible(homogeneous.assignment, false, options),
      'Multiple vehicles with homogeneous native costs remain supported after rejecting heterogeneous costs');
    return {};
  },
}];
