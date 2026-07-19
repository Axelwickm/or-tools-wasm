import { create } from '@bufbuild/protobuf';
import {
  decodeSolverBridgeRequest,
  encodeSolverBridgeCancelled,
  encodeSolverBridgeEvent,
  encodeSolverBridgeFailure,
  encodeSolverBridgeResult,
  encodeSolverBridgeStatus,
  type SolverBridgeCodec,
} from './solver_bridge.js';
import type {
  SolverExecutor,
  SolverJob,
  SolverJobEvent,
} from './solver_executor.js';
import { SolverFailureKind, SolverJobFailureSchema } from './generated/bridge/job_pb.js';

type SolverWorkerScope = {
  onmessage: ((event: MessageEvent<Uint8Array>) => void) | null;
  postMessage(message: Uint8Array, transfer: Transferable[]): void;
};

function isJobEvent(event: unknown): event is SolverJobEvent {
  if (!event || typeof event !== 'object' || !('type' in event)) return false;
  const type = (event as { type: unknown }).type;
  return type === 'status' || type === 'failure';
}

export function installSolverWorker<Request, Response, Event>(
  scope: SolverWorkerScope,
  executor: SolverExecutor<Request, Response, Event>,
  codec: SolverBridgeCodec<Request, Response, Event>,
): void {
  const jobs = new Map<number, SolverJob<Response>>();
  const post = (bytes: Uint8Array) => scope.postMessage(bytes, [bytes.buffer]);

  scope.onmessage = async (message: MessageEvent<Uint8Array>) => {
    let requestId = 0;
    let failureSent = false;
    try {
      const outer = decodeSolverBridgeRequest(message.data);
      requestId = outer.requestId;
      if (outer.solver !== codec.solver) {
        throw new Error(`${codec.label} worker received request for solver ${outer.solver}.`);
      }
      if (outer.operation.case === 'cancel') {
        const targetRequestId = outer.operation.value.targetRequestId;
        await jobs.get(targetRequestId)?.cancel();
        post(encodeSolverBridgeCancelled(requestId, codec.solver, targetRequestId));
        return;
      }
      if (outer.operation.case !== 'executePayload') {
        throw new Error(`${codec.label} worker request has no operation.`);
      }

      const job = executor.execute(codec.decodeRequest(outer.operation.value), {
        requestedThreads: outer.settings?.requestedThreads ?? codec.defaultRequestedThreads ?? 0,
        onEvent: async (event) => {
          if (isJobEvent(event)) {
            if (event.type === 'status') {
              post(encodeSolverBridgeStatus(requestId, codec.solver, event.status));
            } else {
              failureSent = true;
              post(encodeSolverBridgeFailure(requestId, codec.solver, event.failure));
            }
            return;
          }
          if (!codec.encodeEvent) {
            throw new Error(`${codec.label} executor emitted an unsupported solver event.`);
          }
          post(encodeSolverBridgeEvent(requestId, codec.solver, codec.encodeEvent(event)));
        },
      });
      jobs.set(requestId, job);
      try {
        const result = await job.result;
        post(encodeSolverBridgeResult(requestId, codec.solver, codec.encodeResult(result)));
      } finally {
        jobs.delete(requestId);
      }
    } catch (error) {
      if (failureSent) return;
      const failure = create(SolverJobFailureSchema, {
        requestId,
        solver: codec.solver,
        kind: SolverFailureKind.WORKER_CRASH,
        message: error instanceof Error ? error.message : String(error),
        trace: error instanceof Error ? error.stack ?? '' : '',
        retryable: true,
      });
      post(encodeSolverBridgeFailure(requestId, codec.solver, failure));
    }
  };
}
