import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import { toIndex, toInt64, type IntValue } from '../int64.js';
import {
  RoutingAddConstantDimensionSchema,
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
  RoutingDomainAction,
  RoutingFinalizerKind,
  RoutingVariableKind,
  RoutingAddCumulLessOrEqualConstraintSchema,
  RoutingAddNodePrecedenceSchema,
  RoutingSetCumulBoundsSchema,
  RoutingSetCumulSoftBoundSchema,
  RoutingSetMaximumActiveVehiclesSchema,
  RoutingSetFixedVehicleCostSchema,
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
  RoutingAddDisjunctionSchema,
  RoutingAddMatrixDimensionSchema,
  RoutingAddPickupAndDeliverySchema,
  RoutingAddVehicleEqualityConstraintSchema,
  RoutingAddVectorDimensionSchema,
  RoutingBridgeRequestSchema,
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

export { RoutingTypeRequirementKind, RoutingFinalizerKind, RoutingVariableKind, RoutingDomainAction };

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

export type RoutingModelOperation =
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
  | { type: 'addNodePrecedence'; dimensionName: string; first: number; second: number; offset: bigint }
  | { type: 'setArcCostEvaluatorOfVehicles'; transitMatrix: BigInt64Array; vehicles: number[] }
  | { type: 'addDimension'; transitMatrix: BigInt64Array; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleCapacity'; transitMatrix: BigInt64Array; slackMax: bigint; capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransits'; transitMatrices: BigInt64Array[]; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addConstantDimension'; value: bigint; capacity: bigint; slackMax?: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransitAndCapacity'; transitMatrices: BigInt64Array[]; slackMax: bigint; capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addVectorDimension'; values: bigint[]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addMatrixDimension'; matrix: bigint[][]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDisjunction'; indices: number[]; penalty?: bigint; maxCardinality?: bigint; penaltyCostBehavior?: number }
  | { type: 'addPickupAndDelivery'; pickup: number; delivery: number }
  | { type: 'addVehicleEqualityConstraint'; left: number; right: number }
  | { type: 'addCumulLessOrEqualConstraint'; dimensionName: string; left: number; right: number }
  | { type: 'setSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number }
  | { type: 'setQuadraticCostSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number };

export type RoutingSolveRequest = {
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
  };
};

export type RoutingSolveResult = {
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

export type RoutingOperation = {
  type: 'solve';
  request: RoutingSolveRequest;
  interruptible: boolean;
};

export type RoutingResult = {
  resourceInspection?: RoutingResourceInspectionData;
  domainResults?: RoutingDomainResult[];
  arcCosts?: bigint[];
  type: 'solve';
  automaticFirstSolutionStrategy?: number;
  localSearchProfile?: string;
  status: number;
  solution: RoutingSolveResult | null;
};

export type RoutingSolverEvent = { type: 'solution'; objectiveValue: bigint; solutionCount: bigint; unchecked: boolean };
export type RoutingExecutor = SolverExecutor<RoutingOperation, RoutingResult, RoutingSolverEvent>;
export type RoutingJob = SolverJob<RoutingResult>;

function bridgeMatrix(values: BigInt64Array | bigint[], dimension: number, routingIndices = true) {
  return create(RoutingMatrixSchema, {
    values: [...values],
    dimension,
    routingIndices,
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
        second: BigInt(toIndex(operation.second, 'precedence second index')), offset: operation.offset,
      }) } });
    case 'setArcCostEvaluatorOfVehicles':
      return create(RoutingModelOperationSchema, { operation: { case: 'setArcCostEvaluatorOfVehicles', value: create(RoutingSetArcCostEvaluatorOfVehiclesSchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension), vehicles: operation.vehicles,
      }) } });
    case 'addDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimension', value: create(RoutingAddDimensionSchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension), slackMax: operation.slackMax,
        capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDimensionWithVehicleCapacity':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimensionWithVehicleCapacity', value: create(RoutingAddDimensionWithVehicleCapacitySchema, {
        transitMatrix: bridgeMatrix(operation.transitMatrix, dimension), slackMax: operation.slackMax,
        capacities: operation.capacities, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDimensionWithVehicleTransits':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDimensionWithVehicleTransits', value: create(RoutingAddDimensionWithVehicleTransitsSchema, {
        transitMatrices: operation.transitMatrices.map((matrix) => bridgeMatrix(matrix, dimension)), slackMax: operation.slackMax,
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
        transitMatrices: operation.transitMatrices.map(matrix => bridgeMatrix(matrix, dimension)), slackMax: operation.slackMax,
        capacities: operation.capacities, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
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
      first: toIndex(value.first, 'precedence first index'), second: toIndex(value.second, 'precedence second index'), offset: value.offset }; }
    case 'setArcCostEvaluatorOfVehicles': { const value = input.operation.value; return { type: 'setArcCostEvaluatorOfVehicles', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), vehicles: value.vehicles }; }
    case 'addDimension': { const value = input.operation.value; return { type: 'addDimension', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleCapacity', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleTransits': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransits', transitMatrices: value.transitMatrices.map((item) => new BigInt64Array(item.values)), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addTypeRequirement': { const value = input.operation.value; return { type: 'addTypeRequirement', kind: value.kind, dependentType: value.dependentType, requiredTypeAlternatives: value.requiredTypeAlternatives }; }
    case 'setVisitType': { const value = input.operation.value; return { type: 'setVisitType', index: toIndex(value.index), visitType: value.type, policy: value.policy }; }
    case 'addHardTypeIncompatibility': { const value = input.operation.value; return { type: 'addHardTypeIncompatibility', type1: value.type1, type2: value.type2 }; }
    case 'addTemporalTypeIncompatibility': { const value = input.operation.value; return { type: 'addTemporalTypeIncompatibility', type1: value.type1, type2: value.type2 }; }
    case 'addDimensionWithVehicleTransitAndCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransitAndCapacity', transitMatrices: value.transitMatrices.map(item => new BigInt64Array(item.values)), slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addConstantDimension': { const value = input.operation.value; return { type: 'addConstantDimension', value: value.value, capacity: value.capacity, ...(value.slackMax === undefined ? {} : { slackMax: value.slackMax }), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addVectorDimension': { const value = input.operation.value; return { type: 'addVectorDimension', values: value.values, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addMatrixDimension': { const value = input.operation.value; return { type: 'addMatrixDimension', matrix: decodeMatrix(value.matrix?.values ?? [], value.matrix?.dimension ?? 0), capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addSoftSameVehicleConstraint': { const value = input.operation.value; return { type: 'addSoftSameVehicleConstraint', indices: indices(value.indices, 'soft same-vehicle indices'), cost: value.cost }; }
    case 'setPickupDeliveryPolicy': { const value = input.operation.value; return { type: 'setPickupDeliveryPolicy', policy: toIndex(value.policy, 'pickup/delivery policy', 2), vehicle: toIndex(value.vehicle, 'pickup/delivery vehicle', 2_147_483_647) }; }
    case 'addDisjunction': { const value = input.operation.value; return { type: 'addDisjunction', indices: indices(value.indices, 'disjunction indices'), penalty: value.penalty,
      ...(value.maxCardinality === undefined ? {} : { maxCardinality: value.maxCardinality }),
      ...(value.penaltyCostBehavior === undefined ? {} : { penaltyCostBehavior: toIndex(value.penaltyCostBehavior, 'disjunction penalty behavior', 1) }) }; }
    case 'addPickupAndDelivery': { const value = input.operation.value; return { type: 'addPickupAndDelivery', pickup: toIndex(value.pickup, 'pickup index'), delivery: toIndex(value.delivery, 'delivery index') }; }
    case 'addVehicleEqualityConstraint': { const value = input.operation.value; return { type: 'addVehicleEqualityConstraint', left: toIndex(value.left, 'left index'), right: toIndex(value.right, 'right index') }; }
    case 'addCumulLessOrEqualConstraint': { const value = input.operation.value; return { type: 'addCumulLessOrEqualConstraint', dimensionName: value.dimensionName, left: toIndex(value.left, 'left index'), right: toIndex(value.right, 'right index') }; }
    case 'setSoftSpanUpperBound': { const value = input.operation.value; return { type: 'setSoftSpanUpperBound', dimensionName: value.dimensionName, bound: value.bound, cost: value.cost, vehicle: value.vehicle }; }
    case 'setQuadraticCostSoftSpanUpperBound': { const value = input.operation.value; return { type: 'setQuadraticCostSoftSpanUpperBound', dimensionName: value.dimensionName, bound: value.bound, cost: value.cost, vehicle: value.vehicle }; }
    default: throw new Error('Routing request contains an empty model operation.');
  }
}

function encodeOperation(operation: RoutingOperation): Uint8Array {
  const request = operation.request;
  return toBinary(RoutingBridgeRequestSchema, create(RoutingBridgeRequestSchema, {
    resourceInspectionGroup: request.resourceInspectionGroup,
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
      })
      : undefined,
    interruptible: operation.interruptible,
    readAssignmentOnly: request.readAssignmentOnly,
  }));
}

function decodeOperation(payload: Uint8Array): RoutingOperation {
  const request = fromBinary(RoutingBridgeRequestSchema, payload);
  if (!request.transitMatrix) throw new Error('Routing request has no transit matrix.');
  return {
    type: 'solve',
    interruptible: request.interruptible,
    request: {
      ...(request.resourceInspectionGroup === undefined ? {} : { resourceInspectionGroup: request.resourceInspectionGroup }),
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
      initialAssignment: request.initialAssignment
        ? {
          routes: request.initialAssignment.routes.map((route, routeIndex) => indices(route.indices, `route ${routeIndex} indices`)),
          ignoreInactiveIndices: request.initialAssignment.ignoreInactiveIndices,
        }
        : undefined,
    },
  };
}

function encodeResult(result: RoutingResult): Uint8Array {
  const solution = result.solution;
  return toBinary(RoutingBridgeResponseSchema, create(RoutingBridgeResponseSchema, {
    status: result.status,
    arcCosts: result.arcCosts,
    domainResults: result.domainResults?.map(result => create(RoutingDomainResultSchema, result)),
    localSearchProfile: result.localSearchProfile,
    resourceInspection: result.resourceInspection ? create(RoutingResourceInspectionSchema, result.resourceInspection) : undefined,
    automaticFirstSolutionStrategy: result.automaticFirstSolutionStrategy,
    ...(solution ? {
      hasSolution: true,
      objectiveValue: solution.objectiveValue,
      nextValues: bridgeIndices(solution.nextValues, 'next values'),
      vehicleValues: solution.vehicleValues,
      resourceAssignments: solution.resourceAssignments?.map(value => create(RoutingResourceAssignmentSchema, value)),
      assignmentVariables: solution.assignmentVariables?.map(value => create(RoutingAssignmentVariableSchema, { variable: bridgeVariable(value.variable), min: value.min, max: value.max })),
      starts: bridgeIndices(solution.starts, 'starts'),
      ends: bridgeIndices(solution.ends, 'ends'),
      dimensions: Object.entries(solution.dimensionCumulValues).map(([name, cumulValues]) => ({
        name,
        cumulValues,
        cumulMins: solution.dimensionCumulMins?.[name] ?? cumulValues,
        cumulMaxs: solution.dimensionCumulMaxs?.[name] ?? [],
      })),
    } : { hasSolution: false }),
  }));
}

function decodeResult(payload: Uint8Array): RoutingResult {
  const response = fromBinary(RoutingBridgeResponseSchema, payload);
  return {
    type: 'solve',
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
    solution: response.hasSolution ? {
      status: response.status,
      objectiveValue: response.objectiveValue,
      ...(response.resourceAssignments.length ? { resourceAssignments: response.resourceAssignments.map(value => ({ mins: value.mins, maxs: value.maxs })) } : {}),
      nextValues: indices(response.nextValues, 'next values'),
      ...(response.vehicleValues.length ? { vehicleValues: response.vehicleValues } : {}),
      starts: indices(response.starts, 'starts'),
      ends: indices(response.ends, 'ends'),
      ...(response.assignmentVariables.length ? { assignmentVariables: response.assignmentVariables.map(value => ({ variable: decodeVariable(value.variable), min: value.min, max: value.max })) } : {}),
      dimensionCumulValues: Object.fromEntries(
        response.dimensions.map((item) => [item.name, item.cumulValues]),
      ),
      dimensionCumulMins: Object.fromEntries(response.dimensions.map(item => [item.name, item.cumulMins.length ? item.cumulMins : item.cumulValues])),
      dimensionCumulMaxs: Object.fromEntries(response.dimensions.filter(item => item.cumulMaxs.length > 0).map(item => [item.name, item.cumulMaxs])),
    } : null,
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
    solveEvent: create(RoutingSolveEventSchema, {
      objectiveValue: event.objectiveValue, solutionCount: event.solutionCount, unchecked: event.unchecked,
    }),
  })),
  decodeEvent: payload => {
    const event = fromBinary(RoutingBridgeResponseSchema, payload).solveEvent;
    return event ? { type: 'solution', objectiveValue: event.objectiveValue,
      solutionCount: event.solutionCount, unchecked: event.unchecked } : null;
  },
};
