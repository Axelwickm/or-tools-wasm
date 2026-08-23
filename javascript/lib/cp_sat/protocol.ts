import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type {
  SolverExecutor,
  SolverJob,
} from '../solver_executor.js';
import {
  CpSatBridgeRequestSchema,
  CpSatBridgeResponseSchema,
  CpSatCallbackMaskSchema,
  CpSatSolveEventSchema,
  CpSatSolveRequestSchema,
  CpSatSolveResultSchema,
  CpSatValidateRequestSchema,
  CpSatValidateResultSchema,
} from '../generated/bridge/cp_sat_pb.js';

export type CpSatCallbackMask = {
  solution: boolean;
  bestBound: boolean;
  log: boolean;
};

export type CpSatOperation =
  | {
    type: 'solve';
    model: Uint8Array;
    parameters: Uint8Array;
    callbacks: CpSatCallbackMask;
  }
  | {
    type: 'validate';
    model: Uint8Array;
  };

export type CpSatResult =
  | { type: 'solve'; response: Uint8Array }
  | { type: 'validate'; ok: boolean; message: string };

export type CpSatSolverEvent =
  | { type: 'solution'; response: Uint8Array }
  | { type: 'bestBound'; bound: number }
  | { type: 'log'; message: string };

export type CpSatExecutor = SolverExecutor<
  CpSatOperation,
  CpSatResult,
  CpSatSolverEvent
>;

export type CpSatJob = SolverJob<CpSatResult>;

function decodeRequest(payload: Uint8Array): CpSatOperation {
  const request = fromBinary(CpSatBridgeRequestSchema, payload);
  switch (request.payload.case) {
    case 'solve': {
      const { cpModelProto, satParametersProto, callbackMask } = request.payload.value;
      return {
        type: 'solve',
        model: cpModelProto,
        parameters: satParametersProto,
        callbacks: {
          solution: callbackMask?.solution ?? false,
          bestBound: callbackMask?.bestBound ?? false,
          log: callbackMask?.log ?? false,
        },
      };
    }
    case 'validate':
      return { type: 'validate', model: request.payload.value.cpModelProto };
    default:
      throw new Error('CP-SAT bridge request has no operation.');
  }
}

function decodeResponse(payload: Uint8Array) {
  return fromBinary(CpSatBridgeResponseSchema, payload);
}

export const cpSatProtocol: SolverBridgeCodec<
  CpSatOperation,
  CpSatResult,
  CpSatSolverEvent
> = {
  solver: 'cp-sat',
  label: 'CP-SAT',
  encodeRequest: (operation) => {
    const payload = operation.type === 'solve'
      ? {
        case: 'solve' as const,
        value: create(CpSatSolveRequestSchema, {
          cpModelProto: operation.model,
          satParametersProto: operation.parameters,
          callbackMask: create(CpSatCallbackMaskSchema, operation.callbacks),
        }),
      }
      : {
        case: 'validate' as const,
        value: create(CpSatValidateRequestSchema, {
          cpModelProto: operation.model,
        }),
      };
    return toBinary(
      CpSatBridgeRequestSchema,
      create(CpSatBridgeRequestSchema, { payload }),
    );
  },
  decodeRequest,
  encodeResult: (result) => {
    const payload = result.type === 'solve'
      ? {
        case: 'solveResult' as const,
        value: create(CpSatSolveResultSchema, {
          cpSolverResponseProto: result.response,
        }),
      }
      : {
        case: 'validateResult' as const,
        value: create(CpSatValidateResultSchema, {
          ok: result.ok,
          message: result.message,
        }),
      };
    return toBinary(
      CpSatBridgeResponseSchema,
      create(CpSatBridgeResponseSchema, { payload }),
    );
  },
  decodeResult: (payload) => {
    const response = decodeResponse(payload);
    switch (response.payload.case) {
      case 'solveResult':
        return {
          type: 'solve',
          response: response.payload.value.cpSolverResponseProto,
        };
      case 'validateResult':
        return {
          type: 'validate',
          ok: response.payload.value.ok,
          message: response.payload.value.message,
        };
      default:
        throw new Error('CP-SAT bridge response has no result.');
    }
  },
  encodeEvent: (event) => {
    const payload = event.type === 'solution'
      ? { case: 'solutionProto' as const, value: event.response }
      : event.type === 'bestBound'
        ? { case: 'bestBound' as const, value: event.bound }
        : { case: 'log' as const, value: event.message };
    return toBinary(CpSatBridgeResponseSchema, create(CpSatBridgeResponseSchema, {
      payload: {
        case: 'solveEvent',
        value: create(CpSatSolveEventSchema, { payload }),
      },
    }));
  },
  decodeEvent: (payload) => {
    const response = decodeResponse(payload);
    if (response.payload.case !== 'solveEvent') return null;
    const event = response.payload.value.payload;
    switch (event.case) {
      case 'solutionProto':
        return { type: 'solution', response: event.value };
      case 'bestBound':
        return { type: 'bestBound', bound: event.value };
      case 'log':
        return { type: 'log', message: event.value };
      default:
        return null;
    }
  },
};
