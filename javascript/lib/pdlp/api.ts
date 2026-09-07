import { create, toBinary } from '@bufbuild/protobuf';
import { CloudExecutor } from '../cloud_executor.js';
import {
  resolveExecutorConfiguration,
  type ExecutorSelection,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import {
  PdlpInitialSolutionSchema,
  PdlpQuadraticProgramSchema,
  PdlpSolveParametersSchema,
  type PdlpQuadraticProgram,
  type PdlpSolveParameters as BridgePdlpSolveParameters,
  type PdlpSolverResult as BridgePdlpSolverResult,
} from '../generated/bridge/pdlp_pb.js';
import {
  type SolverJobEvent,
  type SolverResourceRequest,
} from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import {
  SolverWorkerExecutor,
  type SolverWorkerLike,
} from '../worker_helpers.js';
import { DirectPdlpExecutor } from './direct_executor.js';
import {
  pdlpProtocol,
  type PdlpExecutor,
  type PdlpOperation,
  type PdlpResult,
} from './protocol.js';

export type SparseMatrixEntry = {
  row: number;
  column: number;
  value: number;
};

export type SparseMatrixInput = {
  numRows?: number;
  numColumns?: number;
  entries?: SparseMatrixEntry[];
  dense?: number[][];
};

export type QuadraticProgramInput = {
  problemName?: string;
  objectiveOffset?: number;
  objectiveScalingFactor?: number;
  objectiveVector?: number[];
  objectiveMatrixDiagonal?: number[] | null;
  constraintMatrix?: SparseMatrixInput | number[][];
  constraintLowerBounds?: number[];
  constraintUpperBounds?: number[];
  variableLowerBounds?: number[];
  variableUpperBounds?: number[];
  variableNames?: string[];
  constraintNames?: string[];
};

export type PrimalAndDualSolutionInput = {
  primalSolution?: number[];
  dualSolution?: number[];
};

export type PdlpSolveParams = {
  terminationCriteria?: {
    iterationLimit?: number;
    simpleOptimalityCriteria?: {
      epsOptimalRelative?: number;
      epsOptimalAbsolute?: number;
    };
  };
  terminationCheckFrequency?: number;
  lInfRuizIterations?: number;
  l2NormRescaling?: boolean;
  numThreads?: number;
};

export type PdlpSolveLog = {
  terminationReason: string;
  iterationCount: number;
};

export type PdlpSolverResult = {
  primalSolution: number[];
  dualSolution: number[];
  reducedCosts: number[];
  solveLog: PdlpSolveLog;
};

export type PdlpEvent = SolverJobEvent;
export type PdlpEventHandler = (event: PdlpEvent) => void | Promise<void>;
export type PdlpExecutionOptions = {
  executor?: ExecutorSelection;
  onEvent?: PdlpEventHandler;
  signal?: AbortSignal;
};

export type PdlpFromMpModelOptions = PdlpExecutionOptions & {
  relaxIntegerVariables?: boolean;
  includeNames?: boolean;
};

export type PdlpSolveOptions = PdlpSolveParams & PdlpExecutionOptions & {
  initialSolution?: PrimalAndDualSolutionInput | PrimalAndDualSolution;
};

async function createPdlpWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-pdlp' },
  );
}

const directPdlpExecutor = new DirectPdlpExecutor();
const workerPdlpExecutor = new SolverWorkerExecutor(pdlpProtocol, createPdlpWorker);

function createPdlpExecutor(selection: ExecutorSelection = 'auto'): PdlpExecutor {
  return createResolvedPdlpExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedPdlpExecutor(configuration: ResolvedExecutorConfiguration): PdlpExecutor {
  switch (configuration.type) {
    case 'direct':
      return directPdlpExecutor;
    case 'worker':
      return workerPdlpExecutor;
    case 'server':
      return new SolverServerExecutor(pdlpProtocol, configuration);
    case 'cloud':
      return new CloudExecutor('pdlp', { test: configuration.test });
  }
}

const terminationReasonNames: Record<number, string> = {
  0: 'TERMINATION_REASON_UNSPECIFIED',
  1: 'TERMINATION_REASON_OPTIMAL',
  2: 'TERMINATION_REASON_PRIMAL_INFEASIBLE',
  3: 'TERMINATION_REASON_DUAL_INFEASIBLE',
  4: 'TERMINATION_REASON_TIME_LIMIT',
  5: 'TERMINATION_REASON_ITERATION_LIMIT',
  6: 'TERMINATION_REASON_NUMERICAL_ERROR',
  7: 'TERMINATION_REASON_OTHER',
  8: 'TERMINATION_REASON_KKT_MATRIX_PASS_LIMIT',
  9: 'TERMINATION_REASON_INVALID_PROBLEM',
  10: 'TERMINATION_REASON_INVALID_PARAMETER',
  11: 'TERMINATION_REASON_PRIMAL_OR_DUAL_INFEASIBLE',
  12: 'TERMINATION_REASON_INTERRUPTED_BY_USER',
  13: 'TERMINATION_REASON_INVALID_INITIAL_SOLUTION',
};

function denseToEntries(dense: number[][]): SparseMatrixEntry[] {
  const entries: SparseMatrixEntry[] = [];
  dense.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value !== 0) entries.push({ row: rowIndex, column: columnIndex, value });
    });
  });
  return entries;
}

function normalizeSparseMatrix(
  input: SparseMatrixInput | number[][] | undefined,
): SparseMatrixEntry[] {
  if (!input) return [];
  if (Array.isArray(input)) return denseToEntries(input);
  if (input.dense) return denseToEntries(input.dense);
  return [...(input.entries ?? [])]
    .filter((entry) => entry.value !== 0)
    .map((entry) => ({
      row: int32('constraint matrix row', entry.row),
      column: int32('constraint matrix column', entry.column),
      value: entry.value,
    }));
}

function sparseMatrixDimensions(
  input: SparseMatrixInput | number[][] | undefined,
) {
  if (Array.isArray(input)) {
    return {
      numRows: input.length,
      numColumns: input.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    };
  }
  if (!input) return { numRows: 0, numColumns: 0 };
  if (input.dense) {
    return {
      numRows: input.dense.length,
      numColumns: input.dense.reduce(
        (maximum, row) => Math.max(maximum, row.length),
        0,
      ),
    };
  }
  return {
    numRows: matrixDimension('constraint matrix numRows', input.numRows),
    numColumns: matrixDimension('constraint matrix numColumns', input.numColumns),
  };
}

function matrixDimension(name: string, value: number | undefined) {
  if (value === undefined) return 0;
  const result = int32(name, value);
  if (result < 0) throw new Error(`Pdlp: ${name} must be non-negative.`);
  return result;
}

type NormalizedQuadraticProgram = {
  problemName: string;
  objectiveOffset: number;
  objectiveScalingFactor: number;
  objectiveVector: number[];
  objectiveMatrixDiagonal: number[] | null;
  constraintLowerBounds: number[];
  constraintUpperBounds: number[];
  variableLowerBounds: number[];
  variableUpperBounds: number[];
  variableNames: string[];
  constraintNames: string[];
  constraintMatrixEntries: SparseMatrixEntry[];
  numVariables: number;
  numConstraints: number;
};

function normalizeQuadraticProgram(
  input: QuadraticProgramInput = {},
): NormalizedQuadraticProgram {
  const objectiveVector = input.objectiveVector ?? [];
  const constraintLowerBounds = input.constraintLowerBounds ?? [];
  const constraintUpperBounds = input.constraintUpperBounds ?? [];
  const variableLowerBounds = input.variableLowerBounds ?? Array(objectiveVector.length).fill(-Infinity);
  const variableUpperBounds = input.variableUpperBounds ?? Array(objectiveVector.length).fill(Infinity);
  const constraintMatrix = input.constraintMatrix;
  const matrixDimensions = sparseMatrixDimensions(constraintMatrix);
  const numVariables = Math.max(
    objectiveVector.length,
    variableLowerBounds.length,
    variableUpperBounds.length,
    matrixDimensions.numColumns,
  );
  const numConstraints = Math.max(
    constraintLowerBounds.length,
    constraintUpperBounds.length,
    matrixDimensions.numRows,
  );
  return {
    problemName: input.problemName ?? '',
    objectiveOffset: input.objectiveOffset ?? 0,
    objectiveScalingFactor: input.objectiveScalingFactor ?? 1,
    objectiveVector: pad(objectiveVector, numVariables, 0),
    constraintLowerBounds: pad(constraintLowerBounds, numConstraints, -Infinity),
    constraintUpperBounds: pad(constraintUpperBounds, numConstraints, Infinity),
    variableLowerBounds: pad(variableLowerBounds, numVariables, -Infinity),
    variableUpperBounds: pad(variableUpperBounds, numVariables, Infinity),
    variableNames: input.variableNames ?? [],
    constraintNames: input.constraintNames ?? [],
    objectiveMatrixDiagonal: input.objectiveMatrixDiagonal ?? null,
    constraintMatrixEntries: normalizeSparseMatrix(constraintMatrix),
    numVariables,
    numConstraints,
  };
}

function pad(values: number[], length: number, fill: number): number[] {
  return [...values, ...Array(Math.max(0, length - values.length)).fill(fill)];
}

function toBridgeQuadraticProgram(input: QuadraticProgramInput): PdlpQuadraticProgram {
  const qp = normalizeQuadraticProgram(input);
  return create(PdlpQuadraticProgramSchema, {
    numVariables: qp.numVariables,
    numConstraints: qp.numConstraints,
    problemName: qp.problemName,
    objectiveOffset: qp.objectiveOffset,
    objectiveScalingFactor: qp.objectiveScalingFactor,
    objectiveVector: qp.objectiveVector,
    objectiveMatrixDiagonal: qp.objectiveMatrixDiagonal ?? [],
    hasObjectiveMatrixDiagonal: qp.objectiveMatrixDiagonal !== null,
    constraintLowerBounds: qp.constraintLowerBounds,
    constraintUpperBounds: qp.constraintUpperBounds,
    variableLowerBounds: qp.variableLowerBounds,
    variableUpperBounds: qp.variableUpperBounds,
    variableNames: qp.variableNames,
    constraintNames: qp.constraintNames,
    constraintMatrixEntries: qp.constraintMatrixEntries,
  });
}

function fromBridgeQuadraticProgram(qp: PdlpQuadraticProgram): QuadraticProgram {
  return new QuadraticProgram({
    problemName: qp.problemName,
    objectiveOffset: qp.objectiveOffset,
    objectiveScalingFactor: qp.objectiveScalingFactor,
    objectiveVector: qp.objectiveVector,
    objectiveMatrixDiagonal: qp.hasObjectiveMatrixDiagonal ? qp.objectiveMatrixDiagonal : null,
    constraintLowerBounds: qp.constraintLowerBounds,
    constraintUpperBounds: qp.constraintUpperBounds,
    variableLowerBounds: qp.variableLowerBounds,
    variableUpperBounds: qp.variableUpperBounds,
    variableNames: qp.variableNames,
    constraintNames: qp.constraintNames,
    constraintMatrix: { numRows: qp.numConstraints, numColumns: qp.numVariables, entries: qp.constraintMatrixEntries },
  });
}

function toBridgeParameters(params: PdlpSolveParams = {}) {
  const terminationCriteria = params.terminationCriteria;
  const simple = terminationCriteria?.simpleOptimalityCriteria;
  return create(PdlpSolveParametersSchema, {
    iterationLimit: int32Parameter(
      'terminationCriteria.iterationLimit',
      terminationCriteria?.iterationLimit,
    ),
    terminationCheckFrequency: int32Parameter(
      'terminationCheckFrequency',
      params.terminationCheckFrequency,
    ),
    epsOptimalRelative: simple?.epsOptimalRelative,
    epsOptimalAbsolute: simple?.epsOptimalAbsolute,
    lInfRuizIterations: int32Parameter(
      'lInfRuizIterations',
      params.lInfRuizIterations,
    ),
    l2NormRescaling: params.l2NormRescaling,
    numThreads: positiveInt32Parameter(
      'numThreads',
      params.numThreads,
    ),
  });
}

function int32Parameter(name: string, value: number | undefined) {
  if (value === undefined) return undefined;
  return int32(`solve parameter ${name}`, value);
}

function positiveInt32Parameter(name: string, value: number | undefined) {
  const result = int32Parameter(name, value);
  if (result !== undefined && result <= 0) {
    throw new Error(`Pdlp: solve parameter ${name} must be positive.`);
  }
  return result;
}

function int32(name: string, value: number) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new Error(`Pdlp: ${name} must be a 32-bit integer.`);
  }
  return value;
}

function solverResult(response: BridgePdlpSolverResult): PdlpSolverResult {
  const {
    primalSolution,
    dualSolution,
    reducedCosts,
    terminationReason: terminationReasonNumber,
    iterationCount,
  } = response;
  const terminationReason = terminationReasonNames[terminationReasonNumber]
    ?? `TERMINATION_REASON_${terminationReasonNumber}`;
  const solveLog = {
    terminationReason,
    iterationCount,
  };
  return {
    primalSolution,
    dualSolution,
    reducedCosts,
    solveLog,
  };
}

async function execute(
  request: PdlpOperation,
  options: PdlpExecutionOptions = {},
  resources?: SolverResourceRequest,
): Promise<PdlpResult> {
  const executor = createPdlpExecutor(options.executor);
  return executeSolverJob(executor, request, {
    onEvent: options.onEvent,
    resources,
    signal: options.signal,
    abortError: createAbortError,
  });
}

function schedulerResourcesFromParameters(
  parameters: BridgePdlpSolveParameters,
): SolverResourceRequest | undefined {
  return parameters.numThreads !== undefined && parameters.numThreads > 0
    ? { threads: parameters.numThreads }
    : undefined;
}

function createAbortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(
    signal.reason === undefined
      ? 'The PDLP operation was aborted.'
      : String(signal.reason),
  );
  error.name = 'AbortError';
  return error;
}

export class QuadraticProgram {
  problemName = '';
  objectiveOffset = 0;
  objectiveScalingFactor = 1;
  objectiveVector: number[] = [];
  objectiveMatrixDiagonal: number[] | null = null;
  constraintMatrix: SparseMatrixInput | number[][] = { entries: [] };
  constraintLowerBounds: number[] = [];
  constraintUpperBounds: number[] = [];
  variableLowerBounds: number[] = [];
  variableUpperBounds: number[] = [];
  variableNames: string[] = [];
  constraintNames: string[] = [];

  constructor(input: QuadraticProgramInput = {}) {
    this.assign(input);
  }

  resizeAndInitialize(numVariables: number, numConstraints: number): void {
    this.objectiveVector = Array(numVariables).fill(0);
    this.constraintLowerBounds = Array(numConstraints).fill(-Infinity);
    this.constraintUpperBounds = Array(numConstraints).fill(Infinity);
    this.variableLowerBounds = Array(numVariables).fill(-Infinity);
    this.variableUpperBounds = Array(numVariables).fill(Infinity);
    this.constraintMatrix = { numRows: numConstraints, numColumns: numVariables, entries: [] };
  }

  setObjectiveMatrixDiagonal(values: number[]): void {
    this.objectiveMatrixDiagonal = [...values];
  }

  clearObjectiveMatrix(): void {
    this.objectiveMatrixDiagonal = null;
  }

  toBytes(): Uint8Array {
    return toBinary(PdlpQuadraticProgramSchema, toBridgeQuadraticProgram(this));
  }

  private assign(input: QuadraticProgramInput): void {
    const qp = normalizeQuadraticProgram(input);
    this.problemName = qp.problemName;
    this.objectiveOffset = qp.objectiveOffset;
    this.objectiveScalingFactor = qp.objectiveScalingFactor;
    this.objectiveVector = [...qp.objectiveVector];
    this.objectiveMatrixDiagonal = qp.objectiveMatrixDiagonal ? [...qp.objectiveMatrixDiagonal] : null;
    this.constraintLowerBounds = [...qp.constraintLowerBounds];
    this.constraintUpperBounds = [...qp.constraintUpperBounds];
    this.variableLowerBounds = [...qp.variableLowerBounds];
    this.variableUpperBounds = [...qp.variableUpperBounds];
    this.variableNames = [...qp.variableNames];
    this.constraintNames = [...qp.constraintNames];
    this.constraintMatrix = {
      numRows: qp.numConstraints,
      numColumns: qp.numVariables,
      entries: [...qp.constraintMatrixEntries],
    };
  }
}

export class PrimalAndDualSolution {
  primalSolution: number[] = [];
  dualSolution: number[] = [];

  constructor(input: PrimalAndDualSolutionInput = {}) {
    this.primalSolution = [...(input.primalSolution ?? [])];
    this.dualSolution = [...(input.dualSolution ?? [])];
  }
}

async function validateQuadraticProgramDimensions(
  qp: QuadraticProgramInput | QuadraticProgram,
  options: PdlpExecutionOptions = {},
): Promise<void> {
  const response = await execute({
    type: 'validate',
    quadraticProgram: toBridgeQuadraticProgram(qp),
  }, options);
  if (response.type !== 'validate') {
    throw new Error('PDLP executor returned the wrong validation result.');
  }
  if (response.message) throw new Error(response.message);
}

async function isLinearProgram(
  qp: QuadraticProgramInput | QuadraticProgram,
  options: PdlpExecutionOptions = {},
): Promise<boolean> {
  const response = await execute({
    type: 'isLinear',
    quadraticProgram: toBridgeQuadraticProgram(qp),
  }, options);
  if (response.type !== 'isLinear') {
    throw new Error('PDLP executor returned the wrong linearity result.');
  }
  return response.value;
}

async function qpFromMpModelProto(
  proto: Uint8Array,
  options: PdlpFromMpModelOptions = {},
): Promise<QuadraticProgram> {
  const response = await execute({
    type: 'fromMpModel',
    model: proto,
    relaxIntegerVariables: options.relaxIntegerVariables ?? false,
    includeNames: options.includeNames ?? false,
  }, options);
  if (response.type !== 'fromMpModel') {
    throw new Error('PDLP executor returned the wrong conversion result.');
  }
  return fromBridgeQuadraticProgram(response.quadraticProgram);
}

async function qpToMpModelProto(
  qp: QuadraticProgramInput | QuadraticProgram,
  options: PdlpExecutionOptions = {},
): Promise<Uint8Array> {
  const response = await execute({
    type: 'toMpModel',
    quadraticProgram: toBridgeQuadraticProgram(qp),
  }, options);
  if (response.type !== 'toMpModel') {
    throw new Error('PDLP executor returned the wrong conversion result.');
  }
  return response.model;
}

async function solve(
  qp: QuadraticProgramInput | QuadraticProgram,
  options: PdlpSolveOptions = {},
): Promise<PdlpSolverResult> {
  const {
    executor,
    initialSolution,
    onEvent,
    signal,
    ...parameters
  } = options;
  const solverParameters = toBridgeParameters(parameters);
  const response = await execute({
    type: 'solve',
    quadraticProgram: toBridgeQuadraticProgram(qp),
    parameters: solverParameters,
    initialSolution: initialSolution ? create(PdlpInitialSolutionSchema, {
      primalSolution: initialSolution.primalSolution ?? [],
      dualSolution: initialSolution.dualSolution ?? [],
    }) : undefined,
  }, {
    executor,
    onEvent,
    signal,
  }, schedulerResourcesFromParameters(solverParameters));
  if (response.type !== 'solve') {
    throw new Error('PDLP executor returned the wrong solve result.');
  }
  return solverResult(response.result);
}

export const Pdlp = {
  QuadraticProgram,
  PrimalAndDualSolution,
  validateQuadraticProgramDimensions,
  isLinearProgram,
  qpFromMpModelProto,
  qpToMpModelProto,
  solve,
};

export type PdlpApi = typeof Pdlp;

export default Pdlp;
