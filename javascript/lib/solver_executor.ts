import {
  create,
} from '@bufbuild/protobuf';
import {
  SolverFailureKind as GeneratedSolverFailureKind,
  SolverJobState as GeneratedSolverJobState,
  SolverJobFailureSchema,
  SolverJobStatusSchema,
  type SolverJobFailure as GeneratedSolverJobFailure,
  type SolverJobStatus as GeneratedSolverJobStatus,
} from './generated/bridge/job_pb.js';

export const DEFAULT_SOLVER_STATUS_INTERVAL_MS = 2000;

export type SolverExecutorEventHandler<Event> = (event: Event) => void | Promise<void>;

export const SolverJobState = GeneratedSolverJobState;
export type SolverJobState = GeneratedSolverJobState;

export type SolverJobStatus = GeneratedSolverJobStatus;

export const SolverFailureKind = GeneratedSolverFailureKind;
export type SolverFailureKind = GeneratedSolverFailureKind;

export type SolverJobFailure = GeneratedSolverJobFailure;

export type SolverJobEvent =
  | { type: 'status'; status: SolverJobStatus }
  | { type: 'failure'; failure: SolverJobFailure };

export type SolverJob<Response> = {
  readonly requestId: number;
  readonly result: Promise<Response>;
  cancel(): Promise<void>;
  interrupt?(): Promise<void>;
};

export class SolverExecutorBusyError extends Error {
  constructor(solver: string) {
    super(`${solver} executor already has an active job.`);
    this.name = 'SolverExecutorBusyError';
  }
}

export class SolverJobCancelledError extends Error {
  constructor(solver: string, requestId: number) {
    super(`${solver} worker job ${requestId} was cancelled.`);
    this.name = 'AbortError';
  }
}

export class SolverCancellationUnsupportedError extends Error {
  constructor(solver: string) {
    super(`${solver} direct executor does not support cancellation.`);
    this.name = 'SolverCancellationUnsupportedError';
  }
}

export class SolverCallbackTransportError extends Error {
  constructor(message: string) { super(message); this.name = 'SolverCallbackTransportError'; }
}

export type SolverResourceRequest = {
  threads?: number;
};

export type SolverExecutionOptions<Event> = {
  resources?: SolverResourceRequest;
  /** Local executors identify their runtime immediately before dispatch, so callers can guard native handles. */
  onDispatch?: (runtime: object) => void;
  onEvent: SolverExecutorEventHandler<SolverJobEvent | Event>;
  /** A native callback requires a synchronous response before search continues. */
  onCallback?: (payload: Uint8Array) => Uint8Array;
  /** Dispose resources in a late encoded bridge result after caller cancellation. */
  onAbandonedResult?: (payload: Uint8Array) => void | Promise<void>;
};

export type SolverExecutor<Request, Response, Event> = {
  readonly solver: string;
  execute(request: Request, options: SolverExecutionOptions<Event>): SolverJob<Response>;
  load(): Promise<void>;
  terminate(reason?: string): void;
};

export function createSolverJobStatusEvent(
  solver: string,
  requestId: number,
  state: SolverJobState,
  createdAtMs: bigint,
  startedAtMs: bigint = 0n,
  allocatedThreads = 0,
  queuePosition = 0,
): SolverJobEvent {
  return {
    type: 'status',
    status: create(SolverJobStatusSchema, {
      requestId,
      solver,
      state,
      createdAtMs,
      startedAtMs,
      allocatedThreads,
      queuePosition,
    }),
  };
}

export function createSolverFailureEvent(
  solver: string,
  requestId: number,
  message: string,
  kind: SolverFailureKind = SolverFailureKind.INTERNAL,
  trace = '',
  retryable = false,
): SolverJobEvent {
  return {
    type: 'failure',
    failure: create(SolverJobFailureSchema, {
      requestId,
      solver,
      kind,
      message,
      trace,
      retryable,
    }),
  };
}

// Native synchronous emitters cannot await a lower-level async event handler.
// Settled notifications must not remain retained until a long solve finishes.
export function trackPendingEvent(
  pending: Set<Promise<void>>,
  result: void | Promise<void>,
  onFailure: (error: unknown) => void,
): void {
  if (result === undefined) return;
  const tracked = Promise.resolve(result).then(
    () => { pending.delete(tracked); },
    error => { pending.delete(tracked); onFailure(error); },
  );
  pending.add(tracked);
}
