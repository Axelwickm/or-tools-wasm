import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import { toIndex, toInt64, type IntValue } from '../int64.js';
import {
  RoutingAddConstantDimensionSchema,
  RoutingAddRouteConstraintSchema, RoutingPickupDeliveryInspectionSchema,
  RoutingAddForbiddenIntervalsSchema,
  RoutingSetSweepArrangerSchema, RoutingOrderedActivityGroupSchema, RoutingSetPiecewiseCostSchema, RoutingDimensionQuerySchema, RoutingDimensionInspectionSchema, RoutingDimensionQueryKind,
  RoutingSetTabuVarsSchema,
  RoutingRouteCostSchema,
  RoutingModelQuerySchema, RoutingModelInspectionSchema, RoutingModelQueryKind,
  RoutingBreakInspectionRequestSchema, RoutingBreakConfigurationSchema,
  RoutingCumulOptimizersSchema,
  RoutingAddPickupAndDeliverySetsSchema,
  RoutingSetPickupToDeliveryLimitsSchema,
  RoutingAddBreakIntervalSchema,
  RoutingSetBreakIntervalsSchema,
  RoutingSetBreakDistanceDurationSchema,
  RoutingBreakAssignmentSchema,
  RoutingAddIntegerExpressionSchema,
  RoutingBooleanExpressionSchema,
  RoutingAddBooleanVariableSchema,
  RoutingAddBooleanConstraintSchema,
  type RoutingBooleanExpression as BridgeBooleanExpression,
  RoutingResourceGroupSchema,
  RoutingResourceInspectionSchema,
  RoutingResourceAssignmentSchema,
  RoutingAddFinalizerSchema,
  RoutingVariableReferenceSchema,
  RoutingModifyDomainSchema,
  RoutingAddLinearConstraintSchema,
  RoutingLinearComparisonSchema,
  RoutingLinearExpressionSchema,
  RoutingDomainQuerySchema,
  RoutingDomainResultSchema,
  RoutingAssignmentVariableSchema,
  RoutingAssignmentSnapshotSchema,
  RoutingRouteLocksSchema,
  RoutingPreAssignmentSchema,
  type RoutingAssignmentSnapshot as BridgeAssignmentSnapshot,
  RoutingDomainAction,
  RoutingFinalizerKind,
  RoutingVariableKind,
  RoutingAddCumulLessOrEqualConstraintSchema,
  RoutingAddNodePrecedenceSchema,
  RoutingSetCumulBoundsSchema,
  RoutingSetCumulSoftBoundSchema,
  RoutingSetMaximumActiveVehiclesSchema,
  RoutingSetFixedVehicleCostSchema,
  RoutingSetPathEnergyCostsSchema,
  RoutingAddSameActivityGroupSchema,
  RoutingActivityGroupsSchema,
  RoutingSetAmortizedVehicleCostsSchema,
  RoutingSetVehicleUsedWhenEmptySchema,
  RoutingAddSoftSameVehicleConstraintSchema,
  RoutingSetPickupDeliveryPolicySchema,
  RoutingSetVisitTypeSchema,
  RoutingAddHardTypeIncompatibilitySchema,
  RoutingAddTemporalTypeIncompatibilitySchema,
  RoutingAddTypeRequirementSchema,
  RoutingTypeRequirementKind,
  RoutingSetSlackBoundsSchema,
  RoutingSetActiveValuesSchema,
  RoutingSetDimensionValueSchema,
  RoutingDimensionValueKind,
  RoutingSetAllowedVehiclesForIndexSchema,
  RoutingSetVehicleValuesSchema,
  RoutingSetNextValuesSchema,
  RoutingAddDimensionSchema,
  RoutingAddDimensionWithVehicleCapacitySchema,
  RoutingAddDimensionWithVehicleTransitsSchema,
  RoutingAddDimensionWithVehicleTransitAndCapacitySchema,
  RoutingAddDependentDimensionSchema,
  RoutingStateDependentMatrixSchema,
  RoutingPiecewiseLinearFunctionSchema,
  RoutingAddDisjunctionSchema,
  RoutingAddMatrixDimensionSchema,
  RoutingAddPickupAndDeliverySchema,
  RoutingAddVehicleEqualityConstraintSchema,
  RoutingAddVectorDimensionSchema,
  RoutingBridgeRequestSchema,
  RoutingSolutionSchema, RoutingSearchStatisticsSchema, RoutingAssignmentAction,
  type RoutingSolution as BridgeRoutingSolution, type RoutingBridgeResponse as BridgeRoutingResponse,
  RoutingBridgeResponseSchema,
  RoutingSolveEventSchema,
  RoutingInitialAssignmentSchema,
  RoutingMatrixSchema,
  RoutingModelOperationSchema,
  RoutingRouteSchema,
  RoutingSetQuadraticCostSoftSpanUpperBoundSchema,
  RoutingSetArcCostEvaluatorOfVehiclesSchema,
  RoutingSetSoftSpanUpperBoundSchema,
  type RoutingModelOperation as BridgeRoutingOperation,
} from '../generated/bridge/routing_pb.js';

export type RoutingDimensionSetting = 'spanUpperBound' | 'spanCost' | 'slackCost' | 'globalSpanCost';
export const routingDimensionValueKinds = {
  spanUpperBound: RoutingDimensionValueKind.SPAN_UPPER_BOUND,
  spanCost: RoutingDimensionValueKind.SPAN_COST,
  slackCost: RoutingDimensionValueKind.SLACK_COST,
  globalSpanCost: RoutingDimensionValueKind.GLOBAL_SPAN_COST,
} as const;

export { RoutingTypeRequirementKind, RoutingFinalizerKind, RoutingVariableKind, RoutingDomainAction, RoutingDimensionQueryKind, RoutingModelQueryKind };

export type RoutingVariableReference = { kind: RoutingVariableKind; dimensionName: string; index: number; resourceGroup?: number };
export type RoutingDomainResult = { min: bigint; max: bigint; size: bigint; bound: boolean; contains?: boolean; softBound?: bigint };
export type RoutingAssignmentVariable = { variable: RoutingVariableReference; min: bigint; max: bigint };
export function routingVariableKey(variable: RoutingVariableReference): string {
  return JSON.stringify([variable.kind, variable.dimensionName, variable.index, variable.resourceGroup ?? 0]);
}
export type RoutingResourceData = { dimensionName: string; startDomain: bigint[]; endDomain: bigint[] };
export type RoutingResourceInspectionData = {
  affectedDimensions: string[];
  resources: Array<{ classIndex: number; dimensionAttributes: RoutingResourceData[] }>;
  classes: Array<{ resourceIndices: number[]; dimensionAttributes: RoutingResourceData[] }>;
};
export type RoutingResourceGroupData = {
  resources: Array<{ dimensionName: string; startDomain: bigint[]; endDomain: bigint[] }>;
  requiredVehicles: number[];
  allowedResources: Array<{ vehicle: number; resources: number[] }>;
};
export type RoutingResourceAssignment = { mins: bigint[]; maxs: bigint[] };
export type RoutingActivityGroupInspection = { groups: number[]; members: number[][] };
export type RoutingStateDependentMatrix = {
  domainStart: bigint; domainEnd: bigint; functions: Array<{ x: bigint[]; y: bigint[] }>;
};

export type RoutingDomainQuery = { variable: RoutingVariableReference; containsValue?: bigint; softLowerBound?: boolean };
export type RoutingLinearExpression = { terms: Array<{ variable: RoutingVariableReference; coefficient: bigint }>; offset: bigint };
export type RoutingLinearComparison = { left: RoutingLinearExpression; right: RoutingLinearExpression; comparison: number };

export type RoutingBooleanExpressionData =
  | { kind: 'constant'; value: boolean }
  | { kind: 'variable'; variable: RoutingVariableReference }
  | { kind: 'comparison'; comparison: RoutingLinearComparison }
  | { kind: 'and' | 'or' | 'not'; operands: RoutingBooleanExpressionData[] };

export type RoutingFinalizerOperation = {
  type: 'addFinalizer'; variableKind: RoutingVariableKind; dimensionName: string; index: number; resourceGroup?: number;
  kind: RoutingFinalizerKind; target: bigint; weight?: bigint;
};

export type RoutingCostSegmentData = { pointX: bigint; pointY: bigint; slope: bigint; otherPointX: bigint };
export type RoutingDimensionQuery = { dimensionName: string; kind: RoutingDimensionQueryKind;
  index: bigint; otherIndex: bigint; vehicleOrClass: number; lower: bigint; upper: bigint;
  pairIndex?: number; pickupAlternativeIndex?: number; deliveryAlternativeIndex?: number };
export type RoutingModelQuery = { kind: RoutingModelQueryKind; index: bigint; otherIndex: bigint; vehicleOrClass: number; defaultValue: bigint; thirdIndex?: bigint; predicateEvaluator?: number };
export type RoutingModelInspection = { value?: bigint; dimensionIndices: number[]; indices: number[]; groups: number[][]; precedenceGroups: number[][][] };
export type RoutingDimensionInspection = { value?: bigint; intervals: Array<{ start: bigint; end: bigint }>;
  hasPiecewiseLinearCost: boolean; costSegments: RoutingCostSegmentData[];
  nodePrecedences: Array<{ first: bigint; second: bigint; offset: bigint; performedConstraint: number }> };

export type RoutingModelOperation =
  | { type: 'ignoreDisjunctionsAlreadyForcedToZero' }
  | { type: 'setTabuVars'; variables: RoutingVariableReference[] | null }
  | { type: 'setSweepArranger'; points: Array<{ x: number; y: number }> }
  | { type: 'addOrderedActivityGroup'; disjunctions: number[] }
  | { type: 'addForbiddenIntervals'; dimensionName: string; index: bigint; intervals: Array<{ start: bigint; end: bigint }> }
  | { type: 'setPiecewiseCost'; dimensionName: string; index: bigint; segments: RoutingCostSegmentData[] }
  | { type: 'addRouteConstraint'; evaluator: number; costsAreHomogeneousAcrossVehicles: boolean }
  | { type: 'setFirstSolutionEvaluator'; transitMatrix: BigInt64Array }
  | { type: 'setPrimaryConstrainedDimension'; dimensionName: string }
  | { type: 'addPickupAndDeliverySets'; pickupDisjunction: number; deliveryDisjunction: number }
  | { type: 'setPickupToDeliveryLimits'; dimensionName: string; pairIndex: number; limits: bigint[] }
  | { type: 'addDependentDimension'; transitMatrices: BigInt64Array[]; unaryTransits?: boolean[];
      dependentMatrices: RoutingStateDependentMatrix[]; baseDimension?: string; slackMax: bigint;
      capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'setPathEnergyCosts'; force: string; distance: string; threshold: bigint; costBelow: bigint; costAbove: bigint; vehicle: number }
  | { type: 'addSameActivityGroup'; indices: number[] }
  | ({ type: 'addBreakInterval' } & RoutingBreakIntervalData)
  | { type: 'setBreakIntervals'; dimensionName: string; intervals: number[]; vehicle: number; preTravel?: bigint[]; postTravel?: bigint[]; preTravelHandle?: number; postTravelHandle?: number }
  | { type: 'setBreakDistanceDuration'; dimensionName: string; vehicle: number; distance: bigint; duration: bigint }
  | { type: 'addIntegerExpression'; index: number; kind: number; operands: RoutingLinearExpression[] }
  | { type: 'addBooleanVariable'; index: number; expression: RoutingBooleanExpressionData }
  | { type: 'addBooleanConstraint'; expression: RoutingBooleanExpressionData }
  | RoutingFinalizerOperation
  | { type: 'modifyDomain'; variable: RoutingVariableReference; action: RoutingDomainAction; lower: bigint; upper: bigint; values: bigint[] }
  | ({ type: 'addLinearConstraint'; booleanConditions?: RoutingBooleanExpressionData[]; conditions?: RoutingLinearComparison[] } & RoutingLinearComparison)
  | { type: 'addTypeRequirement'; kind: RoutingTypeRequirementKind; dependentType: number; requiredTypeAlternatives: number[] }
  | { type: 'setVisitType'; index: number; visitType: number; policy: number }
  | { type: 'addHardTypeIncompatibility'; type1: number; type2: number }
  | { type: 'addTemporalTypeIncompatibility'; type1: number; type2: number }
  | { type: 'addSoftSameVehicleConstraint'; indices: number[]; cost: bigint }
  | { type: 'setPickupDeliveryPolicy'; policy: number; vehicle: number }
  | { type: 'setMaximumActiveVehicles'; maximum: number }
  | { type: 'setFixedVehicleCost'; cost: bigint; vehicle: number }
  | { type: 'setAmortizedVehicleCosts'; linear: bigint; quadratic: bigint; vehicle: number }
  | { type: 'setVehicleUsedWhenEmpty'; isUsed: boolean; vehicle: number }
  | { type: 'setCumulSoftBound'; dimensionName: string; index: number; bound: bigint; coefficient: bigint; lower: boolean }
  | { type: 'setSlackBounds'; dimensionName: string; index: number; lower: bigint; upper: bigint }
  | { type: 'setActiveValues'; index: number; values: number[] }
  | { type: 'setDimensionValue'; dimensionName: string; setting: RoutingDimensionSetting; value: bigint; vehicle?: number }
  | { type: 'setNextValues'; index: number; values: number[] }
  | { type: 'setVehicleValues'; index: number; values: number[] }
  | { type: 'setAllowedVehiclesForIndex'; vehicles: number[]; index: number }
  | { type: 'setCumulBounds'; dimensionName: string; index: number; lower: bigint; upper: bigint }
  | { type: 'addNodePrecedence'; dimensionName: string; first: number; second: number; offset: bigint; performedConstraint?: number }
  | { type: 'setArcCostEvaluatorOfVehicles'; transitMatrix: BigInt64Array; vehicles: number[] }
  | { type: 'addDimension'; unaryTransit?: boolean; transitMatrix: BigInt64Array; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleCapacity'; unaryTransit?: boolean; transitMatrix: BigInt64Array; slackMax: bigint; capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransits'; unaryTransits?: boolean[]; transitMatrices: BigInt64Array[]; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addConstantDimension'; value: bigint; capacity: bigint; slackMax?: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransitAndCapacity'; unaryTransits?: boolean[]; transitMatrices: BigInt64Array[]; slackMax: bigint; capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addVectorDimension'; values: bigint[]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addMatrixDimension'; matrix: bigint[][]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDisjunction'; indices: number[]; penalty?: bigint; maxCardinality?: bigint; penaltyCostBehavior?: number }
  | { type: 'addPickupAndDelivery'; pickup: number; delivery: number }
  | { type: 'addVehicleEqualityConstraint'; left: number; right: number }
  | { type: 'addCumulLessOrEqualConstraint'; dimensionName: string; left: number; right: number }
  | { type: 'setSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number }
  | { type: 'setQuadraticCostSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number };

export { RoutingAssignmentAction };
export type RoutingSearchStatistics = {
  numCpSatCallsInLpScheduling: bigint;
  numGlopCallsInLpScheduling: bigint;
  numMinCostFlowCalls: bigint;
  numCpSatCallsInRouting: bigint;
  numGeneralizedCpSatCallsInRouting: bigint;
  numDecisionsInFirstSolution: bigint | null;
  numRejectsInFirstSolution: bigint | null;
};
export type RoutingWorkflow = {
  assignmentAction?: RoutingAssignmentAction;
  candidateAssignments?: RoutingAssignmentSnapshot[];
  packingDurationSeconds?: number;
  checkSolutionInCp?: boolean;
  callAtSolutionMonitors?: boolean;
};
export type RoutingSolveRequest = RoutingWorkflow & {
  assignmentTransfer?: { nextValues: number[]; vehicleValues: number[] };
  secondaryModel?: RoutingSolveRequest;
  routeCostQuery?: number[];
  modelQuery?: RoutingModelQuery;
  dimensionQuery?: RoutingDimensionQuery;
  searchEntryEvents?: boolean;
  pickupDeliveryInspectionIndex?: number;
  breakInspection?: { dimensionName: string; vehicle: number };
  inspectCumulOptimizers?: boolean;
  routeLocks?: { routes: number[][]; closeRoutes: boolean };
  inspectPreAssignment?: boolean;
  firstSolutionHint?: RoutingAssignmentSnapshot;
  inspectActivityGroups?: boolean;
  resourceInspectionGroup?: number;
  readAssignmentOnly?: boolean;
  domainQueries?: RoutingDomainQuery[];
  arcCostQueries?: Array<{ fromIndex: bigint; toIndex: bigint; vehicle: number }>;
  solutionEvents?: boolean;
  trackUncheckedNeighbors?: boolean;
  numLocations: number;
  numVehicles: number;
  starts: number[];
  ends: number[];
  searchParametersProto: Uint8Array;
  searchParameterFields?: string[];
  modelParametersProto?: Uint8Array;
  modelParameterFields?: string[];
  transitMatrix: BigInt64Array;
  transitMatrixDimension: number;
  operations: RoutingModelOperation[];
  resourceGroups?: RoutingResourceGroupData[];
  dimensionNames: string[];
  initialAssignment?: {
    routes: number[][];
    ignoreInactiveIndices: boolean;
    snapshot?: RoutingAssignmentSnapshot;
  };
};

export type RoutingAssignmentSnapshot = {
  variables: RoutingAssignmentVariable[];
  intervals: RoutingBreakAssignment[];
  objectiveValue?: bigint;
  objectiveMin?: bigint;
  objectiveMax?: bigint;
};

export type RoutingSolveResult = {
  breakAssignments?: RoutingBreakAssignment[];
  status: number;
  objectiveValue: bigint;
  nextValues: number[];
  vehicleValues?: number[];
  starts: number[];
  ends: number[];
  dimensionCumulValues: Record<string, bigint[]>;
  assignmentVariables?: RoutingAssignmentVariable[];
  resourceAssignments?: RoutingResourceAssignment[];
  dimensionCumulMins?: Record<string, bigint[]>;
  dimensionCumulMaxs?: Record<string, bigint[]>;
};

export type RoutingBreakIntervalData = { index: number; startMin: bigint; startMax: bigint; duration: bigint; optional: boolean; name: string };
export type RoutingBreakAssignment = { index: number; performedMin: bigint; performedMax: bigint; startMin?: bigint; startMax?: bigint; endMin?: bigint; endMax?: bigint };

export type RoutingOperation = {
  type: 'solve';
  request: RoutingSolveRequest;
  interruptible: boolean;
};

export type RoutingResult = {
  assignmentSeed?: RoutingAssignmentSnapshot;
  routeCost?: bigint | null;
  modelInspection?: RoutingModelInspection;
  dimensionInspection?: RoutingDimensionInspection;
  collectedSolutions?: RoutingSolveResult[];
  timeLimitReached?: boolean;
  computedLowerBound?: bigint;
  pickupDeliveryInspection?: { pickup?: { pairIndex: number; alternativeIndex: number }; delivery?: { pairIndex: number; alternativeIndex: number }; isPickup: boolean; isDelivery: boolean };
  breakConfiguration?: { hasBreakConstraints: boolean; intervals: number[]; distanceDuration: Array<{ distance: bigint; duration: bigint }>; preTravelEvaluator?: number; postTravelEvaluator?: number };
  assignmentFeasible?: boolean;
  cumulOptimizers?: { globalDimensions: string[]; localDimensions: string[] };
  objectiveLowerBound?: bigint;
  searchStatistics?: RoutingSearchStatistics;
  locksApplied?: boolean;
  preAssignment?: Record<string, number>;
  activityGroups?: RoutingActivityGroupInspection;
  resourceInspection?: RoutingResourceInspectionData;
  domainResults?: RoutingDomainResult[];
  arcCosts?: bigint[];
  type: 'solve';
  automaticFirstSolutionStrategy?: number;
  localSearchProfile?: string;
  status: number;
  solution: RoutingSolveResult | null;
};

export type RoutingSolverEvent = { type: 'searchEntered' } | { type: 'solution'; objectiveValue: bigint; solutionCount: bigint; unchecked: boolean };
export type RoutingExecutor = SolverExecutor<RoutingOperation, RoutingResult, RoutingSolverEvent>;
export type RoutingJob = SolverJob<RoutingResult>;

function bridgeMatrix(values: BigInt64Array | bigint[], dimension: number, routingIndices = true, unary = false) {
  return create(RoutingMatrixSchema, {
    values: [...values],
    dimension,
    routingIndices, unary,
  });
}

function bridgeVariable(variable: RoutingVariableReference) {
  return create(RoutingVariableReferenceSchema, { ...variable, index: BigInt(toIndex(variable.index)) });
}
function bridgeExpression(expression: RoutingLinearExpression) {
  return create(RoutingLinearExpressionSchema, { offset: expression.offset,
    terms: expression.terms.map(term => ({ variable: bridgeVariable(term.variable), coefficient: term.coefficient })) });
}
function decodeVariable(variable: { kind: RoutingVariableKind; dimensionName: string; index: bigint; resourceGroup?: number } | undefined): RoutingVariableReference {
  if (!variable) throw new Error('Routing operation has no variable reference.');
  return { kind: variable.kind, dimensionName: variable.dimensionName, index: toIndex(variable.index),
    ...(variable.kind === RoutingVariableKind.ROUTING_VARIABLE_RESOURCE ? { resourceGroup: variable.resourceGroup ?? 0 } : {}) };
}
function decodeExpression(expression: { offset: bigint; terms: Array<{ variable?: { kind: RoutingVariableKind; dimensionName: string; index: bigint; resourceGroup?: number }; coefficient: bigint }> } | undefined): RoutingLinearExpression {
  if (!expression) throw new Error('Routing constraint has no expression.');
  return { offset: expression.offset, terms: expression.terms.map(term => ({ variable: decodeVariable(term.variable), coefficient: term.coefficient })) };
}

function bridgeBoolean(expression: RoutingBooleanExpressionData): BridgeBooleanExpression {
  const kind = { constant: 1, variable: 2, comparison: 3, and: 4, or: 5, not: 6 }[expression.kind];
  return create(RoutingBooleanExpressionSchema, { kind,
    ...(expression.kind === 'constant' ? { value: expression.value } : {}),
    ...(expression.kind === 'variable' ? { variable: bridgeVariable(expression.variable) } : {}),
    ...(expression.kind === 'comparison' ? { comparison: { left: bridgeExpression(expression.comparison.left),
      right: bridgeExpression(expression.comparison.right), comparison: expression.comparison.comparison } } : {}),
    ...('operands' in expression ? { operands: expression.operands.map(bridgeBoolean) } : {}),
  });
}
function decodeBoolean(expression: BridgeBooleanExpression | undefined): RoutingBooleanExpressionData {
  if (!expression) throw new Error('Routing Boolean expression is missing.');
  switch (expression.kind) {
    case 1: return { kind: 'constant', value: expression.value };
    case 2: return { kind: 'variable', variable: decodeVariable(expression.variable) };
    case 3: {
      const comparison = expression.comparison;
      if (!comparison) throw new Error('Routing Boolean comparison is missing.');
      return { kind: 'comparison', comparison: { left: decodeExpression(comparison.left), right: decodeExpression(comparison.right), comparison: comparison.comparison } };
    }
    case 4: case 5: case 6: return { kind: expression.kind === 4 ? 'and' : expression.kind === 5 ? 'or' : 'not', operands: expression.operands.map(decodeBoolean) };
    default: throw new Error('Unsupported Routing Boolean expression.');
  }
}

function encodeModelOperation(
  operation: RoutingModelOperation,
  dimension: number,
): BridgeRoutingOperation {
  switch (operation.type) {
    case 'setTabuVars': return create(RoutingModelOperationSchema, { operation: { case: 'setTabuVars', value: create(RoutingSetTabuVarsSchema,
      { variables: operation.variables?.map(bridgeVariable), reset: operation.variables === null }) } });
    case 'setSweepArranger': return create(RoutingModelOperationSchema, { operation: { case: 'setSweepArranger', value: create(RoutingSetSweepArrangerSchema, operation) } });
    case 'addOrderedActivityGroup': return create(RoutingModelOperationSchema, { operation: { case: 'addOrderedActivityGroup', value: create(RoutingOrderedActivityGroupSchema, operation) } });
    case 'ignoreDisjunctionsAlreadyForcedToZero': return create(RoutingModelOperationSchema, { operation: { case: 'ignoreDisjunctionsAlreadyForcedToZero', value: true } });
    case 'addForbiddenIntervals': return create(RoutingModelOperationSchema, { operation: { case: 'addForbiddenIntervals', value: create(RoutingAddForbiddenIntervalsSchema, operation) } });
    case 'setPiecewiseCost': return create(RoutingModelOperationSchema, { operation: { case: 'setPiecewiseCost', value: create(RoutingSetPiecewiseCostSchema, operation) } });
    case 'addRouteConstraint': return create(RoutingModelOperationSchema, { operation: { case: 'addRouteConstraint', value: create(RoutingAddRouteConstraintSchema, operation) } });
    case 'setFirstSolutionEvaluator': return create(RoutingModelOperationSchema, { operation: { case: 'setFirstSolutionEvaluator', value: bridgeMatrix(operation.transitMatrix, dimension) } });
    case 'setPrimaryConstrainedDimension': return create(RoutingModelOperationSchema, { operation: { case: 'setPrimaryConstrainedDimension', value: operation.dimensionName } });
    case 'setPathEnergyCosts': return create(RoutingModelOperationSchema, { operation: { case: 'setPathEnergyCosts', value: create(RoutingSetPathEnergyCostsSchema, operation) } });
    case 'addSameActivityGroup': return create(RoutingModelOperationSchema, { operation: { case: 'addSameActivityGroup', value: create(RoutingAddSameActivityGroupSchema, operation) } });
    case 'addBreakInterval': return create(RoutingModelOperationSchema, { operation: { case: 'addBreakInterval', value: create(RoutingAddBreakIntervalSchema, operation) } });
    case 'setBreakIntervals': return create(RoutingModelOperationSchema, { operation: { case: 'setBreakIntervals', value: create(RoutingSetBreakIntervalsSchema, {
      dimensionName: operation.dimensionName, vehicle: operation.vehicle, intervals: operation.intervals,
      preTravelHandle: operation.preTravelHandle, postTravelHandle: operation.postTravelHandle,
      preTravel: operation.preTravel && bridgeMatrix(operation.preTravel, dimension),
      postTravel: operation.postTravel && bridgeMatrix(operation.postTravel, dimension),
    }) } });
    case 'setBreakDistanceDuration': return create(RoutingModelOperationSchema, { operation: { case: 'setBreakDistanceDuration', value: create(RoutingSetBreakDistanceDurationSchema, operation) } });
    case 'addIntegerExpression': return create(RoutingModelOperationSchema, { operation: { case: 'addIntegerExpression', value: create(RoutingAddIntegerExpressionSchema, {
      index: operation.index, kind: operation.kind, operands: operation.operands.map(bridgeExpression),
    }) } });
    case 'addBooleanVariable': return create(RoutingModelOperationSchema, { operation: { case: 'addBooleanVariable', value: create(RoutingAddBooleanVariableSchema, {
      index: operation.index, expression: bridgeBoolean(operation.expression),
    }) } });
    case 'addBooleanConstraint': return create(RoutingModelOperationSchema, { operation: { case: 'addBooleanConstraint', value: create(RoutingAddBooleanConstraintSchema, { expression: bridgeBoolean(operation.expression) }) } });
    case 'modifyDomain': return create(RoutingModelOperationSchema, { operation: { case: 'modifyDomain', value: create(RoutingModifyDomainSchema, {
      variable: bridgeVariable(operation.variable), action: operation.action, lower: operation.lower, upper: operation.upper, values: operation.values,
    }) } });
    case 'addLinearConstraint': return create(RoutingModelOperationSchema, { operation: { case: 'addLinearConstraint', value: create(RoutingAddLinearConstraintSchema, {
      left: bridgeExpression(operation.left), right: bridgeExpression(operation.right), comparison: operation.comparison,
      booleanConditions: operation.booleanConditions?.map(bridgeBoolean),
      conditions: operation.conditions?.map(condition => create(RoutingLinearComparisonSchema, {
        left: bridgeExpression(condition.left), right: bridgeExpression(condition.right), comparison: condition.comparison,
      })),
    }) } });
    case 'addFinalizer':
      return create(RoutingModelOperationSchema, { operation: { case: 'addFinalizer', value: create(RoutingAddFinalizerSchema, {
        variableKind: operation.variableKind, dimensionName: operation.dimensionName, index: BigInt(toIndex(operation.index)),
        resourceGroup: operation.resourceGroup, kind: operation.kind, target: toInt64(operation.target), weight: operation.weight === undefined ? undefined : toInt64(operation.weight),
      }) } });
    case 'setNextValues':
      return create(RoutingModelOperationSchema, { operation: { case: 'setNextValues', value: create(RoutingSetNextValuesSchema, {
        index: BigInt(toIndex(operation.index, 'successor variable index')),
        values: Array.from(operation.values, value => BigInt(toIndex(value, 'successor value'))),
      }) } });
    case 'setVehicleValues':
      return create(RoutingModelOperationSchema, { operation: { case: 'setVehicleValues', value: create(RoutingSetVehicleValuesSchema, {
        index: BigInt(toIndex(operation.index, 'vehicle variable index')),
        values: Array.from(operation.values, value => {
          const exact = toInt64(value, 'vehicle domain value');
          if (exact < -1n || exact > 2_147_483_647n) throw new RangeError('Invalid vehicle domain value.');
          return Number(exact);
        }),
      }) } });
    case 'setAllowedVehiclesForIndex':
      return create(RoutingModelOperationSchema, { operation: { case: 'setAllowedVehiclesForIndex', value: create(RoutingSetAllowedVehiclesForIndexSchema, {
        vehicles: operation.vehicles.map(vehicle => toIndex(vehicle, 'eligible vehicle', 2_147_483_647)),
        index: BigInt(toIndex(operation.index, 'eligibility index')),
      }) } });
    case 'setActiveValues':
      return create(RoutingModelOperationSchema, { operation: { case: 'setActiveValues', value: create(RoutingSetActiveValuesSchema, {
        index: BigInt(toIndex(operation.index, 'active variable index')),
        values: Array.from(operation.values, value => toIndex(value, 'active domain value', 1)),
      }) } });
    case 'setSlackBounds':
      return create(RoutingModelOperationSchema, { operation: { case: 'setSlackBounds', value: create(RoutingSetSlackBoundsSchema, {
        dimensionName: operation.dimensionName, index: BigInt(toIndex(operation.index, 'slack index')),
        lower: toInt64(operation.lower), upper: toInt64(operation.upper),
      }) } });
    case 'setDimensionValue':
      return create(RoutingModelOperationSchema, { operation: { case: 'setDimensionValue', value: create(RoutingSetDimensionValueSchema, {
        dimensionName: operation.dimensionName, kind: routingDimensionValueKinds[operation.setting], value: toInt64(operation.value),
        vehicle: operation.vehicle === undefined ? undefined : toIndex(operation.vehicle, 'dimension vehicle', 2_147_483_647),
      }) } });
    case 'setMaximumActiveVehicles':
      return create(RoutingModelOperationSchema, { operation: { case: 'setMaximumActiveVehicles', value: create(RoutingSetMaximumActiveVehiclesSchema, {
        maximum: toIndex(operation.maximum, 'maximum active vehicles', 2_147_483_647),
      }) } });
    case 'setFixedVehicleCost':
      return create(RoutingModelOperationSchema, { operation: { case: 'setFixedVehicleCost', value: create(RoutingSetFixedVehicleCostSchema, {
        cost: toInt64(operation.cost), vehicle: toIndex(operation.vehicle, 'fixed-cost vehicle', 2_147_483_647),
      }) } });
    case 'setAmortizedVehicleCosts':
      return create(RoutingModelOperationSchema, { operation: { case: 'setAmortizedVehicleCosts', value: create(RoutingSetAmortizedVehicleCostsSchema, {
        linear: toInt64(operation.linear), quadratic: toInt64(operation.quadratic), vehicle: toIndex(operation.vehicle, 'amortized-cost vehicle', 2_147_483_647),
      }) } });
    case 'setVehicleUsedWhenEmpty':
      return create(RoutingModelOperationSchema, { operation: { case: 'setVehicleUsedWhenEmpty', value: create(RoutingSetVehicleUsedWhenEmptySchema, {
        isUsed: operation.isUsed, vehicle: toIndex(operation.vehicle, 'empty-route vehicle', 2_147_483_647),
      }) } });
    case 'setCumulSoftBound':
      return create(RoutingModelOperationSchema, { operation: { case: 'setCumulSoftBound', value: create(RoutingSetCumulSoftBoundSchema, {
        dimensionName: operation.dimensionName, index: BigInt(toIndex(operation.index, 'soft cumul index')),
        bound: toInt64(operation.bound), coefficient: toInt64(operation.coefficient), lower: operation.lower,
      }) } });
    case 'setCumulBounds':
      return create(RoutingModelOperationSchema, { operation: { case: 'setCumulBounds', value: create(RoutingSetCumulBoundsSchema, {
        dimensionName: operation.dimensionName, index: BigInt(toIndex(operation.index, 'cumul index')),
        lower: toInt64(operation.lower), upper: toInt64(operation.upper),
      }) } });
    case 'addNodePrecedence':
      return create(RoutingModelOperationSchema, { operation: { case: 'addNodePrecedence', value: create(RoutingAddNodePrecedenceSchema, {
        dimensionName: operation.dimensionName, first: BigInt(toIndex(operation.first, 'precedence first index')),
        second: BigInt(toIndex(operation.second, 'precedence second index')), offset: operation.offset, performedConstraint: operation.performedConstraint,
      }) } });
    case 'setArcCostEvaluatorOfVehicles':
      return create(RoutingModelOperationSchema, { operation: { case: 'setArcCostEvaluatorOfVehicles', value: create(RoutingSetArcCostEvaluatorOfVehiclesSchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension), vehicles: operation.vehicles,
      }) } });
    case 'addDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimension', value: create(RoutingAddDimensionSchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension, true, operation.unaryTransit), slackMax: operation.slackMax,
        capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDimensionWithVehicleCapacity':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimensionWithVehicleCapacity', value: create(RoutingAddDimensionWithVehicleCapacitySchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension, true, operation.unaryTransit), slackMax: operation.slackMax,
        capacities: operation.capacities, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDimensionWithVehicleTransits':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimensionWithVehicleTransits', value: create(RoutingAddDimensionWithVehicleTransitsSchema, {
        transitMatrices: operation.transitMatrices.map((matrix, i) => bridgeMatrix(matrix, dimension, true, operation.unaryTransits?.[i])), slackMax: operation.slackMax,
        capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addTypeRequirement':
      return create(RoutingModelOperationSchema, { operation: { case: 'addTypeRequirement', value: create(RoutingAddTypeRequirementSchema, {
        kind: operation.kind, dependentType: operation.dependentType, requiredTypeAlternatives: operation.requiredTypeAlternatives,
      }) } });
    case 'setVisitType':
      return create(RoutingModelOperationSchema, { operation: { case: 'setVisitType', value: create(RoutingSetVisitTypeSchema, {
        index: BigInt(operation.index), type: operation.visitType, policy: operation.policy,
      }) } });
    case 'addHardTypeIncompatibility':
      return create(RoutingModelOperationSchema, { operation: { case: 'addHardTypeIncompatibility', value: create(RoutingAddHardTypeIncompatibilitySchema, {
        type1: operation.type1, type2: operation.type2,
      }) } });
    case 'addTemporalTypeIncompatibility':
      return create(RoutingModelOperationSchema, { operation: { case: 'addTemporalTypeIncompatibility', value: create(RoutingAddTemporalTypeIncompatibilitySchema, {
        type1: operation.type1, type2: operation.type2,
      }) } });
    case 'addDimensionWithVehicleTransitAndCapacity':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimensionWithVehicleTransitAndCapacity', value: create(RoutingAddDimensionWithVehicleTransitAndCapacitySchema, {
        transitMatrices: operation.transitMatrices.map((matrix, i) => bridgeMatrix(matrix, dimension, true, operation.unaryTransits?.[i])), slackMax: operation.slackMax,
        capacities: operation.capacities, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDependentDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDependentDimension', value: create(RoutingAddDependentDimensionSchema, {
        transitMatrices: operation.transitMatrices.map((matrix, i) => bridgeMatrix(matrix, dimension, true, operation.unaryTransits?.[i])),
        dependentMatrices: operation.dependentMatrices.map(matrix => create(RoutingStateDependentMatrixSchema, {
          domainStart: matrix.domainStart, domainEnd: matrix.domainEnd,
          functions: matrix.functions.map(fn => create(RoutingPiecewiseLinearFunctionSchema, fn)),
        })), baseDimension: operation.baseDimension, slackMax: operation.slackMax, capacities: operation.capacities,
        fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addConstantDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addConstantDimension', value: create(RoutingAddConstantDimensionSchema, {
        value: operation.value, capacity: operation.capacity, slackMax: operation.slackMax, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addVectorDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addVectorDimension', value: create(RoutingAddVectorDimensionSchema, {
        values: operation.values, capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addMatrixDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addMatrixDimension', value: create(RoutingAddMatrixDimensionSchema, {
        matrix: bridgeMatrix(operation.matrix.flat(), operation.matrix.length, false), capacity: operation.capacity,
        fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addSoftSameVehicleConstraint':
      return create(RoutingModelOperationSchema, { operation: { case: 'addSoftSameVehicleConstraint', value: create(RoutingAddSoftSameVehicleConstraintSchema, {
        indices: operation.indices.map(index => BigInt(toIndex(index, 'soft same-vehicle index'))), cost: toInt64(operation.cost),
      }) } });
    case 'setPickupDeliveryPolicy':
      return create(RoutingModelOperationSchema, { operation: { case: 'setPickupDeliveryPolicy', value: create(RoutingSetPickupDeliveryPolicySchema, {
        policy: toIndex(operation.policy, 'pickup/delivery policy', 2), vehicle: toIndex(operation.vehicle, 'pickup/delivery vehicle', 2_147_483_647),
      }) } });
    case 'addDisjunction':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDisjunction', value: create(RoutingAddDisjunctionSchema, {
        indices: bridgeIndices(operation.indices, 'disjunction indices'), penalty: operation.penalty,
        maxCardinality: operation.maxCardinality === undefined ? undefined : toInt64(operation.maxCardinality),
        penaltyCostBehavior: operation.penaltyCostBehavior === undefined ? undefined : toIndex(operation.penaltyCostBehavior, 'disjunction penalty behavior', 1),
      }) } });
    case 'addPickupAndDeliverySets':
      return create(RoutingModelOperationSchema, { operation: { case: 'addPickupAndDeliverySets', value: create(RoutingAddPickupAndDeliverySetsSchema, {
        pickupDisjunction: toIndex(operation.pickupDisjunction, 'pickup disjunction', 2_147_483_647),
        deliveryDisjunction: toIndex(operation.deliveryDisjunction, 'delivery disjunction', 2_147_483_647),
      }) } });
    case 'setPickupToDeliveryLimits':
      return create(RoutingModelOperationSchema, { operation: { case: 'setPickupToDeliveryLimits', value: create(RoutingSetPickupToDeliveryLimitsSchema, {
        dimensionName: operation.dimensionName, pairIndex: toIndex(operation.pairIndex, 'pickup/delivery pair', 2_147_483_647),
        limits: operation.limits.map(value => toInt64(value, 'pickup/delivery limit')),
      }) } });
    case 'addPickupAndDelivery':
      return create(RoutingModelOperationSchema, { operation: { case: 'addPickupAndDelivery', value: create(RoutingAddPickupAndDeliverySchema, {
        pickup: BigInt(toIndex(operation.pickup, 'pickup index')), delivery: BigInt(toIndex(operation.delivery, 'delivery index')),
      }) } });
    case 'addVehicleEqualityConstraint':
      return create(RoutingModelOperationSchema, { operation: { case: 'addVehicleEqualityConstraint', value: create(RoutingAddVehicleEqualityConstraintSchema, {
        left: BigInt(toIndex(operation.left, 'left index')), right: BigInt(toIndex(operation.right, 'right index')),
      }) } });
    case 'addCumulLessOrEqualConstraint':
      return create(RoutingModelOperationSchema, { operation: { case: 'addCumulLessOrEqualConstraint', value: create(RoutingAddCumulLessOrEqualConstraintSchema, {
        dimensionName: operation.dimensionName, left: BigInt(toIndex(operation.left, 'left index')), right: BigInt(toIndex(operation.right, 'right index')),
      }) } });
    case 'setSoftSpanUpperBound':
      return create(RoutingModelOperationSchema, { operation: { case: 'setSoftSpanUpperBound', value: create(RoutingSetSoftSpanUpperBoundSchema, {
        dimensionName: operation.dimensionName, bound: operation.bound, cost: operation.cost, vehicle: operation.vehicle,
      }) } });
    case 'setQuadraticCostSoftSpanUpperBound':
      return create(RoutingModelOperationSchema, { operation: { case: 'setQuadraticCostSoftSpanUpperBound', value: create(RoutingSetQuadraticCostSoftSpanUpperBoundSchema, {
        dimensionName: operation.dimensionName, bound: operation.bound, cost: operation.cost, vehicle: operation.vehicle,
      }) } });
  }
}

function indices(values: readonly bigint[], label: string) {
  return values.map((value, index) => toIndex(value, `${label}[${index}]`));
}

function bridgeIndices(values: readonly number[], label: string) {
  return values.map((value, index) => BigInt(toIndex(value, `${label}[${index}]`)));
}

function decodeMatrix(values: readonly bigint[], dimension: number) {
  const flat = [...values];
  return Array.from(
    { length: dimension },
    (_, row) => flat.slice(row * dimension, (row + 1) * dimension),
  );
}

function decodeModelOperation(input: BridgeRoutingOperation): RoutingModelOperation {
  switch (input.operation.case) {
    case 'setTabuVars': return { type: 'setTabuVars', variables: input.operation.value.reset ? null : input.operation.value.variables.map(decodeVariable) };
    case 'setSweepArranger': return { type: 'setSweepArranger', points: input.operation.value.points.map(({ x, y }) => ({ x, y })) };
    case 'addOrderedActivityGroup': return { type: 'addOrderedActivityGroup', disjunctions: [...input.operation.value.disjunctions] };
    case 'ignoreDisjunctionsAlreadyForcedToZero': return { type: 'ignoreDisjunctionsAlreadyForcedToZero' };
    case 'addForbiddenIntervals': { const value = input.operation.value; return { type: 'addForbiddenIntervals', dimensionName: value.dimensionName, index: value.index, intervals: value.intervals.map(({ start, end }) => ({ start, end })) }; }
    case 'setPiecewiseCost': { const value = input.operation.value; return { type: 'setPiecewiseCost', dimensionName: value.dimensionName, index: value.index, segments: value.segments.map(({ pointX, pointY, slope, otherPointX }) => ({ pointX, pointY, slope, otherPointX })) }; }
    case 'addRouteConstraint': return { type: 'addRouteConstraint', evaluator: input.operation.value.evaluator, costsAreHomogeneousAcrossVehicles: input.operation.value.costsAreHomogeneousAcrossVehicles };
    case 'setFirstSolutionEvaluator': return { type: 'setFirstSolutionEvaluator', transitMatrix: BigInt64Array.from(input.operation.value.values) };
    case 'setPrimaryConstrainedDimension': return { type: 'setPrimaryConstrainedDimension', dimensionName: input.operation.value };
    case 'addBreakInterval': { const value = input.operation.value; return { type: 'addBreakInterval', index: value.index,
      startMin: value.startMin, startMax: value.startMax, duration: value.duration, optional: value.optional, name: value.name }; }
    case 'setPathEnergyCosts': { const value = input.operation.value; return { type: 'setPathEnergyCosts', force: value.force,
      distance: value.distance, threshold: value.threshold, costBelow: value.costBelow, costAbove: value.costAbove, vehicle: value.vehicle }; }
    case 'addSameActivityGroup': return { type: 'addSameActivityGroup', indices: input.operation.value.indices };
    case 'setBreakIntervals': { const value = input.operation.value; return { type: 'setBreakIntervals', dimensionName: value.dimensionName,
      vehicle: value.vehicle, intervals: value.intervals, preTravel: value.preTravel?.values, postTravel: value.postTravel?.values,
      ...(value.preTravelHandle === undefined ? {} : { preTravelHandle: value.preTravelHandle }),
      ...(value.postTravelHandle === undefined ? {} : { postTravelHandle: value.postTravelHandle }) }; }
    case 'setBreakDistanceDuration': { const value = input.operation.value; return { type: 'setBreakDistanceDuration', dimensionName: value.dimensionName,
      vehicle: value.vehicle, distance: value.distance, duration: value.duration }; }
    case 'addIntegerExpression': return { type: 'addIntegerExpression', index: input.operation.value.index, kind: input.operation.value.kind, operands: input.operation.value.operands.map(decodeExpression) };
    case 'addBooleanVariable': return { type: 'addBooleanVariable', index: input.operation.value.index, expression: decodeBoolean(input.operation.value.expression) };
    case 'addBooleanConstraint': return { type: 'addBooleanConstraint', expression: decodeBoolean(input.operation.value.expression) };
    case 'modifyDomain': { const value = input.operation.value; return { type: 'modifyDomain', variable: decodeVariable(value.variable),
      action: value.action, lower: value.lower, upper: value.upper, values: value.values }; }
    case 'addLinearConstraint': { const value = input.operation.value; return { type: 'addLinearConstraint',
      left: decodeExpression(value.left), right: decodeExpression(value.right), comparison: value.comparison,
      ...(value.booleanConditions.length ? { booleanConditions: value.booleanConditions.map(decodeBoolean) } : {}),
      ...(value.conditions.length ? { conditions: value.conditions.map(condition => ({ left: decodeExpression(condition.left),
        right: decodeExpression(condition.right), comparison: condition.comparison })) } : {}) }; }
    case 'addFinalizer': { const value = input.operation.value; return { type: 'addFinalizer',
      variableKind: value.variableKind, dimensionName: value.dimensionName, index: toIndex(value.index),
      ...(value.variableKind === RoutingVariableKind.ROUTING_VARIABLE_RESOURCE ? { resourceGroup: value.resourceGroup } : {}),
      kind: value.kind, target: value.target, ...(value.weight === undefined ? {} : { weight: value.weight }) }; }
    case 'setNextValues': { const value = input.operation.value; return { type: 'setNextValues',
      index: toIndex(value.index, 'successor variable index'), values: indices(value.values, 'successor values') }; }
    case 'setVehicleValues': { const value = input.operation.value; return { type: 'setVehicleValues',
      index: toIndex(value.index, 'vehicle variable index'), values: value.values }; }
    case 'setAllowedVehiclesForIndex': { const value = input.operation.value; return { type: 'setAllowedVehiclesForIndex',
      vehicles: value.vehicles, index: toIndex(value.index, 'eligibility index') }; }
    case 'setActiveValues': { const value = input.operation.value; return { type: 'setActiveValues',
      index: toIndex(value.index, 'active variable index'), values: value.values.map(item => toIndex(item, 'active domain value', 1)) }; }
    case 'setSlackBounds': { const value = input.operation.value; return { type: 'setSlackBounds', dimensionName: value.dimensionName,
      index: toIndex(value.index, 'slack index'), lower: value.lower, upper: value.upper }; }
    case 'setDimensionValue': {
      const value = input.operation.value;
      const setting = (Object.keys(routingDimensionValueKinds) as RoutingDimensionSetting[]).find(key => routingDimensionValueKinds[key] === value.kind);
      if (!setting) throw new Error('Routing dimension setting has an invalid kind.');
      return { type: 'setDimensionValue', dimensionName: value.dimensionName, setting, value: value.value,
        vehicle: value.vehicle === undefined ? undefined : toIndex(value.vehicle, 'dimension vehicle', 2_147_483_647) };
    }
    case 'setMaximumActiveVehicles': { const value = input.operation.value; return { type: 'setMaximumActiveVehicles', maximum: toIndex(value.maximum, 'maximum active vehicles', 2_147_483_647) }; }
    case 'setFixedVehicleCost': { const value = input.operation.value; return { type: 'setFixedVehicleCost', cost: value.cost, vehicle: toIndex(value.vehicle, 'fixed-cost vehicle', 2_147_483_647) }; }
    case 'setAmortizedVehicleCosts': { const value = input.operation.value; return { type: 'setAmortizedVehicleCosts', linear: value.linear, quadratic: value.quadratic, vehicle: toIndex(value.vehicle, 'amortized-cost vehicle', 2_147_483_647) }; }
    case 'setVehicleUsedWhenEmpty': { const value = input.operation.value; return { type: 'setVehicleUsedWhenEmpty', isUsed: value.isUsed, vehicle: toIndex(value.vehicle, 'empty-route vehicle', 2_147_483_647) }; }
    case 'setCumulSoftBound': { const value = input.operation.value; return { type: 'setCumulSoftBound', dimensionName: value.dimensionName,
      index: toIndex(value.index, 'soft cumul index'), bound: value.bound, coefficient: value.coefficient, lower: value.lower }; }
    case 'setCumulBounds': { const value = input.operation.value; return { type: 'setCumulBounds', dimensionName: value.dimensionName,
      index: toIndex(value.index, 'cumul index'), lower: value.lower, upper: value.upper }; }
    case 'addNodePrecedence': { const value = input.operation.value; return { type: 'addNodePrecedence', dimensionName: value.dimensionName,
      first: toIndex(value.first, 'precedence first index'), second: toIndex(value.second, 'precedence second index'), offset: value.offset, performedConstraint: value.performedConstraint }; }
    case 'setArcCostEvaluatorOfVehicles': { const value = input.operation.value; return { type: 'setArcCostEvaluatorOfVehicles', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), vehicles: value.vehicles }; }
    case 'addDimension': { const value = input.operation.value; return { type: 'addDimension', ...(value.transitMatrix?.unary ? { unaryTransit: true } : {}), transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleCapacity', ...(value.transitMatrix?.unary ? { unaryTransit: true } : {}), transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleTransits': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransits', ...(value.transitMatrices.some(item => item.unary) ? { unaryTransits: value.transitMatrices.map(item => item.unary) } : {}), transitMatrices: value.transitMatrices.map((item) => new BigInt64Array(item.values)), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addTypeRequirement': { const value = input.operation.value; return { type: 'addTypeRequirement', kind: value.kind, dependentType: value.dependentType, requiredTypeAlternatives: value.requiredTypeAlternatives }; }
    case 'setVisitType': { const value = input.operation.value; return { type: 'setVisitType', index: toIndex(value.index), visitType: value.type, policy: value.policy }; }
    case 'addHardTypeIncompatibility': { const value = input.operation.value; return { type: 'addHardTypeIncompatibility', type1: value.type1, type2: value.type2 }; }
    case 'addTemporalTypeIncompatibility': { const value = input.operation.value; return { type: 'addTemporalTypeIncompatibility', type1: value.type1, type2: value.type2 }; }
    case 'addDimensionWithVehicleTransitAndCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransitAndCapacity', ...(value.transitMatrices.some(item => item.unary) ? { unaryTransits: value.transitMatrices.map(item => item.unary) } : {}), transitMatrices: value.transitMatrices.map(item => new BigInt64Array(item.values)), slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDependentDimension': { const value = input.operation.value; return { type: 'addDependentDimension',
      ...(value.transitMatrices.some(item => item.unary) ? { unaryTransits: value.transitMatrices.map(item => item.unary) } : {}),
      transitMatrices: value.transitMatrices.map(item => new BigInt64Array(item.values)),
      dependentMatrices: value.dependentMatrices.map(matrix => ({ domainStart: matrix.domainStart, domainEnd: matrix.domainEnd,
        functions: matrix.functions.map(fn => ({ x: fn.x, y: fn.y })) })), baseDimension: value.baseDimension,
      slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addConstantDimension': { const value = input.operation.value; return { type: 'addConstantDimension', value: value.value, capacity: value.capacity, ...(value.slackMax === undefined ? {} : { slackMax: value.slackMax }), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addVectorDimension': { const value = input.operation.value; return { type: 'addVectorDimension', values: value.values, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addMatrixDimension': { const value = input.operation.value; return { type: 'addMatrixDimension', matrix: decodeMatrix(value.matrix?.values ?? [], value.matrix?.dimension ?? 0), capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addSoftSameVehicleConstraint': { const value = input.operation.value; return { type: 'addSoftSameVehicleConstraint', indices: indices(value.indices, 'soft same-vehicle indices'), cost: value.cost }; }
    case 'setPickupDeliveryPolicy': { const value = input.operation.value; return { type: 'setPickupDeliveryPolicy', policy: toIndex(value.policy, 'pickup/delivery policy', 2), vehicle: toIndex(value.vehicle, 'pickup/delivery vehicle', 2_147_483_647) }; }
    case 'addDisjunction': { const value = input.operation.value; return { type: 'addDisjunction', indices: indices(value.indices, 'disjunction indices'), penalty: value.penalty,
      ...(value.maxCardinality === undefined ? {} : { maxCardinality: value.maxCardinality }),
      ...(value.penaltyCostBehavior === undefined ? {} : { penaltyCostBehavior: toIndex(value.penaltyCostBehavior, 'disjunction penalty behavior', 1) }) }; }
    case 'addPickupAndDeliverySets': { const value = input.operation.value; return { type: 'addPickupAndDeliverySets', pickupDisjunction: value.pickupDisjunction, deliveryDisjunction: value.deliveryDisjunction }; }
    case 'setPickupToDeliveryLimits': { const value = input.operation.value; return { type: 'setPickupToDeliveryLimits', dimensionName: value.dimensionName, pairIndex: value.pairIndex, limits: value.limits }; }
    case 'addPickupAndDelivery': { const value = input.operation.value; return { type: 'addPickupAndDelivery', pickup: toIndex(value.pickup, 'pickup index'), delivery: toIndex(value.delivery, 'delivery index') }; }
    case 'addVehicleEqualityConstraint': { const value = input.operation.value; return { type: 'addVehicleEqualityConstraint', left: toIndex(value.left, 'left index'), right: toIndex(value.right, 'right index') }; }
    case 'addCumulLessOrEqualConstraint': { const value = input.operation.value; return { type: 'addCumulLessOrEqualConstraint', dimensionName: value.dimensionName, left: toIndex(value.left, 'left index'), right: toIndex(value.right, 'right index') }; }
    case 'setSoftSpanUpperBound': { const value = input.operation.value; return { type: 'setSoftSpanUpperBound', dimensionName: value.dimensionName, bound: value.bound, cost: value.cost, vehicle: value.vehicle }; }
    case 'setQuadraticCostSoftSpanUpperBound': { const value = input.operation.value; return { type: 'setQuadraticCostSoftSpanUpperBound', dimensionName: value.dimensionName, bound: value.bound, cost: value.cost, vehicle: value.vehicle }; }
    default: throw new Error('Routing request contains an empty model operation.');
  }
}

function bridgeAssignment(snapshot: RoutingAssignmentSnapshot | undefined) {
  return snapshot && create(RoutingAssignmentSnapshotSchema, { ...snapshot,
    variables: snapshot.variables.map(value => ({ ...value, variable: bridgeVariable(value.variable) })) });
}
function decodeBreakAssignment(value: RoutingBreakAssignment): RoutingBreakAssignment {
  return { index: value.index, performedMin: value.performedMin, performedMax: value.performedMax,
    startMin: value.startMin, startMax: value.startMax, endMin: value.endMin, endMax: value.endMax };
}
function decodeAssignment(snapshot: BridgeAssignmentSnapshot | undefined): RoutingAssignmentSnapshot | undefined {
  return snapshot && { ...(snapshot.objectiveValue === undefined ? {} : { objectiveValue: snapshot.objectiveValue }),
    ...(snapshot.objectiveMin === undefined ? {} : { objectiveMin: snapshot.objectiveMin }),
    ...(snapshot.objectiveMax === undefined ? {} : { objectiveMax: snapshot.objectiveMax }), intervals: snapshot.intervals.map(decodeBreakAssignment),
    variables: snapshot.variables.map(value => ({ min: value.min, max: value.max, variable: decodeVariable(value.variable) })) };
}

function encodeOperation(operation: RoutingOperation): Uint8Array {
  return toBinary(RoutingBridgeRequestSchema, bridgeRequest(operation.request, operation.interruptible));
}

function bridgeRequest(request: RoutingSolveRequest, interruptible = false): import('../generated/bridge/routing_pb.js').RoutingBridgeRequest {
  return create(RoutingBridgeRequestSchema, {
    assignmentTransfer: request.assignmentTransfer,
    secondaryModel: request.secondaryModel && bridgeRequest(request.secondaryModel),
    routeLocks: request.routeLocks && create(RoutingRouteLocksSchema, { closeRoutes: request.routeLocks.closeRoutes,
      routes: request.routeLocks.routes.map(indices => ({ indices: bridgeIndices(indices, 'lock indices') })) }),
    inspectPreAssignment: request.inspectPreAssignment,
    firstSolutionHint: bridgeAssignment(request.firstSolutionHint),
    resourceInspectionGroup: request.resourceInspectionGroup,
    inspectActivityGroups: request.inspectActivityGroups,
    arcCostQueries: request.arcCostQueries,
    domainQueries: request.domainQueries?.map(query => create(RoutingDomainQuerySchema, {
      variable: bridgeVariable(query.variable), containsValue: query.containsValue, softLowerBound: query.softLowerBound,
    })),
    solutionEvents: request.solutionEvents ?? false,
    trackUncheckedNeighbors: request.trackUncheckedNeighbors ?? false,
    numLocations: request.numLocations,
    numVehicles: request.numVehicles,
    starts: request.starts,
    ends: request.ends,
    searchParametersProto: request.searchParametersProto,
    searchParameterFields: request.searchParameterFields ?? [],
    modelParametersProto: request.modelParametersProto,
    modelParameterFields: request.modelParameterFields ?? [],
    transitMatrix: bridgeMatrix(request.transitMatrix, request.transitMatrixDimension),
    operations: request.operations.map((item) => encodeModelOperation(item, request.transitMatrixDimension)),
    resourceGroups: request.resourceGroups?.map(group => create(RoutingResourceGroupSchema, group)),
    dimensionNames: request.dimensionNames,
    initialAssignment: request.initialAssignment
      ? create(RoutingInitialAssignmentSchema, {
        routes: request.initialAssignment.routes.map((indices) => create(RoutingRouteSchema, {
          indices: bridgeIndices(indices, 'route indices'),
        })),
        ignoreInactiveIndices: request.initialAssignment.ignoreInactiveIndices,
        snapshot: bridgeAssignment(request.initialAssignment.snapshot),
      })
      : undefined,
    interruptible,
    readAssignmentOnly: request.readAssignmentOnly,
    assignmentAction: request.assignmentAction,
    candidateAssignments: request.candidateAssignments?.map(value => bridgeAssignment(value)!),
    packingDurationSeconds: request.packingDurationSeconds,
    checkSolutionInCp: request.checkSolutionInCp ?? true,
    inspectCumulOptimizers: request.inspectCumulOptimizers ?? false,
    callAtSolutionMonitors: request.callAtSolutionMonitors ?? false,
    dimensionQuery: request.dimensionQuery && create(RoutingDimensionQuerySchema, request.dimensionQuery),
    routeCostQuery: request.routeCostQuery && create(RoutingRouteSchema, { indices: bridgeIndices(request.routeCostQuery, 'route cost indices') }),
    modelQuery: request.modelQuery && create(RoutingModelQuerySchema, request.modelQuery),
    searchEntryEvents: request.searchEntryEvents ?? false,
    pickupDeliveryInspectionIndex: request.pickupDeliveryInspectionIndex,
    breakInspection: request.breakInspection && create(RoutingBreakInspectionRequestSchema, request.breakInspection),
  });
}

function decodeOperation(payload: Uint8Array): RoutingOperation {
  return decodeBridgeRequest(fromBinary(RoutingBridgeRequestSchema, payload));
}

function decodeBridgeRequest(request: import('../generated/bridge/routing_pb.js').RoutingBridgeRequest): RoutingOperation {
  if (!request.transitMatrix) throw new Error('Routing request has no transit matrix.');
  return {
    type: 'solve',
    interruptible: request.interruptible,
    request: {
      ...(request.assignmentTransfer ? { assignmentTransfer: {
        nextValues: [...request.assignmentTransfer.nextValues], vehicleValues: [...request.assignmentTransfer.vehicleValues],
      } } : {}),
      ...(request.secondaryModel ? { secondaryModel: decodeBridgeRequest(request.secondaryModel).request } : {}),
      ...(request.routeLocks ? { routeLocks: { closeRoutes: request.routeLocks.closeRoutes,
        routes: request.routeLocks.routes.map(route => indices(route.indices, 'lock indices')) } } : {}),
      ...(request.inspectPreAssignment ? { inspectPreAssignment: true } : {}),
      ...(request.firstSolutionHint ? { firstSolutionHint: decodeAssignment(request.firstSolutionHint) } : {}),
      ...(request.resourceInspectionGroup === undefined ? {} : { resourceInspectionGroup: request.resourceInspectionGroup }),
      ...(request.inspectActivityGroups ? { inspectActivityGroups: true } : {}),
      ...(request.arcCostQueries.length ? { arcCostQueries: request.arcCostQueries } : {}),
      ...(request.domainQueries.length ? { domainQueries: request.domainQueries.map(query => ({ variable: decodeVariable(query.variable),
        ...(query.containsValue === undefined ? {} : { containsValue: query.containsValue }), ...(query.softLowerBound === undefined ? {} : { softLowerBound: query.softLowerBound }) })) } : {}),
      readAssignmentOnly: request.readAssignmentOnly,
      solutionEvents: request.solutionEvents,
      trackUncheckedNeighbors: request.trackUncheckedNeighbors,
      numLocations: request.numLocations,
      numVehicles: request.numVehicles,
      starts: request.starts,
      ends: request.ends,
      searchParametersProto: request.searchParametersProto,
      searchParameterFields: request.searchParameterFields,
      modelParametersProto: request.modelParameterFields.length > 0 || request.modelParametersProto.length > 0 ? request.modelParametersProto : undefined,
      modelParameterFields: request.modelParameterFields,
      transitMatrix: new BigInt64Array(request.transitMatrix.values),
      transitMatrixDimension: request.transitMatrix.dimension,
      operations: request.operations.map(decodeModelOperation),
      ...(request.resourceGroups.length ? { resourceGroups: request.resourceGroups.map(group => ({
        resources: group.resources.map(resource => ({ dimensionName: resource.dimensionName, startDomain: resource.startDomain, endDomain: resource.endDomain })),
        requiredVehicles: group.requiredVehicles, allowedResources: group.allowedResources.map(value => ({ vehicle: value.vehicle, resources: value.resources })),
      })) } : {}),
      dimensionNames: request.dimensionNames,
      assignmentAction: request.assignmentAction,
      candidateAssignments: request.candidateAssignments.map(value => decodeAssignment(value)!),
      packingDurationSeconds: request.packingDurationSeconds,
      checkSolutionInCp: request.checkSolutionInCp,
      inspectCumulOptimizers: request.inspectCumulOptimizers,
      callAtSolutionMonitors: request.callAtSolutionMonitors,
      dimensionQuery: request.dimensionQuery && { dimensionName: request.dimensionQuery.dimensionName, kind: request.dimensionQuery.kind, index: request.dimensionQuery.index, otherIndex: request.dimensionQuery.otherIndex, vehicleOrClass: request.dimensionQuery.vehicleOrClass, lower: request.dimensionQuery.lower, upper: request.dimensionQuery.upper, pairIndex: request.dimensionQuery.pairIndex, pickupAlternativeIndex: request.dimensionQuery.pickupAlternativeIndex, deliveryAlternativeIndex: request.dimensionQuery.deliveryAlternativeIndex },
      ...(request.routeCostQuery ? { routeCostQuery: indices(request.routeCostQuery.indices, 'route cost indices') } : {}),
      modelQuery: request.modelQuery && { kind: request.modelQuery.kind, index: request.modelQuery.index, otherIndex: request.modelQuery.otherIndex,
        vehicleOrClass: request.modelQuery.vehicleOrClass, defaultValue: request.modelQuery.defaultValue, predicateEvaluator: request.modelQuery.predicateEvaluator, thirdIndex: request.modelQuery.thirdIndex },
      searchEntryEvents: request.searchEntryEvents,
      pickupDeliveryInspectionIndex: request.pickupDeliveryInspectionIndex,
      breakInspection: request.breakInspection && { dimensionName: request.breakInspection.dimensionName, vehicle: request.breakInspection.vehicle },
      initialAssignment: request.initialAssignment
        ? {
          routes: request.initialAssignment.routes.map((route, routeIndex) => indices(route.indices, `route ${routeIndex} indices`)),
          ignoreInactiveIndices: request.initialAssignment.ignoreInactiveIndices,
          ...(request.initialAssignment.snapshot ? { snapshot: decodeAssignment(request.initialAssignment.snapshot) } : {}),
        }
        : undefined,
    },
  };
}

function bridgeSolution(solution: RoutingSolveResult) {
  return {
    objectiveValue: solution.objectiveValue,
    nextValues: bridgeIndices(solution.nextValues, 'next values'),
    vehicleValues: solution.vehicleValues,
    resourceAssignments: solution.resourceAssignments?.map(value => create(RoutingResourceAssignmentSchema, value)),
    breakAssignments: solution.breakAssignments?.map(value => create(RoutingBreakAssignmentSchema, value)),
    assignmentVariables: solution.assignmentVariables?.map(value => create(RoutingAssignmentVariableSchema, { variable: bridgeVariable(value.variable), min: value.min, max: value.max })),
    starts: bridgeIndices(solution.starts, 'starts'),
    ends: bridgeIndices(solution.ends, 'ends'),
    dimensions: Object.entries(solution.dimensionCumulValues).map(([name, cumulValues]) => ({
      name,
      cumulValues,
      cumulMins: solution.dimensionCumulMins?.[name] ?? cumulValues,
      cumulMaxs: solution.dimensionCumulMaxs?.[name] ?? [],
    })),

  };
}

function encodeResult(result: RoutingResult): Uint8Array {
  const solution = result.solution;
  return toBinary(RoutingBridgeResponseSchema, create(RoutingBridgeResponseSchema, {
    assignmentSeed: bridgeAssignment(result.assignmentSeed),
    routeCost: result.routeCost === undefined ? undefined : create(RoutingRouteCostSchema, { cost: result.routeCost ?? undefined }),
    locksApplied: result.locksApplied,
    preAssignment: result.preAssignment && create(RoutingPreAssignmentSchema, { nextValues: result.preAssignment }),
    status: result.status,
    collectedSolutions: result.collectedSolutions?.map(value => create(RoutingSolutionSchema, bridgeSolution(value))),
    timeLimitReached: result.timeLimitReached,
    computedLowerBound: result.computedLowerBound,
    dimensionInspection: result.dimensionInspection && create(RoutingDimensionInspectionSchema, result.dimensionInspection),
    modelInspection: result.modelInspection && create(RoutingModelInspectionSchema, { ...result.modelInspection, groups: result.modelInspection.groups.map(indices => ({ indices })),
      precedenceGroups: result.modelInspection.precedenceGroups.map(groups => ({ groups: groups.map(indices => ({ indices })) })) }),
    assignmentFeasible: result.assignmentFeasible,
    pickupDeliveryInspection: result.pickupDeliveryInspection && create(RoutingPickupDeliveryInspectionSchema, result.pickupDeliveryInspection),
    breakConfiguration: result.breakConfiguration && create(RoutingBreakConfigurationSchema, result.breakConfiguration),
    cumulOptimizers: result.cumulOptimizers && create(RoutingCumulOptimizersSchema, result.cumulOptimizers),
    objectiveLowerBound: result.objectiveLowerBound,
    searchStatistics: result.searchStatistics && create(RoutingSearchStatisticsSchema, { ...result.searchStatistics,
      numDecisionsInFirstSolution: result.searchStatistics.numDecisionsInFirstSolution ?? undefined,
      numRejectsInFirstSolution: result.searchStatistics.numRejectsInFirstSolution ?? undefined }),
    arcCosts: result.arcCosts,
    domainResults: result.domainResults?.map(result => create(RoutingDomainResultSchema, result)),
    localSearchProfile: result.localSearchProfile,
    resourceInspection: result.resourceInspection ? create(RoutingResourceInspectionSchema, result.resourceInspection) : undefined,
    activityGroups: result.activityGroups ? create(RoutingActivityGroupsSchema, { groups: result.activityGroups.groups,
      members: result.activityGroups.members.map(indices => ({ indices })) }) : undefined,
    automaticFirstSolutionStrategy: result.automaticFirstSolutionStrategy,
    ...(solution ? { hasSolution: true, ...bridgeSolution(solution) } : { hasSolution: false }),
  }));
}

function decodeSolution(snapshot: BridgeRoutingSolution | BridgeRoutingResponse, status: number): RoutingSolveResult {
  return {
    status,
    objectiveValue: snapshot.objectiveValue,
    ...(snapshot.breakAssignments.length ? { breakAssignments: snapshot.breakAssignments.map(decodeBreakAssignment) } : {}),
    ...(snapshot.resourceAssignments.length ? { resourceAssignments: snapshot.resourceAssignments.map(value => ({ mins: value.mins, maxs: value.maxs })) } : {}),
    nextValues: indices(snapshot.nextValues, 'next values'),
    ...(snapshot.vehicleValues.length ? { vehicleValues: snapshot.vehicleValues } : {}),
    starts: indices(snapshot.starts, 'starts'),
    ends: indices(snapshot.ends, 'ends'),
    ...(snapshot.assignmentVariables.length ? { assignmentVariables: snapshot.assignmentVariables.map(value => ({ variable: decodeVariable(value.variable), min: value.min, max: value.max })) } : {}),
    dimensionCumulValues: Object.fromEntries(
      snapshot.dimensions.map((item) => [item.name, item.cumulValues]),
    ),
    dimensionCumulMins: Object.fromEntries(snapshot.dimensions.map(item => [item.name, item.cumulMins.length ? item.cumulMins : item.cumulValues])),
    dimensionCumulMaxs: Object.fromEntries(snapshot.dimensions.filter(item => item.cumulMaxs.length > 0).map(item => [item.name, item.cumulMaxs])),

  };
}

function decodeResult(payload: Uint8Array): RoutingResult {
  const response = fromBinary(RoutingBridgeResponseSchema, payload);
  return {
    ...(response.assignmentSeed ? { assignmentSeed: decodeAssignment(response.assignmentSeed) } : {}),
    type: 'solve',
    ...(response.routeCost ? { routeCost: response.routeCost.cost ?? null } : {}),
    ...(response.collectedSolutions.length ? { collectedSolutions: response.collectedSolutions.map(value => decodeSolution(value, response.status)) } : {}),
    ...(response.timeLimitReached === undefined ? {} : { timeLimitReached: response.timeLimitReached }),
    ...(response.computedLowerBound === undefined ? {} : { computedLowerBound: response.computedLowerBound }),
    ...(response.dimensionInspection ? { dimensionInspection: { value: response.dimensionInspection.value, intervals: response.dimensionInspection.intervals.map(({ start, end }) => ({ start, end })), hasPiecewiseLinearCost: response.dimensionInspection.hasPiecewiseLinearCost, nodePrecedences: response.dimensionInspection.nodePrecedences.map(({ first, second, offset, performedConstraint }) => ({ first, second, offset, performedConstraint })), costSegments: response.dimensionInspection.costSegments.map(({ pointX, pointY, slope, otherPointX }) => ({ pointX, pointY, slope, otherPointX })) } } : {}),
    ...(response.assignmentFeasible === undefined ? {} : { assignmentFeasible: response.assignmentFeasible }),
    ...(response.pickupDeliveryInspection ? { pickupDeliveryInspection: {
      pickup: response.pickupDeliveryInspection.pickup && { pairIndex: response.pickupDeliveryInspection.pickup.pairIndex, alternativeIndex: response.pickupDeliveryInspection.pickup.alternativeIndex },
      delivery: response.pickupDeliveryInspection.delivery && { pairIndex: response.pickupDeliveryInspection.delivery.pairIndex, alternativeIndex: response.pickupDeliveryInspection.delivery.alternativeIndex },
      isPickup: response.pickupDeliveryInspection.isPickup, isDelivery: response.pickupDeliveryInspection.isDelivery } } : {}),
    ...(response.breakConfiguration ? { breakConfiguration: { hasBreakConstraints: response.breakConfiguration.hasBreakConstraints,
      intervals: response.breakConfiguration.intervals, distanceDuration: response.breakConfiguration.distanceDuration.map(({ distance, duration }) => ({ distance, duration })),
      preTravelEvaluator: response.breakConfiguration.preTravelEvaluator, postTravelEvaluator: response.breakConfiguration.postTravelEvaluator } } : {}),
    ...(response.cumulOptimizers ? { cumulOptimizers: { globalDimensions: response.cumulOptimizers.globalDimensions, localDimensions: response.cumulOptimizers.localDimensions } } : {}),
    ...(response.modelInspection ? { modelInspection: { value: response.modelInspection.value, dimensionIndices: response.modelInspection.dimensionIndices, indices: response.modelInspection.indices, groups: response.modelInspection.groups.map(group => [...group.indices]),
      precedenceGroups: response.modelInspection.precedenceGroups.map(groups => groups.groups.map(group => [...group.indices])) } } : {}),
    ...(response.objectiveLowerBound === undefined ? {} : { objectiveLowerBound: response.objectiveLowerBound }),
    ...(response.searchStatistics ? { searchStatistics: {
      numCpSatCallsInLpScheduling: response.searchStatistics.numCpSatCallsInLpScheduling,
      numGlopCallsInLpScheduling: response.searchStatistics.numGlopCallsInLpScheduling,
      numMinCostFlowCalls: response.searchStatistics.numMinCostFlowCalls,
      numCpSatCallsInRouting: response.searchStatistics.numCpSatCallsInRouting,
      numGeneralizedCpSatCallsInRouting: response.searchStatistics.numGeneralizedCpSatCallsInRouting,
      numDecisionsInFirstSolution: response.searchStatistics.numDecisionsInFirstSolution ?? null,
      numRejectsInFirstSolution: response.searchStatistics.numRejectsInFirstSolution ?? null,
    } } : {}),
    ...(response.locksApplied === undefined ? {} : { locksApplied: response.locksApplied }),
    ...(response.preAssignment ? { preAssignment: response.preAssignment.nextValues } : {}),
    ...(response.activityGroups ? { activityGroups: { groups: response.activityGroups.groups,
      members: response.activityGroups.members.map(group => group.indices) } } : {}),
    ...(response.resourceInspection ? { resourceInspection: {
      affectedDimensions: response.resourceInspection.affectedDimensions,
      resources: response.resourceInspection.resources.map(resource => ({ classIndex: resource.classIndex, dimensionAttributes: resource.dimensionAttributes.map(attribute => ({
        dimensionName: attribute.dimensionName, startDomain: attribute.startDomain, endDomain: attribute.endDomain })) })),
      classes: response.resourceInspection.classes.map(resourceClass => ({ resourceIndices: resourceClass.resourceIndices, dimensionAttributes: resourceClass.dimensionAttributes.map(attribute => ({
        dimensionName: attribute.dimensionName, startDomain: attribute.startDomain, endDomain: attribute.endDomain })) })),
    } } : {}),
    ...(response.automaticFirstSolutionStrategy === undefined ? {} : { automaticFirstSolutionStrategy: response.automaticFirstSolutionStrategy }),
    ...(response.arcCosts.length ? { arcCosts: response.arcCosts } : {}),
    ...(response.domainResults.length ? { domainResults: response.domainResults.map(result => ({ min: result.min, max: result.max, size: result.size, bound: result.bound, ...(result.contains === undefined ? {} : { contains: result.contains }), ...(result.softBound === undefined ? {} : { softBound: result.softBound }) })) } : {}),
    localSearchProfile: response.localSearchProfile,
    status: response.status,
    solution: response.hasSolution ? decodeSolution(response, response.status) : null,
  };
}

export const routingProtocol: SolverBridgeCodec<RoutingOperation, RoutingResult, RoutingSolverEvent> = {
  solver: 'routing',
  label: 'Routing',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
  encodeEvent: event => toBinary(RoutingBridgeResponseSchema, create(RoutingBridgeResponseSchema, {
    ...(event.type === 'searchEntered' ? { searchEntered: true } : { solveEvent: create(RoutingSolveEventSchema, {
      objectiveValue: event.objectiveValue, solutionCount: event.solutionCount, unchecked: event.unchecked,
    }) }),
  })),
  decodeEvent: payload => {
    const response = fromBinary(RoutingBridgeResponseSchema, payload);
    if (response.searchEntered) return { type: 'searchEntered' };
    const event = response.solveEvent;
    return event ? { type: 'solution', objectiveValue: event.objectiveValue,
      solutionCount: event.solutionCount, unchecked: event.unchecked } : null;
  },
};
