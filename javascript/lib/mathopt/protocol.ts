import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { MathOptIndicatorToMipRequestSchema, MathOptRobustConstraintRequestSchema } from '../generated/bridge/mathopt_model_transform_pb.js';
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
  MathOptInfeasibleSubsystemRequestSchema,
} from '../generated/bridge/mathopt_pb.js';

export type MathOptOperation =
  | { type: 'addRobustConstraint'; request: Uint8Array }
  | { type: 'formulateIndicatorConstraintAsMip'; model: Uint8Array; indicatorConstraintId: bigint }
  | { type: 'expressionBounds'; request: Uint8Array }
  | { type: 'improveSolution'; request: Uint8Array }
  | { type: 'checkPrimalFeasibility'; request: Uint8Array }
  | { type: 'computeInfeasibleSubsystem'; request: Uint8Array; useInterrupter: boolean; interruptAtStart: boolean; streamMessages?: boolean; handle?: bigint; modelUpdate?: Uint8Array }
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

export type MathOptResult = { expressionBounds: Uint8Array } | { improvedValues: Uint8Array } | { primalFeasibility: Uint8Array } | { response: Uint8Array } | { mps: string } | { model: Uint8Array } | { validationError: string } | { validatedResult: Uint8Array } | { updated: boolean };
export type MathOptLogEvent = { type: 'log'; messages: string[] };
export type MathOptExecutor = SolverExecutor<MathOptOperation, MathOptResult, MathOptLogEvent>;
export type MathOptJob = SolverJob<MathOptResult>;

function encodeOperation(operation: MathOptOperation): Uint8Array {
  let payload;
  switch (operation.type) {
    case 'addRobustConstraint': payload = { case: 'addRobustConstraint' as const, value: fromBinary(MathOptRobustConstraintRequestSchema, operation.request) }; break;
    case 'formulateIndicatorConstraintAsMip': payload = { case: 'formulateIndicatorConstraintAsMip' as const, value: create(MathOptIndicatorToMipRequestSchema, { modelProto: operation.model, indicatorConstraintId: operation.indicatorConstraintId }) }; break;
    case 'expressionBounds': payload = { case: 'expressionBounds' as const, value: operation.request }; break;
    case 'improveSolution': payload = { case: 'improveSolution' as const, value: operation.request }; break;
    case 'checkPrimalFeasibility': payload = { case: 'checkPrimalFeasibility' as const, value: operation.request }; break;
    case 'computeInfeasibleSubsystem': payload = { case: 'computeInfeasibleSubsystem' as const,
      value: create(MathOptInfeasibleSubsystemRequestSchema, { solveRequestProto: operation.request,
        useInterrupter: operation.useInterrupter, interruptAtStart: operation.interruptAtStart, streamMessages: operation.streamMessages,
        handle: operation.handle, modelUpdateProto: operation.modelUpdate }) }; break;
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
    case 'addRobustConstraint': return { type: 'addRobustConstraint', request: toBinary(MathOptRobustConstraintRequestSchema, request.payload.value) };
    case 'formulateIndicatorConstraintAsMip': return { type: 'formulateIndicatorConstraintAsMip', model: request.payload.value.modelProto, indicatorConstraintId: request.payload.value.indicatorConstraintId };
    case 'expressionBounds': return { type: 'expressionBounds', request: request.payload.value };
    case 'improveSolution': return { type: 'improveSolution', request: request.payload.value };
    case 'checkPrimalFeasibility': return { type: 'checkPrimalFeasibility', request: request.payload.value };
    case 'computeInfeasibleSubsystem': return { type: 'computeInfeasibleSubsystem', request: request.payload.value.solveRequestProto,
      useInterrupter: request.payload.value.useInterrupter, interruptAtStart: request.payload.value.interruptAtStart,
      streamMessages: request.payload.value.streamMessages,
      ...(request.payload.value.handle === undefined ? {} : { handle: request.payload.value.handle }),
      ...(request.payload.value.modelUpdateProto === undefined ? {} : { modelUpdate: request.payload.value.modelUpdateProto }) };
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
      conversionResult: 'expressionBounds' in result ? { case: 'expressionBounds', value: result.expressionBounds } : 'improvedValues' in result ? { case: 'improvedValues', value: result.improvedValues } : 'primalFeasibility' in result ? { case: 'primalFeasibility', value: result.primalFeasibility } : 'updated' in result ? { case: 'updateApplied', value: result.updated } : 'validatedResult' in result ? { case: 'validatedResultProto', value: result.validatedResult } : 'validationError' in result ? { case: 'validationError', value: result.validationError } : 'mps' in result ? { case: 'mps', value: result.mps } : 'model' in result ? { case: 'modelProto', value: result.model } : undefined,
    }),
  ),
  decodeResult: (payload) => {
    const response = fromBinary(MathOptBridgeResponseSchema, payload);
    if (response.conversionResult.case === 'updateApplied') return { updated: response.conversionResult.value };
    if (response.conversionResult.case === 'expressionBounds') return { expressionBounds: response.conversionResult.value };
    if (response.conversionResult.case === 'improvedValues') return { improvedValues: response.conversionResult.value };
    if (response.conversionResult.case === 'primalFeasibility') return { primalFeasibility: response.conversionResult.value };
    if (response.conversionResult.case === 'validatedResultProto') return { validatedResult: response.conversionResult.value };
    if (response.conversionResult.case === 'validationError') return { validationError: response.conversionResult.value };
    if (response.conversionResult.case === 'mps') return { mps: response.conversionResult.value };
    if (response.conversionResult.case === 'modelProto') return { model: response.conversionResult.value };
    return { response: response.solveResponseProto };
  },
};
