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

function assertEqualLengths(name: string, ...values: number[][]) {
  const expected = values[0]?.length ?? 0;
  for (const value of values) {
    if (value.length !== expected) {
      throw new Error(`${name}: all input arrays must have the same length.`);
    }
  }
}

function toNumberArray(values: ArrayLike<number>, name: string): number[] {
  return Array.from(values, (value, index) => {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${name}[${index}] must be a finite integer.`);
    }
    return value;
  });
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
  if (options.signal?.aborted) throw abortError(options.signal);
  const executor = createNetworkFlowExecutor(options.executor);
  let callbackError: unknown = null;
  const onEvent = async (event: NetworkFlowEvent) => {
    if (callbackError) return;
    try {
      await options.onEvent?.(event);
    } catch (error) {
      callbackError = error;
    }
  };
  const job = executor.execute(operation, { onEvent });
  let aborted: Error | null = null;
  const onAbort = () => {
    if (!options.signal) return;
    aborted = abortError(options.signal);
    void job.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  try {
    const result = await job.result;
    if (callbackError) throw callbackError;
    if (aborted) throw aborted;
    return result;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
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
  private capacities: number[] = [];
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCapacity(tail: number, head: number, capacity: number): number {
    const arc = this.tails.length;
    this.tails.push(...toNumberArray([tail], 'tail'));
    this.heads.push(...toNumberArray([head], 'head'));
    this.capacities.push(...toNumberArray([capacity], 'capacity'));
    this.result = null;
    return arc;
  }

  addArcsWithCapacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>): number[] {
    const tailValues = toNumberArray(tails, 'tails');
    const headValues = toNumberArray(heads, 'heads');
    const capacityValues = toNumberArray(capacities, 'capacities');
    assertEqualLengths('SimpleMaxFlow.addArcsWithCapacity', tailValues, headValues, capacityValues);
    return tailValues.map((tail, index) => this.addArcWithCapacity(tail, headValues[index], capacityValues[index]));
  }

  setArcCapacity(arc: number, capacity: number): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toNumberArray([capacity], 'capacity')[0];
    this.result = null;
  }

  setArcsCapacity(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    const arcValues = toNumberArray(arcs, 'arcs');
    const capacityValues = toNumberArray(capacities, 'capacities');
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

  capacity(arc: number): number {
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
        source,
        sink,
      }, options);
      this.result = result;
      return result.status;
    } finally {
      this.solving = false;
    }
  }

  optimalFlow(): number {
    return this.result?.optimalFlow ?? 0;
  }

  flow(arc: number): number {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.result?.flows?.[arc] ?? 0;
  }

  flows(arcs: ArrayLike<number>): number[] {
    return toNumberArray(arcs, 'arcs').map((arc) => this.flow(arc));
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
  private capacities: number[] = [];
  private unitCosts: number[] = [];
  private nodeSupplies: number[] = [];
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCapacityAndUnitCost(tail: number, head: number, capacity: number, unitCost: number): number {
    const arc = this.tails.length;
    this.tails.push(...toNumberArray([tail], 'tail'));
    this.heads.push(...toNumberArray([head], 'head'));
    this.capacities.push(...toNumberArray([capacity], 'capacity'));
    this.unitCosts.push(...toNumberArray([unitCost], 'unitCost'));
    this.result = null;
    return arc;
  }

  addArcsWithCapacityAndUnitCost(
    tails: ArrayLike<number>,
    heads: ArrayLike<number>,
    capacities: ArrayLike<number>,
    unitCosts: ArrayLike<number>,
  ): number[] {
    const tailValues = toNumberArray(tails, 'tails');
    const headValues = toNumberArray(heads, 'heads');
    const capacityValues = toNumberArray(capacities, 'capacities');
    const unitCostValues = toNumberArray(unitCosts, 'unitCosts');
    assertEqualLengths('SimpleMinCostFlow.addArcsWithCapacityAndUnitCost', tailValues, headValues, capacityValues, unitCostValues);
    return tailValues.map((tail, index) =>
      this.addArcWithCapacityAndUnitCost(tail, headValues[index], capacityValues[index], unitCostValues[index]));
  }

  setArcCapacity(arc: number, capacity: number): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toNumberArray([capacity], 'capacity')[0];
    this.result = null;
  }

  setArcCapacities(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    const arcValues = toNumberArray(arcs, 'arcs');
    const capacityValues = toNumberArray(capacities, 'capacities');
    assertEqualLengths('SimpleMinCostFlow.setArcCapacities', arcValues, capacityValues);
    for (const [index, arc] of arcValues.entries()) this.setArcCapacity(arc, capacityValues[index]);
  }

  setNodeSupply(node: number, supply: number): void {
    const nodeValue = toNumberArray([node], 'node')[0];
    while (this.nodeSupplies.length <= nodeValue) this.nodeSupplies.push(0);
    this.nodeSupplies[nodeValue] = toNumberArray([supply], 'supply')[0];
    this.result = null;
  }

  setNodesSupplies(nodes: ArrayLike<number>, supplies: ArrayLike<number>): void {
    const nodeValues = toNumberArray(nodes, 'nodes');
    const supplyValues = toNumberArray(supplies, 'supplies');
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

  capacity(arc: number): number {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.capacities[arc];
  }

  supply(node: number): number {
    assertIndex(node, this.numNodes(), 'node');
    return this.nodeSupplies[node] ?? 0;
  }

  unitCost(arc: number): number {
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

  optimalCost(): number {
    return this.result?.optimalCost ?? 0;
  }

  maximumFlow(): number {
    return this.result?.maximumFlow ?? 0;
  }

  flow(arc: number): number {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.result?.flows?.[arc] ?? 0;
  }

  flows(arcs: ArrayLike<number>): number[] {
    return toNumberArray(arcs, 'arcs').map((arc) => this.flow(arc));
  }
}

export class SimpleLinearSumAssignment {
  private leftNodes: number[] = [];
  private rightNodes: number[] = [];
  private costs: number[] = [];
  private result: NetworkFlowResult | null = null;
  private solving = false;

  addArcWithCost(leftNode: number, rightNode: number, cost: number): number {
    const arc = this.leftNodes.length;
    this.leftNodes.push(...toNumberArray([leftNode], 'leftNode'));
    this.rightNodes.push(...toNumberArray([rightNode], 'rightNode'));
    this.costs.push(...toNumberArray([cost], 'cost'));
    this.result = null;
    return arc;
  }

  addArcsWithCost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<number>): number[] {
    const leftValues = toNumberArray(leftNodes, 'leftNodes');
    const rightValues = toNumberArray(rightNodes, 'rightNodes');
    const costValues = toNumberArray(costs, 'costs');
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

  cost(arc: number): number {
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

  optimalCost(): number {
    return this.result?.optimalCost ?? 0;
  }

  rightMate(leftNode: number): number {
    assertIndex(leftNode, this.numNodes(), 'leftNode');
    return this.result?.rightMates?.[leftNode] ?? -1;
  }

  assignmentCost(leftNode: number): number {
    assertIndex(leftNode, this.numNodes(), 'leftNode');
    return this.result?.assignmentCosts?.[leftNode] ?? 0;
  }
}
