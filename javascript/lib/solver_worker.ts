import { create } from '@bufbuild/protobuf';
import {
  decodeSolverBridgeRequest,
  encodeSolverBridgeCancelled,
  encodeSolverBridgeEvent,
  encodeSolverBridgeFailure,
  encodeSolverBridgeReady,
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
import { SolverCallbackTransportError } from './solver_executor.js';

type SolverWorkerScope = {
  onmessage: ((event: MessageEvent<Uint8Array>) => void) | null;
  postMessage(message: SolverWorkerMessage, transfer: Transferable[]): void;
};

export type SolverWorkerCancellationMessage = {
  type: 'shared-cancellation';
  memory: SharedArrayBuffer;
  byteOffset: number;
};

export type SolverWorkerCallbackMessage = {
  type: 'callback'; requestId: number; payload: Uint8Array; reply: SharedArrayBuffer;
};
export const WORKER_CALLBACK_REPLY_CHUNK_SIZE = 65536;
export const CALLBACK_REPLY_TIMEOUT_MS = 30000;
export type SolverWorkerMessage = Uint8Array | SolverWorkerCancellationMessage | SolverWorkerCallbackMessage;

export type SolverWorkerOptions = {
  cancellation?: () => Promise<Omit<SolverWorkerCancellationMessage, 'type'>>;
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
  options: SolverWorkerOptions = {},
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
        onCallback: payload => {
          const reply = new SharedArrayBuffer(12 + WORKER_CALLBACK_REPLY_CHUNK_SIZE);
          const control = new Int32Array(reply, 0, 3);
          scope.postMessage({ type: 'callback', requestId, payload, reply }, []);
          let bytes: Uint8Array | undefined;
          let offset = 0;
          do {
            if (Atomics.wait(control, 0, 0, CALLBACK_REPLY_TIMEOUT_MS) === 'timed-out') {
              // Close the transfer even if a chunk was published at the deadline.
              Atomics.store(control, 0, -2);
              Atomics.notify(control, 0);
              throw new SolverCallbackTransportError('Solver callback reply timed out.');
            }
            if (Atomics.load(control, 0) === -2) throw new SolverCallbackTransportError('Solver callback transport failed or was terminated.');
            if (Atomics.load(control, 0) !== 1) throw new Error('Solver callback handler failed.');
            bytes ??= new Uint8Array(Atomics.load(control, 2));
            const count = Atomics.load(control, 1);
            bytes.set(new Uint8Array(reply, 12, count), offset);
            offset += count;
            Atomics.store(control, 0, offset === bytes.length ? 2 : 0);
            Atomics.notify(control, 0);
          } while (offset < bytes.length);
          return bytes;
        },
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

  void (async () => {
    if (options.cancellation) {
      scope.postMessage({
        type: 'shared-cancellation',
        ...await options.cancellation(),
      }, []);
    }
    post(encodeSolverBridgeReady(codec.solver));
  })().catch((error: unknown) => {
    // Surface startup rejection as a worker error so the parent rejects readiness.
    setTimeout(() => { throw error; }, 0);
  });
}
