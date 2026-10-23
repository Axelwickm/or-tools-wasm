import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export const routingNativeQueryCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.native_classification', name: 'Native disjunction classification and singleton snapshots', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetPerfectBinaryDisjunctions/GetNumOfSingletonNodes', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const routing = new api.RoutingModel(new api.RoutingIndexManager(7, 1, 0));
    routing.addDisjunction([4, 3], 10); routing.addDisjunction([2, 1], 10);
    assert(JSON.stringify(await routing.getPerfectBinaryDisjunctions(options)) === '[[1,2],[3,4]]', 'Native sorted perfect pairs');
    const pending = routing.getPerfectBinaryDisjunctions(options);
    routing.addDisjunction([1], 10);
    const previous = await pending;
    assert(previous.length === 2, 'Pending query owns construction snapshot');
    previous[0][0] = 99;
    assert(JSON.stringify(await routing.getPerfectBinaryDisjunctions(options)) === '[[3,4]]', 'Overlap excludes pair and arrays are independent');
    assert(await routing.getNumOfSingletonNodes(options) === 6, 'Ordinary visits are singletons');
    routing.addPickupAndDelivery(5, 6);
    assert(await routing.getNumOfSingletonNodes(options) === 4, 'Pickup/delivery visits excluded');
    return {};
  },
}, {
  id: 'routing.inspection.eligibility_cost', name: 'Explicit vehicle eligibility and exact first-solution costs', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:IsVehicleAllowedForIndex/GetArcCostForFirstSolution', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const routing = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    routing.setAllowedVehiclesForIndex([1], 1);
    assert(!(await routing.isVehicleAllowedForIndex(0, 1, options)) && await routing.isVehicleAllowedForIndex(1, 1, options), 'Explicit eligibility');
    routing.setAllowedVehiclesForIndex([], 1);
    assert(await routing.isVehicleAllowedForIndex(0, 1, options), 'Empty list allows all vehicles');
    const exact = 9007199254740993n;
    routing.setArcCostEvaluatorOfAllVehicles(routing.registerTransitMatrix([[0n, exact, 1n], [exact, 0n, 1n], [1n, 1n, 0n]]));
    assert(await routing.getArcCostForFirstSolution(routing.start(0), 1, options) === exact, 'Exact native cost');
    assert(await routing.getArcCostForFirstSolution(1, routing.end(0), options) === 9223372036854775807n, 'Native end sentinel');
    for (const call of [() => routing.isVehicleAllowedForIndex(2, 1, options), () => routing.getArcCostForFirstSolution(routing.end(0), 1, options)]) {
      let rejected = false; try { await call(); } catch { rejected = true; }
      assert(rejected, 'Unsafe native indices reject');
    }
    return {};
  },
}, {
  id: 'routing.inspection.first_solution_counters', name: 'First-solution counters belong to each result and strategy', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetNumberOfDecisionsInFirstSolution', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const routing = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    routing.setArcCostEvaluatorOfAllVehicles(routing.registerTransitMatrix([[0,1,4,2],[1,0,2,3],[4,2,0,1],[2,3,1,0]]));
    const filtered = await routing.solve({ ...options, firstSolutionStrategy: api.FirstSolutionStrategy.PATH_CHEAPEST_ARC });
    const count = filtered.searchStatistics?.numDecisionsInFirstSolution;
    assert(typeof count === 'bigint' && count > 0n, 'Filtered strategy reports native decisions');
    assert(typeof filtered.searchStatistics?.numRejectsInFirstSolution === 'bigint', 'Native reject counter');
    const unfiltered = await routing.solve({ ...options, firstSolutionStrategy: api.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE });
    assert(unfiltered.searchStatistics?.numDecisionsInFirstSolution === 0n && unfiltered.searchStatistics.numRejectsInFirstSolution === 0n, 'No filtered builder means native zeros');
    assert(filtered.searchStatistics?.numDecisionsInFirstSolution === count, 'Previous result remains independent');
    return {};
  },
}];
