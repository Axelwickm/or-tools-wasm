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
import type {
  SolverExecutorEventHandler,
  SolverJobEvent,
  SolverResourceRequest,
} from '../solver_executor.js';
import { decodeProtobufWithExactLongs } from '../protobufjs_helpers.js';
import type { CpModelProto, CpSolverResponse } from '../generated/cp_model.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import * as protobufModule from 'protobufjs';

export {
  CpSolverStatus,
  DecisionStrategyProto_DomainReductionStrategy,
  DecisionStrategyProto_VariableSelectionStrategy,
} from '../generated/cp_model.js';
export type { CpModelProto, CpSolverResponse } from '../generated/cp_model.js';
export type { SatParameters } from '../generated/sat_parameters.js';

export type CpSatSchemas = {
  cp_model: string;
  sat_parameters: string;
};

export type CpSatSolveResult = {
  response: CpSolverResponse | null;
  bytes: Uint8Array;
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

export type CpSatSolverParameters = SatParameters;

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
  solve(model: Uint8Array, options?: CpSatSolveOptions): Promise<CpSatSolveResult>;
  validate(
    model: Uint8Array,
    options?: CpSatValidateOptions,
  ): Promise<{ ok: boolean; message: string }>;
  modelStats(model: Uint8Array): Promise<string>;
  getSchemas(): Promise<CpSatSchemas>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
  loadModule(): Promise<unknown>;
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

const defaultCpSatExecutor = createCpSatExecutor();

function loadModule() {
  return defaultCpSatExecutor.load();
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

function encodeSatParameters(
  parametersType: ProtobufType,
  params: SatParameters,
): Uint8Array {
  const unknownParameter = Object.keys(params).find(
    (name) => parametersType.fields[name] === undefined,
  );
  if (unknownParameter) {
    throw new Error(`CpSat.solve: unknown solver parameter "${unknownParameter}".`);
  }
  const validationError = parametersType.verify(params);
  if (validationError) {
    throw new Error(`CpSat.solve: ${validationError}`);
  }
  const message = parametersType.create(params);
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

function createAbortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  if (signal.reason !== undefined) {
    return new Error(String(signal.reason));
  }
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The CP-SAT solve was aborted.', 'AbortError');
  }
  const error = new Error('The CP-SAT solve was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
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
  const protobufModel = normalizeCpModelForProtobuf(model);
  const validationError = type.verify(protobufModel);
  if (validationError) {
    throw new Error(`CpSat.createModel: ${validationError}`);
  }
  const message = type.create(protobufModel);
  return type.encode(message).finish();
}

async function modelStats(model: Uint8Array): Promise<string> {
  const { modelType: type } = getProtobufContext();
  const decoded = type.decode(model);
  const object = type.toObject(decoded, {
    enums: String,
    longs: Number,
    defaults: true,
    arrays: true,
    objects: true,
  }) as CpModelProto;
  return JSON.stringify({
    name: object.name ?? '',
    variables: object.variables?.length ?? 0,
    constraints: object.constraints?.length ?? 0,
    hasObjective: object.objective !== undefined || object.floatingPointObjective !== undefined,
  });
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
  throwIfAborted(options.signal);

  const eventMask = options.onEvent
    ? options.eventMask ?? { solution: true, bestBound: true, log: true }
    : {};
  const executor = options.executor;
  let callbackError: unknown = null;
  let abortError: unknown = null;
  const onEvent: SolverExecutorEventHandler<
    SolverJobEvent | CpSatSolverEvent
  > = async (event) => {
    if (callbackError) return;
    const mappedEvent = decodeCpSatEvent(options.solverType, event);
    try {
      await options.onEvent?.(mappedEvent);
    } catch (error) {
      callbackError = error;
    }
  };
  const job = executor.execute({
    type: 'solve',
    model: modelBytes,
    parameters: options.solverParametersBytes,
    callbacks: {
      solution: Boolean(eventMask.solution),
      bestBound: Boolean(eventMask.bestBound),
      log: Boolean(eventMask.log),
    },
  }, { resources: options.resources, onEvent });
  const abortSolve = () => {
    if (!options.signal) return;
    abortError = createAbortError(options.signal);
    void job.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', abortSolve, { once: true });
  if (options.signal?.aborted) {
    abortSolve();
  }
  try {
    const response = await job.result;
    if (callbackError) {
      throw callbackError;
    }
    if (abortError) {
      throw abortError;
    }
    if (response.type !== 'solve') {
      throw new Error('CP-SAT executor returned the wrong solve payload.');
    }
    return response.response;
  } finally {
    options.signal?.removeEventListener('abort', abortSolve);
  }
}

function schedulerResourcesFromParameters(
  parameters: SatParameters,
): SolverResourceRequest | undefined {
  const threads = parameters.numWorkers && parameters.numWorkers > 0
    ? parameters.numWorkers
    : parameters.numSearchWorkers;
  return threads !== undefined && threads > 0 ? { threads } : undefined;
}

async function solve(
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
  const { parametersType, responseType } = getProtobufContext();
  const solverParametersBytes = encodeSatParameters(parametersType, solverParameters);
  const bytes = await executeSolve(modelBytes, {
    executor: createCpSatExecutor(executor),
    solverParametersBytes,
    solverType: responseType,
    onEvent,
    eventMask,
    resources: schedulerResourcesFromParameters(solverParameters),
    signal,
  });
  const response = bytes.length > 0 ? toCpSolverResponse(responseType, bytes) : null;
  return { bytes, response };
}

async function validate(
  model: Uint8Array,
  options: CpSatValidateOptions = {},
) {
  throwIfAborted(options.signal);
  const executor = createCpSatExecutor(options.executor);
  const job = executor.execute({
    type: 'validate',
    model,
  }, { onEvent: ignoreCpSatProgress });
  let abortError: unknown = null;
  const abortValidation = () => {
    if (!options.signal) return;
    abortError = createAbortError(options.signal);
    void job.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', abortValidation, { once: true });
  if (options.signal?.aborted) abortValidation();
  let response;
  try {
    response = await job.result;
    if (abortError) throw abortError;
  } finally {
    options.signal?.removeEventListener('abort', abortValidation);
  }
  if (response.type !== 'validate') {
    throw new Error('CP-SAT executor returned the wrong validate payload.');
  }
  return {
    ok: response.ok,
    message: response.message,
  };
}

export const CpSat: CpSatApi = {
  solve: (model, options = {}) => solve(model, options),
  validate,
  modelStats,
  getSchemas,
  createModel,
  loadModule,
};

if (isBrowserMainThread) {
  (window as Window & { CpSat?: CpSatApi }).CpSat = CpSat;
}

export default CpSat;
