import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  LinearSumAssignmentRequestSchema,
  MaxFlowRequestSchema,
  MinCostFlowRequestSchema,
  NetworkFlowBridgeRequestSchema,
  NetworkFlowBridgeResponseSchema,
} from '../generated/bridge/network_flow_pb.js';

export type MaxFlowOperation = {
  type: 'maxFlow';
  tails: number[];
  heads: number[];
  capacities: number[];
  source: number;
  sink: number;
};

export type MinCostFlowOperation = {
  type: 'minCostFlow';
  tails: number[];
  heads: number[];
  capacities: number[];
  unitCosts: number[];
  supplies: number[];
  solveMaxFlowWithMinCost: boolean;
};

export type LinearSumAssignmentOperation = {
  type: 'linearSumAssignment';
  leftNodes: number[];
  rightNodes: number[];
  costs: number[];
};

export type NetworkFlowOperation =
  | MaxFlowOperation
  | MinCostFlowOperation
  | LinearSumAssignmentOperation;

export type NetworkFlowResult = {
  status: number;
  optimalFlow: number;
  optimalCost: number;
  maximumFlow: number;
  numNodes: number;
  numArcs: number;
  flows: number[];
  sourceSideMinCut: number[];
  sinkSideMinCut: number[];
  rightMates: number[];
  assignmentCosts: number[];
};

export type NetworkFlowExecutor = SolverExecutor<NetworkFlowOperation, NetworkFlowResult, never>;
export type NetworkFlowJob = SolverJob<NetworkFlowResult>;

function encodeOperation(operation: NetworkFlowOperation): Uint8Array {
  const payload = operation.type === 'maxFlow'
    ? { case: 'maxFlow' as const, value: create(MaxFlowRequestSchema, operation) }
    : operation.type === 'minCostFlow'
      ? { case: 'minCostFlow' as const, value: create(MinCostFlowRequestSchema, operation) }
      : { case: 'linearSumAssignment' as const, value: create(LinearSumAssignmentRequestSchema, operation) };
  return toBinary(
    NetworkFlowBridgeRequestSchema,
    create(NetworkFlowBridgeRequestSchema, { payload }),
  );
}

function decodeOperation(payload: Uint8Array): NetworkFlowOperation {
  const request = fromBinary(NetworkFlowBridgeRequestSchema, payload);
  switch (request.payload.case) {
    case 'maxFlow': return { type: 'maxFlow', ...request.payload.value };
    case 'minCostFlow': return { type: 'minCostFlow', ...request.payload.value };
    case 'linearSumAssignment': return { type: 'linearSumAssignment', ...request.payload.value };
    default: throw new Error('Network Flow bridge request has no operation.');
  }
}

function encodeResult(result: NetworkFlowResult): Uint8Array {
  return toBinary(
    NetworkFlowBridgeResponseSchema,
    create(NetworkFlowBridgeResponseSchema, result),
  );
}

function decodeResult(payload: Uint8Array): NetworkFlowResult {
  const result = fromBinary(NetworkFlowBridgeResponseSchema, payload);
  return {
    status: result.status,
    optimalFlow: result.optimalFlow,
    optimalCost: result.optimalCost,
    maximumFlow: result.maximumFlow,
    numNodes: result.numNodes,
    numArcs: result.numArcs,
    flows: result.flows,
    sourceSideMinCut: result.sourceSideMinCut,
    sinkSideMinCut: result.sinkSideMinCut,
    rightMates: result.rightMates,
    assignmentCosts: result.assignmentCosts,
  };
}

export const networkFlowProtocol: SolverBridgeCodec<NetworkFlowOperation, NetworkFlowResult, never> = {
  solver: 'network-flow',
  label: 'Network Flow',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
