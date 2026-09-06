import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import { toIndex } from '../int64.js';
import {
  RoutingAddConstantDimensionSchema,
  RoutingAddCumulLessOrEqualConstraintSchema,
  RoutingAddDimensionSchema,
  RoutingAddDimensionWithVehicleCapacitySchema,
  RoutingAddDimensionWithVehicleTransitsSchema,
  RoutingAddDisjunctionSchema,
  RoutingAddMatrixDimensionSchema,
  RoutingAddPickupAndDeliverySchema,
  RoutingAddVehicleEqualityConstraintSchema,
  RoutingAddVectorDimensionSchema,
  RoutingBridgeRequestSchema,
  RoutingBridgeResponseSchema,
  RoutingInitialAssignmentSchema,
  RoutingMatrixSchema,
  RoutingModelOperationSchema,
  RoutingRouteSchema,
  RoutingSetQuadraticCostSoftSpanUpperBoundSchema,
  RoutingSetSoftSpanUpperBoundSchema,
  type RoutingModelOperation as BridgeRoutingOperation,
} from '../generated/bridge/routing_pb.js';

export type RoutingModelOperation =
  | { type: 'addDimension'; transitMatrix: BigInt64Array; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleCapacity'; transitMatrix: BigInt64Array; slackMax: bigint; capacities: bigint[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransits'; transitMatrices: BigInt64Array[]; slackMax: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addConstantDimension'; value: bigint; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addVectorDimension'; values: bigint[]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addMatrixDimension'; matrix: bigint[][]; capacity: bigint; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDisjunction'; indices: number[]; penalty?: bigint }
  | { type: 'addPickupAndDelivery'; pickup: number; delivery: number }
  | { type: 'addVehicleEqualityConstraint'; left: number; right: number }
  | { type: 'addCumulLessOrEqualConstraint'; dimensionName: string; left: number; right: number }
  | { type: 'setSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number }
  | { type: 'setQuadraticCostSoftSpanUpperBound'; dimensionName: string; bound: bigint; cost: bigint; vehicle: number };

export type RoutingSolveRequest = {
  numLocations: number;
  numVehicles: number;
  starts: number[];
  ends: number[];
  firstSolutionStrategy: number;
  solutionLimit: number;
  transitMatrix: BigInt64Array;
  transitMatrixDimension: number;
  operations: RoutingModelOperation[];
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
  starts: number[];
  ends: number[];
  dimensionCumulValues: Record<string, bigint[]>;
};

export type RoutingOperation = {
  type: 'solve';
  request: RoutingSolveRequest;
  interruptible: boolean;
};

export type RoutingResult = {
  type: 'solve';
  solution: RoutingSolveResult | null;
};

export type RoutingExecutor = SolverExecutor<RoutingOperation, RoutingResult, never>;
export type RoutingJob = SolverJob<RoutingResult>;

function bridgeMatrix(values: BigInt64Array | bigint[], dimension: number) {
  return create(RoutingMatrixSchema, {
    values: [...values],
    dimension,
  });
}

function encodeModelOperation(
  operation: RoutingModelOperation,
  dimension: number,
): BridgeRoutingOperation {
  switch (operation.type) {
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
    case 'addConstantDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addConstantDimension', value: create(RoutingAddConstantDimensionSchema, {
        value: operation.value, capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addVectorDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addVectorDimension', value: create(RoutingAddVectorDimensionSchema, {
        values: operation.values, capacity: operation.capacity, fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addMatrixDimension':
      return create(RoutingModelOperationSchema, { operation: { case: 'addMatrixDimension', value: create(RoutingAddMatrixDimensionSchema, {
        matrix: bridgeMatrix(operation.matrix.flat(), operation.matrix.length), capacity: operation.capacity,
        fixStartCumulToZero: operation.fixStartCumulToZero, name: operation.name,
      }) } });
    case 'addDisjunction':
      return create(RoutingModelOperationSchema, { operation: { case: 'addDisjunction', value: create(RoutingAddDisjunctionSchema, {
        indices: bridgeIndices(operation.indices, 'disjunction indices'), penalty: operation.penalty,
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
    case 'addDimension': { const value = input.operation.value; return { type: 'addDimension', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleCapacity', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: value.slackMax, capacities: value.capacities, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleTransits': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransits', transitMatrices: value.transitMatrices.map((item) => new BigInt64Array(item.values)), slackMax: value.slackMax, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addConstantDimension': { const value = input.operation.value; return { type: 'addConstantDimension', value: value.value, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addVectorDimension': { const value = input.operation.value; return { type: 'addVectorDimension', values: value.values, capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addMatrixDimension': { const value = input.operation.value; return { type: 'addMatrixDimension', matrix: decodeMatrix(value.matrix?.values ?? [], value.matrix?.dimension ?? 0), capacity: value.capacity, fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDisjunction': { const value = input.operation.value; return { type: 'addDisjunction', indices: indices(value.indices, 'disjunction indices'), penalty: value.penalty }; }
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
    numLocations: request.numLocations,
    numVehicles: request.numVehicles,
    starts: request.starts,
    ends: request.ends,
    firstSolutionStrategy: request.firstSolutionStrategy,
    solutionLimit: BigInt(toIndex(request.solutionLimit, 'solution limit', 2_147_483_647)),
    transitMatrix: bridgeMatrix(request.transitMatrix, request.transitMatrixDimension),
    operations: request.operations.map((item) => encodeModelOperation(item, request.transitMatrixDimension)),
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
  }));
}

function decodeOperation(payload: Uint8Array): RoutingOperation {
  const request = fromBinary(RoutingBridgeRequestSchema, payload);
  if (!request.transitMatrix) throw new Error('Routing request has no transit matrix.');
  return {
    type: 'solve',
    interruptible: request.interruptible,
    request: {
      numLocations: request.numLocations,
      numVehicles: request.numVehicles,
      starts: request.starts,
      ends: request.ends,
      firstSolutionStrategy: request.firstSolutionStrategy,
      solutionLimit: toIndex(request.solutionLimit, 'solution limit', 2_147_483_647),
      transitMatrix: new BigInt64Array(request.transitMatrix.values),
      transitMatrixDimension: request.transitMatrix.dimension,
      operations: request.operations.map(decodeModelOperation),
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
  return toBinary(RoutingBridgeResponseSchema, create(RoutingBridgeResponseSchema, solution ? {
    hasSolution: true,
    status: solution.status,
    objectiveValue: solution.objectiveValue,
    nextValues: bridgeIndices(solution.nextValues, 'next values'),
    starts: bridgeIndices(solution.starts, 'starts'),
    ends: bridgeIndices(solution.ends, 'ends'),
    dimensions: Object.entries(solution.dimensionCumulValues).map(([name, cumulValues]) => ({
      name,
      cumulValues,
    })),
  } : { hasSolution: false }));
}

function decodeResult(payload: Uint8Array): RoutingResult {
  const response = fromBinary(RoutingBridgeResponseSchema, payload);
  return {
    type: 'solve',
    solution: response.hasSolution ? {
      status: response.status,
      objectiveValue: response.objectiveValue,
      nextValues: indices(response.nextValues, 'next values'),
      starts: indices(response.starts, 'starts'),
      ends: indices(response.ends, 'ends'),
      dimensionCumulValues: Object.fromEntries(
        response.dimensions.map((item) => [item.name, item.cumulValues]),
      ),
    } : null,
  };
}

export const routingProtocol: SolverBridgeCodec<RoutingOperation, RoutingResult, never> = {
  solver: 'routing',
  label: 'Routing',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
