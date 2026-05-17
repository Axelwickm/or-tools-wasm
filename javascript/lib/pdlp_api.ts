import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadPdlpRuntime } from './runtime_loader.js';
import type { WorkerResponse } from './worker_protocol.js';
import {
  nextWorkerBridgeRequestId,
  postWorkerRequest,
  shouldUseWorkerBridge,
} from './worker_bridge.js';

let pdlpModulePromise: Promise<OrToolsWasmModule> | null = null;
let pdlpModule: OrToolsWasmModule | null = null;
let pdlpExports: PdlpExports | null = null;

type CReturn = 'number' | undefined;
type CArg = 'number';

type PdlpExports = {
  validateQuadraticProgram(qpPtr: number, qpLength: number, lenPtr: number): number;
  isLinearProgram(qpPtr: number, qpLength: number): number;
  qpFromMpModelProto(protoPtr: number, protoLength: number, relaxIntegerVariables: number, includeNames: number, lenPtr: number): number;
  qpToMpModelProto(qpPtr: number, qpLength: number, lenPtr: number): number;
  primalDualHybridGradient(requestPtr: number, requestLength: number, lenPtr: number): number;
};

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

type PdlpWorkerResponse = Extract<WorkerResponse, { type: 'pdlpResult' }>;

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

function wrap<T extends (...args: never[]) => unknown>(
  module: OrToolsWasmModule,
  name: string,
  returnType: CReturn,
  argTypes: CArg[],
): T {
  return module.cwrap(name, returnType, argTypes) as unknown as T;
}

function createPdlpExports(module: OrToolsWasmModule): PdlpExports {
  return {
    validateQuadraticProgram: wrap(module, 'pdlp_validate_quadratic_program', 'number', ['number', 'number', 'number']),
    isLinearProgram: wrap(module, 'pdlp_is_linear_program', 'number', ['number', 'number']),
    qpFromMpModelProto: wrap(module, 'pdlp_qp_from_mpmodel_proto', 'number', ['number', 'number', 'number', 'number', 'number']),
    qpToMpModelProto: wrap(module, 'pdlp_qp_to_mpmodel_proto', 'number', ['number', 'number', 'number']),
    primalDualHybridGradient: wrap(module, 'pdlp_primal_dual_hybrid_gradient', 'number', ['number', 'number', 'number']),
  };
}

async function loadPdlpModule(): Promise<OrToolsWasmModule> {
  if (!pdlpModulePromise) {
    pdlpModulePromise = loadPdlpRuntime().then((module) => {
      pdlpModule = module;
      pdlpExports = createPdlpExports(module);
      return module;
    });
  }
  return pdlpModulePromise;
}

function getPdlpModule(): OrToolsWasmModule {
  if (!pdlpModule) {
    throw new Error('initPdlp() must be awaited before using the synchronous PDLP API.');
  }
  return pdlpModule;
}

function getPdlpExports(): PdlpExports {
  if (!pdlpExports) {
    throw new Error('initPdlp() must be awaited before using the synchronous PDLP API.');
  }
  return pdlpExports;
}

export async function initPdlp(): Promise<void> {
  await loadPdlpModule();
}

function copyBytesToHeap(module: OrToolsWasmModule, bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

function readUint32LE(buffer: ArrayBufferLike, ptr: number): number {
  return new DataView(buffer, ptr, 4).getUint32(0, true);
}

function readNativeBytes(module: OrToolsWasmModule, fn: (lenPtr: number) => number): Uint8Array {
  const lenPtr = module._malloc(4);
  let responsePtr = 0;
  try {
    responsePtr = fn(lenPtr);
    const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
    return responsePtr && len ? module.HEAPU8.slice(responsePtr, responsePtr + len) : new Uint8Array();
  } finally {
    if (responsePtr) {
      module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
    }
    module._free(lenPtr);
  }
}

function runWithBytes(bytes: Uint8Array, fn: (module: OrToolsWasmModule, ptr: number, len: number) => Uint8Array): Uint8Array {
  const module = getPdlpModule();
  const ptr = copyBytesToHeap(module, bytes);
  try {
    return fn(module, ptr, bytes.length);
  } finally {
    if (ptr) module._free(ptr);
  }
}

async function runPdlpWorker(operation: 'validate' | 'isLinear' | 'fromMpModel' | 'toMpModel' | 'solve', bytes: Uint8Array, options: { relaxIntegerVariables?: boolean; includeNames?: boolean } = {}): Promise<{ bytes: Uint8Array; value?: number }> {
  const response = await postWorkerRequest<PdlpWorkerResponse>({
    type: 'pdlp',
    id: nextWorkerBridgeRequestId(),
    operation,
    bytes,
    relaxIntegerVariables: options.relaxIntegerVariables,
    includeNames: options.includeNames,
  });
  return { bytes: response.bytes, value: response.value };
}

class BinaryWriter {
  private readonly parts: Uint8Array[] = [];

  u8(value: number): void {
    this.parts.push(Uint8Array.of(value & 0xff));
  }

  u32(value: number): void {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.parts.push(bytes);
  }

  double(value: number): void {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.parts.push(bytes);
  }

  string(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.length);
    this.parts.push(bytes);
  }

  doubles(values: number[]): void {
    this.u32(values.length);
    for (const value of values) this.double(value);
  }

  strings(values: string[]): void {
    this.u32(values.length);
    for (const value of values) this.string(value);
  }

  finish(): Uint8Array {
    const size = this.parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    return this.bytes[this.offset++] ?? 0;
  }

  u32(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getUint32(0, true);
    this.offset += 4;
    return value;
  }

  double(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  string(): string {
    const size = this.u32();
    const value = new TextDecoder().decode(this.bytes.slice(this.offset, this.offset + size));
    this.offset += size;
    return value;
  }

  doubles(): number[] {
    return Array.from({ length: this.u32() }, () => this.double());
  }

  strings(): string[] {
    return Array.from({ length: this.u32() }, () => this.string());
  }
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

function encodeQuadraticProgram(input: QuadraticProgramInput): Uint8Array {
  const qp = normalizeQuadraticProgram(input);
  const writer = new BinaryWriter();
  writer.u32(qp.numVariables);
  writer.u32(qp.numConstraints);
  writer.string(qp.problemName);
  writer.double(qp.objectiveOffset);
  writer.double(qp.objectiveScalingFactor);
  writer.doubles(qp.objectiveVector);
  if (qp.objectiveMatrixDiagonal) {
    writer.u8(1);
    writer.doubles(qp.objectiveMatrixDiagonal);
  } else {
    writer.u8(0);
  }
  writer.doubles(qp.constraintLowerBounds);
  writer.doubles(qp.constraintUpperBounds);
  writer.doubles(qp.variableLowerBounds);
  writer.doubles(qp.variableUpperBounds);
  writer.strings(qp.variableNames);
  writer.strings(qp.constraintNames);
  writer.u32(qp.constraintMatrixEntries.length);
  for (const entry of qp.constraintMatrixEntries) {
    writer.u32(entry.row);
    writer.u32(entry.column);
    writer.double(entry.value);
  }
  return writer.finish();
}

function decodeQuadraticProgram(bytes: Uint8Array): QuadraticProgram {
  const reader = new BinaryReader(bytes);
  const numVariables = reader.u32();
  const numConstraints = reader.u32();
  const problemName = reader.string();
  const objectiveOffset = reader.double();
  const objectiveScalingFactor = reader.double();
  const objectiveVector = reader.doubles();
  const objectiveMatrixDiagonal = reader.u8() ? reader.doubles() : null;
  const constraintLowerBounds = reader.doubles();
  const constraintUpperBounds = reader.doubles();
  const variableLowerBounds = reader.doubles();
  const variableUpperBounds = reader.doubles();
  const variableNames = reader.strings();
  const constraintNames = reader.strings();
  const entries = Array.from({ length: reader.u32() }, () => ({
    row: reader.u32(),
    column: reader.u32(),
    value: reader.double(),
  }));
  return new QuadraticProgram({
    problemName,
    objectiveOffset,
    objectiveScalingFactor,
    objectiveVector,
    objectiveMatrixDiagonal,
    constraintLowerBounds,
    constraintUpperBounds,
    variableLowerBounds,
    variableUpperBounds,
    variableNames,
    constraintNames,
    constraintMatrix: { numRows: numConstraints, numColumns: numVariables, entries },
  });
}

function encodeParams(params: PdlpSolveParams = {}): Uint8Array {
  const writer = new BinaryWriter();
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
  const iterationLimit = terminationCriteria?.iterationLimit ?? terminationCriteria?.iteration_limit;
  if (iterationLimit !== undefined) {
    writer.u8(1);
    writer.u32(iterationLimit);
  } else {
    writer.u8(0);
  }
  const terminationCheckFrequency = params.terminationCheckFrequency ?? params.termination_check_frequency;
  if (terminationCheckFrequency !== undefined) {
    writer.u8(1);
    writer.u32(terminationCheckFrequency);
  } else {
    writer.u8(0);
  }
  const epsOptimalRelative = simple?.epsOptimalRelative ?? simple?.eps_optimal_relative;
  if (epsOptimalRelative !== undefined) {
    writer.u8(1);
    writer.double(epsOptimalRelative);
  } else {
    writer.u8(0);
  }
  const epsOptimalAbsolute = simple?.epsOptimalAbsolute ?? simple?.eps_optimal_absolute;
  if (epsOptimalAbsolute !== undefined) {
    writer.u8(1);
    writer.double(epsOptimalAbsolute);
  } else {
    writer.u8(0);
  }
  const lInfRuizIterations = params.lInfRuizIterations ?? params.l_inf_ruiz_iterations;
  if (lInfRuizIterations !== undefined) {
    writer.u8(1);
    writer.u32(lInfRuizIterations);
  } else {
    writer.u8(0);
  }
  const l2NormRescaling = params.l2NormRescaling ?? params.l2_norm_rescaling;
  if (l2NormRescaling !== undefined) {
    writer.u8(1);
    writer.u8(l2NormRescaling ? 1 : 0);
  } else {
    writer.u8(0);
  }
  return writer.finish();
}

function encodeInitialSolution(solution?: PrimalAndDualSolutionInput): Uint8Array {
  const writer = new BinaryWriter();
  if (!solution) {
    writer.u8(0);
    return writer.finish();
  }
  writer.u8(1);
  writer.doubles(solution.primal_solution ?? solution.primalSolution ?? []);
  writer.doubles(solution.dual_solution ?? solution.dualSolution ?? []);
  return writer.finish();
}

function decodeSolverResult(bytes: Uint8Array): PdlpSolverResult {
  const reader = new BinaryReader(bytes);
  if (reader.u8() === 0) {
    throw new Error(reader.string() || 'PDLP solve failed.');
  }
  const primalSolution = reader.doubles();
  const dualSolution = reader.doubles();
  const reducedCosts = reader.doubles();
  const terminationReasonNumber = reader.u32();
  const iterationCount = reader.u32();
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

async function pdlpBytes(operation: 'validate' | 'fromMpModel' | 'toMpModel' | 'solve', bytes: Uint8Array, options: { relaxIntegerVariables?: boolean; includeNames?: boolean } = {}): Promise<Uint8Array> {
  if (shouldUseWorkerBridge()) {
    return (await runPdlpWorker(operation, bytes, options)).bytes;
  }
  await initPdlp();
  const exports = getPdlpExports();
  return runWithBytes(bytes, (module, ptr, len) => readNativeBytes(module, (lenPtr) => {
    if (operation === 'validate') return exports.validateQuadraticProgram(ptr, len, lenPtr);
    if (operation === 'fromMpModel') return exports.qpFromMpModelProto(ptr, len, options.relaxIntegerVariables ? 1 : 0, options.includeNames ? 1 : 0, lenPtr);
    if (operation === 'toMpModel') return exports.qpToMpModelProto(ptr, len, lenPtr);
    return exports.primalDualHybridGradient(ptr, len, lenPtr);
  }));
}

async function pdlpIsLinearProgram(bytes: Uint8Array): Promise<boolean> {
  if (shouldUseWorkerBridge()) {
    return (await runPdlpWorker('isLinear', bytes)).value === 1;
  }
  await initPdlp();
  const exports = getPdlpExports();
  return runWithBytes(bytes, (_module, ptr, len) => Uint8Array.of(exports.isLinearProgram(ptr, len))).at(0) === 1;
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
    return encodeQuadraticProgram(this);
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

  async validateQuadraticProgramDimensions(qp: QuadraticProgramInput | QuadraticProgram): Promise<void> {
    const message = new TextDecoder().decode(await pdlpBytes('validate', encodeQuadraticProgram(qp)));
    if (message) throw new Error(message);
  },

  async validate_quadratic_program_dimensions(qp: QuadraticProgramInput | QuadraticProgram): Promise<void> {
    return this.validateQuadraticProgramDimensions(qp);
  },

  async isLinearProgram(qp: QuadraticProgramInput | QuadraticProgram): Promise<boolean> {
    return pdlpIsLinearProgram(encodeQuadraticProgram(qp));
  },

  async is_linear_program(qp: QuadraticProgramInput | QuadraticProgram): Promise<boolean> {
    return this.isLinearProgram(qp);
  },

  async qpFromMpModelProto(proto: Uint8Array, options: { relaxIntegerVariables?: boolean; includeNames?: boolean } = {}): Promise<QuadraticProgram> {
    const bytes = await pdlpBytes('fromMpModel', proto, options);
    if (!bytes.length) throw new Error('PDLP could not convert MPModelProto to QuadraticProgram.');
    return decodeQuadraticProgram(bytes);
  },

  async qp_from_mpmodel_proto(proto: Uint8Array, relaxIntegerVariables = false, includeNames = false): Promise<QuadraticProgram> {
    return this.qpFromMpModelProto(proto, { relaxIntegerVariables, includeNames });
  },

  async qpToMpModelProto(qp: QuadraticProgramInput | QuadraticProgram): Promise<Uint8Array> {
    const bytes = await pdlpBytes('toMpModel', encodeQuadraticProgram(qp));
    if (!bytes.length) throw new Error('PDLP could not convert QuadraticProgram to MPModelProto.');
    return bytes;
  },

  async qp_to_mpmodel_proto(qp: QuadraticProgramInput | QuadraticProgram): Promise<Uint8Array> {
    return this.qpToMpModelProto(qp);
  },

  async primalDualHybridGradient(
    qp: QuadraticProgramInput | QuadraticProgram,
    params: PdlpSolveParams = {},
    initialSolution?: PrimalAndDualSolutionInput | PrimalAndDualSolution,
  ): Promise<PdlpSolverResult> {
    const bytes = concat([encodeQuadraticProgram(qp), encodeParams(params), encodeInitialSolution(initialSolution)]);
    const resultBytes = await pdlpBytes('solve', bytes);
    if (!resultBytes.length) throw new Error('PDLP solve failed.');
    return decodeSolverResult(resultBytes);
  },

  async primal_dual_hybrid_gradient(
    qp: QuadraticProgramInput | QuadraticProgram,
    params: PdlpSolveParams = {},
    initialSolution?: PrimalAndDualSolutionInput | PrimalAndDualSolution,
  ): Promise<PdlpSolverResult> {
    return this.primalDualHybridGradient(qp, params, initialSolution);
  },
};

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
