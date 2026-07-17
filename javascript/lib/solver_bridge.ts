import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  SolverBridgeRequestSchema,
  SolverBridgeResponseSchema,
  type SolverBridgeRequest,
  type SolverBridgeResponse,
  type SolverJobFailure,
  type SolverJobStatus,
} from './generated/bridge/job_pb.js';

export type SolverBridgeRequestInput = {
  requestId: number;
  solver: string;
  payload: Uint8Array;
  requestedThreads?: number;
};

export function encodeSolverBridgeRequest(input: SolverBridgeRequestInput): Uint8Array {
  return toBinary(SolverBridgeRequestSchema, create(SolverBridgeRequestSchema, {
    requestId: input.requestId,
    solver: input.solver,
    payload: input.payload,
    requestedThreads: input.requestedThreads ?? 0,
  }));
}

export function decodeSolverBridgeRequest(bytes: Uint8Array): SolverBridgeRequest {
  return fromBinary(SolverBridgeRequestSchema, bytes);
}

export function encodeSolverBridgeEvent(
  requestId: number,
  solver: string,
  payload: Uint8Array,
  jobId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    payload: { case: 'eventPayload', value: payload },
  }));
}

export function encodeSolverBridgeResult(
  requestId: number,
  solver: string,
  payload: Uint8Array,
  jobId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    payload: { case: 'resultPayload', value: payload },
  }));
}

export function encodeSolverBridgeStatus(
  requestId: number,
  solver: string,
  status: SolverJobStatus,
  jobId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    payload: { case: 'status', value: status },
  }));
}

export function encodeSolverBridgeFailure(
  requestId: number,
  solver: string,
  failure: SolverJobFailure,
  jobId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    payload: { case: 'failure', value: failure },
  }));
}

export function encodeSolverBridgeResponse(response: SolverBridgeResponse): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, response);
}

export function decodeSolverBridgeResponse(bytes: Uint8Array): SolverBridgeResponse {
  return fromBinary(SolverBridgeResponseSchema, bytes);
}
