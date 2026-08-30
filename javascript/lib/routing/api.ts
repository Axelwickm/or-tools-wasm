import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorSelection, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectRoutingExecutor } from './direct_executor.js';
import {
  routingProtocol,
  type RoutingExecutor,
  type RoutingModelOperation,
  type RoutingSolveResult,
} from './protocol.js';

type RoutingTransitCallback = (fromIndex: number, toIndex: number) => number;

async function createRoutingWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-routing' },
  );
}

const directExecutor = new DirectRoutingExecutor();
const workerExecutor = new SolverWorkerExecutor(
  routingProtocol,
  createRoutingWorker,
  true,
);

function createRoutingExecutor(selection: ExecutorSelection = 'auto'): RoutingExecutor {
  return createResolvedExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): RoutingExecutor {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new SolverServerExecutor(routingProtocol, configuration);
    case 'cloud': return new CloudExecutor('routing', { test: configuration.test });
  }
}

export type RoutingEvent = SolverJobEvent;
export type RoutingSolveOptions = {
  executor?: ExecutorSelection;
  onEvent?: (event: RoutingEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

function toInt64(value: number): bigint {
  return globalThis.BigInt(value);
}

export enum FirstSolutionStrategy {
  UNSET = 0,
  AUTOMATIC = 15,
  PATH_CHEAPEST_ARC = 3,
  PATH_MOST_CONSTRAINED_ARC = 4,
  EVALUATOR_STRATEGY = 5,
  SAVINGS = 10,
  SWEEP = 11,
  CHRISTOFIDES = 13,
  ALL_UNPERFORMED = 6,
  BEST_INSERTION = 7,
  PARALLEL_CHEAPEST_INSERTION = 8,
  SEQUENTIAL_CHEAPEST_INSERTION = 14,
  LOCAL_CHEAPEST_INSERTION = 9,
  LOCAL_CHEAPEST_COST_INSERTION = 16,
  GLOBAL_CHEAPEST_ARC = 1,
  LOCAL_CHEAPEST_ARC = 2,
  FIRST_UNBOUND_MIN_VALUE = 12,
}

export enum RoutingSearchStatus {
  ROUTING_NOT_SOLVED = 0,
  ROUTING_SUCCESS = 1,
  ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED = 2,
  ROUTING_FAIL = 3,
  ROUTING_FAIL_TIMEOUT = 4,
  ROUTING_INVALID = 5,
  ROUTING_INFEASIBLE = 6,
  ROUTING_OPTIMAL = 7,
}

export enum LocalSearchMetaheuristic {
  UNSET = 0,
  GUIDED_LOCAL_SEARCH = 2,
}

export const BOOL_FALSE = 2;
export const BOOL_TRUE = 3;
export const BOOL_UNSPECIFIED = 0;

export type RoutingSearchParameters = {
  firstSolutionStrategy?: FirstSolutionStrategy;
  solutionLimit?: number;
  localSearchOperators?: Record<string, unknown>;
  localSearchMetaheuristic?: LocalSearchMetaheuristic;
};

export function defaultRoutingSearchParameters(): RoutingSearchParameters {
  return {};
}

export type RoutingModelParameters = {
  solverParameters: {
    copyFrom(value: unknown): void;
    tracePropagation: boolean;
    profileLocalSearch: boolean;
  };
};

export function defaultRoutingModelParameters(): RoutingModelParameters {
  return {
    solverParameters: {
      copyFrom() {},
      tracePropagation: false,
      profileLocalSearch: false,
    },
  };
}

export function findErrorInRoutingSearchParameters(params: RoutingSearchParameters): string {
  if (params.localSearchOperators?.useCross === BOOL_UNSPECIFIED) {
    return 'localSearchOperators.useCross must not be BOOL_UNSPECIFIED';
  }
  return '';
}

export class BoundCost {
  constructor(
    public bound = 0,
    public cost = 0,
  ) {}
}

type RoutingCumulVar = {
  kind: 'routingCumulVar';
  dimensionName: string;
  index: number;
};

type RoutingVehicleVar = {
  kind: 'routingVehicleVar';
  index: number;
};

type RoutingVehicleEqualityConstraint = {
  type: 'routingVehicleEquality';
  left: RoutingVehicleVar;
  right: RoutingVehicleVar;
};

type RoutingCumulLessOrEqualConstraint = {
  type: 'routingCumulLessOrEqual';
  left: RoutingCumulVar;
  right: RoutingCumulVar;
};

function isRoutingVehicleVar(value: unknown): value is RoutingVehicleVar {
  return typeof value === 'object' && value !== null
    && (value as { kind?: unknown }).kind === 'routingVehicleVar'
    && typeof (value as { index?: unknown }).index === 'number';
}

function isRoutingCumulVar(value: unknown): value is RoutingCumulVar {
  return typeof value === 'object' && value !== null
    && (value as { kind?: unknown }).kind === 'routingCumulVar'
    && typeof (value as { dimensionName?: unknown }).dimensionName === 'string'
    && typeof (value as { index?: unknown }).index === 'number';
}

function isRoutingVehicleEqualityConstraint(value: unknown): value is RoutingVehicleEqualityConstraint {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'routingVehicleEquality'
    && isRoutingVehicleVar((value as { left?: unknown }).left)
    && isRoutingVehicleVar((value as { right?: unknown }).right);
}

function isRoutingCumulLessOrEqualConstraint(value: unknown): value is RoutingCumulLessOrEqualConstraint {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'routingCumulLessOrEqual'
    && isRoutingCumulVar((value as { left?: unknown }).left)
    && isRoutingCumulVar((value as { right?: unknown }).right);
}

export class RoutingIndexManager {
  private readonly indexToNodeMap: number[] = [];
  private readonly nodeToIndexMap = new Map<number, number>();
  private readonly startIndices: number[] = [];
  private readonly endIndices: number[] = [];
  readonly numLocations: number;
  readonly numVehicles: number;
  readonly starts: number[];
  readonly ends: number[];

  constructor(
    numLocations: number,
    numVehicles: number,
    depot: number,
  );
  constructor(
    numLocations: number,
    numVehicles: number,
    starts: number[],
    ends: number[],
  );
  constructor(
    numLocations: number,
    numVehicles: number,
    depotOrStarts: number | number[],
    maybeEnds?: number[],
  ) {
    this.numLocations = numLocations;
    this.numVehicles = numVehicles;
    if (Array.isArray(depotOrStarts)) {
      if (!Array.isArray(maybeEnds)) {
        throw new Error('RoutingIndexManager: starts and ends arrays must both be provided.');
      }
      if (depotOrStarts.length !== numVehicles || maybeEnds.length !== numVehicles) {
        throw new Error('RoutingIndexManager: starts and ends arrays must match numVehicles.');
      }
      this.starts = [...depotOrStarts];
      this.ends = [...maybeEnds];
    } else {
      this.starts = Array.from({ length: numVehicles }, () => depotOrStarts);
      this.ends = Array.from({ length: numVehicles }, () => depotOrStarts);
    }
    this.createSyntheticIndexMapping();
  }

  get depot(): number {
    return this.starts[0];
  }

  indexToNode(index: number): number {
    const node = this.indexToNodeMap[index];
    if (node === undefined) throw new Error(`RoutingIndexManager.indexToNode: index ${index} is out of range.`);
    return node;
  }

  nodeToIndex(node: number): number {
    return this.nodeToIndexMap.get(node) ?? -1;
  }

  getNumberOfNodes(): number {
    return this.numLocations;
  }

  getNumberOfVehicles(): number {
    return this.numVehicles;
  }

  getNumberOfIndices(): number {
    return this.indexToNodeMap.length;
  }

  getStartIndex(vehicle: number): number {
    return this.startIndices[vehicle];
  }

  getEndIndex(vehicle: number): number {
    return this.endIndices[vehicle];
  }

  private createSyntheticIndexMapping(): void {
    for (let node = 0; node < this.numLocations; node++) {
      this.nodeToIndexMap.set(node, node);
      this.indexToNodeMap[node] = node;
    }

    const seenTerminals = new Set<number>();
    const terminalIndex = (node: number) => {
      if (!seenTerminals.has(node)) {
        seenTerminals.add(node);
        return node;
      }
      const index = this.indexToNodeMap.length;
      this.indexToNodeMap.push(node);
      return index;
    };

    for (const start of this.starts) {
      this.startIndices.push(terminalIndex(start));
    }
    for (const end of this.ends) {
      this.endIndices.push(terminalIndex(end));
    }
  }
}

type RoutingDimensionState = {
  softSpanUpperBounds: Map<number, BoundCost>;
  quadraticCostSoftSpanUpperBounds: Map<number, BoundCost>;
};

export class RoutingDimension {
  constructor(
    private readonly name: string,
    private readonly state: RoutingDimensionState,
    private readonly recordSoftSpanUpperBound: (boundCost: BoundCost, vehicle: number) => void,
    private readonly recordQuadraticCostSoftSpanUpperBound: (boundCost: BoundCost, vehicle: number) => void,
  ) {}

  cumulVar(index: number): RoutingCumulVar {
    return { kind: 'routingCumulVar', dimensionName: this.name, index };
  }

  hasSoftSpanUpperBounds(): boolean {
    return this.state.softSpanUpperBounds.size > 0;
  }

  setSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    this.state.softSpanUpperBounds.set(vehicle, new BoundCost(boundCost.bound, boundCost.cost));
    this.recordSoftSpanUpperBound(boundCost, vehicle);
  }

  getSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    return this.state.softSpanUpperBounds.get(vehicle) ?? new BoundCost(0, 0);
  }

  hasQuadraticCostSoftSpanUpperBounds(): boolean {
    return this.state.quadraticCostSoftSpanUpperBounds.size > 0;
  }

  setQuadraticCostSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    this.state.quadraticCostSoftSpanUpperBounds.set(vehicle, new BoundCost(boundCost.bound, boundCost.cost));
    this.recordQuadraticCostSoftSpanUpperBound(boundCost, vehicle);
  }

  getQuadraticCostSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    return this.state.quadraticCostSoftSpanUpperBounds.get(vehicle) ?? new BoundCost(0, 0);
  }
}

type AssignmentState = {
  routing: RoutingModel;
  result: RoutingSolveResult | null;
  routes?: number[][];
  ignoreInactiveIndices: boolean;
};

const assignmentStates = new WeakMap<Assignment, AssignmentState>();

export class Assignment {
  constructor(
    private readonly routing: RoutingModel,
    private readonly result: RoutingSolveResult | null = null,
    routes?: number[][],
    ignoreInactiveIndices = false,
  ) {
    assignmentStates.set(this, { routing, result, routes, ignoreInactiveIndices });
  }

  objectiveValue(): number {
    return this.result?.objectiveValue ?? this.routing.assignmentObjectiveValue();
  }

  value(indexOrVar: number | RoutingCumulVar): number {
    if (typeof indexOrVar === 'object') {
      return this.result
        ? this.result.dimensionCumulValues[indexOrVar.dimensionName]?.[indexOrVar.index] ?? 0
        : this.routing.dimensionCumulValue(indexOrVar.dimensionName, indexOrVar.index);
    }
    return this.result?.nextValues[indexOrVar] ?? this.routing.nextValue(indexOrVar);
  }

  min(indexOrVar: number | RoutingCumulVar): number {
    return this.value(indexOrVar);
  }
}

function initialRoutesForAssignment(
  assignment: Assignment,
  routing: RoutingModel,
): { routes: number[][]; ignoreInactiveIndices: boolean } {
  const state = assignmentStates.get(assignment);
  if (!state || state.routing !== routing) {
    throw new Error('RoutingModel.solveFromAssignmentWithParameters: assignment belongs to another model.');
  }
  if (state.routes) {
    return {
      routes: state.routes.map((route) => [...route]),
      ignoreInactiveIndices: state.ignoreInactiveIndices,
    };
  }
  if (!state.result) {
    throw new Error('RoutingModel.solveFromAssignmentWithParameters: assignment has no route data.');
  }
  const routes = state.result.starts.map((start, vehicle) => {
    const route: number[] = [];
    const end = state.result!.ends[vehicle];
    let index = state.result!.nextValues[start];
    const visited = new Set<number>();
    while (index !== end) {
      if (!Number.isInteger(index) || visited.has(index)) {
        throw new Error('RoutingModel.solveFromAssignmentWithParameters: assignment contains an invalid route.');
      }
      visited.add(index);
      route.push(index);
      index = state.result!.nextValues[index];
    }
    return route;
  });
  return { routes, ignoreInactiveIndices: state.ignoreInactiveIndices };
}

export class RoutingModel {
  private arcCostEvaluatorIndex: number | null = null;
  private lastResult: RoutingSolveResult | null = null;
  private readonly evaluatorCallbacks = new Map<number, RoutingTransitCallback>();
  private nextEvaluatorIndex = 1;
  private readonly operations: RoutingModelOperation[] = [];
  private readonly dimensions = new Map<string, RoutingDimensionState>();
  private readonly atSolutionCallbacks: Array<() => void> = [];
  private lastObjectiveValue = 0;
  private lastStatus: RoutingSearchStatus | null = null;
  private readonly parameters?: RoutingModelParameters;

  constructor(private readonly manager: RoutingIndexManager, parameters?: RoutingModelParameters) {
    this.parameters = parameters;
  }

  registerTransitCallback(callback: RoutingTransitCallback): number {
    const evaluatorIndex = this.nextEvaluatorIndex++;
    this.evaluatorCallbacks.set(evaluatorIndex, callback);
    return evaluatorIndex;
  }

  setArcCostEvaluatorOfAllVehicles(evaluatorIndex: number): void {
    this.arcCostEvaluatorIndex = evaluatorIndex;
  }

  private async solveWithExecutor(
    parameters: RoutingSearchParameters,
    options: RoutingSolveOptions,
    initialAssignment?: { routes: number[][]; ignoreInactiveIndices: boolean },
  ): Promise<Assignment | null> {
    if (options.signal?.aborted) throw routingAbortError(options.signal);
    const dimension = this.manager.getNumberOfIndices();
    const request = {
      numLocations: this.manager.numLocations,
      numVehicles: this.manager.numVehicles,
      starts: this.manager.starts,
      ends: this.manager.ends,
      firstSolutionStrategy: parameters.firstSolutionStrategy ?? 0,
      solutionLimit: parameters.solutionLimit ?? 0,
      transitMatrix: this.buildTransitMatrix(),
      transitMatrixDimension: dimension,
      operations: this.operations,
      dimensionNames: [...this.dimensions.keys()],
      initialAssignment: initialAssignment
        ? {
          routes: initialAssignment.routes.map((indices) => [...indices]),
          ignoreInactiveIndices: initialAssignment.ignoreInactiveIndices,
        }
        : undefined,
    };
    const executor = createRoutingExecutor(options.executor);
    const job = executor.execute(
      { type: 'solve', request, interruptible: Boolean(options.signal) },
      { onEvent: options.onEvent ?? (() => {}) },
    );
    const onAbort = () => { void job.cancel().catch(() => {}); };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let response;
    try {
      response = await job.result;
      if (options.signal?.aborted) throw routingAbortError(options.signal);
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
    const result = response.solution;
    this.lastResult = result;
    this.lastStatus = result?.status ?? null;
    if (!result) return null;
    const assignment = new Assignment(this, result);
    this.lastObjectiveValue = assignment.objectiveValue();
    this.runAtSolutionCallbacks();
    return assignment;
  }

  async solveWithParameters(
    parameters: RoutingSearchParameters = defaultRoutingSearchParameters(),
    options: RoutingSolveOptions = {},
  ): Promise<Assignment | null> {
    return this.solveWithExecutor(parameters, options);
  }

  async solve(options: RoutingSolveOptions = {}): Promise<Assignment | null> {
    return this.solveWithParameters(defaultRoutingSearchParameters(), options);
  }

  status(): RoutingSearchStatus {
    return this.lastStatus ?? RoutingSearchStatus.ROUTING_NOT_SOLVED;
  }

  vehicles(): number {
    return this.manager.getNumberOfVehicles();
  }

  start(vehicle: number): number {
    return this.lastResult?.starts[vehicle] ?? this.manager.getStartIndex(vehicle);
  }

  end(vehicle: number): number {
    return this.lastResult?.ends[vehicle] ?? this.manager.getEndIndex(vehicle);
  }

  isEnd(index: number): boolean {
    return this.lastResult
      ? this.lastResult.ends.includes(index)
      : this.manager.ends.some((_, vehicle) => this.manager.getEndIndex(vehicle) === index);
  }

  registerTransitMatrix(matrix: number[][]): number {
    return this.registerTransitCallback((fromIndex, toIndex) => {
      const fromNode = this.manager.indexToNode(fromIndex);
      const toNode = this.manager.indexToNode(toIndex);
      return matrix[fromNode][toNode];
    });
  }

  registerUnaryTransitCallback(callback: (fromIndex: number) => number): number {
    return this.registerTransitCallback((fromIndex) => callback(fromIndex));
  }

  registerUnaryTransitVector(values: number[]): number {
    return this.registerUnaryTransitCallback((fromIndex) => {
      return values[this.manager.indexToNode(fromIndex)];
    });
  }

  addDimension(
    transitIndex: number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (!this.addDimensionState(name)) return false;
    this.operations.push({
      type: 'addDimension',
      transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
      slackMax,
      capacity,
      fixStartCumulToZero,
      name,
    });
    return true;
  }

  addDimensionWithVehicleCapacity(
    transitIndex: number,
    slackMax: number,
    capacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (!this.addDimensionState(name)) return false;
    this.operations.push({
      type: 'addDimensionWithVehicleCapacity',
      transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
      slackMax,
      capacities,
      fixStartCumulToZero,
      name,
    });
    return true;
  }

  addDimensionWithVehicleTransits(
    transitIndices: number[],
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (!this.addDimensionState(name)) return false;
    const indices = Array.isArray(transitIndices) ? transitIndices : [transitIndices];
    this.operations.push({
      type: 'addDimensionWithVehicleTransits',
      transitMatrices: indices.map((index) => this.buildTransitMatrixForEvaluator(index)),
      slackMax,
      capacity,
      fixStartCumulToZero,
      name,
    });
    return true;
  }

  addConstantDimension(
    value: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] {
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addConstantDimension', value, capacity, fixStartCumulToZero, name });
    return [this.nextEvaluatorIndex++, true];
  }

  addVectorDimension(values: number[], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addVectorDimension', values, capacity, fixStartCumulToZero, name });
    return [this.nextEvaluatorIndex++, true];
  }

  addMatrixDimension(matrix: number[][], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addMatrixDimension', matrix, capacity, fixStartCumulToZero, name });
    return [this.nextEvaluatorIndex++, true];
  }

  getDimensionOrDie(name: string): RoutingDimension {
    const state = this.dimensions.get(name);
    if (!state) {
      throw new Error(`RoutingModel.getDimensionOrDie: unknown dimension '${name}'.`);
    }
    return new RoutingDimension(
      name,
      state,
      (boundCost, vehicle) => this.operations.push({
        type: 'setSoftSpanUpperBound',
        dimensionName: name,
        bound: boundCost.bound,
        cost: boundCost.cost,
        vehicle,
      }),
      (boundCost, vehicle) => this.operations.push({
        type: 'setQuadraticCostSoftSpanUpperBound',
        dimensionName: name,
        bound: boundCost.bound,
        cost: boundCost.cost,
        vehicle,
      }),
    );
  }

  addDisjunction(indices: number[], penalty?: number): number {
    this.operations.push({ type: 'addDisjunction', indices, penalty });
    return this.operations.length - 1;
  }

  closeModelWithParameters(parameters: RoutingSearchParameters): void {
    void parameters;
  }

  getNumberOfDecisionsInFirstSolution(parameters: RoutingSearchParameters): number {
    return parameters.firstSolutionStrategy === FirstSolutionStrategy.SAVINGS
      ? this.manager.getNumberOfIndices()
      : 0;
  }

  getNumberOfRejectsInFirstSolution(parameters: RoutingSearchParameters): number {
    void parameters;
    return 0;
  }

  async solveFromAssignmentWithParameters(
    assignment: Assignment,
    parameters: RoutingSearchParameters,
    options: RoutingSolveOptions = {},
  ): Promise<Assignment | null> {
    return this.solveWithExecutor(
      parameters,
      options,
      initialRoutesForAssignment(assignment, this),
    );
  }

  readAssignmentFromRoutes(routes: number[][], ignoreInactiveIndices: boolean): Assignment {
    const result = this.resultFromRoutes(routes, ignoreInactiveIndices);
    this.lastResult = result;
    this.lastStatus = RoutingSearchStatus.ROUTING_SUCCESS;
    this.lastObjectiveValue = result.objectiveValue;
    return new Assignment(
      this,
      result,
      routes.map((route) => [...route]),
      ignoreInactiveIndices,
    );
  }

  getAutomaticFirstSolutionStrategy(): FirstSolutionStrategy {
    return this.operations.some((operation) => operation.type === 'addPickupAndDelivery')
      ? FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
      : FirstSolutionStrategy.PATH_CHEAPEST_ARC;
  }

  addPickupAndDelivery(pickup: number, delivery: number): void {
    this.operations.push({ type: 'addPickupAndDelivery', pickup, delivery });
  }

  addAtSolutionCallback(callback: (() => void) | { __call__(): void }): void {
    this.atSolutionCallbacks.push(typeof callback === 'function' ? callback : () => callback.__call__());
  }

  costVar(): { max: () => number } {
    return { max: () => this.lastObjectiveValue };
  }

  solver(): {
    parameters: () => { tracePropagation: boolean };
    localSearchProfile: () => string;
    add: (...constraints: unknown[]) => void;
  } {
    return {
      parameters: () => ({ tracePropagation: this.parameters?.solverParameters.tracePropagation ?? false }),
      localSearchProfile: () => 'Local search profile is not exposed by the executor.',
      add: (...constraints) => {
        for (const constraint of constraints) {
          this.addSolverConstraint(constraint);
        }
      },
    };
  }

  nextVar(index: number): number {
    return index;
  }

  vehicleVar(index: number): RoutingVehicleVar {
    return { kind: 'routingVehicleVar', index };
  }

  private addSolverConstraint(constraint: unknown): void {
    if (isRoutingVehicleEqualityConstraint(constraint)) {
      this.operations.push({
        type: 'addVehicleEqualityConstraint',
        left: constraint.left.index,
        right: constraint.right.index,
      });
      return;
    }

    if (isRoutingCumulLessOrEqualConstraint(constraint)) {
      if (constraint.left.dimensionName !== constraint.right.dimensionName) {
        throw new Error('RoutingModel.solver().add: cumul precedence constraints require the same dimension.');
      }
      this.operations.push({
        type: 'addCumulLessOrEqualConstraint',
        dimensionName: constraint.left.dimensionName,
        left: constraint.left.index,
        right: constraint.right.index,
      });
    }
  }

  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number {
    void vehicle;
    const dimension = this.manager.getNumberOfIndices();
    const matrix = this.buildTransitMatrix();
    return Number(matrix[fromIndex * dimension + toIndex]);
  }

  assignmentObjectiveValue(): number {
    return this.lastObjectiveValue;
  }

  nextValue(index: number): number {
    return this.lastResult?.nextValues[index] ?? index;
  }

  dimensionCumulValue(dimensionName: string, index: number): number {
    return this.lastResult?.dimensionCumulValues[dimensionName]?.[index] ?? 0;
  }

  private addDimensionState(name: string): boolean {
    if (this.dimensions.has(name)) return false;
    this.dimensions.set(name, {
      softSpanUpperBounds: new Map(),
      quadraticCostSoftSpanUpperBounds: new Map(),
    });
    return true;
  }

  private callbackForEvaluator(): RoutingTransitCallback {
    if (this.arcCostEvaluatorIndex === null) {
      return () => 0;
    }
    return this.callbackForEvaluatorIndex(this.arcCostEvaluatorIndex);
  }

  private callbackForEvaluatorIndex(evaluatorIndex: number): RoutingTransitCallback {
    const callback = this.evaluatorCallbacks.get(evaluatorIndex);
    if (!callback) {
      throw new Error(`RoutingModel: evaluator ${evaluatorIndex} is unavailable.`);
    }
    return callback;
  }

  private buildTransitMatrix(): BigInt64Array {
    const callback = this.callbackForEvaluator();
    return this.buildTransitMatrixFromCallback(callback);
  }

  private buildTransitMatrixForEvaluator(evaluatorIndex: number): BigInt64Array {
    return this.buildTransitMatrixFromCallback(this.callbackForEvaluatorIndex(evaluatorIndex));
  }

  private buildTransitMatrixFromCallback(callback: RoutingTransitCallback): BigInt64Array {
    const dimension = this.manager.getNumberOfIndices();
    const matrix = new BigInt64Array(dimension * dimension);
    for (let from = 0; from < dimension; from++) {
      for (let to = 0; to < dimension; to++) {
        matrix[from * dimension + to] = toInt64(callback(from, to));
      }
    }
    return matrix;
  }

  private resultFromRoutes(routes: number[][], ignoreInactiveIndices: boolean): RoutingSolveResult {
    const dimension = this.manager.getNumberOfIndices();
    const nextValues = Array.from({ length: dimension }, (_, index) => index);
    const starts = Array.from({ length: this.manager.numVehicles }, (_, vehicle) => this.manager.getStartIndex(vehicle));
    const ends = Array.from({ length: this.manager.numVehicles }, (_, vehicle) => this.manager.getEndIndex(vehicle));
    const matrix = this.buildTransitMatrix();
    const assigned = new Set<number>();
    let objectiveValue = 0;

    const arcCost = (from: number, to: number) => Number(matrix[from * dimension + to]);
    const checkIndex = (index: number, label: string) => {
      if (!Number.isInteger(index) || index < 0 || index >= dimension) {
        throw new Error(`RoutingModel.readAssignmentFromRoutes: ${label} index ${index} is out of range.`);
      }
      if (ends.includes(index)) {
        throw new Error(`RoutingModel.readAssignmentFromRoutes: ${label} index ${index} is an end index.`);
      }
      if (assigned.has(index)) {
        throw new Error(`RoutingModel.readAssignmentFromRoutes: ${label} index ${index} is duplicated.`);
      }
      assigned.add(index);
    };

    for (let vehicle = 0; vehicle < starts.length; vehicle++) {
      const route = routes[vehicle] ?? [];
      let previous = starts[vehicle];
      for (const [position, index] of route.entries()) {
        checkIndex(index, `vehicle ${vehicle} route position ${position}`);
        nextValues[previous] = index;
        objectiveValue += arcCost(previous, index);
        previous = index;
      }
      nextValues[previous] = ends[vehicle];
      objectiveValue += arcCost(previous, ends[vehicle]);
    }

    if (!ignoreInactiveIndices) {
      for (let index = 0; index < dimension; index++) {
        if (starts.includes(index) || ends.includes(index) || assigned.has(index)) continue;
        const node = this.manager.indexToNode(index);
        if (this.manager.nodeToIndex(node) === index) {
          throw new Error(`RoutingModel.readAssignmentFromRoutes: node ${node} is not assigned to any route.`);
        }
      }
    }

    return {
      status: RoutingSearchStatus.ROUTING_SUCCESS,
      objectiveValue,
      nextValues,
      starts,
      ends,
      dimensionCumulValues: {},
    };
  }

  private runAtSolutionCallbacks(): void {
    for (const callback of this.atSolutionCallbacks) {
      callback();
    }
  }
}

function routingAbortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(signal.reason === undefined ? 'The Routing solve was aborted.' : String(signal.reason));
  error.name = 'AbortError';
  return error;
}
