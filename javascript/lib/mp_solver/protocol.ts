import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  MpSolverBridgeRequestSchema,
  MpSolverBridgeResponseSchema,
  MpSolverSchemaRequestSchema,
  MpSolverSchemaResultSchema,
  MpSolverSolveRequestSchema,
} from '../generated/bridge/mp_solver_pb.js';

export type MpSolverOperation =
  | {
    type: 'solve';
    request: Uint8Array;
    numThreads: number;
    interruptible: boolean;
  }
  | { type: 'schema' };

export type MpSolverResult =
  | { type: 'solve'; response: Uint8Array }
  | {
    type: 'schema';
    linearSolverProtoSchema: string;
    optionalBooleanProtoSchema: string;
  };

export type MpSolverExecutor = SolverExecutor<MpSolverOperation, MpSolverResult, never>;
export type MpSolverJob = SolverJob<MpSolverResult>;

function encodeOperation(operation: MpSolverOperation): Uint8Array {
  const payload = operation.type === 'solve'
    ? {
      case: 'solve' as const,
      value: create(MpSolverSolveRequestSchema, {
        requestProto: operation.request,
        numThreads: operation.numThreads,
        interruptible: operation.interruptible,
      }),
    }
    : {
      case: 'schema' as const,
      value: create(MpSolverSchemaRequestSchema),
    };
  return toBinary(
    MpSolverBridgeRequestSchema,
    create(MpSolverBridgeRequestSchema, { payload }),
  );
}

function decodeOperation(payload: Uint8Array): MpSolverOperation {
  const request = fromBinary(MpSolverBridgeRequestSchema, payload);
  switch (request.payload.case) {
    case 'solve':
      return {
        type: 'solve',
        request: request.payload.value.requestProto,
        numThreads: request.payload.value.numThreads,
        interruptible: request.payload.value.interruptible,
      };
    case 'schema':
      return { type: 'schema' };
    default:
      throw new Error('MP Solver bridge request has no operation.');
  }
}

function encodeResult(result: MpSolverResult): Uint8Array {
  const payload = result.type === 'solve'
    ? { case: 'responseProto' as const, value: result.response }
    : {
      case: 'schema' as const,
      value: create(MpSolverSchemaResultSchema, {
        linearSolverProtoSchema: result.linearSolverProtoSchema,
        optionalBooleanProtoSchema: result.optionalBooleanProtoSchema,
      }),
    };
  return toBinary(
    MpSolverBridgeResponseSchema,
    create(MpSolverBridgeResponseSchema, { payload }),
  );
}

function decodeResult(payload: Uint8Array): MpSolverResult {
  const response = fromBinary(MpSolverBridgeResponseSchema, payload);
  switch (response.payload.case) {
    case 'responseProto':
      return { type: 'solve', response: response.payload.value };
    case 'schema':
      return {
        type: 'schema',
        linearSolverProtoSchema: response.payload.value.linearSolverProtoSchema,
        optionalBooleanProtoSchema: response.payload.value.optionalBooleanProtoSchema,
      };
    default:
      throw new Error('MP Solver bridge response has no result.');
  }
}

export const mpSolverProtocol: SolverBridgeCodec<
  MpSolverOperation,
  MpSolverResult,
  never
> = {
  solver: 'mp-solver',
  label: 'MP Solver',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
