import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  PdlpBridgeRequestSchema,
  PdlpBridgeResponseSchema,
  PdlpFromMpModelRequestSchema,
  PdlpFromMpModelResultSchema,
  PdlpIsLinearRequestSchema,
  PdlpIsLinearResultSchema,
  PdlpSolveRequestSchema,
  PdlpSolveResultSchema,
  PdlpSolveParametersSchema,
  PdlpToMpModelRequestSchema,
  PdlpToMpModelResultSchema,
  PdlpValidateRequestSchema,
  PdlpValidateResultSchema,
  type PdlpInitialSolution,
  type PdlpQuadraticProgram,
  type PdlpSolveParameters,
  type PdlpSolverResult,
} from '../generated/bridge/pdlp_pb.js';

export type PdlpOperation =
  | { type: 'validate'; quadraticProgram: PdlpQuadraticProgram }
  | { type: 'isLinear'; quadraticProgram: PdlpQuadraticProgram }
  | {
    type: 'fromMpModel';
    model: Uint8Array;
    relaxIntegerVariables: boolean;
    includeNames: boolean;
  }
  | { type: 'toMpModel'; quadraticProgram: PdlpQuadraticProgram }
  | {
    type: 'solve';
    quadraticProgram: PdlpQuadraticProgram;
    parameters: PdlpSolveParameters;
    initialSolution?: PdlpInitialSolution;
  };

export type PdlpResult =
  | { type: 'validate'; message: string }
  | { type: 'isLinear'; value: boolean }
  | { type: 'fromMpModel'; quadraticProgram: PdlpQuadraticProgram }
  | { type: 'toMpModel'; model: Uint8Array }
  | { type: 'solve'; result: PdlpSolverResult };

export type PdlpExecutor = SolverExecutor<PdlpOperation, PdlpResult, never>;
export type PdlpJob = SolverJob<PdlpResult>;

function decodeOperation(payload: Uint8Array): PdlpOperation {
  const request = fromBinary(PdlpBridgeRequestSchema, payload);
  switch (request.payload.case) {
    case 'validate':
      if (!request.payload.value.quadraticProgram) {
        throw new Error('PDLP validate requires a quadratic program.');
      }
      return {
        type: 'validate',
        quadraticProgram: request.payload.value.quadraticProgram,
      };
    case 'isLinear':
      if (!request.payload.value.quadraticProgram) {
        throw new Error('PDLP linearity check requires a quadratic program.');
      }
      return {
        type: 'isLinear',
        quadraticProgram: request.payload.value.quadraticProgram,
      };
    case 'fromMpModel':
      return {
        type: 'fromMpModel',
        model: request.payload.value.mpModelProto,
        relaxIntegerVariables: request.payload.value.relaxIntegerVariables,
        includeNames: request.payload.value.includeNames,
      };
    case 'toMpModel':
      if (!request.payload.value.quadraticProgram) {
        throw new Error('PDLP conversion requires a quadratic program.');
      }
      return {
        type: 'toMpModel',
        quadraticProgram: request.payload.value.quadraticProgram,
      };
    case 'solve':
      if (!request.payload.value.quadraticProgram) {
        throw new Error('PDLP solve requires a quadratic program.');
      }
      return {
        type: 'solve',
        quadraticProgram: request.payload.value.quadraticProgram,
        parameters: request.payload.value.parameters ?? create(PdlpSolveParametersSchema),
        initialSolution: request.payload.value.initialSolution,
      };
    default:
      throw new Error('PDLP bridge request has no operation.');
  }
}

function encodeResult(result: PdlpResult): Uint8Array {
  let payload;
  switch (result.type) {
    case 'validate':
      payload = {
        case: 'validateResult' as const,
        value: create(PdlpValidateResultSchema, { message: result.message }),
      };
      break;
    case 'isLinear':
      payload = {
        case: 'isLinearResult' as const,
        value: create(PdlpIsLinearResultSchema, { value: result.value }),
      };
      break;
    case 'fromMpModel':
      payload = {
        case: 'fromMpModelResult' as const,
        value: create(PdlpFromMpModelResultSchema, {
          quadraticProgram: result.quadraticProgram,
        }),
      };
      break;
    case 'toMpModel':
      payload = {
        case: 'toMpModelResult' as const,
        value: create(PdlpToMpModelResultSchema, {
          mpModelProto: result.model,
        }),
      };
      break;
    case 'solve':
      payload = {
        case: 'solveResult' as const,
        value: create(PdlpSolveResultSchema, { solverResult: result.result }),
      };
      break;
  }
  return toBinary(
    PdlpBridgeResponseSchema,
    create(PdlpBridgeResponseSchema, { payload }),
  );
}

function decodeResult(payload: Uint8Array): PdlpResult {
  const response = fromBinary(PdlpBridgeResponseSchema, payload);
  switch (response.payload.case) {
    case 'validateResult':
      return { type: 'validate', message: response.payload.value.message };
    case 'isLinearResult':
      return { type: 'isLinear', value: response.payload.value.value };
    case 'fromMpModelResult':
      if (!response.payload.value.quadraticProgram) {
        throw new Error('PDLP conversion returned no quadratic program.');
      }
      return {
        type: 'fromMpModel',
        quadraticProgram: response.payload.value.quadraticProgram,
      };
    case 'toMpModelResult':
      return { type: 'toMpModel', model: response.payload.value.mpModelProto };
    case 'solveResult':
      if (!response.payload.value.solverResult) {
        throw new Error('PDLP solve returned no result.');
      }
      return { type: 'solve', result: response.payload.value.solverResult };
    default:
      throw new Error('PDLP bridge response has no operation.');
  }
}

export const pdlpProtocol: SolverBridgeCodec<PdlpOperation, PdlpResult, never> = {
  solver: 'pdlp',
  label: 'PDLP',
  encodeRequest: (operation) => {
    let payload;
    switch (operation.type) {
      case 'validate':
        payload = {
          case: 'validate' as const,
          value: create(PdlpValidateRequestSchema, {
            quadraticProgram: operation.quadraticProgram,
          }),
        };
        break;
      case 'isLinear':
        payload = {
          case: 'isLinear' as const,
          value: create(PdlpIsLinearRequestSchema, {
            quadraticProgram: operation.quadraticProgram,
          }),
        };
        break;
      case 'fromMpModel':
        payload = {
          case: 'fromMpModel' as const,
          value: create(PdlpFromMpModelRequestSchema, {
            mpModelProto: operation.model,
            relaxIntegerVariables: operation.relaxIntegerVariables,
            includeNames: operation.includeNames,
          }),
        };
        break;
      case 'toMpModel':
        payload = {
          case: 'toMpModel' as const,
          value: create(PdlpToMpModelRequestSchema, {
            quadraticProgram: operation.quadraticProgram,
          }),
        };
        break;
      case 'solve':
        payload = {
          case: 'solve' as const,
          value: create(PdlpSolveRequestSchema, {
            quadraticProgram: operation.quadraticProgram,
            parameters: operation.parameters,
            initialSolution: operation.initialSolution,
          }),
        };
        break;
    }
    return toBinary(
      PdlpBridgeRequestSchema,
      create(PdlpBridgeRequestSchema, { payload }),
    );
  },
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
