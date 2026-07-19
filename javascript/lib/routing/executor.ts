import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  RoutingBridgeRequestSchema,
  RoutingBridgeResponseSchema,
  type RoutingBridgeRequest,
  type RoutingBridgeResponse,
  type RoutingModelOperation as BridgeOperation,
} from '../generated/bridge/routing_pb.js';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
  type SolverJobEvent,
} from '../solver_executor.js';
import {
  solveRoutingInWorker,
  type RoutingModelOperation,
  type RoutingSolveRequest,
} from './native_runtime.js';

export type RoutingExecutorLike = SolverExecutor<RoutingBridgeRequest, RoutingBridgeResponse, never>;
export type RoutingExecutorJob = SolverJob<RoutingBridgeResponse>;
export type RoutingExecutorEvent = SolverJobEvent;

export const routingBridgeCodec: SolverBridgeCodec<RoutingBridgeRequest, RoutingBridgeResponse, never> = {
  solver: 'routing',
  label: 'Routing',
  encodeRequest: (request) => toBinary(RoutingBridgeRequestSchema, request),
  decodeRequest: (payload) => fromBinary(RoutingBridgeRequestSchema, payload),
  encodeResult: (response) => toBinary(RoutingBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(RoutingBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

function numbers(values: readonly bigint[]) { return values.map(Number); }
function matrix(values: readonly bigint[], dimension: number) {
  const flat = numbers(values);
  return Array.from({ length: dimension }, (_, row) => flat.slice(row * dimension, (row + 1) * dimension));
}

function operation(input: BridgeOperation): RoutingModelOperation {
  switch (input.operation.case) {
    case 'addDimension': { const value = input.operation.value; return { type: 'addDimension', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: Number(value.slackMax), capacity: Number(value.capacity), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleCapacity': { const value = input.operation.value; return { type: 'addDimensionWithVehicleCapacity', transitMatrix: new BigInt64Array(value.transitMatrix?.values ?? []), slackMax: Number(value.slackMax), capacities: numbers(value.capacities), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDimensionWithVehicleTransits': { const value = input.operation.value; return { type: 'addDimensionWithVehicleTransits', transitMatrices: value.transitMatrices.map((item) => new BigInt64Array(item.values)), slackMax: Number(value.slackMax), capacity: Number(value.capacity), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addConstantDimension': { const value = input.operation.value; return { type: 'addConstantDimension', value: Number(value.value), capacity: Number(value.capacity), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addVectorDimension': { const value = input.operation.value; return { type: 'addVectorDimension', values: numbers(value.values), capacity: Number(value.capacity), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addMatrixDimension': { const value = input.operation.value; return { type: 'addMatrixDimension', matrix: matrix(value.matrix?.values ?? [], value.matrix?.dimension ?? 0), capacity: Number(value.capacity), fixStartCumulToZero: value.fixStartCumulToZero, name: value.name }; }
    case 'addDisjunction': { const value = input.operation.value; return { type: 'addDisjunction', indices: numbers(value.indices), penalty: value.penalty === undefined ? undefined : Number(value.penalty) }; }
    case 'addPickupAndDelivery': { const value = input.operation.value; return { type: 'addPickupAndDelivery', pickup: Number(value.pickup), delivery: Number(value.delivery) }; }
    default: throw new Error('Routing request contains an empty model operation.');
  }
}

function legacyRequest(request: RoutingBridgeRequest): RoutingSolveRequest {
  if (!request.transitMatrix) throw new Error('Routing request has no transit matrix.');
  return {
    numLocations: request.numLocations, numVehicles: request.numVehicles,
    starts: request.starts, ends: request.ends, firstSolutionStrategy: request.firstSolutionStrategy,
    solutionLimit: Number(request.solutionLimit), transitMatrix: new BigInt64Array(request.transitMatrix.values),
    transitMatrixDimension: request.transitMatrix.dimension, operations: request.operations.map(operation),
    dimensionNames: request.dimensionNames,
  };
}

export class RoutingExecutor implements RoutingExecutorLike {
  readonly solver = 'routing';
  private nextRequestId = 1;
  async load() {}
  terminate(_reason?: string) {}
  execute(request: RoutingBridgeRequest, options: SolverExecutionOptions<never>): RoutingExecutorJob {
    const requestId = this.nextRequestId++;
    return { requestId, result: this.run(requestId, request, options), cancel: async () => {} };
  }
  private async run(requestId: number, request: RoutingBridgeRequest, options: SolverExecutionOptions<never>) {
    const createdAtMs = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.STARTING, createdAtMs));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.RUNNING, createdAtMs, BigInt(Date.now()), 1));
      const result = await solveRoutingInWorker(legacyRequest(request));
      const response = create(RoutingBridgeResponseSchema, result ? {
        hasSolution: true, status: result.status, objectiveValue: BigInt(result.objectiveValue),
        nextValues: result.nextValues.map(BigInt), starts: result.starts.map(BigInt), ends: result.ends.map(BigInt),
        dimensions: Object.entries(result.dimensionCumulValues).map(([name, cumulValues]) => ({ name, cumulValues: cumulValues.map(BigInt) })),
      } : { hasSolution: false });
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.SUCCEEDED, createdAtMs));
      return response;
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(this.solver, requestId, error instanceof Error ? error.message : String(error), SolverFailureKind.INTERNAL, error instanceof Error ? error.stack ?? '' : ''));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.FAILED, createdAtMs));
      throw error;
    }
  }
}
