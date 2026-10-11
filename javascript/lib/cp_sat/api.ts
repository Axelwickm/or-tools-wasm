import {
  cpSatProtocol,
  type CpSatExecutor,
  type CpSatSolverEvent,
} from './protocol.js';
import { DirectCpSatExecutor } from './direct_executor.js';
import { CloudExecutor } from '../cloud_executor.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import {
  SolverWorkerExecutor,
  type SolverWorkerLike,
} from '../worker_helpers.js';
import {
  cpModelProtoSchema,
  satParametersProtoSchema,
} from '../generated/cp_sat_schemas.js';
import {
  resolveExecutorConfiguration,
  type ExecutorSelection,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import {
  type SolverExecutorEventHandler,
  type SolverJobEvent,
  type SolverResourceRequest,
} from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { decodeProtobufWithExactLongs, encodeProtobufBigInts } from '../protobufjs_helpers.js';
import type { CpModelProto, CpSolverResponse } from '../generated/cp_model.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import * as protobufModule from 'protobufjs';
import { solveCpModel } from './high_level_api.js';

export {
  CpSolverStatus,
  DecisionStrategyProto_DomainReductionStrategy,
  DecisionStrategyProto_VariableSelectionStrategy,
} from '../generated/cp_model.js';
export type { CpModelProto, CpSolverResponse } from '../generated/cp_model.js';
export type { SatParameters } from '../generated/sat_parameters.js';
export {
  SatParameters_VariableOrder,
  SatParameters_Polarity,
  SatParameters_ConflictMinimizationAlgorithm,
  SatParameters_BinaryMinizationAlgorithm,
  SatParameters_ClauseOrdering,
  SatParameters_RestartAlgorithm,
  SatParameters_MaxSatAssumptionOrder,
  SatParameters_MaxSatStratificationAlgorithm,
  SatParameters_SearchBranching,
  SatParameters_SharedTreeSplitStrategy,
  SatParameters_FPRoundingMethod,
} from '../generated/sat_parameters.js';

export type CpSatSchemas = {
  cp_model: string;
  sat_parameters: string;
};

export type CpSatSolveResult = {
  response: CpSolverResponse | null;
  bytes: Uint8Array;
  statistics?: string;
};

export type CpSatEvent =
  | SolverJobEvent
  | { type: 'solution'; response: CpSolverResponse; bytes: Uint8Array }
  | { type: 'bestBound'; bound: number }
  | { type: 'log'; message: string };

export type CpSatEventHandler = (event: CpSatEvent) => void | Promise<void>;

export type CpSatEventMask = {
  solution?: boolean;
  bestBound?: boolean;
  log?: boolean;
};

export type CpSatSolverParameters = Omit<SatParameters, 'numSearchWorkers'>;

export type CpSatSolveOptions = CpSatSolverParameters & {
  executor?: ExecutorSelection;
  onEvent?: CpSatEventHandler;
  eventMask?: CpSatEventMask;
  signal?: AbortSignal;
};

export type CpSatValidateOptions = {
  executor?: ExecutorSelection;
  signal?: AbortSignal;
};

export type CpSatApi = {
  solve(model: import('./high_level_api.js').CpModel, options?: import('./high_level_api.js').CpSolverSolveOptions): Promise<import('./high_level_api.js').CpResult>;
  solveProto(model: Uint8Array, options?: CpSatSolveOptions): Promise<CpSatSolveResult>;
  validate(
    model: Uint8Array,
    options?: CpSatValidateOptions,
  ): Promise<{ ok: boolean; message: string }>;
  modelStats(model: Uint8Array, options?: CpSatValidateOptions): Promise<string>;
  responseStats(response: Uint8Array | CpSolverResponse, options?: CpSatValidateOptions): Promise<string>;
  exportModelText(model: Uint8Array | CpModelProto, options?: CpSatValidateOptions): Promise<string>;
  getSchemas(): Promise<CpSatSchemas>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
};

export type CpSatModelInstance = Uint8Array;

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';

async function createCpSatWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-cp-sat' },
  );
}

const directCpSatExecutor = new DirectCpSatExecutor();
const workerCpSatExecutor = new SolverWorkerExecutor(
  cpSatProtocol,
  createCpSatWorker,
  true,
);
const ignoreCpSatProgress = () => {};

function createCpSatExecutor(
  selection: ExecutorSelection = 'auto',
): CpSatExecutor {
  return createResolvedCpSatExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedCpSatExecutor(executor: ResolvedExecutorConfiguration): CpSatExecutor {
  switch (executor.type) {
    case 'direct':
      return directCpSatExecutor;
    case 'worker':
      return workerCpSatExecutor;
    case 'server':
      return new SolverServerExecutor(cpSatProtocol, executor);
    case 'cloud':
      return new CloudExecutor('cp-sat', { test: executor.test });
  }
}

type ProtobufType = import('protobufjs').Type;

type CpSatProtobufContext = {
  schemas: CpSatSchemas;
  modelType: ProtobufType;
  responseType: ProtobufType;
  parametersType: ProtobufType;
};

let protobufContext: CpSatProtobufContext | undefined;

function createProtobufContext(): CpSatProtobufContext {
  const schemas = {
    cp_model: cpModelProtoSchema,
    sat_parameters: satParametersProtoSchema,
  };

  const modelRoot = protobufModule.parse(schemas.cp_model).root;
  const parametersRoot = protobufModule.parse(schemas.sat_parameters).root;

  return {
    schemas,
    modelType: modelRoot.lookupType('operations_research.sat.CpModelProto'),
    responseType: modelRoot.lookupType('operations_research.sat.CpSolverResponse'),
    parametersType: parametersRoot.lookupType('operations_research.sat.SatParameters'),
  };
}

function getProtobufContext(): CpSatProtobufContext {
  return protobufContext ??= createProtobufContext();
}

async function getSchemas(): Promise<CpSatSchemas> {
  return getProtobufContext().schemas;
}

// The generated public types remove underscores before digits (e.g. noOverlap2d),
// whereas protobufjs retains them (noOverlap_2d). Resolve public names against
// the schema at every level, including recursively configured subsolvers.
const parameterFields = new WeakMap<ProtobufType, Map<string, protobufModule.Field>>();

function normalizeSatParameters(value: unknown, type: ProtobufType, path = ''): unknown {
  if (Array.isArray(value)) return value.map((entry) => normalizeSatParameters(entry, type, path));
  if (value === null || typeof value !== 'object') return value;
  let fields = parameterFields.get(type);
  if (!fields) {
    fields = new Map();
    for (const field of type.fieldsArray) {
      fields.set(field.name, field);
      fields.set(field.name.replace(/_([a-zA-Z0-9])/g, (_match, character: string) => character.toUpperCase()), field);
    }
    parameterFields.set(type, fields);
  }
  const names = new Set<string>();
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const field = fields.get(key);
    const qualifiedName = path ? `${path}.${key}` : key;
    if (!field) throw new Error(`CpSat.solve: unknown solver parameter "${qualifiedName}".`);
    if (names.has(field.name)) throw new Error(`CpSat.solve: duplicate solver parameter "${qualifiedName}".`);
    names.add(field.name);
    const resolved = field.resolve().resolvedType;
    return [field.name, resolved instanceof protobufModule.Type
      ? normalizeSatParameters(entry, resolved, qualifiedName)
      : entry];
  }));
}

function encodeSatParameters(
  parametersType: ProtobufType,
  params: SatParameters,
): Uint8Array {
  const normalized = normalizeSatParameters(params, parametersType);
  const protobufParams = encodeProtobufBigInts(normalized, parametersType) as Record<string, unknown>;
  const validationError = parametersType.verify(protobufParams);
  if (validationError) {
    throw new Error(`CpSat.solve: ${validationError}`);
  }
  const message = parametersType.create(protobufParams);
  return parametersType.encode(message).finish();
}

function toCpSolverResponse(solverType: ProtobufType, bytes: Uint8Array): CpSolverResponse {
  return decodeProtobufWithExactLongs<CpSolverResponse>(solverType, bytes);
}

function decodeCpSatEvent(
  solverType: ProtobufType,
  event: SolverJobEvent | CpSatSolverEvent,
): CpSatEvent {
  if (event.type === 'solution') {
    const bytes = event.response;
    const response = toCpSolverResponse(solverType, bytes);
    return { type: 'solution', response, bytes };
  }
  return event;
}


function normalizeCpModelForProtobuf(model: CpModelProto) {
  return {
    ...model,
    constraints: model.constraints?.map((constraint) => {
      if (!constraint.noOverlap2d) {
        return constraint;
      }
      const normalized = {
        ...constraint,
        noOverlap_2d: constraint.noOverlap2d,
      } as typeof constraint & { noOverlap_2d: typeof constraint.noOverlap2d };
      delete normalized.noOverlap2d;
      return normalized;
    }),
  };
}

async function createModel(model: CpModelProto): Promise<Uint8Array> {
  const { modelType: type } = getProtobufContext();
  const protobufModel = encodeProtobufBigInts(normalizeCpModelForProtobuf(model), type) as Record<string, unknown>;
  const validationError = type.verify(protobufModel);
  if (validationError) {
    throw new Error(`CpSat.createModel: ${validationError}`);
  }
  const message = type.create(protobufModel);
  return type.encode(message).finish();
}

async function exportModelText(model: Uint8Array | CpModelProto, options: CpSatValidateOptions = {}): Promise<string> {
  const bytes = model instanceof Uint8Array ? new Uint8Array(model) : await createModel(model);
  const result = await executeSolverJob(createCpSatExecutor(options.executor), { type: 'exportModelText', input: bytes }, {
    onEvent: ignoreCpSatProgress, signal: options.signal,
  });
  if (result.type !== 'modelText') throw new Error('CP-SAT executor returned the wrong model export payload.');
  return result.text;
}

async function statistics(type: 'modelStats' | 'responseStats', input: Uint8Array, options: CpSatValidateOptions): Promise<string> {
  const result = await executeSolverJob(createCpSatExecutor(options.executor), { type, input }, {
    onEvent: ignoreCpSatProgress, signal: options.signal,
  });
  if (result.type !== 'statistics') throw new Error('CP-SAT executor returned the wrong statistics payload.');
  return result.report;
}

async function modelStats(model: Uint8Array, options: CpSatValidateOptions = {}): Promise<string> {
  return statistics('modelStats', new Uint8Array(model), options);
}

async function responseStats(response: Uint8Array | CpSolverResponse, options: CpSatValidateOptions = {}): Promise<string> {
  let bytes: Uint8Array;
  if (response instanceof Uint8Array) bytes = new Uint8Array(response);
  else {
    const type = getProtobufContext().responseType;
    const converted = encodeProtobufBigInts(structuredClone(response), type) as Record<string, unknown>;
    const error = type.verify(converted);
    if (error) throw new Error(`CpSat.responseStats: ${error}`);
    bytes = type.encode(type.create(converted)).finish();
  }
  return statistics('responseStats', bytes, options);
}

type CpSatExecuteOptions = {
  executor: CpSatExecutor;
  solverParametersBytes: Uint8Array;
  solverType: ProtobufType;
  resources?: SolverResourceRequest;
  onEvent?: CpSatEventHandler;
  eventMask?: CpSatEventMask;
  signal?: AbortSignal;
};

async function executeSolve(
  modelBytes: Uint8Array,
  options: CpSatExecuteOptions,
) {
  const eventMask = options.onEvent
    ? options.eventMask ?? { solution: true, bestBound: true, log: true }
    : {};
  const executor = options.executor;
  const onEvent: SolverExecutorEventHandler<
    SolverJobEvent | CpSatSolverEvent
  > = async (event) => {
    const mappedEvent = decodeCpSatEvent(options.solverType, event);
    await options.onEvent?.(mappedEvent);
  };
  const response = await executeSolverJob(executor, {
    type: 'solve',
    model: modelBytes,
    parameters: options.solverParametersBytes,
    callbacks: {
      solution: Boolean(eventMask.solution),
      bestBound: Boolean(eventMask.bestBound),
      log: Boolean(eventMask.log),
    },
  }, {
    showCloudNotice: !(executor instanceof SolverServerExecutor),
    resources: options.resources,
    onEvent,
    signal: options.signal,
  });
  if (response.type !== 'solve') {
    throw new Error('CP-SAT executor returned the wrong solve payload.');
  }
  return response;
}

function schedulerResourcesFromParameters(
  parameters: CpSatSolverParameters,
): SolverResourceRequest | undefined {
  const threads = parameters.numWorkers;
  return threads !== undefined && threads > 0 ? { threads } : undefined;
}

async function solveProto(
  modelBytes: Uint8Array,
  options: CpSatSolveOptions = {},
): Promise<CpSatSolveResult> {
  const {
    executor,
    onEvent,
    eventMask,
    signal,
    ...solverParameters
  } = options;
  if ((solverParameters as SatParameters).numSearchWorkers !== undefined) {
    throw new Error('numSearchWorkers is not supported; use numWorkers.');
  }
  const { parametersType, responseType } = getProtobufContext();
  const solverParametersBytes = encodeSatParameters(parametersType, solverParameters);
  const result = await executeSolve(new Uint8Array(modelBytes), {
    executor: createCpSatExecutor(executor),
    solverParametersBytes,
    solverType: responseType,
    onEvent,
    eventMask,
    resources: schedulerResourcesFromParameters(solverParameters),
    signal,
  });
  const bytes = result.response;
  const response = bytes.length > 0 ? toCpSolverResponse(responseType, bytes) : null;
  return { bytes, response, statistics: result.statistics };
}

async function solve(
  model: import('./high_level_api.js').CpModel,
  options: import('./high_level_api.js').CpSolverSolveOptions = {},
): Promise<import('./high_level_api.js').CpResult> {
  if (model instanceof Uint8Array) {
    throw new TypeError('CpSat.solve() accepts a CpModel; use CpSat.solveProto() for serialized models.');
  }
  return solveCpModel(model, options);
}

async function validate(
  model: Uint8Array,
  options: CpSatValidateOptions = {},
) {
  const executor = createCpSatExecutor(options.executor);
  const response = await executeSolverJob(executor, {
    type: 'validate',
    model: new Uint8Array(model),
  }, {
    onEvent: ignoreCpSatProgress,
    signal: options.signal,
  });
  if (response.type !== 'validate') {
    throw new Error('CP-SAT executor returned the wrong validate payload.');
  }
  return {
    ok: response.ok,
    message: response.message,
  };
}

export const CpSat: CpSatApi = {
  solve,
  solveProto,
  validate,
  exportModelText,
  modelStats,
  responseStats,
  getSchemas,
  createModel,
};

if (isBrowserMainThread) {
  (window as Window & { CpSat?: CpSatApi }).CpSat = CpSat;
}

export default CpSat;
