import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  SolverBridgeRequestSchema,
  SolverBridgeResponseSchema,
  SolverCancelRequestSchema,
  SolverExecutionSettingsSchema,
  SolverJobCancelledSchema,
  type SolverBridgeRequest,
  type SolverBridgeResponse,
  type SolverJobFailure,
  type SolverJobStatus,
} from './generated/bridge/job_pb.js';

export type SolverBridgeCodec<Request, Response, Event> = {
  solver: string;
  label: string;
  encodeRequest(request: Request): Uint8Array;
  decodeRequest(payload: Uint8Array): Request;
  encodeResult(response: Response): Uint8Array;
  decodeResult(payload: Uint8Array): Response;
  encodeEvent?(event: Event): Uint8Array;
  decodeEvent?(payload: Uint8Array): Event | null;
  defaultRequestedThreads?: number;
};

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
    settings: create(SolverExecutionSettingsSchema, {
      requestedThreads: input.requestedThreads ?? 0,
    }),
    operation: { case: 'executePayload', value: input.payload },
  }));
}

export function encodeSolverBridgeCancelRequest(
  requestId: number,
  solver: string,
  targetRequestId: number,
): Uint8Array {
  return toBinary(SolverBridgeRequestSchema, create(SolverBridgeRequestSchema, {
    requestId,
    solver,
    operation: {
      case: 'cancel',
      value: create(SolverCancelRequestSchema, { targetRequestId }),
    },
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
  sequenceId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    sequenceId,
    payload: { case: 'eventPayload', value: payload },
  }));
}

export function encodeSolverBridgeResult(
  requestId: number,
  solver: string,
  payload: Uint8Array,
  jobId = 0n,
  sequenceId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    sequenceId,
    payload: { case: 'resultPayload', value: payload },
  }));
}

export function encodeSolverBridgeStatus(
  requestId: number,
  solver: string,
  status: SolverJobStatus,
  jobId = 0n,
  sequenceId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    sequenceId,
    payload: { case: 'status', value: status },
  }));
}

export function encodeSolverBridgeFailure(
  requestId: number,
  solver: string,
  failure: SolverJobFailure,
  jobId = 0n,
  sequenceId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    sequenceId,
    payload: { case: 'failure', value: failure },
  }));
}

export function encodeSolverBridgeCancelled(
  requestId: number,
  solver: string,
  targetRequestId: number,
  jobId = 0n,
  sequenceId = 0n,
): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, create(SolverBridgeResponseSchema, {
    requestId,
    solver,
    jobId,
    sequenceId,
    payload: {
      case: 'cancelled',
      value: create(SolverJobCancelledSchema, { targetRequestId }),
    },
  }));
}

export function encodeSolverBridgeResponse(response: SolverBridgeResponse): Uint8Array {
  return toBinary(SolverBridgeResponseSchema, response);
}

export function decodeSolverBridgeResponse(bytes: Uint8Array): SolverBridgeResponse {
  return fromBinary(SolverBridgeResponseSchema, bytes);
}
