import type { ExecutorFixtureMode, SharedCase } from '../../../harness/shared_case.ts';
import type { NetworkFlowApi } from '../../python-parity/network_flow/index.ts';
import { networkFlowExecutionOptions } from '../../python-parity/network_flow/execution.ts';

type Output = { status: number; objectiveValue: number };
const maximum = 9_223_372_036_854_775_807n;
const minimum = -maximum - 1n;
const int32Maximum = 2_147_483_647;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => unknown, rangeError = true) {
  let rejected = false;
  try { action(); } catch (error) { rejected = error instanceof Error && (!rangeError || error instanceof RangeError); }
  assert(rejected, 'Unsafe input must reject before changing the model');
}

export const networkFlowNumericalCases: SharedCase<NetworkFlowApi, Output, ExecutorFixtureMode>[] = [{
  id: 'network_flow.numerical.endpoints_and_mutation', name: 'Network Flow endpoint limits and atomic mutation',
  solver: 'network-flow', source: 'ortools/graph/graph.h',
  upstream: 'StaticGraph::AddNode; SimpleMinCostFlow::SolveWithPossibleAdjustment; SimpleLinearSumAssignment::Solve',
  tags: ['native-contract', 'numerical'],
  async run(api) {
    const max = new api.SimpleMaxFlow();
    const min = new api.SimpleMinCostFlow();
    const assignment = new api.SimpleLinearSumAssignment();
    for (const node of [-1, 0.5, int32Maximum - 1, int32Maximum]) {
      rejects(() => max.addArcWithCapacity(0, node, 1));
      rejects(() => max.addArcsWithCapacity([0, node], [1, 1], [1, 1]));
    }
    for (const node of [-1, 0.5, int32Maximum - 3, int32Maximum]) {
      rejects(() => min.addArcWithCapacityAndUnitCost(node, 1, 1, 1));
      rejects(() => min.addArcsWithCapacityAndUnitCost([0, 0], [1, node], [1, 1], [1, 1]));
      rejects(() => min.setNodeSupply(node, 1));
      rejects(() => min.setNodesSupplies([0, node], [1, -1]));
    }
    for (const node of [-1, 0.5, Math.floor(int32Maximum / 2), int32Maximum]) {
      rejects(() => assignment.addArcWithCost(0, node, 1));
      rejects(() => assignment.addArcsWithCost([0, node], [0, 1], [1, 1]));
    }
    rejects(() => min.setNodeSupply(5, maximum + 1n));
    assert(max.numArcs() === 0 && max.numNodes() === 0 && min.numArcs() === 0 && min.numNodes() === 0 &&
      assignment.numArcs() === 0 && assignment.numNodes() === 0, 'Invalid batches/supply must not grow graph state');
    max.addArcWithCapacity(0, 1, 3);
    min.addArcWithCapacityAndUnitCost(0, 1, 2, 3); min.setNodesSupplies([0, 1], [2, -2]);
    assignment.addArcWithCost(0, 0, -4);
    assert((await max.solve({ ...networkFlowExecutionOptions(), source: 0, sink: 1 })).optimalFlow === 3n, 'Max-flow recovery');
    assert((await min.solve(networkFlowExecutionOptions())).optimalCost === 6n, 'Min-cost recovery');
    assert((await assignment.solve(networkFlowExecutionOptions())).optimalCost === -4n, 'Assignment recovery');
    // Inclusive construction limits can be checked without allocating native graphs of this size.
    const edgeMax = new api.SimpleMaxFlow(); edgeMax.addArcWithCapacity(0, int32Maximum - 2, 1);
    const edgeMin = new api.SimpleMinCostFlow(); edgeMin.addArcWithCapacityAndUnitCost(0, int32Maximum - 4, 1, 1);
    const edgeAssignment = new api.SimpleLinearSumAssignment(); edgeAssignment.addArcWithCost(0, Math.floor(int32Maximum / 2) - 1, 1);
    assert(edgeMax.numNodes() === int32Maximum - 1 && edgeMin.numNodes() === int32Maximum - 3 &&
      edgeAssignment.numNodes() === Math.floor(int32Maximum / 2), 'Construction bounds are inclusive');
    return { status: 0, objectiveValue: 3 };
  },
}, {
  id: 'network_flow.numerical.min_cost_ranges', name: 'Min-cost flow supply and cost range statuses',
  solver: 'network-flow', source: 'ortools/graph/min_cost_flow.cc',
  upstream: 'SimpleMinCostFlow::SolveWithPossibleAdjustment', tags: ['native-contract', 'numerical'],
  async run(api) {
    const flow = new api.SimpleMinCostFlow();
    const arc = flow.addArcWithCapacityAndUnitCost(0, 1, 3, 2);
    for (const supplies of [[maximum, 1n], [-maximum, -1n], [0n, minimum]]) {
      flow.setNodesSupplies([0, 1], supplies);
      for (const maxFlowWithMinCost of [false, true]) {
        const invalid = await flow.solve({ ...networkFlowExecutionOptions(), maxFlowWithMinCost });
        assert(invalid.status === api.SimpleMinCostFlowStatus.BAD_CAPACITY_RANGE, 'Unsafe supply sums/magnitudes report native range status');
        rejects(() => invalid.flow(arc), false);
      }
    }
    flow.setNodesSupplies([0, 1], [3, -3]);
    const recovered = await flow.solve(networkFlowExecutionOptions());
    assert(recovered.status === api.SimpleMinCostFlowStatus.OPTIMAL && recovered.optimalCost === 6n && recovered.flow(arc) === 3n,
      'Valid supplies recover after native range failures');
    for (const cost of [minimum, maximum]) {
      const unsafe = new api.SimpleMinCostFlow();
      unsafe.addArcWithCapacityAndUnitCost(0, 1, 1, cost); unsafe.setNodesSupplies([0, 1], [1, -1]);
      assert((await unsafe.solve(networkFlowExecutionOptions())).status === api.SimpleMinCostFlowStatus.BAD_COST_RANGE, 'Unsafe costs report native range status');
    }
    assert(recovered.optimalCost === 6n, 'Earlier result remains unchanged');
    return { status: recovered.status, objectiveValue: 6 };
  },
}, {
  id: 'network_flow.numerical.assignment_scaling', name: 'Assignment signed cost scaling boundaries',
  solver: 'network-flow', source: 'ortools/graph/assignment.cc',
  upstream: 'SimpleLinearSumAssignment::Solve', tags: ['native-contract', 'numerical'],
  async run(api) {
    for (const cost of [minimum, -maximum, -(maximum / 2n) - 1n, maximum]) {
      const assignment = new api.SimpleLinearSumAssignment();
      assignment.addArcWithCost(0, 0, cost);
      const invalid = await assignment.solve(networkFlowExecutionOptions());
      assert(invalid.status === api.SimpleLinearSumAssignmentStatus.POSSIBLE_OVERFLOW, 'Both signs of unsafe scaling report native overflow');
      rejects(() => invalid.rightMate(0), false);
    }
    const exact = 9_007_199_254_740_993n;
    const assignment = new api.SimpleLinearSumAssignment(); assignment.addArcWithCost(0, 0, -exact);
    const result = await assignment.solve(networkFlowExecutionOptions());
    assert(result.status === api.SimpleLinearSumAssignmentStatus.OPTIMAL && result.optimalCost === -exact &&
      result.assignmentCost(0) === -exact && result.rightMate(0) === 0, 'Safe large negative costs retain exact native results');
    return { status: result.status, objectiveValue: Number(result.optimalCost) };
  },
}, {
  id: 'network_flow.numerical.max_flow_statuses', name: 'Max-flow exact capacities and native status boundaries',
  solver: 'network-flow', source: 'ortools/graph/max_flow.cc',
  upstream: 'SimpleMaxFlow::Solve', tags: ['native-contract', 'numerical'],
  async run(api) {
    const flow = new api.SimpleMaxFlow(); const arc = flow.addArcWithCapacity(0, 1, maximum);
    const exact = await flow.solve({ ...networkFlowExecutionOptions(), source: 0, sink: 1 });
    assert(exact.status === api.SimpleMaxFlowStatus.OPTIMAL && exact.optimalFlow === maximum && exact.flow(arc) === maximum,
      'Native max-flow retains full positive int64 capacity');
    flow.addArcWithCapacity(0, 1, 1);
    const overflow = await flow.solve({ ...networkFlowExecutionOptions(), source: 0, sink: 1 });
    assert(overflow.status === api.SimpleMaxFlowStatus.POSSIBLE_OVERFLOW, 'Flow overflow remains native status');
    const sameNode = await flow.solve({ ...networkFlowExecutionOptions(), source: 0, sink: 0 });
    assert(sameNode.status === api.SimpleMaxFlowStatus.BAD_INPUT, 'Equal source/sink remains native bad input');
    const outside = await flow.solve({ ...networkFlowExecutionOptions(), source: int32Maximum, sink: 1 });
    assert(outside.status === api.SimpleMaxFlowStatus.OPTIMAL && outside.optimalFlow === 0n && outside.flow(arc) === 0n,
      'Source beyond graph retains native optimal zero semantics');
    flow.setArcCapacity(arc, 2);
    const recovered = await flow.solve({ ...networkFlowExecutionOptions(), source: 0, sink: 1 });
    assert(recovered.optimalFlow === 3n && exact.optimalFlow === maximum, 'Recovery preserves previous exact result');
    const empty = await new api.SimpleMaxFlow().solve({ ...networkFlowExecutionOptions(), source: 0, sink: 1 });
    assert(empty.status === api.SimpleMaxFlowStatus.OPTIMAL && empty.optimalFlow === 0n, 'Empty graph returns native zero');
    return { status: recovered.status, objectiveValue: 3 };
  },
}];
