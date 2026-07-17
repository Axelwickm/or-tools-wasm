import {
  SolverFailureKind as GeneratedSolverFailureKind,
  SolverJobState as GeneratedSolverJobState,
  type SolverJobFailure as GeneratedSolverJobFailure,
  type SolverJobStatus as GeneratedSolverJobStatus,
} from './generated/bridge/job_pb.js';

export const DEFAULT_SOLVER_STATUS_INTERVAL_MS = 2000;

export type SolverExecutorEventHandler<Event> = (event: Event) => void | Promise<void>;

export const SolverJobState = GeneratedSolverJobState;

export type SolverJobStatus = GeneratedSolverJobStatus;

export const SolverFailureKind = GeneratedSolverFailureKind;

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
