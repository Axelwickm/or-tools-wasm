import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  MathOptBridgeRequestSchema,
  MathOptBridgeResponseSchema,
  MathOptIncrementalCreateRequestSchema,
  MathOptIncrementalDeleteRequestSchema,
  MathOptIncrementalSolveRequestSchema,
  MathOptIncrementalUpdateRequestSchema,
  MathOptSolveRequestSchema,
  MathOptLogEventSchema,
  MathOptValidateResultRequestSchema,
  MathOptConvertResultRequestSchema,
} from '../generated/bridge/mathopt_pb.js';

export type MathOptOperation =
  | {
    type: 'solve';
    request: Uint8Array;
    useInterrupter: boolean;
    interruptAtStart: boolean;
    callbackRegistration?: Uint8Array;
    streamMessages?: boolean;
  }
  | { type: 'incrementalCreate'; request: Uint8Array }
  | {
    type: 'incrementalSolve';
    handle: bigint;
    request: Uint8Array;
    modelUpdate?: Uint8Array;
    useInterrupter: boolean;
    interruptAtStart: boolean;
    callbackRegistration?: Uint8Array;
    streamMessages?: boolean;
  }
  | { type: 'incrementalDelete'; handle: bigint }
  | { type: 'incrementalUpdate'; handle: bigint; modelUpdate: Uint8Array }
  | { type: 'validateModel'; model: Uint8Array }
  | { type: 'validateResult'; request: Uint8Array; result: Uint8Array }
  | { type: 'convertResult'; kind: number; model: Uint8Array; input: Uint8Array }
  | { type: 'modelProtoToMps'; model: Uint8Array }
  | { type: 'mpsToModelProto'; mps: string };

export type MathOptResult = { response: Uint8Array } | { mps: string } | { model: Uint8Array } | { validationError: string } | { validatedResult: Uint8Array } | { updated: boolean };
export type MathOptLogEvent = { type: 'log'; messages: string[] };
export type MathOptExecutor = SolverExecutor<MathOptOperation, MathOptResult, MathOptLogEvent>;
export type MathOptJob = SolverJob<MathOptResult>;

function encodeOperation(operation: MathOptOperation): Uint8Array {
  let payload;
  switch (operation.type) {
    case 'convertResult': payload = { case: 'convertResult' as const, value: create(MathOptConvertResultRequestSchema,
      { kind: operation.kind, modelProto: operation.model, inputProto: operation.input }) }; break;
    case 'incrementalUpdate': payload = { case: 'incrementalUpdate' as const,
      value: create(MathOptIncrementalUpdateRequestSchema, { handle: operation.handle, modelUpdateProto: operation.modelUpdate }) }; break;
    case 'validateResult': payload = { case: 'validateResult' as const, value: create(MathOptValidateResultRequestSchema, { solveRequestProto: operation.request, resultProto: operation.result }) }; break;
    case 'validateModel': payload = { case: 'validateModel' as const, value: operation.model }; break;
    case 'modelProtoToMps': payload = { case: 'modelProtoToMps' as const, value: operation.model }; break;
    case 'mpsToModelProto': payload = { case: 'mpsToModelProto' as const, value: operation.mps }; break;
    case 'solve':
      payload = {
        case: 'solve' as const,
        value: create(MathOptSolveRequestSchema, {
          solveRequestProto: operation.request,
          useInterrupter: operation.useInterrupter,
          interruptAtStart: operation.interruptAtStart,
          callbackRegistrationProto: operation.callbackRegistration,
          streamMessages: operation.streamMessages,
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
          callbackRegistrationProto: operation.callbackRegistration,
          streamMessages: operation.streamMessages,
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
    case 'convertResult': return { type: 'convertResult', kind: request.payload.value.kind,
      model: request.payload.value.modelProto, input: request.payload.value.inputProto };
    case 'incrementalUpdate': return { type: 'incrementalUpdate', handle: request.payload.value.handle, modelUpdate: request.payload.value.modelUpdateProto };
    case 'validateResult': return { type: 'validateResult', request: request.payload.value.solveRequestProto, result: request.payload.value.resultProto };
    case 'validateModel': return { type: 'validateModel', model: request.payload.value };
    case 'modelProtoToMps': return { type: 'modelProtoToMps', model: request.payload.value };
    case 'mpsToModelProto': return { type: 'mpsToModelProto', mps: request.payload.value };
    case 'solve':
      return {
        type: 'solve',
        request: request.payload.value.solveRequestProto,
        useInterrupter: request.payload.value.useInterrupter,
        interruptAtStart: request.payload.value.interruptAtStart,
        callbackRegistration: request.payload.value.callbackRegistrationProto,
        streamMessages: request.payload.value.streamMessages,
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
        callbackRegistration: request.payload.value.callbackRegistrationProto,
        streamMessages: request.payload.value.streamMessages,
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
  MathOptLogEvent
> = {
  solver: 'mathopt',
  label: 'MathOpt',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeEvent: event => toBinary(MathOptLogEventSchema, create(MathOptLogEventSchema, { messages: event.messages })),
  decodeEvent: payload => ({ type: 'log', messages: fromBinary(MathOptLogEventSchema, payload).messages }),
  encodeResult: (result) => toBinary(
    MathOptBridgeResponseSchema,
    create(MathOptBridgeResponseSchema, {
      solveResponseProto: 'response' in result ? result.response : undefined,
      conversionResult: 'updated' in result ? { case: 'updateApplied', value: result.updated } : 'validatedResult' in result ? { case: 'validatedResultProto', value: result.validatedResult } : 'validationError' in result ? { case: 'validationError', value: result.validationError } : 'mps' in result ? { case: 'mps', value: result.mps } : 'model' in result ? { case: 'modelProto', value: result.model } : undefined,
    }),
  ),
  decodeResult: (payload) => {
    const response = fromBinary(MathOptBridgeResponseSchema, payload);
    if (response.conversionResult.case === 'updateApplied') return { updated: response.conversionResult.value };
    if (response.conversionResult.case === 'validatedResultProto') return { validatedResult: response.conversionResult.value };
    if (response.conversionResult.case === 'validationError') return { validationError: response.conversionResult.value };
    if (response.conversionResult.case === 'mps') return { mps: response.conversionResult.value };
    if (response.conversionResult.case === 'modelProto') return { model: response.conversionResult.value };
    return { response: response.solveResponseProto };
  },
};
