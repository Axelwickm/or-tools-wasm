/// <reference lib="webworker" />

import type { OrToolsWasmModule } from './wasm_module_types.js';
import {
  loadGraphRuntime,
  loadMathOptRuntime,
  loadMPSolverRuntime,
  loadPdlpRuntime,
  loadRuntime,
  loadSetCoverRuntime,
} from './runtime_loader.js';
import { solveRoutingInWorker } from './worker_routing.js';
import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

Object.assign(globalThis, { __ORTOOLS_WASM_BRIDGE_WORKER: true });

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
    return await module.ccall(
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
      { async: true },
    ) as string;
  } finally {
    if (profitsPtr) module._free(profitsPtr);
    if (weightsPtr) module._free(weightsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
    module._free(namePtr);
  }
}

async function solveGraphInWorker(message: Extract<WorkerRequest, { type: 'graphSolve' }>) {
  const module = await loadGraphRuntime();
  if (message.algorithm === 'maxFlow') {
    const tailsPtr = copyFloat64ToHeap(module, message.tails);
    const headsPtr = copyFloat64ToHeap(module, message.heads);
    const capacitiesPtr = copyFloat64ToHeap(module, message.capacities);
    try {
      return await module.ccall(
        'graph_max_flow_solve_serialized',
        'string',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [tailsPtr, headsPtr, capacitiesPtr, message.tails.length, message.source, message.sink],
        { async: true },
      ) as string;
    } finally {
      if (tailsPtr) module._free(tailsPtr);
      if (headsPtr) module._free(headsPtr);
      if (capacitiesPtr) module._free(capacitiesPtr);
    }
  }
  if (message.algorithm === 'minCostFlow') {
    const tailsPtr = copyFloat64ToHeap(module, message.tails);
    const headsPtr = copyFloat64ToHeap(module, message.heads);
    const capacitiesPtr = copyFloat64ToHeap(module, message.capacities);
    const unitCostsPtr = copyFloat64ToHeap(module, message.unitCosts);
    const suppliesPtr = copyFloat64ToHeap(module, message.supplies);
    try {
      return await module.ccall(
        'graph_min_cost_flow_solve_serialized',
        'string',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [
          tailsPtr,
          headsPtr,
          capacitiesPtr,
          unitCostsPtr,
          message.tails.length,
          suppliesPtr,
          message.supplies.length,
          message.solveMaxFlowWithMinCost ? 1 : 0,
        ],
        { async: true },
      ) as string;
    } finally {
      if (tailsPtr) module._free(tailsPtr);
      if (headsPtr) module._free(headsPtr);
      if (capacitiesPtr) module._free(capacitiesPtr);
      if (unitCostsPtr) module._free(unitCostsPtr);
      if (suppliesPtr) module._free(suppliesPtr);
    }
  }
  const leftNodesPtr = copyFloat64ToHeap(module, message.leftNodes);
  const rightNodesPtr = copyFloat64ToHeap(module, message.rightNodes);
  const costsPtr = copyFloat64ToHeap(module, message.costs);
  try {
    return await module.ccall(
      'graph_linear_sum_assignment_solve_serialized',
      'string',
      ['number', 'number', 'number', 'number'],
      [leftNodesPtr, rightNodesPtr, costsPtr, message.leftNodes.length],
      { async: true },
    ) as string;
  } finally {
    if (leftNodesPtr) module._free(leftNodesPtr);
    if (rightNodesPtr) module._free(rightNodesPtr);
    if (costsPtr) module._free(costsPtr);
  }
}

function setCoverOperationCode(operation: Extract<WorkerRequest, { type: 'setCover' }>['operation']) {
  switch (operation) {
    case 'trivial': return 0;
    case 'greedy': return 1;
    case 'elementDegree': return 2;
    case 'lazyElementDegree': return 3;
    case 'random': return 4;
    case 'steepest': return 5;
    case 'guidedLocal': return 6;
    case 'guidedTabu': return 7;
  }
}

async function solveSetCoverInWorker(message: Extract<WorkerRequest, { type: 'setCover' }>) {
  const module = await loadSetCoverRuntime();
  const costsPtr = copyFloat64ToHeap(module, message.costs);
  const startsPtr = copyFloat64ToHeap(module, message.starts);
  const elementsPtr = copyFloat64ToHeap(module, message.elements);
  const selectedPtr = copyFloat64ToHeap(module, message.selected.map((value) => value ? 1 : 0));
  const focusPtr = message.focus ? copyFloat64ToHeap(module, message.focus.map((value) => value ? 1 : 0)) : 0;
  try {
    return await module.ccall(
      'set_cover_next_solution_serialized',
      'string',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        costsPtr,
        startsPtr,
        elementsPtr,
        message.costs.length,
        message.elements.length,
        selectedPtr,
        focusPtr,
        setCoverOperationCode(message.operation),
        message.maxIterations,
      ],
      { async: true },
    ) as string;
  } finally {
    if (costsPtr) module._free(costsPtr);
    if (startsPtr) module._free(startsPtr);
    if (elementsPtr) module._free(elementsPtr);
    if (selectedPtr) module._free(selectedPtr);
    if (focusPtr) module._free(focusPtr);
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
    msgPtr = (await module.ccall(
      'validate_model',
      'number',
      ['number', 'number', 'number'],
      [modelPtr, modelBytes.length, lenPtr],
      { async: true },
    )) as number;
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

function copyResponseBytes(module: OrToolsWasmModule, responsePtr: number, lenPtr: number) {
  const responseLen = readUint32LE(module.HEAPU8.buffer, lenPtr);
  return responsePtr && responseLen
    ? module.HEAPU8.slice(responsePtr, responsePtr + responseLen)
    : new Uint8Array();
}

function freeResponseBuffer(module: OrToolsWasmModule, responsePtr: number) {
  if (responsePtr) {
    module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
  }
}

async function callSerializedBytesFunction(
  module: OrToolsWasmModule,
  requestBytes: Uint8Array,
  call: (requestPtr: number, requestLength: number, lenPtr: number) => Promise<number>,
) {
  const lenPtr = module._malloc(4);
  const requestPtr = copyBytesToHeap(module, requestBytes);
  let responsePtr = 0;
  try {
    responsePtr = await call(requestPtr, requestBytes.length, lenPtr);
    return copyResponseBytes(module, responsePtr, lenPtr);
  } finally {
    freeResponseBuffer(module, responsePtr);
    if (requestPtr) module._free(requestPtr);
    module._free(lenPtr);
  }
}

async function withHeapBytes<T>(
  module: OrToolsWasmModule,
  bytes: Uint8Array | null,
  callback: (ptr: number, length: number) => Promise<T>,
) {
  const ptr = copyBytesToHeap(module, bytes);
  try {
    return await callback(ptr, bytes?.length ?? 0);
  } finally {
    if (ptr) module._free(ptr);
  }
}

async function solveMPSolverInWorker(message: Extract<WorkerRequest, { type: 'mpSolverSolve' }>) {
  const module = await loadMPSolverRuntime();
  const numThreads = typeof message.numThreads === 'number'
    && Number.isInteger(message.numThreads)
    && message.numThreads > 1
    ? message.numThreads
    : undefined;
  if (numThreads === undefined) {
    return callSerializedBytesFunction(module, message.requestBytes, async (requestPtr, requestLength, lenPtr) => (
      await module.ccall(
        'mp_solver_solve_model_request',
        'number',
        ['number', 'number', 'number'],
        [requestPtr, requestLength, lenPtr],
        { async: true },
      ) as number
    ));
  }
  return callSerializedBytesFunction(module, message.requestBytes, async (requestPtr, requestLength, lenPtr) => (
    await module.ccall(
      'mp_solver_solve_model_request_with_threads',
      'number',
      ['number', 'number', 'number', 'number'],
      [requestPtr, requestLength, numThreads, lenPtr],
      { async: true },
    ) as number
  ));
}

async function solveMathOptInWorker(message: Extract<WorkerRequest, { type: 'mathOptSolve' }>) {
  const module = await loadMathOptRuntime();
  return callSerializedBytesFunction(module, message.requestBytes, async (requestPtr, requestLength, lenPtr) => (
    await module.ccall(
      'mathopt_solve_request',
      'number',
      ['number', 'number', 'number', 'number', 'number'],
      [
        requestPtr,
        requestLength,
        message.useInterrupter ? 1 : 0,
        message.interruptAtStart ? 1 : 0,
        lenPtr,
      ],
      { async: true },
    ) as number
  ));
}

async function createMathOptIncrementalInWorker(message: Extract<WorkerRequest, { type: 'mathOptIncrementalCreate' }>) {
  const module = await loadMathOptRuntime();
  return callSerializedBytesFunction(module, message.requestBytes, async (requestPtr, requestLength, lenPtr) => (
    await module.ccall(
      'mathopt_incremental_create',
      'number',
      ['number', 'number', 'number'],
      [requestPtr, requestLength, lenPtr],
      { async: true },
    ) as number
  ));
}

async function solveMathOptIncrementalInWorker(message: Extract<WorkerRequest, { type: 'mathOptIncrementalSolve' }>) {
  const module = await loadMathOptRuntime();
  return withHeapBytes(module, message.updateBytes ?? null, async (updatePtr, updateLength) => (
    callSerializedBytesFunction(module, message.requestBytes, async (requestPtr, requestLength, lenPtr) => (
      await module.ccall(
        'mathopt_incremental_solve',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [
          message.handle,
          requestPtr,
          requestLength,
          updatePtr,
          updateLength,
          message.updateBytes ? 1 : 0,
          message.useInterrupter ? 1 : 0,
          message.interruptAtStart ? 1 : 0,
          lenPtr,
        ],
        { async: true },
      ) as number
    ))
  ));
}

async function deleteMathOptIncrementalInWorker(message: Extract<WorkerRequest, { type: 'mathOptIncrementalDelete' }>) {
  const module = await loadMathOptRuntime();
  await module.ccall('mathopt_incremental_delete', undefined, ['number'], [message.handle], { async: true });
}

async function solvePdlpInWorker(message: Extract<WorkerRequest, { type: 'pdlp' }>) {
  const module = await loadPdlpRuntime();
  if (message.operation === 'isLinear') {
    const value = await withHeapBytes(module, message.bytes, async (requestPtr, requestLength) => (
      await module.ccall(
        'pdlp_is_linear_program',
        'number',
        ['number', 'number'],
        [requestPtr, requestLength],
        { async: true },
      ) as number
    ));
    return { bytes: new Uint8Array(), value };
  }

  const bytes = await callSerializedBytesFunction(module, message.bytes, async (requestPtr, requestLength, lenPtr) => {
    if (message.operation === 'validate') {
      return await module.ccall(
        'pdlp_validate_quadratic_program',
        'number',
        ['number', 'number', 'number'],
        [requestPtr, requestLength, lenPtr],
        { async: true },
      ) as number;
    }
    if (message.operation === 'fromMpModel') {
      return await module.ccall(
        'pdlp_qp_from_mpmodel_proto',
        'number',
        ['number', 'number', 'number', 'number', 'number'],
        [
          requestPtr,
          requestLength,
          message.relaxIntegerVariables ? 1 : 0,
          message.includeNames ? 1 : 0,
          lenPtr,
        ],
        { async: true },
      ) as number;
    }
    if (message.operation === 'toMpModel') {
      return await module.ccall(
        'pdlp_qp_to_mpmodel_proto',
        'number',
        ['number', 'number', 'number'],
        [requestPtr, requestLength, lenPtr],
        { async: true },
      ) as number;
    }
    return await module.ccall(
      'pdlp_primal_dual_hybrid_gradient',
      'number',
      ['number', 'number', 'number'],
      [requestPtr, requestLength, lenPtr],
      { async: true },
    ) as number;
  });
  return { bytes };
}

type WorkerHandler<Type extends WorkerRequest['type']> = (
  message: Extract<WorkerRequest, { type: Type }>,
) => Promise<WorkerResponse | void>;

type WorkerHandlerMap = {
  [Type in WorkerRequest['type']]: WorkerHandler<Type>;
};

const handlers = {
  validate: async (message) => {
    const validation = await validateModel(message.modelBytes);
    return {
      type: 'validateResult',
      id: message.id,
      ok: validation.ok,
      message: validation.message,
    };
  },
  solve: async (message) => {
    const bytes = await solveModel(message.modelBytes, message.paramsBytes, message.id, message.callbackFlags ?? 0);
    return {
      type: 'solveResult',
      id: message.id,
      bytes,
    };
  },
  routingSolve: async (message) => {
    const result = await solveRoutingInWorker(message);
    return {
      type: 'routingSolveResult',
      id: message.id,
      result,
    };
  },
  mpSolverSolve: async (message) => ({
    type: 'mpSolverSolveResult',
    id: message.id,
    bytes: await solveMPSolverInWorker(message),
  }),
  knapsackSolve: async (message) => ({
    type: 'knapsackSolveResult',
    id: message.id,
    result: await solveKnapsackInWorker(message),
  }),
  graphSolve: async (message) => ({
    type: 'graphSolveResult',
    id: message.id,
    result: await solveGraphInWorker(message),
  }),
  setCover: async (message) => ({
    type: 'setCoverResult',
    id: message.id,
    result: await solveSetCoverInWorker(message),
  }),
  mathOptInit: async (message) => {
    await loadMathOptRuntime();
    return {
      type: 'mathOptInitResult',
      id: message.id,
    };
  },
  mathOptSolve: async (message) => ({
    type: 'mathOptSolveResult',
    id: message.id,
    bytes: await solveMathOptInWorker(message),
  }),
  mathOptIncrementalCreate: async (message) => ({
    type: 'mathOptIncrementalResult',
    id: message.id,
    bytes: await createMathOptIncrementalInWorker(message),
  }),
  mathOptIncrementalSolve: async (message) => ({
    type: 'mathOptIncrementalResult',
    id: message.id,
    bytes: await solveMathOptIncrementalInWorker(message),
  }),
  mathOptIncrementalDelete: async (message) => {
    await deleteMathOptIncrementalInWorker(message);
    return {
      type: 'mathOptIncrementalDeleted',
      id: message.id,
    };
  },
  pdlp: async (message) => {
    const result = await solvePdlpInWorker(message);
    return {
      type: 'pdlpResult',
      id: message.id,
      bytes: result.bytes,
      value: result.value,
    };
  },
  getSchemas: async (message) => {
    if (message.schema === 'cp_sat') {
      const module = await loadCpSatModule();
      return {
        type: 'schemaResult',
        id: message.id,
        schema: 'cp_sat',
        schemas: {
          cp_model: module.ccall('get_cp_model_schema', 'string', [], []),
          sat_parameters: module.ccall('get_sat_parameters_schema', 'string', [], []),
        },
      };
    }
    if (message.schema === 'mp_solver') {
      const mpModule = await loadMPSolverRuntime();
      return {
        type: 'schemaResult',
        id: message.id,
        schema: 'mp_solver',
        schemas: {
          linear_solver: mpModule.ccall('get_linear_solver_schema', 'string', [], []),
          optional_boolean: mpModule.ccall('get_optional_boolean_schema', 'string', [], []),
        },
      };
    }
    throw new Error('Unsupported schema request.');
  },
  cancel_solve: async (message) => {
    const module = await loadCpSatModule();
    module.ccall('interrupt_solve', 'void', [], []);
    return {
      type: 'solved_cancelled',
      id: message.id,
    };
  },
} satisfies WorkerHandlerMap;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data as WorkerRequest;
  try {
    const handler = handlers[message.type] as (request: WorkerRequest) => Promise<WorkerResponse | void>;
    const response = await handler(message);
    if (response) {
      workerScope.postMessage(response);
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
