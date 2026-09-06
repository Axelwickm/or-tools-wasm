import type { ExecutorFixtureMode, SharedCase, SharedCaseResult } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  solverJobStates,
} from '../../../harness/shared_case.ts';
import { networkFlowExecutionOptions, setNetworkFlowMode } from './execution.ts';

export type NetworkFlowCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
  status: number;
  objectiveValue: number;
} & SharedCaseResult<ExecutorFixtureMode>;

type SolveOptions = {
  executor?: 'direct' | 'worker' | ReturnType<typeof serverExecutorConfiguration>;
  onEvent?: (event: { type: string; status?: { state: number } }) => void;
};

type SimpleMaxFlowLike = {
  addArcsWithCapacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>): number[];
  numNodes(): number;
  numArcs(): number;
  tail(arc: number): number;
  head(arc: number): number;
  capacity(arc: number): bigint;
  solve(source: number, sink: number, options?: SolveOptions): Promise<number>;
  optimalFlow(): bigint;
  flow(arc: number): bigint;
  flows(arcs: ArrayLike<number>): bigint[];
  getSourceSideMinCut(): number[];
  getSinkSideMinCut(): number[];
};

type SimpleMinCostFlowLike = {
  addArcsWithCapacityAndUnitCost(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>, unitCosts: ArrayLike<number>): number[];
  setNodesSupplies(nodes: ArrayLike<number>, supplies: ArrayLike<number>): void;
  numNodes(): number;
  numArcs(): number;
  tail(arc: number): number;
  head(arc: number): number;
  capacity(arc: number): bigint;
  unitCost(arc: number): bigint;
  supply(node: number): bigint;
  solve(options?: SolveOptions): Promise<number>;
  optimalCost(): bigint;
  maximumFlow(): bigint;
  flow(arc: number): bigint;
  flows(arcs: ArrayLike<number>): bigint[];
};

type SimpleLinearSumAssignmentLike = {
  addArcsWithCost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<number>): number[];
  numNodes(): number;
  numArcs(): number;
  leftNode(arc: number): number;
  rightNode(arc: number): number;
  cost(arc: number): bigint;
  solve(options?: SolveOptions): Promise<number>;
  optimalCost(): bigint;
  rightMate(leftNode: number): number;
  assignmentCost(leftNode: number): bigint;
};

export type NetworkFlowApi = {
  SimpleMaxFlow: {
    new(): SimpleMaxFlowLike;
  };
  SimpleMaxFlowStatus: { readonly OPTIMAL: 0 };
  SimpleMinCostFlow: {
    new(): SimpleMinCostFlowLike;
  };
  SimpleMinCostFlowStatus: { readonly OPTIMAL: 1 };
  SimpleLinearSumAssignment: {
    new(): SimpleLinearSumAssignmentLike;
  };
  SimpleLinearSumAssignmentStatus: { readonly OPTIMAL: 0 };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(actual: number | bigint, expected: number | bigint, message: string) {
  const equal = typeof actual === typeof expected
    ? actual === expected
    : BigInt(actual) === BigInt(expected);
  assert(equal, `${message}: expected ${expected}, got ${actual}`);
}

function lifecycleStates() {
  const states: number[] = [];
  return {
    states,
    options: {
      ...networkFlowExecutionOptions(),
      onEvent(event: { type: string; status?: { state: number } }) {
        if (event.type === 'status' && event.status) states.push(event.status.state);
      },
    },
  };
}

function assertLifecycle(states: number[], label: string) {
  assert(states.includes(solverJobStates.RUNNING), `${label} did not emit RUNNING status`);
  assert(states.includes(solverJobStates.SUCCEEDED), `${label} did not emit SUCCEEDED status`);
}

async function runMaxFlowSample(api: NetworkFlowApi, mode: ExecutorFixtureMode): Promise<{ status: number; objectiveValue: number }> {
  // TEMP: parity - mirrors ortools/graph/samples/simple_max_flow_program.py
  // with the same graph, source, sink, optimal flow, and flow/min-cut checks.
  const startNodes = [0, 0, 0, 1, 1, 2, 2, 3, 3];
  const endNodes = [1, 2, 3, 2, 4, 3, 4, 2, 4];
  const capacities = [20, 30, 10, 40, 30, 10, 20, 5, 20];
  const maxFlow = new api.SimpleMaxFlow();
  const allArcs = maxFlow.addArcsWithCapacity(startNodes, endNodes, capacities);

  assertNumber(maxFlow.numNodes(), 5, `SimpleMaxFlow (${mode}) numNodes`);
  assertNumber(maxFlow.numArcs(), 9, `SimpleMaxFlow (${mode}) numArcs`);
  assertNumber(allArcs.length, 9, `SimpleMaxFlow (${mode}) added arcs length`);
  assertNumber(maxFlow.tail(0), 0, `SimpleMaxFlow (${mode}) tail(0)`);
  assertNumber(maxFlow.head(4), 4, `SimpleMaxFlow (${mode}) head(4)`);
  assertNumber(maxFlow.capacity(8), 20, `SimpleMaxFlow (${mode}) capacity(8)`);

  const lifecycle = lifecycleStates();
  const status = await maxFlow.solve(0, 4, lifecycle.options);
  assertLifecycle(lifecycle.states, `SimpleMaxFlow (${mode})`);
  assertNumber(status, api.SimpleMaxFlowStatus.OPTIMAL, `SimpleMaxFlow (${mode}) status`);
  assertNumber(maxFlow.optimalFlow(), 60, `SimpleMaxFlow (${mode}) optimalFlow`);
  const flows = maxFlow.flows(allArcs);
  assertNumber(flows.length, allArcs.length, `SimpleMaxFlow (${mode}) flows length`);
  assertNumber(flows[0] + flows[1] + flows[2], 60, `SimpleMaxFlow (${mode}) source outflow`);
  assertNumber(flows[4] + flows[6] + flows[8], 60, `SimpleMaxFlow (${mode}) sink inflow`);
  for (const [arc, flow] of flows.entries()) {
    assert(flow >= 0n && flow <= BigInt(capacities[arc]), `SimpleMaxFlow (${mode}) arc ${arc} flow within capacity`);
    assertNumber(maxFlow.flow(arc), flow, `SimpleMaxFlow (${mode}) flow accessor ${arc}`);
  }
  const sourceSide = maxFlow.getSourceSideMinCut();
  const sinkSide = maxFlow.getSinkSideMinCut();
  assert(sourceSide.includes(0), `SimpleMaxFlow (${mode}) source-side min cut contains source`);
  assert(sinkSide.includes(4), `SimpleMaxFlow (${mode}) sink-side min cut contains sink`);
  return { status, objectiveValue: Number(maxFlow.optimalFlow()) };
}

async function runMinCostFlowSample(api: NetworkFlowApi, mode: ExecutorFixtureMode): Promise<{ status: number; objectiveValue: number }> {
  // TEMP: parity - mirrors ortools/graph/samples/simple_min_cost_flow_program.py
  // with the same arcs, supplies, optimal status, cost, and per-arc cost sum.
  const startNodes = [0, 0, 1, 1, 1, 2, 2, 3, 4];
  const endNodes = [1, 2, 2, 3, 4, 3, 4, 4, 2];
  const capacities = [15, 8, 20, 4, 10, 15, 4, 20, 5];
  const unitCosts = [4, 4, 2, 2, 6, 1, 3, 2, 3];
  const supplies = [20, 0, 0, -5, -15];
  const minCostFlow = new api.SimpleMinCostFlow();
  const allArcs = minCostFlow.addArcsWithCapacityAndUnitCost(startNodes, endNodes, capacities, unitCosts);
  minCostFlow.setNodesSupplies([0, 1, 2, 3, 4], supplies);

  assertNumber(minCostFlow.numNodes(), 5, `SimpleMinCostFlow (${mode}) numNodes`);
  assertNumber(minCostFlow.numArcs(), 9, `SimpleMinCostFlow (${mode}) numArcs`);
  assertNumber(allArcs.length, 9, `SimpleMinCostFlow (${mode}) added arcs length`);
  assertNumber(minCostFlow.tail(0), 0, `SimpleMinCostFlow (${mode}) tail(0)`);
  assertNumber(minCostFlow.head(8), 2, `SimpleMinCostFlow (${mode}) head(8)`);
  assertNumber(minCostFlow.capacity(1), 8, `SimpleMinCostFlow (${mode}) capacity(1)`);
  assertNumber(minCostFlow.unitCost(4), 6, `SimpleMinCostFlow (${mode}) unitCost(4)`);
  assertNumber(minCostFlow.supply(4), -15, `SimpleMinCostFlow (${mode}) supply(4)`);

  const lifecycle = lifecycleStates();
  const status = await minCostFlow.solve(lifecycle.options);
  assertLifecycle(lifecycle.states, `SimpleMinCostFlow (${mode})`);
  assertNumber(status, api.SimpleMinCostFlowStatus.OPTIMAL, `SimpleMinCostFlow (${mode}) status`);
  assertNumber(minCostFlow.optimalCost(), 150, `SimpleMinCostFlow (${mode}) optimalCost`);
  assertNumber(minCostFlow.maximumFlow(), 20, `SimpleMinCostFlow (${mode}) maximumFlow`);
  const flows = minCostFlow.flows(allArcs);
  assertNumber(flows.length, allArcs.length, `SimpleMinCostFlow (${mode}) flows length`);
  const cost = flows.reduce((sum, flow, arc) => sum + flow * BigInt(unitCosts[arc]), 0n);
  assertNumber(cost, 150, `SimpleMinCostFlow (${mode}) recomputed cost`);
  for (const [arc, flow] of flows.entries()) {
    assert(flow >= 0n && flow <= BigInt(capacities[arc]), `SimpleMinCostFlow (${mode}) arc ${arc} flow within capacity`);
    assertNumber(minCostFlow.flow(arc), flow, `SimpleMinCostFlow (${mode}) flow accessor ${arc}`);
  }
  return { status, objectiveValue: Number(minCostFlow.optimalCost()) };
}

async function runAssignmentSample(api: NetworkFlowApi, mode: ExecutorFixtureMode): Promise<{ status: number; objectiveValue: number }> {
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
  const allArcs = assignment.addArcsWithCost(leftNodes, rightNodes, arcCosts);
  assertNumber(assignment.numNodes(), 4, `SimpleLinearSumAssignment (${mode}) numNodes`);
  assertNumber(assignment.numArcs(), 16, `SimpleLinearSumAssignment (${mode}) numArcs`);
  assertNumber(allArcs.length, 16, `SimpleLinearSumAssignment (${mode}) added arcs length`);
  assertNumber(assignment.leftNode(0), 0, `SimpleLinearSumAssignment (${mode}) leftNode(0)`);
  assertNumber(assignment.rightNode(15), 3, `SimpleLinearSumAssignment (${mode}) rightNode(15)`);
  assertNumber(assignment.cost(10), 90, `SimpleLinearSumAssignment (${mode}) cost(10)`);

  const lifecycle = lifecycleStates();
  const status = await assignment.solve(lifecycle.options);
  assertLifecycle(lifecycle.states, `SimpleLinearSumAssignment (${mode})`);
  assertNumber(status, api.SimpleLinearSumAssignmentStatus.OPTIMAL, `SimpleLinearSumAssignment (${mode}) status`);
  assertNumber(assignment.optimalCost(), 265, `SimpleLinearSumAssignment (${mode}) optimalCost`);
  const expectedMates = [3, 2, 1, 0];
  const expectedCosts = [70, 55, 95, 45];
  for (let worker = 0; worker < expectedMates.length; ++worker) {
    assertNumber(assignment.rightMate(worker), expectedMates[worker], `SimpleLinearSumAssignment (${mode}) rightMate(${worker})`);
    assertNumber(assignment.assignmentCost(worker), expectedCosts[worker], `SimpleLinearSumAssignment (${mode}) assignmentCost(${worker})`);
  }
  return { status, objectiveValue: Number(assignment.optimalCost()) };
}

type NetworkFlowCase = SharedCase<NetworkFlowApi, { status: number; objectiveValue: number }, ExecutorFixtureMode>;

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

export async function runNetworkFlowCases(
  api: NetworkFlowApi,
  options: { modes?: readonly ExecutorFixtureMode[] } = {},
): Promise<NetworkFlowCaseResult[]> {
  const results: NetworkFlowCaseResult[] = [];
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  for (const mode of modes) {
    setNetworkFlowMode(mode);
    for (const testCase of networkFlowCases) {
      const result = await testCase.run(api, { mode });
      results.push(passedCase({ ...testCase, name: `${testCase.name} (${mode})` }, { mode }, result));
    }
  }
  setNetworkFlowMode('direct');
  return results;
}
