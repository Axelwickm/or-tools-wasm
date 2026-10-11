import type { pdlp_PrimalDualHybridGradientParams, pdlp_SolveLog } from '../generated/pdlp_types.js';
import { encodePdlpParameters, decodePdlpSolveLog, decodePdlpIterationStats, decodePdlpTerminationCriteria } from './proto.js';
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

export type PdlpSolveParams = pdlp_PrimalDualHybridGradientParams;

export type PdlpSolveLog = Omit<pdlp_SolveLog, 'terminationReason' | 'iterationCount'> & {
  terminationReason: string;
  iterationCount: number;
};

export type PdlpSolverResult = {
  primalSolution: number[];
  dualSolution: number[];
  reducedCosts: number[];
  solveLog: PdlpSolveLog;
};

export enum PdlpIterationType {
  NORMAL = 0,
  PRIMAL_FEASIBILITY = 1,
  DUAL_FEASIBILITY = 2,
  PRESOLVE_TERMINATION = 3,
  NORMAL_TERMINATION = 4,
  FEASIBILITY_POLISHING_TERMINATION = 5,
}
export type PdlpIterationCallbackInfo = {
  iterationType: PdlpIterationType;
  iterationStats: import('../generated/pdlp_types.js').pdlp_IterationStats;
  terminationCriteria: import('../generated/pdlp_types.js').pdlp_TerminationCriteria;
  boundNorms: {
    l2NormPrimalLinearObjective: number;
    l2NormConstraintBounds: number;
    lInfNormPrimalLinearObjective: number;
    lInfNormConstraintBounds: number;
  };
};
export type PdlpEvent = SolverJobEvent
  | { type: 'log'; message: string }
  | { type: 'iteration'; info: PdlpIterationCallbackInfo };
export type PdlpEventMask = { log?: boolean; iteration?: boolean };
export type PdlpEventHandler = (event: PdlpEvent) => void | Promise<void>;
export type PdlpExecutionOptions = {
  executor?: ExecutorSelection;
  onEvent?: PdlpEventHandler;
  eventMask?: PdlpEventMask;
  signal?: AbortSignal;
};

export type PdlpFromMpModelOptions = PdlpExecutionOptions & {
  relaxIntegerVariables?: boolean;
  includeNames?: boolean;
};

export type PdlpModelFormat = 'mps' | 'proto' | 'textproto' | 'json';
export type PdlpReadQuadraticProgramOptions = PdlpFromMpModelOptions & { format: PdlpModelFormat };

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
  if (!input) return { numRows: undefined, numColumns: undefined };
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
    numRows: input.numRows === undefined ? undefined : matrixDimension('constraint matrix numRows', input.numRows),
    numColumns: input.numColumns === undefined ? undefined : matrixDimension('constraint matrix numColumns', input.numColumns),
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
  const objectiveVector = input.objectiveVector;
  const constraintLowerBounds = input.constraintLowerBounds;
  const constraintUpperBounds = input.constraintUpperBounds;
  const variableLowerBounds = input.variableLowerBounds;
  const variableUpperBounds = input.variableUpperBounds;
  const constraintMatrix = input.constraintMatrix;
  const matrixDimensions = sparseMatrixDimensions(constraintMatrix);
  const inferredNumVariables = Math.max(
    objectiveVector?.length ?? 0,
    input.objectiveMatrixDiagonal?.length ?? 0,
    variableLowerBounds?.length ?? 0,
    variableUpperBounds?.length ?? 0,
    matrixDimensions.numColumns ?? 0,
  );
  const inferredNumConstraints = Math.max(
    constraintLowerBounds?.length ?? 0,
    constraintUpperBounds?.length ?? 0,
    matrixDimensions.numRows ?? 0,
  );
  // Explicit vectors and matrix dimensions must survive the bridge unchanged:
  // native dimension validation should see invalid input rather than a padded model.
  const numVariables = matrixDimensions.numColumns ?? inferredNumVariables;
  const numConstraints = matrixDimensions.numRows ?? inferredNumConstraints;
  return {
    problemName: input.problemName ?? '',
    objectiveOffset: input.objectiveOffset ?? 0,
    objectiveScalingFactor: input.objectiveScalingFactor ?? 1,
    objectiveVector: objectiveVector ?? Array(inferredNumVariables).fill(0),
    constraintLowerBounds: constraintLowerBounds ?? Array(inferredNumConstraints).fill(-Infinity),
    constraintUpperBounds: constraintUpperBounds ?? Array(inferredNumConstraints).fill(Infinity),
    variableLowerBounds: variableLowerBounds ?? Array(inferredNumVariables).fill(-Infinity),
    variableUpperBounds: variableUpperBounds ?? Array(inferredNumVariables).fill(Infinity),
    variableNames: input.variableNames ?? [],
    constraintNames: input.constraintNames ?? [],
    objectiveMatrixDiagonal: input.objectiveMatrixDiagonal ?? null,
    constraintMatrixEntries: normalizeSparseMatrix(constraintMatrix),
    numVariables,
    numConstraints,
  };
}

function toBridgeQuadraticProgram(input: QuadraticProgramInput): PdlpQuadraticProgram {
  const qp = normalizeQuadraticProgram(input);
  return create(PdlpQuadraticProgramSchema, {
    numVariables: qp.numVariables,
    numConstraints: qp.numConstraints,
    problemName: qp.problemName,
    objectiveOffset: qp.objectiveOffset,
    objectiveScalingFactor: qp.objectiveScalingFactor,
    objectiveVector: [...qp.objectiveVector],
    objectiveMatrixDiagonal: qp.objectiveMatrixDiagonal ? [...qp.objectiveMatrixDiagonal] : [],
    hasObjectiveMatrixDiagonal: qp.objectiveMatrixDiagonal !== null,
    constraintLowerBounds: [...qp.constraintLowerBounds],
    constraintUpperBounds: [...qp.constraintUpperBounds],
    variableLowerBounds: [...qp.variableLowerBounds],
    variableUpperBounds: [...qp.variableUpperBounds],
    variableNames: [...qp.variableNames],
    constraintNames: [...qp.constraintNames],
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
  return create(PdlpSolveParametersSchema, {
    nativeParameters: encodePdlpParameters(params),
    numThreads: positiveInt32Parameter('numThreads', params.numThreads),
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
  const solveLog: PdlpSolveLog = {
    ...(response.nativeSolveLog.length ? decodePdlpSolveLog(response.nativeSolveLog) : {}),
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
  const { executor: selection, onEvent, signal } = options;
  const executor = createPdlpExecutor(selection);
  return executeSolverJob(executor, request, {
    showCloudNotice: !(executor instanceof SolverServerExecutor) && request.type === 'solve',
    onEvent: event => {
      if (!onEvent) return;
      if (event.type !== 'iteration') return onEvent(event);
      const { info } = event;
      return onEvent({ type: 'iteration', info: {
        iterationType: info.iterationType,
        iterationStats: decodePdlpIterationStats(info.iterationStats),
        terminationCriteria: decodePdlpTerminationCriteria(info.terminationCriteria),
        boundNorms: {
          l2NormPrimalLinearObjective: info.l2NormPrimalLinearObjective,
          l2NormConstraintBounds: info.l2NormConstraintBounds,
          lInfNormPrimalLinearObjective: info.lInfNormPrimalLinearObjective,
          lInfNormConstraintBounds: info.lInfNormConstraintBounds,
        },
      } });
    },
    resources,
    signal,
  });
}

function schedulerResourcesFromParameters(
  parameters: BridgePdlpSolveParameters,
): SolverResourceRequest | undefined {
  return parameters.numThreads !== undefined && parameters.numThreads > 0
    ? { threads: parameters.numThreads }
    : undefined;
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
    numVariables = matrixDimension('numVariables', numVariables);
    numConstraints = matrixDimension('numConstraints', numConstraints);
    this.problemName = '';
    this.objectiveOffset = 0;
    this.objectiveScalingFactor = 1;
    this.objectiveMatrixDiagonal = null;
    this.variableNames = [];
    this.constraintNames = [];
    this.objectiveVector = Array(numVariables).fill(0);
    this.constraintLowerBounds = Array(numConstraints).fill(-Infinity);
    this.constraintUpperBounds = Array(numConstraints).fill(Infinity);
    this.variableLowerBounds = Array(numVariables).fill(-Infinity);
    this.variableUpperBounds = Array(numVariables).fill(Infinity);
    this.constraintMatrix = { numRows: numConstraints, numColumns: numVariables, entries: [] };
  }

  applyObjectiveScalingAndOffset(objective: number): number {
    return this.objectiveScalingFactor * (objective + this.objectiveOffset);
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
    model: new Uint8Array(proto),
    relaxIntegerVariables: options.relaxIntegerVariables ?? false,
    includeNames: options.includeNames ?? false,
  }, options);
  if (response.type !== 'fromMpModel') {
    throw new Error('PDLP executor returned the wrong conversion result.');
  }
  return fromBridgeQuadraticProgram(response.quadraticProgram);
}

async function readQuadraticProgram(
  input: string | Uint8Array,
  options: PdlpReadQuadraticProgramOptions,
): Promise<QuadraticProgram> {
  const formats = { proto: 0, mps: 1, textproto: 2, json: 3 };
  const inputFormat = formats[options.format];
  if (typeof inputFormat !== 'number') throw new TypeError('Unknown PDLP model import format.');
  if (options.format === 'proto' && typeof input === 'string') throw new TypeError('Binary MPModelProto import requires Uint8Array.');
  const response = await execute({
    type: 'fromMpModel',
    model: typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input),
    inputFormat,
    relaxIntegerVariables: options.relaxIntegerVariables ?? false,
    includeNames: options.includeNames ?? false,
  }, options);
  if (response.type !== 'fromMpModel') throw new Error('PDLP executor returned the wrong import result.');
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
    eventMask,
    onEvent,
    signal,
    ...parameters
  } = options;
  const solverParameters = toBridgeParameters(parameters);
  const response = await execute({
    type: 'solve',
    callbackFlags: onEvent ? ((eventMask?.log !== false ? 1 : 0)
      | (eventMask?.iteration !== false ? 2 : 0)) : 0,
    quadraticProgram: toBridgeQuadraticProgram(qp),
    parameters: solverParameters,
    initialSolution: initialSolution ? create(PdlpInitialSolutionSchema, {
      primalSolution: [...(initialSolution.primalSolution ?? [])],
      dualSolution: [...(initialSolution.dualSolution ?? [])],
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
  readQuadraticProgram,
  qpFromMpModelProto,
  qpToMpModelProto,
  solve,
};

export type PdlpApi = typeof Pdlp;

export default Pdlp;
