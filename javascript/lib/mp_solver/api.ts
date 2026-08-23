import { create } from '@bufbuild/protobuf';
import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorConfiguration, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import {
  MpSolverSchemaRequestSchema,
  MpSolverSolveRequestSchema,
} from '../generated/bridge/mp_solver_pb.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { decodeProtobufWithExactLongs } from '../protobufjs_helpers.js';
import { MpSolverExecutor, type MpSolverExecutorLike } from './executor.js';
import { MpSolverServerExecutor } from './server_executor.js';
import { MpSolverWorkerExecutor } from './worker_executor.js';
import * as protobufModule from 'protobufjs';

const directExecutor = new MpSolverExecutor();
const workerExecutor = new MpSolverWorkerExecutor();
let executor: MpSolverExecutorLike = createResolvedExecutor(resolveExecutorConfiguration());

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): MpSolverExecutorLike {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new MpSolverServerExecutor(configuration);
    case 'cloud': return new CloudExecutor('mp-solver', { test: configuration.test });
  }
}

export function setMPSolverExecutor(configuration: ExecutorConfiguration): void {
  executor = createResolvedExecutor(resolveExecutorConfiguration(configuration));
}

export async function initMPSolver(): Promise<void> {
  await executor.load();
}

export type MPSolverEvent = SolverJobEvent;
export type MPSolverExecutionOptions = {
  onEvent?: (event: MPSolverEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export type LinearSolverSchemas = {
  linear_solver: string;
  optional_boolean: string;
};

export type MPSolverModelRequest = Record<string, unknown>;
export type MPSolverSolutionResponse = Record<string, unknown>;

export type MPSolverProtoSolveResult = {
  bytes: Uint8Array;
  response: MPSolverSolutionResponse;
};

export type MPSolverProtoSolveOptions = {
  solverType?: OptimizationProblemType;
  timeLimitSeconds?: number;
  enableOutput?: boolean;
  solverSpecificParameters?: string;
  loadSolution?: boolean;
  tolerance?: number;
  numThreads?: number;
  num_threads?: number;
} & MPSolverExecutionOptions;

type ProtobufRoot = import('protobufjs').Root;
type ProtobufType = import('protobufjs').Type;

let linearSolverSchemasPromise: Promise<LinearSolverSchemas> | null = null;
let linearSolverRootPromise: Promise<ProtobufRoot> | null = null;
let mpModelTypePromise: Promise<ProtobufType> | null = null;
let mpModelRequestTypePromise: Promise<ProtobufType> | null = null;
let mpSolutionResponseTypePromise: Promise<ProtobufType> | null = null;

async function getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
  linearSolverSchemasPromise ??= (async () => {
    const job = executor.execute(
      { case: 'schema', value: create(MpSolverSchemaRequestSchema) },
      { onEvent: () => {} },
    );
    const response = await job.result;
    if (response.payload.case !== 'schema') throw new Error('MP Solver executor returned the wrong schema response.');
    return {
      linear_solver: response.payload.value.linearSolverProtoSchema,
      optional_boolean: response.payload.value.optionalBooleanProtoSchema,
    };
  })();
  return linearSolverSchemasPromise;
}

async function resolveLinearSolverRoot(): Promise<ProtobufRoot> {
  linearSolverRootPromise ??= (async () => {
    const schemas = await getLinearSolverSchemas();
    const optionalRoot = protobufModule.parse(schemas.optional_boolean).root;
    const linearSolverSource = schemas.linear_solver.replace(/^import "ortools\/util\/optional_boolean\.proto";\s*$/m, '');
    return protobufModule.parse(linearSolverSource, optionalRoot).root;
  })();
  return linearSolverRootPromise;
}

async function resolveMPModelRequestType(): Promise<ProtobufType> {
  mpModelRequestTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPModelRequest');
  })();
  return mpModelRequestTypePromise;
}

async function resolveMPModelType(): Promise<ProtobufType> {
  mpModelTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPModelProto');
  })();
  return mpModelTypePromise;
}

async function resolveMPSolutionResponseType(): Promise<ProtobufType> {
  mpSolutionResponseTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPSolutionResponse');
  })();
  return mpSolutionResponseTypePromise;
}

async function encodeMPModelRequest(request: MPSolverModelRequest): Promise<Uint8Array> {
  const type = await resolveMPModelRequestType();
  const error = type.verify(request);
  if (error) {
    throw new Error(`MPSolver.createModelRequest: ${error}`);
  }
  return type.encode(type.create(request)).finish();
}

async function encodeMPModel(model: MPSolverModelRequest): Promise<Uint8Array> {
  const type = await resolveMPModelType();
  const error = type.verify(model);
  if (error) {
    throw new Error(`MPSolver.exportModelProto: ${error}`);
  }
  return type.encode(type.create(model)).finish();
}

async function decodeMPSolutionResponse(bytes: Uint8Array): Promise<MPSolverSolutionResponse> {
  const type = await resolveMPSolutionResponseType();
  return decodeProtobufWithExactLongs<MPSolverSolutionResponse>(type, bytes);
}

async function encodeMPSolutionResponse(response: MPSolverSolutionResponse): Promise<Uint8Array> {
  const type = await resolveMPSolutionResponseType();
  const error = type.verify(response);
  if (error) {
    throw new Error(`MPSolver.createSolutionResponse: ${error}`);
  }
  return type.encode(type.create(response)).finish();
}

function normalizedNumThreads(options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads'> = {}): number | undefined {
  const numThreads = options.numThreads ?? options.num_threads;
  return typeof numThreads === 'number' && Number.isInteger(numThreads) && numThreads > 1 ? numThreads : undefined;
}

async function solveModelRequestBytes(
  requestBytes: Uint8Array,
  options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads' | 'onEvent' | 'signal'> = {},
): Promise<Uint8Array> {
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('MP Solver solve aborted.', 'AbortError');
  const numThreads = normalizedNumThreads(options) ?? 1;
  const job = executor.execute(
    { case: 'solve', value: create(MpSolverSolveRequestSchema, { requestProto: requestBytes, numThreads }) },
    { resources: { threads: numThreads }, onEvent: options.onEvent ?? (() => {}) },
  );
  const abort = () => { void job.cancel().catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await job.result;
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('MP Solver solve aborted.', 'AbortError');
    if (response.payload.case !== 'responseProto') throw new Error('MP Solver executor returned the wrong solve response.');
    return response.payload.value;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

export enum OptimizationProblemType {
  CLP_LINEAR_PROGRAMMING = 0,
  GLPK_LINEAR_PROGRAMMING = 1,
  GLOP_LINEAR_PROGRAMMING = 2,
  PDLP_LINEAR_PROGRAMMING = 8,
  HIGHS_LINEAR_PROGRAMMING = 15,
  SCIP_MIXED_INTEGER_PROGRAMMING = 3,
  GLPK_MIXED_INTEGER_PROGRAMMING = 4,
  CBC_MIXED_INTEGER_PROGRAMMING = 5,
  HIGHS_MIXED_INTEGER_PROGRAMMING = 16,
  GUROBI_LINEAR_PROGRAMMING = 6,
  GUROBI_MIXED_INTEGER_PROGRAMMING = 7,
  CPLEX_LINEAR_PROGRAMMING = 10,
  CPLEX_MIXED_INTEGER_PROGRAMMING = 11,
  XPRESS_LINEAR_PROGRAMMING = 101,
  XPRESS_MIXED_INTEGER_PROGRAMMING = 102,
  COPT_LINEAR_PROGRAMMING = 103,
  COPT_MIXED_INTEGER_PROGRAMMING = 104,
  BOP_INTEGER_PROGRAMMING = 12,
  SAT_INTEGER_PROGRAMMING = 14,
  KNAPSACK_MIXED_INTEGER_PROGRAMMING = 13,
}

export enum MPSolverResultStatus {
  OPTIMAL = 0,
  FEASIBLE = 1,
  INFEASIBLE = 2,
  UNBOUNDED = 3,
  ABNORMAL = 4,
  MODEL_INVALID = 5,
  NOT_SOLVED = 6,
}

export enum BasisStatus {
  FREE = 0,
  AT_LOWER_BOUND = 1,
  AT_UPPER_BOUND = 2,
  FIXED_VALUE = 3,
  BASIC = 4,
}

export enum DoubleParam {
  RELATIVE_MIP_GAP = 0,
  PRIMAL_TOLERANCE = 1,
  DUAL_TOLERANCE = 2,
}

export enum IntegerParam {
  PRESOLVE = 1000,
  LP_ALGORITHM = 1001,
  INCREMENTALITY = 1002,
  SCALING = 1003,
}

export enum PresolveValues {
  PRESOLVE_OFF = 0,
  PRESOLVE_ON = 1,
}

export enum LpAlgorithmValues {
  DUAL = 10,
  PRIMAL = 11,
  BARRIER = 12,
}

export enum IncrementalityValues {
  INCREMENTALITY_OFF = 0,
  INCREMENTALITY_ON = 1,
}

export enum ScalingValues {
  SCALING_OFF = 0,
  SCALING_ON = 1,
}

type MPVariableState = {
  index: number;
  name: string;
  lb: number;
  ub: number;
  integer: boolean;
  branchingPriority: number;
  solutionValue: number;
  unroundedSolutionValue: number;
  reducedCost: number;
  basisStatus: BasisStatus;
};

type MPConstraintState = {
  index: number;
  name: string;
  lb: number;
  ub: number;
  coeffs: Map<number, number>;
  dualValue: number;
  basisStatus: BasisStatus;
  lazy: boolean;
};

type MPObjectiveState = {
  coeffs: Map<number, number>;
  offset: number;
  maximize: boolean;
  value: number;
  bestBound: number;
};

type MPSolverState = {
  name: string;
  problemType: OptimizationProblemType;
  variables: MPVariableState[];
  constraints: MPConstraintState[];
  objective: MPObjectiveState;
  outputEnabled: boolean;
  timeLimitMs: number;
  numThreads: number;
  solverSpecificParameters: string;
  hints: { varIndex: number[]; varValue: number[] } | null;
  deleted: boolean;
  wallTimeMs: number;
  iterations: number;
  nodes: number;
  solutionLoaded: boolean;
};

const supportedProblemTypes = new Set<OptimizationProblemType>([
  OptimizationProblemType.CLP_LINEAR_PROGRAMMING,
  OptimizationProblemType.GLPK_LINEAR_PROGRAMMING,
  OptimizationProblemType.GLOP_LINEAR_PROGRAMMING,
  OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.BOP_INTEGER_PROGRAMMING,
  OptimizationProblemType.SAT_INTEGER_PROGRAMMING,
  OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING,
]);

const solverTypeAliases = new Map<string, OptimizationProblemType>([
  ['CLP', OptimizationProblemType.CLP_LINEAR_PROGRAMMING],
  ['CLP_LINEAR_PROGRAMMING', OptimizationProblemType.CLP_LINEAR_PROGRAMMING],
  ['GLPK_LP', OptimizationProblemType.GLPK_LINEAR_PROGRAMMING],
  ['GLPK_LINEAR_PROGRAMMING', OptimizationProblemType.GLPK_LINEAR_PROGRAMMING],
  ['GLOP', OptimizationProblemType.GLOP_LINEAR_PROGRAMMING],
  ['GLOP_LINEAR_PROGRAMMING', OptimizationProblemType.GLOP_LINEAR_PROGRAMMING],
  ['SCIP', OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING],
  ['SCIP_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING],
  ['CBC', OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING],
  ['CBC_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING],
  ['GLPK', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['GLPK_MIP', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['GLPK_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['BOP', OptimizationProblemType.BOP_INTEGER_PROGRAMMING],
  ['BOP_INTEGER_PROGRAMMING', OptimizationProblemType.BOP_INTEGER_PROGRAMMING],
  ['SAT', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['CP_SAT', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['SAT_INTEGER_PROGRAMMING', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['KNAPSACK', OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING],
  ['KNAPSACK_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING],
]);

function normalizeSolverId(solverId: string): string {
  return solverId.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function parseSolverType(solverId: string): OptimizationProblemType | null {
  return solverTypeAliases.get(normalizeSolverId(solverId)) ?? null;
}

function supportsProblemType(problemType: OptimizationProblemType): boolean {
  return supportedProblemTypes.has(problemType);
}

function problemIsMip(problemType: OptimizationProblemType): boolean {
  return problemType === OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.HIGHS_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.GUROBI_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CPLEX_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.XPRESS_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.COPT_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.BOP_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING;
}

function problemSupportsNumThreads(problemType: OptimizationProblemType): boolean {
  return problemType === OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING;
}

function createSolverState(name: string, problemType: OptimizationProblemType): MPSolverState {
  if (!supportsProblemType(problemType)) {
    throw new Error(`MPSolver: problem type ${problemType} is not supported by the serialized model.`);
  }
  return {
    name,
    problemType,
    variables: [],
    constraints: [],
    objective: {
      coeffs: new Map(),
      offset: 0,
      maximize: false,
      value: 0,
      bestBound: 0,
    },
    outputEnabled: false,
    timeLimitMs: 0,
    numThreads: 1,
    solverSpecificParameters: '',
    hints: null,
    deleted: false,
    wallTimeMs: 0,
    iterations: 0,
    nodes: 0,
    solutionLoaded: false,
  };
}

function defaultDoubleParam(param: DoubleParam): number {
  if (param === DoubleParam.RELATIVE_MIP_GAP) return MPSolverParameters.kDefaultRelativeMipGap;
  if (param === DoubleParam.PRIMAL_TOLERANCE) return MPSolverParameters.kDefaultPrimalTolerance;
  if (param === DoubleParam.DUAL_TOLERANCE) return MPSolverParameters.kDefaultDualTolerance;
  return 0;
}

function defaultIntegerParam(param: IntegerParam): number {
  if (param === IntegerParam.PRESOLVE) return MPSolverParameters.kDefaultPresolve;
  if (param === IntegerParam.INCREMENTALITY) return MPSolverParameters.kDefaultIncrementality;
  if (param === IntegerParam.LP_ALGORITHM) return LpAlgorithmValues.DUAL;
  if (param === IntegerParam.SCALING) return ScalingValues.SCALING_ON;
  return 0;
}

function responseStatusToResultStatus(status: unknown): MPSolverResultStatus {
  if (typeof status === 'number') {
    if (status === 0) return MPSolverResultStatus.OPTIMAL;
    if (status === 1) return MPSolverResultStatus.FEASIBLE;
    if (status === 2) return MPSolverResultStatus.INFEASIBLE;
    if (status === 3) return MPSolverResultStatus.UNBOUNDED;
    if (status === 4) return MPSolverResultStatus.ABNORMAL;
    if (status === 5) return MPSolverResultStatus.MODEL_INVALID;
    if (status === 6) return MPSolverResultStatus.NOT_SOLVED;
  }
  if (status === 'MPSOLVER_OPTIMAL') return MPSolverResultStatus.OPTIMAL;
  if (status === 'MPSOLVER_FEASIBLE') return MPSolverResultStatus.FEASIBLE;
  if (status === 'MPSOLVER_INFEASIBLE') return MPSolverResultStatus.INFEASIBLE;
  if (status === 'MPSOLVER_UNBOUNDED') return MPSolverResultStatus.UNBOUNDED;
  if (status === 'MPSOLVER_ABNORMAL') return MPSolverResultStatus.ABNORMAL;
  if (status === 'MPSOLVER_MODEL_INVALID'
    || status === 'MPSOLVER_MODEL_INVALID_SOLUTION_HINT'
    || status === 'MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS') {
    return MPSolverResultStatus.MODEL_INVALID;
  }
  return MPSolverResultStatus.NOT_SOLVED;
}

function responseHasSolution(status: unknown): boolean {
  const resultStatus = responseStatusToResultStatus(status);
  return resultStatus === MPSolverResultStatus.OPTIMAL || resultStatus === MPSolverResultStatus.FEASIBLE;
}

function constraintActivity(state: MPSolverState, constraint: MPConstraintState): number {
  let value = 0;
  for (const [variableIndex, coefficient] of constraint.coeffs) {
    value += coefficient * (state.variables[variableIndex]?.solutionValue ?? 0);
  }
  return value;
}

function objectiveValue(state: MPSolverState): number {
  let value = state.objective.offset;
  for (const [variableIndex, coefficient] of state.objective.coeffs) {
    value += coefficient * (state.variables[variableIndex]?.solutionValue ?? 0);
  }
  return value;
}

function basisStatusForBounds(value: number, lb: number, ub: number): BasisStatus {
  const tolerance = 1e-7;
  if (Number.isFinite(lb) && Number.isFinite(ub) && Math.abs(lb - ub) <= tolerance) {
    return BasisStatus.FIXED_VALUE;
  }
  if (Number.isFinite(lb) && Math.abs(value - lb) <= tolerance) return BasisStatus.AT_LOWER_BOUND;
  if (Number.isFinite(ub) && Math.abs(value - ub) <= tolerance) return BasisStatus.AT_UPPER_BOUND;
  return BasisStatus.BASIC;
}

function modelProto(state: MPSolverState): MPSolverModelRequest {
  const model: MPSolverModelRequest = {
    name: state.name,
    maximize: state.objective.maximize,
    objectiveOffset: state.objective.offset,
    variable: state.variables.map((variable) => ({
      lowerBound: variable.lb,
      upperBound: variable.ub,
      objectiveCoefficient: state.objective.coeffs.get(variable.index) ?? 0,
      isInteger: variable.integer,
      name: variable.name,
      branchingPriority: variable.branchingPriority,
    })),
    constraint: state.constraints.map((constraint) => ({
      lowerBound: constraint.lb,
      upperBound: constraint.ub,
      varIndex: [...constraint.coeffs.keys()],
      coefficient: [...constraint.coeffs.values()],
      name: constraint.name,
      isLazy: constraint.lazy,
    })),
  };
  if (state.hints && state.hints.varIndex.length > 0) {
    model.solutionHint = state.hints;
  }
  return model;
}

function modelRequest(state: MPSolverState, options: MPSolverProtoSolveOptions = {}): MPSolverModelRequest {
  const request: MPSolverModelRequest = {
    solverType: options.solverType ?? state.problemType,
    model: modelProto(state),
  };
  const timeLimitSeconds = options.timeLimitSeconds ?? (state.timeLimitMs > 0 ? state.timeLimitMs / 1000 : undefined);
  if (timeLimitSeconds !== undefined) request.solverTimeLimitSeconds = timeLimitSeconds;
  const enableOutput = options.enableOutput ?? state.outputEnabled;
  if (enableOutput) request.enableInternalSolverOutput = true;
  const solverSpecificParameters = options.solverSpecificParameters ?? state.solverSpecificParameters;
  if (solverSpecificParameters) request.solverSpecificParameters = solverSpecificParameters;
  return request;
}

function applySolutionResponse(state: MPSolverState, response: MPSolverSolutionResponse): boolean {
  const loaded = responseHasSolution(response.status);
  const variableValues = Array.isArray(response.variableValue) ? response.variableValue : [];
  for (const variable of state.variables) {
    const value = Number(variableValues[variable.index] ?? 0);
    variable.solutionValue = value;
    variable.unroundedSolutionValue = value;
    variable.basisStatus = basisStatusForBounds(value, variable.lb, variable.ub);
  }
  const reducedCosts = Array.isArray(response.reducedCost) ? response.reducedCost : [];
  for (const variable of state.variables) {
    if (variable.index < reducedCosts.length) {
      variable.reducedCost = Number(reducedCosts[variable.index]);
    }
  }
  const dualValues = Array.isArray(response.dualValue) ? response.dualValue : [];
  for (const constraint of state.constraints) {
    if (constraint.index < dualValues.length) {
      constraint.dualValue = Number(dualValues[constraint.index]);
    }
    constraint.basisStatus = basisStatusForBounds(constraintActivity(state, constraint), constraint.lb, constraint.ub);
  }
  state.objective.value = typeof response.objectiveValue === 'number' ? response.objectiveValue : objectiveValue(state);
  state.objective.bestBound = problemIsMip(state.problemType) && typeof response.bestObjectiveBound === 'number'
    ? response.bestObjectiveBound
    : state.objective.value;
  const reportedWallTime = solveWallTimeMs(response);
  if (reportedWallTime !== undefined) state.wallTimeMs = reportedWallTime;
  state.solutionLoaded = loaded;
  return loaded;
}

function solveWallTimeMs(response: MPSolverSolutionResponse): number | undefined {
  const solveInfo = response.solveInfo as { solveWallTimeSeconds?: number } | undefined;
  return typeof solveInfo?.solveWallTimeSeconds === 'number'
    ? Math.round(solveInfo.solveWallTimeSeconds * 1000)
    : undefined;
}

function resetSolution(state: MPSolverState): void {
  for (const variable of state.variables) {
    variable.solutionValue = 0;
    variable.unroundedSolutionValue = 0;
    variable.reducedCost = 0;
    variable.basisStatus = BasisStatus.FREE;
  }
  for (const constraint of state.constraints) {
    constraint.dualValue = 0;
    constraint.basisStatus = BasisStatus.FREE;
  }
  state.objective.value = 0;
  state.objective.bestBound = 0;
  state.wallTimeMs = 0;
  state.iterations = 0;
  state.nodes = 0;
  state.solutionLoaded = false;
}

type MPVariableRef = {
  index: number;
};

type MPConstraintRef = {
  index: number;
};

class MPSolverParameterState {
  private readonly doubleParams = new Map<DoubleParam, number>();
  private readonly integerParams = new Map<IntegerParam, number>();

  setDoubleParam(param: DoubleParam, value: number): void {
    this.doubleParams.set(param, value);
  }

  getDoubleParam(param: DoubleParam): number {
    return this.doubleParams.get(param) ?? defaultDoubleParam(param);
  }

  resetDoubleParam(param: DoubleParam): void {
    this.doubleParams.delete(param);
  }

  setIntegerParam(param: IntegerParam, value: number): void {
    this.integerParams.set(param, value);
  }

  getIntegerParam(param: IntegerParam): number {
    return this.integerParams.get(param) ?? defaultIntegerParam(param);
  }

  resetIntegerParam(param: IntegerParam): void {
    this.integerParams.delete(param);
  }

  reset(): void {
    this.doubleParams.clear();
    this.integerParams.clear();
  }

  delete(): void {
    this.reset();
  }
}

class MPSolverModel {
  private readonly state: MPSolverState;

  constructor(name: string, problemType: OptimizationProblemType) {
    this.state = createSolverState(name, problemType);
  }

  private variableState(ref: MPVariableRef): MPVariableState {
    const variable = this.state.variables[ref.index];
    if (!variable) throw new Error(`MPSolver.variable: no variable at index ${ref.index}.`);
    return variable;
  }

  private constraintState(ref: MPConstraintRef): MPConstraintState {
    const constraint = this.state.constraints[ref.index];
    if (!constraint) throw new Error(`MPSolver.constraint: no constraint at index ${ref.index}.`);
    return constraint;
  }

  name(): string {
    return this.state.name;
  }

  problemType(): OptimizationProblemType {
    return this.state.problemType;
  }

  isMip(): boolean {
    return problemIsMip(this.state.problemType);
  }

  clear(): void {
    this.state.variables = [];
    this.state.constraints = [];
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.hints = null;
    resetSolution(this.state);
  }

  infinity(): number {
    return Number.POSITIVE_INFINITY;
  }

  variable(index: number): MPVariableRef {
    this.variableState({ index });
    return { index };
  }

  variables(): MPVariableRef[] {
    return this.state.variables.map((variable) => ({ index: variable.index }));
  }

  lookupVariable(name: string): MPVariableRef | null {
    const variable = this.state.variables.find((candidate) => candidate.name === name);
    return variable ? { index: variable.index } : null;
  }

  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableRef {
    const variable: MPVariableState = {
      index: this.state.variables.length,
      name,
      lb,
      ub,
      integer,
      branchingPriority: 0,
      solutionValue: 0,
      unroundedSolutionValue: 0,
      reducedCost: 0,
      basisStatus: BasisStatus.FREE,
    };
    this.state.variables.push(variable);
    return { index: variable.index };
  }

  variableSolutionValue(ref: MPVariableRef): number {
    return this.variableState(ref).solutionValue;
  }

  variableUnroundedSolutionValue(ref: MPVariableRef): number {
    return this.variableState(ref).unroundedSolutionValue;
  }

  variableReducedCost(ref: MPVariableRef): number {
    return this.variableState(ref).reducedCost;
  }

  variableBasisStatus(ref: MPVariableRef): BasisStatus {
    return this.variableState(ref).basisStatus;
  }

  variableIndex(ref: MPVariableRef): number {
    return this.variableState(ref).index;
  }

  variableName(ref: MPVariableRef): string {
    return this.variableState(ref).name;
  }

  variableLb(ref: MPVariableRef): number {
    return this.variableState(ref).lb;
  }

  variableUb(ref: MPVariableRef): number {
    return this.variableState(ref).ub;
  }

  setVariableBounds(ref: MPVariableRef, lb: number, ub: number): void {
    const variable = this.variableState(ref);
    variable.lb = lb;
    variable.ub = ub;
  }

  setVariableLb(ref: MPVariableRef, lb: number): void {
    this.variableState(ref).lb = lb;
  }

  setVariableUb(ref: MPVariableRef, ub: number): void {
    this.variableState(ref).ub = ub;
  }

  variableInteger(ref: MPVariableRef): boolean {
    return this.variableState(ref).integer;
  }

  setVariableInteger(ref: MPVariableRef, integer: boolean): void {
    this.variableState(ref).integer = integer;
  }

  variableBranchingPriority(ref: MPVariableRef): number {
    return this.variableState(ref).branchingPriority;
  }

  setVariableBranchingPriority(ref: MPVariableRef, priority: number): void {
    this.variableState(ref).branchingPriority = priority;
  }

  constraint(index: number): MPConstraintRef {
    this.constraintState({ index });
    return { index };
  }

  constraints(): MPConstraintRef[] {
    return this.state.constraints.map((constraint) => ({ index: constraint.index }));
  }

  lookupConstraint(name: string): MPConstraintRef | null {
    const constraint = this.state.constraints.find((candidate) => candidate.name === name);
    return constraint ? { index: constraint.index } : null;
  }

  addConstraint(lb: number | null, ub: number | null, name: string): MPConstraintRef {
    const constraint: MPConstraintState = {
      index: this.state.constraints.length,
      name,
      lb: lb ?? Number.NEGATIVE_INFINITY,
      ub: ub ?? Number.POSITIVE_INFINITY,
      coeffs: new Map(),
      dualValue: 0,
      basisStatus: BasisStatus.FREE,
      lazy: false,
    };
    this.state.constraints.push(constraint);
    return { index: constraint.index };
  }

  setConstraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef, coefficient: number): void {
    const constraint = this.constraintState(constraintRef);
    if (coefficient === 0) {
      constraint.coeffs.delete(variableRef.index);
    } else {
      constraint.coeffs.set(variableRef.index, coefficient);
    }
  }

  constraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef): number {
    return this.constraintState(constraintRef).coeffs.get(variableRef.index) ?? 0;
  }

  clearConstraint(constraint: MPConstraintRef): void {
    this.constraintState(constraint).coeffs.clear();
  }

  constraintIndex(ref: MPConstraintRef): number {
    return this.constraintState(ref).index;
  }

  constraintName(ref: MPConstraintRef): string {
    return this.constraintState(ref).name;
  }

  constraintLb(ref: MPConstraintRef): number {
    return this.constraintState(ref).lb;
  }

  constraintUb(ref: MPConstraintRef): number {
    return this.constraintState(ref).ub;
  }

  setConstraintBounds(ref: MPConstraintRef, lb: number, ub: number): void {
    const constraint = this.constraintState(ref);
    constraint.lb = lb;
    constraint.ub = ub;
  }

  setConstraintLb(ref: MPConstraintRef, lb: number): void {
    this.constraintState(ref).lb = lb;
  }

  setConstraintUb(ref: MPConstraintRef, ub: number): void {
    this.constraintState(ref).ub = ub;
  }

  constraintDualValue(ref: MPConstraintRef): number {
    return this.constraintState(ref).dualValue;
  }

  constraintBasisStatus(ref: MPConstraintRef): BasisStatus {
    return this.constraintState(ref).basisStatus;
  }

  constraintIsLazy(ref: MPConstraintRef): boolean {
    return this.constraintState(ref).lazy;
  }

  setConstraintIsLazy(ref: MPConstraintRef, laziness: boolean): void {
    this.constraintState(ref).lazy = laziness;
  }

  clearObjective(): void {
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.objective.value = 0;
    this.state.objective.bestBound = 0;
  }

  setObjectiveCoefficient(variable: MPVariableRef, coefficient: number): void {
    if (coefficient === 0) {
      this.state.objective.coeffs.delete(variable.index);
    } else {
      this.state.objective.coeffs.set(variable.index, coefficient);
    }
  }

  objectiveCoefficient(variable: MPVariableRef): number {
    return this.state.objective.coeffs.get(variable.index) ?? 0;
  }

  setObjectiveOffset(offset: number): void {
    this.state.objective.offset = offset;
  }

  addObjectiveOffset(offset: number): void {
    this.state.objective.offset += offset;
  }

  objectiveOffset(): number {
    return this.state.objective.offset;
  }

  setObjectiveDirection(maximize: boolean): void {
    this.state.objective.maximize = maximize;
  }

  objectiveValue(): number {
    return this.state.objective.value;
  }

  objectiveBestBound(): number {
    return this.state.objective.bestBound;
  }

  objectiveMaximization(): boolean {
    return this.state.objective.maximize;
  }

  async solve(_parameters?: MPSolverParameterState): Promise<MPSolverResultStatus> {
    const started = Date.now();
    const result = await MPSolver.solveModelRequest(
      modelRequest(this.state),
      { numThreads: this.state.numThreads },
    );
    applySolutionResponse(this.state, result.response);
    if (solveWallTimeMs(result.response) === undefined) {
      this.state.wallTimeMs = Date.now() - started;
    }
    return responseStatusToResultStatus(result.response.status);
  }

  exportModelProto(): Promise<Uint8Array> {
    return encodeMPModel(modelProto(this.state));
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return encodeMPModelRequest(modelRequest(this.state, options));
  }

  async loadSolutionFromProto(response: Uint8Array | MPSolverSolutionResponse, _tolerance: number): Promise<boolean> {
    const decoded = response instanceof Uint8Array ? await decodeMPSolutionResponse(response) : response;
    return applySolutionResponse(this.state, decoded);
  }

  verifySolution(tolerance: number, _logErrors = false): boolean {
    if (!this.state.solutionLoaded) return false;
    for (const variable of this.state.variables) {
      if (variable.solutionValue < variable.lb - tolerance || variable.solutionValue > variable.ub + tolerance) return false;
      if (variable.integer && Math.abs(variable.solutionValue - Math.round(variable.solutionValue)) > tolerance) return false;
    }
    for (const constraint of this.state.constraints) {
      const activity = constraintActivity(this.state, constraint);
      if (activity < constraint.lb - tolerance || activity > constraint.ub + tolerance) return false;
    }
    return true;
  }

  reset(): void {
    resetSolution(this.state);
  }

  interruptSolve(): boolean {
    return false;
  }

  nextSolution(): boolean {
    return false;
  }

  enableOutput(): void {
    this.state.outputEnabled = true;
  }

  suppressOutput(): void {
    this.state.outputEnabled = false;
  }

  outputIsEnabled(): boolean {
    return this.state.outputEnabled;
  }

  setTimeLimit(milliseconds: number): void {
    this.state.timeLimitMs = Math.trunc(milliseconds);
  }

  timeLimit(): number {
    return this.state.timeLimitMs;
  }

  setNumThreads(numThreads: number): boolean {
    if (!Number.isInteger(numThreads) || numThreads < 1) return false;
    if (!problemSupportsNumThreads(this.state.problemType)) {
      return false;
    }
    this.state.numThreads = numThreads;
    return true;
  }

  getNumThreads(): number {
    return this.state.numThreads;
  }

  setSolverSpecificParametersAsString(parameters: string): boolean {
    this.state.solverSpecificParameters = parameters;
    return true;
  }

  getSolverSpecificParametersAsString(): string {
    return this.state.solverSpecificParameters;
  }

  solverVersion(): string {
    return 'OR-Tools serialized MPSolver';
  }

  computeConstraintActivities(): number[] {
    return this.state.constraints.map((constraint) => constraintActivity(this.state, constraint));
  }

  computeExactConditionNumber(): number {
    return 0;
  }

  setHint(variables: MPVariableRef[], values: number[]): void {
    this.state.hints = {
      varIndex: variables.map((variable) => variable.index),
      varValue: [...values],
    };
  }

  exportModelAsLpFormat(_obfuscate: boolean): string {
    return `${this.state.objective.maximize ? 'Maximize' : 'Minimize'}\n obj: ${this.state.name}\nSubject To\n${this.state.constraints.map((c) => ` ${c.name}`).join('\n')}\nEnd\n`;
  }

  exportModelAsMpsFormat(_fixedFormat: boolean, _obfuscate: boolean): string {
    return `NAME          ${this.state.name}\nROWS\nCOLUMNS\nRHS\nBOUNDS\nENDATA\n`;
  }

  numVariables(): number {
    return this.state.variables.length;
  }

  numConstraints(): number {
    return this.state.constraints.length;
  }

  wallTime(): number {
    return this.state.wallTimeMs;
  }

  iterations(): number {
    return this.state.iterations;
  }

  nodes(): number {
    return this.state.nodes;
  }

  delete(): void {
    this.state.deleted = true;
    this.clear();
  }
}

export class MPVariable {
  constructor(
    private readonly model: MPSolverModel,
    readonly ref: MPVariableRef,
  ) {}

  SolutionValue(): number {
    return this.solution_value();
  }

  solution_value(): number {
    return this.model.variableSolutionValue(this.ref);
  }

  unrounded_solution_value(): number {
    return this.model.variableUnroundedSolutionValue(this.ref);
  }

  ReducedCost(): number {
    return this.reduced_cost();
  }

  reduced_cost(): number {
    return this.model.variableReducedCost(this.ref);
  }

  basis_status(): BasisStatus {
    return this.model.variableBasisStatus(this.ref);
  }

  index(): number {
    return this.model.variableIndex(this.ref);
  }

  name(): string {
    return this.model.variableName(this.ref);
  }

  Lb(): number {
    return this.model.variableLb(this.ref);
  }

  Ub(): number {
    return this.model.variableUb(this.ref);
  }

  SetBounds(lb: number, ub: number): void {
    this.model.setVariableBounds(this.ref, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.model.setVariableLb(this.ref, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.model.setVariableUb(this.ref, ub);
  }

  Integer(): boolean {
    return this.model.variableInteger(this.ref);
  }

  SetInteger(integer: boolean): void {
    this.model.setVariableInteger(this.ref, integer);
  }

  branching_priority(): number {
    return this.model.variableBranchingPriority(this.ref);
  }

  SetBranchingPriority(priority: number): void {
    this.model.setVariableBranchingPriority(this.ref, priority);
  }

  toString(): string {
    return this.name();
  }
}

export class MPConstraint {
  constructor(
    private readonly model: MPSolverModel,
    readonly ref: MPConstraintRef,
  ) {}

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.model.setConstraintCoefficient(this.ref, variable.ref, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.model.constraintCoefficient(this.ref, variable.ref);
  }

  Clear(): void {
    this.model.clearConstraint(this.ref);
  }

  index(): number {
    return this.model.constraintIndex(this.ref);
  }

  name(): string {
    return this.model.constraintName(this.ref);
  }

  Lb(): number {
    return this.model.constraintLb(this.ref);
  }

  Ub(): number {
    return this.model.constraintUb(this.ref);
  }

  SetBounds(lb: number, ub: number): void {
    this.model.setConstraintBounds(this.ref, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.model.setConstraintLb(this.ref, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.model.setConstraintUb(this.ref, ub);
  }

  DualValue(): number {
    return this.dual_value();
  }

  dual_value(): number {
    return this.model.constraintDualValue(this.ref);
  }

  basis_status(): BasisStatus {
    return this.model.constraintBasisStatus(this.ref);
  }

  is_lazy(): boolean {
    return this.model.constraintIsLazy(this.ref);
  }

  set_is_lazy(laziness: boolean): void {
    this.model.setConstraintIsLazy(this.ref, laziness);
  }
}

export class MPObjective {
  constructor(private readonly model: MPSolverModel) {}

  Clear(): void {
    this.model.clearObjective();
  }

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.model.setObjectiveCoefficient(variable.ref, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.model.objectiveCoefficient(variable.ref);
  }

  SetOffset(offset: number): void {
    this.model.setObjectiveOffset(offset);
  }

  AddOffset(offset: number): void {
    this.model.addObjectiveOffset(offset);
  }

  Offset(): number {
    return this.offset();
  }

  offset(): number {
    return this.model.objectiveOffset();
  }

  SetOptimizationDirection(maximize: boolean): void {
    this.model.setObjectiveDirection(maximize);
  }

  SetMinimization(): void {
    this.model.setObjectiveDirection(false);
  }

  SetMaximization(): void {
    this.model.setObjectiveDirection(true);
  }

  Value(): number {
    return this.model.objectiveValue();
  }

  BestBound(): number {
    return this.model.objectiveBestBound();
  }

  maximization(): boolean {
    return this.model.objectiveMaximization();
  }

  minimization(): boolean {
    return !this.model.objectiveMaximization();
  }
}

const solverParameterStates = new WeakMap<MPSolverParameters, MPSolverParameterState>();

function solverParameterState(parameters: MPSolverParameters): MPSolverParameterState {
  const state = solverParameterStates.get(parameters);
  if (!state) throw new Error('MPSolverParameters has been deleted.');
  return state;
}

export class MPSolverParameters {
  static readonly RELATIVE_MIP_GAP = DoubleParam.RELATIVE_MIP_GAP;
  static readonly PRIMAL_TOLERANCE = DoubleParam.PRIMAL_TOLERANCE;
  static readonly DUAL_TOLERANCE = DoubleParam.DUAL_TOLERANCE;
  static readonly PRESOLVE = IntegerParam.PRESOLVE;
  static readonly LP_ALGORITHM = IntegerParam.LP_ALGORITHM;
  static readonly INCREMENTALITY = IntegerParam.INCREMENTALITY;
  static readonly SCALING = IntegerParam.SCALING;
  static readonly PRESOLVE_OFF = PresolveValues.PRESOLVE_OFF;
  static readonly PRESOLVE_ON = PresolveValues.PRESOLVE_ON;
  static readonly DUAL = LpAlgorithmValues.DUAL;
  static readonly PRIMAL = LpAlgorithmValues.PRIMAL;
  static readonly BARRIER = LpAlgorithmValues.BARRIER;
  static readonly INCREMENTALITY_OFF = IncrementalityValues.INCREMENTALITY_OFF;
  static readonly INCREMENTALITY_ON = IncrementalityValues.INCREMENTALITY_ON;
  static readonly SCALING_OFF = ScalingValues.SCALING_OFF;
  static readonly SCALING_ON = ScalingValues.SCALING_ON;
  static readonly kDefaultRelativeMipGap = 1e-4;
  static readonly kDefaultPrimalTolerance = 1e-7;
  static readonly kDefaultDualTolerance = 1e-7;
  static readonly kDefaultPresolve = PresolveValues.PRESOLVE_ON;
  static readonly kDefaultIncrementality = IncrementalityValues.INCREMENTALITY_ON;

  constructor() {
    solverParameterStates.set(this, new MPSolverParameterState());
  }

  SetDoubleParam(param: DoubleParam, value: number): void {
    solverParameterState(this).setDoubleParam(param, value);
  }

  GetDoubleParam(param: DoubleParam): number {
    return solverParameterState(this).getDoubleParam(param);
  }

  ResetDoubleParam(param: DoubleParam): void {
    solverParameterState(this).resetDoubleParam(param);
  }

  SetIntegerParam(param: IntegerParam, value: number): void {
    solverParameterState(this).setIntegerParam(param, value);
  }

  GetIntegerParam(param: IntegerParam): number {
    return solverParameterState(this).getIntegerParam(param);
  }

  ResetIntegerParam(param: IntegerParam): void {
    solverParameterState(this).resetIntegerParam(param);
  }

  Reset(): void {
    solverParameterState(this).reset();
  }

  delete(): void {
    solverParameterState(this).delete();
    solverParameterStates.delete(this);
  }
}

export class MPSolver {
  static readonly CLP_LINEAR_PROGRAMMING = OptimizationProblemType.CLP_LINEAR_PROGRAMMING;
  static readonly GLPK_LINEAR_PROGRAMMING = OptimizationProblemType.GLPK_LINEAR_PROGRAMMING;
  static readonly GLOP_LINEAR_PROGRAMMING = OptimizationProblemType.GLOP_LINEAR_PROGRAMMING;
  static readonly PDLP_LINEAR_PROGRAMMING = OptimizationProblemType.PDLP_LINEAR_PROGRAMMING;
  static readonly HIGHS_LINEAR_PROGRAMMING = OptimizationProblemType.HIGHS_LINEAR_PROGRAMMING;
  static readonly SCIP_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING;
  static readonly GLPK_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING;
  static readonly CBC_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING;
  static readonly HIGHS_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.HIGHS_MIXED_INTEGER_PROGRAMMING;
  static readonly GUROBI_LINEAR_PROGRAMMING = OptimizationProblemType.GUROBI_LINEAR_PROGRAMMING;
  static readonly GUROBI_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.GUROBI_MIXED_INTEGER_PROGRAMMING;
  static readonly CPLEX_LINEAR_PROGRAMMING = OptimizationProblemType.CPLEX_LINEAR_PROGRAMMING;
  static readonly CPLEX_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.CPLEX_MIXED_INTEGER_PROGRAMMING;
  static readonly XPRESS_LINEAR_PROGRAMMING = OptimizationProblemType.XPRESS_LINEAR_PROGRAMMING;
  static readonly XPRESS_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.XPRESS_MIXED_INTEGER_PROGRAMMING;
  static readonly COPT_LINEAR_PROGRAMMING = OptimizationProblemType.COPT_LINEAR_PROGRAMMING;
  static readonly COPT_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.COPT_MIXED_INTEGER_PROGRAMMING;
  static readonly BOP_INTEGER_PROGRAMMING = OptimizationProblemType.BOP_INTEGER_PROGRAMMING;
  static readonly SAT_INTEGER_PROGRAMMING = OptimizationProblemType.SAT_INTEGER_PROGRAMMING;
  static readonly KNAPSACK_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING;
  static readonly OPTIMAL = MPSolverResultStatus.OPTIMAL;
  static readonly FEASIBLE = MPSolverResultStatus.FEASIBLE;
  static readonly INFEASIBLE = MPSolverResultStatus.INFEASIBLE;
  static readonly UNBOUNDED = MPSolverResultStatus.UNBOUNDED;
  static readonly ABNORMAL = MPSolverResultStatus.ABNORMAL;
  static readonly MODEL_INVALID = MPSolverResultStatus.MODEL_INVALID;
  static readonly NOT_SOLVED = MPSolverResultStatus.NOT_SOLVED;
  static readonly FREE = BasisStatus.FREE;
  static readonly AT_LOWER_BOUND = BasisStatus.AT_LOWER_BOUND;
  static readonly AT_UPPER_BOUND = BasisStatus.AT_UPPER_BOUND;
  static readonly FIXED_VALUE = BasisStatus.FIXED_VALUE;
  static readonly BASIC = BasisStatus.BASIC;

  readonly ready: Promise<void> = Promise.resolve();
  private readonly model: MPSolverModel;
  private readonly objective: MPObjective;

  constructor(name: string, problemType: OptimizationProblemType) {
    this.model = new MPSolverModel(name, problemType);
    this.objective = new MPObjective(this.model);
  }

  static CreateSolver(solverId: string): MPSolver | null {
    const problemType = parseSolverType(solverId);
    return problemType !== null && supportsProblemType(problemType)
      ? new MPSolver(solverId, problemType)
      : null;
  }

  static Infinity(): number {
    return Number.POSITIVE_INFINITY;
  }

  static SupportsProblemType(problemType: OptimizationProblemType): boolean {
    return supportsProblemType(problemType);
  }

  static ParseSolverType(solverId: string): OptimizationProblemType | null {
    return parseSolverType(solverId);
  }

  static ParseAndCheckSupportForProblemType(solverId: string): OptimizationProblemType | null {
    const problemType = MPSolver.ParseSolverType(solverId);
    if (problemType === null) return null;
    return MPSolver.SupportsProblemType(problemType) ? problemType : null;
  }

  static setExecutor(configuration: ExecutorConfiguration): void {
    setMPSolverExecutor(configuration);
  }

  static getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
    return getLinearSolverSchemas();
  }

  static createModelRequest(request: MPSolverModelRequest): Promise<Uint8Array> {
    return encodeMPModelRequest(request);
  }

  static decodeSolutionResponse(bytes: Uint8Array): Promise<MPSolverSolutionResponse> {
    return decodeMPSolutionResponse(bytes);
  }

  static createSolutionResponse(response: MPSolverSolutionResponse): Promise<Uint8Array> {
    return encodeMPSolutionResponse(response);
  }

  static async solveModelRequest(
    request: Uint8Array | MPSolverModelRequest,
    options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads'> = {},
  ): Promise<MPSolverProtoSolveResult> {
    const requestBytes = request instanceof Uint8Array ? request : await encodeMPModelRequest(request);
    const bytes = await solveModelRequestBytes(requestBytes, options);
    return {
      bytes,
      response: await decodeMPSolutionResponse(bytes),
    };
  }

  Name(): string {
    return this.model.name();
  }

  ProblemType(): OptimizationProblemType {
    return this.model.problemType();
  }

  IsMip(): boolean {
    return this.IsMIP();
  }

  IsMIP(): boolean {
    return this.model.isMip();
  }

  Clear(): void {
    this.model.clear();
  }

  infinity(): number {
    return this.model.infinity();
  }

  variable(index: number): MPVariable {
    return new MPVariable(this.model, this.model.variable(index));
  }

  variables(): MPVariable[] {
    return this.model.variables().map((ref) => new MPVariable(this.model, ref));
  }

  LookupVariableOrNull(name: string): MPVariable | null {
    const ref = this.model.lookupVariable(name);
    return ref ? new MPVariable(this.model, ref) : null;
  }

  LookupVariable(name: string): MPVariable | null {
    return this.LookupVariableOrNull(name);
  }

  Var(lb: number, ub: number, integer: boolean, name: string): MPVariable {
    return new MPVariable(this.model, this.model.addVariable(lb, ub, integer, name));
  }

  NumVar(lb: number, ub: number, name: string): MPVariable {
    return this.Var(lb, ub, false, name);
  }

  IntVar(lb: number, ub: number, name: string): MPVariable {
    return this.Var(lb, ub, true, name);
  }

  BoolVar(name: string): MPVariable {
    return this.Var(0, 1, true, name);
  }

  constraint(index: number): MPConstraint {
    return new MPConstraint(this.model, this.model.constraint(index));
  }

  constraints(): MPConstraint[] {
    return this.model.constraints().map((ref) => new MPConstraint(this.model, ref));
  }

  LookupConstraintOrNull(name: string): MPConstraint | null {
    const ref = this.model.lookupConstraint(name);
    return ref ? new MPConstraint(this.model, ref) : null;
  }

  LookupConstraint(name: string): MPConstraint | null {
    return this.LookupConstraintOrNull(name);
  }

  Constraint(): MPConstraint;
  Constraint(name: string): MPConstraint;
  Constraint(lb: number, ub: number, name?: string): MPConstraint;
  Constraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    const hasBounds = typeof lbOrName === 'number' && typeof ub === 'number';
    const constraintName = typeof lbOrName === 'string' ? lbOrName : name;
    return new MPConstraint(
      this.model,
      this.model.addConstraint(hasBounds ? lbOrName : null, hasBounds ? ub : null, constraintName),
    );
  }

  RowConstraint(): MPConstraint;
  RowConstraint(name: string): MPConstraint;
  RowConstraint(lb: number, ub: number, name?: string): MPConstraint;
  RowConstraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    if (typeof lbOrName === 'number') {
      if (typeof ub !== 'number') throw new Error('MPSolver.RowConstraint: upper bound is required.');
      return this.Constraint(lbOrName, ub, name);
    }
    return this.Constraint(lbOrName ?? '');
  }

  Objective(): MPObjective {
    return this.objective;
  }

  async Solve(parameters?: MPSolverParameters): Promise<MPSolverResultStatus> {
    return this.model.solve(parameters ? solverParameterState(parameters) : undefined);
  }

  exportModelProto(): Promise<Uint8Array> {
    return this.model.exportModelProto();
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return this.model.exportModelRequestProto(options);
  }

  async SolveWithProto(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult & { loaded: boolean }> {
    const requestBytes = await this.exportModelRequestProto(options);
    const result = await MPSolver.solveModelRequest(requestBytes, options);
    let loaded = false;
    if (options.loadSolution ?? true) {
      loaded = await this.LoadSolutionFromProto(result.bytes, options.tolerance);
    }
    return { ...result, loaded };
  }

  async LoadSolutionFromProto(
    response: Uint8Array | MPSolverSolutionResponse = {},
    tolerance = 1e-7,
  ): Promise<boolean> {
    return this.model.loadSolutionFromProto(response, tolerance);
  }

  VerifySolution(tolerance: number, logErrors: boolean): boolean {
    return this.model.verifySolution(tolerance, logErrors);
  }

  Reset(): void {
    this.model.reset();
  }

  InterruptSolve(): boolean {
    return this.model.interruptSolve();
  }

  NextSolution(): boolean {
    return this.model.nextSolution();
  }

  EnableOutput(): void {
    this.model.enableOutput();
  }

  SuppressOutput(): void {
    this.model.suppressOutput();
  }

  OutputIsEnabled(): boolean {
    return this.model.outputIsEnabled();
  }

  SetTimeLimit(milliseconds: number): void {
    this.set_time_limit(milliseconds);
  }

  set_time_limit(milliseconds: number): void {
    this.model.setTimeLimit(milliseconds);
  }

  time_limit(): number {
    return this.model.timeLimit();
  }

  SetNumThreads(numThreads: number): boolean {
    return this.model.setNumThreads(numThreads);
  }

  GetNumThreads(): number {
    return this.model.getNumThreads();
  }

  SetSolverSpecificParametersAsString(parameters: string): boolean {
    return this.model.setSolverSpecificParametersAsString(parameters);
  }

  GetSolverSpecificParametersAsString(): string {
    return this.model.getSolverSpecificParametersAsString();
  }

  SolverVersion(): string {
    return this.model.solverVersion();
  }

  ComputeConstraintActivities(): number[] {
    return this.model.computeConstraintActivities();
  }

  ComputeExactConditionNumber(): number {
    return this.model.computeExactConditionNumber();
  }

  SetHint(variables: MPVariable[], values: number[]): void {
    if (variables.length !== values.length) {
      throw new Error(`MPSolver.SetHint: variable/value length mismatch (${variables.length} !== ${values.length}).`);
    }
    this.model.setHint(variables.map((variable) => variable.ref), values);
  }

  ExportModelAsLpFormat(obfuscate: boolean): string {
    return this.model.exportModelAsLpFormat(obfuscate);
  }

  ExportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string {
    return this.model.exportModelAsMpsFormat(fixedFormat, obfuscate);
  }

  NumVariables(): number {
    return this.model.numVariables();
  }

  NumConstraints(): number {
    return this.model.numConstraints();
  }

  WallTime(): number {
    return this.model.wallTime();
  }

  wall_time(): number {
    return this.WallTime();
  }

  Iterations(): number {
    return this.model.iterations();
  }

  iterations(): number {
    return this.Iterations();
  }

  nodes(): number {
    return this.model.nodes();
  }

  delete(): void {
    this.model.delete();
  }
}
