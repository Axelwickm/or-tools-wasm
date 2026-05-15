import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';
import { loadCpSat } from './cp_sat_module_loader.js';
import type { WorkerRequest, WorkerResponse } from './cpsat_worker_types.js';
import type { CpModelProto, CpSolverResponse } from './generated/cp_model.js';
import type { SatParameters } from './generated/sat_parameters.js';
import * as protobufModule from 'protobufjs';

export {
  CpSolverStatus,
  DecisionStrategyProto_DomainReductionStrategy,
  DecisionStrategyProto_VariableSelectionStrategy,
} from './generated/cp_model.js';
export type { CpModelProto, CpSolverResponse } from './generated/cp_model.js';
export type { SatParameters } from './generated/sat_parameters.js';

type SchemaPair = {
  cp_model: string;
  sat_parameters: string;
};

export type CpSatSolveResult = {
  response: CpSolverResponse | null;
  bytes: Uint8Array;
};

export type CpSatSolveCallbacks = {
  onSolution?: (response: CpSolverResponse, bytes: Uint8Array) => void;
  onBestBound?: (bound: number) => void;
  onLog?: (message: string) => void;
};

type SolverParams = Uint8Array | SatParameters | null;

export type CpSatApi = {
  solve(model: Uint8Array, params?: SolverParams, callbacks?: CpSatSolveCallbacks): Promise<CpSatSolveResult>;
  solveRaw(model: Uint8Array, params?: Uint8Array | null): Promise<Uint8Array>;
  validate(model: Uint8Array): Promise<{ ok: boolean; message: string }>;
  getSchemas(): Promise<SchemaPair>;
  createModel(model: CpModelProto): Promise<Uint8Array>;
  loadModule(): Promise<unknown>;
  setWorkerBridgeEnabled(enabled: boolean): void;
  isWorkerBridgeEnabled(): boolean;
  cancelSolve(): Promise<void>;
};

export type CpSatModelInstance = Uint8Array;

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';
const isDenoMainThread = 'Deno' in globalThis && typeof WorkerGlobalScope === 'undefined';
const workerCapable = typeof Worker !== 'undefined';
const workerBridgeAvailable = (isBrowserMainThread || isDenoMainThread) && workerCapable;
let worker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
const pendingWorkerRequests = new Map<
  number,
  {
    resolve(value: WorkerResponse): void;
    reject(reason: unknown): void;
    onEvent?(value: WorkerResponse): void;
  }
>();
let nextWorkerRequestId = 1;

let workerBridgePreferred = workerBridgeAvailable;
let activeWorkerSolveId: number | null = null;
const SOLUTION_CALLBACK_FLAG = 1 << 0;
const BEST_BOUND_CALLBACK_FLAG = 1 << 1;
const LOG_CALLBACK_FLAG = 1 << 2;
const SOLUTION_CALLBACK_EVENT = 1;
const BEST_BOUND_CALLBACK_EVENT = 2;
const LOG_CALLBACK_EVENT = 3;

type NativeCallbackEvent =
  | { eventType: 'solution'; bytes: Uint8Array }
  | { eventType: 'bestBound'; bound: number }
  | { eventType: 'log'; message: string };

function shouldUseWorkerBridge() {
  return workerBridgePreferred && workerBridgeAvailable;
}

function callbackFlags(callbacks?: CpSatSolveCallbacks) {
  let flags = 0;
  if (callbacks?.onSolution) flags |= SOLUTION_CALLBACK_FLAG;
  if (callbacks?.onBestBound) flags |= BEST_BOUND_CALLBACK_FLAG;
  if (callbacks?.onLog) flags |= LOG_CALLBACK_FLAG;
  return flags;
}

function setWorkerBridgePreferred(enabled: boolean) {
  workerBridgePreferred = Boolean(enabled);
  if (workerBridgePreferred && !workerBridgeAvailable) {
    console.warn('Worker bridge requested but no worker is initialized in this environment.');
  }
}


function terminateWorker(reason?: string) {
  if (!worker) return;
  worker.terminate();
  worker = null;
  workerReadyPromise = null;
  const error = new Error(reason ?? 'CP-SAT worker terminated.');
  for (const pending of pendingWorkerRequests.values()) {
    pending.reject(error);
  }
  pendingWorkerRequests.clear();
}

function ensureWorker(): Worker {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  if (worker) {
    return worker;
  }
  const workerUrl = new URL('./cpsat_worker.js', import.meta.url);
  const instance = new Worker(new URL('./cpsat_worker.js', import.meta.url), { type: 'module' });
  worker = instance;
  workerReadyPromise = new Promise<void>((resolve, reject) => {
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        resolve();
        return;
      }
      const pending = pendingWorkerRequests.get(message.id);
      if (message.type === 'solveCallback') {
        pending?.onEvent?.(message);
        return;
      }
      if (message.type === 'error') {
        const error = new Error(message.error);
        if (pending) {
          pending.reject(error);
          pendingWorkerRequests.delete(message.id);
        } else {
          reject(error);
        }
        return;
      }
      if (pending) {
        pendingWorkerRequests.delete(message.id);
        pending.resolve(message);
      }
    };
    instance.onerror = (event: ErrorEvent) => {
      const detail = event.error instanceof Error
        ? event.error.message
        : event.message || 'The browser blocked or failed to load the worker module.';
      const error = new Error(`CP-SAT worker failed to load from ${workerUrl.href}: ${detail}`);
      reject(error);
      terminateWorker(error.message);
    };
  });
  return instance;
}

async function waitForWorkerReady() {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  ensureWorker();
  if (!workerReadyPromise) {
    throw new Error('Worker ready state unavailable.');
  }
  await workerReadyPromise;
}

async function postWorkerRequest<T extends WorkerResponse>(
  request: WorkerRequest,
  onEvent?: (value: WorkerResponse) => void,
): Promise<T> {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  const workerInstance = ensureWorker();
  await waitForWorkerReady();
  return new Promise<T>((resolve, reject) => {
    pendingWorkerRequests.set(request.id, {
      resolve: (value: WorkerResponse) => resolve(value as T),
      reject,
      onEvent,
    });
    workerInstance.postMessage(request);
  });
}


let modulePromise: Promise<MainModule> | null = null;

function loadModule() {
  if (shouldUseWorkerBridge()) {
    throw new Error("Wasm should not be loaded on main thread when Worker Bridge is enabled");
  }
  if (!modulePromise) {
    modulePromise = loadCpSat();
  }
  return modulePromise;
}


let schemaPromise: Promise<SchemaPair> | null = null;

function getSchemas() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      if (shouldUseWorkerBridge()) {
        const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'schemaResult' }>>({
          type: 'getSchemas',
          id: nextWorkerRequestId++,
        });
        return response.schemas;
      }

      const Module = await loadModule();
      return {
        cp_model: Module.ccall('get_cp_model_schema', 'string', [], []),
        sat_parameters: Module.ccall('get_sat_parameters_schema', 'string', [], []),
      };
    })();
  }
  return schemaPromise;
}

type ProtobufRoot = import('protobufjs').Root;
type CpModelType = import('protobufjs').Type;
type CpSolverResponseType = import('protobufjs').Type;

let protobufRootPromise: Promise<ProtobufRoot> | null = null;
let cpModelTypePromise: Promise<CpModelType> | null = null;
let cpSolverResponseTypePromise: Promise<CpSolverResponseType> | null = null;
let satParametersTypePromise: Promise<import('protobufjs').Type> | null = null;

async function resolveProtobufRoot(feature: string): Promise<ProtobufRoot> {
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
      const root = await resolveProtobufRoot('createModel');
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
      const root = await resolveProtobufRoot('solve');
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

async function encodeSatParameters(params: SatParameters): Promise<Uint8Array> {
  const paramsType = await resolveSatParametersType();
  const validationError = paramsType.verify(params);
  if (validationError) {
    throw new Error(`CpSat.solve: ${validationError}`);
  }
  const message = paramsType.create(params);
  return paramsType.encode(message).finish();
}

async function resolveParamsBytes(params?: SolverParams): Promise<Uint8Array | null> {
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

function dispatchSolveCallback(
  callbacks: CpSatSolveCallbacks | undefined,
  solverType: CpSolverResponseType,
  event: NativeCallbackEvent | Extract<WorkerResponse, { type: 'solveCallback' }>,
) {
  if (event.eventType === 'solution') {
    const bytes = new Uint8Array(event.bytes);
    callbacks?.onSolution?.(toCpSolverResponse(solverType, bytes), bytes);
  } else if (event.eventType === 'bestBound') {
    callbacks?.onBestBound?.(event.bound);
  } else if (event.eventType === 'log') {
    callbacks?.onLog?.(event.message);
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

const readUint32LE = (buffer: ArrayBuffer, ptr: number) =>
  new DataView(buffer, ptr, 4).getUint32(0, true);

function readUint32FromBytes(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function parseCallbackEnvelope(bytes: Uint8Array) {
  let offset = 0;
  const events: NativeCallbackEvent[] = [];
  const eventCount = readUint32FromBytes(bytes, offset);
  offset += 4;
  for (let i = 0; i < eventCount; i++) {
    const eventType = bytes[offset++];
    const payloadLength = readUint32FromBytes(bytes, offset);
    offset += 4;
    const payload = bytes.slice(offset, offset + payloadLength);
    offset += payloadLength;
    if (eventType === SOLUTION_CALLBACK_EVENT) {
      events.push({ eventType: 'solution', bytes: payload });
    } else if (eventType === BEST_BOUND_CALLBACK_EVENT) {
      events.push({
        eventType: 'bestBound',
        bound: new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getFloat64(0, true),
      });
    } else if (eventType === LOG_CALLBACK_EVENT) {
      events.push({ eventType: 'log', message: new TextDecoder().decode(payload) });
    }
  }
  const responseLength = readUint32FromBytes(bytes, offset);
  offset += 4;
  return { events, responseBytes: bytes.slice(offset, offset + responseLength) };
}

function copyBytesToHeap(Module: MainModule, bytes: Uint8Array | null) {
  if (!bytes || !bytes.length) {
    return 0;
  }
  const ptr = Module._malloc(bytes.length);
  Module.HEAPU8.set(bytes, ptr);
  return ptr;
}

type WorkerSolveResponse = Extract<WorkerResponse, { type: 'solveResult' }>;
type WorkerValidateResponse = Extract<WorkerResponse, { type: 'validateResult' }>;

async function solveRawViaWorker(
  modelBytes: Uint8Array,
  paramsBytes: Uint8Array | null = null,
  callbacks?: CpSatSolveCallbacks,
  solverType?: CpSolverResponseType,
) {
  const id = nextWorkerRequestId++;
  activeWorkerSolveId = id;
  try {
    const response = await postWorkerRequest<WorkerSolveResponse>(
      {
        type: 'solve',
        id,
        modelBytes,
        paramsBytes: paramsBytes ?? undefined,
        callbackFlags: callbackFlags(callbacks),
      },
      (event) => {
        if (event.type === 'solveCallback' && solverType) {
          dispatchSolveCallback(callbacks, solverType, event);
        }
      },
    );
    const bytes = new Uint8Array(response.bytes);
    return bytes;
  } finally {
    if (activeWorkerSolveId === id) {
      activeWorkerSolveId = null;
    }
  }
}

async function validateViaWorker(modelBytes: Uint8Array) {
  const id = nextWorkerRequestId++;
  const response = await postWorkerRequest<WorkerValidateResponse>({
    type: 'validate',
    id,
    modelBytes,
  });
  return { ok: response.ok, message: response.message };
}

async function solveRawDirect(
  modelBytes: Uint8Array,
  paramsBytes: Uint8Array | null = null,
  callbacks?: CpSatSolveCallbacks,
  solverType?: CpSolverResponseType,
) {
  const Module = await loadModule();

  const lenPtr = Module._malloc(4);
  const modelPtr = copyBytesToHeap(Module, modelBytes);
  const paramsPtr = copyBytesToHeap(Module, paramsBytes);
  let responsePtr = 0;
  const flags = callbackFlags(callbacks);
  const useCallbackEnvelope = flags !== 0 && solverType !== undefined;

  try {
    if (useCallbackEnvelope) {
      responsePtr = Module.ccall(
        'solve_model_with_callback_events',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [
          modelPtr,
          modelBytes.length,
          paramsPtr,
          paramsBytes ? paramsBytes.length : 0,
          flags,
          lenPtr,
        ],
      ) as number;
    } else {
      responsePtr = (await Module.ccall(
        'solve_model',
        'number',
        ['number', 'number', 'number', 'number', 'number'],
        [
          modelPtr,
          modelBytes.length,
          paramsPtr,
          paramsBytes ? paramsBytes.length : 0,
          lenPtr,
        ],
        { async: true },
      )) as number;
    }
  } finally {
    if (modelPtr) Module._free(modelPtr);
    if (paramsPtr) Module._free(paramsPtr);
  }

  const len = readUint32LE(Module.HEAPU8.buffer, lenPtr);
  Module._free(lenPtr);

  let bytes = new Uint8Array();
  if (responsePtr && len) {
    bytes = Module.HEAPU8.slice(responsePtr, responsePtr + len);
    Module._free_buffer(responsePtr);
  } else if (responsePtr) {
    Module._free_buffer(responsePtr);
  }

  if (useCallbackEnvelope && solverType) {
    const { events, responseBytes } = parseCallbackEnvelope(bytes);
    for (const event of events) {
      dispatchSolveCallback(callbacks, solverType, event);
    }
    return responseBytes;
  }

  return new Uint8Array(bytes);
}

async function solveRaw(
  modelBytes: Uint8Array,
  paramsBytes: Uint8Array | null = null,
  callbacks?: CpSatSolveCallbacks,
  solverType?: CpSolverResponseType,
) {
  return shouldUseWorkerBridge()
    ? solveRawViaWorker(modelBytes, paramsBytes, callbacks, solverType)
    : solveRawDirect(modelBytes, paramsBytes, callbacks, solverType);
}

async function solve(
  modelBytes: Uint8Array,
  params: SolverParams = null,
  callbacks?: CpSatSolveCallbacks,
): Promise<CpSatSolveResult> {
  const paramsBytes = await resolveParamsBytes(params);
  const solverType = callbacks && callbackFlags(callbacks) ? await resolveCpSolverResponseType() : undefined;
  const bytes = await solveRaw(modelBytes, paramsBytes, callbacks, solverType);
  let response: CpSolverResponse | null = null;
  if (bytes.length > 0) {
    response = solverType ? toCpSolverResponse(solverType, bytes) : await decodeSolverResponse(bytes);
  }
  return { bytes, response };
}

async function validateDirect(model: Uint8Array) {
  const Module = await loadModule();
  const lenPtr = Module._malloc(4);
  const modelPtr = copyBytesToHeap(Module, model);
  let msgPtr = 0;

  try {
    msgPtr = Module.ccall(
      'validate_model',
      'number',
      ['number', 'number', 'number'],
      [modelPtr, model.length, lenPtr],
    ) as number;
  } finally {
    if (modelPtr) Module._free(modelPtr);
  }

  const len = readUint32LE(Module.HEAPU8.buffer, lenPtr);
  Module._free(lenPtr);

  if (!msgPtr || len === 0) {
    if (msgPtr) Module._free_buffer(msgPtr);
    return { ok: true, message: '' };
  }

  const messageBytes = Module.HEAPU8.slice(msgPtr, msgPtr + len);
  Module._free_buffer(msgPtr);
  const message = new TextDecoder().decode(messageBytes);
  return { ok: false, message };
}

async function cancelSolve() {
  if (shouldUseWorkerBridge()) {
    if (worker && activeWorkerSolveId !== null) {
      // await postWorkerRequest<WorkerSolveResponse>({
      //   type: 'cancel_solve',
      // });
      terminateWorker('Solve canceled by user.');
      activeWorkerSolveId = null;
    }
  } else {
    const Module = await loadModule();
    Module.ccall('interrupt_solve', 'void', [], []);
  }
}

export const CpSat: CpSatApi = {
  solve: (model, params = null, callbacks) => solve(model, params, callbacks),
  solveRaw: (model, params = null) => solveRaw(model, params),
  validate: (model) => (shouldUseWorkerBridge() ? validateViaWorker(model) : validateDirect(model)),
  getSchemas,
  createModel,
  loadModule,
  cancelSolve,
  setWorkerBridgeEnabled: (enabled: boolean) => setWorkerBridgePreferred(enabled),
  isWorkerBridgeEnabled: () => shouldUseWorkerBridge(),
};

if (isBrowserMainThread) {
  (window as Window & { CpSat?: CpSatApi }).CpSat = CpSat;
}

export default CpSat;
