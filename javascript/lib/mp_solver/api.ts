import { ObserverScope } from '../solver_job.js';
import { synchronousCallbackResult } from '../callback_validation.js';
import { callbackRegistration, mpCallbackHandler, type MPSolverCallback, type MPSolverCallbackRegistration } from './callbacks.js';
export type { MPSolverCallback, MPSolverCallbackData, MPSolverCallbackRegistration, MPSolverCallbackConstraint, MPSolverCallbackResult } from './callbacks.js';
import type { MPModelProto, MPModelRequest, MPSolutionResponse } from '../generated/mp_solver_types.js';
import { toInt64 } from '../int64.js';
import { rootIntegerParameter } from './text_parameter_threads.js';
import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorSelection, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import {
  SolverWorkerExecutor,
  type SolverWorkerLike,
} from '../worker_helpers.js';
import { decodeProtobufWithExactLongs, encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';
import { DirectMpSolverExecutor } from './direct_executor.js';
import {
  mpSolverProtocol,
  type MpSolverExecutor,
  type MpSolverLogEvent,
  type MpSolverNativeMetadata,
  type MpSolverEdit,
  MpSolverEdit_Kind as EditKind,
  MpSolverSessionRunRequest_Action as SessionAction,
} from './protocol.js';
import * as protobufModule from 'protobufjs';

async function createMpSolverWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-mp-solver' },
  );
}

const directExecutor = new DirectMpSolverExecutor();
const workerExecutor = new SolverWorkerExecutor(
  mpSolverProtocol,
  createMpSolverWorker,
  (operation) => (operation.type === 'solve' || operation.type === 'sessionRun') && operation.interruptible,
);

function createMpSolverExecutor(selection: ExecutorSelection = 'auto'): MpSolverExecutor {
  return createResolvedExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): MpSolverExecutor {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new SolverServerExecutor(mpSolverProtocol, configuration);
    case 'cloud': return new CloudExecutor('mp-solver', { test: configuration.test });
  }
}

export type MPSolverEvent = SolverJobEvent | MpSolverLogEvent;
export type MPSolverExecutionOptions = {
  executor?: ExecutorSelection;
  onEvent?: (event: MPSolverEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export type MPSolverClampingOptions = MPSolverExecutionOptions & { solverType?: OptimizationProblemType };

export type MPSolverStartingBasis = { variableStatuses: readonly BasisStatus[]; constraintStatuses: readonly BasisStatus[] };
type MPSolverSearchOptions = {
  startingBasis?: MPSolverStartingBasis;
  callback?: MPSolverCallback;
  callbackRegistration?: MPSolverCallbackRegistration;
};
export type MPSolverSolveOptions = MPSolverExecutionOptions & MPSolverSearchOptions & {
  parameters?: MPSolverParameters;
  messageCallback?: (messages: string[]) => void;
  enableOutput?: boolean;
};

export type MPSolverNativeMetadata = MpSolverNativeMetadata;

export type MPSolverIncrementalSolverOptions = MPSolverSolveOptions;
export type MPSolverIncrementalSolveOptions = Omit<MPSolverSolveOptions, 'executor'>;

export type MpSolveParameters = {
  relativeMipGap?: number;
  primalTolerance?: number;
  dualTolerance?: number;
  presolve?: PresolveValues;
  lpAlgorithm?: LpAlgorithmValues;
  incrementality?: IncrementalityValues;
  scaling?: ScalingValues;
};

export type MpSolveOptions = MPSolverExecutionOptions & MPSolverSearchOptions & {
  messageCallback?: (messages: string[]) => void;
  solverType?: OptimizationProblemType;
  threads?: number;
  timeLimitSeconds?: number;
  enableOutput?: boolean;
  solverSpecificParameters?: string;
  parameters?: MpSolveParameters;
};

export type LinearSolverSchemas = {
  linear_solver: string;
  optional_boolean: string;
};

export type MPSolverModelProto = MPModelProto;
export type MPSolverModelRequest = MPModelRequest;
export type MPSolverSolutionResponse = MPSolutionResponse;

export type MPSolverProtoSolveResult = {
  bytes: Uint8Array;
  response: MPSolverSolutionResponse;
  metadata?: MpSolverNativeMetadata;
};

export type MPSolverProtoSolveOptions = MPSolverSearchOptions & {
  messageCallback?: (messages: string[]) => void;
  parameters?: MPSolverParameters;
  solverType?: OptimizationProblemType;
  timeLimitSeconds?: number;
  enableOutput?: boolean;
  solverSpecificParameters?: string;
  loadSolution?: boolean;
  numThreads?: number;
} & MPSolverExecutionOptions;

type ProtobufRoot = import('protobufjs').Root;
type ProtobufType = import('protobufjs').Type;

let linearSolverSchemasPromise: Promise<LinearSolverSchemas> | null = null;
let linearSolverRootPromise: Promise<ProtobufRoot> | null = null;
let mpModelTypePromise: Promise<ProtobufType> | null = null;
let mpModelRequestTypePromise: Promise<ProtobufType> | null = null;
let mpSolutionResponseTypePromise: Promise<ProtobufType> | null = null;

async function getLinearSolverSchemas(
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<LinearSolverSchemas> {
  linearSolverSchemasPromise ??= (async () => {
    const executor = createMpSolverExecutor(options.executor);
    const job = executor.execute(
      { type: 'schema' },
      { onEvent: () => {} },
    );
    const response = await job.result;
    if (response.type !== 'schema') throw new Error('MP Solver executor returned the wrong schema response.');
    return {
      linear_solver: response.linearSolverProtoSchema,
      optional_boolean: response.optionalBooleanProtoSchema,
    };
  })().catch((error) => {
    linearSolverSchemasPromise = null;
    throw error;
  });
  return linearSolverSchemasPromise;
}

async function resolveLinearSolverRoot(
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<ProtobufRoot> {
  linearSolverRootPromise ??= (async () => {
    const schemas = await getLinearSolverSchemas(options);
    const optionalRoot = protobufModule.parse(schemas.optional_boolean).root;
    const linearSolverSource = schemas.linear_solver.replace(/^import "ortools\/util\/optional_boolean\.proto";\s*$/m, '');
    return protobufModule.parse(linearSolverSource, optionalRoot).root;
  })().catch((error) => {
    // Refetch malformed schema text on the next attempt, not just reparse it.
    linearSolverSchemasPromise = null;
    linearSolverRootPromise = null;
    throw error;
  });
  return linearSolverRootPromise;
}

async function resolveMPModelRequestType(
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<ProtobufType> {
  mpModelRequestTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot(options);
    return root.lookupType('operations_research.MPModelRequest');
  })().catch((error) => {
    mpModelRequestTypePromise = null;
    throw error;
  });
  return mpModelRequestTypePromise;
}

async function resolveMPModelType(
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<ProtobufType> {
  mpModelTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot(options);
    return root.lookupType('operations_research.MPModelProto');
  })().catch((error) => {
    mpModelTypePromise = null;
    throw error;
  });
  return mpModelTypePromise;
}

async function resolveMPSolutionResponseType(
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<ProtobufType> {
  mpSolutionResponseTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot(options);
    return root.lookupType('operations_research.MPSolutionResponse');
  })().catch((error) => {
    mpSolutionResponseTypePromise = null;
    throw error;
  });
  return mpSolutionResponseTypePromise;
}

async function encodeMPModelRequest(
  request: MPSolverModelRequest,
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<Uint8Array> {
  const source = structuredClone(request);
  const type = await resolveMPModelRequestType(options);
  const converted = encodeProtobufBigInts(normalizeProtobufInput(source, type), type) as Record<string, unknown>;
  const error = type.verify(converted);
  if (error) {
    throw new Error(`MPSolver.createModelRequest: ${error}`);
  }
  return type.encode(type.create(converted)).finish();
}

async function decodeMPModelRequest(
  bytes: Uint8Array,
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<MPSolverModelRequest> {
  const source = new Uint8Array(bytes);
  const type = await resolveMPModelRequestType(options);
  return decodeProtobufWithExactLongs<MPSolverModelRequest>(type, source, Number);
}

async function encodeMPModel(
  model: MPSolverModelProto,
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<Uint8Array> {
  const source = structuredClone(model);
  const type = await resolveMPModelType(options);
  const converted = encodeProtobufBigInts(normalizeProtobufInput(source, type), type) as Record<string, unknown>;
  const error = type.verify(converted);
  if (error) {
    throw new Error(`MPSolver.exportModelProto: ${error}`);
  }
  return type.encode(type.create(converted)).finish();
}


/** Return the native diagnostic for invalid models or trivially infeasible bounds; otherwise an empty string. */
export async function findErrorInModelProto(
  model: Uint8Array | MPSolverModelProto,
  options: MPSolverExecutionOptions = {},
): Promise<string> {
  const source = model instanceof Uint8Array ? new Uint8Array(model) : structuredClone(model);
  const bytes = source instanceof Uint8Array ? source : await encodeMPModel(source, options);
  const result = await executeSolverJob(createMpSolverExecutor(options.executor), { type: 'validateModel', model: bytes }, options);
  if (result.type !== 'validateModel') throw new Error('MPSolver executor returned the wrong validation response.');
  return result.error;
}

async function decodeMPSolutionResponse(
  bytes: Uint8Array,
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<MPSolverSolutionResponse> {
  const source = new Uint8Array(bytes);
  const type = await resolveMPSolutionResponseType(options);
  const message = type.decode(source);
  const response = decodeProtobufWithExactLongs<MPSolverSolutionResponse>(type, source);
  // Proto defaults must not fabricate optimization values absent on the wire.
  for (const field of ['objectiveValue', 'bestObjectiveBound'] as const) {
    if (!Object.prototype.hasOwnProperty.call(message, field)) delete response[field];
  }
  return response;
}

async function encodeMPSolutionResponse(
  response: MPSolverSolutionResponse,
  options: Pick<MPSolverExecutionOptions, 'executor'> = {},
): Promise<Uint8Array> {
  const source = structuredClone(response);
  const type = await resolveMPSolutionResponseType(options);
  const converted = encodeProtobufBigInts(normalizeProtobufInput(source, type), type) as Record<string, unknown>;
  const error = type.verify(converted);
  if (error) {
    throw new Error(`MPSolver.createSolutionResponse: ${error}`);
  }
  return type.encode(type.create(converted)).finish();
}

function normalizedNumThreads(options: Pick<MPSolverProtoSolveOptions, 'numThreads'> = {}): number | undefined {
  const numThreads = options.numThreads;
  if (numThreads === undefined) return undefined;
  if (!Number.isInteger(numThreads) || numThreads < 1 || numThreads > 0x7fffffff) {
    throw new RangeError('numThreads must be a positive signed 32-bit integer.');
  }
  return numThreads;
}


function messageObserver(callback: MPSolverSolveOptions['messageCallback']) {
  return (event: MPSolverEvent) => {
    if (event.type !== 'log' || !callback) return;
    synchronousCallbackResult(callback(event.messages), 'MPSolver message callbacks must return synchronously; use onEvent for asynchronous observers.');
  };
}

function copyStartingBasis(basis: MPSolverStartingBasis | undefined) {
  if (!basis) return undefined;
  const statuses = (values: readonly BasisStatus[]) => values.map(value => {
    if (!Number.isInteger(value) || value < BasisStatus.FREE || value > BasisStatus.BASIC) throw new RangeError('Invalid MPSolver basis status.');
    return value;
  });
  return { variableStatuses: statuses(basis.variableStatuses), constraintStatuses: statuses(basis.constraintStatuses) };
}

function validateCallbackThreads(registration: unknown, solverType: number | undefined, threads: number): void {
  if (registration && solverType === OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING && threads > 1)
    throw new RangeError('Native SCIP MPSolver callbacks require one solver thread.');
}

async function solveModelRequestBytes(
  requestBytes: Uint8Array,
  interruptible: boolean,
  options: Pick<
    MPSolverProtoSolveOptions,
    'executor' | 'numThreads' | 'onEvent' | 'signal' | 'messageCallback' | 'startingBasis' | 'callback' | 'callbackRegistration'
  > = {},
  parameters?: ReturnType<MPSolverParameterState['snapshot']>,
  editableSnapshot = false,
): Promise<{ type: 'solve'; response: Uint8Array; metadata?: MpSolverNativeMetadata }> {
  if (options.messageCallback) {
    const type = await resolveMPModelRequestType(options);
    const message = type.decode(requestBytes);
    if (!Object.prototype.hasOwnProperty.call(message, 'enableInternalSolverOutput')) {
      Object.assign(message, { enableInternalSolverOutput: true });
      requestBytes = type.encode(message).finish();
    }
  }
  const request = await decodeMPModelRequest(requestBytes, options);
  const type = request.solverType;
  const solverType = typeof type === 'string'
    ? OptimizationProblemType[type as keyof typeof OptimizationProblemType] : type;
  const parameterThreads = solverType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
    ? rootIntegerParameter(String(request.solverSpecificParameters ?? ''), ['num_workers', 'num_search_workers'])
    : solverType === OptimizationProblemType.PDLP_LINEAR_PROGRAMMING
      ? rootIntegerParameter(String(request.solverSpecificParameters ?? ''), ['num_threads']) : undefined;
  const numThreads = normalizedNumThreads(options) ?? parameterThreads ?? 1;
  const registration = callbackRegistration(options.callback, options.callbackRegistration);
  validateCallbackThreads(registration, solverType, numThreads);
  const executor = createMpSolverExecutor(options.executor);
  const response = await executeSolverJob(
    executor,
    {
      type: 'solve',
      request: requestBytes,
      numThreads,
      interruptible,
      streamMessages: Boolean(options.messageCallback || (request.enableInternalSolverOutput && options.onEvent)),
      parameters,
      editableSnapshot,
      startingBasis: copyStartingBasis(options.startingBasis),
      callbackRegistration: registration,
    },
    {
      showCloudNotice: !(executor instanceof SolverServerExecutor),
      resources: { threads: numThreads },
      onEvent: options.onEvent,
      onEventSync: messageObserver(options.messageCallback),
      onCallback: options.callback ? mpCallbackHandler(options.callback) : undefined,
      signal: options.signal,
    },
  );
  if (response.type !== 'solve') throw new Error('MP Solver executor returned the wrong solve response.');
  return response;
}

async function executeModelRequest(
  request: Uint8Array | MPSolverModelRequest,
  options: Pick<MPSolverProtoSolveOptions,
    'executor' | 'numThreads' | 'onEvent' | 'signal' | 'parameters' | 'messageCallback' | 'startingBasis' | 'callback' | 'callbackRegistration'> = {},
  editableSnapshot = false,
): Promise<MPSolverProtoSolveResult> {
  const { parameters, ...execution } = options;
  execution.startingBasis = copyStartingBasis(execution.startingBasis);
  if (execution.callbackRegistration) execution.callbackRegistration = { ...execution.callbackRegistration,
    variableIndices: execution.callbackRegistration.variableIndices && [...execution.callbackRegistration.variableIndices] };
  const parameterSnapshot = parameters ? solverParameterState(parameters).snapshot() : undefined;
  const requestBytes = request instanceof Uint8Array
    ? new Uint8Array(request) : await encodeMPModelRequest(request, execution);
  const requestObject = await decodeMPModelRequest(requestBytes, execution);
  const interruptible = Boolean(execution.signal) && solverTypeSupportsInterruption(requestObject.solverType);
  const solved = await solveModelRequestBytes(requestBytes, interruptible, execution, parameterSnapshot, editableSnapshot);
  return { bytes: solved.response, response: await decodeMPSolutionResponse(solved.response, execution), metadata: solved.metadata };
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

function solverTypeSupportsInterruption(solverType: unknown): boolean {
  const normalized = typeof solverType === 'string'
    ? OptimizationProblemType[solverType as keyof typeof OptimizationProblemType]
    : solverType ?? OptimizationProblemType.GLOP_LINEAR_PROGRAMMING;
  return normalized === OptimizationProblemType.GLOP_LINEAR_PROGRAMMING
    || normalized === OptimizationProblemType.GUROBI_LINEAR_PROGRAMMING
    || normalized === OptimizationProblemType.GUROBI_MIXED_INTEGER_PROGRAMMING
    || normalized === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
    || normalized === OptimizationProblemType.PDLP_LINEAR_PROGRAMMING;
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
};

type MPConstraintState = {
  index: number;
  name: string;
  lb: number;
  ub: number;
  coeffs: Map<number, number>;
  lazy: boolean;
};

type MPObjectiveState = {
  coeffs: Map<number, number>;
  offset: number;
  maximize: boolean;
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
  numThreadsExplicit: boolean;
  solverSpecificParameters: string;
  hints: { varIndex: number[]; varValue: number[] } | null;
  answer: MpAnswer | null;
};

const supportedProblemTypes = new Set<OptimizationProblemType>([
  OptimizationProblemType.PDLP_LINEAR_PROGRAMMING,
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
  ['PDLP', OptimizationProblemType.PDLP_LINEAR_PROGRAMMING],
  ['PDLP_LINEAR_PROGRAMMING', OptimizationProblemType.PDLP_LINEAR_PROGRAMMING],
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
    || problemType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.PDLP_LINEAR_PROGRAMMING;
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
    },
    outputEnabled: false,
    timeLimitMs: 0,
    numThreads: 1,
    numThreadsExplicit: false,
    solverSpecificParameters: '',
    hints: null,
    answer: null,
  };
}

function defaultDoubleParam(param: DoubleParam): number {
  if (param === DoubleParam.RELATIVE_MIP_GAP) return MPSolverParameters.defaultRelativeMipGap;
  if (param === DoubleParam.PRIMAL_TOLERANCE) return MPSolverParameters.defaultPrimalTolerance;
  if (param === DoubleParam.DUAL_TOLERANCE) return MPSolverParameters.defaultDualTolerance;
  return 0;
}

function defaultIntegerParam(param: IntegerParam): number {
  if (param === IntegerParam.PRESOLVE) return MPSolverParameters.defaultPresolve;
  if (param === IntegerParam.INCREMENTALITY) return MPSolverParameters.defaultIncrementality;
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

function modelProto(state: MPSolverState): MPSolverModelProto {
  const model: MPSolverModelProto = {
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

function modelRequestSettings(state: MPSolverState, options: MPSolverProtoSolveOptions = {}): MPSolverModelRequest {
  const request: MPSolverModelRequest = {
    solverType: options.solverType ?? state.problemType,
  };
  const timeLimitSeconds = options.timeLimitSeconds ?? (state.timeLimitMs > 0 ? state.timeLimitMs / 1000 : undefined);
  if (timeLimitSeconds !== undefined) request.solverTimeLimitSeconds = timeLimitSeconds;
  const enableOutput = options.enableOutput ?? (Boolean(options.messageCallback) || state.outputEnabled);
  request.enableInternalSolverOutput = enableOutput;
  const solverSpecificParameters = options.solverSpecificParameters ?? state.solverSpecificParameters;
  if (solverSpecificParameters) request.solverSpecificParameters = solverSpecificParameters;
  return request;
}

function modelRequest(state: MPSolverState, options: MPSolverProtoSolveOptions = {}): MPSolverModelRequest {
  return { ...modelRequestSettings(state, options), model: modelProto(state) };
}

// An owned answer shared by the result-object API and the stateful facade.
type MpAnswerOptions = {
  metadata?: MpSolverNativeMetadata;
  elapsedMs?: number;
  unroundedVariableValues?: number[];
};

class MpAnswer {
  readonly response: MPSolverSolutionResponse;
  readonly metadata?: MpSolverNativeMetadata;
  readonly status: MPSolverResultStatus;
  readonly hasSolution: boolean;
  readonly hasNativeBasis: boolean;
  readonly wallTimeMs: number;
  private readonly unroundedVariableValues?: number[];

  constructor(response: MPSolverSolutionResponse, readonly variableCount: number,
      readonly constraintCount: number, readonly solverType: OptimizationProblemType,
      options: MpAnswerOptions = {}) {
    this.response = structuredClone(response);
    this.metadata = options.metadata && structuredClone(options.metadata);
    this.unroundedVariableValues = options.unroundedVariableValues?.slice();
    this.status = responseStatusToResultStatus(response.status);
    this.hasSolution = responseHasSolution(response.status);
    const values = response.variableValue;
    if (this.hasSolution && (!Array.isArray(values) || values.length !== variableCount ||
        values.some(value => typeof value !== 'number' || Number.isNaN(value))))
      throw new Error('MPSolver native solution dimensions or values are invalid.');
    this.wallTimeMs = solveWallTimeMs(response) ?? options.elapsedMs ?? 0;
    this.hasNativeBasis = this.hasSolution && !problemIsMip(solverType) &&
      solverType !== OptimizationProblemType.PDLP_LINEAR_PROGRAMMING &&
      this.metadata?.variableBasisStatus.length === variableCount && this.metadata.constraintBasisStatus.length === constraintCount;
  }

  vector(name: 'variableValue' | 'reducedCost' | 'dualValue', index: number): number {
    const values = this.response[name];
    return Array.isArray(values) ? Number(values[index] ?? 0) : 0;
  }

  unroundedValue(index: number): number {
    return this.unroundedVariableValues?.[index] ?? this.vector('variableValue', index);
  }

  basis(index: number, constraint = false): BasisStatus {
    if (!this.hasNativeBasis) throw new Error('MPSolver native basis is unavailable for this backend or solution.');
    return (constraint ? this.metadata!.constraintBasisStatus : this.metadata!.variableBasisStatus)[index] as BasisStatus;
  }
}

function applySolutionResponse(state: MPSolverState, response: MPSolverSolutionResponse,
    options: MpAnswerOptions & { solverType?: OptimizationProblemType } = {}): boolean {
  state.answer = new MpAnswer(response, state.variables.length, state.constraints.length, options.solverType ?? state.problemType, options);
  return state.answer.hasSolution;
}

function solveWallTimeMs(response: MPSolverSolutionResponse): number | undefined {
  const solveInfo = response.solveInfo as { solveWallTimeSeconds?: number } | undefined;
  return typeof solveInfo?.solveWallTimeSeconds === 'number' ? Math.round(solveInfo.solveWallTimeSeconds * 1000) : undefined;
}

function resetSolution(state: MPSolverState): void { state.answer = null; }
function safeCounter(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('MPSolver counter exceeds safe integer range; read the exact result metadata instead.');
  return number;
}

type MPVariableRef = { readonly index: number; readonly generation: object };
type MPConstraintRef = { readonly index: number; readonly generation: object };

class MPSolverParameterState {
  private readonly doubleParams = new Map<DoubleParam, number>();
  private readonly integerParams = new Map<IntegerParam, number>();

  snapshot() {
    return {
      doubleParams: Object.fromEntries(this.doubleParams),
      integerParams: Object.fromEntries(this.integerParams),
    };
  }

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

}

type ImportedMPModel = {
  variable: Array<{ name: string; lowerBound: number; upperBound: number; objectiveCoefficient: number; isInteger: boolean; branchingPriority: number }>;
  constraint: Array<{ name: string; lowerBound: number; upperBound: number; varIndex: number[]; coefficient: number[]; isLazy: boolean }>;
  maximize: boolean;
  objectiveOffset: number;
  solutionHint?: { varIndex: number[]; varValue: number[] } | null;
};

class MPSolverModel {
  private readonly state: MPSolverState;
  private generation: object = {};
  private revision = 0;
  private readonly trackers = new Set<MpSolverEdit[]>();
  private busy = false;
  claimOperation(): void {
    if (this.busy) throw new Error('MPSolver model already has an operation in progress.');
    this.busy = true;
  }
  releaseOperation(): void { this.busy = false; }
  currentGeneration(): object { return this.generation; }

  constructor(name: string, problemType: OptimizationProblemType) {
    this.state = createSolverState(name, problemType);
  }

  private markChanged(edit?: MpSolverEdit): void {
    if (edit) this.recordEdit(edit);
    ++this.revision;
    resetSolution(this.state);
  }

  private recordEdit(edit: MpSolverEdit): void {
    for (const tracker of this.trackers) tracker.push(edit);
  }

  trackEdits(): { request: MPSolverModelRequest; edits: MpSolverEdit[] } {
    const edits: MpSolverEdit[] = [];
    this.trackers.add(edits);
    return { request: modelRequest(this.state), edits };
  }

  stopTracking(edits: MpSolverEdit[]): void { this.trackers.delete(edits); edits.length = 0; }
  sessionSnapshot(options: MPSolverProtoSolveOptions = {}) {
    const request = modelRequestSettings(this.state, options);
    return { request, revision: this.revision, numThreads: options.numThreads ?? (this.state.numThreadsExplicit ? this.state.numThreads : undefined) };
  }

  applySessionResult(response: MPSolverSolutionResponse, metadata: MpSolverNativeMetadata | undefined,
      revision: number, started: number, storeAnswer = true): MPSolverResultStatus {
    if (revision !== this.revision) throw new Error('MPSolver model was modified during solve; its stale result was discarded.');
    if (storeAnswer) applySolutionResponse(this.state, response, { metadata, elapsedMs: Date.now() - started });
    return responseStatusToResultStatus(response.status);
  }

  private variableState(ref: MPVariableRef): MPVariableState {
    if (ref.generation !== this.generation) throw new Error('MPSolver variable belongs to another model or was deleted by clear().');
    const variable = this.state.variables[ref.index];
    if (!variable) throw new Error(`MPSolver.variable: no variable at index ${ref.index}.`);
    return variable;
  }

  private constraintState(ref: MPConstraintRef): MPConstraintState {
    if (ref.generation !== this.generation) throw new Error('MPSolver constraint belongs to another model or was deleted by clear().');
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
    this.generation = {};
    this.state.variables = [];
    this.state.constraints = [];
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.objective.maximize = false;
    this.state.hints = null;
    resetSolution(this.state);
    this.markChanged({ kind: EditKind.CLEAR });
  }

  infinity(): number {
    return Number.POSITIVE_INFINITY;
  }

  variable(index: number): MPVariableRef {
    this.variableState({ index, generation: this.generation });
    return { index, generation: this.generation };
  }

  variables(): MPVariableRef[] {
    return this.state.variables.map((variable) => ({ index: variable.index, generation: this.generation }));
  }

  lookupVariable(name: string): MPVariableRef | null {
    const variable = this.state.variables.find((candidate) => candidate.name === name);
    return variable ? { index: variable.index, generation: this.generation } : null;
  }

  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableRef {
    const variable: MPVariableState = {
      index: this.state.variables.length,
      name,
      lb,
      ub,
      integer,
      branchingPriority: 0,
    };
    this.state.variables.push(variable);
    this.markChanged({ kind: EditKind.ADD_VARIABLE, index: variable.index, first: lb, second: ub, flag: integer, name });
    return { index: variable.index, generation: this.generation };
  }

  variableSolutionValue(ref: MPVariableRef): number {
    const index = this.variableState(ref).index;
    return this.state.answer?.vector('variableValue', index) ?? 0;
  }

  variableUnroundedSolutionValue(ref: MPVariableRef): number {
    const index = this.variableState(ref).index;
    return this.state.answer?.unroundedValue(index) ?? 0;
  }

  variableReducedCost(ref: MPVariableRef): number {
    const index = this.variableState(ref).index;
    return this.state.answer?.vector('reducedCost', index) ?? 0;
  }

  variableBasisStatus(ref: MPVariableRef): BasisStatus {
    const index = this.variableState(ref).index;
    if (!this.state.answer) throw new Error('MPSolver native basis is unavailable for this backend or solution.');
    return this.state.answer.basis(index);
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
    this.markChanged({ kind: EditKind.VARIABLE_BOUNDS, index: ref.index, first: lb, second: ub });
  }

  setVariableLb(ref: MPVariableRef, lb: number): void {
    this.variableState(ref).lb = lb;
    this.markChanged({ kind: EditKind.VARIABLE_BOUNDS, index: ref.index, first: lb, second: this.variableState(ref).ub });
  }

  setVariableUb(ref: MPVariableRef, ub: number): void {
    this.variableState(ref).ub = ub;
    this.markChanged({ kind: EditKind.VARIABLE_BOUNDS, index: ref.index, first: this.variableState(ref).lb, second: ub });
  }

  variableInteger(ref: MPVariableRef): boolean {
    return this.variableState(ref).integer;
  }

  setVariableInteger(ref: MPVariableRef, integer: boolean): void {
    this.variableState(ref).integer = integer;
    this.markChanged({ kind: EditKind.VARIABLE_INTEGER, index: ref.index, flag: integer });
  }

  variableBranchingPriority(ref: MPVariableRef): number {
    return this.variableState(ref).branchingPriority;
  }

  setVariableBranchingPriority(ref: MPVariableRef, priority: number): void {
    this.variableState(ref).branchingPriority = priority;
    this.markChanged({ kind: EditKind.VARIABLE_PRIORITY, index: ref.index, first: priority });
  }

  constraint(index: number): MPConstraintRef {
    this.constraintState({ index, generation: this.generation });
    return { index, generation: this.generation };
  }

  constraints(): MPConstraintRef[] {
    return this.state.constraints.map((constraint) => ({ index: constraint.index, generation: this.generation }));
  }

  lookupConstraint(name: string): MPConstraintRef | null {
    const constraint = this.state.constraints.find((candidate) => candidate.name === name);
    return constraint ? { index: constraint.index, generation: this.generation } : null;
  }

  addConstraint(lb: number | null, ub: number | null, name: string): MPConstraintRef {
    const constraint: MPConstraintState = {
      index: this.state.constraints.length,
      name,
      lb: lb ?? Number.NEGATIVE_INFINITY,
      ub: ub ?? Number.POSITIVE_INFINITY,
      coeffs: new Map(),
      lazy: false,
    };
    this.state.constraints.push(constraint);
    this.markChanged({ kind: EditKind.ADD_CONSTRAINT, index: constraint.index, first: constraint.lb, second: constraint.ub, name });
    return { index: constraint.index, generation: this.generation };
  }

  setConstraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef, coefficient: number): void {
    const constraint = this.constraintState(constraintRef);
    this.variableState(variableRef);
    if (coefficient === 0) {
      constraint.coeffs.delete(variableRef.index);
    } else {
      constraint.coeffs.set(variableRef.index, coefficient);
    }
    this.markChanged({ kind: EditKind.CONSTRAINT_COEFFICIENT, index: constraintRef.index, variable: variableRef.index, first: coefficient });
  }

  constraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef): number {
    this.variableState(variableRef);
    return this.constraintState(constraintRef).coeffs.get(variableRef.index) ?? 0;
  }

  clearConstraint(constraint: MPConstraintRef): void {
    this.constraintState(constraint).coeffs.clear();
    this.markChanged({ kind: EditKind.CLEAR_CONSTRAINT, index: constraint.index });
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
    this.markChanged({ kind: EditKind.CONSTRAINT_BOUNDS, index: ref.index, first: lb, second: ub });
  }

  setConstraintLb(ref: MPConstraintRef, lb: number): void {
    this.constraintState(ref).lb = lb;
    this.markChanged({ kind: EditKind.CONSTRAINT_BOUNDS, index: ref.index, first: lb, second: this.constraintState(ref).ub });
  }

  setConstraintUb(ref: MPConstraintRef, ub: number): void {
    this.constraintState(ref).ub = ub;
    this.markChanged({ kind: EditKind.CONSTRAINT_BOUNDS, index: ref.index, first: this.constraintState(ref).lb, second: ub });
  }

  constraintDualValue(ref: MPConstraintRef): number {
    const index = this.constraintState(ref).index;
    return this.state.answer?.vector('dualValue', index) ?? 0;
  }

  constraintBasisStatus(ref: MPConstraintRef): BasisStatus {
    const index = this.constraintState(ref).index;
    if (!this.state.answer) throw new Error('MPSolver native basis is unavailable for this backend or solution.');
    return this.state.answer.basis(index, true);
  }

  constraintIsLazy(ref: MPConstraintRef): boolean {
    return this.constraintState(ref).lazy;
  }

  setConstraintIsLazy(ref: MPConstraintRef, laziness: boolean): void {
    this.constraintState(ref).lazy = laziness;
    this.markChanged({ kind: EditKind.CONSTRAINT_LAZY, index: ref.index, flag: laziness });
  }

  clearObjective(): void {
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.objective.maximize = false;
    this.markChanged({ kind: EditKind.CLEAR_OBJECTIVE });
  }

  setObjectiveCoefficient(variable: MPVariableRef, coefficient: number): void {
    this.variableState(variable);
    if (coefficient === 0) {
      this.state.objective.coeffs.delete(variable.index);
    } else {
      this.state.objective.coeffs.set(variable.index, coefficient);
    }
    this.markChanged({ kind: EditKind.OBJECTIVE_COEFFICIENT, index: variable.index, first: coefficient });
  }

  objectiveCoefficient(variable: MPVariableRef): number {
    this.variableState(variable);
    return this.state.objective.coeffs.get(variable.index) ?? 0;
  }

  setObjectiveOffset(offset: number): void {
    this.state.objective.offset = offset;
    this.markChanged({ kind: EditKind.OBJECTIVE_OFFSET, first: offset });
  }

  addObjectiveOffset(offset: number): void {
    this.state.objective.offset += offset;
    this.markChanged({ kind: EditKind.OBJECTIVE_OFFSET, first: this.state.objective.offset });
  }

  objectiveOffset(): number {
    return this.state.objective.offset;
  }

  setObjectiveDirection(maximize: boolean): void {
    this.state.objective.maximize = maximize;
    this.markChanged({ kind: EditKind.OBJECTIVE_DIRECTION, flag: maximize });
  }

  objectiveValue(): number {
    return typeof this.state.answer?.response.objectiveValue === 'number' ? this.state.answer.response.objectiveValue : 0;
  }

  objectiveBestBound(): number {
    const value = this.state.answer?.response.bestObjectiveBound;
    return typeof value === 'number' ? value : this.state.answer ? (this.state.objective.maximize ? -Infinity : Infinity) : 0;
  }

  objectiveMaximization(): boolean {
    return this.state.objective.maximize;
  }

  async solve(
    parameters?: MPSolverParameters,
    options: MPSolverSolveOptions = {},
  ): Promise<MPSolverResultStatus> {
    const started = Date.now();
    const revision = this.revision;
    resetSolution(this.state);
    const result = await executeModelRequest(
      modelRequest(this.state, { enableOutput: options.enableOutput, messageCallback: options.messageCallback }),
      { ...options, numThreads: this.state.numThreadsExplicit ? this.state.numThreads : undefined, parameters: parameters ?? new MPSolverParameters() },
      true,
    );
    if (revision !== this.revision) throw new Error('MPSolver model was modified during solve; its stale result was discarded.');
    applySolutionResponse(this.state, result.response, { metadata: result.metadata, elapsedMs: Date.now() - started });
    return responseStatusToResultStatus(result.response.status);
  }


  exportModelProto(
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<Uint8Array> {
    return encodeMPModel(modelProto(this.state), options);
  }

  async loadModelFromProto(model: Uint8Array | MPSolverModelProto, keepNames: boolean,
    options: MPSolverExecutionOptions): Promise<string> {
    const revision = this.revision;
    const source = model instanceof Uint8Array ? new Uint8Array(model) : structuredClone(model);
    const bytes = source instanceof Uint8Array ? source : await encodeMPModel(source, options);
    const result = await executeSolverJob(createMpSolverExecutor(options.executor), {
      type: 'importModel', model: bytes, solverType: this.state.problemType, name: this.state.name, keepNames,
    }, options);
    if (result.type !== 'importModel') throw new Error('MPSolver executor returned the wrong model-import response.');
    const imported = result.status === 0x61
      ? decodeProtobufWithExactLongs<ImportedMPModel>(await resolveMPModelType(options), result.model, Number) : null;
    if (revision !== this.revision) throw new Error('MPSolver model was modified while loading a model; its stale import was discarded.');
    // Like native LoadModelFromProto, loading replaces the model even on a
    // validation failure. Solver settings and its name remain in place.
    this.clear();
    if (!imported) return result.error || `MPSolver model import failed with status ${result.status}.`;
    for (const variable of imported.variable) {
      const ref = this.addVariable(variable.lowerBound, variable.upperBound, variable.isInteger, variable.name);
      this.setVariableBranchingPriority(ref, variable.branchingPriority);
      this.setObjectiveCoefficient(ref, variable.objectiveCoefficient);
    }
    for (const row of imported.constraint) {
      const ref = this.addConstraint(row.lowerBound, row.upperBound, row.name);
      this.setConstraintIsLazy(ref, row.isLazy);
      row.varIndex.forEach((index, position) => this.setConstraintCoefficient(ref, this.variable(index), row.coefficient[position]));
    }
    this.setObjectiveOffset(imported.objectiveOffset);
    this.setObjectiveDirection(imported.maximize);
    if (imported.solutionHint) this.setHint(imported.solutionHint.varIndex.map(index => this.variable(index)), imported.solutionHint.varValue);
    return '';
  }

  fillSolutionResponseProto(response: MPSolverSolutionResponse): void {
    for (const key of Object.keys(response) as (keyof MPSolverSolutionResponse)[]) delete response[key];
    const answer = this.state.answer;
    Object.assign(response, answer ? structuredClone(answer.response) : {});
    response.status = answer?.status ?? MPSolverResultStatus.NOT_SOLVED;
    // Preserve the facade's numeric status and LP/MIP field contract. Values
    // still come solely from the owned native answer.
    if (!answer?.hasSolution) {
      for (const key of ['variableValue', 'objectiveValue', 'bestObjectiveBound', 'dualValue', 'reducedCost'] as const) delete response[key];
    } else if (problemIsMip(answer.solverType)) {
      delete response.dualValue;
      delete response.reducedCost;
    }
  }

  exportSolutionProto(options: Pick<MPSolverExecutionOptions, 'executor'>): Promise<Uint8Array> {
    const response: MPSolverSolutionResponse = {};
    this.fillSolutionResponseProto(response);
    return encodeMPSolutionResponse(response, options);
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return encodeMPModelRequest(modelRequest(this.state, options), options);
  }

  async solveWithProto(options: MPSolverProtoSolveOptions): Promise<MPSolverProtoSolveResult & { loaded: boolean }> {
    options = { ...options };
    const started = Date.now();
    const revision = this.revision;
    const load = options.loadSolution ?? true;
    if (load) resetSolution(this.state);
    const result = await executeModelRequest(modelRequest(this.state, options), options, true);
    if (revision !== this.revision) throw new Error('MPSolver model was modified during solve; its stale result was discarded.');
    let loaded = false;
    if (load) loaded = applySolutionResponse(this.state, result.response, {
      metadata: result.metadata, elapsedMs: Date.now() - started, solverType: options.solverType,
    });
    return { ...result, loaded };
  }

  async loadSolutionFromProto(response: Uint8Array | MPSolverSolutionResponse, tolerance: number,
      options: MPSolverExecutionOptions = {}): Promise<boolean> {
    const execution = { ...options }, revision = this.revision;
    const executor = createMpSolverExecutor(execution.executor);
    const model = modelProto(this.state), solverType = this.state.problemType;
    const [modelBytes, solutionBytes] = await Promise.all([
      encodeMPModel(model, execution), response instanceof Uint8Array ? new Uint8Array(response) : encodeMPSolutionResponse(response, execution),
    ]);
    const result = await executeSolverJob(executor, {
      type: 'loadSolution', model: modelBytes, solution: solutionBytes, solverType, tolerance,
    }, execution);
    if (result.type !== 'loadSolution') throw new Error('MPSolver executor returned the wrong solution import response.');
    const [normalized, submitted] = result.loaded ? await Promise.all([
      decodeMPSolutionResponse(result.solution, execution), decodeMPSolutionResponse(solutionBytes, execution),
    ]) : [null, null];
    if (revision !== this.revision) throw new Error('MPSolver model was modified while loading a solution.');
    // Native loading keeps the submitted coordinates internally; its exported
    // solution rounds integer coordinates. Retain both public accessor values.
    return normalized !== null && submitted !== null && applySolutionResponse(this.state, normalized, {
      unroundedVariableValues: submitted.variableValue as number[],
    });
  }

  async verifySolution(tolerance: number, logErrors = false, options: MPSolverExecutionOptions = {}): Promise<boolean> {
    if (!this.state.answer?.hasSolution) return false;
    options = { ...options };
    const executor = createMpSolverExecutor(options.executor);
    // Snapshot both inputs before schema loading or executor dispatch can yield.
    const model = modelProto(this.state);
    const solution: MPSolverSolutionResponse = {
      status: this.state.answer!.status,
      objectiveValue: this.objectiveValue(),
      variableValue: this.state.variables.map(variable => this.state.answer!.vector('variableValue', variable.index)),
    };
    const solverType = this.state.problemType;
    const [modelBytes, solutionBytes] = await Promise.all([
      encodeMPModel(model, options), encodeMPSolutionResponse(solution, options),
    ]);
    const result = await executeSolverJob(executor, {
      type: 'verifySolution', model: modelBytes, solution: solutionBytes, solverType, tolerance, logErrors,
    }, options);
    if (result.type !== 'verifySolution') throw new Error('MPSolver executor returned the wrong verification response.');
    return result.verified;
  }

  reset(): void {
    resetSolution(this.state);
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
    if (!Number.isInteger(numThreads) || numThreads < 1 || numThreads > 0x7fffffff) return false;
    if (!problemSupportsNumThreads(this.state.problemType)) {
      return false;
    }
    this.state.numThreads = numThreads;
    this.state.numThreadsExplicit = true;
    return true;
  }

  getNumThreads(): number {
    return this.state.numThreads;
  }

  async setSolverSpecificParametersAsString(parameters: string, options: MPSolverExecutionOptions = {}): Promise<boolean> {
    if (typeof parameters !== 'string') throw new TypeError('MPSolver parameters must be a string.');
    const result = await executeSolverJob(createMpSolverExecutor(options.executor),
      { type: 'validateParameters', solverType: this.state.problemType, parameters }, options);
    if (result.type !== 'validateParameters') throw new Error('MPSolver executor returned the wrong parameter validation response.');
    // Native MPSolver stores the submitted text even when its backend rejects it.
    this.state.solverSpecificParameters = parameters;
    return result.accepted;
  }

  getSolverSpecificParametersAsString(): string {
    return this.state.solverSpecificParameters;
  }

  async callbackCapabilities(options: MPSolverExecutionOptions) {
    const result = await executeSolverJob(createMpSolverExecutor(options.executor),
      { type: 'capabilities', solverType: this.state.problemType }, options);
    if (result.type !== 'capabilities') throw new Error('MPSolver executor returned the wrong capability response.');
    return result;
  }

  async solverVersion(options: MPSolverExecutionOptions = {}): Promise<string> {
    const result = await executeSolverJob(createMpSolverExecutor(options.executor), { type: 'schema' }, options);
    if (result.type !== 'schema') throw new Error('MPSolver executor returned the wrong version response.');
    const version = result.backendVersions?.[this.state.problemType];
    if (!version) throw new Error('MPSolver executor returned no version for this backend.');
    return version;
  }

  async computeConstraintActivities(options: MPSolverExecutionOptions = {}): Promise<number[]> {
    if (!this.state.answer?.hasSolution) return [];
    const execution = { ...options };
    const executor = createMpSolverExecutor(execution.executor);
    const solverType = this.state.problemType;
    const model = modelProto(this.state);
    const solution: MPSolverSolutionResponse = {
      status: this.state.answer!.status,
      objectiveValue: this.objectiveValue(),
      variableValue: this.state.variables.map(variable => this.state.answer!.vector('variableValue', variable.index)),
    };
    const [modelBytes, solutionBytes] = await Promise.all([
      encodeMPModel(model, execution), encodeMPSolutionResponse(solution, execution),
    ]);
    const result = await executeSolverJob(executor, {
      type: 'activities', model: modelBytes, solution: solutionBytes, solverType,
    }, execution);
    if (result.type !== 'activities') throw new Error('MPSolver executor returned the wrong activities response.');
    return result.activities;
  }

  computeExactConditionNumber(): number {
    if (this.state.answer?.metadata?.exactConditionNumber === undefined) throw new Error('MPSolver exact condition number is unavailable for this backend or unsolved model.');
    return this.state.answer.metadata.exactConditionNumber;
  }

  setHint(variables: MPVariableRef[], values: number[]): void {
    for (const variable of variables) this.variableState(variable);
    this.state.hints = {
      varIndex: variables.map((variable) => variable.index),
      varValue: [...values],
    };
    this.recordEdit({ kind: EditKind.HINT, hintIds: [...this.state.hints.varIndex], hintValues: [...values] });
  }

  exportModelAsLpFormat(obfuscate: boolean, options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.exportTextModel('lp', false, obfuscate, options);
  }

  exportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean, options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.exportTextModel('mps', fixedFormat, obfuscate, options);
  }

  private async exportTextModel(format: 'lp' | 'mps', fixedFormat: boolean, obfuscate: boolean,
    options: MPSolverExecutionOptions): Promise<string> {
    const execution = { ...options };
    const executor = createMpSolverExecutor(execution.executor);
    const model = await encodeMPModel(modelProto(this.state), execution);
    const result = await executeSolverJob(executor, { type: 'exportModel', model, format, fixedFormat, obfuscate }, execution);
    if (result.type !== 'exportModel') throw new Error('MPSolver executor returned the wrong model-export response.');
    return result.text;
  }

  numVariables(): number {
    return this.state.variables.length;
  }

  numConstraints(): number {
    return this.state.constraints.length;
  }

  wallTime(): number {
    return this.state.answer?.wallTimeMs ?? 0;
  }

  iterations(): number {
    return safeCounter(this.state.answer?.metadata?.iterations ?? 0n);
  }

  nodes(): number {
    return safeCounter(this.state.answer?.metadata?.nodes ?? 0n);
  }

}

let createMPVariable: (model: MPSolverModel, ref: MPVariableRef) => MPVariable;

export class MPVariable {
  static { createMPVariable = (model, ref) => new MPVariable(model, ref); }
  private constructor(
    private readonly model: MPSolverModel,
    private readonly ref: MPVariableRef,
  ) { Object.freeze(ref); variableHandles.set(this, { model, ref }); }



  solutionValue(): number {
    return this.model.variableSolutionValue(this.ref);
  }

  unroundedSolutionValue(): number {
    return this.model.variableUnroundedSolutionValue(this.ref);
  }

  reducedCost(): number {
    return this.model.variableReducedCost(this.ref);
  }

  basisStatus(): BasisStatus {
    return this.model.variableBasisStatus(this.ref);
  }

  index(): number {
    return this.model.variableIndex(this.ref);
  }

  name(): string {
    return this.model.variableName(this.ref);
  }

  lowerBound(): number {
    return this.model.variableLb(this.ref);
  }

  upperBound(): number {
    return this.model.variableUb(this.ref);
  }

  setBounds(lb: number, ub: number): void {
    this.model.setVariableBounds(this.ref, lb, ub);
  }

  setLowerBound(lb: number): void {
    this.model.setVariableLb(this.ref, lb);
  }

  setUpperBound(ub: number): void {
    this.model.setVariableUb(this.ref, ub);
  }

  isInteger(): boolean {
    return this.model.variableInteger(this.ref);
  }

  setInteger(integer: boolean): void {
    this.model.setVariableInteger(this.ref, integer);
  }

  branchingPriority(): number {
    return this.model.variableBranchingPriority(this.ref);
  }

  setBranchingPriority(priority: number): void {
    this.model.setVariableBranchingPriority(this.ref, priority);
  }

  toString(): string {
    return this.name();
  }
}

let createMPConstraint: (model: MPSolverModel, ref: MPConstraintRef) => MPConstraint;

export class MPConstraint {
  static { createMPConstraint = (model, ref) => new MPConstraint(model, ref); }
  private constructor(
    private readonly model: MPSolverModel,
    private readonly ref: MPConstraintRef,
  ) { Object.freeze(ref); constraintHandles.set(this, { model, ref }); }



  setCoefficient(variable: MPVariable, coefficient: number): void {
    this.model.setConstraintCoefficient(this.ref, mpVariableRef(variable, this.model), coefficient);
  }

  getCoefficient(variable: MPVariable): number {
    return this.model.constraintCoefficient(this.ref, mpVariableRef(variable, this.model));
  }

  clear(): void {
    this.model.clearConstraint(this.ref);
  }

  index(): number {
    return this.model.constraintIndex(this.ref);
  }

  name(): string {
    return this.model.constraintName(this.ref);
  }

  lowerBound(): number {
    return this.model.constraintLb(this.ref);
  }

  upperBound(): number {
    return this.model.constraintUb(this.ref);
  }

  setBounds(lb: number, ub: number): void {
    this.model.setConstraintBounds(this.ref, lb, ub);
  }

  setLowerBound(lb: number): void {
    this.model.setConstraintLb(this.ref, lb);
  }

  setUpperBound(ub: number): void {
    this.model.setConstraintUb(this.ref, ub);
  }

  dualValue(): number {
    return this.model.constraintDualValue(this.ref);
  }

  basisStatus(): BasisStatus {
    return this.model.constraintBasisStatus(this.ref);
  }

  isLazy(): boolean {
    return this.model.constraintIsLazy(this.ref);
  }

  setIsLazy(laziness: boolean): void {
    this.model.setConstraintIsLazy(this.ref, laziness);
  }
}

let createMPObjective: (model: MPSolverModel) => MPObjective;

export class MPObjective {
  static { createMPObjective = (model) => new MPObjective(model); }
  private constructor(private readonly model: MPSolverModel) {}

  clear(): void {
    this.model.clearObjective();
  }

  setCoefficient(variable: MPVariable, coefficient: number): void {
    this.model.setObjectiveCoefficient(mpVariableRef(variable, this.model), coefficient);
  }

  getCoefficient(variable: MPVariable): number {
    return this.model.objectiveCoefficient(mpVariableRef(variable, this.model));
  }

  setOffset(offset: number): void {
    this.model.setObjectiveOffset(offset);
  }

  addOffset(offset: number): void {
    this.model.addObjectiveOffset(offset);
  }

  offset(): number {
    return this.model.objectiveOffset();
  }

  setOptimizationDirection(maximize: boolean): void {
    this.model.setObjectiveDirection(maximize);
  }

  setMinimization(): void {
    this.model.setObjectiveDirection(false);
  }

  setMaximization(): void {
    this.model.setObjectiveDirection(true);
  }

  value(): number {
    return this.model.objectiveValue();
  }

  bestBound(): number {
    return this.model.objectiveBestBound();
  }

  isMaximization(): boolean {
    return this.model.objectiveMaximization();
  }

  isMinimization(): boolean {
    return !this.model.objectiveMaximization();
  }
}

const solverParameterStates = new WeakMap<MPSolverParameters, MPSolverParameterState>();

function solverParameterState(parameters: MPSolverParameters): MPSolverParameterState {
  const state = solverParameterStates.get(parameters);
  if (!state) throw new Error('Invalid MPSolverParameters instance.');
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
  static readonly defaultRelativeMipGap = 1e-4;
  static readonly defaultPrimalTolerance = 1e-7;
  static readonly defaultDualTolerance = 1e-7;
  static readonly defaultPresolve = PresolveValues.PRESOLVE_ON;
  static readonly defaultIncrementality = IncrementalityValues.INCREMENTALITY_ON;

  constructor() {
    solverParameterStates.set(this, new MPSolverParameterState());
  }

  setDoubleParam(param: DoubleParam, value: number): void {
    solverParameterState(this).setDoubleParam(param, value);
  }

  getDoubleParam(param: DoubleParam): number {
    return solverParameterState(this).getDoubleParam(param);
  }

  resetDoubleParam(param: DoubleParam): void {
    solverParameterState(this).resetDoubleParam(param);
  }

  setIntegerParam(param: IntegerParam, value: number): void {
    solverParameterState(this).setIntegerParam(param, value);
  }

  getIntegerParam(param: IntegerParam): number {
    return solverParameterState(this).getIntegerParam(param);
  }

  resetIntegerParam(param: IntegerParam): void {
    solverParameterState(this).resetIntegerParam(param);
  }

  reset(): void {
    solverParameterState(this).reset();
  }

}

function mpParameters(options: MpSolveParameters | undefined): MPSolverParameters | undefined {
  if (options === undefined) return undefined;
  const parameters = new MPSolverParameters();
  if (options.relativeMipGap !== undefined) parameters.setDoubleParam(DoubleParam.RELATIVE_MIP_GAP, options.relativeMipGap);
  if (options.primalTolerance !== undefined) parameters.setDoubleParam(DoubleParam.PRIMAL_TOLERANCE, options.primalTolerance);
  if (options.dualTolerance !== undefined) parameters.setDoubleParam(DoubleParam.DUAL_TOLERANCE, options.dualTolerance);
  if (options.presolve !== undefined) parameters.setIntegerParam(IntegerParam.PRESOLVE, options.presolve);
  if (options.lpAlgorithm !== undefined) parameters.setIntegerParam(IntegerParam.LP_ALGORITHM, options.lpAlgorithm);
  if (options.incrementality !== undefined) parameters.setIntegerParam(IntegerParam.INCREMENTALITY, options.incrementality);
  if (options.scaling !== undefined) parameters.setIntegerParam(IntegerParam.SCALING, options.scaling);
  return parameters;
}

/** Model construction backed by the same state and serializer as MPSolver. */
const modelStates = new WeakMap<MpModel, MPSolverModel>();
const solverModels = new WeakMap<MPSolver, MPSolverModel>();
const variableHandles = new WeakMap<MPVariable, { model: MPSolverModel; ref: MPVariableRef }>();
const constraintHandles = new WeakMap<MPConstraint, { model: MPSolverModel; ref: MPConstraintRef }>();
function mpVariableRef(variable: MPVariable, model: MPSolverModel): MPVariableRef {
  const handle = variableHandles.get(variable);
  if (!handle || handle.model !== model) throw new Error('Variable belongs to a different MPSolver model.');
  return handle.ref;
}

function mpModelState(model: MpModel | MPSolver): MPSolverModel {
  const state = modelStates.get(model as MpModel) ?? solverModels.get(model as MPSolver);
  if (!state) throw new TypeError('Expected an MPSolver model.');
  return state;
}

export class MpModel {
  private readonly state: MPSolverModel;
  private readonly objectiveHandle: MPObjective;

  constructor(name = '') {
    this.state = new MPSolverModel(name, OptimizationProblemType.GLOP_LINEAR_PROGRAMMING);
    modelStates.set(this, this.state);
    this.objectiveHandle = createMPObjective(this.state);
  }

  addVariable(lb: number, ub: number, integer: boolean, name = ''): MPVariable {
    return createMPVariable(this.state, this.state.addVariable(lb, ub, integer, name));
  }

  addNumVariable(lb: number, ub: number, name = ''): MPVariable {
    return this.addVariable(lb, ub, false, name);
  }

  addIntVariable(lb: number, ub: number, name = ''): MPVariable {
    return this.addVariable(lb, ub, true, name);
  }

  addBoolVariable(name = ''): MPVariable {
    return this.addVariable(0, 1, true, name);
  }

  addConstraint(): MPConstraint;
  addConstraint(name: string): MPConstraint;
  addConstraint(lb: number, ub: number, name?: string): MPConstraint;
  addConstraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    const hasBounds = typeof lbOrName === 'number' && typeof ub === 'number';
    const constraintName = typeof lbOrName === 'string' ? lbOrName : name;
    return createMPConstraint(this.state,
      this.state.addConstraint(hasBounds ? lbOrName : null, hasBounds ? ub : null, constraintName));
  }

  objective(): MPObjective { return this.objectiveHandle; }
  incremental(options: MpSolveOptions = {}): MpIncrementalSolver { return new MpIncrementalSolver(this, options); }
  numVariables(): number { return this.state.numVariables(); }
  numConstraints(): number { return this.state.numConstraints(); }



}

let createMpResult: (model: MpModel | MPSolver, response: MPSolverSolutionResponse,
  variableCount: number, constraintCount: number, metadata?: MpSolverNativeMetadata,
  solverType?: OptimizationProblemType, elapsedMs?: number) => MpResult;

export class MpResult {
  static { createMpResult = (model, response, variableCount, constraintCount, metadata, solverType, elapsedMs) =>
    new MpResult(model, response, variableCount, constraintCount, metadata, solverType, elapsedMs); }

  private readonly answer: MpAnswer;
  private readonly owner: MPSolverModel;
  private readonly generation: object;

  private constructor(model: MpModel | MPSolver, response: MPSolverSolutionResponse,
      variableCount: number, constraintCount: number, metadata?: MpSolverNativeMetadata,
      solverType = OptimizationProblemType.GLOP_LINEAR_PROGRAMMING, elapsedMs = 0) {
    this.owner = mpModelState(model);
    this.generation = this.owner.currentGeneration();
    this.answer = new MpAnswer(response, variableCount, constraintCount, solverType, { metadata, elapsedMs });
  }

  get status(): MPSolverResultStatus { return this.answer.status; }
  get hasSolution(): boolean { return this.answer.hasSolution; }
  get objectiveValue(): number | null {
    return this.hasSolution && typeof this.answer.response.objectiveValue === 'number' ? this.answer.response.objectiveValue : null;
  }
  get bestObjectiveBound(): number | null {
    return typeof this.answer.response.bestObjectiveBound === 'number' ? this.answer.response.bestObjectiveBound : null;
  }
  get response(): MPSolverSolutionResponse { return structuredClone(this.answer.response); }
  get nativeMetadata(): MpSolverNativeMetadata | null { return this.answer.metadata ? structuredClone(this.answer.metadata) : null; }
  get solverVersion(): string | null { return this.answer.metadata?.solverVersion ?? null; }
  get iterations(): bigint | null { return this.answer.metadata?.iterations ?? null; }
  get nodes(): bigint | null { return this.answer.metadata?.nodes ?? null; }
  get wallTimeMs(): number { return this.answer.wallTimeMs; }
  get exactConditionNumber(): number | null { return this.answer.metadata?.exactConditionNumber ?? null; }

  private index(element: MPVariable | MPConstraint): number {
    const handle = element instanceof MPVariable ? variableHandles.get(element) : constraintHandles.get(element);
    if (!handle || handle.model !== this.owner || handle.ref.generation !== this.generation)
      throw new Error('Element belongs to a different MPSolver model or generation.');
    const count = element instanceof MPVariable ? this.answer.variableCount : this.answer.constraintCount;
    if (handle.ref.index >= count) throw new Error('Element was added after this solve.');
    return handle.ref.index;
  }
  private valueAt(name: 'variableValue' | 'reducedCost' | 'dualValue', element: MPVariable | MPConstraint): number {
    const index = this.index(element), values = this.answer.response[name];
    if (!this.hasSolution || !Array.isArray(values) || index >= values.length) throw new Error('Solve result has no value for this element.');
    return values[index];
  }
  value(variable: MPVariable): number { return this.valueAt('variableValue', variable); }
  reducedCost(variable: MPVariable): number { return this.valueAt('reducedCost', variable); }
  dualValue(constraint: MPConstraint): number { return this.valueAt('dualValue', constraint); }
  basisStatus(element: MPVariable | MPConstraint): BasisStatus {
    return this.answer.basis(this.index(element), element instanceof MPConstraint);
  }
}

class MPSolverRuntimeLostError extends Error {
  constructor() {
    super('MPSolver IncrementalSolver runtime was replaced; close it and create a new solver.');
    this.name = 'MPSolverRuntimeLostError';
  }
}

/** Own a native solver on a fixed executor, forwarding subsequent model edits. */
class MpNativeSession {
  private readonly edits: MpSolverEdit[];
  private readonly executor: MpSolverExecutor;
  private readonly encodingOptions: { executor: ResolvedExecutorConfiguration };
  private readonly options: MPSolverProtoSolveOptions;
  readonly solverType: OptimizationProblemType;
  private readonly initPromise: Promise<bigint>;
  private handle: bigint | null = null;
  private runtime: object | undefined;
  private state: 'open' | 'failed' | 'closing' | 'closed' = 'open';
  private activeOperation: Promise<unknown> | null = null;
  private closePromise: Promise<void> | null = null;
  private callbackDepth = 0;
  private readonly eventScope = new ObserverScope();

  constructor(private readonly model: MPSolverModel, options: MPSolverProtoSolveOptions = {}, private readonly storeAnswer = true) {
    this.solverType = options.solverType ?? model.problemType();
    const configuration = resolveExecutorConfiguration(options.executor);
    if (configuration.type === 'cloud') throw new Error('MPSolver incremental sessions require a direct, worker or server executor.');
    this.executor = createResolvedExecutor(configuration);
    this.encodingOptions = { executor: configuration };
    const { executor: _, ...defaults } = options;
    this.options = defaults;
    const tracking = model.trackEdits();
    this.edits = tracking.edits;
    this.initPromise = this.create({ ...tracking.request, ...model.sessionSnapshot(options).request, model: tracking.request.model, solverType: this.solverType }).finally(() => this.eventScope.finish());
    void this.initPromise.catch(() => this.fail());
  }

  private async create(request: MPSolverModelRequest): Promise<bigint> {
    const bytes = await encodeMPModelRequest(request, this.encodingOptions);
    await executeSolverJob(this.executor, { type: 'sessionCreate', request: bytes }, {
      ...this.events(this.options),
      onDispatch: runtime => { this.runtime = runtime; },
      onSuccess: result => {
        if (result.type !== 'sessionCreate' || result.handle <= 0n) throw new Error('MPSolver session creation returned no handle.');
        this.handle = result.handle;
      },
      onAbandonedResult: async payload => {
        const result = mpSolverProtocol.decodeResult(payload);
        if (result.type !== 'sessionCreate' || result.handle <= 0n) throw new Error('MPSolver session creation returned no handle.');
        await executeSolverJob(this.executor, { type: 'sessionClose', handle: result.handle }, {});
      },
    });
    return this.handle!;
  }

  solve(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverResultStatus> {
    return this.run(SessionAction.SOLVE, { ...this.options, ...options }).then(result => result.status);
  }

  solveWithProto(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult> {
    return this.run(SessionAction.SOLVE, { ...this.options, ...options }).then(result => result.proto!);
  }

  /** Advance the native solution pool; returns false when no next solution exists. */
  nextSolution(options: Omit<MPSolverProtoSolveOptions, 'parameters'> = {}): Promise<boolean> {
    return this.run(SessionAction.NEXT_SOLUTION, { ...this.options, ...options }).then(result => result.hasSolution);
  }

  nextResult(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult | null> {
    return this.run(SessionAction.NEXT_SOLUTION, { ...this.options, ...options }).then(result => result.hasSolution ? result.proto! : null);
  }

  /** Native Reset discards backend state while retaining the mathematical model. */
  reset(options: Omit<MPSolverProtoSolveOptions, 'parameters'> = {}): Promise<void> {
    return this.run(SessionAction.RESET, { ...this.options, ...options }).then(() => undefined);
  }

  private run(action: SessionAction, options: MPSolverProtoSolveOptions): Promise<{ status: MPSolverResultStatus; hasSolution: boolean; proto?: MPSolverProtoSolveResult }> {
    if (this.state !== 'open') return Promise.reject(new Error(`MPSolver IncrementalSolver is ${this.state}; close it and create a new solver.`));
    if (this.activeOperation) return Promise.reject(new Error('MPSolver IncrementalSolver already has an operation in progress.'));
    let parameters: { doubleParams: Record<number, number>; integerParams: Record<number, number> };
    let basis: ReturnType<typeof copyStartingBasis>, registration: ReturnType<typeof callbackRegistration>;
    const snapshot = this.model.sessionSnapshot({ ...options, solverType: this.solverType });
    try {
      basis = copyStartingBasis(options.startingBasis);
      registration = callbackRegistration(options.callback, options.callbackRegistration);
      if (action === SessionAction.SOLVE) validateCallbackThreads(registration, this.solverType, normalizedNumThreads({numThreads:snapshot.numThreads}) ?? 1);
      parameters = solverParameterState(options.parameters ?? new MPSolverParameters()).snapshot();
      this.model.claimOperation();
    } catch (error) { return Promise.reject(error); }
    if (action === SessionAction.SOLVE)
      snapshot.request.enableInternalSolverOutput = options.enableOutput ??
        (Boolean(options.messageCallback) || snapshot.request.enableInternalSolverOutput);
    const pending = this.edits.slice();
    const started = Date.now();
    let operation!: Promise<{ status: MPSolverResultStatus; hasSolution: boolean; proto?: MPSolverProtoSolveResult }>;
    operation = (async () => {
      const handle = await this.initPromise;
      const request = await encodeMPModelRequest(snapshot.request, this.encodingOptions);
      const threads = normalizedNumThreads({ numThreads: snapshot.numThreads })
        ?? (this.solverType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
          ? rootIntegerParameter(String(snapshot.request.solverSpecificParameters ?? ''), ['num_workers', 'num_search_workers'])
          : this.solverType === OptimizationProblemType.PDLP_LINEAR_PROGRAMMING
            ? rootIntegerParameter(String(snapshot.request.solverSpecificParameters ?? ''), ['num_threads']) : undefined) ?? 1;
      const observers = this.events(options);
      let committed = false;
      const alreadyAborted = options.signal?.aborted;
      const outcome: { status: MPSolverResultStatus; hasSolution: boolean; proto?: MPSolverProtoSolveResult } = { status: MPSolverResultStatus.NOT_SOLVED, hasSolution: false };
      try {
        await executeSolverJob(this.executor, { type: 'sessionRun', handle, action, edits: pending,
          request, numThreads: threads, startingBasis: basis, callbackRegistration: registration, streamMessages: action === SessionAction.SOLVE && Boolean(options.messageCallback || (snapshot.request.enableInternalSolverOutput && options.onEvent)), interruptible: action === SessionAction.SOLVE && Boolean(options.signal) && solverTypeSupportsInterruption(this.solverType), parameters }, {
          ...observers, onCallback: observers.callback ? mpCallbackHandler(observers.callback) : undefined, onEventSync: messageObserver(observers.messageCallback), resources: { threads: action === SessionAction.SOLVE ? threads : 1 },
          onDispatch: runtime => this.assertRuntime(runtime),
          onSuccess: async result => {
            if (result.type !== 'sessionResult') throw new Error('MPSolver executor returned the wrong session response.');
            this.edits.splice(0, pending.length);
            committed = true;
            outcome.hasSolution = result.hasSolution;
            if (result.response.length) {
              const response = await decodeMPSolutionResponse(result.response, this.encodingOptions);
              outcome.proto = { bytes: new Uint8Array(result.response), response, metadata: result.metadata };
              outcome.status = this.model.applySessionResult(response, result.metadata, snapshot.revision, started, this.storeAnswer);
            } else if (action === SessionAction.RESET) {
              if (this.model.sessionSnapshot().revision !== snapshot.revision) throw new Error('MPSolver model was modified during reset.');
              this.model.reset();
            }
          },
        });
      } catch (error) { if (!committed && !alreadyAborted) this.fail(); throw error; }
      return outcome;
    })().finally(() => { this.eventScope.finish(); this.model.releaseOperation(); if (this.activeOperation === operation) this.activeOperation = null; });
    this.activeOperation = operation;
    return operation;
  }

  close(): Promise<void> {
    if (this.callbackDepth || this.eventScope.running) return Promise.reject(new Error('MPSolver IncrementalSolver cannot be closed from one of its callbacks.'));
    if (this.state === 'closed') return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    let attempt!: Promise<void>;
    attempt = (async () => {
      await this.initPromise.catch(() => undefined);
      await this.activeOperation?.catch(() => undefined);
      if (this.handle !== null) {
        try {
          await executeSolverJob(this.executor, { type: 'sessionClose', handle: this.handle }, {
            onDispatch: runtime => this.assertRuntime(runtime),
          });
        } catch (error) { if (!(error instanceof MPSolverRuntimeLostError)) throw error; }
      }
      this.model.stopTracking(this.edits);
      this.handle = null; this.runtime = undefined; this.state = 'closed';
    })().finally(() => { if (this.closePromise === attempt) this.closePromise = null; });
    this.closePromise = attempt;
    return attempt;
  }

  private fail(): void {
    if (this.state === 'open') this.state = 'failed';
    this.model.stopTracking(this.edits);
  }
  private assertRuntime(runtime: object): void { if (runtime !== this.runtime) throw new MPSolverRuntimeLostError(); }
  private events(options: MPSolverProtoSolveOptions): MPSolverIncrementalSolveOptions {
    const onEvent = options.onEvent;
    const messageCallback = options.messageCallback;
    const callback = options.callback;
    return { ...options, callback: callback ? data => {
      this.callbackDepth++;
      try { return callback(data); } finally { this.callbackDepth--; }
    } : undefined, messageCallback: messageCallback ? messages => {
      this.callbackDepth++;
      try { return messageCallback(messages); } finally { this.callbackDepth--; }
    } : undefined, onEvent: onEvent ? this.eventScope.wrap(onEvent) : undefined };
  }
}

/** Python-style adapter retaining solution getters on its existing solver. */
export class MPSolverIncrementalSolver {
  private readonly session: MpNativeSession;
  constructor(readonly solver: MPSolver, options: MPSolverIncrementalSolverOptions = {}) {
    this.session = new MpNativeSession(mpModelState(solver), options);
  }
  solve(options: MPSolverIncrementalSolveOptions = {}): Promise<MPSolverResultStatus> { return this.session.solve(options); }
  solveWithProto(options: MPSolverIncrementalSolveOptions = {}): Promise<MPSolverProtoSolveResult> { return this.session.solveWithProto(options); }
  nextSolution(options: Omit<MPSolverIncrementalSolveOptions, 'parameters'> = {}): Promise<boolean> { return this.session.nextSolution(options); }
  reset(options: Omit<MPSolverIncrementalSolveOptions, 'parameters'> = {}): Promise<void> { return this.session.reset(options); }
  close(): Promise<void> { return this.session.close(); }
}

export type MpIncrementalSolveOptions = Omit<MpSolveOptions, 'executor' | 'solverType'>;
function mpSessionOptions(options: MpSolveOptions): MPSolverProtoSolveOptions {
  const { parameters, threads, ...native } = options;
  return { ...native, ...(threads === undefined ? {} : { numThreads: threads }),
    ...(parameters === undefined ? {} : { parameters: mpParameters(parameters) }) };
}

/** Retain native model state while returning an independent answer per solve. */
export class MpIncrementalSolver {
  private readonly session: MpNativeSession;
  constructor(readonly model: MpModel, options: MpSolveOptions = {}) {
    this.session = new MpNativeSession(mpModelState(model), mpSessionOptions(options), false);
  }
  async solve(options: MpIncrementalSolveOptions = {}): Promise<MpResult> {
    const variableCount = this.model.numVariables(), constraintCount = this.model.numConstraints();
    const result = await this.session.solveWithProto(mpSessionOptions(options));
    return createMpResult(this.model, result.response, variableCount, constraintCount, result.metadata, this.session.solverType);
  }
  async nextSolution(options: Pick<MpIncrementalSolveOptions, 'signal' | 'onEvent'> = {}): Promise<MpResult | null> {
    const variableCount = this.model.numVariables(), constraintCount = this.model.numConstraints();
    const result = await this.session.nextResult(options);
    return result ? createMpResult(this.model, result.response, variableCount, constraintCount, result.metadata, this.session.solverType) : null;
  }
  reset(options: Pick<MpIncrementalSolveOptions, 'signal' | 'onEvent'> = {}): Promise<void> { return this.session.reset(options); }
  close(): Promise<void> { return this.session.close(); }
}

export class MPSolver {
  static readonly IncrementalSolver = MPSolverIncrementalSolver;
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

  private readonly model: MPSolverModel;
  private solving = false;
  private readonly objectiveInstance: MPObjective;

  constructor(name: string, problemType: OptimizationProblemType) {
    this.model = new MPSolverModel(name, problemType);
    solverModels.set(this, this.model);
    this.objectiveInstance = createMPObjective(this.model);
  }

  static async solve(model: MpModel, options: MpSolveOptions = {}): Promise<MpResult> {
    const { solverType, threads, timeLimitSeconds, enableOutput,
      solverSpecificParameters, parameters, ...execution } = options;
    execution.startingBasis = copyStartingBasis(execution.startingBasis);
    if (execution.callbackRegistration) execution.callbackRegistration = { ...execution.callbackRegistration,
      variableIndices: execution.callbackRegistration.variableIndices && [...execution.callbackRegistration.variableIndices] };
    const variableCount = model.numVariables();
    const constraintCount = model.numConstraints();
    const solveParameters = mpParameters(parameters);
    const request = await mpModelState(model).exportModelRequestProto({
      ...execution, solverType, timeLimitSeconds, enableOutput, solverSpecificParameters,
    });
    const result = await executeModelRequest(request, {
      ...execution, numThreads: threads, parameters: solveParameters,
    }, true);
    return createMpResult(model, result.response, variableCount, constraintCount, result.metadata, solverType);
  }


  /** Returns a new native-clamped response; neither the model nor its loaded answer is changed. */
  static async clampSolutionWithinBounds(model: MpModel | MPSolver, solution: Uint8Array | MPSolverSolutionResponse,
      options: MPSolverClampingOptions = {}): Promise<MpResult> {
    options = { ...options };
    const state = mpModelState(model), generation = state.currentGeneration();
    const solverType = options.solverType ?? state.problemType();
    const inputs = Promise.all([state.exportModelProto(options), solution instanceof Uint8Array
      ? new Uint8Array(solution) : encodeMPSolutionResponse(solution, options)]);
    const variableCount = state.numVariables(), constraintCount = state.numConstraints();
    const [modelBytes, solutionBytes] = await inputs;
    const result = await MPSolver.clampSolutionWithinBoundsProto(modelBytes, solutionBytes, { ...options, solverType });
    if (state.currentGeneration() !== generation) throw new Error('MPSolver model was cleared while clamping a solution.');
    return createMpResult(model, result.response, variableCount, constraintCount, undefined, solverType);
  }

  static async clampSolutionWithinBoundsProto(model: Uint8Array | MPSolverModelProto,
      solution: Uint8Array | MPSolverSolutionResponse, options: MPSolverClampingOptions = {}): Promise<MPSolverProtoSolveResult> {
    options = { ...options };
    const executor = createMpSolverExecutor(options.executor);
    const [modelBytes, solutionBytes] = await Promise.all([model instanceof Uint8Array ? new Uint8Array(model) : encodeMPModel(model, options),
      solution instanceof Uint8Array ? new Uint8Array(solution) : encodeMPSolutionResponse(solution, options)]);
    const result = await executeSolverJob(executor, { type: 'clampSolution', model: modelBytes, solution: solutionBytes,
      solverType: options.solverType ?? OptimizationProblemType.GLOP_LINEAR_PROGRAMMING }, options);
    if (result.type !== 'clampSolution') throw new Error('MPSolver executor returned the wrong solution clamping response.');
    const bytes = new Uint8Array(result.solution);
    return { bytes, response: await decodeMPSolutionResponse(bytes, options) };
  }

  static createSolver(solverId: string): MPSolver | null {
    const problemType = parseSolverType(solverId);
    return problemType !== null && supportsProblemType(problemType)
      ? new MPSolver(solverId, problemType)
      : null;
  }

  static infinity(): number {
    return Number.POSITIVE_INFINITY;
  }

  static supportsProblemType(problemType: OptimizationProblemType): boolean {
    return supportsProblemType(problemType);
  }

  static parseSolverType(solverId: string): OptimizationProblemType | null {
    return parseSolverType(solverId);
  }

  static parseAndCheckSupportForProblemType(solverId: string): OptimizationProblemType | null {
    const problemType = MPSolver.parseSolverType(solverId);
    if (problemType === null) return null;
    return MPSolver.supportsProblemType(problemType) ? problemType : null;
  }

  static getLinearSolverSchemas(
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<LinearSolverSchemas> {
    return getLinearSolverSchemas(options);
  }


  static findErrorInModelProto(model: Uint8Array | MPSolverModelProto, options: MPSolverExecutionOptions = {}): Promise<string> {
    return findErrorInModelProto(model, options);
  }

  static createModelRequest(
    request: MPSolverModelRequest,
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<Uint8Array> {
    return encodeMPModelRequest(request, options);
  }

  static decodeSolutionResponse(
    bytes: Uint8Array,
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<MPSolverSolutionResponse> {
    return decodeMPSolutionResponse(bytes, options);
  }

  static createSolutionResponse(
    response: MPSolverSolutionResponse,
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<Uint8Array> {
    return encodeMPSolutionResponse(response, options);
  }

  static async solveModelRequest(
    request: Uint8Array | MPSolverModelRequest,
    options: Pick<
      MPSolverProtoSolveOptions,
      'executor' | 'numThreads' | 'onEvent' | 'signal' | 'parameters' | 'messageCallback' | 'startingBasis' | 'callback' | 'callbackRegistration'
    > = {},
  ): Promise<MPSolverProtoSolveResult> {
    return executeModelRequest(request, options);
  }

  name(): string {
    return this.model.name();
  }

  problemType(): OptimizationProblemType {
    return this.model.problemType();
  }

  isMip(): boolean {
    return this.model.isMip();
  }

  clear(): void {
    this.model.clear();
  }

  infinity(): number {
    return this.model.infinity();
  }

  variable(index: number): MPVariable {
    return createMPVariable(this.model, this.model.variable(index));
  }

  variables(): MPVariable[] {
    return this.model.variables().map((ref) => createMPVariable(this.model, ref));
  }

  lookupVariable(name: string): MPVariable | null {
    const ref = this.model.lookupVariable(name);
    return ref ? createMPVariable(this.model, ref) : null;
  }

  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariable {
    return createMPVariable(this.model, this.model.addVariable(lb, ub, integer, name));
  }

  addNumVariable(lb: number, ub: number, name: string): MPVariable {
    return this.addVariable(lb, ub, false, name);
  }

  addIntVariable(lb: number, ub: number, name: string): MPVariable {
    return this.addVariable(lb, ub, true, name);
  }

  addBoolVariable(name: string): MPVariable {
    return this.addVariable(0, 1, true, name);
  }

  constraint(index: number): MPConstraint {
    return createMPConstraint(this.model, this.model.constraint(index));
  }

  constraints(): MPConstraint[] {
    return this.model.constraints().map((ref) => createMPConstraint(this.model, ref));
  }

  lookupConstraint(name: string): MPConstraint | null {
    const ref = this.model.lookupConstraint(name);
    return ref ? createMPConstraint(this.model, ref) : null;
  }

  addConstraint(): MPConstraint;
  addConstraint(name: string): MPConstraint;
  addConstraint(lb: number, ub: number, name?: string): MPConstraint;
  addConstraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    const hasBounds = typeof lbOrName === 'number' && typeof ub === 'number';
    const constraintName = typeof lbOrName === 'string' ? lbOrName : name;
    return createMPConstraint(
      this.model,
      this.model.addConstraint(hasBounds ? lbOrName : null, hasBounds ? ub : null, constraintName),
    );
  }

  objective(): MPObjective {
    return this.objectiveInstance;
  }

  async solve(options: MPSolverSolveOptions = {}): Promise<MPSolverResultStatus> {
    if (this.solving) throw new Error('MPSolver.solve() is already in progress.');
    this.model.claimOperation();
    this.solving = true;
    try {
      return await this.model.solve(options.parameters, options);
    } finally {
      this.solving = false;
      this.model.releaseOperation();
    }
  }

  exportModelProto(
    options: Pick<MPSolverExecutionOptions, 'executor'> = {},
  ): Promise<Uint8Array> {
    return this.model.exportModelProto(options);
  }

  /** Replace the current model, discarding names. Empty string means success. */
  loadModelFromProto(model: Uint8Array | MPSolverModelProto,
    options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.model.loadModelFromProto(model, false, options);
  }

  /** Replace the current model, preserving unique nonempty names. */
  loadModelFromProtoKeepNames(model: Uint8Array | MPSolverModelProto,
    options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.model.loadModelFromProto(model, true, options);
  }

  /** Clear and fill an existing response object from the current solution. */
  fillSolutionResponseProto(response: MPSolverSolutionResponse): void {
    this.model.fillSolutionResponseProto(response);
  }

  exportSolutionProto(options: Pick<MPSolverExecutionOptions, 'executor'> = {}): Promise<Uint8Array> {
    return this.model.exportSolutionProto(options);
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return this.model.exportModelRequestProto(options);
  }

  async solveWithProto(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult & { loaded: boolean }> {
    if (this.solving) throw new Error('MPSolver.solve() is already in progress.');
    this.model.claimOperation();
    this.solving = true;
    try {
      return await this.model.solveWithProto(options);
    } finally {
      this.solving = false;
      this.model.releaseOperation();
    }
  }

  async loadSolutionFromProto(
    response: Uint8Array | MPSolverSolutionResponse = {},
    tolerance = 1e-7,
    options: MPSolverExecutionOptions = {},
  ): Promise<boolean> {
    return this.model.loadSolutionFromProto(response, tolerance, options);
  }


  verifySolution(tolerance: number, logErrors = false, options: MPSolverExecutionOptions = {}): Promise<boolean> {
    return this.model.verifySolution(tolerance, logErrors, options);
  }

  reset(): void {
    this.model.reset();
  }

  enableOutput(): void {
    this.model.enableOutput();
  }

  suppressOutput(): void {
    this.model.suppressOutput();
  }

  outputIsEnabled(): boolean {
    return this.model.outputIsEnabled();
  }

  setTimeLimit(milliseconds: number): void {
    this.model.setTimeLimit(milliseconds);
  }

  timeLimit(): number {
    return this.model.timeLimit();
  }

  setNumThreads(numThreads: number): boolean {
    return this.model.setNumThreads(numThreads);
  }

  getNumThreads(): number {
    return this.model.getNumThreads();
  }

  setSolverSpecificParametersAsString(parameters: string, options: MPSolverExecutionOptions = {}): Promise<boolean> {
    return this.model.setSolverSpecificParametersAsString(parameters, options);
  }

  getSolverSpecificParametersAsString(): string {
    return this.model.getSolverSpecificParametersAsString();
  }

  async supportsCallbacks(options: MPSolverExecutionOptions = {}): Promise<boolean> {
    return (await this.model.callbackCapabilities(options)).supportsCallbacks;
  }

  async supportsMessageCallbacks(options: MPSolverExecutionOptions = {}): Promise<boolean> {
    return (await this.model.callbackCapabilities(options)).supportsMessageCallbacks;
  }

  solverVersion(options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.model.solverVersion(options);
  }

  computeConstraintActivities(options: MPSolverExecutionOptions = {}): Promise<number[]> {
    return this.model.computeConstraintActivities(options);
  }

  computeExactConditionNumber(): number {
    return this.model.computeExactConditionNumber();
  }

  setHint(variables: MPVariable[], values: number[]): void {
    if (variables.length !== values.length) {
      throw new Error(`MPSolver.setHint: variable/value length mismatch (${variables.length} !== ${values.length}).`);
    }
    this.model.setHint(variables.map((variable) => mpVariableRef(variable, this.model)), values);
  }

  exportModelAsLpFormat(obfuscate: boolean, options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.model.exportModelAsLpFormat(obfuscate, options);
  }

  exportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean, options: MPSolverExecutionOptions = {}): Promise<string> {
    return this.model.exportModelAsMpsFormat(fixedFormat, obfuscate, options);
  }

  numVariables(): number {
    return this.model.numVariables();
  }

  numConstraints(): number {
    return this.model.numConstraints();
  }

  wallTime(): number {
    return this.model.wallTime();
  }

  iterations(): number {
    return this.model.iterations();
  }

  nodes(): number {
    return this.model.nodes();
  }

}
