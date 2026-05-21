/// <reference lib="webworker" />

import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadMathOptRuntime, loadMPSolverRuntime, loadPdlpRuntime, loadRuntime } from './runtime_loader.js';
import { solveRoutingInWorker } from './worker_routing.js';
import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

const workerScope = self as DedicatedWorkerGlobalScope;

const SOLUTION_CALLBACK_EVENT = 1;
const BEST_BOUND_CALLBACK_EVENT = 2;
const LOG_CALLBACK_EVENT = 3;

let moduleInstance: OrToolsWasmModule | null = null;

workerScope.postMessage({ type: 'ready' } satisfies WorkerResponse);

async function loadCpSatModule() {
  moduleInstance ??= await loadRuntime();
  return moduleInstance;
}

const readUint32LE = (buffer: ArrayBufferLike, ptr: number) =>
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

const copyBytesToHeap = (module: OrToolsWasmModule, bytes: Uint8Array | null) => {
  if (!bytes?.length) {
    return 0;
  }
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
};

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  const view = new Float64Array(module.HEAPU8.buffer, ptr, values.length);
  view.set(values);
  return ptr;
}

function flattenWeights(weights: number[][], itemCount: number) {
  const flattened: number[] = [];
  for (const dimension of weights) {
    if (dimension.length !== itemCount) {
      throw new Error('KnapsackSolver: each weight dimension must match profits length.');
    }
    flattened.push(...dimension);
  }
  return flattened;
}

async function solveKnapsackInWorker(message: Extract<WorkerRequest, { type: 'knapsackSolve' }>) {
  const module = await loadMPSolverRuntime();
  const profitsPtr = copyFloat64ToHeap(module, message.profits);
  const weightsPtr = copyFloat64ToHeap(module, flattenWeights(message.weights, message.profits.length));
  const capacitiesPtr = copyFloat64ToHeap(module, message.capacities);
  const namePtr = module.allocateUTF8(message.name);
  try {
    return module.ccall(
      'knapsack_solve_serialized',
      'string',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        message.solverType,
        namePtr,
        message.useReduction ? 1 : 0,
        message.timeLimitSeconds,
        profitsPtr,
        message.profits.length,
        weightsPtr,
        message.weights.length,
        capacitiesPtr,
      ],
    ) as string;
  } finally {
    if (profitsPtr) module._free(profitsPtr);
    if (weightsPtr) module._free(weightsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
    module._free(namePtr);
  }
}

async function solveModel(modelBytes: Uint8Array, paramsBytes?: Uint8Array, requestId = 0, callbackFlags = 0) {
  const module = await loadCpSatModule();
  const lenPtr = module._malloc(4);
  const modelPtr = copyBytesToHeap(module, modelBytes);
  const paramsPtr = copyBytesToHeap(module, paramsBytes ?? null);
  let responsePtr = 0;

  try {
    if (callbackFlags) {
      responsePtr = (await module.ccall(
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
        { async: true },
      )) as number;
    } else {
      responsePtr = (await module.ccall(
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
    if (modelPtr) module._free(modelPtr);
    if (paramsPtr) module._free(paramsPtr);
  }

  const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
  module._free(lenPtr);

  if (!responsePtr || len === 0) {
    if (responsePtr) module._free_buffer(responsePtr);
    return new Uint8Array();
  }

  const bytes = module.HEAPU8.slice(responsePtr, responsePtr + len);
  module._free_buffer(responsePtr);
  if (callbackFlags) {
    return postCallbackEnvelopeEvents(requestId, bytes);
  }
  return bytes;
}

async function validateModel(modelBytes: Uint8Array) {
  const module = await loadCpSatModule();
  const lenPtr = module._malloc(4);
  const modelPtr = copyBytesToHeap(module, modelBytes);
  let msgPtr = 0;

  try {
    msgPtr = module.ccall(
      'validate_model',
      'number',
      ['number', 'number', 'number'],
      [modelPtr, modelBytes.length, lenPtr],
    ) as number;
  } finally {
    if (modelPtr) module._free(modelPtr);
  }

  const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
  module._free(lenPtr);

  if (!msgPtr || len === 0) {
    if (msgPtr) module._free_buffer(msgPtr);
    return { ok: true, message: '' };
  }

  const messageBytes = module.HEAPU8.slice(msgPtr, msgPtr + len);
  module._free_buffer(msgPtr);
  const message = new TextDecoder().decode(messageBytes);
  return { ok: false, message };
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data as WorkerRequest;
  try {
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
      const result = await solveRoutingInWorker(message);
      workerScope.postMessage({
        type: 'routingSolveResult',
        id: message.id,
        result,
      } satisfies WorkerResponse);
      return;
    } else if (message.type === 'mpSolverSolve') {
      const module = await loadMPSolverRuntime();
      const lenPtr = module._malloc(4);
      const requestPtr = copyBytesToHeap(module, message.requestBytes);
      let responsePtr = 0;
      try {
        responsePtr = (await module.ccall(
          'mp_solver_solve_model_request',
          'number',
          ['number', 'number', 'number'],
          [requestPtr, message.requestBytes.length, lenPtr],
          { async: true },
        )) as number;
        const responseLen = readUint32LE(module.HEAPU8.buffer, lenPtr);
        const bytes = responsePtr && responseLen
          ? module.HEAPU8.slice(responsePtr, responsePtr + responseLen)
          : new Uint8Array();
        workerScope.postMessage({
          type: 'mpSolverSolveResult',
          id: message.id,
          bytes,
        } satisfies WorkerResponse);
      } finally {
        if (responsePtr) {
          module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
        }
        if (requestPtr) module._free(requestPtr);
        module._free(lenPtr);
      }
      return;
    } else if (message.type === 'knapsackSolve') {
      const result = await solveKnapsackInWorker(message);
      workerScope.postMessage({
        type: 'knapsackSolveResult',
        id: message.id,
        result,
      } satisfies WorkerResponse);
      return;
    } else if (message.type === 'mathOptSolve') {
      const module = await loadMathOptRuntime();
      const lenPtr = module._malloc(4);
      const requestPtr = copyBytesToHeap(module, message.requestBytes);
      let responsePtr = 0;
      try {
        responsePtr = (await module.ccall(
          'mathopt_solve_request',
          'number',
          ['number', 'number', 'number'],
          [requestPtr, message.requestBytes.length, lenPtr],
          { async: true },
        )) as number;
        const responseLen = readUint32LE(module.HEAPU8.buffer, lenPtr);
        const bytes = responsePtr && responseLen
          ? module.HEAPU8.slice(responsePtr, responsePtr + responseLen)
          : new Uint8Array();
        workerScope.postMessage({
          type: 'mathOptSolveResult',
          id: message.id,
          bytes,
        } satisfies WorkerResponse);
      } finally {
        if (responsePtr) {
          module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
        }
        if (requestPtr) module._free(requestPtr);
        module._free(lenPtr);
      }
      return;
    } else if (message.type === 'pdlp') {
      const module = await loadPdlpRuntime();
      const requestPtr = copyBytesToHeap(module, message.bytes);
      const lenPtr = module._malloc(4);
      let responsePtr = 0;
      try {
        let bytes = new Uint8Array();
        let value: number | undefined;
        if (message.operation === 'isLinear') {
          value = module.ccall(
            'pdlp_is_linear_program',
            'number',
            ['number', 'number'],
            [requestPtr, message.bytes.length],
          ) as number;
        } else {
          if (message.operation === 'validate') {
            responsePtr = module.ccall(
              'pdlp_validate_quadratic_program',
              'number',
              ['number', 'number', 'number'],
              [requestPtr, message.bytes.length, lenPtr],
            ) as number;
          } else if (message.operation === 'fromMpModel') {
            responsePtr = module.ccall(
              'pdlp_qp_from_mpmodel_proto',
              'number',
              ['number', 'number', 'number', 'number', 'number'],
              [
                requestPtr,
                message.bytes.length,
                message.relaxIntegerVariables ? 1 : 0,
                message.includeNames ? 1 : 0,
                lenPtr,
              ],
            ) as number;
          } else if (message.operation === 'toMpModel') {
            responsePtr = module.ccall(
              'pdlp_qp_to_mpmodel_proto',
              'number',
              ['number', 'number', 'number'],
              [requestPtr, message.bytes.length, lenPtr],
            ) as number;
          } else {
            responsePtr = await module.ccall(
              'pdlp_primal_dual_hybrid_gradient',
              'number',
              ['number', 'number', 'number'],
              [requestPtr, message.bytes.length, lenPtr],
              { async: true },
            ) as number;
          }
          const responseLen = readUint32LE(module.HEAPU8.buffer, lenPtr);
          bytes = responsePtr && responseLen
            ? module.HEAPU8.slice(responsePtr, responsePtr + responseLen)
            : new Uint8Array();
        }
        workerScope.postMessage({
          type: 'pdlpResult',
          id: message.id,
          bytes,
          value,
        } satisfies WorkerResponse);
      } finally {
        if (responsePtr) {
          module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
        }
        if (requestPtr) module._free(requestPtr);
        module._free(lenPtr);
      }
      return;
    } else if (message.type === "getSchemas") {
      const module = await loadCpSatModule();
      const mpModule = await loadMPSolverRuntime();
      const schemas = {
        cp_model: module.ccall('get_cp_model_schema', 'string', [], []),
        sat_parameters: module.ccall('get_sat_parameters_schema', 'string', [], []),
        linear_solver: mpModule.ccall('get_linear_solver_schema', 'string', [], []),
        optional_boolean: mpModule.ccall('get_optional_boolean_schema', 'string', [], []),
      };
      self.postMessage({ type: 'schemaResult', id: message.id, schemas });
      return
    } else if (message.type === "cancel_solve") {
      const module = await loadCpSatModule();
      module.ccall('interrupt_solve', 'void', [], []);
      self.postMessage({ type: 'solved_cancelled', id: message.id });
      return
    }
  } catch (error) {
    console.error('[ortools_worker] request failed', message?.type, error);
    workerScope.postMessage({
      type: 'error',
      id: message?.id ?? 0,
      error: String(error),
    } satisfies WorkerResponse);
  }
};
