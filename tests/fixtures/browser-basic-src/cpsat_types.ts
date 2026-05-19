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

export type CpSatSolveCallbacks = {
  onSolution?: (response: SolverResponse, bytes: Uint8Array) => void;
  onBestBound?: (bound: number) => void;
  onLog?: (message: string) => void;
};

export type CpSatLike = {
  solve(model: Uint8Array, params?: CpSatSolveParams, callbacks?: CpSatSolveCallbacks): Promise<{
    response: SolverResponse | null;
    bytes: Uint8Array;
  }>;
  validate(model: Uint8Array): Promise<{ ok: boolean; message: string }>;
  modelStats(model: Uint8Array): Promise<string>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
  setWorkerBridgeEnabled(enabled: boolean): void;
  isWorkerBridgeEnabled(): boolean;
};

export type CpSatSolveParams = Record<string, unknown>;

export type CpSatCase = {
  name: string;
  source: string;
  model: CpModelProto;
  run(CpSat: CpSatLike, params: CpSatSolveParams): Promise<unknown>;
};
