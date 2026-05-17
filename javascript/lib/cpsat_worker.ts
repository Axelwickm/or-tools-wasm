/// <reference lib="webworker" />

import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';
import { loadRuntime } from './runtime_loader.js';
import { solveRoutingInWorker } from './worker_routing.js';
import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

const workerScope = self as DedicatedWorkerGlobalScope;

const SOLUTION_CALLBACK_EVENT = 1;
const BEST_BOUND_CALLBACK_EVENT = 2;
const LOG_CALLBACK_EVENT = 3;

let moduleInstance: MainModule | null = null;

// The loader handles locateFile and mainScriptUrlOrBlob automatically now.
const moduleReady = loadRuntime()
  .then((module: MainModule) => {
    moduleInstance = module;
    workerScope.postMessage({ type: 'ready' } satisfies WorkerResponse);
    return module;
  })
  .catch((error: unknown) => {
    console.error('[cpsat_worker] cpSatModule init failed:', error);
    workerScope.postMessage({
      type: 'error',
      id: 0,
      error: String(error),
    } satisfies WorkerResponse);
    throw error;
  });

const readUint32LE = (buffer: ArrayBuffer, ptr: number) =>
  new DataView(buffer, ptr, 4).getUint32(0, true);

function readUint32FromBytes(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function postCallbackEnvelopeEvents(id: number, bytes: Uint8Array) {
  let offset = 0;
  const eventCount = readUint32FromBytes(bytes, offset);
  offset += 4;
  for (let i = 0; i < eventCount; i++) {
    const eventType = bytes[offset++];
    const payloadLength = readUint32FromBytes(bytes, offset);
    offset += 4;
    const payload = bytes.slice(offset, offset + payloadLength);
    offset += payloadLength;
    if (eventType === SOLUTION_CALLBACK_EVENT) {
      workerScope.postMessage({
        type: 'solveCallback',
        id,
        eventType: 'solution',
        bytes: payload,
      } satisfies WorkerResponse);
    } else if (eventType === BEST_BOUND_CALLBACK_EVENT) {
      workerScope.postMessage({
        type: 'solveCallback',
        id,
        eventType: 'bestBound',
        bound: new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getFloat64(0, true),
      } satisfies WorkerResponse);
    } else if (eventType === LOG_CALLBACK_EVENT) {
      workerScope.postMessage({
        type: 'solveCallback',
        id,
        eventType: 'log',
        message: new TextDecoder().decode(payload),
      } satisfies WorkerResponse);
    }
  }
  const responseLength = readUint32FromBytes(bytes, offset);
  offset += 4;
  return bytes.slice(offset, offset + responseLength);
}

const copyBytesToHeap = (bytes: Uint8Array | null) => {
  if (!moduleInstance || !bytes?.length) {
    return 0;
  }
  const ptr = moduleInstance._malloc(bytes.length);
  moduleInstance.HEAPU8.set(bytes, ptr);
  return ptr;
};

async function solveModel(modelBytes: Uint8Array, paramsBytes?: Uint8Array, requestId = 0, callbackFlags = 0) {
  if (!moduleInstance) {
    throw new Error('Module not initialized.');
  }
  const lenPtr = moduleInstance._malloc(4);
  const modelPtr = copyBytesToHeap(modelBytes);
  const paramsPtr = copyBytesToHeap(paramsBytes ?? null);
  let responsePtr = 0;

  try {
    if (callbackFlags) {
      responsePtr = moduleInstance.ccall(
        'solve_model_with_callback_events',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [
          modelPtr,
          modelBytes.length,
          paramsPtr,
          paramsBytes ? paramsBytes.length : 0,
          callbackFlags,
          lenPtr,
        ],
      ) as number;
    } else {
      responsePtr = (await moduleInstance.ccall(
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
    if (modelPtr) moduleInstance._free(modelPtr);
    if (paramsPtr) moduleInstance._free(paramsPtr);
  }

  const len = readUint32LE(moduleInstance.HEAPU8.buffer, lenPtr);
  moduleInstance._free(lenPtr);

  if (!responsePtr || len === 0) {
    if (responsePtr) moduleInstance._free_buffer(responsePtr);
    return new Uint8Array();
  }

  const bytes = moduleInstance.HEAPU8.slice(responsePtr, responsePtr + len);
  moduleInstance._free_buffer(responsePtr);
  if (callbackFlags) {
    return postCallbackEnvelopeEvents(requestId, bytes);
  }
  return bytes;
}

async function validateModel(modelBytes: Uint8Array) {
  if (!moduleInstance) {
    throw new Error('Module not initialized.');
  }
  const lenPtr = moduleInstance._malloc(4);
  const modelPtr = copyBytesToHeap(modelBytes);
  let msgPtr = 0;

  try {
    msgPtr = moduleInstance.ccall(
      'validate_model',
      'number',
      ['number', 'number', 'number'],
      [modelPtr, modelBytes.length, lenPtr],
    ) as number;
  } finally {
    if (modelPtr) moduleInstance._free(modelPtr);
  }

  const len = readUint32LE(moduleInstance.HEAPU8.buffer, lenPtr);
  moduleInstance._free(lenPtr);

  if (!msgPtr || len === 0) {
    if (msgPtr) moduleInstance._free_buffer(msgPtr);
    return { ok: true, message: '' };
  }

  const messageBytes = moduleInstance.HEAPU8.slice(msgPtr, msgPtr + len);
  moduleInstance._free_buffer(msgPtr);
  const message = new TextDecoder().decode(messageBytes);
  return { ok: false, message };
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data as WorkerRequest;
  try {
    await moduleReady;
    if (!moduleInstance) {
      throw new Error('Module not initialized.');
    }

    if (message.type === 'validate') {
      const validation = await validateModel(message.modelBytes);
      workerScope.postMessage({
        type: 'validateResult',
        id: message.id,
        ok: validation.ok,
        message: validation.message,
      } satisfies WorkerResponse);
      return;
    } else if (message.type === 'solve') {
      const bytes = await solveModel(message.modelBytes, message.paramsBytes, message.id, message.callbackFlags ?? 0);
      workerScope.postMessage({
        type: 'solveResult',
        id: message.id,
        bytes,
      } satisfies WorkerResponse);
      return;
    } else if (message.type === 'routingSolve') {
      const result = await solveRoutingInWorker(moduleInstance, message);
      workerScope.postMessage({
        type: 'routingSolveResult',
        id: message.id,
        result,
      } satisfies WorkerResponse);
      return;
    } else if (message.type === 'mpSolverSolve') {
      const lenPtr = moduleInstance._malloc(4);
      const requestPtr = copyBytesToHeap(message.requestBytes);
      let responsePtr = 0;
      try {
        responsePtr = moduleInstance.ccall(
          'mp_solver_solve_model_request',
          'number',
          ['number', 'number', 'number'],
          [requestPtr, message.requestBytes.length, lenPtr],
        ) as number;
        const responseLen = readUint32LE(moduleInstance.HEAPU8.buffer, lenPtr);
        const bytes = responsePtr && responseLen
          ? moduleInstance.HEAPU8.slice(responsePtr, responsePtr + responseLen)
          : new Uint8Array();
        workerScope.postMessage({
          type: 'mpSolverSolveResult',
          id: message.id,
          bytes,
        } satisfies WorkerResponse);
      } finally {
        if (responsePtr) {
          moduleInstance.ccall('free_buffer', undefined, ['number'], [responsePtr]);
        }
        if (requestPtr) moduleInstance._free(requestPtr);
        moduleInstance._free(lenPtr);
      }
      return;
    } else if (message.type === "getSchemas") {
      const schemas = {
        cp_model: moduleInstance.ccall('get_cp_model_schema', 'string', [], []),
        sat_parameters: moduleInstance.ccall('get_sat_parameters_schema', 'string', [], []),
        linear_solver: moduleInstance.ccall('get_linear_solver_schema', 'string', [], []),
        optional_boolean: moduleInstance.ccall('get_optional_boolean_schema', 'string', [], []),
      };
      self.postMessage({ type: 'schemaResult', id: message.id, schemas });
      return
    } else if (message.type === "cancel_solve") {
      moduleInstance.ccall('interrupt_solve', 'void', [], []);
      self.postMessage({ type: 'solved_cancelled', id: message.id });
      return
    }
  } catch (error) {
    console.error('[cpsat_worker] request failed', message?.type, error);
    workerScope.postMessage({
      type: 'error',
      id: message?.id ?? 0,
      error: String(error),
    } satisfies WorkerResponse);
  }
};
