import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  MathOptBridgeRequestSchema,
  MathOptBridgeResponseSchema,
  MathOptIncrementalCreateRequestSchema,
  MathOptIncrementalDeleteRequestSchema,
  MathOptIncrementalSolveRequestSchema,
  MathOptSolveRequestSchema,
} from '../generated/bridge/mathopt_pb.js';

export type MathOptOperation =
  | {
    type: 'solve';
    request: Uint8Array;
    useInterrupter: boolean;
    interruptAtStart: boolean;
  }
  | { type: 'incrementalCreate'; request: Uint8Array }
  | {
    type: 'incrementalSolve';
    handle: bigint;
    request: Uint8Array;
    modelUpdate?: Uint8Array;
    useInterrupter: boolean;
    interruptAtStart: boolean;
  }
  | { type: 'incrementalDelete'; handle: bigint };

export type MathOptResult = { response: Uint8Array };
export type MathOptExecutor = SolverExecutor<MathOptOperation, MathOptResult, never>;
export type MathOptJob = SolverJob<MathOptResult>;

function encodeOperation(operation: MathOptOperation): Uint8Array {
  let payload;
  switch (operation.type) {
    case 'solve':
      payload = {
        case: 'solve' as const,
        value: create(MathOptSolveRequestSchema, {
          solveRequestProto: operation.request,
          useInterrupter: operation.useInterrupter,
          interruptAtStart: operation.interruptAtStart,
        }),
      };
      break;
    case 'incrementalCreate':
      payload = {
        case: 'incrementalCreate' as const,
        value: create(MathOptIncrementalCreateRequestSchema, {
          solveRequestProto: operation.request,
        }),
      };
      break;
    case 'incrementalSolve':
      payload = {
        case: 'incrementalSolve' as const,
        value: create(MathOptIncrementalSolveRequestSchema, {
          handle: operation.handle,
          solveRequestProto: operation.request,
          modelUpdateProto: operation.modelUpdate,
          useInterrupter: operation.useInterrupter,
          interruptAtStart: operation.interruptAtStart,
        }),
      };
      break;
    case 'incrementalDelete':
      payload = {
        case: 'incrementalDelete' as const,
        value: create(MathOptIncrementalDeleteRequestSchema, {
          handle: operation.handle,
        }),
      };
      break;
  }
  return toBinary(
    MathOptBridgeRequestSchema,
    create(MathOptBridgeRequestSchema, { payload }),
  );
}

function decodeOperation(payload: Uint8Array): MathOptOperation {
  const request = fromBinary(MathOptBridgeRequestSchema, payload);
  switch (request.payload.case) {
    case 'solve':
      return {
        type: 'solve',
        request: request.payload.value.solveRequestProto,
        useInterrupter: request.payload.value.useInterrupter,
        interruptAtStart: request.payload.value.interruptAtStart,
      };
    case 'incrementalCreate':
      return {
        type: 'incrementalCreate',
        request: request.payload.value.solveRequestProto,
      };
    case 'incrementalSolve':
      return {
        type: 'incrementalSolve',
        handle: request.payload.value.handle,
        request: request.payload.value.solveRequestProto,
        modelUpdate: request.payload.value.modelUpdateProto,
        useInterrupter: request.payload.value.useInterrupter,
        interruptAtStart: request.payload.value.interruptAtStart,
      };
    case 'incrementalDelete':
      return {
        type: 'incrementalDelete',
        handle: request.payload.value.handle,
      };
    default:
      throw new Error('MathOpt bridge request has no operation.');
  }
}

export const mathOptProtocol: SolverBridgeCodec<
  MathOptOperation,
  MathOptResult,
  never
> = {
  solver: 'mathopt',
  label: 'MathOpt',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult: (result) => toBinary(
    MathOptBridgeResponseSchema,
    create(MathOptBridgeResponseSchema, {
      solveResponseProto: result.response,
    }),
  ),
  decodeResult: (payload) => ({
    response: fromBinary(MathOptBridgeResponseSchema, payload).solveResponseProto,
  }),
};
