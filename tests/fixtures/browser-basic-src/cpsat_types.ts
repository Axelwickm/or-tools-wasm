import type { SharedCaseMetadata } from './shared_case.ts';

export type ProtoInt64 = number | string | { low: number; high: number; unsigned?: boolean };

export type CpModelProto = Record<string, unknown>;

export type SolverResponse = {
  status?: unknown;
  objectiveValue?: unknown;
  bestObjectiveBound?: unknown;
  solution?: unknown[];
  solutionInfo?: unknown;
  solveLog?: string;
  wallTime?: unknown;
  numBooleans?: unknown;
  numConflicts?: unknown;
  numBranches?: unknown;
};

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

export type SolverJobState = number;

export type SolverJobStatus = {
  requestId: number;
  solver: string;
  state: SolverJobState;
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

export type SolverFailureKind = number;

export type SolverJobFailure = {
  requestId: number;
  solver: string;
  kind: SolverFailureKind;
  message: string;
  trace: string;
  retryable: boolean;
};

export type CpSatEvent =
  | { type: 'status'; status: SolverJobStatus }
  | { type: 'failure'; failure: SolverJobFailure }
  | { type: 'solution'; response: SolverResponse; bytes: Uint8Array }
  | { type: 'bestBound'; bound: number }
  | { type: 'log'; message: string };

export type CpSatSolveOptions = {
  solverParameters?: CpSatSolveParams;
  onEvent?: (event: CpSatEvent) => void;
  eventMask?: {
    solution?: boolean;
    bestBound?: boolean;
    log?: boolean;
  };
  signal?: AbortSignal;
};

export type CpSatExecutorConfiguration =
  | { type: 'auto' }
  | { type: 'direct' }
  | { type: 'worker' }
  | ({
      type: 'server';
      authToken?: string;
      headers?: Record<string, string>;
      fetch?: typeof fetch;
      statusIntervalMs?: number;
    } & (
      | { host: string | URL; url?: never }
      | { host?: never; url: string | URL }
    ));

export type CpSatLike = {
  solve(model: Uint8Array, options?: CpSatSolveOptions): Promise<{
    response: SolverResponse | null;
    bytes: Uint8Array;
  }>;
  validate(model: Uint8Array): Promise<{ ok: boolean; message: string }>;
  modelStats(model: Uint8Array): Promise<string>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
  setExecutor(configuration: CpSatExecutorConfiguration): void;
};

export type CpSatSolveParams = Record<string, unknown>;

export type CpSatCase = Partial<SharedCaseMetadata> & {
  name: string;
  source: string;
  model: CpModelProto;
  run(CpSat: CpSatLike, params: CpSatSolveParams): Promise<unknown>;
};
