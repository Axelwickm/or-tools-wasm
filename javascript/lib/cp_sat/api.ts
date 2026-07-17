import { create } from '@bufbuild/protobuf';
import {
  CpSatExecutor,
  createCpSatCallbackMask,
  type CpSatExecutorEventHandler,
  type CpSatExecutorLike,
} from './executor.js';
import { CpSatWorkerExecutor } from './worker_executor.js';
import { CpSatServerExecutor } from './server_executor.js';
import {
  CpSatSchemaRequestSchema,
  CpSatSolveRequestSchema,
  CpSatValidateRequestSchema,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import {
  resolveExecutorConfiguration,
  type ExecutorConfiguration,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
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

export type CpSatSolverParameters = Uint8Array | SatParameters | null;

export type CpSatSolveOptions = {
  solverParameters?: CpSatSolverParameters;
  onEvent?: CpSatEventHandler;
  signal?: AbortSignal;
};

export type CpSatRawSolveOptions = {
  solverParameters?: Uint8Array | null;
  onEvent?: CpSatEventHandler;
  signal?: AbortSignal;
};

export type CpSatApi = {
  solve(model: Uint8Array, options?: CpSatSolveOptions): Promise<CpSatSolveResult>;
  solveRaw(model: Uint8Array, options?: CpSatRawSolveOptions): Promise<Uint8Array>;
  validate(model: Uint8Array): Promise<{ ok: boolean; message: string }>;
  modelStats(model: Uint8Array): Promise<string>;
  getSchemas(): Promise<CpSatSchemas>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
  loadModule(): Promise<unknown>;
  setExecutor(executor: ExecutorConfiguration): void;
};

export type CpSatModelInstance = Uint8Array;

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';

let cpSatExecutor: CpSatExecutorLike = createCpSatExecutor();
const ignoreCpSatProgress: CpSatExecutorEventHandler = () => {};

function createCpSatExecutor(configuration: ExecutorConfiguration = { type: 'auto' }): CpSatExecutorLike {
  return createResolvedCpSatExecutor(resolveExecutorConfiguration(configuration));
}

function createResolvedCpSatExecutor(executor: ResolvedExecutorConfiguration): CpSatExecutorLike {
  switch (executor.type) {
    case 'direct':
      return new CpSatExecutor();
    case 'worker':
      return new CpSatWorkerExecutor();
    case 'server':
      return new CpSatServerExecutor(executor);
  }
}

function loadModule() {
  return cpSatExecutor.load();
}

function setCpSatExecutor(configuration: ExecutorConfiguration) {
  const previousExecutor = cpSatExecutor;
  cpSatExecutor = createCpSatExecutor(configuration);
  previousExecutor.terminate('CP-SAT executor replaced.');
}

let schemaPromise: Promise<CpSatSchemas> | null = null;

async function fetchSchemas(): Promise<CpSatSchemas> {
  const executor = cpSatExecutor;
  const job = executor.execute({
    case: 'schema',
    value: create(CpSatSchemaRequestSchema),
  }, ignoreCpSatProgress);
  const response = await job.result;
  throwIfBridgeFailure(response);
  if (response.payload.case !== 'schemaResult') {
    throw new Error('CP-SAT executor returned the wrong schema payload.');
  }
  return {
    cp_model: response.payload.value.cpModelProtoSchema,
    sat_parameters: response.payload.value.satParametersProtoSchema,
  };
}

async function getSchemas(): Promise<CpSatSchemas> {
  schemaPromise ??= fetchSchemas();
  try {
    return await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

type ProtobufRoot = import('protobufjs').Root;
type CpModelType = import('protobufjs').Type;
type CpSolverResponseType = import('protobufjs').Type;

let protobufRootPromise: Promise<ProtobufRoot> | null = null;
let cpModelTypePromise: Promise<CpModelType> | null = null;
let cpSolverResponseTypePromise: Promise<CpSolverResponseType> | null = null;
let satParametersTypePromise: Promise<import('protobufjs').Type> | null = null;

async function resolveProtobufRoot(): Promise<ProtobufRoot> {
  if (!protobufRootPromise) {
    protobufRootPromise = (async () => {
      const schemas = await getSchemas();
      const parsed = protobufModule.parse(schemas.cp_model);
      return parsed.root;
    })();
  }
  try {
    return await protobufRootPromise;
  } catch (error) {
    protobufRootPromise = null;
    throw error;
  }
}

async function resolveCpModelType(): Promise<CpModelType> {
  if (!cpModelTypePromise) {
    cpModelTypePromise = (async () => {
      const root = await resolveProtobufRoot();
      const cpModelType = root.lookupType('operations_research.sat.CpModelProto');
      if (!cpModelType) {
        throw new Error('CpSat.createModel: cp_model schema did not expose operations_research.sat.CpModelProto.');
      }
      return cpModelType;
    })();
  }
  try {
    return await cpModelTypePromise;
  } catch (error) {
    cpModelTypePromise = null;
    throw error;
  }
}

async function resolveCpSolverResponseType(): Promise<CpSolverResponseType> {
  if (!cpSolverResponseTypePromise) {
    cpSolverResponseTypePromise = (async () => {
      const root = await resolveProtobufRoot();
      const solverType = root.lookupType('operations_research.sat.CpSolverResponse');
      if (!solverType) {
        throw new Error('CpSat.solve: cp_model schema did not expose operations_research.sat.CpSolverResponse.');
      }
      return solverType;
    })();
  }
  try {
    return await cpSolverResponseTypePromise;
  } catch (error) {
    cpSolverResponseTypePromise = null;
    throw error;
  }
}

async function resolveSatParametersType(): Promise<import('protobufjs').Type> {
  if (!satParametersTypePromise) {
    satParametersTypePromise = (async () => {
      const schemas = await getSchemas();
      const parsed = protobufModule.parse(schemas.sat_parameters);
      const root = parsed.root;
      const paramsType = root.lookupType('operations_research.sat.SatParameters');
      if (!paramsType) {
        throw new Error('CpSat.solve: sat_parameters schema did not expose operations_research.sat.SatParameters.');
      }
      return paramsType;
    })();
  }
  try {
    return await satParametersTypePromise;
  } catch (error) {
    satParametersTypePromise = null;
    throw error;
  }
}

function normalizeSatParameters(params: SatParameters): SatParameters {
  if (params.numSearchWorkers === undefined) {
    return params;
  }
  const { numSearchWorkers, ...normalizedParams } = params;
  if (normalizedParams.numWorkers !== undefined) {
    return normalizedParams;
  }
  return {
    ...normalizedParams,
    numWorkers: numSearchWorkers,
  };
}

async function encodeSatParameters(params: SatParameters): Promise<Uint8Array> {
  const paramsType = await resolveSatParametersType();
  const normalizedParams = normalizeSatParameters(params);
  const validationError = paramsType.verify(normalizedParams);
  if (validationError) {
    throw new Error(`CpSat.solve: ${validationError}`);
  }
  const message = paramsType.create(normalizedParams);
  return paramsType.encode(message).finish();
}

async function resolveParamsBytes(params?: CpSatSolverParameters): Promise<Uint8Array | null> {
  if (!params) {
    return null;
  }
  if (params instanceof Uint8Array) {
    return params;
  }
  return encodeSatParameters(params);
}

async function decodeSolverResponse(bytes: Uint8Array): Promise<CpSolverResponse> {
  const solverType = await resolveCpSolverResponseType();
  return toCpSolverResponse(solverType, bytes);
}

function toCpSolverResponse(solverType: CpSolverResponseType, bytes: Uint8Array): CpSolverResponse {
  const decoded = solverType.decode(bytes);
  return solverType.toObject(decoded, {
    enums: String,
    longs: Number,
    defaults: true,
    arrays: true,
    objects: true,
  }) as CpSolverResponse;
}

function mapBridgeSolveEvent(
  solverType: CpSolverResponseType | undefined,
  event: CpSatBridgeResponse,
): CpSatEvent | null {
  if (event.payload.case === 'jobStatus') {
    return { type: 'status', status: event.payload.value };
  }
  if (event.payload.case === 'failure') {
    return { type: 'failure', failure: event.payload.value };
  }
  if (event.payload.case !== 'solveEvent') return null;
  const solveEvent = event.payload.value;
  if (solveEvent.payload.case === 'solutionProto') {
    if (!solverType) return null;
    const bytes = new Uint8Array(solveEvent.payload.value);
    const response = toCpSolverResponse(solverType, bytes);
    return { type: 'solution', response, bytes };
  } else if (solveEvent.payload.case === 'bestBound') {
    return { type: 'bestBound', bound: solveEvent.payload.value };
  } else if (solveEvent.payload.case === 'log') {
    return { type: 'log', message: solveEvent.payload.value };
  }
  return null;
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

function throwIfBridgeFailure(response: CpSatBridgeResponse): void {
  if (response.payload.case === 'error') {
    throw new Error(response.payload.value.message);
  }
  if (response.payload.case === 'failure') {
    const failure = response.payload.value;
    const error = new Error(failure.message);
    if (failure.trace) {
      error.stack = failure.trace;
    }
    throw error;
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
  const type = await resolveCpModelType();
  const protobufModel = normalizeCpModelForProtobuf(model);
  const validationError = type.verify(protobufModel);
  if (validationError) {
    throw new Error(`CpSat.createModel: ${validationError}`);
  }
  const message = type.create(protobufModel);
  return type.encode(message).finish();
}

async function modelStats(model: Uint8Array): Promise<string> {
  const type = await resolveCpModelType();
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
  solverParametersBytes: Uint8Array | null;
  allocatedThreads: number;
  onEvent?: CpSatEventHandler;
  signal?: AbortSignal;
};

async function executeSolve(
  modelBytes: Uint8Array,
  options: CpSatExecuteOptions,
) {
  throwIfAborted(options.signal);

  const solverType = options.onEvent ? await resolveCpSolverResponseType() : undefined;
  throwIfAborted(options.signal);

  const executor = cpSatExecutor;
  let callbackError: unknown = null;
  let abortError: unknown = null;
  const onEvent: CpSatExecutorEventHandler = async (event) => {
    if (callbackError) return;
    const mappedEvent = mapBridgeSolveEvent(solverType, event);
    if (!mappedEvent) return;
    try {
      await options.onEvent?.(mappedEvent);
    } catch (error) {
      callbackError = error;
    }
  };
  const job = executor.execute({
    case: 'solve',
    value: create(CpSatSolveRequestSchema, {
      cpModelProto: modelBytes,
      satParametersProto: options.solverParametersBytes ?? new Uint8Array(),
      callbackMask: createCpSatCallbackMask(
        Boolean(options.onEvent),
        Boolean(options.onEvent),
        Boolean(options.onEvent),
      ),
      allocatedThreads: options.allocatedThreads,
    }),
  }, onEvent);
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
    throwIfBridgeFailure(response);
    if (response.payload.case !== 'solveResult') {
      throw new Error('CP-SAT executor returned the wrong solve payload.');
    }
    return {
      bytes: new Uint8Array(response.payload.value.cpSolverResponseProto),
      solverType,
    };
  } finally {
    options.signal?.removeEventListener('abort', abortSolve);
  }
}

async function solveRaw(
  modelBytes: Uint8Array,
  options: CpSatRawSolveOptions = {},
) {
  const result = await executeSolve(modelBytes, {
    solverParametersBytes: options.solverParameters ?? null,
    allocatedThreads: 0,
    onEvent: options.onEvent,
    signal: options.signal,
  });
  return result.bytes;
}

function resolveAllocatedThreads(params?: CpSatSolverParameters): number {
  if (!params || params instanceof Uint8Array) {
    return 0;
  }
  return Number(params.numWorkers ?? params.numSearchWorkers ?? 0);
}

async function solve(
  modelBytes: Uint8Array,
  options: CpSatSolveOptions = {},
): Promise<CpSatSolveResult> {
  const allocatedThreads = resolveAllocatedThreads(options.solverParameters);
  const paramsBytes = await resolveParamsBytes(options.solverParameters);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { bytes, solverType } = await executeSolve(modelBytes, {
    solverParametersBytes: paramsBytes,
    onEvent: options.onEvent,
    allocatedThreads,
    signal: options.signal,
  });
  const elapsedSeconds = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) / 1000;
  let response: CpSolverResponse | null = null;
  if (bytes.length > 0) {
    response = solverType ? toCpSolverResponse(solverType, bytes) : await decodeSolverResponse(bytes);
    if ((response.wallTime ?? 0) <= 0) {
      response.wallTime = Math.max(elapsedSeconds, Number.EPSILON);
    }
  }
  return { bytes, response };
}

async function validate(model: Uint8Array) {
  const executor = cpSatExecutor;
  const job = executor.execute({
    case: 'validate',
    value: create(CpSatValidateRequestSchema, { cpModelProto: model }),
  }, ignoreCpSatProgress);
  const response = await job.result;
  throwIfBridgeFailure(response);
  if (response.payload.case !== 'validateResult') {
    throw new Error('CP-SAT executor returned the wrong validate payload.');
  }
  return {
    ok: response.payload.value.ok,
    message: response.payload.value.message,
  };
}

export const CpSat: CpSatApi = {
  solve: (model, options = {}) => solve(model, options),
  solveRaw: (model, options = {}) => solveRaw(model, options),
  validate,
  modelStats,
  getSchemas,
  createModel,
  loadModule,
  setExecutor: (executor) => setCpSatExecutor(executor),
};

if (isBrowserMainThread) {
  (window as Window & { CpSat?: CpSatApi }).CpSat = CpSat;
}

export default CpSat;
