import { CloudExecutor } from '../cloud_executor.js';
import {
  resolveExecutorConfiguration,
  type ExecutorSelection,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectNetworkFlowExecutor } from './direct_executor.js';
import {
  networkFlowProtocol,
  type NetworkFlowExecutor,
  type NetworkFlowOperation,
  type NetworkFlowResult,
} from './protocol.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { toIndex, toInt64, type IntValue } from '../int64.js';

const INT32_MAX = 2_147_483_647;

export type NetworkFlowEvent = SolverJobEvent;
export type NetworkFlowSolveOptions = {
  executor?: ExecutorSelection;
  onEvent?: (event: NetworkFlowEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export type MaxFlowSolveOptions = NetworkFlowSolveOptions & { source: number; sink: number };

/** Independent answer from one max-flow solve. */
export class MaxFlowResult {
  readonly status: SimpleMaxFlowStatus;
  readonly optimalFlow: bigint;
  private readonly arcFlows: readonly bigint[];
  private readonly sourceCut: readonly number[];
  private readonly sinkCut: readonly number[];

  constructor(result: NetworkFlowResult) {
    this.status = result.status;
    this.optimalFlow = result.optimalFlow;
    this.arcFlows = [...result.flows];
    this.sourceCut = [...result.sourceSideMinCut];
    this.sinkCut = [...result.sinkSideMinCut];
  }

  flow(arc: number): bigint { assertIndex(arc, this.arcFlows.length, 'arc'); return this.arcFlows[arc]; }
  flows(arcs: ArrayLike<number>): bigint[] { return toIndexArray(arcs, 'arcs').map((arc) => this.flow(arc)); }
  getSourceSideMinCut(): number[] { return [...this.sourceCut]; }
  getSinkSideMinCut(): number[] { return [...this.sinkCut]; }
}

/** Independent answer from one min-cost-flow solve. */
export class MinCostFlowResult {
  readonly status: SimpleMinCostFlowStatus;
  readonly optimalCost: bigint;
  readonly maximumFlow: bigint;
  private readonly arcFlows: readonly bigint[];

  constructor(result: NetworkFlowResult) {
    this.status = result.status;
    this.optimalCost = result.optimalCost;
    this.maximumFlow = result.maximumFlow;
    this.arcFlows = [...result.flows];
  }

  flow(arc: number): bigint { assertIndex(arc, this.arcFlows.length, 'arc'); return this.arcFlows[arc]; }
  flows(arcs: ArrayLike<number>): bigint[] { return toIndexArray(arcs, 'arcs').map((arc) => this.flow(arc)); }
}

/** Independent answer from one linear-sum-assignment solve. */
export class LinearSumAssignmentResult {
  readonly status: SimpleLinearSumAssignmentStatus;
  readonly optimalCost: bigint;
  private readonly mates: readonly number[];
  private readonly costs: readonly bigint[];

  constructor(result: NetworkFlowResult) {
    this.status = result.status;
    this.optimalCost = result.optimalCost;
    this.mates = [...result.rightMates];
    this.costs = [...result.assignmentCosts];
  }

  rightMate(leftNode: number): number { assertIndex(leftNode, this.mates.length, 'left node'); return this.mates[leftNode]; }
  assignmentCost(leftNode: number): bigint { assertIndex(leftNode, this.costs.length, 'left node'); return this.costs[leftNode]; }
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

async function createNetworkFlowWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-network-flow' },
  );
}

const directExecutor = new DirectNetworkFlowExecutor();
const workerExecutor = new SolverWorkerExecutor(networkFlowProtocol, createNetworkFlowWorker);

function createNetworkFlowExecutor(selection: ExecutorSelection = 'auto'): NetworkFlowExecutor {
  return createResolvedExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): NetworkFlowExecutor {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new SolverServerExecutor(networkFlowProtocol, configuration);
    case 'cloud': return new CloudExecutor('network-flow', { test: configuration.test });
  }
}

function assertEqualLengths(name: string, ...values: ArrayLike<unknown>[]) {
  const expected = values[0]?.length ?? 0;
  for (const value of values) {
    if (value.length !== expected) {
      throw new Error(`${name}: all input arrays must have the same length.`);
    }
  }
}

function toIndexArray(values: ArrayLike<number>, name: string): number[] {
  return Array.from(values, (value, index) => toIndex(value, `${name}[${index}]`, INT32_MAX));
}

function toInt64Array(values: ArrayLike<IntValue>, name: string): bigint[] {
  return Array.from(values, (value, index) => toInt64(value, `${name}[${index}]`));
}

function assertIndex(index: number, length: number, label: string) {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`${label} index ${index} is out of range.`);
  }
}


async function solveNetworkFlow(
  operation: NetworkFlowOperation,
  options: NetworkFlowSolveOptions = {},
): Promise<NetworkFlowResult> {
  const executor = createNetworkFlowExecutor(options.executor);
  return executeSolverJob(executor, operation, {
    signal: options.signal,
    onEvent: options.onEvent,
  });
}

export enum SimpleMaxFlowStatus {
  OPTIMAL = 0,
  POSSIBLE_OVERFLOW = 1,
  BAD_INPUT = 2,
  BAD_RESULT = 3,
}

export enum SimpleMinCostFlowStatus {
  NOT_SOLVED = 0,
  OPTIMAL = 1,
  FEASIBLE = 2,
  INFEASIBLE = 3,
  UNBALANCED = 4,
  BAD_RESULT = 5,
  BAD_COST_RANGE = 6,
  BAD_CAPACITY_RANGE = 7,
}

export enum SimpleLinearSumAssignmentStatus {
  OPTIMAL = 0,
  INFEASIBLE = 1,
  POSSIBLE_OVERFLOW = 2,
}

export class SimpleMaxFlow {
  private tails: number[] = [];
  private heads: number[] = [];
  private capacities: bigint[] = [];
  private solving = false;

  /** Solve once and return an answer independent of later solves or model changes. */
  async solve(options: MaxFlowSolveOptions): Promise<MaxFlowResult> {
    const { source, sink, ...execution } = options;
    return new MaxFlowResult(await this.run(source, sink, execution));
  }

  private async run(source: number, sink: number, options: NetworkFlowSolveOptions): Promise<NetworkFlowResult> {
    if (this.solving) throw new RuntimeError('SimpleMaxFlow.solve() is already in progress.');
    this.solving = true;
    try {
      return await solveNetworkFlow({
        type: 'maxFlow', tails: [...this.tails], heads: [...this.heads],
        capacities: [...this.capacities],
        source: toIndex(source, 'source', INT32_MAX), sink: toIndex(sink, 'sink', INT32_MAX),
      }, options);
    } finally {
      this.solving = false;
    }
  }

  addArcWithCapacity(tail: number, head: number, capacity: IntValue): number {
    const tailValue = toIndex(tail, 'tail', INT32_MAX);
    const headValue = toIndex(head, 'head', INT32_MAX);
    const capacityValue = toInt64(capacity, 'capacity');
    const arc = this.tails.length;
    this.tails.push(tailValue);
    this.heads.push(headValue);
    this.capacities.push(capacityValue);
    return arc;
  }

  addArcsWithCapacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<IntValue>): number[] {
    const tailValues = toIndexArray(tails, 'tails');
    const headValues = toIndexArray(heads, 'heads');
    const capacityValues = toInt64Array(capacities, 'capacities');
    assertEqualLengths('SimpleMaxFlow.addArcsWithCapacity', tailValues, headValues, capacityValues);
    return tailValues.map((tail, index) => this.addArcWithCapacity(tail, headValues[index], capacityValues[index]));
  }

  setArcCapacity(arc: number, capacity: IntValue): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toInt64Array([capacity], 'capacity')[0];
  }

  setArcsCapacity(arcs: ArrayLike<number>, capacities: ArrayLike<IntValue>): void {
    const arcValues = toIndexArray(arcs, 'arcs');
    const capacityValues = toInt64Array(capacities, 'capacities');
    assertEqualLengths('SimpleMaxFlow.setArcsCapacity', arcValues, capacityValues);
    for (const [index, arc] of arcValues.entries()) this.setArcCapacity(arc, capacityValues[index]);
  }

  numNodes(): number {
    return this.tails.reduce((maxNode, tail, index) => Math.max(maxNode, tail, this.heads[index]), -1) + 1;
  }

  numArcs(): number {
    return this.tails.length;
  }

  tail(arc: number): number {
    assertIndex(arc, this.tails.length, 'arc');
    return this.tails[arc];
  }

  head(arc: number): number {
    assertIndex(arc, this.heads.length, 'arc');
    return this.heads[arc];
  }

  capacity(arc: number): bigint {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.capacities[arc];
  }

}

export class SimpleMinCostFlow {
  private tails: number[] = [];
  private heads: number[] = [];
  private capacities: bigint[] = [];
  private unitCosts: bigint[] = [];
  private nodeSupplies: bigint[] = [];
  private solving = false;

  /** Solve once and return an answer independent of later solves or model changes. */
  async solve(options: NetworkFlowSolveOptions & { maxFlowWithMinCost?: boolean } = {}): Promise<MinCostFlowResult> {
    const { maxFlowWithMinCost = false, ...execution } = options;
    return new MinCostFlowResult(await this.run(maxFlowWithMinCost, execution));
  }

  private async run(solveMaxFlowWithMinCost: boolean, options: NetworkFlowSolveOptions): Promise<NetworkFlowResult> {
    if (this.solving) throw new RuntimeError('SimpleMinCostFlow.solve() is already in progress.');
    this.solving = true;
    try {
      return await solveNetworkFlow({
        type: 'minCostFlow', tails: [...this.tails], heads: [...this.heads],
        capacities: [...this.capacities], unitCosts: [...this.unitCosts],
        supplies: [...this.nodeSupplies], solveMaxFlowWithMinCost,
      }, options);
    } finally {
      this.solving = false;
    }
  }

  addArcWithCapacityAndUnitCost(tail: number, head: number, capacity: IntValue, unitCost: IntValue): number {
    const tailValue = toIndex(tail, 'tail', INT32_MAX);
    const headValue = toIndex(head, 'head', INT32_MAX);
    const capacityValue = toInt64(capacity, 'capacity');
    const unitCostValue = toInt64(unitCost, 'unitCost');
    const arc = this.tails.length;
    this.tails.push(tailValue);
    this.heads.push(headValue);
    this.capacities.push(capacityValue);
    this.unitCosts.push(unitCostValue);
    return arc;
  }

  addArcsWithCapacityAndUnitCost(
    tails: ArrayLike<number>,
    heads: ArrayLike<number>,
    capacities: ArrayLike<IntValue>,
    unitCosts: ArrayLike<IntValue>,
  ): number[] {
    const tailValues = toIndexArray(tails, 'tails');
    const headValues = toIndexArray(heads, 'heads');
    const capacityValues = toInt64Array(capacities, 'capacities');
    const unitCostValues = toInt64Array(unitCosts, 'unitCosts');
    assertEqualLengths('SimpleMinCostFlow.addArcsWithCapacityAndUnitCost', tailValues, headValues, capacityValues, unitCostValues);
    return tailValues.map((tail, index) =>
      this.addArcWithCapacityAndUnitCost(tail, headValues[index], capacityValues[index], unitCostValues[index]));
  }

  setArcCapacity(arc: number, capacity: IntValue): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toInt64Array([capacity], 'capacity')[0];
  }

  setArcCapacities(arcs: ArrayLike<number>, capacities: ArrayLike<IntValue>): void {
    const arcValues = toIndexArray(arcs, 'arcs');
    const capacityValues = toInt64Array(capacities, 'capacities');
    assertEqualLengths('SimpleMinCostFlow.setArcCapacities', arcValues, capacityValues);
    for (const [index, arc] of arcValues.entries()) this.setArcCapacity(arc, capacityValues[index]);
  }

  setNodeSupply(node: number, supply: IntValue): void {
    const nodeValue = toIndexArray([node], 'node')[0];
    while (this.nodeSupplies.length <= nodeValue) this.nodeSupplies.push(0n);
    this.nodeSupplies[nodeValue] = toInt64Array([supply], 'supply')[0];
  }

  setNodesSupplies(nodes: ArrayLike<number>, supplies: ArrayLike<IntValue>): void {
    const nodeValues = toIndexArray(nodes, 'nodes');
    const supplyValues = toInt64Array(supplies, 'supplies');
    assertEqualLengths('SimpleMinCostFlow.setNodesSupplies', nodeValues, supplyValues);
    for (const [index, node] of nodeValues.entries()) this.setNodeSupply(node, supplyValues[index]);
  }

  numNodes(): number {
    return Math.max(
      this.nodeSupplies.length,
      this.tails.reduce((maxNode, tail, index) => Math.max(maxNode, tail, this.heads[index]), -1) + 1,
    );
  }

  numArcs(): number {
    return this.tails.length;
  }

  tail(arc: number): number {
    assertIndex(arc, this.tails.length, 'arc');
    return this.tails[arc];
  }

  head(arc: number): number {
    assertIndex(arc, this.heads.length, 'arc');
    return this.heads[arc];
  }

  capacity(arc: number): bigint {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.capacities[arc];
  }

  supply(node: number): bigint {
    assertIndex(node, this.numNodes(), 'node');
    return this.nodeSupplies[node] ?? 0n;
  }

  unitCost(arc: number): bigint {
    assertIndex(arc, this.unitCosts.length, 'arc');
    return this.unitCosts[arc];
  }

}

export class SimpleLinearSumAssignment {
  private leftNodes: number[] = [];
  private rightNodes: number[] = [];
  private costs: bigint[] = [];
  private solving = false;

  /** Solve once and return an answer independent of later solves or model changes. */
  async solve(options: NetworkFlowSolveOptions = {}): Promise<LinearSumAssignmentResult> {
    return new LinearSumAssignmentResult(await this.run(options));
  }

  private async run(options: NetworkFlowSolveOptions): Promise<NetworkFlowResult> {
    if (this.solving) throw new RuntimeError('SimpleLinearSumAssignment.solve() is already in progress.');
    this.solving = true;
    try {
      return await solveNetworkFlow({
        type: 'linearSumAssignment', leftNodes: [...this.leftNodes],
        rightNodes: [...this.rightNodes], costs: [...this.costs],
      }, options);
    } finally {
      this.solving = false;
    }
  }

  addArcWithCost(leftNode: number, rightNode: number, cost: IntValue): number {
    const leftValue = toIndex(leftNode, 'leftNode', INT32_MAX);
    const rightValue = toIndex(rightNode, 'rightNode', INT32_MAX);
    const costValue = toInt64(cost, 'cost');
    const arc = this.leftNodes.length;
    this.leftNodes.push(leftValue);
    this.rightNodes.push(rightValue);
    this.costs.push(costValue);
    return arc;
  }

  addArcsWithCost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<IntValue>): number[] {
    const leftValues = toIndexArray(leftNodes, 'leftNodes');
    const rightValues = toIndexArray(rightNodes, 'rightNodes');
    const costValues = toInt64Array(costs, 'costs');
    assertEqualLengths('SimpleLinearSumAssignment.addArcsWithCost', leftValues, rightValues, costValues);
    return leftValues.map((leftNode, index) => this.addArcWithCost(leftNode, rightValues[index], costValues[index]));
  }

  numNodes(): number {
    return this.leftNodes.reduce((maxNode, leftNode, index) => Math.max(maxNode, leftNode, this.rightNodes[index]), -1) + 1;
  }

  numArcs(): number {
    return this.leftNodes.length;
  }

  leftNode(arc: number): number {
    assertIndex(arc, this.leftNodes.length, 'arc');
    return this.leftNodes[arc];
  }

  rightNode(arc: number): number {
    assertIndex(arc, this.rightNodes.length, 'arc');
    return this.rightNodes[arc];
  }

  cost(arc: number): bigint {
    assertIndex(arc, this.costs.length, 'arc');
    return this.costs[arc];
  }

}
