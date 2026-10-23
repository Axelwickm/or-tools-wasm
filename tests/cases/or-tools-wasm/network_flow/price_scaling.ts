import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export const flowPriceScalingCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'network_flow.min_cost.price_scaling', name: 'Native min-cost-flow price scaling changes cost range without changing native statuses', solver: 'network-flow',
  source: 'ortools/graph/min_cost_flow.h:SimpleMinCostFlow::SetPriceScaling', tags: ['native-contract', 'gap-regression'],
  async run({ flow: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const maxFlowWithMinCost of [false, true]) for (const sign of [1n, -1n]) {
      const model = new api.SimpleMinCostFlow(), cost = sign * (1n << 60n);
      const arc = model.addArcWithCapacityAndUnitCost(0, 1, 1, cost);
      model.setNodesSupplies([0, 1], [1, -1]);
      const scaled = await model.solve({ ...options, maxFlowWithMinCost });
      assert(scaled.status === api.SimpleMinCostFlowStatus.BAD_COST_RANGE, 'Default native scaling rejects this exact large cost');
      model.setPriceScaling(false);
      const pending = model.solve({ ...options, maxFlowWithMinCost });
      model.setPriceScaling(true);
      const unscaled = await pending;
      assert(unscaled.status === api.SimpleMinCostFlowStatus.OPTIMAL && unscaled.optimalCost === cost
        && unscaled.flow(arc) === 1n && unscaled.maximumFlow === 1n, 'Explicit false reaches native and is captured before awaiting');
      assert((await model.solve({ ...options, maxFlowWithMinCost })).status === api.SimpleMinCostFlowStatus.BAD_COST_RANGE,
        'Re-enabling scaling restores native range checks');
      model.setArcCapacity(arc, 0);
      assert(unscaled.flow(arc) === 1n && unscaled.optimalCost === cost, 'Earlier unscaled result owns its flow and cost');
      let rejected = false;
      try { model.setPriceScaling(0 as never); } catch (error) { rejected = error instanceof TypeError; }
      assert(rejected, 'Invalid flags reject without Boolean coercion');
    }
    return {};
  },
}];
