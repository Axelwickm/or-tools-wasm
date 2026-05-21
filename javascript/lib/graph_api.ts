import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadGraphRuntime } from './runtime_loader.js';
import type { WorkerResponse } from './worker_protocol.js';
import {
  isWorkerBridgeEnabled,
  nextWorkerBridgeRequestId,
  postWorkerRequest,
  setWorkerBridgeEnabled,
  shouldUseWorkerBridge,
} from './worker_bridge.js';

type CReturn = 'number' | 'string' | undefined;

type GraphExports = {
  maxFlowSolveSerialized(tailsPtr: number, headsPtr: number, capacitiesPtr: number, numArcs: number, source: number, sink: number): string;
  minCostFlowSolveSerialized(
    tailsPtr: number,
    headsPtr: number,
    capacitiesPtr: number,
    unitCostsPtr: number,
    numArcs: number,
    suppliesPtr: number,
    numSupplies: number,
    solveMaxFlowWithMinCost: number,
  ): string;
  linearSumAssignmentSolveSerialized(leftNodesPtr: number, rightNodesPtr: number, costsPtr: number, numArcs: number): string;
};

type NativeResult = { ok: false; error: string } | NativeSuccess;

type NativeSuccess = {
  ok: true;
  status: number;
  optimalFlow?: number;
  optimalCost?: number;
  maximumFlow?: number;
  numNodes: number;
  numArcs: number;
  flows?: number[];
  sourceSideMinCut?: number[];
  sinkSideMinCut?: number[];
  rightMates?: number[];
  assignmentCosts?: number[];
};

type MaxFlowSolvePayload = {
  algorithm: 'maxFlow';
  tails: number[];
  heads: number[];
  capacities: number[];
  source: number;
  sink: number;
};

type MinCostFlowSolvePayload = {
  algorithm: 'minCostFlow';
  tails: number[];
  heads: number[];
  capacities: number[];
  unitCosts: number[];
  supplies: number[];
  solveMaxFlowWithMinCost: boolean;
};

type LinearSumAssignmentSolvePayload = {
  algorithm: 'linearSumAssignment';
  leftNodes: number[];
  rightNodes: number[];
  costs: number[];
};

export type GraphSolvePayload = MaxFlowSolvePayload | MinCostFlowSolvePayload | LinearSumAssignmentSolvePayload;

let graphModulePromise: Promise<OrToolsWasmModule> | null = null;
let graphModule: OrToolsWasmModule | null = null;
let graphExports: GraphExports | null = null;

function wrap<T extends (...args: never[]) => unknown>(
  module: OrToolsWasmModule,
  name: string,
  returnType: CReturn,
  argTypes: string[],
): T {
  return module.cwrap(name, returnType, argTypes) as unknown as T;
}

function createGraphExports(module: OrToolsWasmModule): GraphExports {
  return {
    maxFlowSolveSerialized: wrap(module, 'graph_max_flow_solve_serialized', 'string', [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ]),
    minCostFlowSolveSerialized: wrap(module, 'graph_min_cost_flow_solve_serialized', 'string', [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ]),
    linearSumAssignmentSolveSerialized: wrap(module, 'graph_linear_sum_assignment_solve_serialized', 'string', [
      'number',
      'number',
      'number',
      'number',
    ]),
  };
}

export async function initNetworkFlow(): Promise<void> {
  graphModulePromise ??= loadGraphRuntime().then((module) => {
    graphModule = module;
    graphExports = createGraphExports(module);
    return module;
  });
  await graphModulePromise;
}

function currentModule() {
  if (!graphModule) {
    throw new Error('Network Flow runtime has not been initialized. Call initNetworkFlow() first.');
  }
  return graphModule;
}

function currentExports() {
  if (!graphExports) {
    throw new Error('Network Flow runtime has not been initialized. Call initNetworkFlow() first.');
  }
  return graphExports;
}

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, ptr, values.length).set(values);
  return ptr;
}

function parseResult(value: string): NativeSuccess {
  const result = JSON.parse(value) as NativeResult;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
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

function solveMaxFlowDirect(payload: MaxFlowSolvePayload): NativeSuccess {
  const module = currentModule();
  const exports = currentExports();
  const tailsPtr = copyFloat64ToHeap(module, payload.tails);
  const headsPtr = copyFloat64ToHeap(module, payload.heads);
  const capacitiesPtr = copyFloat64ToHeap(module, payload.capacities);
  try {
    return parseResult(exports.maxFlowSolveSerialized(
      tailsPtr,
      headsPtr,
      capacitiesPtr,
      payload.tails.length,
      payload.source,
      payload.sink,
    ));
  } finally {
    if (tailsPtr) module._free(tailsPtr);
    if (headsPtr) module._free(headsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
  }
}

function solveMinCostFlowDirect(payload: MinCostFlowSolvePayload): NativeSuccess {
  const module = currentModule();
  const exports = currentExports();
  const tailsPtr = copyFloat64ToHeap(module, payload.tails);
  const headsPtr = copyFloat64ToHeap(module, payload.heads);
  const capacitiesPtr = copyFloat64ToHeap(module, payload.capacities);
  const unitCostsPtr = copyFloat64ToHeap(module, payload.unitCosts);
  const suppliesPtr = copyFloat64ToHeap(module, payload.supplies);
  try {
    return parseResult(exports.minCostFlowSolveSerialized(
      tailsPtr,
      headsPtr,
      capacitiesPtr,
      unitCostsPtr,
      payload.tails.length,
      suppliesPtr,
      payload.supplies.length,
      payload.solveMaxFlowWithMinCost ? 1 : 0,
    ));
  } finally {
    if (tailsPtr) module._free(tailsPtr);
    if (headsPtr) module._free(headsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
    if (unitCostsPtr) module._free(unitCostsPtr);
    if (suppliesPtr) module._free(suppliesPtr);
  }
}

function solveLinearSumAssignmentDirect(payload: LinearSumAssignmentSolvePayload): NativeSuccess {
  const module = currentModule();
  const exports = currentExports();
  const leftNodesPtr = copyFloat64ToHeap(module, payload.leftNodes);
  const rightNodesPtr = copyFloat64ToHeap(module, payload.rightNodes);
  const costsPtr = copyFloat64ToHeap(module, payload.costs);
  try {
    return parseResult(exports.linearSumAssignmentSolveSerialized(
      leftNodesPtr,
      rightNodesPtr,
      costsPtr,
      payload.leftNodes.length,
    ));
  } finally {
    if (leftNodesPtr) module._free(leftNodesPtr);
    if (rightNodesPtr) module._free(rightNodesPtr);
    if (costsPtr) module._free(costsPtr);
  }
}

export async function solveGraphPayload(payload: GraphSolvePayload): Promise<NativeSuccess> {
  await initNetworkFlow();
  if (shouldUseWorkerBridge()) {
    const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'graphSolveResult' }>>({
      type: 'graphSolve',
      id: nextWorkerBridgeRequestId(),
      ...payload,
    });
    return parseResult(response.result);
  }
  if (payload.algorithm === 'maxFlow') return solveMaxFlowDirect(payload);
  if (payload.algorithm === 'minCostFlow') return solveMinCostFlowDirect(payload);
  return solveLinearSumAssignmentDirect(payload);
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
  static readonly OPTIMAL = SimpleMaxFlowStatus.OPTIMAL;
  static readonly POSSIBLE_OVERFLOW = SimpleMaxFlowStatus.POSSIBLE_OVERFLOW;
  static readonly BAD_INPUT = SimpleMaxFlowStatus.BAD_INPUT;
  static readonly BAD_RESULT = SimpleMaxFlowStatus.BAD_RESULT;

  private tails: number[] = [];
  private heads: number[] = [];
  private capacities: number[] = [];
  private result: NativeSuccess | null = null;

  add_arc_with_capacity(tail: number, head: number, capacity: number): number {
    const arc = this.tails.length;
    this.tails.push(...toNumberArray([tail], 'tail'));
    this.heads.push(...toNumberArray([head], 'head'));
    this.capacities.push(...toNumberArray([capacity], 'capacity'));
    this.result = null;
    return arc;
  }

  addArcWithCapacity(tail: number, head: number, capacity: number): number {
    return this.add_arc_with_capacity(tail, head, capacity);
  }

  add_arcs_with_capacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>): number[] {
    const tailValues = toNumberArray(tails, 'tails');
    const headValues = toNumberArray(heads, 'heads');
    const capacityValues = toNumberArray(capacities, 'capacities');
    assertEqualLengths('SimpleMaxFlow.add_arcs_with_capacity', tailValues, headValues, capacityValues);
    return tailValues.map((tail, index) => this.add_arc_with_capacity(tail, headValues[index], capacityValues[index]));
  }

  addArcsWithCapacity(tails: ArrayLike<number>, heads: ArrayLike<number>, capacities: ArrayLike<number>): number[] {
    return this.add_arcs_with_capacity(tails, heads, capacities);
  }

  set_arc_capacity(arc: number, capacity: number): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toNumberArray([capacity], 'capacity')[0];
    this.result = null;
  }

  setArcCapacity(arc: number, capacity: number): void {
    this.set_arc_capacity(arc, capacity);
  }

  set_arcs_capacity(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    const arcValues = toNumberArray(arcs, 'arcs');
    const capacityValues = toNumberArray(capacities, 'capacities');
    assertEqualLengths('SimpleMaxFlow.set_arcs_capacity', arcValues, capacityValues);
    for (const [index, arc] of arcValues.entries()) this.set_arc_capacity(arc, capacityValues[index]);
  }

  setArcsCapacity(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    this.set_arcs_capacity(arcs, capacities);
  }

  num_nodes(): number {
    return this.tails.reduce((maxNode, tail, index) => Math.max(maxNode, tail, this.heads[index]), -1) + 1;
  }

  numNodes(): number {
    return this.num_nodes();
  }

  num_arcs(): number {
    return this.tails.length;
  }

  numArcs(): number {
    return this.num_arcs();
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

  async solve(source: number, sink: number): Promise<number> {
    const result = await solveGraphPayload({
      algorithm: 'maxFlow',
      tails: this.tails,
      heads: this.heads,
      capacities: this.capacities,
      source,
      sink,
    });
    this.result = result;
    return result.status;
  }

  optimal_flow(): number {
    return this.result?.optimalFlow ?? 0;
  }

  optimalFlow(): number {
    return this.optimal_flow();
  }

  flow(arc: number): number {
    assertIndex(arc, this.capacities.length, 'arc');
    return this.result?.flows?.[arc] ?? 0;
  }

  flows(arcs: ArrayLike<number>): number[] {
    return toNumberArray(arcs, 'arcs').map((arc) => this.flow(arc));
  }

  get_source_side_min_cut(): number[] {
    return [...(this.result?.sourceSideMinCut ?? [])];
  }

  getSourceSideMinCut(): number[] {
    return this.get_source_side_min_cut();
  }

  get_sink_side_min_cut(): number[] {
    return [...(this.result?.sinkSideMinCut ?? [])];
  }

  getSinkSideMinCut(): number[] {
    return this.get_sink_side_min_cut();
  }
}

export class SimpleMinCostFlow {
  static readonly NOT_SOLVED = SimpleMinCostFlowStatus.NOT_SOLVED;
  static readonly OPTIMAL = SimpleMinCostFlowStatus.OPTIMAL;
  static readonly FEASIBLE = SimpleMinCostFlowStatus.FEASIBLE;
  static readonly INFEASIBLE = SimpleMinCostFlowStatus.INFEASIBLE;
  static readonly UNBALANCED = SimpleMinCostFlowStatus.UNBALANCED;
  static readonly BAD_RESULT = SimpleMinCostFlowStatus.BAD_RESULT;
  static readonly BAD_COST_RANGE = SimpleMinCostFlowStatus.BAD_COST_RANGE;
  static readonly BAD_CAPACITY_RANGE = SimpleMinCostFlowStatus.BAD_CAPACITY_RANGE;

  private tails: number[] = [];
  private heads: number[] = [];
  private capacities: number[] = [];
  private unitCosts: number[] = [];
  private nodeSupplies: number[] = [];
  private result: NativeSuccess | null = null;

  add_arc_with_capacity_and_unit_cost(tail: number, head: number, capacity: number, unitCost: number): number {
    const arc = this.tails.length;
    this.tails.push(...toNumberArray([tail], 'tail'));
    this.heads.push(...toNumberArray([head], 'head'));
    this.capacities.push(...toNumberArray([capacity], 'capacity'));
    this.unitCosts.push(...toNumberArray([unitCost], 'unitCost'));
    this.result = null;
    return arc;
  }

  addArcWithCapacityAndUnitCost(tail: number, head: number, capacity: number, unitCost: number): number {
    return this.add_arc_with_capacity_and_unit_cost(tail, head, capacity, unitCost);
  }

  add_arcs_with_capacity_and_unit_cost(
    tails: ArrayLike<number>,
    heads: ArrayLike<number>,
    capacities: ArrayLike<number>,
    unitCosts: ArrayLike<number>,
  ): number[] {
    const tailValues = toNumberArray(tails, 'tails');
    const headValues = toNumberArray(heads, 'heads');
    const capacityValues = toNumberArray(capacities, 'capacities');
    const unitCostValues = toNumberArray(unitCosts, 'unitCosts');
    assertEqualLengths('SimpleMinCostFlow.add_arcs_with_capacity_and_unit_cost', tailValues, headValues, capacityValues, unitCostValues);
    return tailValues.map((tail, index) =>
      this.add_arc_with_capacity_and_unit_cost(tail, headValues[index], capacityValues[index], unitCostValues[index]));
  }

  addArcsWithCapacityAndUnitCost(
    tails: ArrayLike<number>,
    heads: ArrayLike<number>,
    capacities: ArrayLike<number>,
    unitCosts: ArrayLike<number>,
  ): number[] {
    return this.add_arcs_with_capacity_and_unit_cost(tails, heads, capacities, unitCosts);
  }

  set_arc_capacity(arc: number, capacity: number): void {
    assertIndex(arc, this.capacities.length, 'arc');
    this.capacities[arc] = toNumberArray([capacity], 'capacity')[0];
    this.result = null;
  }

  setArcCapacity(arc: number, capacity: number): void {
    this.set_arc_capacity(arc, capacity);
  }

  set_arc_capacities(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    const arcValues = toNumberArray(arcs, 'arcs');
    const capacityValues = toNumberArray(capacities, 'capacities');
    assertEqualLengths('SimpleMinCostFlow.set_arc_capacities', arcValues, capacityValues);
    for (const [index, arc] of arcValues.entries()) this.set_arc_capacity(arc, capacityValues[index]);
  }

  setArcCapacities(arcs: ArrayLike<number>, capacities: ArrayLike<number>): void {
    this.set_arc_capacities(arcs, capacities);
  }

  set_node_supply(node: number, supply: number): void {
    const nodeValue = toNumberArray([node], 'node')[0];
    while (this.nodeSupplies.length <= nodeValue) this.nodeSupplies.push(0);
    this.nodeSupplies[nodeValue] = toNumberArray([supply], 'supply')[0];
    this.result = null;
  }

  setNodeSupply(node: number, supply: number): void {
    this.set_node_supply(node, supply);
  }

  set_nodes_supplies(nodes: ArrayLike<number>, supplies: ArrayLike<number>): void {
    const nodeValues = toNumberArray(nodes, 'nodes');
    const supplyValues = toNumberArray(supplies, 'supplies');
    assertEqualLengths('SimpleMinCostFlow.set_nodes_supplies', nodeValues, supplyValues);
    for (const [index, node] of nodeValues.entries()) this.set_node_supply(node, supplyValues[index]);
  }

  setNodesSupplies(nodes: ArrayLike<number>, supplies: ArrayLike<number>): void {
    this.set_nodes_supplies(nodes, supplies);
  }

  num_nodes(): number {
    return Math.max(
      this.nodeSupplies.length,
      this.tails.reduce((maxNode, tail, index) => Math.max(maxNode, tail, this.heads[index]), -1) + 1,
    );
  }

  numNodes(): number {
    return this.num_nodes();
  }

  num_arcs(): number {
    return this.tails.length;
  }

  numArcs(): number {
    return this.num_arcs();
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
    assertIndex(node, this.num_nodes(), 'node');
    return this.nodeSupplies[node] ?? 0;
  }

  unit_cost(arc: number): number {
    assertIndex(arc, this.unitCosts.length, 'arc');
    return this.unitCosts[arc];
  }

  unitCost(arc: number): number {
    return this.unit_cost(arc);
  }

  async solve(): Promise<number> {
    const result = await solveGraphPayload({
      algorithm: 'minCostFlow',
      tails: this.tails,
      heads: this.heads,
      capacities: this.capacities,
      unitCosts: this.unitCosts,
      supplies: this.nodeSupplies,
      solveMaxFlowWithMinCost: false,
    });
    this.result = result;
    return result.status;
  }

  async solve_max_flow_with_min_cost(): Promise<number> {
    const result = await solveGraphPayload({
      algorithm: 'minCostFlow',
      tails: this.tails,
      heads: this.heads,
      capacities: this.capacities,
      unitCosts: this.unitCosts,
      supplies: this.nodeSupplies,
      solveMaxFlowWithMinCost: true,
    });
    this.result = result;
    return result.status;
  }

  solveMaxFlowWithMinCost(): Promise<number> {
    return this.solve_max_flow_with_min_cost();
  }

  optimal_cost(): number {
    return this.result?.optimalCost ?? 0;
  }

  optimalCost(): number {
    return this.optimal_cost();
  }

  maximum_flow(): number {
    return this.result?.maximumFlow ?? 0;
  }

  maximumFlow(): number {
    return this.maximum_flow();
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
  static readonly OPTIMAL = SimpleLinearSumAssignmentStatus.OPTIMAL;
  static readonly INFEASIBLE = SimpleLinearSumAssignmentStatus.INFEASIBLE;
  static readonly POSSIBLE_OVERFLOW = SimpleLinearSumAssignmentStatus.POSSIBLE_OVERFLOW;

  private leftNodes: number[] = [];
  private rightNodes: number[] = [];
  private costs: number[] = [];
  private result: NativeSuccess | null = null;

  add_arc_with_cost(leftNode: number, rightNode: number, cost: number): number {
    const arc = this.leftNodes.length;
    this.leftNodes.push(...toNumberArray([leftNode], 'leftNode'));
    this.rightNodes.push(...toNumberArray([rightNode], 'rightNode'));
    this.costs.push(...toNumberArray([cost], 'cost'));
    this.result = null;
    return arc;
  }

  addArcWithCost(leftNode: number, rightNode: number, cost: number): number {
    return this.add_arc_with_cost(leftNode, rightNode, cost);
  }

  add_arcs_with_cost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<number>): number[] {
    const leftValues = toNumberArray(leftNodes, 'leftNodes');
    const rightValues = toNumberArray(rightNodes, 'rightNodes');
    const costValues = toNumberArray(costs, 'costs');
    assertEqualLengths('SimpleLinearSumAssignment.add_arcs_with_cost', leftValues, rightValues, costValues);
    return leftValues.map((leftNode, index) => this.add_arc_with_cost(leftNode, rightValues[index], costValues[index]));
  }

  addArcsWithCost(leftNodes: ArrayLike<number>, rightNodes: ArrayLike<number>, costs: ArrayLike<number>): number[] {
    return this.add_arcs_with_cost(leftNodes, rightNodes, costs);
  }

  num_nodes(): number {
    return this.leftNodes.reduce((maxNode, leftNode, index) => Math.max(maxNode, leftNode, this.rightNodes[index]), -1) + 1;
  }

  numNodes(): number {
    return this.num_nodes();
  }

  num_arcs(): number {
    return this.leftNodes.length;
  }

  numArcs(): number {
    return this.num_arcs();
  }

  left_node(arc: number): number {
    assertIndex(arc, this.leftNodes.length, 'arc');
    return this.leftNodes[arc];
  }

  leftNode(arc: number): number {
    return this.left_node(arc);
  }

  right_node(arc: number): number {
    assertIndex(arc, this.rightNodes.length, 'arc');
    return this.rightNodes[arc];
  }

  rightNode(arc: number): number {
    return this.right_node(arc);
  }

  cost(arc: number): number {
    assertIndex(arc, this.costs.length, 'arc');
    return this.costs[arc];
  }

  async solve(): Promise<number> {
    const result = await solveGraphPayload({
      algorithm: 'linearSumAssignment',
      leftNodes: this.leftNodes,
      rightNodes: this.rightNodes,
      costs: this.costs,
    });
    this.result = result;
    return result.status;
  }

  optimal_cost(): number {
    return this.result?.optimalCost ?? 0;
  }

  optimalCost(): number {
    return this.optimal_cost();
  }

  right_mate(leftNode: number): number {
    assertIndex(leftNode, this.num_nodes(), 'leftNode');
    return this.result?.rightMates?.[leftNode] ?? -1;
  }

  rightMate(leftNode: number): number {
    return this.right_mate(leftNode);
  }

  assignment_cost(leftNode: number): number {
    assertIndex(leftNode, this.num_nodes(), 'leftNode');
    return this.result?.assignmentCosts?.[leftNode] ?? 0;
  }

  assignmentCost(leftNode: number): number {
    return this.assignment_cost(leftNode);
  }
}

export const NetworkFlow = {
  initNetworkFlow,
  isWorkerBridgeEnabled,
  setWorkerBridgeEnabled,
  SimpleMaxFlow,
  SimpleMinCostFlow,
  SimpleLinearSumAssignment,
  SimpleMaxFlowStatus,
  SimpleMinCostFlowStatus,
  SimpleLinearSumAssignmentStatus,
};
