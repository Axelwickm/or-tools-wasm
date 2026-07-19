import { create, toBinary } from '@bufbuild/protobuf';
import type { ExecutorConfiguration, ResolvedExecutorConfiguration } from './executor_configuration.js';
import { resolveExecutorConfiguration } from './executor_configuration.js';
import {
  PdlpBridgeRequestSchema,
  PdlpOperation,
  PdlpQuadraticProgramSchema,
  PdlpSolveParametersSchema,
  type PdlpBridgeResponse,
  type PdlpQuadraticProgram,
} from './generated/bridge/pdlp_pb.js';
import type { SolverJobEvent } from './solver_executor.js';
import { PdlpExecutor, type PdlpExecutorLike } from './pdlp/executor.js';
import { PdlpServerExecutor } from './pdlp/server_executor.js';
import { PdlpWorkerExecutor } from './pdlp/worker_executor.js';

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
  problem_name?: string;
  objectiveOffset?: number;
  objective_offset?: number;
  objectiveScalingFactor?: number;
  objective_scaling_factor?: number;
  objectiveVector?: number[];
  objective_vector?: number[];
  objectiveMatrixDiagonal?: number[] | null;
  objective_matrix_diagonal?: number[] | null;
  constraintMatrix?: SparseMatrixInput | number[][];
  constraint_matrix?: SparseMatrixInput | number[][];
  constraintLowerBounds?: number[];
  constraint_lower_bounds?: number[];
  constraintUpperBounds?: number[];
  constraint_upper_bounds?: number[];
  variableLowerBounds?: number[];
  variable_lower_bounds?: number[];
  variableUpperBounds?: number[];
  variable_upper_bounds?: number[];
  variableNames?: string[];
  variable_names?: string[];
  constraintNames?: string[];
  constraint_names?: string[];
};

export type PrimalAndDualSolutionInput = {
  primalSolution?: number[];
  primal_solution?: number[];
  dualSolution?: number[];
  dual_solution?: number[];
};

export type PdlpSolveParams = {
  terminationCriteria?: {
    iterationLimit?: number;
    simpleOptimalityCriteria?: {
      epsOptimalRelative?: number;
      epsOptimalAbsolute?: number;
    };
  };
  termination_criteria?: {
    iteration_limit?: number;
    simple_optimality_criteria?: {
      eps_optimal_relative?: number;
      eps_optimal_absolute?: number;
    };
  };
  terminationCheckFrequency?: number;
  termination_check_frequency?: number;
  lInfRuizIterations?: number;
  l_inf_ruiz_iterations?: number;
  l2NormRescaling?: boolean;
  l2_norm_rescaling?: boolean;
};

export type PdlpSolveLog = {
  terminationReason: string;
  termination_reason: string;
  iterationCount: number;
  iteration_count: number;
};

export type PdlpSolverResult = {
  primalSolution: number[];
  primal_solution: number[];
  dualSolution: number[];
  dual_solution: number[];
  reducedCosts: number[];
  reduced_costs: number[];
  solveLog: PdlpSolveLog;
  solve_log: PdlpSolveLog;
};

export type PdlpEvent = SolverJobEvent;
export type PdlpExecutionOptions = {
  onEvent?: (event: PdlpEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

const directExecutor = new PdlpExecutor();
const workerExecutor = new PdlpWorkerExecutor();
let executor: PdlpExecutorLike = createExecutor({ type: 'auto' });

function createExecutor(configuration: ExecutorConfiguration): PdlpExecutorLike {
  return createResolvedExecutor(resolveExecutorConfiguration(configuration));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): PdlpExecutorLike {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new PdlpServerExecutor(configuration);
  }
}

export function setPdlpExecutor(configuration: ExecutorConfiguration): void {
  executor = createExecutor(configuration);
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

export async function initPdlp(): Promise<void> {
  await executor.load();
}

function denseToEntries(dense: number[][]): SparseMatrixEntry[] {
  const entries: SparseMatrixEntry[] = [];
  dense.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value !== 0) entries.push({ row: rowIndex, column: columnIndex, value });
    });
  });
  return entries;
}

function normalizeSparseMatrix(input: SparseMatrixInput | number[][] | undefined, numRows: number, numColumns: number): SparseMatrixEntry[] {
  if (!input) return [];
  if (Array.isArray(input)) return denseToEntries(input);
  if (input.dense) return denseToEntries(input.dense);
  return [...(input.entries ?? [])].filter((entry) => entry.value !== 0 && entry.row < numRows && entry.column < numColumns);
}

function normalizeQuadraticProgram(input: QuadraticProgramInput = {}): Required<Omit<QuadraticProgramInput, 'constraintMatrix' | 'constraint_matrix' | 'objectiveMatrixDiagonal' | 'objective_matrix_diagonal'>> & {
  objectiveMatrixDiagonal: number[] | null;
  constraintMatrixEntries: SparseMatrixEntry[];
  numVariables: number;
  numConstraints: number;
} {
  const objectiveVector = input.objective_vector ?? input.objectiveVector ?? [];
  const constraintLowerBounds = input.constraint_lower_bounds ?? input.constraintLowerBounds ?? [];
  const constraintUpperBounds = input.constraint_upper_bounds ?? input.constraintUpperBounds ?? [];
  const variableLowerBounds = input.variable_lower_bounds ?? input.variableLowerBounds ?? Array(objectiveVector.length).fill(-Infinity);
  const variableUpperBounds = input.variable_upper_bounds ?? input.variableUpperBounds ?? Array(objectiveVector.length).fill(Infinity);
  const numVariables = Math.max(objectiveVector.length, variableLowerBounds.length, variableUpperBounds.length);
  const numConstraints = Math.max(constraintLowerBounds.length, constraintUpperBounds.length);
  const constraintMatrix = input.constraint_matrix ?? input.constraintMatrix;
  return {
    problemName: input.problem_name ?? input.problemName ?? '',
    problem_name: input.problem_name ?? input.problemName ?? '',
    objectiveOffset: input.objective_offset ?? input.objectiveOffset ?? 0,
    objective_offset: input.objective_offset ?? input.objectiveOffset ?? 0,
    objectiveScalingFactor: input.objective_scaling_factor ?? input.objectiveScalingFactor ?? 1,
    objective_scaling_factor: input.objective_scaling_factor ?? input.objectiveScalingFactor ?? 1,
    objectiveVector: pad(objectiveVector, numVariables, 0),
    objective_vector: pad(objectiveVector, numVariables, 0),
    constraintLowerBounds: pad(constraintLowerBounds, numConstraints, -Infinity),
    constraint_lower_bounds: pad(constraintLowerBounds, numConstraints, -Infinity),
    constraintUpperBounds: pad(constraintUpperBounds, numConstraints, Infinity),
    constraint_upper_bounds: pad(constraintUpperBounds, numConstraints, Infinity),
    variableLowerBounds: pad(variableLowerBounds, numVariables, -Infinity),
    variable_lower_bounds: pad(variableLowerBounds, numVariables, -Infinity),
    variableUpperBounds: pad(variableUpperBounds, numVariables, Infinity),
    variable_upper_bounds: pad(variableUpperBounds, numVariables, Infinity),
    variableNames: input.variable_names ?? input.variableNames ?? [],
    variable_names: input.variable_names ?? input.variableNames ?? [],
    constraintNames: input.constraint_names ?? input.constraintNames ?? [],
    constraint_names: input.constraint_names ?? input.constraintNames ?? [],
    objectiveMatrixDiagonal: input.objective_matrix_diagonal ?? input.objectiveMatrixDiagonal ?? null,
    constraintMatrixEntries: normalizeSparseMatrix(constraintMatrix, numConstraints, numVariables),
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
  const terminationCriteria = (params.terminationCriteria ?? params.termination_criteria) as {
    iterationLimit?: number;
    iteration_limit?: number;
    simpleOptimalityCriteria?: {
      epsOptimalRelative?: number;
      epsOptimalAbsolute?: number;
    };
    simple_optimality_criteria?: {
      eps_optimal_relative?: number;
      eps_optimal_absolute?: number;
    };
  } | undefined;
  const simple = (terminationCriteria?.simpleOptimalityCriteria ?? terminationCriteria?.simple_optimality_criteria) as {
    epsOptimalRelative?: number;
    eps_optimal_relative?: number;
    epsOptimalAbsolute?: number;
    eps_optimal_absolute?: number;
  } | undefined;
  return create(PdlpSolveParametersSchema, {
    iterationLimit: terminationCriteria?.iterationLimit ?? terminationCriteria?.iteration_limit,
    terminationCheckFrequency: params.terminationCheckFrequency ?? params.termination_check_frequency,
    epsOptimalRelative: simple?.epsOptimalRelative ?? simple?.eps_optimal_relative,
    epsOptimalAbsolute: simple?.epsOptimalAbsolute ?? simple?.eps_optimal_absolute,
    lInfRuizIterations: params.lInfRuizIterations ?? params.l_inf_ruiz_iterations,
    l2NormRescaling: params.l2NormRescaling ?? params.l2_norm_rescaling,
  });
}

function solverResult(response: PdlpBridgeResponse): PdlpSolverResult {
  if (!response.solverResult) throw new Error('PDLP solve returned no result.');
  const { primalSolution, dualSolution, reducedCosts, terminationReason: terminationReasonNumber, iterationCount } = response.solverResult;
  const solveLog = {
    terminationReason: terminationReasonNames[terminationReasonNumber] ?? `TERMINATION_REASON_${terminationReasonNumber}`,
    termination_reason: terminationReasonNames[terminationReasonNumber] ?? `TERMINATION_REASON_${terminationReasonNumber}`,
    iterationCount,
    iteration_count: iterationCount,
  };
  return {
    primalSolution,
    primal_solution: primalSolution,
    dualSolution,
    dual_solution: dualSolution,
    reducedCosts,
    reduced_costs: reducedCosts,
    solveLog,
    solve_log: solveLog,
  };
}

async function execute(request: Parameters<PdlpExecutorLike['execute']>[0], options: PdlpExecutionOptions = {}) {
  if (options.signal?.aborted) throw abortError(options.signal);
  const job = executor.execute(request, { onEvent: options.onEvent ?? (() => {}) });
  const onAbort = () => { void job.cancel().catch(() => {}); };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await job.result;
    if (options.signal?.aborted) throw abortError(options.signal);
    return response;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

function abortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(signal.reason === undefined ? 'The PDLP operation was aborted.' : String(signal.reason));
  error.name = 'AbortError';
  return error;
}

export class QuadraticProgram {
  problemName = '';
  problem_name = '';
  objectiveOffset = 0;
  objective_offset = 0;
  objectiveScalingFactor = 1;
  objective_scaling_factor = 1;
  objectiveVector: number[] = [];
  objective_vector: number[] = [];
  objectiveMatrixDiagonal: number[] | null = null;
  objective_matrix_diagonal: number[] | null = null;
  constraintMatrix: SparseMatrixInput = { entries: [] };
  constraint_matrix: SparseMatrixInput = this.constraintMatrix;
  constraintLowerBounds: number[] = [];
  constraint_lower_bounds: number[] = [];
  constraintUpperBounds: number[] = [];
  constraint_upper_bounds: number[] = [];
  variableLowerBounds: number[] = [];
  variable_lower_bounds: number[] = [];
  variableUpperBounds: number[] = [];
  variable_upper_bounds: number[] = [];
  variableNames: string[] = [];
  variable_names: string[] = [];
  constraintNames: string[] = [];
  constraint_names: string[] = [];

  constructor(input: QuadraticProgramInput = {}) {
    this.assign(input);
  }

  resizeAndInitialize(numVariables: number, numConstraints: number): void {
    this.objectiveVector = Array(numVariables).fill(0);
    this.objective_vector = this.objectiveVector;
    this.constraintLowerBounds = Array(numConstraints).fill(-Infinity);
    this.constraint_lower_bounds = this.constraintLowerBounds;
    this.constraintUpperBounds = Array(numConstraints).fill(Infinity);
    this.constraint_upper_bounds = this.constraintUpperBounds;
    this.variableLowerBounds = Array(numVariables).fill(-Infinity);
    this.variable_lower_bounds = this.variableLowerBounds;
    this.variableUpperBounds = Array(numVariables).fill(Infinity);
    this.variable_upper_bounds = this.variableUpperBounds;
    this.constraintMatrix = { numRows: numConstraints, numColumns: numVariables, entries: [] };
    this.constraint_matrix = this.constraintMatrix;
  }

  resize_and_initialize(numVariables: number, numConstraints: number): void {
    this.resizeAndInitialize(numVariables, numConstraints);
  }

  setObjectiveMatrixDiagonal(values: number[]): void {
    this.objectiveMatrixDiagonal = [...values];
    this.objective_matrix_diagonal = this.objectiveMatrixDiagonal;
  }

  set_objective_matrix_diagonal(values: number[]): void {
    this.setObjectiveMatrixDiagonal(values);
  }

  clearObjectiveMatrix(): void {
    this.objectiveMatrixDiagonal = null;
    this.objective_matrix_diagonal = null;
  }

  clear_objective_matrix(): void {
    this.clearObjectiveMatrix();
  }

  toBytes(): Uint8Array {
    return toBinary(PdlpQuadraticProgramSchema, toBridgeQuadraticProgram(this));
  }

  private assign(input: QuadraticProgramInput): void {
    const qp = normalizeQuadraticProgram(input);
    this.problemName = qp.problemName;
    this.problem_name = qp.problemName;
    this.objectiveOffset = qp.objectiveOffset;
    this.objective_offset = qp.objectiveOffset;
    this.objectiveScalingFactor = qp.objectiveScalingFactor;
    this.objective_scaling_factor = qp.objectiveScalingFactor;
    this.objectiveVector = [...qp.objectiveVector];
    this.objective_vector = this.objectiveVector;
    this.objectiveMatrixDiagonal = qp.objectiveMatrixDiagonal ? [...qp.objectiveMatrixDiagonal] : null;
    this.objective_matrix_diagonal = this.objectiveMatrixDiagonal;
    this.constraintLowerBounds = [...qp.constraintLowerBounds];
    this.constraint_lower_bounds = this.constraintLowerBounds;
    this.constraintUpperBounds = [...qp.constraintUpperBounds];
    this.constraint_upper_bounds = this.constraintUpperBounds;
    this.variableLowerBounds = [...qp.variableLowerBounds];
    this.variable_lower_bounds = this.variableLowerBounds;
    this.variableUpperBounds = [...qp.variableUpperBounds];
    this.variable_upper_bounds = this.variableUpperBounds;
    this.variableNames = [...qp.variableNames];
    this.variable_names = this.variableNames;
    this.constraintNames = [...qp.constraintNames];
    this.constraint_names = this.constraintNames;
    this.constraintMatrix = {
      numRows: qp.numConstraints,
      numColumns: qp.numVariables,
      entries: [...qp.constraintMatrixEntries],
    };
    this.constraint_matrix = this.constraintMatrix;
  }
}

export class PrimalAndDualSolution {
  primalSolution: number[] = [];
  primal_solution: number[] = [];
  dualSolution: number[] = [];
  dual_solution: number[] = [];

  constructor(input: PrimalAndDualSolutionInput = {}) {
    this.primalSolution = [...(input.primalSolution ?? input.primal_solution ?? [])];
    this.primal_solution = this.primalSolution;
    this.dualSolution = [...(input.dualSolution ?? input.dual_solution ?? [])];
    this.dual_solution = this.dualSolution;
  }
}

export const Pdlp = {
  QuadraticProgram,
  PrimalAndDualSolution,

  setExecutor(configuration: ExecutorConfiguration): void {
    setPdlpExecutor(configuration);
  },

  async validateQuadraticProgramDimensions(qp: QuadraticProgramInput | QuadraticProgram, options: PdlpExecutionOptions = {}): Promise<void> {
    const response = await execute(create(PdlpBridgeRequestSchema, {
      operation: PdlpOperation.VALIDATE,
      quadraticProgram: toBridgeQuadraticProgram(qp),
    }), options);
    if (response.validationError) throw new Error(response.validationError);
  },

  async validate_quadratic_program_dimensions(qp: QuadraticProgramInput | QuadraticProgram, options: PdlpExecutionOptions = {}): Promise<void> {
    return this.validateQuadraticProgramDimensions(qp, options);
  },

  async isLinearProgram(qp: QuadraticProgramInput | QuadraticProgram, options: PdlpExecutionOptions = {}): Promise<boolean> {
    return (await execute(create(PdlpBridgeRequestSchema, {
      operation: PdlpOperation.IS_LINEAR,
      quadraticProgram: toBridgeQuadraticProgram(qp),
    }), options)).isLinear;
  },

  async is_linear_program(qp: QuadraticProgramInput | QuadraticProgram, options: PdlpExecutionOptions = {}): Promise<boolean> {
    return this.isLinearProgram(qp, options);
  },

  async qpFromMpModelProto(proto: Uint8Array, conversion: { relaxIntegerVariables?: boolean; includeNames?: boolean } = {}, options: PdlpExecutionOptions = {}): Promise<QuadraticProgram> {
    const response = await execute(create(PdlpBridgeRequestSchema, {
      operation: PdlpOperation.FROM_MP_MODEL,
      mpModelProto: proto,
      relaxIntegerVariables: conversion.relaxIntegerVariables ?? false,
      includeNames: conversion.includeNames ?? false,
    }), options);
    if (!response.quadraticProgram) throw new Error('PDLP could not convert MPModelProto to QuadraticProgram.');
    return fromBridgeQuadraticProgram(response.quadraticProgram);
  },

  async qp_from_mpmodel_proto(proto: Uint8Array, relaxIntegerVariables = false, includeNames = false): Promise<QuadraticProgram> {
    return this.qpFromMpModelProto(proto, { relaxIntegerVariables, includeNames });
  },

  async qpToMpModelProto(qp: QuadraticProgramInput | QuadraticProgram, options: PdlpExecutionOptions = {}): Promise<Uint8Array> {
    const response = await execute(create(PdlpBridgeRequestSchema, {
      operation: PdlpOperation.TO_MP_MODEL,
      quadraticProgram: toBridgeQuadraticProgram(qp),
    }), options);
    if (!response.mpModelProto.length) throw new Error('PDLP could not convert QuadraticProgram to MPModelProto.');
    return response.mpModelProto;
  },

  async qp_to_mpmodel_proto(qp: QuadraticProgramInput | QuadraticProgram): Promise<Uint8Array> {
    return this.qpToMpModelProto(qp);
  },

  async primalDualHybridGradient(
    qp: QuadraticProgramInput | QuadraticProgram,
    params: PdlpSolveParams = {},
    initialSolution?: PrimalAndDualSolutionInput | PrimalAndDualSolution,
    options: PdlpExecutionOptions = {},
  ): Promise<PdlpSolverResult> {
    return solverResult(await execute(create(PdlpBridgeRequestSchema, {
      operation: PdlpOperation.SOLVE,
      quadraticProgram: toBridgeQuadraticProgram(qp),
      parameters: toBridgeParameters(params),
      initialSolution: initialSolution ? {
        primalSolution: initialSolution.primal_solution ?? initialSolution.primalSolution ?? [],
        dualSolution: initialSolution.dual_solution ?? initialSolution.dualSolution ?? [],
      } : undefined,
    }), options));
  },

  async primal_dual_hybrid_gradient(
    qp: QuadraticProgramInput | QuadraticProgram,
    params: PdlpSolveParams = {},
    initialSolution?: PrimalAndDualSolutionInput | PrimalAndDualSolution,
    options: PdlpExecutionOptions = {},
  ): Promise<PdlpSolverResult> {
    return this.primalDualHybridGradient(qp, params, initialSolution, options);
  },
};
