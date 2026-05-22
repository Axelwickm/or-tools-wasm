import type { FixtureMode, SharedCase, SharedCaseResult } from './shared_case.ts';
import { fixtureModes, passedCase, withWorkerBridgeMode } from './shared_case.ts';

export type NetworkFlowCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: FixtureMode;
  ok: boolean;
  status: number;
  objectiveValue: number;
} & SharedCaseResult;

type SimpleMaxFlowLike = {
  add_arcs_with_capacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>): number[];
  num_nodes(): number;
  num_arcs(): number;
  tail(arc: number): number;
  head(arc: number): number;
  capacity(arc: number): number;
  solve(source: number, sink: number): Promise<number>;
  optimal_flow(): number;
  flow(arc: number): number;
  flows(arcs: ArrayLike<number>): number[];
  get_source_side_min_cut(): number[];
  get_sink_side_min_cut(): number[];
};

type SimpleMinCostFlowLike = {
  add_arcs_with_capacity_and_unit_cost(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>, unitCosts: ArrayLike<number>): number[];
  set_nodes_supplies(nodes: ArrayLike<number>, supplies: ArrayLike<number>): void;
  num_nodes(): number;
  num_arcs(): number;
  tail(arc: number): number;
  head(arc: number): number;
  capacity(arc: number): number;
  unit_cost(arc: number): number;
  supply(node: number): number;
  solve(): Promise<number>;
  optimal_cost(): number;
  maximum_flow(): number;
  flow(arc: number): number;
  flows(arcs: ArrayLike<number>): number[];
};

type SimpleLinearSumAssignmentLike = {
  add_arcs_with_cost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<number>): number[];
  num_nodes(): number;
  num_arcs(): number;
  left_node(arc: number): number;
  right_node(arc: number): number;
  cost(arc: number): number;
  solve(): Promise<number>;
  optimal_cost(): number;
  right_mate(leftNode: number): number;
  assignment_cost(leftNode: number): number;
};

export type NetworkFlowApi = {
  initNetworkFlow(): Promise<void>;
  SimpleMaxFlow: {
    readonly OPTIMAL: number;
    new(): SimpleMaxFlowLike;
  };
  SimpleMinCostFlow: {
    readonly OPTIMAL: number;
    new(): SimpleMinCostFlowLike;
  };
  SimpleLinearSumAssignment: {
    readonly OPTIMAL: number;
    new(): SimpleLinearSumAssignmentLike;
  };
  setWorkerBridgeEnabled: (enabled: boolean) => void;
  isWorkerBridgeEnabled: () => boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(actual: number, expected: number, message: string) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}

async function runMaxFlowSample(api: NetworkFlowApi, mode: FixtureMode): Promise<{ status: number; objectiveValue: number }> {
  // TEMP: parity - mirrors ortools/graph/samples/simple_max_flow_program.py
  // with the same graph, source, sink, optimal flow, and flow/min-cut checks.
  const startNodes = [0, 0, 0, 1, 1, 2, 2, 3, 3];
  const endNodes = [1, 2, 3, 2, 4, 3, 4, 2, 4];
  const capacities = [20, 30, 10, 40, 30, 10, 20, 5, 20];
  const maxFlow = new api.SimpleMaxFlow();
  const allArcs = maxFlow.add_arcs_with_capacity(startNodes, endNodes, capacities);

  assertNumber(maxFlow.num_nodes(), 5, `SimpleMaxFlow (${mode}) num_nodes`);
  assertNumber(maxFlow.num_arcs(), 9, `SimpleMaxFlow (${mode}) num_arcs`);
  assertNumber(allArcs.length, 9, `SimpleMaxFlow (${mode}) added arcs length`);
  assertNumber(maxFlow.tail(0), 0, `SimpleMaxFlow (${mode}) tail(0)`);
  assertNumber(maxFlow.head(4), 4, `SimpleMaxFlow (${mode}) head(4)`);
  assertNumber(maxFlow.capacity(8), 20, `SimpleMaxFlow (${mode}) capacity(8)`);

  const status = await maxFlow.solve(0, 4);
  assertNumber(status, api.SimpleMaxFlow.OPTIMAL, `SimpleMaxFlow (${mode}) status`);
  assertNumber(maxFlow.optimal_flow(), 60, `SimpleMaxFlow (${mode}) optimal_flow`);
  const flows = maxFlow.flows(allArcs);
  assertNumber(flows.length, allArcs.length, `SimpleMaxFlow (${mode}) flows length`);
  assertNumber(flows[0] + flows[1] + flows[2], 60, `SimpleMaxFlow (${mode}) source outflow`);
  assertNumber(flows[4] + flows[6] + flows[8], 60, `SimpleMaxFlow (${mode}) sink inflow`);
  for (const [arc, flow] of flows.entries()) {
    assert(flow >= 0 && flow <= capacities[arc], `SimpleMaxFlow (${mode}) arc ${arc} flow within capacity`);
    assertNumber(maxFlow.flow(arc), flow, `SimpleMaxFlow (${mode}) flow accessor ${arc}`);
  }
  const sourceSide = maxFlow.get_source_side_min_cut();
  const sinkSide = maxFlow.get_sink_side_min_cut();
  assert(sourceSide.includes(0), `SimpleMaxFlow (${mode}) source-side min cut contains source`);
  assert(sinkSide.includes(4), `SimpleMaxFlow (${mode}) sink-side min cut contains sink`);
  return { status, objectiveValue: maxFlow.optimal_flow() };
}

async function runMinCostFlowSample(api: NetworkFlowApi, mode: FixtureMode): Promise<{ status: number; objectiveValue: number }> {
  // TEMP: parity - mirrors ortools/graph/samples/simple_min_cost_flow_program.py
  // with the same arcs, supplies, optimal status, cost, and per-arc cost sum.
  const startNodes = [0, 0, 1, 1, 1, 2, 2, 3, 4];
  const endNodes = [1, 2, 2, 3, 4, 3, 4, 4, 2];
  const capacities = [15, 8, 20, 4, 10, 15, 4, 20, 5];
  const unitCosts = [4, 4, 2, 2, 6, 1, 3, 2, 3];
  const supplies = [20, 0, 0, -5, -15];
  const minCostFlow = new api.SimpleMinCostFlow();
  const allArcs = minCostFlow.add_arcs_with_capacity_and_unit_cost(startNodes, endNodes, capacities, unitCosts);
  minCostFlow.set_nodes_supplies([0, 1, 2, 3, 4], supplies);

  assertNumber(minCostFlow.num_nodes(), 5, `SimpleMinCostFlow (${mode}) num_nodes`);
  assertNumber(minCostFlow.num_arcs(), 9, `SimpleMinCostFlow (${mode}) num_arcs`);
  assertNumber(allArcs.length, 9, `SimpleMinCostFlow (${mode}) added arcs length`);
  assertNumber(minCostFlow.tail(0), 0, `SimpleMinCostFlow (${mode}) tail(0)`);
  assertNumber(minCostFlow.head(8), 2, `SimpleMinCostFlow (${mode}) head(8)`);
  assertNumber(minCostFlow.capacity(1), 8, `SimpleMinCostFlow (${mode}) capacity(1)`);
  assertNumber(minCostFlow.unit_cost(4), 6, `SimpleMinCostFlow (${mode}) unit_cost(4)`);
  assertNumber(minCostFlow.supply(4), -15, `SimpleMinCostFlow (${mode}) supply(4)`);

  const status = await minCostFlow.solve();
  assertNumber(status, api.SimpleMinCostFlow.OPTIMAL, `SimpleMinCostFlow (${mode}) status`);
  assertNumber(minCostFlow.optimal_cost(), 150, `SimpleMinCostFlow (${mode}) optimal_cost`);
  assertNumber(minCostFlow.maximum_flow(), 20, `SimpleMinCostFlow (${mode}) maximum_flow`);
  const flows = minCostFlow.flows(allArcs);
  assertNumber(flows.length, allArcs.length, `SimpleMinCostFlow (${mode}) flows length`);
  const cost = flows.reduce((sum, flow, arc) => sum + flow * unitCosts[arc], 0);
  assertNumber(cost, 150, `SimpleMinCostFlow (${mode}) recomputed cost`);
  for (const [arc, flow] of flows.entries()) {
    assert(flow >= 0 && flow <= capacities[arc], `SimpleMinCostFlow (${mode}) arc ${arc} flow within capacity`);
    assertNumber(minCostFlow.flow(arc), flow, `SimpleMinCostFlow (${mode}) flow accessor ${arc}`);
  }
  return { status, objectiveValue: minCostFlow.optimal_cost() };
}

async function runAssignmentSample(api: NetworkFlowApi, mode: FixtureMode): Promise<{ status: number; objectiveValue: number }> {
  // TEMP: parity - mirrors ortools/graph/samples/assignment_linear_sum_assignment.py
  // with the same cost matrix, optimal status, assignment, and optimal cost.
  const costs = [
    [90, 76, 75, 70],
    [35, 85, 55, 65],
    [125, 95, 90, 105],
    [45, 110, 95, 115],
  ];
  const leftNodes: number[] = [];
  const rightNodes: number[] = [];
  const arcCosts: number[] = [];
  for (let worker = 0; worker < costs.length; ++worker) {
    for (let task = 0; task < costs[worker].length; ++task) {
      leftNodes.push(worker);
      rightNodes.push(task);
      arcCosts.push(costs[worker][task]);
    }
  }

  const assignment = new api.SimpleLinearSumAssignment();
  const allArcs = assignment.add_arcs_with_cost(leftNodes, rightNodes, arcCosts);
  assertNumber(assignment.num_nodes(), 4, `SimpleLinearSumAssignment (${mode}) num_nodes`);
  assertNumber(assignment.num_arcs(), 16, `SimpleLinearSumAssignment (${mode}) num_arcs`);
  assertNumber(allArcs.length, 16, `SimpleLinearSumAssignment (${mode}) added arcs length`);
  assertNumber(assignment.left_node(0), 0, `SimpleLinearSumAssignment (${mode}) left_node(0)`);
  assertNumber(assignment.right_node(15), 3, `SimpleLinearSumAssignment (${mode}) right_node(15)`);
  assertNumber(assignment.cost(10), 90, `SimpleLinearSumAssignment (${mode}) cost(10)`);

  const status = await assignment.solve();
  assertNumber(status, api.SimpleLinearSumAssignment.OPTIMAL, `SimpleLinearSumAssignment (${mode}) status`);
  assertNumber(assignment.optimal_cost(), 265, `SimpleLinearSumAssignment (${mode}) optimal_cost`);
  const expectedMates = [3, 2, 1, 0];
  const expectedCosts = [70, 55, 95, 45];
  for (let worker = 0; worker < expectedMates.length; ++worker) {
    assertNumber(assignment.right_mate(worker), expectedMates[worker], `SimpleLinearSumAssignment (${mode}) right_mate(${worker})`);
    assertNumber(assignment.assignment_cost(worker), expectedCosts[worker], `SimpleLinearSumAssignment (${mode}) assignment_cost(${worker})`);
  }
  return { status, objectiveValue: assignment.optimal_cost() };
}

type NetworkFlowCase = SharedCase<NetworkFlowApi, { status: number; objectiveValue: number }>;

export const networkFlowCases: NetworkFlowCase[] = [
  {
    id: 'network_flow.sample.simple_max_flow_program',
    name: 'simple_max_flow_program.py',
    solver: 'network-flow',
    source: 'ortools/graph/samples/simple_max_flow_program.py',
    upstream: 'simple_max_flow_program.py',
    tags: ['python-sample-parity', 'max-flow'],
    run: (api, context) => runMaxFlowSample(api, context.mode ?? 'direct'),
  },
  {
    id: 'network_flow.sample.simple_min_cost_flow_program',
    name: 'simple_min_cost_flow_program.py',
    solver: 'network-flow',
    source: 'ortools/graph/samples/simple_min_cost_flow_program.py',
    upstream: 'simple_min_cost_flow_program.py',
    tags: ['python-sample-parity', 'min-cost-flow'],
    run: (api, context) => runMinCostFlowSample(api, context.mode ?? 'direct'),
  },
  {
    id: 'network_flow.sample.assignment_linear_sum_assignment',
    name: 'assignment_linear_sum_assignment.py',
    solver: 'network-flow',
    source: 'ortools/graph/samples/assignment_linear_sum_assignment.py',
    upstream: 'assignment_linear_sum_assignment.py',
    tags: ['python-sample-parity', 'assignment'],
    run: (api, context) => runAssignmentSample(api, context.mode ?? 'direct'),
  },
];

export async function runNetworkFlowCases(api: NetworkFlowApi): Promise<NetworkFlowCaseResult[]> {
  await api.initNetworkFlow();
  const results: NetworkFlowCaseResult[] = [];
  for (const mode of fixtureModes) {
    await withWorkerBridgeMode(api, mode, 'Network Flow', async () => {
      for (const testCase of networkFlowCases) {
        const result = await testCase.run(api, { mode });
        results.push(passedCase({ ...testCase, name: `${testCase.name} (${mode})` }, { mode }, result));
      }
    });
  }
  return results;
}
