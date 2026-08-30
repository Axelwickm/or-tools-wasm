import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  KnapsackBridgeRequestSchema,
  KnapsackBridgeResponseSchema,
  KnapsackWeightDimensionSchema,
} from '../generated/bridge/knapsack_pb.js';

export type KnapsackOperation = {
  solverType: number;
  name: string;
  useReduction: boolean;
  timeLimitSeconds: number;
  profits: number[];
  weights: number[][];
  capacities: number[];
};

export type KnapsackResult = {
  profit: number;
  optimal: boolean;
  contains: boolean[];
};

export type KnapsackExecutor = SolverExecutor<KnapsackOperation, KnapsackResult, never>;
export type KnapsackJob = SolverJob<KnapsackResult>;

function encodeOperation(operation: KnapsackOperation): Uint8Array {
  return toBinary(KnapsackBridgeRequestSchema, create(KnapsackBridgeRequestSchema, {
    solverType: operation.solverType,
    name: operation.name,
    useReduction: operation.useReduction,
    timeLimitSeconds: operation.timeLimitSeconds,
    profits: operation.profits,
    weights: operation.weights.map((values) => create(KnapsackWeightDimensionSchema, { values })),
    capacities: operation.capacities,
  }));
}

function decodeOperation(payload: Uint8Array): KnapsackOperation {
  const request = fromBinary(KnapsackBridgeRequestSchema, payload);
  return {
    solverType: request.solverType,
    name: request.name,
    useReduction: request.useReduction,
    timeLimitSeconds: request.timeLimitSeconds,
    profits: request.profits,
    weights: request.weights.map((dimension) => dimension.values),
    capacities: request.capacities,
  };
}

function encodeResult(result: KnapsackResult): Uint8Array {
  return toBinary(KnapsackBridgeResponseSchema, create(KnapsackBridgeResponseSchema, result));
}

function decodeResult(payload: Uint8Array): KnapsackResult {
  const response = fromBinary(KnapsackBridgeResponseSchema, payload);
  return {
    profit: response.profit,
    optimal: response.optimal,
    contains: response.contains,
  };
}

export const knapsackProtocol: SolverBridgeCodec<KnapsackOperation, KnapsackResult, never> = {
  solver: 'knapsack',
  label: 'Knapsack',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
