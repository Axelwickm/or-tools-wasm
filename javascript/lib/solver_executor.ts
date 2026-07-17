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
};

export type SolverExecutionOptions<Event> = {
  requestedThreads?: number;
  onEvent: SolverExecutorEventHandler<SolverJobEvent | Event>;
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
