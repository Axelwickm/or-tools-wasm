export const DEFAULT_SOLVER_STATUS_INTERVAL_MS = 2000;

export type SolverExecutorEventHandler<Event> = (event: Event) => void | Promise<void>;

export const SolverJobState = {
  UNSPECIFIED: 0,
  QUEUED: 1,
  STARTING: 2,
  RUNNING: 3,
  CANCELLING: 4,
  CANCELLED: 5,
  SUCCEEDED: 6,
  FAILED: 7,
} as const;

export type SolverJobStatus = {
  requestId: number;
  solver: string;
  state: number;
  createdAtMs: bigint;
  startedAtMs: bigint;
  allocatedThreads: number;
  queuePosition: number;
};

export const SolverFailureKind = {
  UNSPECIFIED: 0,
  EXECUTOR_ERROR: 1,
  RUNTIME_LOAD_ERROR: 2,
  WORKER_CRASH: 3,
  SERVER_DISCONNECTED: 4,
  TIMEOUT: 5,
  CANCELLED: 6,
  INTERNAL: 7,
} as const;

export type SolverJobFailure = {
  requestId: number;
  solver: string;
  kind: number;
  message: string;
  trace: string;
  retryable: boolean;
};

export type SolverJobEvent =
  | { type: 'status'; status: SolverJobStatus }
  | { type: 'failure'; failure: SolverJobFailure };

export type SolverJob<Response> = {
  readonly requestId: number;
  readonly result: Promise<Response>;
  cancel(): Promise<Response>;
};

export type SolverExecutor<Request, Response, Event> = {
  readonly solver: string;
  execute(request: Request, onEvent: SolverExecutorEventHandler<Event>): SolverJob<Response>;
  load(): Promise<unknown>;
  terminate(reason?: string): void;
};
