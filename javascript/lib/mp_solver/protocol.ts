import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { MessageInitShape } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  MpSolverBridgeRequestSchema,
  MpSolverLogEventSchema,
  MpSolverCallbackRegistrationSchema,
  MpSolverBridgeResponseSchema,
  MpSolverSchemaRequestSchema,
  MpSolverCapabilitiesRequestSchema,
  MpSolverCapabilitiesResultSchema,
  MpSolverImportModelRequestSchema,
  MpSolverImportModelResultSchema,
  MpSolverValidateModelRequestSchema,
  MpSolverValidateParametersRequestSchema,
  MpSolverVerifySolutionRequestSchema,
  MpSolverSchemaResultSchema,
  MpSolverSolveRequestSchema,
  MpSolverEditSchema,
  MpSolverSessionCreateRequestSchema,
  MpSolverSessionRunRequestSchema,
  MpSolverSessionCloseRequestSchema,
  MpSolverSessionResultSchema,
  MpSolverExportModelRequestSchema,
  MpSolverActivitiesRequestSchema,
  MpSolverActivitiesResultSchema,
  MpSolverLoadSolutionRequestSchema,
  MpSolverClampSolutionRequestSchema,
  MpSolverLoadSolutionResultSchema,
} from '../generated/bridge/mp_solver_pb.js';

export type MpSolverEdit = MessageInitShape<typeof MpSolverEditSchema>;
export { MpSolverEdit_Kind, MpSolverSessionRunRequest_Action } from '../generated/bridge/mp_solver_pb.js';
export type MpSolverSearchOptions = {
  startingBasis?: { variableStatuses: number[]; constraintStatuses: number[] };
  callbackRegistration?: MessageInitShape<typeof MpSolverCallbackRegistrationSchema>;
};
export type MpSolverSessionRun = MpSolverSearchOptions & {
  type: 'sessionRun'; handle: bigint; action: number; edits: MpSolverEdit[];
  request: Uint8Array; numThreads: number; interruptible: boolean;
  streamMessages?: boolean;
  parameters?: { doubleParams: Record<number, number>; integerParams: Record<number, number> };
};

export type MpSolverOperation =
  | { type: 'clampSolution'; model: Uint8Array; solution: Uint8Array; solverType: number }
  | { type: 'capabilities'; solverType: number }
  | { type: 'sessionCreate'; request: Uint8Array }
  | MpSolverSessionRun
  | { type: 'sessionClose'; handle: bigint }
  | (MpSolverSearchOptions & {
    type: 'solve';
    request: Uint8Array;
    numThreads: number;
    interruptible: boolean;
    streamMessages?: boolean;
    editableSnapshot?: boolean;
    parameters?: { doubleParams: Record<number, number>; integerParams: Record<number, number> };
  })
  | { type: 'validateModel'; model: Uint8Array }
  | { type: 'validateParameters'; solverType: number; parameters: string }
  | { type: 'verifySolution'; model: Uint8Array; solution: Uint8Array; solverType: number; tolerance: number; logErrors: boolean }
  | { type: 'exportModel'; model: Uint8Array; format: 'lp' | 'mps'; obfuscate: boolean; fixedFormat: boolean }
  | { type: 'loadSolution'; model: Uint8Array; solution: Uint8Array; solverType: number; tolerance: number }
  | { type: 'activities'; model: Uint8Array; solution: Uint8Array; solverType: number }
  | { type: 'importModel'; model: Uint8Array; solverType: number; name: string; keepNames: boolean }
  | { type: 'schema' };

export type MpSolverNativeMetadata = {
  solverVersion: string;
  iterations: bigint;
  nodes: bigint;
  variableBasisStatus: number[];
  constraintBasisStatus: number[];
  exactConditionNumber?: number;
};


export type MpSolverResult =
  | { type: 'clampSolution'; solution: Uint8Array }
  | { type: 'capabilities'; supportsCallbacks: boolean; supportsMessageCallbacks: boolean }
  | { type: 'sessionCreate'; handle: bigint }
  | { type: 'sessionResult'; hasSolution: boolean; response: Uint8Array; metadata?: MpSolverNativeMetadata }
  | { type: 'solve'; response: Uint8Array; metadata?: MpSolverNativeMetadata }
  | { type: 'validateModel'; error: string }
  | { type: 'validateParameters'; accepted: boolean }
  | { type: 'verifySolution'; verified: boolean }
  | { type: 'exportModel'; text: string }
  | { type: 'loadSolution'; loaded: boolean; solution: Uint8Array }
  | { type: 'activities'; activities: number[] }
  | { type: 'importModel'; model: Uint8Array; status: number; error: string }
  | {
    type: 'schema';
    linearSolverProtoSchema: string;
    optionalBooleanProtoSchema: string;
    backendVersions?: Record<number, string>;
  };

export type MpSolverLogEvent = { type: 'log'; messages: string[] };
export type MpSolverExecutor = SolverExecutor<MpSolverOperation, MpSolverResult, MpSolverLogEvent>;
export type MpSolverJob = SolverJob<MpSolverResult>;

function encodeOperation(operation: MpSolverOperation): Uint8Array {
  const payload = operation.type === 'clampSolution'
    ? { case: 'clampSolution' as const, value: create(MpSolverClampSolutionRequestSchema, {
      modelProto: operation.model, solutionProto: operation.solution, solverType: operation.solverType,
    }) }
    : operation.type === 'capabilities'
    ? { case: 'capabilities' as const, value: create(MpSolverCapabilitiesRequestSchema, { solverType: operation.solverType }) }
    : operation.type === 'loadSolution'
    ? { case: 'loadSolution' as const, value: create(MpSolverLoadSolutionRequestSchema, {
      modelProto: operation.model, solutionProto: operation.solution, solverType: operation.solverType, tolerance: operation.tolerance,
    }) }
    : operation.type === 'exportModel'
    ? { case: 'exportModel' as const, value: create(MpSolverExportModelRequestSchema, {
      modelProto: operation.model, format: operation.format === 'lp' ? 0 : 1, obfuscate: operation.obfuscate, fixedFormat: operation.fixedFormat,
    }) }
    : operation.type === 'activities'
    ? { case: 'activities' as const, value: create(MpSolverActivitiesRequestSchema, {
      modelProto: operation.model, solutionProto: operation.solution, solverType: operation.solverType,
    }) }
    : operation.type === 'sessionCreate'
    ? { case: 'sessionCreate' as const, value: create(MpSolverSessionCreateRequestSchema, { requestProto: operation.request }) }
    : operation.type === 'sessionClose'
    ? { case: 'sessionClose' as const, value: create(MpSolverSessionCloseRequestSchema, { handle: operation.handle }) }
    : operation.type === 'sessionRun'
    ? { case: 'sessionRun' as const, value: create(MpSolverSessionRunRequestSchema, {
      handle: operation.handle, action: operation.action, edits: operation.edits,
      solve: { requestProto: operation.request, numThreads: operation.numThreads,
        interruptible: operation.interruptible, parameters: operation.parameters, streamMessages: operation.streamMessages,
        startingBasis: operation.startingBasis, callbackRegistration: operation.callbackRegistration },
    }) }
    : operation.type === 'solve'
    ? {
      case: 'solve' as const,
      value: create(MpSolverSolveRequestSchema, {
        requestProto: operation.request,
        numThreads: operation.numThreads,
        interruptible: operation.interruptible,
        parameters: operation.parameters,
        streamMessages: operation.streamMessages,
        editableSnapshot: operation.editableSnapshot,
        startingBasis: operation.startingBasis, callbackRegistration: operation.callbackRegistration,
      }),
    }
    : operation.type === 'verifySolution'
    ? { case: 'verifySolution' as const, value: create(MpSolverVerifySolutionRequestSchema, {
      modelProto: operation.model, solutionProto: operation.solution, solverType: operation.solverType,
      tolerance: operation.tolerance, logErrors: operation.logErrors,
    }) }
    : operation.type === 'validateParameters'
    ? { case: 'validateParameters' as const, value: create(MpSolverValidateParametersRequestSchema, { solverType: operation.solverType, parameters: operation.parameters }) }
    : operation.type === 'validateModel'
    ? { case: 'validateModel' as const, value: create(MpSolverValidateModelRequestSchema, { modelProto: operation.model }) }
    : operation.type === 'importModel'
    ? { case: 'importModel' as const, value: create(MpSolverImportModelRequestSchema, {
      modelProto: operation.model, solverType: operation.solverType, name: operation.name, keepNames: operation.keepNames,
    }) }
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
    case 'capabilities': return { type: 'capabilities', solverType: request.payload.value.solverType };
    case 'clampSolution': { const value = request.payload.value; return { type: 'clampSolution', model: value.modelProto, solution: value.solutionProto, solverType: value.solverType }; }
    case 'loadSolution': { const value = request.payload.value; return { type: 'loadSolution', model: value.modelProto, solution: value.solutionProto, solverType: value.solverType, tolerance: value.tolerance }; }
    case 'exportModel': { const value = request.payload.value;
      if (value.format !== 0 && value.format !== 1) throw new Error('Unknown MPSolver export format.');
      return { type: 'exportModel', model: value.modelProto, format: value.format === 0 ? 'lp' : 'mps', obfuscate: value.obfuscate, fixedFormat: value.fixedFormat }; }
    case 'activities': { const value = request.payload.value; return {
      type: 'activities', model: value.modelProto, solution: value.solutionProto, solverType: value.solverType,
    }; }
    case 'sessionCreate': return { type: 'sessionCreate', request: request.payload.value.requestProto };
    case 'sessionClose': return { type: 'sessionClose', handle: request.payload.value.handle };
    case 'sessionRun': {
      const value = request.payload.value;
      if (!value.solve) throw new Error('MPSolver session has no execution options.');
      return { type: 'sessionRun', handle: value.handle, action: value.action, edits: value.edits,
        request: value.solve.requestProto, numThreads: value.solve.numThreads,
        interruptible: value.solve.interruptible, parameters: value.solve.parameters, streamMessages: value.solve.streamMessages,
        startingBasis: value.solve.startingBasis, callbackRegistration: value.solve.callbackRegistration };
    }
    case 'solve':
      return {
        type: 'solve',
        request: request.payload.value.requestProto,
        numThreads: request.payload.value.numThreads,
        interruptible: request.payload.value.interruptible,
        parameters: request.payload.value.parameters,
        streamMessages: request.payload.value.streamMessages,
        editableSnapshot: request.payload.value.editableSnapshot,
        startingBasis: request.payload.value.startingBasis, callbackRegistration: request.payload.value.callbackRegistration,
      };
    case 'verifySolution': { const value = request.payload.value; return {
      type: 'verifySolution', model: value.modelProto, solution: value.solutionProto, solverType: value.solverType,
      tolerance: value.tolerance, logErrors: value.logErrors,
    }; }
    case 'validateModel': return { type: 'validateModel', model: request.payload.value.modelProto };
    case 'validateParameters': return { type: 'validateParameters', solverType: request.payload.value.solverType, parameters: request.payload.value.parameters };
    case 'importModel': { const value = request.payload.value; return { type: 'importModel', model: value.modelProto, solverType: value.solverType, name: value.name, keepNames: value.keepNames }; }
    case 'schema':
      return { type: 'schema' };
    default:
      throw new Error('MP Solver bridge request has no operation.');
  }
}

function encodeResult(result: MpSolverResult): Uint8Array {
  const payload = result.type === 'clampSolution'
    ? { case: 'clampedSolution' as const, value: result.solution }
    : result.type === 'capabilities'
    ? { case: 'capabilities' as const, value: create(MpSolverCapabilitiesResultSchema, result) }
    : result.type === 'loadSolution'
    ? { case: 'loadSolution' as const, value: create(MpSolverLoadSolutionResultSchema, { loaded: result.loaded, solutionProto: result.solution }) }
    : result.type === 'exportModel'
    ? { case: 'exportedModel' as const, value: result.text }
    : result.type === 'activities'
    ? { case: 'activities' as const, value: create(MpSolverActivitiesResultSchema, { activities: result.activities }) }
    : result.type === 'sessionCreate'
    ? { case: 'sessionHandle' as const, value: result.handle }
    : result.type === 'sessionResult'
    ? { case: 'sessionResult' as const, value: create(MpSolverSessionResultSchema, {
      hasSolution: result.hasSolution, responseProto: result.response, metadata: result.metadata,
    }) }
    : result.type === 'solve'
    ? { case: 'responseProto' as const, value: result.response }
    : result.type === 'verifySolution'
    ? { case: 'solutionVerified' as const, value: result.verified }
    : result.type === 'validateParameters'
    ? { case: 'parametersAccepted' as const, value: result.accepted }
    : result.type === 'validateModel'
    ? { case: 'modelValidationError' as const, value: result.error }
    : result.type === 'importModel'
    ? { case: 'importModel' as const, value: create(MpSolverImportModelResultSchema, { modelProto: result.model, status: result.status, error: result.error }) }
    : {
      case: 'schema' as const,
      value: create(MpSolverSchemaResultSchema, {
        linearSolverProtoSchema: result.linearSolverProtoSchema,
        optionalBooleanProtoSchema: result.optionalBooleanProtoSchema,
        backendVersions: result.backendVersions,
      }),
    };
  return toBinary(
    MpSolverBridgeResponseSchema,
    create(MpSolverBridgeResponseSchema, { payload, metadata: result.type === 'solve' ? result.metadata : undefined }),
  );
}

function decodeResult(payload: Uint8Array): MpSolverResult {
  const response = fromBinary(MpSolverBridgeResponseSchema, payload);
  switch (response.payload.case) {
    case 'capabilities': return { type: 'capabilities', supportsCallbacks: response.payload.value.supportsCallbacks,
      supportsMessageCallbacks: response.payload.value.supportsMessageCallbacks };
    case 'clampedSolution': return { type: 'clampSolution', solution: response.payload.value };
    case 'loadSolution': return { type: 'loadSolution', loaded: response.payload.value.loaded, solution: response.payload.value.solutionProto };
    case 'exportedModel': return { type: 'exportModel', text: response.payload.value };
    case 'activities': return { type: 'activities', activities: response.payload.value.activities };
    case 'sessionHandle': return { type: 'sessionCreate', handle: response.payload.value };
    case 'sessionResult': return { type: 'sessionResult', hasSolution: response.payload.value.hasSolution,
      response: response.payload.value.responseProto, metadata: response.payload.value.metadata };
    case 'responseProto':
      return { type: 'solve', response: response.payload.value, metadata: response.metadata };
    case 'solutionVerified': return { type: 'verifySolution', verified: response.payload.value };
    case 'modelValidationError': return { type: 'validateModel', error: response.payload.value };
    case 'parametersAccepted': return { type: 'validateParameters', accepted: response.payload.value };
    case 'importModel': { const value = response.payload.value; return { type: 'importModel', model: value.modelProto, status: value.status, error: value.error }; }
    case 'schema':
      return {
        type: 'schema',
        linearSolverProtoSchema: response.payload.value.linearSolverProtoSchema,
        optionalBooleanProtoSchema: response.payload.value.optionalBooleanProtoSchema,
        backendVersions: response.payload.value.backendVersions,
      };
    default:
      throw new Error('MP Solver bridge response has no result.');
  }
}

export const mpSolverProtocol: SolverBridgeCodec<
  MpSolverOperation,
  MpSolverResult,
  MpSolverLogEvent
> = {
  solver: 'mp-solver',
  label: 'MP Solver',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
  encodeEvent: event => toBinary(MpSolverLogEventSchema, create(MpSolverLogEventSchema, { messages: event.messages })),
  decodeEvent: payload => ({ type: 'log', messages: fromBinary(MpSolverLogEventSchema, payload).messages }),
};
