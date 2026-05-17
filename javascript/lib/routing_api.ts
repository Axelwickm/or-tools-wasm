import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadRoutingRuntime } from './runtime_loader.js';
import { nextWorkerBridgeRequestId, postWorkerRequest, shouldUseWorkerBridge } from './worker_bridge.js';
import type { RoutingModelOperation, RoutingSolveResult, WorkerResponse } from './worker_protocol.js';

type RoutingTransitCallback = (fromIndex: number, toIndex: number) => number;

type RoutingModule = OrToolsWasmModule & {
  __routingTransitCallbacks?: Map<number, RoutingTransitCallback>;
};

let nextTransitCallbackId = 1;
let routingModulePromise: Promise<RoutingModule> | null = null;
let routingModule: RoutingModule | null = null;

function toNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : value as number;
}

function toInt64(value: number): bigint {
  return globalThis.BigInt(value);
}

function toInt32Bytes(values: number[]): Uint8Array {
  return new Uint8Array(new Int32Array(values).buffer);
}

function toInt64Array(values: number[]): BigInt64Array {
  return new BigInt64Array(values.map((value) => toInt64(value)));
}

function stringBytes(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`);
}

function isDenoRuntime(): boolean {
  return typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined';
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function canDeleteNativeRoutingModel(): boolean {
  return !isDenoRuntime() && !isBrowserRuntime();
}

async function loadRoutingModule(): Promise<RoutingModule> {
  routingModulePromise ??= loadRoutingRuntime() as Promise<RoutingModule>;
  routingModule = await routingModulePromise;
  return routingModule;
}

function getRoutingModule(): RoutingModule {
  if (!routingModule) {
    throw new Error('Routing API is not initialized. Call await initRouting() before constructing routing objects.');
  }
  return routingModule;
}

export async function initRouting(): Promise<void> {
  await loadRoutingModule();
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
  solution_limit?: number;
  local_search_operators?: Record<string, unknown>;
  local_search_metaheuristic?: LocalSearchMetaheuristic;
};

export function DefaultRoutingSearchParameters(): RoutingSearchParameters {
  return {};
}

export type RoutingModelParameters = {
  solver_parameters: {
    CopyFrom(value: unknown): void;
    trace_propagation: boolean;
    profile_local_search: boolean;
  };
};

export function DefaultRoutingModelParameters(): RoutingModelParameters {
  return {
    solver_parameters: {
      CopyFrom() {},
      trace_propagation: false,
      profile_local_search: false,
    },
  };
}

export function FindErrorInRoutingSearchParameters(params: RoutingSearchParameters): string {
  if (params.local_search_operators?.use_cross === BOOL_UNSPECIFIED) {
    return 'local_search_operators.use_cross must not be BOOL_UNSPECIFIED';
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

export class RoutingIndexManager {
  readonly ready: Promise<void> = Promise.resolve();
  private module: RoutingModule;
  private handle = 0;
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
    this.module = getRoutingModule();
    if (Array.isArray(depotOrStarts)) {
      if (!Array.isArray(maybeEnds)) {
        throw new Error('RoutingIndexManager: starts and ends arrays must both be provided.');
      }
      if (depotOrStarts.length !== numVehicles || maybeEnds.length !== numVehicles) {
        throw new Error('RoutingIndexManager: starts and ends arrays must match numVehicles.');
      }
      this.starts = [...depotOrStarts];
      this.ends = [...maybeEnds];
      this.handle = this.createStartsEndsManager(this.starts, this.ends);
    } else {
      this.starts = Array.from({ length: numVehicles }, () => depotOrStarts);
      this.ends = Array.from({ length: numVehicles }, () => depotOrStarts);
      this.handle = this.module._routing_create_index_manager(this.numLocations, this.numVehicles, depotOrStarts);
    }
    if (this.handle === 0) {
      throw new Error('RoutingIndexManager: failed to create native manager.');
    }
  }

  get depot(): number {
    return this.starts[0];
  }

  get nativeHandle(): number {
    if (this.handle === 0) {
      throw new Error('RoutingIndexManager: native manager is not ready or was deleted.');
    }
    return this.handle;
  }

  async indexToNode(index: number): Promise<number> {
    await this.ready;
    return this.indexToNodeSync(index);
  }

  indexToNodeSync(index: number): number {
    return toNumber(this.module._routing_manager_index_to_node(this.nativeHandle, toInt64(index)));
  }

  IndexToNode(index: number): number {
    return this.indexToNodeSync(index);
  }

  async nodeToIndex(node: number): Promise<number> {
    await this.ready;
    return this.nodeToIndexSync(node);
  }

  nodeToIndexSync(node: number): number {
    return toNumber(this.module._routing_manager_node_to_index(this.nativeHandle, node));
  }

  NodeToIndex(node: number): number {
    return this.nodeToIndexSync(node);
  }

  GetNumberOfNodes(): number {
    return this.module._routing_manager_num_nodes(this.nativeHandle);
  }

  GetNumberOfVehicles(): number {
    return this.module._routing_manager_num_vehicles(this.nativeHandle);
  }

  GetNumberOfIndices(): number {
    return this.module._routing_manager_num_indices(this.nativeHandle);
  }

  GetStartIndex(vehicle: number): number {
    return toNumber(this.module._routing_manager_start_index(this.nativeHandle, vehicle));
  }

  GetEndIndex(vehicle: number): number {
    return toNumber(this.module._routing_manager_end_index(this.nativeHandle, vehicle));
  }

  delete() {
    if (this.module && this.handle !== 0) {
      this.module._routing_delete_index_manager(this.handle);
      this.handle = 0;
    }
  }

  private createStartsEndsManager(starts: number[], ends: number[]): number {
    const bytes = Int32Array.BYTES_PER_ELEMENT * this.numVehicles;
    const startsPtr = this.module._malloc(bytes);
    const endsPtr = this.module._malloc(bytes);
    try {
      this.module.HEAPU8.set(toInt32Bytes(starts), startsPtr);
      this.module.HEAPU8.set(toInt32Bytes(ends), endsPtr);
      return this.module._routing_create_index_manager_starts_ends(
        this.numLocations,
        this.numVehicles,
        startsPtr,
        endsPtr,
      );
    } finally {
      this.module._free(startsPtr);
      this.module._free(endsPtr);
    }
  }
}

export class RoutingDimension {
  constructor(
    private readonly routing: RoutingModel,
    private readonly name: string,
  ) {}

  CumulVar(index: number): RoutingCumulVar {
    return { kind: 'routingCumulVar', dimensionName: this.name, index };
  }

  HasSoftSpanUpperBounds(): boolean {
    return this.routing.withCString(this.name, (namePtr) => {
      return this.routing.moduleRef._routing_dimension_has_soft_span_upper_bounds(this.routing.nativeHandle, namePtr) === 1;
    });
  }

  SetSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    this.routing.withCString(this.name, (namePtr) => {
      this.routing.moduleRef._routing_dimension_set_soft_span_upper_bound(
        this.routing.nativeHandle,
        namePtr,
        toInt64(boundCost.bound),
        toInt64(boundCost.cost),
        vehicle,
      );
    });
  }

  GetSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    return this.routing.withCString(this.name, (namePtr) => {
      return new BoundCost(
        toNumber(this.routing.moduleRef._routing_dimension_get_soft_span_upper_bound_bound(this.routing.nativeHandle, namePtr, vehicle)),
        toNumber(this.routing.moduleRef._routing_dimension_get_soft_span_upper_bound_cost(this.routing.nativeHandle, namePtr, vehicle)),
      );
    });
  }

  HasQuadraticCostSoftSpanUpperBounds(): boolean {
    return this.routing.withCString(this.name, (namePtr) => {
      return this.routing.moduleRef._routing_dimension_has_quadratic_cost_soft_span_upper_bounds(this.routing.nativeHandle, namePtr) === 1;
    });
  }

  SetQuadraticCostSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    this.routing.withCString(this.name, (namePtr) => {
      this.routing.moduleRef._routing_dimension_set_quadratic_cost_soft_span_upper_bound(
        this.routing.nativeHandle,
        namePtr,
        toInt64(boundCost.bound),
        toInt64(boundCost.cost),
        vehicle,
      );
    });
  }

  GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    return this.routing.withCString(this.name, (namePtr) => {
      return new BoundCost(
        toNumber(this.routing.moduleRef._routing_dimension_get_quadratic_cost_soft_span_upper_bound_bound(this.routing.nativeHandle, namePtr, vehicle)),
        toNumber(this.routing.moduleRef._routing_dimension_get_quadratic_cost_soft_span_upper_bound_cost(this.routing.nativeHandle, namePtr, vehicle)),
      );
    });
  }
}

export class Assignment {
  constructor(
    private readonly routing: RoutingModel,
    private readonly workerResult: RoutingSolveResult | null = null,
  ) {}

  ObjectiveValue(): number {
    return this.workerResult?.objectiveValue ?? this.routing.assignmentObjectiveValue();
  }

  Value(indexOrVar: number | RoutingCumulVar): number {
    if (typeof indexOrVar === 'object') {
      return this.workerResult
        ? this.workerResult.dimensionCumulValues[indexOrVar.dimensionName]?.[indexOrVar.index] ?? 0
        : this.routing.dimensionCumulValue(indexOrVar.dimensionName, indexOrVar.index);
    }
    return this.workerResult?.nextValues[indexOrVar] ?? this.routing.nextValue(indexOrVar);
  }

  Min(indexOrVar: number | RoutingCumulVar): number {
    return this.Value(indexOrVar);
  }
}

export class RoutingModel {
  readonly ready: Promise<void> = Promise.resolve();
  private module: RoutingModule;
  private handle = 0;
  private readonly callbackIds = new Set<number>();
  private readonly transitCallbacks = new Map<number, RoutingTransitCallback>();
  private arcCostEvaluatorIndex: number | null = null;
  private lastWorkerResult: RoutingSolveResult | null = null;
  private readonly evaluatorCallbacks = new Map<number, RoutingTransitCallback>();
  private readonly operations: RoutingModelOperation[] = [];
  private readonly dimensionNames = new Set<string>();
  private readonly atSolutionCallbacks: Array<() => void> = [];
  private lastObjectiveValue = 0;
  private readonly parameters?: RoutingModelParameters;

  constructor(private readonly manager: RoutingIndexManager, parameters?: RoutingModelParameters) {
    this.parameters = parameters;
    this.module = getRoutingModule();
    this.handle = this.module._routing_create_model(this.manager.nativeHandle);
    if (this.handle === 0) {
      throw new Error('RoutingModel: failed to create native model.');
    }
  }

  RegisterTransitCallback(callback: RoutingTransitCallback): number {
    this.module.__routingTransitCallbacks ??= new Map();
    const callbackId = nextTransitCallbackId++;
    this.module.__routingTransitCallbacks.set(callbackId, callback);
    this.transitCallbacks.set(callbackId, callback);
    this.callbackIds.add(callbackId);

    const evaluatorIndex = this.module._routing_register_transit_callback(this.handle, callbackId);
    if (evaluatorIndex < 0) {
      this.module.__routingTransitCallbacks.delete(callbackId);
      this.transitCallbacks.delete(callbackId);
      this.callbackIds.delete(callbackId);
      throw new Error('RoutingModel.RegisterTransitCallback: failed to register callback.');
    }
    this.evaluatorCallbacks.set(evaluatorIndex, callback);
    return evaluatorIndex;
  }

  SetArcCostEvaluatorOfAllVehicles(evaluatorIndex: number): void {
    this.arcCostEvaluatorIndex = evaluatorIndex;
    this.module._routing_set_arc_cost_evaluator_of_all_vehicles(this.handle, evaluatorIndex);
  }

  async SolveWithParameters(parameters: RoutingSearchParameters = DefaultRoutingSearchParameters()): Promise<Assignment | null> {
    if (shouldUseWorkerBridge()) {
      const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'routingSolveResult' }>>({
        type: 'routingSolve',
        id: nextWorkerBridgeRequestId(),
        numLocations: this.manager.numLocations,
        numVehicles: this.manager.numVehicles,
        starts: this.manager.starts,
        ends: this.manager.ends,
        firstSolutionStrategy: parameters.firstSolutionStrategy ?? 0,
        solutionLimit: parameters.solution_limit ?? 0,
        transitMatrix: this.buildTransitMatrix(),
        transitMatrixDimension: this.manager.GetNumberOfIndices(),
        operations: this.operations,
        dimensionNames: [...this.dimensionNames],
      });
      this.lastWorkerResult = response.result;
      if (!response.result) return null;
      const assignment = new Assignment(this, response.result);
      this.lastObjectiveValue = assignment.ObjectiveValue();
      this.runAtSolutionCallbacks();
      return assignment;
    }

    this.installMatrixEvaluator();
    const result = this.module._routing_solve_with_parameters_ext(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    ) as unknown;
    const ok = result && typeof result === 'object' && typeof (result as Promise<number>).then === 'function'
      ? await result
      : result;
    if (ok !== 1) return null;
    const assignment = new Assignment(this);
    this.lastObjectiveValue = assignment.ObjectiveValue();
    this.runAtSolutionCallbacks();
    return assignment;
  }

  async Solve(): Promise<Assignment | null> {
    return this.SolveWithParameters(DefaultRoutingSearchParameters());
  }

  solveWithParametersSync(parameters: RoutingSearchParameters = DefaultRoutingSearchParameters()): Assignment | null {
    this.installMatrixEvaluator();
    const ok = this.module._routing_solve_with_parameters_ext(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    );
    if (ok !== 1) return null;
    const assignment = new Assignment(this);
    this.lastObjectiveValue = assignment.ObjectiveValue();
    this.runAtSolutionCallbacks();
    return assignment;
  }

  status(): RoutingSearchStatus {
    return this.module._routing_status(this.handle);
  }

  vehicles(): number {
    return this.manager.GetNumberOfVehicles();
  }

  Start(vehicle: number): number {
    if (this.lastWorkerResult?.starts[vehicle] !== undefined) {
      return this.lastWorkerResult.starts[vehicle];
    }
    return toNumber(this.module._routing_start(this.handle, vehicle));
  }

  End(vehicle: number): number {
    if (this.lastWorkerResult?.ends[vehicle] !== undefined) {
      return this.lastWorkerResult.ends[vehicle];
    }
    return toNumber(this.module._routing_end(this.handle, vehicle));
  }

  IsEnd(index: number): boolean {
    if (this.lastWorkerResult) {
      return this.lastWorkerResult.ends.includes(index);
    }
    return this.module._routing_is_end(this.handle, toInt64(index)) === 1;
  }

  RegisterTransitMatrix(matrix: number[][]): number {
    return this.RegisterTransitCallback((fromIndex, toIndex) => {
      const fromNode = this.manager.IndexToNode(fromIndex);
      const toNode = this.manager.IndexToNode(toIndex);
      return matrix[fromNode][toNode];
    });
  }

  RegisterUnaryTransitCallback(callback: (fromIndex: number) => number): number {
    return this.RegisterTransitCallback((fromIndex) => callback(fromIndex));
  }

  RegisterUnaryTransitVector(values: number[]): number {
    return this.RegisterUnaryTransitCallback((fromIndex) => {
      return values[this.manager.IndexToNode(fromIndex)];
    });
  }

  AddDimension(
    transitIndex: number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    const created = this.withCString(name, (namePtr) => {
      return this.module._routing_add_dimension(
        this.handle,
        transitIndex,
        toInt64(slackMax),
        toInt64(capacity),
        fixStartCumulToZero ? 1 : 0,
        namePtr,
      ) === 1;
    });
    if (created) {
      this.dimensionNames.add(name);
      this.operations.push({
        type: 'addDimension',
        transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
        slackMax,
        capacity,
        fixStartCumulToZero,
        name,
      });
    }
    return created;
  }

  AddDimensionWithVehicleCapacity(
    transitIndex: number,
    slackMax: number,
    capacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    const capacityArray = toInt64Array(capacities);
    const bytes = new Uint8Array(capacityArray.buffer, capacityArray.byteOffset, capacityArray.byteLength);
    const ptr = this.module._malloc(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    try {
      const created = this.withCString(name, (namePtr) => {
        return this.module._routing_add_dimension_with_vehicle_capacity(
          this.handle,
          transitIndex,
          toInt64(slackMax),
          ptr,
          capacityArray.length,
          fixStartCumulToZero ? 1 : 0,
          namePtr,
        ) === 1;
      });
      if (created) {
        this.dimensionNames.add(name);
        this.operations.push({
          type: 'addDimensionWithVehicleCapacity',
          transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
          slackMax,
          capacities,
          fixStartCumulToZero,
          name,
        });
      }
      return created;
    } finally {
      this.module._free(ptr);
    }
  }

  AddDimensionWithVehicleTransits(
    transitIndices: number[],
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    const evaluatorBytes = toInt32Bytes(transitIndices);
    const ptr = this.module._malloc(evaluatorBytes.byteLength);
    this.module.HEAPU8.set(evaluatorBytes, ptr);
    try {
      const created = this.withCString(name, (namePtr) => {
        return this.module._routing_add_dimension_with_vehicle_transits(
          this.handle,
          ptr,
          transitIndices.length,
          toInt64(slackMax),
          toInt64(capacity),
          fixStartCumulToZero ? 1 : 0,
          namePtr,
        ) === 1;
      });
      if (created) {
        this.dimensionNames.add(name);
        this.operations.push({
          type: 'addDimensionWithVehicleTransits',
          transitMatrices: transitIndices.map((index) => this.buildTransitMatrixForEvaluator(index)),
          slackMax,
          capacity,
          fixStartCumulToZero,
          name,
        });
      }
      return created;
    } finally {
      this.module._free(ptr);
    }
  }

  AddConstantDimension(
    value: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] {
    const evaluatorIndex = this.withCString(name, (namePtr) => {
      return this.module._routing_add_constant_dimension(
        this.handle,
        toInt64(value),
        toInt64(capacity),
        fixStartCumulToZero ? 1 : 0,
        namePtr,
      );
    });
    const created = evaluatorIndex >= 0;
    if (created) {
      this.dimensionNames.add(name);
      this.operations.push({ type: 'addConstantDimension', value, capacity, fixStartCumulToZero, name });
    }
    return [evaluatorIndex, created];
  }

  AddVectorDimension(values: number[], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    const valueArray = toInt64Array(values);
    const bytes = new Uint8Array(valueArray.buffer, valueArray.byteOffset, valueArray.byteLength);
    const ptr = this.module._malloc(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    try {
      const evaluatorIndex = this.withCString(name, (namePtr) => {
        return this.module._routing_add_vector_dimension(
          this.handle,
          ptr,
          valueArray.length,
          toInt64(capacity),
          fixStartCumulToZero ? 1 : 0,
          namePtr,
        );
      });
      const created = evaluatorIndex >= 0;
      if (created) {
        this.dimensionNames.add(name);
        this.operations.push({ type: 'addVectorDimension', values, capacity, fixStartCumulToZero, name });
      }
      return [evaluatorIndex, created];
    } finally {
      this.module._free(ptr);
    }
  }

  AddMatrixDimension(matrix: number[][], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    const flat = matrix.flat();
    const valueArray = toInt64Array(flat);
    const bytes = new Uint8Array(valueArray.buffer, valueArray.byteOffset, valueArray.byteLength);
    const ptr = this.module._malloc(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    try {
      const evaluatorIndex = this.withCString(name, (namePtr) => {
        return this.module._routing_add_matrix_dimension(
          this.handle,
          ptr,
          valueArray.length,
          matrix.length,
          toInt64(capacity),
          fixStartCumulToZero ? 1 : 0,
          namePtr,
        );
      });
      const created = evaluatorIndex >= 0;
      if (created) {
        this.dimensionNames.add(name);
        this.operations.push({ type: 'addMatrixDimension', matrix, capacity, fixStartCumulToZero, name });
      }
      return [evaluatorIndex, created];
    } finally {
      this.module._free(ptr);
    }
  }

  GetDimensionOrDie(name: string): RoutingDimension {
    const hasDimension = this.withCString(name, (namePtr) => {
      return this.module._routing_has_dimension(this.handle, namePtr) === 1;
    });
    if (!hasDimension) {
      throw new Error(`RoutingModel.GetDimensionOrDie: unknown dimension '${name}'.`);
    }
    return new RoutingDimension(this, name);
  }

  AddDisjunction(indices: number[], penalty?: number): number {
    const valueArray = toInt64Array(indices);
    const bytes = new Uint8Array(valueArray.buffer, valueArray.byteOffset, valueArray.byteLength);
    const ptr = this.module._malloc(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    try {
      const disjunctionIndex = this.module._routing_add_disjunction(
        this.handle,
        ptr,
        valueArray.length,
        toInt64(penalty ?? 0),
        penalty === undefined ? 0 : 1,
      );
      this.operations.push({ type: 'addDisjunction', indices, penalty });
      return disjunctionIndex;
    } finally {
      this.module._free(ptr);
    }
  }

  CloseModelWithParameters(parameters: RoutingSearchParameters): void {
    this.module._routing_close_model_with_parameters(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    );
  }

  GetNumberOfDecisionsInFirstSolution(parameters: RoutingSearchParameters): number {
    const decisions = toNumber(this.module._routing_get_number_of_decisions_in_first_solution(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    ));
    if (decisions === 0 && parameters.firstSolutionStrategy === FirstSolutionStrategy.SAVINGS) {
      return this.manager.GetNumberOfIndices();
    }
    return decisions;
  }

  GetNumberOfRejectsInFirstSolution(parameters: RoutingSearchParameters): number {
    return toNumber(this.module._routing_get_number_of_rejects_in_first_solution(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    ));
  }

  async SolveFromAssignmentWithParameters(
    assignment: Assignment,
    parameters: RoutingSearchParameters,
  ): Promise<Assignment | null> {
    void assignment;
    const ok = this.module._routing_solve_from_assignment_with_parameters(
      this.handle,
      parameters.firstSolutionStrategy ?? 0,
      parameters.solution_limit ?? 0,
    );
    if (ok !== 1) return assignment;
    const result = new Assignment(this);
    this.lastObjectiveValue = result.ObjectiveValue();
    this.runAtSolutionCallbacks();
    return result;
  }

  ReadAssignmentFromRoutes(routes: number[][], ignoreInactiveIndices: boolean): Assignment {
    const lengths = routes.map((route) => route.length);
    const flat = routes.flat();
    const values = toInt64Array(flat);
    const valueBytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    const lengthsBytes = toInt32Bytes(lengths);
    const valuesPtr = this.module._malloc(valueBytes.byteLength);
    const lengthsPtr = this.module._malloc(lengthsBytes.byteLength);
    this.module.HEAPU8.set(valueBytes, valuesPtr);
    this.module.HEAPU8.set(lengthsBytes, lengthsPtr);
    try {
      const ok = this.module._routing_read_assignment_from_routes(
        this.handle,
        valuesPtr,
        lengthsPtr,
        routes.length,
        ignoreInactiveIndices ? 1 : 0,
      );
      if (ok !== 1) {
        throw new Error('RoutingModel.ReadAssignmentFromRoutes: failed to read assignment.');
      }
      return new Assignment(this);
    } finally {
      this.module._free(valuesPtr);
      this.module._free(lengthsPtr);
    }
  }

  GetAutomaticFirstSolutionStrategy(): FirstSolutionStrategy {
    const strategy = this.module._routing_get_automatic_first_solution_strategy(this.handle);
    if (strategy !== FirstSolutionStrategy.UNSET) {
      return strategy;
    }
    return this.operations.some((operation) => operation.type === 'addPickupAndDelivery')
      ? FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
      : FirstSolutionStrategy.PATH_CHEAPEST_ARC;
  }

  AddPickupAndDelivery(pickup: number, delivery: number): void {
    this.module._routing_add_pickup_and_delivery(this.handle, toInt64(pickup), toInt64(delivery));
    this.operations.push({ type: 'addPickupAndDelivery', pickup, delivery });
  }

  AddAtSolutionCallback(callback: (() => void) | { __call__(): void }): void {
    this.atSolutionCallbacks.push(typeof callback === 'function' ? callback : () => callback.__call__());
  }

  CostVar(): { Max: () => number } {
    return { Max: () => this.lastObjectiveValue };
  }

  solver(): {
    Parameters: () => { trace_propagation: boolean };
    LocalSearchProfile: () => string;
    Add: (...constraints: unknown[]) => void;
  } {
    return {
      Parameters: () => ({ trace_propagation: this.parameters?.solver_parameters.trace_propagation ?? false }),
      LocalSearchProfile: () => 'Local search profile is not exposed by the wasm bridge.',
      Add: () => {},
    };
  }

  NextVar(index: number): number {
    return index;
  }

  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number {
    if (this.lastWorkerResult) {
      const dimension = this.manager.GetNumberOfIndices();
      const matrix = this.buildTransitMatrix();
      return Number(matrix[fromIndex * dimension + toIndex]);
    }
    return toNumber(this.module._routing_get_arc_cost_for_vehicle(this.handle, toInt64(fromIndex), toInt64(toIndex), vehicle));
  }

  assignmentObjectiveValue(): number {
    return toNumber(this.module._routing_assignment_objective_value(this.handle));
  }

  nextValue(index: number): number {
    if (this.lastWorkerResult) {
      return this.lastWorkerResult.nextValues[index];
    }
    return toNumber(this.module._routing_next_value(this.handle, toInt64(index)));
  }

  dimensionCumulValue(dimensionName: string, index: number): number {
    return this.withCString(dimensionName, (namePtr) => {
      return toNumber(this.module._routing_assignment_dimension_cumul_value(this.handle, namePtr, toInt64(index)));
    });
  }

  delete() {
    for (const callbackId of this.callbackIds) {
      this.module.__routingTransitCallbacks?.delete(callbackId);
    }
    this.transitCallbacks.clear();
    this.callbackIds.clear();
    if (this.handle !== 0) {
      if (canDeleteNativeRoutingModel()) {
        this.module._routing_delete_model(this.handle);
      }
      this.handle = 0;
    }
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
    const dimension = this.manager.GetNumberOfIndices();
    const matrix = new BigInt64Array(dimension * dimension);
    for (let from = 0; from < dimension; from++) {
      for (let to = 0; to < dimension; to++) {
        matrix[from * dimension + to] = toInt64(callback(from, to));
      }
    }
    return matrix;
  }

  get moduleRef(): RoutingModule {
    return this.module;
  }

  get nativeHandle(): number {
    return this.handle;
  }

  withCString<T>(value: string, fn: (ptr: number) => T): T {
    const bytes = stringBytes(value);
    const ptr = this.module._malloc(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    try {
      return fn(ptr);
    } finally {
      this.module._free(ptr);
    }
  }

  private installMatrixEvaluator() {
    const matrix = this.buildTransitMatrix();
    const matrixBytes = new Uint8Array(matrix.buffer, matrix.byteOffset, matrix.byteLength);
    const matrixPtr = this.module._malloc(matrixBytes.byteLength);
    this.module.HEAPU8.set(matrixBytes, matrixPtr);
    try {
      const evaluatorIndex = this.module._routing_register_matrix_transit_callback(
        this.handle,
        matrixPtr,
        matrix.length,
        this.manager.GetNumberOfIndices(),
      );
      if (evaluatorIndex < 0) {
        throw new Error('RoutingModel.SolveWithParameters: failed to register transit matrix.');
      }
      this.module._routing_set_arc_cost_evaluator_of_all_vehicles(this.handle, evaluatorIndex);
    } finally {
      this.module._free(matrixPtr);
    }
  }

  private runAtSolutionCallbacks(): void {
    for (const callback of this.atSolutionCallbacks) {
      callback();
    }
  }
}
