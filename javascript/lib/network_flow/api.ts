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

function abortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  if (signal.reason !== undefined) return new Error(String(signal.reason));
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The Network Flow solve was aborted.', 'AbortError');
  }
  const error = new Error('The Network Flow solve was aborted.');
  error.name = 'AbortError';
  return error;
}

async function solveNetworkFlow(
  operation: NetworkFlowOperation,
  options: NetworkFlowSolveOptions = {},
): Promise<NetworkFlowResult> {
  const executor = createNetworkFlowExecutor(options.executor);
  return executeSolverJob(executor, operation, {
    signal: options.signal,
    abortError,
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
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCapacity(tail: number, head: number, capacity: IntValue): number {
    const arc = this.tails.length;
    this.tails.push(...toIndexArray([tail], 'tail'));
    this.heads.push(...toIndexArray([head], 'head'));
    this.capacities.push(...toInt64Array([capacity], 'capacity'));
    this.result = null;
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
    this.result = null;
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

  async solve(source: number, sink: number, options: NetworkFlowSolveOptions = {}): Promise<number> {
    if (this.solving) throw new RuntimeError('SimpleMaxFlow.solve() is already in progress.');
    this.solving = true;
    try {
      const result = await solveNetworkFlow({
        type: 'maxFlow',
        tails: this.tails,
        heads: this.heads,
        capacities: this.capacities,
        source: toIndex(source, 'source', INT32_MAX),
        sink: toIndex(sink, 'sink', INT32_MAX),
      }, options);
      this.result = result;
      return result.status;
    } finally {
      this.solving = false;
    }
  }

  optimalFlow(): bigint {
    return this.result?.optimalFlow ?? 0n;
  }

  flow(arc: number): bigint {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.result?.flows?.[arc] ?? 0n;
  }

  flows(arcs: ArrayLike<number>): bigint[] {
    return toIndexArray(arcs, 'arcs').map((arc) => this.flow(arc));
  }

  getSourceSideMinCut(): number[] {
    return [...(this.result?.sourceSideMinCut ?? [])];
  }

  getSinkSideMinCut(): number[] {
    return [...(this.result?.sinkSideMinCut ?? [])];
  }
}

export class SimpleMinCostFlow {
  private tails: number[] = [];
  private heads: number[] = [];
  private capacities: bigint[] = [];
  private unitCosts: bigint[] = [];
  private nodeSupplies: bigint[] = [];
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCapacityAndUnitCost(tail: number, head: number, capacity: IntValue, unitCost: IntValue): number {
    const arc = this.tails.length;
    this.tails.push(...toIndexArray([tail], 'tail'));
    this.heads.push(...toIndexArray([head], 'head'));
    this.capacities.push(...toInt64Array([capacity], 'capacity'));
    this.unitCosts.push(...toInt64Array([unitCost], 'unitCost'));
    this.result = null;
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
    this.result = null;
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
    this.result = null;
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

  async solve(options: NetworkFlowSolveOptions = {}): Promise<number> {
    return this.solveInternal(false, options);
  }

  async solveMaxFlowWithMinCost(options: NetworkFlowSolveOptions = {}): Promise<number> {
    return this.solveInternal(true, options);
  }

  private async solveInternal(
    solveMaxFlowWithMinCost: boolean,
    options: NetworkFlowSolveOptions,
  ): Promise<number> {
    if (this.solving) throw new RuntimeError('SimpleMinCostFlow.solve() is already in progress.');
    this.solving = true;
    try {
      const result = await solveNetworkFlow({
        type: 'minCostFlow',
        tails: this.tails,
        heads: this.heads,
        capacities: this.capacities,
        unitCosts: this.unitCosts,
        supplies: this.nodeSupplies,
        solveMaxFlowWithMinCost,
      }, options);
      this.result = result;
      return result.status;
    } finally {
      this.solving = false;
    }
  }

  optimalCost(): bigint {
    return this.result?.optimalCost ?? 0n;
  }

  maximumFlow(): bigint {
    return this.result?.maximumFlow ?? 0n;
  }

  flow(arc: number): bigint {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.result?.flows?.[arc] ?? 0n;
  }

  flows(arcs: ArrayLike<number>): bigint[] {
    return toIndexArray(arcs, 'arcs').map((arc) => this.flow(arc));
  }
}

export class SimpleLinearSumAssignment {
  private leftNodes: number[] = [];
  private rightNodes: number[] = [];
  private costs: bigint[] = [];
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCost(leftNode: number, rightNode: number, cost: IntValue): number {
    const arc = this.leftNodes.length;
    this.leftNodes.push(...toIndexArray([leftNode], 'leftNode'));
    this.rightNodes.push(...toIndexArray([rightNode], 'rightNode'));
    this.costs.push(...toInt64Array([cost], 'cost'));
    this.result = null;
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

  async solve(options: NetworkFlowSolveOptions = {}): Promise<number> {
    if (this.solving) throw new RuntimeError('SimpleLinearSumAssignment.solve() is already in progress.');
    this.solving = true;
    try {
      const result = await solveNetworkFlow({
        type: 'linearSumAssignment',
        leftNodes: this.leftNodes,
        rightNodes: this.rightNodes,
        costs: this.costs,
      }, options);
      this.result = result;
      return result.status;
    } finally {
      this.solving = false;
    }
  }

  optimalCost(): bigint {
    return this.result?.optimalCost ?? 0n;
  }

  rightMate(leftNode: number): number {
    assertIndex(leftNode, this.numNodes(), 'leftNode');
    return this.result?.rightMates?.[leftNode] ?? -1;
  }

  assignmentCost(leftNode: number): bigint {
    assertIndex(leftNode, this.numNodes(), 'leftNode');
    return this.result?.assignmentCosts?.[leftNode] ?? 0n;
  }
}
