import { synchronousCallbackResult } from '../callback_validation.js';
import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorSelection, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent, SolverResourceRequest } from '../solver_executor.js';
import { createAbortError, executeSolverJob } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectRoutingExecutor } from './direct_executor.js';
import { routingRouteCallback, type RoutingRouteEvaluator } from './route_callbacks.js';
export type { RoutingRouteEvaluator } from './route_callbacks.js';
import {
  routingProtocol, type RoutingDimensionQuery, type RoutingDimensionInspection,
  RoutingModelQueryKind, type RoutingModelQuery,
  RoutingAssignmentAction, type RoutingWorkflow, type RoutingSearchStatistics,
  routingVariableKey,
  type RoutingAssignmentVariable,
  type RoutingAssignmentSnapshot,
  type RoutingResourceGroupData,
  type RoutingResourceData,
  RoutingTypeRequirementKind,
  RoutingFinalizerKind,
  RoutingVariableKind,
  RoutingDomainAction,
  type RoutingVariableReference,
  type RoutingDomainResult,
  type RoutingResult as RoutingNativeResult,
  type RoutingLinearExpression,
  type RoutingLinearComparison,
  type RoutingBooleanExpressionData,
  type RoutingSolveRequest,
  type RoutingBreakIntervalData,
  type RoutingActivityGroupInspection,
  type RoutingStateDependentMatrix,
  type RoutingExecutor,
  type RoutingModelOperation,
  type RoutingDimensionSetting,
  type RoutingSolveResult,
} from './protocol.js';
import { INT64_MIN, INT64_MAX, toIndex, toInt64, type IntValue } from '../int64.js';
import type { RoutingSearchParameters as RoutingSearchParametersProto, RoutingModelParameters as RoutingModelParametersProto, ConstraintSolverParameters } from '../generated/routing_parameters.js';
import { encodeRoutingSearchParameters, encodeRoutingModelParameters } from './search_parameters.js';

import { RoutingLinearExpr, RoutingBoolExpr, type RoutingBooleanOperand, type RoutingLinearOperand, type RoutingLinearConstraint } from './expressions.js';

export type RoutingDomainOptions = Pick<RoutingSolveOptions, 'executor' | 'signal'>;
export type { RoutingActivityGroupInspection } from './protocol.js';
export type RoutingBreakIntervalOptions = { startMin: IntValue; startMax: IntValue; duration: IntValue; optional?: boolean; name?: string };
export type RoutingBreakTravelOptions = { preTravelEvaluator?: number; postTravelEvaluator?: number };
export type RoutingPickupDeliveryPosition = { pairIndex: number; alternativeIndex: number };
export type RoutingBreakConfiguration = { hasBreakConstraints: boolean; intervals: RoutingBreakInterval[];
  distanceDuration: Array<{ distance: bigint; duration: bigint }>; preTravelEvaluator?: number; postTravelEvaluator?: number };
export type RoutingBreakSnapshot = { performed: boolean | null; startMin?: bigint; startMax?: bigint; endMin?: bigint; endMax?: bigint };
export type RoutingIntervalRange = { start: bigint; end: bigint };
export type RoutingPiecewiseLinearCostSegment<T extends IntValue = IntValue> = { pointX: T; pointY: T; slope: T; otherPointX: T };
export type RoutingPiecewiseLinearFunction = { x: readonly IntValue[]; y: readonly IntValue[] };
export type RoutingStateDependentTransitOptions = { domainStart: IntValue; domainEnd: IntValue };
const breakIntervalRecords = new WeakMap<RoutingBreakInterval, RoutingBreakIntervalData>();
let createBreakInterval: (model: RoutingModel, data: RoutingBreakIntervalData) => RoutingBreakInterval;
export class RoutingBreakInterval {
  private constructor(readonly model: RoutingModel, private readonly data: RoutingBreakIntervalData) { breakIntervalRecords.set(this, data); }
  static { createBreakInterval = (model, data) => new RoutingBreakInterval(model, data); }
  get index(): number { return this.data.index; }
  get name(): string { return this.data.name; }
  get startMin(): bigint { return this.data.startMin; }
  get startMax(): bigint { return this.data.startMax; }
  get duration(): bigint { return this.data.duration; }
  get optional(): boolean { return this.data.optional; }
}
export type RoutingVariableDomain = RoutingDomainResult;
type RoutingVariableMethods = {
  setMin(value: IntValue): void;
  setMax(value: IntValue): void;
  setRange(lower: IntValue, upper: IntValue): void;
  setValue(value: IntValue): void;
  setValues(values: readonly IntValue[]): void;
  removeValue(value: IntValue): void;
  removeValues(values: readonly IntValue[]): void;
  removeInterval(lower: IntValue, upper: IntValue): void;
  domain(options?: RoutingDomainOptions): Promise<RoutingVariableDomain>;
  min(options?: RoutingDomainOptions): Promise<bigint>;
  max(options?: RoutingDomainOptions): Promise<bigint>;
  size(options?: RoutingDomainOptions): Promise<bigint>;
  bound(options?: RoutingDomainOptions): Promise<boolean>;
  contains(value: IntValue, options?: RoutingDomainOptions): Promise<boolean>;
  value(options?: RoutingDomainOptions): Promise<bigint>;
  add(value: RoutingLinearOperand): RoutingLinearExpr;
  sub(value: RoutingLinearOperand): RoutingLinearExpr;
  mul(value: IntValue): RoutingLinearExpr;
  neg(): RoutingLinearExpr;
  eq(value: RoutingLinearOperand): RoutingLinearConstraint;
  ne(value: RoutingLinearOperand): RoutingLinearConstraint;
  le(value: RoutingLinearOperand): RoutingLinearConstraint;
  ge(value: RoutingLinearOperand): RoutingLinearConstraint;
  lt(value: RoutingLinearOperand): RoutingLinearConstraint;
  gt(value: RoutingLinearOperand): RoutingLinearConstraint;
};

type RoutingVariableIdentity = { kind: RoutingIntVar['kind']; model: RoutingModel; index: number; dimensionName?: string };
function decorateVariable<T extends RoutingVariableIdentity>(identity: T, overrides: PropertyDescriptorMap = {}): Readonly<T> & RoutingVariableMethods {
  return Object.freeze(Object.defineProperties(identity, { ...variableMethods(identity), ...overrides })) as Readonly<T> & RoutingVariableMethods;
}
function variableMethods(identity: RoutingVariableIdentity): PropertyDescriptorMap {
  const variable = identity as RoutingIntVar;
  const model = identity.model;
  const domain = (options: RoutingDomainOptions = {}) => model.inspectVariableDomain(variable, options);
  const methods: RoutingVariableMethods = {
    domain,
    min: async options => (await domain(options)).min,
    max: async options => (await domain(options)).max,
    size: async options => (await domain(options)).size,
    bound: async options => (await domain(options)).bound,
    contains: async (value, options) => (await model.inspectVariableDomain(variable, options, value)).contains === true,
    value: async options => { const result = await domain(options); if (!result.bound) throw new Error('Routing variable is not bound.'); return result.min; },
    setMin: value => model.setVariableRange(variable, value, INT64_MAX),
    setMax: value => model.setVariableRange(variable, INT64_MIN, value),
    setRange: (lower, upper) => model.setVariableRange(variable, lower, upper),
    setValue: value => model.setVariableValues(variable, [value]),
    setValues: values => model.setVariableValues(variable, values),
    removeValue: value => model.removeVariableValues(variable, [value]),
    removeValues: values => model.removeVariableValues(variable, values),
    removeInterval: (lower, upper) => model.removeVariableInterval(variable, lower, upper),
    add: value => RoutingLinearExpr.from(variable).add(value),
    sub: value => RoutingLinearExpr.from(variable).sub(value),
    mul: value => RoutingLinearExpr.from(variable).mul(value),
    neg: () => RoutingLinearExpr.from(variable).neg(),
    eq: value => RoutingLinearExpr.from(variable).eq(value),
    ne: value => RoutingLinearExpr.from(variable).ne(value),
    le: value => RoutingLinearExpr.from(variable).le(value),
    ge: value => RoutingLinearExpr.from(variable).ge(value),
    lt: value => RoutingLinearExpr.from(variable).lt(value),
    gt: value => RoutingLinearExpr.from(variable).gt(value),
  };
  return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, { value: method }]));
}

const INT32_MAX = 2_147_483_647;

type RoutingTransitCallback = (fromIndex: number, toIndex: number) => IntValue;

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

export type RoutingSolutionEvent = { type: 'solution'; objectiveValue: bigint; solutionCount: bigint; unchecked: boolean };
export type RoutingSearchEntryCallback = () => void | Promise<void>;
export type RoutingEvent = SolverJobEvent | RoutingSolutionEvent | { type: 'searchEntered' };
export type RoutingSolutionCallback = (event: RoutingSolutionEvent) => void | Promise<void>;
export type RoutingConstraint = RoutingBooleanOperand;
export type RoutingSolveOptions = RoutingSearchParameters & {
  executor?: ExecutorSelection;
  onEvent?: (event: RoutingEvent) => void | Promise<void>;
  signal?: AbortSignal;
  trackUncheckedNeighbors?: boolean;
};


export enum FirstSolutionStrategy {
  UNSET = 0,
  AUTOMATIC = 15,
  PATH_CHEAPEST_ARC = 3,
  PATH_MOST_CONSTRAINED_ARC = 4,
  EVALUATOR_STRATEGY = 5,
  SAVINGS = 10,
  PARALLEL_SAVINGS = 17,
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

export enum PickupAndDeliveryPolicy {
  PICKUP_AND_DELIVERY_NO_ORDER = 0,
  PICKUP_AND_DELIVERY_LIFO = 1,
  PICKUP_AND_DELIVERY_FIFO = 2,
}

export enum VisitTypePolicy {
  TYPE_ADDED_TO_VEHICLE = 0,
  ADDED_TYPE_REMOVED_FROM_VEHICLE = 1,
  TYPE_ON_VEHICLE_UP_TO_VISIT = 2,
  TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED = 3,
}

/** Native presence relationships for dimension node precedences. */
export enum RoutingPrecedencePerformedConstraint {
  FIRST_AND_SECOND_INDEPENDENT = 0,
  SECOND_IMPLIES_FIRST = 1,
  FIRST_IMPLIES_SECOND = 2,
  FIRST_AND_SECOND_EQUAL = 3,
}
/** Native registered transit-sign metadata. */
export enum RoutingTransitEvaluatorSign {
  UNKNOWN = 0,
  POSITIVE_OR_ZERO = 1,
  NEGATIVE_OR_ZERO = 2,
}
export type RoutingNodePrecedence = {
  first: number; second: number; offset: bigint; performedConstraint: RoutingPrecedencePerformedConstraint;
};

export enum PenaltyCostBehavior {
  PENALIZE_ONCE = 0,
  PENALIZE_PER_INACTIVE = 1,
}

export enum LocalSearchMetaheuristic {
  UNSET = 0,
  AUTOMATIC = 6,
  GREEDY_DESCENT = 1,
  GUIDED_LOCAL_SEARCH = 2,
  SIMULATED_ANNEALING = 3,
  TABU_SEARCH = 4,
  GENERIC_TABU_SEARCH = 5,
}

export const BOOL_FALSE = 2;
export const BOOL_TRUE = 3;
export const BOOL_UNSPECIFIED = 0;

export type RoutingSearchParameters = RoutingSearchParametersProto;
export type { RoutingDuration, RoutingSearchParameters_LocalSearchNeighborhoodOperators, RoutingSearchParameters_ImprovementSearchLimitParameters } from '../generated/routing_parameters.js';

export function defaultRoutingSearchParameters(): RoutingSearchParameters {
  return {};
}

export type RoutingModelParameters = RoutingModelParametersProto;
export type { ConstraintSolverParameters } from '../generated/routing_parameters.js';

export function defaultRoutingModelParameters(): RoutingModelParameters {
  return { solverParameters: { tracePropagation: false, profileLocalSearch: false } };
}

export class BoundCost {
  readonly bound: bigint;
  readonly cost: bigint;

  constructor(bound: IntValue = 0n, cost: IntValue = 0n) {
    this.bound = toInt64(bound, 'Routing span bound');
    this.cost = toInt64(cost, 'Routing span cost');
  }
}

type RoutingDimensionVar<Kind extends 'routingCumulVar' | 'routingSlackVar' | 'routingTransitVar' | 'routingFixedTransitVar'> = RoutingVariableMethods & {
  setMin(value: IntValue): void;
  setMax(value: IntValue): void;
  setRange(lower: IntValue, upper: IntValue): void;
  readonly kind: Kind;
  readonly model: RoutingModel;
  readonly dimensionName: string;
  readonly index: number;
};

type RoutingCumulVar = RoutingDimensionVar<'routingCumulVar'>;
type RoutingSlackVar = RoutingDimensionVar<'routingSlackVar'>;
export type RoutingTransitVar = RoutingDimensionVar<'routingTransitVar'>;
export type RoutingFixedTransitVar = RoutingDimensionVar<'routingFixedTransitVar'>;
export type RoutingActiveVehicleVar = RoutingVariableMethods & { readonly kind: 'routingActiveVehicleVar'; readonly model: RoutingModel; readonly index: number };
export type RoutingVehicleRouteConsideredVar = RoutingVariableMethods & { readonly kind: 'routingVehicleRouteConsideredVar'; readonly model: RoutingModel; readonly index: number };
export type RoutingExpressionVar = RoutingVariableMethods & { readonly kind: 'routingExpressionVar'; readonly model: RoutingModel; readonly index: number };
export type RoutingBoolVar = RoutingVariableMethods & { readonly kind: 'routingBoolVar'; readonly model: RoutingModel; readonly index: number };
export type RoutingResourceVar = RoutingVariableMethods & { readonly kind: 'routingResourceVar'; readonly model: RoutingModel; readonly index: number; readonly resourceGroup: number };
type RoutingActiveVar = RoutingVariableMethods & {
  readonly kind: 'routingActiveVar';
  readonly model: RoutingModel;
  readonly index: number;
};

function dimensionVariable<Kind extends 'routingCumulVar' | 'routingSlackVar'>(
  kind: Kind, model: RoutingModel, dimensionName: string, index: number,
  recordBounds: (index: number, lower: bigint, upper: bigint) => void,
): RoutingDimensionVar<Kind> {
  const label = kind === 'routingCumulVar' ? 'Routing cumul' : 'Routing slack';
  const setRange = (lower: IntValue, upper: IntValue): void => {
    const minimum = toInt64(lower, `${label} lower bound`);
    const maximum = toInt64(upper, `${label} upper bound`);
    if (minimum > maximum) throw new RangeError(`${label} lower bound exceeds upper bound.`);
    recordBounds(index, minimum, maximum);
  };
  return decorateVariable({ kind, model, dimensionName, index }, {
    setMin: { value: (value: IntValue) => setRange(value, INT64_MAX) },
    setMax: { value: (value: IntValue) => setRange(INT64_MIN, value) },
    setRange: { value: setRange },
  });
}

type RoutingVehicleVar = RoutingVariableMethods & {
  readonly kind: 'routingVehicleVar';
  readonly model: RoutingModel;
  readonly index: number;
};

/** Existing Routing variable handles; numbers returned by nextVar identify successor variables. */
type RoutingNextVar = RoutingVariableMethods & { readonly kind: 'routingNextVar'; readonly model: RoutingModel; readonly index: number };
export type RoutingIntVar = RoutingCumulVar | RoutingSlackVar | RoutingVehicleVar | RoutingActiveVar | RoutingNextVar | RoutingTransitVar | RoutingFixedTransitVar | RoutingActiveVehicleVar | RoutingVehicleRouteConsideredVar | RoutingResourceVar | RoutingBoolVar | RoutingExpressionVar;
export type RoutingFinalizerVariable = number | RoutingIntVar;

type CapturedRoutingVariable = RoutingSlackVar | RoutingTransitVar | RoutingFixedTransitVar | RoutingActiveVehicleVar | RoutingVehicleRouteConsideredVar | RoutingResourceVar | RoutingBoolVar | RoutingExpressionVar;
function routingVariableKind(kind: RoutingIntVar['kind']): RoutingVariableKind {
  switch (kind) {
    case 'routingNextVar': return RoutingVariableKind.ROUTING_VARIABLE_NEXT;
    case 'routingCumulVar': return RoutingVariableKind.ROUTING_VARIABLE_CUMUL;
    case 'routingSlackVar': return RoutingVariableKind.ROUTING_VARIABLE_SLACK;
    case 'routingVehicleVar': return RoutingVariableKind.ROUTING_VARIABLE_VEHICLE;
    case 'routingActiveVar': return RoutingVariableKind.ROUTING_VARIABLE_ACTIVE;
    case 'routingTransitVar': return RoutingVariableKind.ROUTING_VARIABLE_TRANSIT;
    case 'routingFixedTransitVar': return RoutingVariableKind.ROUTING_VARIABLE_FIXED_TRANSIT;
    case 'routingActiveVehicleVar': return RoutingVariableKind.ROUTING_VARIABLE_ACTIVE_VEHICLE;
    case 'routingVehicleRouteConsideredVar': return RoutingVariableKind.ROUTING_VARIABLE_ROUTE_CONSIDERED;
    case 'routingExpressionVar': return RoutingVariableKind.ROUTING_VARIABLE_EXPRESSION;
    case 'routingBoolVar': return RoutingVariableKind.ROUTING_VARIABLE_BOOLEAN;
    case 'routingResourceVar': return RoutingVariableKind.ROUTING_VARIABLE_RESOURCE;
    default: throw new Error('Unsupported Routing variable kind.');
  }
}

export class RoutingIndexManager {
  private readonly indexToNodeMap: number[] = [];
  private readonly nodeToIndexMap = new Map<number, number>();
  private readonly startIndices: number[] = [];
  private readonly endIndices: number[] = [];
  readonly numLocations: number;
  readonly numVehicles: number;
  private readonly startNodes: number[];
  private readonly endNodes: number[];

  get starts(): number[] { return [...this.startNodes]; }
  get ends(): number[] { return [...this.endNodes]; }

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
    this.numLocations = toIndex(numLocations, 'Routing number of locations', INT32_MAX);
    this.numVehicles = toIndex(numVehicles, 'Routing number of vehicles', INT32_MAX);
    if (Array.isArray(depotOrStarts)) {
      if (!Array.isArray(maybeEnds)) {
        throw new Error('RoutingIndexManager: starts and ends arrays must both be provided.');
      }
      if (depotOrStarts.length !== numVehicles || maybeEnds.length !== numVehicles) {
        throw new Error('RoutingIndexManager: starts and ends arrays must match numVehicles.');
      }
      this.startNodes = depotOrStarts.map((value, index) => toIndex(value, `Routing start[${index}]`, this.numLocations - 1));
      this.endNodes = maybeEnds.map((value, index) => toIndex(value, `Routing end[${index}]`, this.numLocations - 1));
    } else {
      const depot = toIndex(depotOrStarts, 'Routing depot', this.numLocations - 1);
      this.startNodes = Array.from({ length: this.numVehicles }, () => depot);
      this.endNodes = Array.from({ length: this.numVehicles }, () => depot);
    }
    this.createIndexMapping();
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

  private createIndexMapping(): void {
    // Match RoutingIndexManager::Initialize: end-only nodes have no ordinary
    // index, repeated starts follow ordinary nodes, and every end is separate.
    const starts = new Set(this.starts);
    const ends = new Set(this.ends);
    for (let node = 0; node < this.numLocations; node++) {
      if (starts.has(node) || !ends.has(node)) {
        this.nodeToIndexMap.set(node, this.indexToNodeMap.length);
        this.indexToNodeMap.push(node);
      }
    }

    const seenStarts = new Set<number>();
    for (const start of this.starts) {
      if (!seenStarts.has(start)) {
        seenStarts.add(start);
        this.startIndices.push(this.nodeToIndex(start));
      } else {
        this.startIndices.push(this.indexToNodeMap.length);
        this.indexToNodeMap.push(start);
      }
    }
    for (const end of this.ends) {
      this.endIndices.push(this.indexToNodeMap.length);
      this.indexToNodeMap.push(end);
    }
  }
}

export type RoutingPickupToDeliveryLimitFunction = (pickupAlternative: number, deliveryAlternative: number) => IntValue;

type RoutingDimensionState = {
  pickupToDeliveryLimits?: Map<number, RoutingPickupToDeliveryLimitFunction>;
  cumulSoftUpperBounds?: Map<number, BoundCost>;
  cumulSoftLowerBounds?: Map<number, BoundCost>;
  dimensionValues?: Map<string, bigint>;
  softSpanUpperBounds: Map<number, BoundCost>;
  quadraticCostSoftSpanUpperBounds: Map<number, BoundCost>;
};

let createRoutingDimension: (model: RoutingModel, name: string, state: RoutingDimensionState,
  record: (operation: RoutingModelOperation) => void, maximumIndex: number,
  configureBreaks: (intervals: readonly RoutingBreakInterval[], vehicle: number, options: RoutingBreakTravelOptions) => void,
  configurePairLimit: (limit: RoutingPickupToDeliveryLimitFunction, pairIndex: number) => void,
  inspect: (query: RoutingDimensionQuery, options: RoutingDomainOptions, assignment?: RoutingAssignmentSnapshot) => Promise<RoutingDimensionInspection>) => RoutingDimension;

export class RoutingDimension {
  private constructor(
    private readonly model: RoutingModel,
    readonly name: string,
    private readonly state: RoutingDimensionState,
    private readonly record: (operation: RoutingModelOperation) => void,
    private readonly maximumIndex: number,
    private readonly configureBreaks: (intervals: readonly RoutingBreakInterval[], vehicle: number, options: RoutingBreakTravelOptions) => void,
    private readonly configurePairLimit: (limit: RoutingPickupToDeliveryLimitFunction, pairIndex: number) => void,
    private readonly inspect: (query: RoutingDimensionQuery, options: RoutingDomainOptions, assignment?: RoutingAssignmentSnapshot) => Promise<RoutingDimensionInspection>,
  ) {}

  static { createRoutingDimension = (...args) => new RoutingDimension(...args); }

  setPickupToDeliveryLimitFunctionForPair(limit: RoutingPickupToDeliveryLimitFunction, pairIndex: number): void {
    this.configurePairLimit(limit, pairIndex);
  }

  hasPickupToDeliveryLimits(): boolean { return Boolean(this.state.pickupToDeliveryLimits?.size); }

  /** Native limit for an alternative pair; an unset limit is INT64_MAX. */
  async getPickupToDeliveryLimitForPair(pairIndex: number, pickupAlternativeIndex: number, deliveryAlternativeIndex: number,
      options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.query(9, 0, {
      pairIndex: toIndex(pairIndex, 'Routing pickup/delivery pair', INT32_MAX),
      pickupAlternativeIndex: toIndex(pickupAlternativeIndex, 'Routing pickup alternative', INT32_MAX),
      deliveryAlternativeIndex: toIndex(deliveryAlternativeIndex, 'Routing delivery alternative', INT32_MAX),
    }, options)).value!;
  }

  cumulVar(index: number): RoutingCumulVar {
    return dimensionVariable('routingCumulVar', this.model, this.name,
      toIndex(index, 'Routing cumul index', this.maximumIndex),
      (index, lower, upper) => this.record({ type: 'setCumulBounds', dimensionName: this.name, index, lower, upper }));
  }

  /** Bound waiting time at a routing index; end indices have no SlackVar. */
  slackVar(index: number): RoutingSlackVar {
    return dimensionVariable('routingSlackVar', this.model, this.name,
      toIndex(index, 'Routing slack index', this.maximumIndex - this.model.vehicles()),
      (index, lower, upper) => this.record({ type: 'setSlackBounds', dimensionName: this.name, index, lower, upper }));
  }

  /** Native transit includes fixed travel, dependent transit and slack. Ends have no transit variable. */
  transitVar(index: number): RoutingTransitVar {
    return decorateVariable({ kind: 'routingTransitVar', model: this.model, dimensionName: this.name,
      index: toIndex(index, 'Routing transit index', this.maximumIndex - this.model.vehicles()) });
  }

  fixedTransitVar(index: number): RoutingFixedTransitVar {
    return decorateVariable({ kind: 'routingFixedTransitVar', model: this.model, dimensionName: this.name,
      index: toIndex(index, 'Routing fixed transit index', this.maximumIndex - this.model.vehicles()) });
  }

  setCumulVarRange(index: number, lower: IntValue, upper: IntValue): void {
    this.cumulVar(index).setRange(lower, upper);
  }

  setBreakIntervalsOfVehicle(intervals: readonly RoutingBreakInterval[], vehicle: number, options: RoutingBreakTravelOptions = {}): void {
    this.configureBreaks(intervals, vehicle, options);
  }
  setBreakDistanceDurationOfVehicle(distance: IntValue, duration: IntValue, vehicle: number): void {
    const exactDistance = toInt64(distance, 'Routing break distance'), exactDuration = toInt64(duration, 'Routing break duration');
    if (exactDistance < 0n || exactDuration < 0n) throw new RangeError('Routing break distance and duration must be nonnegative.');
    this.record({ type: 'setBreakDistanceDuration', dimensionName: this.name,
      vehicle: toIndex(vehicle, 'Routing break vehicle', this.model.vehicles() - 1), distance: exactDistance, duration: exactDuration });
  }

  inspectBreaks(vehicle: number, options: RoutingDomainOptions = {}): Promise<RoutingBreakConfiguration> { return this.model.inspectBreaks(this.name, vehicle, options); }
  async hasBreakConstraints(options: RoutingDomainOptions = {}): Promise<boolean> { return (await this.inspectBreaks(0, options)).hasBreakConstraints; }
  private async initializedBreaks(vehicle: number, options: RoutingDomainOptions) {
    const data = await this.inspectBreaks(vehicle, options);
    if (!data.hasBreakConstraints) throw new Error('Routing break constraints are not initialized.');
    return data;
  }
  async getBreakIntervalsOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<RoutingBreakInterval[]> { return (await this.initializedBreaks(vehicle, options)).intervals; }
  async getBreakDistanceDurationOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<Array<{ distance: bigint; duration: bigint }>> { return (await this.initializedBreaks(vehicle, options)).distanceDuration; }
  async getPreTravelEvaluatorOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<number> { return (await this.initializedBreaks(vehicle, options)).preTravelEvaluator!; }
  async getPostTravelEvaluatorOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<number> { return (await this.initializedBreaks(vehicle, options)).postTravelEvaluator!; }

  setSpanUpperBoundForVehicle(value: IntValue, vehicle: number): void {
    this.setDimensionValue('spanUpperBound', value, vehicle);
  }

  setSpanCostCoefficientForVehicle(value: IntValue, vehicle: number): void {
    this.setDimensionValue('spanCost', value, vehicle);
  }

  setSpanCostCoefficientForAllVehicles(value: IntValue): void {
    this.setDimensionValueForAllVehicles('spanCost', value);
  }

  setSlackCostCoefficientForVehicle(value: IntValue, vehicle: number): void {
    this.setDimensionValue('slackCost', value, vehicle);
  }

  setSlackCostCoefficientForAllVehicles(value: IntValue): void {
    this.setDimensionValueForAllVehicles('slackCost', value);
  }

  setGlobalSpanCostCoefficient(value: IntValue): void {
    this.setDimensionValue('globalSpanCost', value);
  }

  private setDimensionValue(setting: RoutingDimensionSetting, value: IntValue, vehicle?: number): void {
    const exact = toInt64(value, 'Routing dimension value');
    if (exact < 0n) throw new RangeError('Routing dimension value must be nonnegative.');
    const vehicleIndex = setting === 'globalSpanCost' ? undefined : toIndex(vehicle as number, 'Routing vehicle', this.model.vehicles() - 1);
    this.record({ type: 'setDimensionValue', dimensionName: this.name, setting, value: exact, vehicle: vehicleIndex });
    (this.state.dimensionValues ??= new Map()).set(`${setting}:${vehicleIndex ?? ''}`, exact);
  }

  private setDimensionValueForAllVehicles(setting: RoutingDimensionSetting, value: IntValue): void {
    const exact = toInt64(value, 'Routing dimension value');
    if (exact < 0n) throw new RangeError('Routing dimension value must be nonnegative.');
    for (let vehicle = 0; vehicle < this.model.vehicles(); ++vehicle) this.setDimensionValue(setting, exact, vehicle);
  }

  getSpanUpperBoundForVehicle(vehicle: number): bigint {
    return this.dimensionValue('spanUpperBound', vehicle, INT64_MAX);
  }

  getSpanCostCoefficientForVehicle(vehicle: number): bigint {
    return this.dimensionValue('spanCost', vehicle, 0n);
  }

  getSlackCostCoefficientForVehicle(vehicle: number): bigint {
    return this.dimensionValue('slackCost', vehicle, 0n);
  }

  globalSpanCostCoefficient(): bigint {
    return this.dimensionValue('globalSpanCost', undefined, 0n);
  }

  private dimensionValue(setting: RoutingDimensionSetting, vehicle: number | undefined, fallback: bigint): bigint {
    const index = setting === 'globalSpanCost' ? undefined : toIndex(vehicle as number, 'Routing vehicle', this.model.vehicles() - 1);
    return this.state.dimensionValues?.get(`${setting}:${index ?? ''}`) ?? fallback;
  }

  setCumulVarPiecewiseLinearCost(index: number, segments: readonly RoutingPiecewiseLinearCostSegment[]): void {
    if (segments.length === 0) throw new RangeError('Routing piecewise cost requires at least one segment.');
    this.record({ type: 'setPiecewiseCost', dimensionName: this.name,
      index: BigInt(toIndex(index, 'Routing piecewise cumul index', this.maximumIndex)),
      segments: segments.map(segment => ({ pointX: toInt64(segment.pointX), pointY: toInt64(segment.pointY),
        slope: toInt64(segment.slope), otherPointX: toInt64(segment.otherPointX) })) });
  }
  async hasCumulVarPiecewiseLinearCost(index: number, options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.query(6, index, {}, options)).hasPiecewiseLinearCost;
  }
  async getCumulVarPiecewiseLinearCost(index: number, options: RoutingDomainOptions = {}): Promise<RoutingPiecewiseLinearCostSegment<bigint>[] | null> {
    const result = await this.query(6, index, {}, options);
    return result.hasPiecewiseLinearCost ? result.costSegments : null;
  }
  async getTransitValue(fromIndex: number, toIndexValue: number, vehicle: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.query(0, fromIndex, { otherIndex: BigInt(toIndex(toIndexValue, 'Routing transit destination', this.maximumIndex)),
      vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1) }, options)).value!;
  }
  async getTransitValueFromClass(fromIndex: number, toIndexValue: number, vehicleClass: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.query(1, fromIndex, { otherIndex: BigInt(toIndex(toIndexValue, 'Routing transit destination', this.maximumIndex)),
      vehicleOrClass: toIndex(vehicleClass, 'Routing dimension vehicle class', INT32_MAX) }, options)).value!;
  }
  async vehicleToClass(vehicle: number, options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.query(7, 0, { vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1) }, options)).value!);
  }
  async isUnary(options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.query(8, 0, {}, options)).value === 1n;
  }
  /** Native sign metadata; does not evaluate every arc. */
  async areVehicleTransitsPositive(vehicle: number, options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.query(11, 0, { vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1) }, options)).value === 1n;
  }
  async getTransitEvaluatorSign(vehicle: number, options: RoutingDomainOptions = {}): Promise<RoutingTransitEvaluatorSign> {
    return Number((await this.query(12, 0, { vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1) }, options)).value!);
  }
  /** Query a self-dependent dimension in the supplied assignment's restored native state.
   * The current cumul and route variables must be bound; no completion is performed.
   */
  async shortestTransitionSlack(assignment: Assignment, index: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    const snapshot = snapshotForAssignment(assignment, this.model);
    return (await this.inspect({ dimensionName: this.name, kind: 13,
      index: BigInt(toIndex(index, 'Routing slack index', this.maximumIndex - this.model.vehicles())),
      otherIndex: 0n, vehicleOrClass: 0, lower: 0n, upper: 0n }, options, snapshot)).value!;
  }
  async getNodePrecedences(options: RoutingDomainOptions = {}): Promise<RoutingNodePrecedence[]> {
    return (await this.query(10, 0, {}, options)).nodePrecedences.map(({ first, second, offset, performedConstraint }) =>
      ({ first: Number(first), second: Number(second), offset, performedConstraint }));
  }
  addForbiddenIntervals(index: number, intervals: readonly { start: IntValue; end: IntValue }[]): void {
    const values = intervals.map(interval => {
      const start = toInt64(interval.start), end = toInt64(interval.end);
      if (start > end) throw new RangeError('Routing forbidden interval start exceeds end.');
      return { start, end };
    });
    this.record({ type: 'addForbiddenIntervals', dimensionName: this.name,
      index: BigInt(toIndex(index, 'Routing cumul index', this.maximumIndex)), intervals: values });
  }
  async getAllowedIntervalsInRange(index: number, lower: IntValue, upper: IntValue, options: RoutingDomainOptions = {}): Promise<RoutingIntervalRange[]> {
    return (await this.query(2, index, { lower: toInt64(lower), upper: toInt64(upper) }, options)).intervals;
  }
  async getForbiddenIntervals(index: number, options: RoutingDomainOptions = {}): Promise<RoutingIntervalRange[]> {
    return (await this.query(3, index, {}, options)).intervals;
  }
  async getFirstPossibleGreaterOrEqualValueForNode(index: number, value: IntValue, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.query(4, index, { lower: toInt64(value) }, options)).value!;
  }
  async getLastPossibleLessOrEqualValueForNode(index: number, value: IntValue, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.query(5, index, { upper: toInt64(value) }, options)).value!;
  }
  private query(kind: RoutingDimensionQuery['kind'], index: number, values: Partial<RoutingDimensionQuery>, options: RoutingDomainOptions) {
    return this.inspect({ dimensionName: this.name, kind, otherIndex: 0n, vehicleOrClass: 0,
      lower: 0n, upper: 0n, ...values, index: BigInt(toIndex(index, 'Routing dimension index', this.maximumIndex)) }, options);
  }

  setCumulVarSoftUpperBound(index: number, bound: IntValue, coefficient: IntValue): void {
    this.setCumulSoftBound(index, bound, coefficient, false);
  }

  setCumulVarSoftLowerBound(index: number, bound: IntValue, coefficient: IntValue): void {
    this.setCumulSoftBound(index, bound, coefficient, true);
  }

  hasCumulVarSoftUpperBound(index: number): boolean { return this.cumulSoftBound(index, false) !== undefined; }
  hasCumulVarSoftLowerBound(index: number): boolean { return this.cumulSoftBound(index, true) !== undefined; }
  getCumulVarSoftUpperBound(index: number, options: RoutingDomainOptions = {}): Promise<bigint> { return this.model.inspectCumulSoftBound(this.name, index, false, options); }
  getCumulVarSoftLowerBound(index: number, options: RoutingDomainOptions = {}): Promise<bigint> { return this.model.inspectCumulSoftBound(this.name, index, true, options); }
  getCumulVarSoftUpperBoundCoefficient(index: number): bigint { return this.cumulSoftBound(index, false)?.cost ?? 0n; }
  getCumulVarSoftLowerBoundCoefficient(index: number): bigint { return this.cumulSoftBound(index, true)?.cost ?? 0n; }

  private cumulSoftBound(index: number, lower: boolean): BoundCost | undefined {
    const routingIndex = toIndex(index, 'Routing soft cumul index', this.maximumIndex);
    return (lower ? this.state.cumulSoftLowerBounds : this.state.cumulSoftUpperBounds)?.get(routingIndex);
  }

  private setCumulSoftBound(index: number, bound: IntValue, coefficient: IntValue, lower: boolean): void {
    const routingIndex = toIndex(index, 'Routing soft cumul index', this.maximumIndex);
    const value = this.validatedBoundCost(bound, coefficient);
    this.record({ type: 'setCumulSoftBound', dimensionName: this.name, index: routingIndex, bound: value.bound, coefficient: value.cost, lower });
    const bounds = lower ? (this.state.cumulSoftLowerBounds ??= new Map()) : (this.state.cumulSoftUpperBounds ??= new Map());
    bounds.set(routingIndex, value);
  }

  private validatedBoundCost(bound: IntValue, coefficient: IntValue): BoundCost {
    const value = new BoundCost(bound, coefficient);
    if (value.cost < 0n) throw new RangeError('Routing soft bound coefficient must be nonnegative.');
    return value;
  }

  /** Require the second routing index's cumul to be at least first + offset. */
  addNodePrecedence(first: number, second: number, offset: IntValue,
    performedConstraint = RoutingPrecedencePerformedConstraint.FIRST_AND_SECOND_INDEPENDENT): void {
    if (this.model.isEnd(first) || this.model.isEnd(second)) throw new RangeError('Routing node precedences cannot reference end indices.');
    this.record({ type: 'addNodePrecedence', dimensionName: this.name,
      first: toIndex(first, 'Routing precedence first index', this.maximumIndex),
      second: toIndex(second, 'Routing precedence second index', this.maximumIndex), offset: toInt64(offset),
      performedConstraint: toIndex(performedConstraint, 'Routing precedence performed constraint', 3) });
  }

  hasSoftSpanUpperBounds(): boolean {
    return this.state.softSpanUpperBounds.size > 0;
  }

  setSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    const vehicleIndex = toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1);
    const value = this.validatedBoundCost(boundCost.bound, boundCost.cost);
    this.record({ type: 'setSoftSpanUpperBound', dimensionName: this.name, bound: value.bound, cost: value.cost, vehicle: vehicleIndex });
    this.state.softSpanUpperBounds.set(vehicleIndex, value);
  }

  getSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    const value = this.state.softSpanUpperBounds.get(toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1));
    if (!this.hasSoftSpanUpperBounds()) throw new Error('No soft span upper bounds have been configured.');
    return value ? new BoundCost(value.bound, value.cost) : new BoundCost(INT64_MAX, 0);
  }

  hasQuadraticCostSoftSpanUpperBounds(): boolean {
    return this.state.quadraticCostSoftSpanUpperBounds.size > 0;
  }

  setQuadraticCostSoftSpanUpperBoundForVehicle(boundCost: BoundCost, vehicle: number): void {
    const vehicleIndex = toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1);
    const value = this.validatedBoundCost(boundCost.bound, boundCost.cost);
    this.record({ type: 'setQuadraticCostSoftSpanUpperBound', dimensionName: this.name, bound: value.bound, cost: value.cost, vehicle: vehicleIndex });
    this.state.quadraticCostSoftSpanUpperBounds.set(vehicleIndex, value);
  }

  getQuadraticCostSoftSpanUpperBoundForVehicle(vehicle: number): BoundCost {
    const value = this.state.quadraticCostSoftSpanUpperBounds.get(toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1));
    if (!this.hasQuadraticCostSoftSpanUpperBounds()) throw new Error('No quadratic soft span upper bounds have been configured.');
    return value ? new BoundCost(value.bound, value.cost) : new BoundCost(INT64_MAX, 0);
  }
}

const seedStates = new WeakMap<RoutingAssignmentSeed, { routing: RoutingModel; snapshot: RoutingAssignmentSnapshot }>();
let createAssignmentSeed: (model: RoutingModel, snapshot: RoutingAssignmentSnapshot) => RoutingAssignmentSeed;

/** An owned partial route assignment for warm starts; contains no solved schedule or objective value. */
export class RoutingAssignmentSeed {
  private readonly values: Map<string, RoutingAssignmentVariable>;
  private constructor(private readonly routing: RoutingModel, snapshot: RoutingAssignmentSnapshot) {
    const owned = structuredClone(snapshot);
    seedStates.set(this, { routing, snapshot: owned });
    this.values = new Map(owned.variables.map(value => [routingVariableKey(value.variable), value]));
  }
  static { createAssignmentSeed = (model, snapshot) => new RoutingAssignmentSeed(model, snapshot); }

  value(variable: number | RoutingNextVar | RoutingVehicleVar): number {
    let kind = RoutingVariableKind.ROUTING_VARIABLE_NEXT;
    let index: number;
    if (typeof variable === 'number') index = toIndex(variable, 'Routing seed successor index');
    else {
      if (variable.model !== this.routing) throw new Error('Variable belongs to a different Routing model.');
      if (variable.kind !== 'routingNextVar' && variable.kind !== 'routingVehicleVar')
        throw new TypeError('Routing seeds contain only successor and vehicle variables.');
      if (variable.kind === 'routingVehicleVar') kind = RoutingVariableKind.ROUTING_VARIABLE_VEHICLE;
      index = variable.index;
    }
    const value = this.values.get(routingVariableKey({ kind, index, dimensionName: '' }));
    if (!value || value.min !== value.max) throw new RangeError('Routing seed has no bound value for this variable.');
    return Number(value.min);
  }
}

const assignmentStates = new WeakMap<Assignment, { routing: RoutingModel; result: RoutingSolveResult }>();
type RoutingSolveDiagnostics = { localSearchProfile: string | null; automaticFirstSolutionStrategy: FirstSolutionStrategy | null };
let createAssignment: (model: RoutingModel, result: RoutingSolveResult, diagnostics?: RoutingSolveDiagnostics) => Assignment;

/** An owned snapshot from a native solve or route restoration. */
export class Assignment {
  private readonly result: RoutingSolveResult;
  private readonly capturedVariables: Map<string, RoutingAssignmentVariable>;

  readonly localSearchProfile: string | null;
  readonly automaticFirstSolutionStrategy: FirstSolutionStrategy | null;

  private constructor(private readonly routing: RoutingModel, result: RoutingSolveResult, diagnostics?: RoutingSolveDiagnostics) {
    if (!result) throw new TypeError('Assignments require a native solution; use RoutingModel.solve() or readAssignmentFromRoutes().');
    this.localSearchProfile = diagnostics?.localSearchProfile ?? null;
    this.automaticFirstSolutionStrategy = diagnostics?.automaticFirstSolutionStrategy ?? null;
    const snapshot = structuredClone(result);
    this.result = snapshot;
    this.capturedVariables = new Map((snapshot.assignmentVariables ?? []).map(value => [routingVariableKey(value.variable), value]));
    assignmentStates.set(this, { routing, result: snapshot });
  }

  static { createAssignment = (model, result, diagnostics) => new Assignment(model, result, diagnostics); }

  breakInterval(interval: RoutingBreakInterval): RoutingBreakSnapshot {
    if (!breakIntervalRecords.has(interval) || interval.model !== this.routing) throw new Error('Break interval belongs to a different Routing model.');
    const value = this.result.breakAssignments?.find(value => value.index === interval.index);
    if (!value) throw new RangeError('Assignment has no value for this break interval.');
    return { performed: value.performedMin === value.performedMax ? value.performedMin === 1n : null,
      ...(value.performedMax === 0n ? {} : { startMin: value.startMin, startMax: value.startMax, endMin: value.endMin, endMax: value.endMax }) };
  }


  resourceIndex(vehicle: number, group: number | RoutingResourceGroup): number {
    const index = typeof group === 'number' ? group : group.index;
    if (typeof group !== 'number' && this.routing.getResourceGroup(index) !== group) throw new Error('Routing resource group belongs to another model.');
    const data = this.result?.resourceAssignments?.[toIndex(index, 'Routing resource group')];
    if (!data) throw new Error('Routing assignment has no resource data for this group.');
    vehicle = toIndex(vehicle, 'Routing vehicle', data.mins.length - 1);
    if (data.mins[vehicle] !== data.maxs[vehicle]) throw new Error('Routing resource assignment is not bound.');
    return Number(data.mins[vehicle]);
  }

  objectiveValue(): bigint {
    return this.result.objectiveValue;
  }

  value(indexOrVar: number | RoutingVehicleVar | RoutingActiveVar | RoutingNextVar | RoutingActiveVehicleVar | RoutingVehicleRouteConsideredVar | RoutingResourceVar | RoutingBoolVar): number;
  value(indexOrVar: RoutingCumulVar | RoutingSlackVar | RoutingTransitVar | RoutingFixedTransitVar | RoutingExpressionVar): bigint;
  value(indexOrVar: number | RoutingIntVar): number | bigint {
    if (typeof indexOrVar === 'object') {
      if (indexOrVar.model !== this.routing) throw new Error('Variable belongs to a different Routing model.');
      if (indexOrVar.kind === 'routingNextVar') {
        const value = this.result.nextValues[indexOrVar.index];
        if (value === undefined) throw new RangeError('Assignment has no successor value for this index.');
        return value;
      }
      if (indexOrVar.kind === 'routingVehicleVar') {
        const value = this.result.vehicleValues?.[indexOrVar.index];
        if (value === undefined) throw new RangeError('Assignment has no vehicle value for this index.');
        return value;
      }
      if (indexOrVar.kind === 'routingActiveVar') {
        const next = this.result.nextValues[indexOrVar.index];
        if (next === undefined) throw new RangeError('Assignment has no active value for this index.');
        return Number(next !== indexOrVar.index);
      }
      if (indexOrVar.kind !== 'routingCumulVar') {
        const value = this.capturedBound(indexOrVar, 'min');
        if ((indexOrVar.kind === 'routingBoolVar' || indexOrVar.kind === 'routingExpressionVar') && value !== this.capturedBound(indexOrVar, 'max')) throw new Error('Routing expression assignment is not bound.');
        return value;
      }
      const value = this.result.dimensionCumulValues[indexOrVar.dimensionName]?.[indexOrVar.index];
      if (value === undefined) throw new RangeError('Assignment has no value for this dimension index.');
      return value;
    }
    const value = this.result.nextValues[indexOrVar];
    if (value === undefined) throw new RangeError('Assignment has no value for this index.');
    return value;
  }

  min(indexOrVar: number | RoutingVehicleVar | RoutingActiveVar | RoutingNextVar | RoutingActiveVehicleVar | RoutingVehicleRouteConsideredVar | RoutingResourceVar | RoutingBoolVar): number;
  min(indexOrVar: RoutingCumulVar | RoutingSlackVar | RoutingTransitVar | RoutingFixedTransitVar | RoutingExpressionVar): bigint;
  min(indexOrVar: number | RoutingIntVar): number | bigint {
    if (typeof indexOrVar === 'object' && (indexOrVar.kind === 'routingSlackVar' || indexOrVar.kind === 'routingTransitVar'
      || indexOrVar.kind === 'routingFixedTransitVar' || indexOrVar.kind === 'routingActiveVehicleVar' || indexOrVar.kind === 'routingVehicleRouteConsideredVar' || indexOrVar.kind === 'routingResourceVar' || indexOrVar.kind === 'routingBoolVar' || indexOrVar.kind === 'routingExpressionVar')) return this.capturedBound(indexOrVar, 'min');
    return typeof indexOrVar === 'object' && indexOrVar.kind === 'routingCumulVar'
      ? this.cumulBound(indexOrVar, 'min') : this.value(indexOrVar);
  }

  max(indexOrVar: number | RoutingVehicleVar | RoutingActiveVar | RoutingNextVar | RoutingActiveVehicleVar | RoutingVehicleRouteConsideredVar | RoutingResourceVar | RoutingBoolVar): number;
  max(indexOrVar: RoutingCumulVar | RoutingSlackVar | RoutingTransitVar | RoutingFixedTransitVar | RoutingExpressionVar): bigint;
  max(indexOrVar: number | RoutingIntVar): number | bigint {
    if (typeof indexOrVar === 'object' && (indexOrVar.kind === 'routingSlackVar' || indexOrVar.kind === 'routingTransitVar'
      || indexOrVar.kind === 'routingFixedTransitVar' || indexOrVar.kind === 'routingActiveVehicleVar' || indexOrVar.kind === 'routingVehicleRouteConsideredVar' || indexOrVar.kind === 'routingResourceVar' || indexOrVar.kind === 'routingBoolVar' || indexOrVar.kind === 'routingExpressionVar')) return this.capturedBound(indexOrVar, 'max');
    return typeof indexOrVar === 'object' && indexOrVar.kind === 'routingCumulVar'
      ? this.cumulBound(indexOrVar, 'max') : this.value(indexOrVar);
  }

  private capturedBound(variable: CapturedRoutingVariable, bound: 'min' | 'max'): number | bigint {
    if (variable.model !== this.routing) throw new Error('Variable belongs to a different Routing model.');
    if (variable.kind === 'routingResourceVar') {
      const data = this.result?.resourceAssignments?.[variable.resourceGroup];
      const value = data?.[bound === 'min' ? 'mins' : 'maxs'][variable.index];
      if (value === undefined) throw new RangeError('Assignment has no captured native bounds for this resource variable.');
      return Number(value);
    }
    const reference = { kind: routingVariableKind(variable.kind), dimensionName: 'dimensionName' in variable ? variable.dimensionName : '', index: variable.index };
    const value = this.capturedVariables.get(routingVariableKey(reference));
    if (!value) throw new RangeError('Assignment has no captured native bounds for this variable.');
    return variable.kind === 'routingActiveVehicleVar' || variable.kind === 'routingVehicleRouteConsideredVar' || variable.kind === 'routingBoolVar'
      ? Number(value[bound]) : value[bound];
  }

  private cumulBound(variable: RoutingCumulVar, bound: 'min' | 'max'): bigint {
    if (variable.model !== this.routing) throw new Error('Variable belongs to a different Routing model.');
    const bounds = bound === 'min' ? this.result?.dimensionCumulMins : this.result?.dimensionCumulMaxs;
    const value = bounds?.[variable.dimensionName]?.[variable.index];
    if (bound === 'max' && value === undefined) throw new RangeError('Assignment has no maximum for this dimension index.');
    return value ?? this.value(variable);
  }
}

export type { RoutingSearchStatistics } from './protocol.js';
export type RoutingPackingResult = { assignment: Assignment | null; timeLimitReached: boolean };

/** Native solve status, owned assignments and native search metadata. */
export class RoutingResult {
  readonly hasSolution: boolean;

  constructor(
    readonly status: RoutingSearchStatus,
    readonly assignment: Assignment | null,
    readonly localSearchProfile: string | null = null,
    readonly automaticFirstSolutionStrategy: FirstSolutionStrategy | null = null,
    readonly collectedAssignments: readonly Assignment[] = [],
    readonly searchStatistics: RoutingSearchStatistics | null = null,
    readonly objectiveLowerBound: bigint | null = null,
    readonly timeLimitReached: boolean | null = null,
  ) {
    this.hasSolution = assignment !== null;
  }
}


function snapshotForAssignment(
  assignment: Assignment | RoutingAssignmentSeed,
  routing: RoutingModel,
  allowSeed = false,
): RoutingAssignmentSnapshot {
  if (assignment instanceof RoutingAssignmentSeed) {
    if (!allowSeed) throw new TypeError('This Routing operation requires a restored assignment, not a route seed.');
    const state = seedStates.get(assignment);
    if (!state || state.routing !== routing) throw new Error('Routing seed belongs to another model or is not registered.');
    return structuredClone(state.snapshot);
  }
  const state = assignmentStates.get(assignment);
  if (!state || state.routing !== routing) {
    throw new Error('Routing assignment belongs to another model or is not registered.');
  }
  const result = state.result;
  const variables = [...(result.assignmentVariables ?? [])];
  const add = (kind: RoutingVariableKind, index: number, min: bigint, max = min, dimensionName = '', resourceGroup?: number) =>
    variables.push({ variable: { kind, index, dimensionName, ...(resourceGroup === undefined ? {} : { resourceGroup }) }, min, max });
  for (let index = 0; index < result.nextValues.length - routing.vehicles(); ++index) add(RoutingVariableKind.ROUTING_VARIABLE_NEXT, index, BigInt(result.nextValues[index]));
  result.vehicleValues?.forEach((value, index) => add(RoutingVariableKind.ROUTING_VARIABLE_VEHICLE, index, BigInt(value)));
  for (const [name, values] of Object.entries(result.dimensionCumulValues)) {
    values.forEach((value, index) => add(RoutingVariableKind.ROUTING_VARIABLE_CUMUL, index,
      result.dimensionCumulMins?.[name]?.[index] ?? value, result.dimensionCumulMaxs?.[name]?.[index] ?? value, name));
  }
  result.resourceAssignments?.forEach((group, resourceGroup) => group.mins.forEach((min, vehicle) =>
    add(RoutingVariableKind.ROUTING_VARIABLE_RESOURCE, vehicle, min, group.maxs[vehicle], '', resourceGroup)));
  return structuredClone({ variables, intervals: result.breakAssignments ?? [], objectiveValue: result.objectiveValue });
}

export type RoutingPreAssignment = { nextValues: ReadonlyMap<number, number> };
type RoutingInitialAssignment = RoutingSolveRequest['initialAssignment'];
type PreparedRoutingExecution = {
  readonly request: RoutingSolveRequest;
  readonly resources: SolverResourceRequest | undefined;
  readonly callbacks: readonly RoutingRouteEvaluator[];
};

export type RoutingResourceAttributes = {
  startDomain?: ReadonlyArray<readonly [IntValue, IntValue]>;
  endDomain?: ReadonlyArray<readonly [IntValue, IntValue]>;
};

function resourceDomain(intervals: ReadonlyArray<readonly [IntValue, IntValue]> | undefined): bigint[] {
  return (intervals ?? [[INT64_MIN, INT64_MAX]]).flatMap(interval => {
    if (interval.length !== 2) throw new TypeError('Routing resource domains require pairs of bounds.');
    const lower = toInt64(interval[0]), upper = toInt64(interval[1]);
    if (lower > upper) throw new RangeError('Routing resource domain lower bound exceeds its upper bound.');
    return [lower, upper];
  });
}

export type RoutingResourceDimensionAttributes = {
  dimensionName: string;
  startDomain: Array<[bigint, bigint]>;
  endDomain: Array<[bigint, bigint]>;
};
export type RoutingResourceSnapshot = { classIndex: number; dimensionAttributes: RoutingResourceDimensionAttributes[] };
export type RoutingResourceClassSnapshot = { resourceIndices: number[]; dimensionAttributes: RoutingResourceDimensionAttributes[] };
export type RoutingResourceGroupInspection = {
  affectedDimensions: string[];
  resources: RoutingResourceSnapshot[];
  classes: RoutingResourceClassSnapshot[];
};
function resourceDimensionAttributes(data: RoutingResourceData): RoutingResourceDimensionAttributes {
  const intervals = (bounds: bigint[]): Array<[bigint, bigint]> => {
    if (bounds.length % 2) throw new Error('Native Routing resource domain has an incomplete interval.');
    const result: Array<[bigint, bigint]> = [];
    for (let index = 0; index < bounds.length; index += 2) result.push([bounds[index], bounds[index + 1]]);
    return result;
  };
  return { dimensionName: data.dimensionName, startDomain: intervals(data.startDomain), endDomain: intervals(data.endDomain) };
}

const resourceGroupSnapshots = new WeakMap<RoutingResourceGroup, () => RoutingResourceGroupData>();
let createResourceGroup: (model: RoutingModel, index: number) => RoutingResourceGroup;

export class RoutingResourceGroup {
  private readonly data: RoutingResourceGroupData = { resources: [], requiredVehicles: [], allowedResources: [] };
  private constructor(private readonly model: RoutingModel, readonly index: number) {
    Object.defineProperty(this, 'index', { writable: false });
    resourceGroupSnapshots.set(this, () => structuredClone(this.data));
  }
  static { createResourceGroup = (model, index) => new RoutingResourceGroup(model, index); }

  addResource(attributes: RoutingResourceAttributes, dimensionName: string): number {
    if (!this.model.hasDimension(dimensionName)) throw new RangeError('Routing resource dimension does not exist.');
    const resource = { dimensionName, startDomain: resourceDomain(attributes.startDomain), endDomain: resourceDomain(attributes.endDomain) };
    this.data.resources.push(resource);
    return this.data.resources.length - 1;
  }
  size(): number { return this.data.resources.length; }
  notifyVehicleRequiresAResource(vehicle: number): void {
    vehicle = this.vehicle(vehicle);
    if (!this.data.requiredVehicles.includes(vehicle)) this.data.requiredVehicles.push(vehicle);
  }
  vehicleRequiresAResource(vehicle: number): boolean { return this.data.requiredVehicles.includes(this.vehicle(vehicle)); }
  getVehiclesRequiringAResource(): number[] { return [...this.data.requiredVehicles]; }
  setAllowedResourcesForVehicle(vehicle: number, resources: readonly number[]): void {
    vehicle = this.vehicle(vehicle);
    if (!this.vehicleRequiresAResource(vehicle)) throw new Error('Vehicle must require a resource before restricting its resources.');
    if (!resources.length) throw new RangeError('Use clearAllowedResourcesForVehicle to allow all resources.');
    const values = [...new Set(resources.map(resource => toIndex(resource, 'Routing resource', this.size() - 1)))];
    this.clearAllowedResourcesForVehicle(vehicle);
    this.data.allowedResources.push({ vehicle, resources: values });
  }
  clearAllowedResourcesForVehicle(vehicle: number): void {
    vehicle = this.vehicle(vehicle);
    this.data.allowedResources = this.data.allowedResources.filter(value => value.vehicle !== vehicle);
  }
  getResourcesMarkedAllowedForVehicle(vehicle: number): number[] {
    vehicle = this.vehicle(vehicle);
    return [...(this.data.allowedResources.find(value => value.vehicle === vehicle)?.resources ?? [])];
  }
  isResourceAllowedForVehicle(resource: number, vehicle: number): boolean {
    resource = toIndex(resource, 'Routing resource', this.size() - 1);
    const allowed = this.getResourcesMarkedAllowedForVehicle(vehicle);
    return allowed.length === 0 || allowed.includes(resource);
  }
  inspect(options: RoutingDomainOptions = {}): Promise<RoutingResourceGroupInspection> {
    return this.model.inspectResourceGroup(this, options);
  }
  async getResources(options: RoutingDomainOptions = {}): Promise<RoutingResourceSnapshot[]> { return (await this.inspect(options)).resources; }
  async getResource(resource: number, options: RoutingDomainOptions = {}): Promise<RoutingResourceSnapshot> {
    resource = toIndex(resource, 'Routing resource', this.size() - 1);
    return (await this.inspect(options)).resources[resource];
  }
  async getResourceClassesCount(options: RoutingDomainOptions = {}): Promise<number> { return (await this.inspect(options)).classes.length; }
  async getResourceIndicesInClass(resourceClass: number, options: RoutingDomainOptions = {}): Promise<number[]> {
    resourceClass = toIndex(resourceClass, 'Routing resource class');
    const classes = (await this.inspect(options)).classes;
    return classes[toIndex(resourceClass, 'Routing resource class', classes.length - 1)].resourceIndices;
  }
  async getResourceIndicesPerClass(options: RoutingDomainOptions = {}): Promise<number[][]> {
    return (await this.inspect(options)).classes.map(resourceClass => resourceClass.resourceIndices);
  }
  async getResourceClassIndex(resource: number, options: RoutingDomainOptions = {}): Promise<number> {
    return (await this.getResource(resource, options)).classIndex;
  }
  async getDimensionAttributesForClass(dimensionName: string, resourceClass: number, options: RoutingDomainOptions = {}): Promise<RoutingResourceDimensionAttributes> {
    this.model.getDimensionOrDie(dimensionName);
    resourceClass = toIndex(resourceClass, 'Routing resource class');
    const classes = (await this.inspect(options)).classes;
    const attributes = classes[toIndex(resourceClass, 'Routing resource class', classes.length - 1)].dimensionAttributes.find(value => value.dimensionName === dimensionName);
    if (!attributes) throw new Error('Native Routing resource inspection has no attributes for this dimension.');
    return attributes;
  }
  private vehicle(vehicle: number): number { return toIndex(vehicle, 'Routing vehicle', this.model.vehicles() - 1); }
}

export class RoutingModel {
  private secondaryModel: { model: RoutingModel; parameters: RoutingSearchParameters } | undefined;
  private routeLocks: RoutingSolveRequest['routeLocks'];
  private firstSolutionHint: Assignment | null = null;
  private readonly routeEvaluators: RoutingRouteEvaluator[] = [];
  private firstSolutionEvaluatorIndex: number | undefined;
  private primaryConstrainedDimension = '';
  private solving = false;
  private arcCostEvaluatorIndex: number | null = null;
  private readonly vehicleArcCostEvaluators = new Map<number, number>();
  private readonly evaluatorCallbacks = new Map<number, RoutingTransitCallback>();
  private nextEvaluatorIndex = 1;
  private readonly operations: RoutingModelOperation[] = [];
  private booleanVariablesCount = 0;
  private integerVariablesCount = 0;
  private readonly resourceGroups: RoutingResourceGroup[] = [];
  private maximumActiveVehicles: number | undefined;
  private readonly fixedVehicleCosts = new Map<number, bigint>();
  private readonly amortizedVehicleCosts = new Map<number, { linear: bigint; quadratic: bigint }>();
  private readonly vehiclesUsedWhenEmpty = new Map<number, boolean>();
  private readonly softSameVehicleConstraints: Array<{ indices: number[]; cost: bigint }> = [];
  private readonly visitTypes = new Map<number, { type: number; policy: VisitTypePolicy }>();
  private numberOfVisitTypes = 0;
  private readonly hardTypeIncompatibilities = new Map<number, Set<number>>();
  private readonly temporalTypeIncompatibilities = new Map<number, Set<number>>();
  private readonly typeRequirements: Map<number, number[][]>[] = [new Map(), new Map(), new Map()];
  private readonly pickupDeliveryPolicies = new Map<number, PickupAndDeliveryPolicy>();
  private readonly pickupDeliveryPairs: Array<{ pickups: number; deliveries: number }> = [];
  private readonly disjunctions: Array<{ penalty: bigint; penaltyCostBehavior: PenaltyCostBehavior; size: number }> = [];
  private readonly indexDisjunctions = new Map<number, number[]>();
  private readonly dimensions = new Map<string, RoutingDimensionState>();
  private readonly breakIntervals: RoutingBreakIntervalData[] = [];
  private readonly unaryEvaluators = new Set<number>();
  private readonly stateDependentEvaluators = new Map<number, {
    callback: (fromIndex: number, toIndex: number) => RoutingPiecewiseLinearFunction;
    domainStart: bigint; domainEnd: bigint;
  }>();
  private readonly enterSearchCallbacks: RoutingSearchEntryCallback[] = [];
  private readonly atSolutionCallbacks: Array<{ callback: RoutingSolutionCallback; trackUncheckedNeighbors: boolean }> = [];
  private lastStatus: RoutingSearchStatus | null = null;
  constructor(private readonly manager: RoutingIndexManager, private readonly parameters?: RoutingModelParameters) {
    this.parameters = parameters && structuredClone(parameters);
  }


  addResourceGroup(): RoutingResourceGroup {
    const group = createResourceGroup(this, this.resourceGroups.length);
    this.resourceGroups.push(group); return group;
  }

  addBreakInterval(options: RoutingBreakIntervalOptions): RoutingBreakInterval {
    const startMin = toInt64(options.startMin, 'Routing break start minimum'), startMax = toInt64(options.startMax, 'Routing break start maximum');
    const duration = toInt64(options.duration, 'Routing break duration');
    if (startMin > startMax || duration < 0n || startMax > INT64_MAX - duration) throw new RangeError('Invalid Routing break start range or duration.');
    const data: RoutingBreakIntervalData = { index: this.breakIntervals.length, startMin, startMax, duration,
      optional: options.optional ?? false, name: options.name ?? '' };
    this.breakIntervals.push(data); this.operations.push({ type: 'addBreakInterval', ...data });
    return createBreakInterval(this, data);
  }
  private setDimensionBreakIntervals(dimensionName: string, intervals: readonly RoutingBreakInterval[], vehicle: number, options: RoutingBreakTravelOptions): void {
    this.getDimensionOrDie(dimensionName);
    const indices = intervals.map(interval => {
      const data = breakIntervalRecords.get(interval);
      if (!data || interval.model !== this || this.breakIntervals[data.index] !== data) throw new Error('Break interval belongs to a different Routing model or is not registered.');
      return data.index;
    });
    this.operations.push({ type: 'setBreakIntervals', dimensionName, intervals: indices,
      vehicle: toIndex(vehicle, 'Routing break vehicle', this.vehicles() - 1),
      preTravel: options.preTravelEvaluator === undefined || options.preTravelEvaluator === -1 ? undefined : [...this.buildTransitMatrixForEvaluator(options.preTravelEvaluator)],
      postTravel: options.postTravelEvaluator === undefined || options.postTravelEvaluator === -1 ? undefined : [...this.buildTransitMatrixForEvaluator(options.postTravelEvaluator)],
      preTravelHandle: options.preTravelEvaluator, postTravelHandle: options.postTravelEvaluator });
  }
  getResourceGroup(index: number): RoutingResourceGroup { return this.resourceGroups[toIndex(index, 'Routing resource group', this.resourceGroups.length - 1)]; }
  getResourceGroups(): RoutingResourceGroup[] { return [...this.resourceGroups]; }
  getDimensionResourceGroupIndices(name: string): number[] {
    if (!this.hasDimension(name)) throw new RangeError('Routing resource dimension does not exist.');
    return this.resourceGroups.filter(group => resourceGroupSnapshots.get(group)!().resources.some(resource => resource.dimensionName === name)).map(group => group.index);
  }
  getDimensionResourceGroupIndex(name: string): number {
    const groups = this.getDimensionResourceGroupIndices(name);
    if (groups.length !== 1) throw new Error('Routing dimension must have exactly one resource group for this query.');
    return groups[0];
  }

  registerTransitCallback(callback: RoutingTransitCallback): number {
    const evaluatorIndex = this.nextEvaluatorIndex++;
    this.evaluatorCallbacks.set(evaluatorIndex, callback);
    return evaluatorIndex;
  }

  setArcCostEvaluatorOfAllVehicles(evaluatorIndex: number): void {
    this.callbackForEvaluatorIndex(evaluatorIndex);
    this.arcCostEvaluatorIndex = evaluatorIndex;
    this.vehicleArcCostEvaluators.clear();
  }

  setFirstSolutionEvaluator(evaluatorIndex: number): void {
    this.callbackForEvaluatorIndex(evaluatorIndex);
    this.firstSolutionEvaluatorIndex = evaluatorIndex;
  }

  setPrimaryConstrainedDimension(dimensionName: string): void {
    if (dimensionName !== '') this.getDimensionOrDie(dimensionName);
    this.primaryConstrainedDimension = dimensionName;
  }

  getPrimaryConstrainedDimension(): string { return this.primaryConstrainedDimension; }

  setSecondaryModel(model: RoutingModel | null, parameters: RoutingSearchParameters = {}): void {
    if (model === null) { this.secondaryModel = undefined; return; }
    if (!(model instanceof RoutingModel)) throw new TypeError('Routing secondary model must be a RoutingModel or null.');
    for (let current: RoutingModel | undefined = model; current; current = current.secondaryModel?.model) {
      if (current === this) throw new Error('Routing secondary models must not form a cycle.');
    }
    if (model.manager.numLocations !== this.manager.numLocations || model.manager.numVehicles !== this.manager.numVehicles
      || model.manager.starts.some((value, index) => value !== this.manager.starts[index])
      || model.manager.ends.some((value, index) => value !== this.manager.ends[index]))
      throw new Error('Routing secondary model must use the same index-manager layout.');
    this.secondaryModel = { model, parameters: structuredClone(parameters) };
  }

  setArcCostEvaluatorOfVehicle(evaluatorIndex: number, vehicle: number): void {
    toIndex(vehicle, 'Routing vehicle', this.vehicles() - 1);
    this.callbackForEvaluatorIndex(evaluatorIndex);
    this.vehicleArcCostEvaluators.set(vehicle, evaluatorIndex);
  }

  private async solveWithExecutor(
    parameters: RoutingSearchParameters,
    options: RoutingSolveOptions,
    initialAssignment?: RoutingInitialAssignment,
    readAssignmentOnly = false,
    workflow: RoutingWorkflow = {},
  ): Promise<RoutingResult> {
    if (this.solving) throw new Error('RoutingModel.solve() is already in progress.');
    this.solving = true;
    try {
      return await this.executeSolve(parameters, options, initialAssignment, readAssignmentOnly, workflow);
    } finally {
      this.solving = false;
    }
  }

  private createRequest(parameters: RoutingSearchParameters, options: RoutingSolveOptions,
    initialAssignment?: RoutingInitialAssignment, readAssignmentOnly = false,
    callbacks = this.routeEvaluators): PreparedRoutingExecution {
    if (options.signal?.aborted) throw createAbortError(options.signal);
    if (this.secondaryModel && (this.routeEvaluators.length || this.secondaryModel.model.routeEvaluators.length))
      throw new Error('Native Routing secondary-model optimization does not safely support whole-route callbacks.');
    const dimension = this.manager.getNumberOfIndices();
    const capturedCallbacks = [...callbacks];
    const encodedParameters = encodeRoutingSearchParameters(parameters);
    const encodedModelParameters = encodeRoutingModelParameters(this.parameters ?? {});
    const secondary = this.secondaryModel?.model.createRequest(this.secondaryModel.parameters, {});
    const ownWorkers = encodedParameters.numWorkers;
    const threads = ownWorkers <= 0 || (secondary && secondary.resources === undefined)
      ? undefined : Math.max(ownWorkers, secondary?.resources?.threads ?? 1);
    const vehicleGroups = new Map<number, number[]>();
    for (const [vehicle, evaluatorIndex] of this.vehicleArcCostEvaluators) {
      if (evaluatorIndex === this.arcCostEvaluatorIndex) continue;
      const vehicles = vehicleGroups.get(evaluatorIndex) ?? [];
      vehicles.push(vehicle);
      vehicleGroups.set(evaluatorIndex, vehicles);
    }
    const request: RoutingSolveRequest = {
      ...(secondary ? { secondaryModel: secondary.request } : {}),
      ...(this.routeLocks ? { routeLocks: structuredClone(this.routeLocks) } : {}),
      ...(this.firstSolutionHint ? { firstSolutionHint: snapshotForAssignment(this.firstSolutionHint, this) } : {}),
      readAssignmentOnly,
      ...(this.resourceGroups.length ? { resourceGroups: this.resourceGroups.map(group => resourceGroupSnapshots.get(group)!()) } : {}),
      searchEntryEvents: Boolean(options.onEvent) || this.enterSearchCallbacks.length > 0,
      solutionEvents: Boolean(options.onEvent) || this.atSolutionCallbacks.length > 0,
      trackUncheckedNeighbors: options.trackUncheckedNeighbors === true
        || this.atSolutionCallbacks.some(entry => entry.trackUncheckedNeighbors),
      numLocations: this.manager.numLocations,
      numVehicles: this.manager.numVehicles,
      starts: [...this.manager.starts],
      ends: [...this.manager.ends],
      searchParametersProto: encodedParameters.proto,
      searchParameterFields: encodedParameters.fields,
      modelParametersProto: encodedModelParameters.proto,
      modelParameterFields: encodedModelParameters.fields,
      transitMatrix: this.buildTransitMatrix(),
      transitMatrixDimension: dimension,
      operations: structuredClone([
        ...this.operations,
        ...this.pickupToDeliveryLimitOperations(),
        ...(this.firstSolutionEvaluatorIndex === undefined ? [] : [{ type: 'setFirstSolutionEvaluator' as const,
          transitMatrix: this.buildTransitMatrixForEvaluator(this.firstSolutionEvaluatorIndex) }]),
        ...(this.primaryConstrainedDimension === '' ? [] : [{ type: 'setPrimaryConstrainedDimension' as const,
          dimensionName: this.primaryConstrainedDimension }]),
        ...[...vehicleGroups].map(([evaluatorIndex, vehicles]): RoutingModelOperation => ({
          type: 'setArcCostEvaluatorOfVehicles', vehicles,
          transitMatrix: this.buildTransitMatrixForEvaluator(evaluatorIndex),
        })),
      ]),
      dimensionNames: [...this.dimensions.keys()],
      initialAssignment: initialAssignment
        ? {
          routes: initialAssignment.routes.map((indices) => [...indices]),
          ignoreInactiveIndices: initialAssignment.ignoreInactiveIndices,
          ...(initialAssignment.snapshot ? { snapshot: structuredClone(initialAssignment.snapshot) } : {}),
        }
        : undefined,
    };
    return { request, resources: threads === undefined ? undefined : { threads }, callbacks: capturedCallbacks };
  }

  private async executeSolve(
    parameters: RoutingSearchParameters,
    options: RoutingSolveOptions,
    initialAssignment?: RoutingInitialAssignment,
    readAssignmentOnly = false,
    workflow: RoutingWorkflow = {},
  ): Promise<RoutingResult> {
    const prepared = this.createRequest(parameters, options, initialAssignment, readAssignmentOnly);
    const { request } = prepared;
    Object.assign(request, structuredClone(workflow));
    this.lastStatus = null;
    const response = await this.executeNative(prepared, options);
    const ownedAssignment = (result: RoutingNativeResult['solution']) => {
      if (!result) return null;
      if (request.resourceGroups?.length && (result.resourceAssignments?.length !== request.resourceGroups.length
        || result.resourceAssignments.some(value => value.mins.length !== request.numVehicles || value.maxs.length !== request.numVehicles)))
        throw new Error('Routing executor did not return the requested resource assignments.');
      return createAssignment(this, result, { localSearchProfile: response.localSearchProfile ?? null,
        automaticFirstSolutionStrategy: response.automaticFirstSolutionStrategy ?? null });
    };
    this.lastStatus = response.status;
    const assignment = ownedAssignment(response.solution);
    const collectedAssignments = (response.collectedSolutions ?? []).map(result => ownedAssignment(result)!);
    const action = request.assignmentAction ?? RoutingAssignmentAction.SOLVE;
    // Native's single collected assignment is the returned best assignment.
    // Reuse its owned snapshot rather than serializing it a second time.
    if (assignment && collectedAssignments.length === 0 && !parameters.useIteratedLocalSearch && (parameters.numberOfSolutionsToCollect ?? 1) === 1
      && (action === RoutingAssignmentAction.SOLVE || action === RoutingAssignmentAction.MULTIPLE_STARTS))
      collectedAssignments.push(assignment);
    return new RoutingResult(response.status, assignment, response.localSearchProfile ?? null,
      response.automaticFirstSolutionStrategy ?? null, collectedAssignments,
      response.searchStatistics ?? null, response.objectiveLowerBound ?? null, response.timeLimitReached ?? null);
  }

  private async executeNative({ request, resources, callbacks }: PreparedRoutingExecution,
      options: RoutingSolveOptions): Promise<RoutingNativeResult> {
    const executor = createRoutingExecutor(options.executor);
    const entryCallbacks = [...this.enterSearchCallbacks];
    return await executeSolverJob(
      executor,
      { type: 'solve', request, interruptible: Boolean(options.signal) },
      {
        showCloudNotice: !(executor instanceof SolverServerExecutor),
        onCallback: callbacks.length ? routingRouteCallback(callbacks) : undefined,
        onEvent: async event => {
          if (event.type === 'searchEntered') {
            for (const callback of entryCallbacks) await callback();
          }
          if (event.type === 'solution') {
            await this.runAtSolutionCallbacks(event);
          }
          await options.onEvent?.(event);
        },
        signal: options.signal,
        resources,
      },
    );
  }

  async solveWithParameters(
    parameters: RoutingSearchParameters = defaultRoutingSearchParameters(),
    options: RoutingSolveOptions = {},
  ): Promise<Assignment | null> {
    return (await this.solveWithExecutor(parameters, options)).assignment;
  }

  async solve(options: RoutingSolveOptions = {}): Promise<RoutingResult> {
    const { executor: _executor, onEvent: _onEvent, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    return this.solveWithExecutor(parameters, options);
  }

  status(): RoutingSearchStatus {
    return this.lastStatus ?? RoutingSearchStatus.ROUTING_NOT_SOLVED;
  }

  vehicles(): number {
    return this.manager.getNumberOfVehicles();
  }

  setMaximumNumberOfActiveVehicles(maximum: number): void {
    const count = toIndex(maximum, 'Routing maximum active vehicles', INT32_MAX);
    this.operations.push({ type: 'setMaximumActiveVehicles', maximum: count });
    this.maximumActiveVehicles = count;
  }

  getMaximumNumberOfActiveVehicles(): number { return this.maximumActiveVehicles ?? this.vehicles(); }

  setFixedCostOfVehicle(cost: IntValue, vehicle: number): void {
    const index = toIndex(vehicle, 'Routing fixed-cost vehicle', this.vehicles() - 1);
    const value = this.vehicleCost(cost);
    this.operations.push({ type: 'setFixedVehicleCost', cost: value, vehicle: index });
    this.fixedVehicleCosts.set(index, value);
  }

  setPathEnergyCostOfVehicle(force: string, distance: string, costPerUnit: IntValue, vehicle: number): void {
    this.setPathEnergyCostsOfVehicle(force, distance, 0, 0, costPerUnit, vehicle);
  }

  setPathEnergyCostsOfVehicle(force: string, distance: string, threshold: IntValue,
    costBelow: IntValue, costAbove: IntValue, vehicle: number): void {
    this.getDimensionOrDie(force); this.getDimensionOrDie(distance);
    this.operations.push({ type: 'setPathEnergyCosts', force, distance, threshold: this.vehicleCost(threshold),
      costBelow: this.vehicleCost(costBelow), costAbove: this.vehicleCost(costAbove),
      vehicle: toIndex(vehicle, 'Routing energy-cost vehicle', this.vehicles() - 1) });
  }

  setFixedCostOfAllVehicles(cost: IntValue): void {
    const value = this.vehicleCost(cost);
    for (let vehicle = 0; vehicle < this.vehicles(); ++vehicle) this.setFixedCostOfVehicle(value, vehicle);
  }

  getFixedCostOfVehicle(vehicle: number): bigint {
    return this.fixedVehicleCosts.get(toIndex(vehicle, 'Routing fixed-cost vehicle', this.vehicles() - 1)) ?? 0n;
  }

  setAmortizedCostFactorsOfVehicle(linear: IntValue, quadratic: IntValue, vehicle: number): void {
    const index = toIndex(vehicle, 'Routing amortized-cost vehicle', this.vehicles() - 1);
    const factors = this.amortizedFactors(linear, quadratic);
    this.operations.push({ type: 'setAmortizedVehicleCosts', ...factors, vehicle: index });
    this.amortizedVehicleCosts.set(index, factors);
  }

  setAmortizedCostFactorsOfAllVehicles(linear: IntValue, quadratic: IntValue): void {
    const factors = this.amortizedFactors(linear, quadratic);
    for (let vehicle = 0; vehicle < this.vehicles(); ++vehicle) this.setAmortizedCostFactorsOfVehicle(factors.linear, factors.quadratic, vehicle);
  }

  getAmortizedLinearCostFactorOfVehicles(): bigint[] {
    return Array.from({ length: this.vehicles() }, (_, vehicle) => this.amortizedVehicleCosts.get(vehicle)?.linear ?? 0n);
  }

  getAmortizedQuadraticCostFactorOfVehicles(): bigint[] {
    return Array.from({ length: this.vehicles() }, (_, vehicle) => this.amortizedVehicleCosts.get(vehicle)?.quadratic ?? 0n);
  }

  setVehicleUsedWhenEmpty(isUsed: boolean, vehicle: number): void {
    const index = toIndex(vehicle, 'Routing empty-route vehicle', this.vehicles() - 1);
    if (typeof isUsed !== 'boolean') throw new TypeError('Routing empty-route usage must be a boolean.');
    this.operations.push({ type: 'setVehicleUsedWhenEmpty', isUsed, vehicle: index });
    this.vehiclesUsedWhenEmpty.set(index, isUsed);
  }

  isVehicleUsedWhenEmpty(vehicle: number): boolean {
    return this.vehiclesUsedWhenEmpty.get(toIndex(vehicle, 'Routing empty-route vehicle', this.vehicles() - 1)) ?? false;
  }

  private vehicleCost(value: IntValue): bigint {
    const cost = toInt64(value, 'Routing vehicle cost');
    if (cost < 0n) throw new RangeError('Routing vehicle cost must be nonnegative.');
    return cost;
  }

  private amortizedFactors(linear: IntValue, quadratic: IntValue): { linear: bigint; quadratic: bigint } {
    const factors = { linear: this.vehicleCost(linear), quadratic: this.vehicleCost(quadratic) };
    // Native OR-Tools adds these factors while enabling its amortized-cost path.
    if (factors.linear + factors.quadratic > INT64_MAX) throw new RangeError('Routing amortized cost factors must sum to a signed int64 value.');
    return factors;
  }

  start(vehicle: number): number {
    return this.manager.getStartIndex(vehicle);
  }

  end(vehicle: number): number {
    return this.manager.getEndIndex(vehicle);
  }

  isEnd(index: number): boolean {
    return this.manager.ends.some((_, vehicle) => this.manager.getEndIndex(vehicle) === index);
  }

  registerTransitMatrix(matrix: IntValue[][]): number {
    const nodes = this.manager.getNumberOfNodes();
    if (matrix.length !== nodes) throw new RangeError('Routing transit matrix must contain one row and column per node.');
    const snapshot = Array.from(matrix, row => {
      if (!Array.isArray(row) || row.length !== nodes) throw new RangeError('Routing transit matrix must contain one row and column per node.');
      return Array.from(row, value => toInt64(value));
    });
    return this.registerTransitCallback((fromIndex, toIndex) => {
      const fromNode = this.manager.indexToNode(fromIndex);
      const toNode = this.manager.indexToNode(toIndex);
      return snapshot[fromNode][toNode];
    });
  }

  registerUnaryTransitCallback(callback: (fromIndex: number) => IntValue): number {
    const index = this.registerTransitCallback((fromIndex) => callback(fromIndex));
    this.unaryEvaluators.add(index); return index;
  }

  registerUnaryTransitVector(values: IntValue[]): number {
    if (values.length !== this.manager.getNumberOfNodes()) throw new RangeError('Routing transit vector must contain one value per node.');
    const snapshot = Array.from(values, value => toInt64(value));
    return this.registerUnaryTransitCallback(fromIndex => snapshot[this.manager.indexToNode(fromIndex)]);
  }

  /** Register per-arc native piecewise-linear transit over [domainStart, domainEnd). */
  registerStateDependentTransitCallback(
    callback: (fromIndex: number, toIndex: number) => RoutingPiecewiseLinearFunction,
    options: RoutingStateDependentTransitOptions,
  ): number {
    if (typeof callback !== 'function') throw new TypeError('Routing state-dependent callback must be a function.');
    const domainStart = toInt64(options.domainStart), domainEnd = toInt64(options.domainEnd);
    if (domainStart < 0n || domainStart >= domainEnd || domainEnd > BigInt(INT32_MAX))
      throw new RangeError('Routing state-dependent domain must satisfy 0 <= start < end <= 2147483647.');
    const index = this.stateDependentEvaluators.size;
    this.stateDependentEvaluators.set(index, { callback, domainStart, domainEnd });
    return index;
  }

  addDimensionDependentDimensionWithVehicleCapacity(
    transitIndices: readonly number[], dependentTransitIndices: readonly number[], baseDimension: string | null,
    slackMax: IntValue, capacities: readonly IntValue[], fixStartCumulToZero: boolean, name: string,
  ): boolean {
    this.validateDimensionOptions(fixStartCumulToZero, name);
    if (this.dimensions.has(name)) return false;
    if (baseDimension !== null) this.getDimensionOrDie(baseDimension);
    if (transitIndices.length !== this.vehicles() || dependentTransitIndices.length !== this.vehicles() || capacities.length !== this.vehicles())
      throw new RangeError('Routing dependent dimension requires one fixed evaluator, dependent evaluator and capacity per vehicle.');
    const slack = this.dimensionLimit(slackMax, 'Routing dimension slack');
    const limits = Array.from(capacities, value => this.dimensionLimit(value, 'Routing vehicle capacity'));
    const matrices = Array.from(transitIndices, index => this.buildTransitMatrixForEvaluator(toIndex(index, 'Routing transit evaluator')));
    const snapshots = new Map<number, RoutingStateDependentMatrix>();
    const dependentMatrices = dependentTransitIndices.map(index => {
      const evaluator = this.stateDependentEvaluators.get(toIndex(index, 'Routing state-dependent evaluator'));
      if (!evaluator) throw new RangeError('Routing state-dependent evaluator is unavailable.');
      let matrix = snapshots.get(index);
      if (!matrix) {
        const functions: RoutingStateDependentMatrix['functions'] = [];
        const dimension = this.manager.getNumberOfIndices();
        for (let from = 0; from < dimension; ++from) for (let to = 0; to < dimension; ++to) {
          const fn = synchronousCallbackResult(evaluator.callback(from, to), 'Routing state-dependent transit callbacks must return synchronously.');
          functions.push({ x: Array.from(fn.x, value => toInt64(value)), y: Array.from(fn.y, value => toInt64(value)) });
        }
        matrix = { domainStart: evaluator.domainStart, domainEnd: evaluator.domainEnd, functions };
        snapshots.set(index, matrix);
      }
      return matrix;
    });
    this.addDimensionState(name);
    this.operations.push({ type: 'addDependentDimension', transitMatrices: matrices,
      ...(transitIndices.some(index => this.unaryEvaluators.has(index)) ? { unaryTransits: transitIndices.map(index => this.unaryEvaluators.has(index)) } : {}),
      dependentMatrices, ...(baseDimension !== null ? { baseDimension } : {}), slackMax: slack, capacities: limits, fixStartCumulToZero, name });
    return true;
  }

  addDimension(
    transitIndex: number,
    slackMax: IntValue,
    capacity: IntValue,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (this.dimensions.has(name)) return false;
    const operation: RoutingModelOperation = {
      type: 'addDimension',
      transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
      ...(this.unaryEvaluators.has(transitIndex) ? { unaryTransit: true } : {}),
      slackMax: toInt64(slackMax),
      capacity: toInt64(capacity),
      fixStartCumulToZero,
      name,
    };
    this.addDimensionState(name);
    this.operations.push(operation);
    return true;
  }

  addDimensionWithVehicleCapacity(
    transitIndex: number,
    slackMax: IntValue,
    capacities: IntValue[],
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (this.dimensions.has(name)) return false;
    const operation: RoutingModelOperation = {
      type: 'addDimensionWithVehicleCapacity',
      transitMatrix: this.buildTransitMatrixForEvaluator(transitIndex),
      ...(this.unaryEvaluators.has(transitIndex) ? { unaryTransit: true } : {}),
      slackMax: toInt64(slackMax),
      capacities: capacities.map((value) => toInt64(value)),
      fixStartCumulToZero,
      name,
    };
    this.addDimensionState(name);
    this.operations.push(operation);
    return true;
  }

  addDimensionWithVehicleTransits(
    transitIndices: number[],
    slackMax: IntValue,
    capacity: IntValue,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean {
    if (this.dimensions.has(name)) return false;
    const indices = Array.isArray(transitIndices) ? transitIndices : [transitIndices];
    const operation: RoutingModelOperation = {
      type: 'addDimensionWithVehicleTransits',
      transitMatrices: indices.map((index) => this.buildTransitMatrixForEvaluator(index)),
      ...(indices.some(index => this.unaryEvaluators.has(index)) ? { unaryTransits: indices.map(index => this.unaryEvaluators.has(index)) } : {}),
      slackMax: toInt64(slackMax),
      capacity: toInt64(capacity),
      fixStartCumulToZero,
      name,
    };
    this.addDimensionState(name);
    this.operations.push(operation);
    return true;
  }

  addDimensionWithVehicleTransitAndCapacity(
    transitIndices: readonly number[], slackMax: IntValue, capacities: readonly IntValue[],
    fixStartCumulToZero: boolean, name: string,
  ): boolean {
    this.validateDimensionOptions(fixStartCumulToZero, name);
    if (this.dimensions.has(name)) return false;
    if (transitIndices.length !== this.vehicles() || capacities.length !== this.vehicles())
      throw new RangeError('Routing dimension requires one evaluator and capacity per vehicle.');
    const slack = this.dimensionLimit(slackMax, 'Routing dimension slack');
    const limits = Array.from(capacities, value => this.dimensionLimit(value, 'Routing vehicle capacity'));
    const matrices = Array.from(transitIndices, index => this.buildTransitMatrixForEvaluator(toIndex(index, 'Routing transit evaluator')));
    this.addDimensionState(name);
    this.operations.push({ type: 'addDimensionWithVehicleTransitAndCapacity', transitMatrices: matrices, slackMax: slack,
      ...(transitIndices.some(index => this.unaryEvaluators.has(index)) ? { unaryTransits: transitIndices.map(index => this.unaryEvaluators.has(index)) } : {}),
      capacities: limits, fixStartCumulToZero, name });
    return true;
  }

  addConstantDimensionWithSlack(
    value: IntValue, capacity: IntValue, slackMax: IntValue, fixStartCumulToZero: boolean, name: string,
  ): [number, boolean] {
    this.validateDimensionOptions(fixStartCumulToZero, name);
    const transit = toInt64(value);
    const limit = this.dimensionLimit(capacity, 'Routing dimension capacity');
    const slack = this.dimensionLimit(slackMax, 'Routing dimension slack');
    // Native constant-with-slack construction registers a reusable evaluator even for duplicate names.
    const evaluator = this.registerTransitCallback(() => transit);
    if (!this.addDimensionState(name)) return [evaluator, false];
    this.operations.push({ type: 'addConstantDimension', value: transit, capacity: limit, slackMax: slack, fixStartCumulToZero, name });
    return [evaluator, true];
  }

  private dimensionLimit(value: IntValue, label: string): bigint {
    const exact = toInt64(value, label);
    if (exact < 0n) throw new RangeError(`${label} must be nonnegative.`);
    return exact;
  }

  private validateDimensionOptions(fixStartCumulToZero: boolean, name: string): void {
    if (typeof fixStartCumulToZero !== 'boolean') throw new TypeError('Routing fixed-start flag must be a boolean.');
    if (typeof name !== 'string' || name.includes('\0')) throw new TypeError('Routing dimension name must be a string without NUL.');
  }

  addConstantDimension(
    value: IntValue,
    capacity: IntValue,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] {
    const transit = toInt64(value);
    const limit = toInt64(capacity);
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addConstantDimension', value: transit, capacity: limit, fixStartCumulToZero, name });
    return [this.registerTransitCallback(() => transit), true];
  }

  addVectorDimension(values: IntValue[], capacity: IntValue, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    if (values.length !== this.manager.getNumberOfNodes()) throw new RangeError('Routing dimension vector must contain one value per node.');
    const transits = values.map((item) => toInt64(item));
    const limit = toInt64(capacity);
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addVectorDimension', values: transits, capacity: limit, fixStartCumulToZero, name });
    return [this.registerUnaryTransitVector(transits), true];
  }

  addMatrixDimension(matrix: IntValue[][], capacity: IntValue, fixStartCumulToZero: boolean, name: string): [number, boolean] {
    const nodes = this.manager.getNumberOfNodes();
    if (matrix.length !== nodes || matrix.some(row => row.length !== nodes)) throw new RangeError('Routing dimension matrix must contain one row and column per node.');
    const transits = matrix.map((row) => row.map((item) => toInt64(item)));
    const limit = toInt64(capacity);
    if (!this.addDimensionState(name)) return [-1, false];
    this.operations.push({ type: 'addMatrixDimension', matrix: transits, capacity: limit, fixStartCumulToZero, name });
    return [this.registerTransitMatrix(transits), true];
  }

  hasDimension(name: string): boolean { return this.dimensions.has(name); }

  getAllDimensionNames(): string[] {
    const encoder = new TextEncoder();
    return [...this.dimensions.keys()].map(name => ({ name, bytes: encoder.encode(name) })).sort((a, b) => {
      for (let i = 0; i < Math.min(a.bytes.length, b.bytes.length); ++i) {
        if (a.bytes[i] !== b.bytes[i]) return a.bytes[i] - b.bytes[i];
      }
      return a.bytes.length - b.bytes.length;
    }).map(entry => entry.name);
  }

  getDimensions(): RoutingDimension[] { return [...this.dimensions.keys()].map(name => this.getDimensionOrDie(name)); }

  getDimensionOrDie(name: string): RoutingDimension {
    const state = this.dimensions.get(name);
    if (!state) {
      throw new Error(`RoutingModel.getDimensionOrDie: unknown dimension '${name}'.`);
    }
    return createRoutingDimension(this, name, state, operation => this.operations.push(operation),
      this.manager.getNumberOfIndices() - 1, (intervals, vehicle, options) => this.setDimensionBreakIntervals(name, intervals, vehicle, options),
      (limit, pairIndex) => {
        pairIndex = toIndex(pairIndex, 'Routing pickup/delivery pair', this.pickupDeliveryPairs.length - 1);
        if (typeof limit !== 'function') throw new TypeError('Routing pickup/delivery limit must be a function.');
        (state.pickupToDeliveryLimits ??= new Map()).set(pairIndex, limit);
      }, (query, options, assignment) => this.inspectDimension(query, options, assignment));
  }

  /** Replace eligible vehicles for an index; an empty list allows every vehicle.
   * Optional nodes may still be dropped.
   */
  setAllowedVehiclesForIndex(vehicleIds: readonly number[], index: number): void {
    const routingIndex = toIndex(index, 'Routing eligibility index', this.manager.getNumberOfIndices() - 1);
    const vehicles = Array.from(vehicleIds, vehicle => toIndex(vehicle, 'Routing eligible vehicle', this.vehicles() - 1));
    this.operations.push({ type: 'setAllowedVehiclesForIndex', vehicles, index: routingIndex });
  }

  addDisjunction(indices: number[], penalty?: IntValue, maxCardinality?: IntValue, penaltyCostBehavior?: PenaltyCostBehavior): number {
    if (indices.length === 0) throw new RangeError('Routing disjunction cannot be empty.');
    const snapshot = Array.from(indices, index => {
      const value = toIndex(index, 'Routing disjunction index', this.manager.getNumberOfIndices() - this.vehicles() - 1);
      for (let vehicle = 0; vehicle < this.vehicles(); ++vehicle) {
        if (value === this.manager.getStartIndex(vehicle)) throw new RangeError('Routing disjunction cannot include a vehicle start.');
      }
      return value;
    });
    const maximum = maxCardinality === undefined ? undefined : toInt64(maxCardinality, 'Routing disjunction cardinality');
    if (maximum !== undefined && maximum < 1n) throw new RangeError('Routing disjunction cardinality must be positive.');
    const behavior = penaltyCostBehavior === undefined ? undefined : toIndex(penaltyCostBehavior, 'Routing disjunction penalty behavior', 1);
    const cost = penalty === undefined ? undefined : toInt64(penalty);
    this.operations.push({ type: 'addDisjunction', indices: snapshot, penalty: cost,
      ...(maximum === undefined ? {} : { maxCardinality: maximum }), ...(behavior === undefined ? {} : { penaltyCostBehavior: behavior }) });
    const id = this.disjunctions.length;
    this.disjunctions.push({ penalty: cost ?? -1n,
      penaltyCostBehavior: behavior ?? PenaltyCostBehavior.PENALIZE_ONCE, size: snapshot.length });
    for (const index of snapshot) {
      const memberships = this.indexDisjunctions.get(index) ?? [];
      memberships.push(id);
      this.indexDisjunctions.set(index, memberships);
    }
    return id;
  }

  /** Return disjunction IDs containing this routing node index, preserving duplicate memberships. */
  getDisjunctionIndices(index: number): number[] {
    const value = toIndex(index, 'Routing disjunction node index', this.manager.getNumberOfIndices() - this.vehicles() - 1);
    return [...(this.indexDisjunctions.get(value) ?? [])];
  }

  private disjunction(index: number) {
    return this.disjunctions[toIndex(index, 'Routing disjunction ID', this.disjunctions.length - 1)];
  }

  getDisjunctionPenalty(index: number): bigint { return this.disjunction(index).penalty; }

  async getDisjunctionMaxCardinality(index: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    this.disjunction(index);
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_DISJUNCTION_MAX_CARDINALITY,
      { index: BigInt(index) }, options)).value!;
  }

  getDisjunctionPenaltyCostBehavior(index: number): PenaltyCostBehavior { return this.disjunction(index).penaltyCostBehavior; }

  getNumberOfDisjunctions(): number { return this.disjunctions.length; }

  /** Native sorted pairs whose visits each belong to exactly one disjunction. */
  async getPerfectBinaryDisjunctions(options: RoutingDomainOptions = {}): Promise<Array<[number, number]>> {
    const result = await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_PERFECT_BINARY_DISJUNCTIONS, {}, options);
    return result.groups.map(pair => {
      if (pair.length !== 2) throw new Error('Native Routing executor returned an invalid disjunction pair.');
      return [pair[0], pair[1]];
    });
  }

  /** Native visit count excluding starts, ends and pickup/delivery alternatives. */
  async getNumOfSingletonNodes(options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SINGLETON_NODES, {}, options)).value!);
  }

  /** Explicit allowed-vehicle configuration, not a complete feasibility check. */
  async isVehicleAllowedForIndex(vehicle: number, index: number, options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_ALLOWED, {
      vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.vehicles() - 1),
      index: BigInt(toIndex(index, 'Routing eligibility index', this.manager.getNumberOfIndices() - this.vehicles() - 1)),
    }, options)).value === 1n;
  }

  /** Native construction cost; preserves the int64-maximum route-closing sentinel. */
  async getArcCostForFirstSolution(fromIndex: number, toIndexValue: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_FIRST_SOLUTION_ARC_COST, {
      index: BigInt(toIndex(fromIndex, 'Routing first-solution arc origin', this.manager.getNumberOfIndices() - this.vehicles() - 1)),
      otherIndex: BigInt(toIndex(toIndexValue, 'Routing first-solution arc destination', this.manager.getNumberOfIndices() - 1)),
    }, options)).value!;
  }

  /** Native inspection tests the -1 sentinel specifically, rather than every negative penalty. */
  hasMandatoryDisjunctions(): boolean { return this.disjunctions.some(value => value.penalty === -1n); }

  async hasMaxCardinalityConstrainedDisjunctions(options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_HAS_MAX_CARDINALITY_CONSTRAINED_DISJUNCTIONS,
      {}, options)).value === 1n;
  }

  /** Explicitly ignore disjunctions whose active variables are already fixed to zero at this construction point. */
  ignoreDisjunctionsAlreadyForcedToZero(): void {
    this.operations.push({ type: 'ignoreDisjunctionsAlreadyForcedToZero' });
  }

  addSoftSameVehicleConstraint(indices: readonly number[], cost: IntValue): void {
    const snapshot = Array.from(indices, index => toIndex(index, 'Routing soft same-vehicle index', this.manager.getNumberOfIndices() - this.vehicles() - 1));
    const value = this.vehicleCost(cost);
    if (snapshot.length === 0) return; // Native OR-Tools ignores empty groups.
    this.operations.push({ type: 'addSoftSameVehicleConstraint', indices: snapshot, cost: value });
    this.softSameVehicleConstraints.push({ indices: snapshot, cost: value });
  }

  getNumberOfSoftSameVehicleConstraints(): number { return this.softSameVehicleConstraints.length; }

  getSoftSameVehicleIndices(index: number): number[] {
    return [...this.softSameVehicleConstraints[toIndex(index, 'Routing soft same-vehicle constraint', this.softSameVehicleConstraints.length - 1)].indices];
  }

  getSoftSameVehicleCost(index: number): bigint {
    return this.softSameVehicleConstraints[toIndex(index, 'Routing soft same-vehicle constraint', this.softSameVehicleConstraints.length - 1)].cost;
  }

  setPickupAndDeliveryPolicyOfVehicle(policy: PickupAndDeliveryPolicy, vehicle: number): void {
    const index = toIndex(vehicle, 'Routing pickup/delivery vehicle', this.vehicles() - 1);
    const value = toIndex(policy, 'Routing pickup/delivery policy', PickupAndDeliveryPolicy.PICKUP_AND_DELIVERY_FIFO);
    this.operations.push({ type: 'setPickupDeliveryPolicy', policy: value, vehicle: index });
    this.pickupDeliveryPolicies.set(index, value);
  }

  setPickupAndDeliveryPolicyOfAllVehicles(policy: PickupAndDeliveryPolicy): void {
    const value = toIndex(policy, 'Routing pickup/delivery policy', PickupAndDeliveryPolicy.PICKUP_AND_DELIVERY_FIFO);
    for (let vehicle = 0; vehicle < this.vehicles(); ++vehicle) this.setPickupAndDeliveryPolicyOfVehicle(value, vehicle);
  }

  getPickupAndDeliveryPolicyOfVehicle(vehicle: number): PickupAndDeliveryPolicy {
    return this.pickupDeliveryPolicies.get(toIndex(vehicle, 'Routing pickup/delivery vehicle', this.vehicles() - 1)) ?? PickupAndDeliveryPolicy.PICKUP_AND_DELIVERY_NO_ORDER;
  }

  /** Copy native route variables to this model without validating or solving a schedule. */
  async transferAssignmentFrom(assignment: Assignment,
      options: RoutingDomainOptions = {}): Promise<RoutingAssignmentSeed> {
    const state = assignmentStates.get(assignment);
    if (!state) throw new Error('Routing source assignment is not registered.');
    const sourceModel = state.routing;
    if (sourceModel.manager.numLocations !== this.manager.numLocations || sourceModel.vehicles() !== this.vehicles()
        || sourceModel.manager.starts.some((value, index) => value !== this.manager.starts[index])
        || sourceModel.manager.ends.some((value, index) => value !== this.manager.ends[index]))
      throw new Error('Routing assignment transfer requires the same index-manager layout.');
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.assignmentTransfer = {
      nextValues: state.result.nextValues.slice(0, sourceModel.manager.getNumberOfIndices() - sourceModel.vehicles()),
      vehicleValues: [...(state.result.vehicleValues ?? [])],
    };
    const snapshot = (await this.inspectNative(prepared, options)).assignmentSeed;
    if (!snapshot) throw new Error('Native Routing executor did not return an assignment seed.');
    return createAssignmentSeed(this, snapshot);
  }

  async solveFromAssignmentWithParameters(
    assignment: Assignment | RoutingAssignmentSeed,
    parameters: RoutingSearchParameters,
    options: RoutingSolveOptions = {},
  ): Promise<Assignment | null> {
    return (await this.solveWithExecutor(
      parameters,
      options,
      { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this, true) },
    )).assignment;
  }

  async restoreAssignment(assignment: Assignment | RoutingAssignmentSeed, options: RoutingSolveOptions = {}): Promise<Assignment | null> {
    const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    return (await this.solveWithExecutor(parameters, options,
      { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this, true) }, true)).assignment;
  }

  async solveFromAssignmentsWithParameters(assignments: readonly (Assignment | RoutingAssignmentSeed)[], parameters: RoutingSearchParameters = {},
      options: RoutingSolveOptions = {}): Promise<RoutingResult> {
    return await this.solveWithExecutor(parameters, options, undefined, false, {
      assignmentAction: RoutingAssignmentAction.MULTIPLE_STARTS,
      candidateAssignments: Array.from(assignments, assignment => snapshotForAssignment(assignment, this, true)),
    });
  }

  async fastSolveFromAssignmentWithParameters(assignment: Assignment, parameters: RoutingSearchParameters = {},
      checkSolutionInCp = true, options: RoutingSolveOptions = {}): Promise<RoutingResult> {
    return await this.solveWithExecutor(parameters, options,
      { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this) }, false,
      { assignmentAction: RoutingAssignmentAction.FAST_SOLVE, checkSolutionInCp });
  }

  async packCumulsOfOptimizerDimensionsFromAssignment(assignment: Assignment, durationLimitSeconds: number,
      options: RoutingSolveOptions = {}): Promise<RoutingPackingResult> {
    if (typeof durationLimitSeconds !== 'number' || Number.isNaN(durationLimitSeconds)) throw new RangeError('Routing packing duration must be a number other than NaN.');
    const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    const result = await this.solveWithExecutor(parameters, options,
      { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this) }, false,
      { assignmentAction: RoutingAssignmentAction.PACK, packingDurationSeconds: durationLimitSeconds });
    if (result.timeLimitReached === null) throw new Error('Native Routing executor did not return the packing time-limit flag.');
    return { assignment: result.assignment, timeLimitReached: result.timeLimitReached };
  }

  async compactAssignment(assignment: Assignment, options: RoutingSolveOptions = {}): Promise<Assignment | null> {
    return await this.compactNativeAssignment(assignment, false, options);
  }

  async compactAndCheckAssignment(assignment: Assignment, options: RoutingSolveOptions = {}): Promise<Assignment | null> {
    return await this.compactNativeAssignment(assignment, true, options);
  }

  private async compactNativeAssignment(assignment: Assignment, check: boolean, options: RoutingSolveOptions): Promise<Assignment | null> {
    const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    return (await this.solveWithExecutor(parameters, options,
      { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this) }, false,
      { assignmentAction: check ? RoutingAssignmentAction.COMPACT_AND_CHECK : RoutingAssignmentAction.COMPACT })).assignment;
  }

  async computeLowerBound(options: RoutingDomainOptions = {}): Promise<bigint> {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.assignmentAction = RoutingAssignmentAction.LOWER_BOUND;
    const result = await this.inspectNative(prepared, options);
    if (result.computedLowerBound === undefined) throw new Error('Native Routing executor did not return the computed lower bound.');
    return result.computedLowerBound;
  }

  async checkIfAssignmentIsFeasible(assignment: Assignment | RoutingAssignmentSeed, callAtSolutionMonitors = false,
      options: RoutingSolveOptions = {}): Promise<boolean> {
    if (typeof callAtSolutionMonitors !== 'boolean') throw new TypeError('Routing monitor option must be a boolean.');
    if (this.solving) throw new Error('RoutingModel.solve() is already in progress.');
    this.solving = true;
    try {
      const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
      const prepared = this.createRequest(parameters, options,
        { routes: [], ignoreInactiveIndices: false, snapshot: snapshotForAssignment(assignment, this, true) });
      const { request } = prepared;
      request.assignmentAction = RoutingAssignmentAction.CHECK_FEASIBILITY;
      request.callAtSolutionMonitors = callAtSolutionMonitors;
      const response = await this.executeNative(prepared, options);
      if (response.assignmentFeasible === undefined) throw new Error('Native Routing executor did not return assignment feasibility.');
      return response.assignmentFeasible;
    } finally { this.solving = false; }
  }

  private async inspectCumulOptimizers(options: RoutingSolveOptions): Promise<NonNullable<RoutingNativeResult['cumulOptimizers']>> {
    const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    const prepared = this.createRequest(parameters, options);
    const { request } = prepared;
    request.inspectCumulOptimizers = true;
    const data = (await this.inspectNative(prepared, options)).cumulOptimizers;
    if (!data) throw new Error('Native Routing executor did not return cumul optimizer inspection.');
    return data;
  }

  async hasGlobalCumulOptimizer(dimensionName: string, options: RoutingSolveOptions = {}): Promise<boolean> {
    this.getDimensionOrDie(dimensionName);
    return (await this.inspectCumulOptimizers(options)).globalDimensions.includes(dimensionName);
  }

  async hasLocalCumulOptimizer(dimensionName: string, options: RoutingSolveOptions = {}): Promise<boolean> {
    this.getDimensionOrDie(dimensionName);
    return (await this.inspectCumulOptimizers(options)).localDimensions.includes(dimensionName);
  }

  async getDimensionsWithGlobalCumulOptimizers(options: RoutingSolveOptions = {}): Promise<RoutingDimension[]> {
    return (await this.inspectCumulOptimizers(options)).globalDimensions.map(name => this.getDimensionOrDie(name));
  }

  async getDimensionsWithLocalCumulOptimizers(options: RoutingSolveOptions = {}): Promise<RoutingDimension[]> {
    return (await this.inspectCumulOptimizers(options)).localDimensions.map(name => this.getDimensionOrDie(name));
  }

  setFirstSolutionHint(assignment: Assignment | null): void {
    if (assignment !== null) snapshotForAssignment(assignment, this);
    this.firstSolutionHint = assignment;
  }

  getFirstSolutionHint(): Assignment | null { return this.firstSolutionHint; }

  addRouteConstraint(evaluator: RoutingRouteEvaluator, costsAreHomogeneousAcrossVehicles = false): void {
    if (typeof evaluator !== 'function' || typeof costsAreHomogeneousAcrossVehicles !== 'boolean') throw new TypeError('Routing route constraint requires a callback and Boolean cost-homogeneity flag.');
    this.operations.push({ type: 'addRouteConstraint', evaluator: this.routeEvaluators.length, costsAreHomogeneousAcrossVehicles });
    this.routeEvaluators.push(evaluator);
  }

  async getRouteCost(route: readonly number[], options: RoutingDomainOptions = {}): Promise<bigint | null> {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.routeCostQuery = route.map(index => toIndex(index, 'Routing route index', this.manager.getNumberOfIndices() - 1));
    const result = await this.inspectNative(prepared, options);
    if (result.routeCost === undefined) throw new Error('Native Routing executor did not return route cost.');
    return result.routeCost;
  }

  /** Return the first native pickup/delivery counterpart accepted by the synchronous predicate. */
  async getFirstMatchingPickupDeliverySibling(index: number, predicate: (index: number) => boolean,
      options: RoutingDomainOptions = {}): Promise<number | null> {
    if (typeof predicate !== 'function') throw new TypeError('Routing sibling lookup requires a predicate.');
    const callbacks = [...this.routeEvaluators];
    const evaluator = callbacks.length;
    callbacks.push(indices => {
      if (indices.length !== 1) throw new Error('Invalid Routing sibling predicate payload.');
      const matches = synchronousCallbackResult(predicate(indices[0]), 'Routing sibling predicates must return synchronously.');
      if (typeof matches !== 'boolean') throw new TypeError('Routing sibling predicate must return a Boolean synchronously.');
      return matches ? 1n : 0n;
    });
    const result = await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_FIRST_MATCHING_PICKUP_DELIVERY_SIBLING, {
      index: BigInt(toIndex(index, 'Routing pickup/delivery index', this.manager.getNumberOfIndices() - this.vehicles() - 1)),
      predicateEvaluator: evaluator,
    }, options, callbacks);
    return result.value === -1n ? null : toIndex(result.value!, 'Native Routing sibling index', this.manager.getNumberOfIndices() - 1);
  }

  private async inspectPickupDelivery(index: number, options: RoutingDomainOptions) {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.pickupDeliveryInspectionIndex = toIndex(index, 'Routing pickup/delivery index', this.manager.getNumberOfIndices() - this.vehicles() - 1);
    const data = (await this.inspectNative(prepared, options)).pickupDeliveryInspection;
    if (!data) throw new Error('Native Routing executor did not return pickup/delivery inspection.');
    return data;
  }
  async getPickupPosition(index: number, options: RoutingDomainOptions = {}): Promise<RoutingPickupDeliveryPosition | null> { return (await this.inspectPickupDelivery(index, options)).pickup ?? null; }
  async getDeliveryPosition(index: number, options: RoutingDomainOptions = {}): Promise<RoutingPickupDeliveryPosition | null> { return (await this.inspectPickupDelivery(index, options)).delivery ?? null; }
  async isPickup(index: number, options: RoutingDomainOptions = {}): Promise<boolean> { return (await this.inspectPickupDelivery(index, options)).isPickup; }
  async isDelivery(index: number, options: RoutingDomainOptions = {}): Promise<boolean> { return (await this.inspectPickupDelivery(index, options)).isDelivery; }

  async inspectBreaks(dimensionName: string, vehicle: number, options: RoutingDomainOptions = {}): Promise<RoutingBreakConfiguration> {
    this.getDimensionOrDie(dimensionName);
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.breakInspection = { dimensionName, vehicle: toIndex(vehicle, 'Routing break vehicle', this.vehicles() - 1) };
    const data = (await this.inspectNative(prepared, options)).breakConfiguration;
    if (!data) throw new Error('Native Routing executor did not return break configuration.');
    return { ...data, intervals: data.intervals.map(index => createBreakInterval(this, this.breakIntervals[toIndex(index, 'Routing break interval', this.breakIntervals.length - 1)])) };
  }

  async applyLocksToAllVehicles(routes: readonly (readonly number[])[], closeRoutes: boolean,
      options: RoutingDomainOptions = {}): Promise<boolean> {
    this.routeLocks = { routes: routes.map((route, vehicle) => route.map((index, position) =>
      toIndex(index, `Routing lock ${vehicle} index ${position}`, this.manager.getNumberOfIndices() - 1))), closeRoutes };
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.inspectPreAssignment = true;
    const result = await this.inspectNative(prepared, options);
    if (result.locksApplied === undefined) throw new Error('Native Routing executor did not report lock application.');
    return result.locksApplied;
  }

  async inspectPreAssignment(options: RoutingDomainOptions = {}): Promise<RoutingPreAssignment> {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.inspectPreAssignment = true;
    const data = (await this.inspectNative(prepared, options)).preAssignment;
    if (!data) throw new Error('Native Routing executor did not return preassignment data.');
    return { nextValues: new Map(Object.entries(data).map(([index, next]) => [Number(index), next])) };
  }

  /** Restore routes with native feasibility checks; infeasible routes return null.
   * ignoreInactiveIndices skips nodes forced inactive by the native model. It
   * does not allow omitting mandatory nodes. Pass executor options and await.
   */
  async readAssignmentFromRoutes(
    routes: number[][], ignoreInactiveIndices: boolean, options: RoutingSolveOptions = {},
  ): Promise<Assignment | null> {
    // Native restoration checks constraints, omitted mandatory nodes and all
    // dimension feasibility; a JS route snapshot cannot establish those facts.
    const { executor: _executor, onEvent: _event, signal: _signal, trackUncheckedNeighbors: _unchecked, ...parameters } = options;
    return (await this.solveWithExecutor(parameters, options, {
      routes: routes.map((route, vehicle) => route.map((index, position) =>
        toIndex(index, `Routing route ${vehicle} index ${position}`, this.manager.getNumberOfIndices() - 1))),
      ignoreInactiveIndices,
    }, true)).assignment;
  }

  setVisitType(index: number, type: number, policy: VisitTypePolicy): void {
    // Terminal indices cannot be finalized safely by the native visit-type metadata code.
    const node = toIndex(index, 'Routing visit-type index', this.manager.getNumberOfIndices() - this.vehicles() - 1);
    const kind = toInt64(type, 'Routing visit type');
    if (kind < -1n || kind >= BigInt(INT32_MAX)) throw new RangeError('Routing visit type must be -1 or a nonnegative int32 below INT32_MAX.');
    const value = toIndex(policy, 'Routing visit-type policy', VisitTypePolicy.TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED);
    this.operations.push({ type: 'setVisitType', index: node, visitType: Number(kind), policy: value });
    this.visitTypes.set(node, { type: Number(kind), policy: value });
    this.numberOfVisitTypes = Math.max(this.numberOfVisitTypes, Number(kind) + 1);
  }

  getVisitType(index: number): number {
    return this.visitTypes.get(toIndex(index, 'Routing visit-type index', this.manager.getNumberOfIndices() - 1))?.type ?? -1;
  }

  getVisitTypePolicy(index: number): VisitTypePolicy {
    return this.visitTypes.get(toIndex(index, 'Routing visit-type index', this.manager.getNumberOfIndices() - 1))?.policy ?? VisitTypePolicy.TYPE_ADDED_TO_VEHICLE;
  }

  getNumberOfVisitTypes(): number { return this.numberOfVisitTypes; }

  private visitTypeIndex(type: number): number {
    return toIndex(type, 'Routing visit type', this.numberOfVisitTypes - 1);
  }

  getSingleNodesOfType(type: number, options: RoutingDomainOptions = {}): Promise<number[]> {
    return this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SINGLE_NODES_OF_TYPE,
      { vehicleOrClass: this.visitTypeIndex(type) }, options).then(result => result.indices);
  }

  getPairIndicesOfType(type: number, options: RoutingDomainOptions = {}): Promise<number[]> {
    return this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_PAIR_INDICES_OF_TYPE,
      { vehicleOrClass: this.visitTypeIndex(type) }, options).then(result => result.indices);
  }

  private addTypeIncompatibility(type1: number, type2: number,
    operation: 'addHardTypeIncompatibility' | 'addTemporalTypeIncompatibility',
    incompatibilities: Map<number, Set<number>>): void {
    const first = this.visitTypeIndex(type1), second = this.visitTypeIndex(type2);
    this.operations.push({ type: operation, type1: first, type2: second });
    for (const [type, other] of [[first, second], [second, first]]) {
      const incompatible = incompatibilities.get(type) ?? new Set<number>();
      incompatible.add(other);
      incompatibilities.set(type, incompatible);
    }
  }

  addHardTypeIncompatibility(type1: number, type2: number): void {
    this.addTypeIncompatibility(type1, type2, 'addHardTypeIncompatibility', this.hardTypeIncompatibilities);
  }

  getHardTypeIncompatibilitiesOfType(type: number): number[] {
    return [...(this.hardTypeIncompatibilities.get(this.visitTypeIndex(type)) ?? [])].sort((a, b) => a - b);
  }

  hasHardTypeIncompatibilities(): boolean { return this.hardTypeIncompatibilities.size > 0; }

  /** Forbid simultaneous presence; types may share a route after removal. */
  addTemporalTypeIncompatibility(type1: number, type2: number): void {
    this.addTypeIncompatibility(type1, type2, 'addTemporalTypeIncompatibility', this.temporalTypeIncompatibilities);
  }

  getTemporalTypeIncompatibilitiesOfType(type: number): number[] {
    return [...(this.temporalTypeIncompatibilities.get(this.visitTypeIndex(type)) ?? [])].sort((a, b) => a - b);
  }

  hasTemporalTypeIncompatibilities(): boolean { return this.temporalTypeIncompatibilities.size > 0; }

  private addTypeRequirement(kind: RoutingTypeRequirementKind, dependentType: number, requiredTypeAlternatives: readonly number[]): void {
    const dependent = this.visitTypeIndex(dependentType);
    const alternatives = [...new Set(Array.from(requiredTypeAlternatives, type => this.visitTypeIndex(type)))].sort((a, b) => a - b);
    this.operations.push({ type: 'addTypeRequirement', kind, dependentType: dependent, requiredTypeAlternatives: alternatives });
    // Native empty alternatives disable matching visits, but are absent from
    // its query lists and requirement flags.
    if (alternatives.length === 0) return;
    const requirements = this.typeRequirements[kind].get(dependent) ?? [];
    requirements.push(alternatives);
    this.typeRequirements[kind].set(dependent, requirements);
  }

  private getTypeRequirements(kind: RoutingTypeRequirementKind, type: number): number[][] {
    return (this.typeRequirements[kind].get(this.visitTypeIndex(type)) ?? []).map(alternatives => [...alternatives]);
  }

  /** Each call requires at least one alternative on the same route. */
  addSameVehicleRequiredTypeAlternatives(dependentType: number, alternatives: readonly number[]): void {
    this.addTypeRequirement(RoutingTypeRequirementKind.SAME_VEHICLE, dependentType, alternatives);
  }

  addRequiredTypeAlternativesWhenAddingType(dependentType: number, alternatives: readonly number[]): void {
    this.addTypeRequirement(RoutingTypeRequirementKind.WHEN_ADDING, dependentType, alternatives);
  }

  addRequiredTypeAlternativesWhenRemovingType(dependentType: number, alternatives: readonly number[]): void {
    this.addTypeRequirement(RoutingTypeRequirementKind.WHEN_REMOVING, dependentType, alternatives);
  }

  getSameVehicleRequiredTypeAlternativesOfType(type: number): number[][] {
    return this.getTypeRequirements(RoutingTypeRequirementKind.SAME_VEHICLE, type);
  }

  getRequiredTypeAlternativesWhenAddingType(type: number): number[][] {
    return this.getTypeRequirements(RoutingTypeRequirementKind.WHEN_ADDING, type);
  }

  getRequiredTypeAlternativesWhenRemovingType(type: number): number[][] {
    return this.getTypeRequirements(RoutingTypeRequirementKind.WHEN_REMOVING, type);
  }

  hasSameVehicleTypeRequirements(): boolean { return this.typeRequirements[RoutingTypeRequirementKind.SAME_VEHICLE].size > 0; }

  hasTemporalTypeRequirements(): boolean {
    return this.typeRequirements[RoutingTypeRequirementKind.WHEN_ADDING].size > 0
      || this.typeRequirements[RoutingTypeRequirementKind.WHEN_REMOVING].size > 0;
  }

  hasTypeRegulations(): boolean {
    return this.hasHardTypeIncompatibilities() || this.hasTemporalTypeIncompatibilities()
      || this.hasSameVehicleTypeRequirements() || this.hasTemporalTypeRequirements();
  }

  addPickupAndDelivery(pickup: number, delivery: number): number {
    const maximum = this.manager.getNumberOfIndices() - this.vehicles() - 1;
    this.operations.push({ type: 'addPickupAndDelivery',
      pickup: toIndex(pickup, 'Routing pickup index', maximum),
      delivery: toIndex(delivery, 'Routing delivery index', maximum) });
    return this.pickupDeliveryPairs.push({ pickups: 1, deliveries: 1 }) - 1;
  }

  addPickupAndDeliverySets(pickupDisjunction: number, deliveryDisjunction: number): number {
    pickupDisjunction = toIndex(pickupDisjunction, 'Routing pickup disjunction', this.disjunctions.length - 1);
    deliveryDisjunction = toIndex(deliveryDisjunction, 'Routing delivery disjunction', this.disjunctions.length - 1);
    const pickups = this.disjunction(pickupDisjunction).size;
    const deliveries = this.disjunction(deliveryDisjunction).size;
    this.operations.push({ type: 'addPickupAndDeliverySets', pickupDisjunction, deliveryDisjunction });
    return this.pickupDeliveryPairs.push({ pickups, deliveries }) - 1;
  }

  addEnterSearchCallback(callback: RoutingSearchEntryCallback): void {
    if (typeof callback !== 'function') throw new TypeError('Routing search-entry callback must be a function.');
    this.enterSearchCallbacks.push(callback);
  }

  addAtSolutionCallback(callback: RoutingSolutionCallback, trackUncheckedNeighbors = false): void {
    this.atSolutionCallbacks.push({ callback, trackUncheckedNeighbors });
  }

  /** Add native linear or Boolean constraints, validating the whole batch before recording it. */
  addConstraints(...constraints: RoutingConstraint[]): void {
    const operations = constraints.map(constraint => this.solverConstraintOperation(constraint));
    this.operations.push(...operations);
  }

  /** An editable copy of the model parameter overrides submitted to native OR-Tools. */
  getModelParameters(): RoutingModelParameters { return structuredClone(this.parameters ?? {}); }

  addVariableMinimizedByFinalizer(variable: RoutingFinalizerVariable): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_MINIMIZE);
  }

  addVariableMaximizedByFinalizer(variable: RoutingFinalizerVariable): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_MAXIMIZE);
  }

  addWeightedVariableMinimizedByFinalizer(variable: RoutingFinalizerVariable, weight: IntValue): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_MINIMIZE, 0n, weight);
  }

  addWeightedVariableMaximizedByFinalizer(variable: RoutingFinalizerVariable, weight: IntValue): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_MAXIMIZE, 0n, weight);
  }

  addVariableTargetToFinalizer(variable: RoutingFinalizerVariable, target: IntValue): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_TARGET, target);
  }

  addWeightedVariableTargetToFinalizer(variable: RoutingFinalizerVariable, target: IntValue, weight: IntValue): void {
    this.addFinalizer(variable, RoutingFinalizerKind.ROUTING_FINALIZER_TARGET, target, weight);
  }

  private variableReference(variable: RoutingFinalizerVariable): RoutingVariableReference {
    let variableKind: RoutingVariableKind, dimensionName = '', index: number;
    const maximum = this.manager.getNumberOfIndices() - 1;
    if (typeof variable === 'number') {
      variableKind = RoutingVariableKind.ROUTING_VARIABLE_NEXT;
      index = toIndex(variable, 'Routing finalizer successor index', maximum - this.vehicles());
    } else {
      if (!variable || variable.model !== this) throw new Error('Variable belongs to a different Routing model.');
      variableKind = routingVariableKind(variable.kind);
      const includesEnds = variable.kind === 'routingCumulVar' || variable.kind === 'routingVehicleVar';
      const maximumVariableIndex = variable.kind === 'routingExpressionVar' ? this.integerVariablesCount - 1 : variable.kind === 'routingBoolVar' ? this.booleanVariablesCount - 1 : (variable.kind === 'routingActiveVehicleVar' || variable.kind === 'routingVehicleRouteConsideredVar' || variable.kind === 'routingResourceVar') ? this.vehicles() - 1 : maximum - (includesEnds ? 0 : this.vehicles());
      index = toIndex(variable.index, 'Routing variable index', maximumVariableIndex);
      if (variable.kind === 'routingCumulVar' || variable.kind === 'routingSlackVar'
        || variable.kind === 'routingTransitVar' || variable.kind === 'routingFixedTransitVar') {
        dimensionName = variable.dimensionName;
        this.getDimensionOrDie(dimensionName);
      }
    }
    return { kind: variableKind, dimensionName, index,
      ...(typeof variable !== 'number' && variable.kind === 'routingResourceVar' ? { resourceGroup: this.getResourceGroup(variable.resourceGroup).index } : {}) };
  }

  private addFinalizer(variable: RoutingFinalizerVariable, kind: RoutingFinalizerKind,
    target: IntValue = 0n, weight?: IntValue): void {
    const reference = this.variableReference(variable);
    const exactTarget = toInt64(target, 'Routing finalizer target');
    const exactWeight = weight === undefined ? undefined : toInt64(weight, 'Routing finalizer weight');
    this.operations.push({ type: 'addFinalizer', variableKind: reference.kind, dimensionName: reference.dimensionName, index: reference.index, ...(reference.resourceGroup === undefined ? {} : { resourceGroup: reference.resourceGroup }), kind, target: exactTarget,
      ...(exactWeight === undefined ? {} : { weight: exactWeight }) });
  }

  /** Fix a successor routing index. End indices have no successor variable. */
  setNextValue(index: number, successor: number): void {
    this.setNextValues(index, [successor]);
  }

  /** Intersect a successor domain; omitted successors are forbidden.
   * Values are routing indices, including ends. Self means an optional node is
   * unperformed. Empty or conflicting domains produce no solution.
   */
  setNextValues(index: number, successors: readonly number[]): void {
    const maximum = this.manager.getNumberOfIndices() - 1;
    const routingIndex = toIndex(index, 'Routing successor variable index', maximum - this.vehicles());
    const values = Array.from(successors, value => toIndex(value, 'Routing successor value', maximum));
    this.operations.push({ type: 'setNextValues', index: routingIndex, values });
  }

  nextVar(index: number): number {
    return index;
  }

  nextVarHandle(index: number): RoutingNextVar {
    const variable = { kind: 'routingNextVar', model: this,
      index: toIndex(index, 'Routing successor index', this.manager.getNumberOfIndices() - this.vehicles() - 1) } as const;
    return decorateVariable(variable);
  }

  activeVar(index: number): RoutingActiveVar {
    const variable = { kind: 'routingActiveVar', model: this,
      index: toIndex(index, 'Routing active index', this.manager.getNumberOfIndices() - this.vehicles() - 1) } as const;
    return decorateVariable(variable);
  }

  /** Native activity uses vehicle IDs and is zero for empty routes, even when they incur costs. */
  activeVehicleVar(vehicle: number): RoutingActiveVehicleVar {
    return decorateVariable({ kind: 'routingActiveVehicleVar', model: this,
      index: toIndex(vehicle, 'Routing active vehicle', this.vehicles() - 1) });
  }

  /** Native route consideration includes empty routes marked as used for costs and constraints. */
  vehicleRouteConsideredVar(vehicle: number): RoutingVehicleRouteConsideredVar {
    return decorateVariable({ kind: 'routingVehicleRouteConsideredVar', model: this,
      index: toIndex(vehicle, 'Routing route considered vehicle', this.vehicles() - 1) });
  }

  resourceVar(vehicle: number, group: number | RoutingResourceGroup): RoutingResourceVar {
    const resourceGroup = this.getResourceGroup(typeof group === 'number' ? group : group.index);
    if (typeof group !== 'number' && group !== resourceGroup) throw new Error('Routing resource group belongs to another model.');
    return decorateVariable({ kind: 'routingResourceVar', model: this,
      index: toIndex(vehicle, 'Routing resource vehicle', this.vehicles() - 1), resourceGroup: resourceGroup.index });
  }

  vehicleVar(index: number): RoutingVehicleVar {
    const variable = { kind: 'routingVehicleVar', model: this,
      index: toIndex(index, 'Routing vehicle index', this.manager.getNumberOfIndices() - 1) } as const;
    return decorateVariable(variable);
  }

  setVariableRange(variable: RoutingFinalizerVariable, lower: IntValue, upper: IntValue): void {
    const reference = this.variableReference(variable);
    const minimum = toInt64(lower), maximum = toInt64(upper);
    if (minimum > maximum) throw new RangeError('Routing variable lower bound exceeds upper bound.');
    this.operations.push({ type: 'modifyDomain', variable: reference, action: RoutingDomainAction.ROUTING_DOMAIN_RANGE,
      lower: minimum, upper: maximum, values: [] });
  }

  setVariableValues(variable: RoutingFinalizerVariable, values: readonly IntValue[]): void {
    const reference = this.variableReference(variable);
    const exact = Array.from(values, value => toInt64(value));
    if (reference.kind === RoutingVariableKind.ROUTING_VARIABLE_ACTIVE) {
      this.operations.push({ type: 'setActiveValues', index: reference.index, values: exact.map(value => toIndex(value, 'Routing active domain value', 1)) });
    } else if (reference.kind === RoutingVariableKind.ROUTING_VARIABLE_VEHICLE) {
      const vehicles = exact.map(value => { if (value < -1n || value >= BigInt(this.vehicles())) throw new RangeError('Routing vehicle domain values must be -1 or a valid vehicle ID.'); return Number(value); });
      this.operations.push({ type: 'setVehicleValues', index: reference.index, values: vehicles });
    } else if (reference.kind === RoutingVariableKind.ROUTING_VARIABLE_NEXT) {
      this.setNextValues(reference.index, exact.map(value => toIndex(value, 'Routing successor value', this.manager.getNumberOfIndices() - 1)));
    } else this.operations.push({ type: 'modifyDomain', variable: reference, action: RoutingDomainAction.ROUTING_DOMAIN_VALUES, lower: 0n, upper: 0n, values: exact });
  }

  removeVariableValues(variable: RoutingFinalizerVariable, values: readonly IntValue[]): void {
    this.operations.push({ type: 'modifyDomain', variable: this.variableReference(variable),
      action: RoutingDomainAction.ROUTING_DOMAIN_REMOVE_VALUES, lower: 0n, upper: 0n, values: Array.from(values, value => toInt64(value)) });
  }

  removeVariableInterval(variable: RoutingFinalizerVariable, lower: IntValue, upper: IntValue): void {
    const reference = this.variableReference(variable), minimum = toInt64(lower), maximum = toInt64(upper);
    if (minimum > maximum) throw new RangeError('Routing removal lower bound exceeds upper bound.');
    this.operations.push({ type: 'modifyDomain', variable: reference,
      action: RoutingDomainAction.ROUTING_DOMAIN_REMOVE_INTERVAL, lower: minimum, upper: maximum, values: [] });
  }

  async inspectVariableDomain(variable: RoutingFinalizerVariable, options: RoutingDomainOptions = {}, containsValue?: IntValue): Promise<RoutingVariableDomain> {
    const reference = this.variableReference(variable);
    const probe = containsValue === undefined ? undefined : toInt64(containsValue);
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.domainQueries = [{ variable: reference, ...(probe === undefined ? {} : { containsValue: probe }) }];
    const response = await this.inspectNative(prepared, options);
    const result = response.domainResults?.[0];
    if (!result || (probe !== undefined && result.contains === undefined)) throw new Error('Routing executor returned no native variable domain or membership answer.');
    return result;
  }

  product(left: RoutingLinearOperand, right: RoutingLinearOperand): RoutingExpressionVar { return this.integerExpression(1, [left, right]); }
  abs(value: RoutingLinearOperand): RoutingExpressionVar { return this.integerExpression(2, [value]); }
  min(...values: RoutingLinearOperand[]): RoutingExpressionVar { return this.integerExpression(3, values); }
  max(...values: RoutingLinearOperand[]): RoutingExpressionVar { return this.integerExpression(4, values); }

  private integerExpression(kind: number, values: RoutingLinearOperand[]): RoutingExpressionVar {
    if (!values.length) throw new RangeError('Routing minimum/maximum requires at least one operand.');
    const operands = values.map(value => this.linearExpression(RoutingLinearExpr.from(value)));
    const index = this.integerVariablesCount++;
    this.operations.push({ type: 'addIntegerExpression', index, kind, operands });
    return decorateVariable({ kind: 'routingExpressionVar', model: this, index });
  }

  reify(predicate: RoutingBooleanOperand): RoutingBoolVar {
    const expression = this.booleanExpression(RoutingBoolExpr.from(predicate));
    const index = this.booleanVariablesCount++;
    this.operations.push({ type: 'addBooleanVariable', index, expression });
    return decorateVariable({ kind: 'routingBoolVar', model: this, index });
  }

  private booleanExpression(expression: RoutingBoolExpr): RoutingBooleanExpressionData {
    const node = expression.node;
    if (node.kind === 'constant') return { kind: 'constant', value: node.value };
    if (node.kind === 'variable') return { kind: 'variable', variable: this.variableReference(node.variable) };
    if (node.kind === 'comparison') {
      const comparison = node.comparison;
      if (comparison.conditions?.length) throw new TypeError('Routing Boolean predicates must be unconditional linear comparisons.');
      const kind = { eq: 1, ne: 2, le: 3, ge: 4, lt: 5, gt: 6 }[comparison.comparison];
      if (!kind) throw new Error('Unsupported Routing comparison.');
      return { kind: 'comparison', comparison: { left: this.linearExpression(comparison.left), right: this.linearExpression(comparison.right), comparison: kind } };
    }
    return { kind: node.kind, operands: node.operands.map(operand => this.booleanExpression(operand)) };
  }

  private linearExpression(expression: RoutingLinearExpr): RoutingLinearExpression {
    if (!(expression instanceof RoutingLinearExpr)) throw new TypeError('Expected a Routing linear expression.');
    return { terms: expression.terms.map(term => ({ variable: this.variableReference(term.variable), coefficient: toInt64(term.coefficient) })), offset: toInt64(expression.offset) };
  }

  private solverConstraintOperation(constraint: unknown): RoutingModelOperation {
    if (constraint instanceof RoutingBoolExpr || typeof constraint === 'boolean' ||
        (constraint && typeof constraint === 'object' && 'kind' in constraint &&
          ['routingBoolVar', 'routingActiveVar', 'routingActiveVehicleVar', 'routingVehicleRouteConsideredVar'].includes(String(constraint.kind)))) return { type: 'addBooleanConstraint', expression: this.booleanExpression(RoutingBoolExpr.from(constraint as RoutingBooleanOperand)) };
    if (constraint && typeof constraint === 'object' && (constraint as RoutingLinearConstraint).type === 'routingLinearConstraint') {
      const linear = constraint as RoutingLinearConstraint;
      const encodeComparison = (value: RoutingLinearConstraint): RoutingLinearComparison => {
        if (!value || value.type !== 'routingLinearConstraint') throw new TypeError('Expected a Routing linear comparison.');
        const comparison = { eq: 1, ne: 2, le: 3, ge: 4, lt: 5, gt: 6 }[value.comparison];
        if (!comparison) throw new Error('Unsupported Routing comparison.');
        return { left: this.linearExpression(value.left), right: this.linearExpression(value.right), comparison };
      };
      const conditions: RoutingLinearComparison[] = [], booleanConditions: RoutingBooleanExpressionData[] = [];
      for (const condition of linear.conditions ?? []) {
        const predicate = RoutingBoolExpr.from(condition);
        if (predicate.node.kind === 'comparison') conditions.push(encodeComparison(predicate.node.comparison));
        else booleanConditions.push(this.booleanExpression(predicate));
      }
      return { type: 'addLinearConstraint', ...encodeComparison(linear), ...(conditions.length ? { conditions } : {}),
        ...(booleanConditions.length ? { booleanConditions } : {}) };
    }
    throw new Error('RoutingModel.addConstraints: unsupported constraint.');
  }

  async getArcCostForVehicle(fromIndex: number, toIndexValue: number, vehicle: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    const maximum = this.manager.getNumberOfIndices() - 1;
    const from = toIndex(fromIndex, 'Routing from index', maximum), to = toIndex(toIndexValue, 'Routing to index', maximum);
    if (!Number.isInteger(vehicle) || vehicle < -1 || vehicle >= this.vehicles()) throw new RangeError('Invalid Routing vehicle.');
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.arcCostQueries = [{ fromIndex: BigInt(from), toIndex: BigInt(to), vehicle }];
    const response = await this.inspectNative(prepared, options);
    if (response.arcCosts?.[0] === undefined) throw new Error('Routing executor returned no native arc cost.');
    return response.arcCosts[0];
  }

  async getVehicleClassIndexOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_CLASS,
      { vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.vehicles() - 1) }, options)).value!);
  }

  async getVehicleClassesCount(options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_CLASSES_COUNT, {}, options)).value!);
  }

  async getVehicleOfClass(vehicleClass: number, options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_OF_CLASS,
      { vehicleOrClass: toIndex(vehicleClass, 'Routing vehicle class', INT32_MAX) }, options)).value!);
  }

  async getVisitTypeComponents(options: RoutingDomainOptions = {}): Promise<number[][]> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VISIT_TYPE_COMPONENTS, {}, options)).groups;
  }

  async getTopologicallySortedVisitTypes(options: RoutingDomainOptions = {}): Promise<number[][]> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SORTED_VISIT_TYPES, {}, options)).groups;
  }

  async getSameVehicleIndicesOfIndex(index: number, options: RoutingDomainOptions = {}): Promise<number[]> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SAME_VEHICLE_INDICES,
      { index: BigInt(toIndex(index, 'Routing same-vehicle index', this.manager.getNumberOfIndices() - this.vehicles() - 1)) }, options)).indices;
  }

  async getVehiclesOfSameClass(startEndIndex: number, options: RoutingDomainOptions = {}): Promise<number[]> {
    const index = toIndex(startEndIndex, 'Routing start/end index', this.manager.getNumberOfIndices() - 1);
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLES_OF_SAME_CLASS, { index: BigInt(index) }, options)).indices;
  }

  async getSameVehicleClassArcs(fromIndex: number, toIndexValue: number, options: RoutingDomainOptions = {}): Promise<Array<[number, number]>> {
    const maximum = this.manager.getNumberOfIndices() - 1;
    const result = await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SAME_VEHICLE_CLASS_ARCS,
      { index: BigInt(toIndex(fromIndex, 'Routing from index', maximum)), otherIndex: BigInt(toIndex(toIndexValue, 'Routing to index', maximum)) }, options);
    return result.groups as Array<[number, number]>;
  }

  async getTopologicallySortedNodePrecedences(options: RoutingDomainOptions = {}): Promise<number[][][]> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SORTED_NODE_PRECEDENCES, {}, options)).precedenceGroups;
  }

  async getCostClassIndexOfVehicle(vehicle: number, options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_COST_CLASS,
      { vehicleOrClass: toIndex(vehicle, 'Routing vehicle', this.vehicles() - 1) }, options)).value!);
  }

  async hasVehicleWithCostClassIndex(costClass: number, options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_HAS_VEHICLE_COST_CLASS,
      { vehicleOrClass: toIndex(costClass, 'Routing cost class', INT32_MAX) }, options)).value === 1n;
  }

  async getCostClassesCount(options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_COST_CLASSES_COUNT, {}, options)).value!);
  }

  async getNonZeroCostClassesCount(options: RoutingDomainOptions = {}): Promise<number> {
    return Number((await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_NONZERO_COST_CLASSES_COUNT, {}, options)).value!);
  }

  async costsAreHomogeneousAcrossVehicles(options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_HOMOGENEOUS_COSTS, {}, options)).value === 1n;
  }

  /** Whether native Routing detects a vehicle/node matching problem. */
  async isMatchingModel(options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_IS_MATCHING_MODEL, {}, options)).value === 1n;
  }

  /** Native route coupling for the supplied search parameters and model configuration. */
  async areRoutesInterdependent(parameters: RoutingSearchParameters = {}, options: RoutingDomainOptions = {}): Promise<boolean> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_ROUTES_INTERDEPENDENT,
      {}, options, this.routeEvaluators, parameters)).value === 1n;
  }

  /** Native construction-time arc preference, using the selected primary dimension. */
  async arcIsMoreConstrainedThanArc(from: number, to1: number, to2: number, options: RoutingDomainOptions = {}): Promise<boolean> {
    const maximum = this.manager.getNumberOfIndices() - 1;
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_ARC_MORE_CONSTRAINED, {
      index: BigInt(toIndex(from, 'Routing arc source', maximum - this.vehicles())),
      otherIndex: BigInt(toIndex(to1, 'Routing first destination', maximum)),
      thirdIndex: BigInt(toIndex(to2, 'Routing second destination', maximum)),
    }, options)).value === 1n;
  }

  async getArcCostForClass(fromIndex: number, toIndexValue: number, costClass: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    const maximum = this.manager.getNumberOfIndices() - 1;
    const index = toIndex(fromIndex, 'Routing from index', maximum), otherIndex = toIndex(toIndexValue, 'Routing to index', maximum);
    if (this.isEnd(index) && index !== otherIndex) throw new RangeError('A Routing end index cannot start an arc.');
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_ARC_COST_FOR_CLASS,
      { index: BigInt(index), otherIndex: BigInt(otherIndex), vehicleOrClass: toIndex(costClass, 'Routing cost class', INT32_MAX) }, options)).value!;
  }

  async unperformedPenalty(index: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_UNPERFORMED_PENALTY,
      { index: BigInt(toIndex(index, 'Routing penalty index', this.manager.getNumberOfIndices() - this.vehicles() - 1)) }, options)).value!;
  }

  async unperformedPenaltyOrValue(defaultValue: IntValue, index: number, options: RoutingDomainOptions = {}): Promise<bigint> {
    return (await this.inspectModel(RoutingModelQueryKind.ROUTING_MODEL_QUERY_UNPERFORMED_PENALTY_OR_VALUE,
      { index: BigInt(toIndex(index, 'Routing penalty index', this.manager.getNumberOfIndices() - this.vehicles() - 1)),
        defaultValue: toInt64(defaultValue, 'Routing default penalty') }, options)).value!;
  }

  getUnaryDimensions(options: RoutingDomainOptions = {}): Promise<RoutingDimension[]> {
    return this.classifiedDimensions(RoutingModelQueryKind.ROUTING_MODEL_QUERY_UNARY_DIMENSIONS, options);
  }

  getDimensionsWithSoftOrSpanCosts(options: RoutingDomainOptions = {}): Promise<RoutingDimension[]> {
    return this.classifiedDimensions(RoutingModelQueryKind.ROUTING_MODEL_QUERY_SOFT_OR_SPAN_DIMENSIONS, options);
  }

  private async classifiedDimensions(kind: RoutingModelQuery['kind'], options: RoutingDomainOptions): Promise<RoutingDimension[]> {
    const dimensions = this.getDimensions();
    const result = await this.inspectModel(kind, {}, options);
    return result.dimensionIndices.map(index => dimensions[toIndex(index, 'Native Routing dimension index', dimensions.length - 1)]);
  }

  private async inspectModel(kind: RoutingModelQuery['kind'], values: Partial<RoutingModelQuery>, options: RoutingDomainOptions, callbacks = this.routeEvaluators, parameters: RoutingSearchParameters = {}) {
    const prepared = this.createRequest(parameters, options, undefined, false, callbacks);
    const { request } = prepared;
    request.modelQuery = { kind, index: 0n, otherIndex: 0n, vehicleOrClass: 0, defaultValue: 0n, ...values };
    const result = (await this.inspectNative(prepared, options)).modelInspection;
    if (!result || ((kind < RoutingModelQueryKind.ROUTING_MODEL_QUERY_UNARY_DIMENSIONS ||
      (kind >= RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_CLASS && kind <= RoutingModelQueryKind.ROUTING_MODEL_QUERY_VEHICLE_OF_CLASS)
      || kind === RoutingModelQueryKind.ROUTING_MODEL_QUERY_DISJUNCTION_MAX_CARDINALITY
      || kind === RoutingModelQueryKind.ROUTING_MODEL_QUERY_HAS_MAX_CARDINALITY_CONSTRAINED_DISJUNCTIONS
      || kind >= RoutingModelQueryKind.ROUTING_MODEL_QUERY_SINGLETON_NODES) && result.value === undefined))
      throw new Error('Native Routing executor did not return model inspection.');
    return result;
  }

  async inspectCumulSoftBound(dimensionName: string, index: number, lower: boolean, options: RoutingDomainOptions = {}): Promise<bigint> {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.domainQueries = [{ variable: this.variableReference(this.getDimensionOrDie(dimensionName).cumulVar(index)), softLowerBound: lower }];
    const response = await this.inspectNative(prepared, options);
    const bound = response.domainResults?.[0]?.softBound;
    if (bound === undefined) throw new Error('Routing executor returned no native soft bound.');
    return bound;
  }

  async inspectResourceGroup(group: RoutingResourceGroup, options: RoutingDomainOptions = {}): Promise<RoutingResourceGroupInspection> {
    if (this.getResourceGroup(group.index) !== group) throw new Error('Routing resource group belongs to another model.');
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.resourceInspectionGroup = group.index;
    const data = (await this.inspectNative(prepared, options)).resourceInspection;
    if (!data) throw new Error('Native Routing executor did not return resource inspection data.');
    return { affectedDimensions: [...data.affectedDimensions],
      resources: data.resources.map(resource => ({ classIndex: resource.classIndex, dimensionAttributes: resource.dimensionAttributes.map(resourceDimensionAttributes) })),
      classes: data.classes.map(resourceClass => ({ resourceIndices: [...resourceClass.resourceIndices], dimensionAttributes: resourceClass.dimensionAttributes.map(resourceDimensionAttributes) })),
    };
  }

  /** Select variables for native GENERIC_TABU_SEARCH; null restores its default. */
  setTabuVars(variables: readonly RoutingIntVar[] | null): void {
    this.operations.push({ type: 'setTabuVars', variables: variables === null ? null
      : variables.map(variable => {
        if (typeof variable === 'number') throw new TypeError('Routing tabu selection requires variable handles.');
        return this.variableReference(variable);
      }) });
  }

  /** Points are in routing-index order, including duplicate starts and ends. */
  setSweepArranger(points: readonly { x: number; y: number }[]): void {
    if (points.length !== this.manager.getNumberOfIndices()) throw new RangeError('Routing sweep requires one point per routing index.');
    const copied = points.map(({ x, y }) => {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < -2147483648 || x > INT32_MAX || y < -2147483648 || y > INT32_MAX)
        throw new RangeError('Routing sweep coordinates must fit int32.');
      return { x, y };
    });
    this.operations.push({ type: 'setSweepArranger', points: copied });
  }

  addOrderedActivityGroup(disjunctions: readonly number[]): void {
    this.operations.push({ type: 'addOrderedActivityGroup', disjunctions: disjunctions.map(index =>
      toIndex(index, 'Routing ordered-activity disjunction', this.disjunctions.length - 1)) });
  }

  getOrderedActivityGroups(): number[][] {
    return this.operations.flatMap(operation => operation.type === 'addOrderedActivityGroup' && operation.disjunctions.length > 1
      ? [[...operation.disjunctions]] : []);
  }

  addSameActivityGroup(indices: readonly number[]): void {
    this.operations.push({ type: 'addSameActivityGroup', indices: indices.map(index =>
      toIndex(index, 'Routing activity-group index', this.manager.getNumberOfIndices() - this.vehicles() - 1)) });
  }

  async inspectActivityGroups(options: RoutingDomainOptions = {}): Promise<RoutingActivityGroupInspection> {
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.inspectActivityGroups = true;
    const data = (await this.inspectNative(prepared, options)).activityGroups;
    if (!data) throw new Error('Native Routing executor did not return activity groups.');
    return { groups: [...data.groups], members: data.members.map(indices => [...indices]) };
  }

  private async inspectDimension(query: RoutingDimensionQuery, options: RoutingDomainOptions = {}, assignment?: RoutingAssignmentSnapshot): Promise<RoutingDimensionInspection> {
    this.getDimensionOrDie(query.dimensionName);
    const prepared = this.createRequest({}, options);
    const { request } = prepared;
    request.dimensionQuery = query;
    if (assignment) request.initialAssignment = { routes: [], ignoreInactiveIndices: false, snapshot: assignment };
    const result = (await this.inspectNative(prepared, options)).dimensionInspection;
    if (!result || ([0, 1, 4, 5, 7, 8, 9, 11, 12, 13].includes(query.kind) && result.value === undefined))
      throw new Error('Native Routing executor did not return dimension inspection.');
    return result;
  }

  private async inspectNative({ request, resources, callbacks }: PreparedRoutingExecution,
      options: RoutingDomainOptions): Promise<RoutingNativeResult> {
    request.solutionEvents = false;
    const executor = createRoutingExecutor(options.executor);
    return executeSolverJob(executor, { type: 'solve', request, interruptible: false }, {
      onCallback: callbacks.length ? routingRouteCallback(callbacks) : undefined,
      signal: options.signal, onEvent: () => {}, resources, showCloudNotice: !(executor instanceof SolverServerExecutor),
    });
  }

  private addDimensionState(name: string): boolean {
    if (this.dimensions.has(name)) return false;
    this.dimensions.set(name, {
      softSpanUpperBounds: new Map(),
      quadraticCostSoftSpanUpperBounds: new Map(),
    });
    return true;
  }

  private pickupToDeliveryLimitOperations(): RoutingModelOperation[] {
    const operations: RoutingModelOperation[] = [];
    for (const [dimensionName, state] of this.dimensions) {
      for (const [pairIndex, limit] of state.pickupToDeliveryLimits ?? []) {
        const { pickups, deliveries } = this.pickupDeliveryPairs[pairIndex];
        const limits: bigint[] = [];
        for (let pickup = 0; pickup < pickups; ++pickup) {
          for (let delivery = 0; delivery < deliveries; ++delivery) {
            const value = synchronousCallbackResult(limit(pickup, delivery), 'Routing pickup/delivery limit callbacks must return synchronously.');
            limits.push(toInt64(value, 'Routing pickup/delivery limit'));
          }
        }
        operations.push({ type: 'setPickupToDeliveryLimits', dimensionName, pairIndex, limits });
      }
    }
    return operations;
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
        const value = synchronousCallbackResult(callback(from, to), 'Routing transit callbacks must return synchronously.');
        matrix[from * dimension + to] = toInt64(value);
      }
    }
    return matrix;
  }

  private async runAtSolutionCallbacks(event: RoutingSolutionEvent): Promise<void> {
    for (const entry of this.atSolutionCallbacks) {
      if (!event.unchecked || entry.trackUncheckedNeighbors) await entry.callback({ ...event });
    }
  }
}
