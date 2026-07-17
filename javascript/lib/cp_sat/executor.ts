import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadRuntime } from '../runtime_loader.js';
import { encodeSolverBridgeRequest } from '../solver_bridge.js';
import type {
  SolverExecutionOptions,
  SolverExecutor,
  SolverJob,
  SolverJobEvent,
} from '../solver_executor.js';
import {
  CpSatBridgeResponseSchema,
  CpSatBridgeRequestSchema,
  CpSatCallbackMaskSchema,
  CpSatSolveEventSchema,
  CpSatSolveResultSchema,
  CpSatValidateResultSchema,
  CpSatSchemaResultSchema,
  type CpSatCallbackMask,
  type CpSatSolveEvent,
  type CpSatSolveRequest,
  type CpSatValidateRequest,
  type CpSatBridgeRequest,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import {
  SolverFailureKind,
  SolverJobFailureSchema,
  SolverJobState,
  SolverJobStatusSchema,
  type SolverBridgeResponse,
} from '../generated/bridge/job_pb.js';

const SOLUTION_CALLBACK_FLAG = 1 << 0;
const BEST_BOUND_CALLBACK_FLAG = 1 << 1;
const LOG_CALLBACK_FLAG = 1 << 2;
const SOLUTION_CALLBACK_EVENT = 1;
const BEST_BOUND_CALLBACK_EVENT = 2;
const LOG_CALLBACK_EVENT = 3;

export type CpSatExecutorEvent = SolverJobEvent | CpSatBridgeResponse;
export type CpSatExecutorEventHandler = (event: CpSatExecutorEvent) => void | Promise<void>;
export type CpSatExecutorRequest = CpSatBridgeRequest['payload'];
export type CpSatExecutorJob = SolverJob<CpSatBridgeResponse>;
export type CpSatExecutorLike = SolverExecutor<CpSatExecutorRequest, CpSatBridgeResponse, CpSatBridgeResponse>;
type CpSatRunResult = {
  response: CpSatBridgeResponse;
  terminalState: SolverJobState;
};

const readUint32LE = (buffer: ArrayBufferLike, ptr: number) =>
  new DataView(buffer, ptr, 4).getUint32(0, true);

function callbackFlags(mask?: CpSatCallbackMask) {
  let flags = 0;
  if (mask?.solution) flags |= SOLUTION_CALLBACK_FLAG;
  if (mask?.bestBound) flags |= BEST_BOUND_CALLBACK_FLAG;
  if (mask?.log) flags |= LOG_CALLBACK_FLAG;
  return flags;
}

type CpSatWasmCallbackRegistry = {
  nextId: number;
  sinks: Map<number, (eventType: number, payload: Uint8Array) => void>;
};

function cpSatWasmCallbacks(module: OrToolsWasmModule): CpSatWasmCallbackRegistry {
  return module.__ortoolsCpSatCallbacks ??= {
    nextId: 1,
    sinks: new Map(),
  };
}

function cpSatCallbackEvent(eventType: number, payload: Uint8Array): CpSatBridgeResponse | null {
  let eventPayload: CpSatSolveEvent['payload'];
  if (eventType === SOLUTION_CALLBACK_EVENT) {
    eventPayload = { case: 'solutionProto', value: payload };
  } else if (eventType === BEST_BOUND_CALLBACK_EVENT) {
    eventPayload = {
      case: 'bestBound',
      value: new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getFloat64(0, true),
    };
  } else if (eventType === LOG_CALLBACK_EVENT) {
    eventPayload = { case: 'log', value: new TextDecoder().decode(payload) };
  } else {
    return null;
  }

  return create(CpSatBridgeResponseSchema, {
    payload: {
      case: 'solveEvent',
      value: create(CpSatSolveEventSchema, { payload: eventPayload }),
    },
  });
}

function copyBytesToHeap(module: OrToolsWasmModule, bytes: Uint8Array | null | undefined) {
  if (!bytes?.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

function nowMs() {
  return BigInt(Date.now());
}

export function createCpSatJobStatusEvent(
  requestId: number,
  state: SolverJobState,
  createdAtMs: bigint,
  startedAtMs: bigint = 0n,
  allocatedThreads = 0,
  queuePosition = 0,
): SolverJobEvent {
  return {
    type: 'status',
    status: create(SolverJobStatusSchema, {
      requestId,
      solver: 'cp-sat',
      state,
      createdAtMs,
      startedAtMs,
      allocatedThreads,
      queuePosition,
    }),
  };
}

export function createCpSatFailureEvent(
  requestId: number,
  message: string,
  kind: SolverFailureKind = SolverFailureKind.INTERNAL,
  trace = '',
  retryable = false,
): SolverJobEvent {
  return {
    type: 'failure',
    failure: create(SolverJobFailureSchema, {
      requestId, solver: 'cp-sat', kind, message, trace, retryable,
    }),
  };
}

export function cpSatEventFromSolverBridgeResponse(
  response: SolverBridgeResponse,
): CpSatExecutorEvent | null {
  switch (response.payload.case) {
    case 'eventPayload':
    case 'resultPayload':
      return fromBinary(CpSatBridgeResponseSchema, response.payload.value);
    case 'status':
      return { type: 'status', status: response.payload.value };
    case 'failure':
      return { type: 'failure', failure: response.payload.value };
    default:
      return null;
  }
}

export function encodeCpSatSolverBridgeRequest(
  requestId: number,
  request: CpSatBridgeRequest,
  requestedThreads = 0,
): Uint8Array {
  return encodeSolverBridgeRequest({
    requestId,
    solver: 'cp-sat',
    payload: toBinary(CpSatBridgeRequestSchema, request),
    requestedThreads,
  });
}

export class CpSatExecutor implements CpSatExecutorLike {
  readonly solver = 'cp-sat';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private readonly cancelledRequests = new Set<number>();

  constructor(private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadRuntime) {}

  async load(): Promise<void> {
    await this.loadModule();
  }

  loadModule() {
    this.modulePromise ??= this.loadModuleImpl();
    return this.modulePromise;
  }

  execute(
    payload: CpSatExecutorRequest,
    options: SolverExecutionOptions<CpSatBridgeResponse>,
  ): CpSatExecutorJob {
    const requestId = this.nextCpSatRequestId();
    return {
      requestId,
      result: this.run(requestId, payload, options.onEvent, options.requestedThreads ?? 0),
      cancel: () => this.cancel(requestId, options.onEvent),
    };
  }

  private async run(
    requestId: number,
    payload: CpSatExecutorRequest,
    onEvent: CpSatExecutorEventHandler,
    requestedThreads: number,
  ): Promise<CpSatBridgeResponse> {
    const createdAtMs = nowMs();
    try {
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        SolverJobState.STARTING,
        createdAtMs,
      ));
      let result: CpSatRunResult;
      switch (payload.case) {
        case 'solve':
          result = {
            response: await this.solve(requestId, payload.value, createdAtMs, onEvent, requestedThreads),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'validate':
          result = {
            response: await this.validate(requestId, payload.value, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'schema':
          result = {
            response: await this.getSchemas(requestId, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        default:
          throw new Error('CP-SAT bridge request has no payload.');
      }
      const terminalState = this.cancelledRequests.has(requestId)
        ? SolverJobState.CANCELLED
        : result.terminalState;
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        terminalState,
        createdAtMs,
      ));
      return result.response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureEvent(requestId, message, SolverFailureKind.INTERNAL, trace);
      await onEvent(failure);
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      throw error;
    } finally {
      this.cancelledRequests.delete(requestId);
    }
  }

  private async cancel(
    requestId: number,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<void> {
    this.cancelledRequests.add(requestId);
    await onEvent(createCpSatJobStatusEvent(requestId, SolverJobState.CANCELLING, nowMs()));
    const module = await this.loadModule();
    module.ccall('interrupt_solve', 'void', [], []);
  }

  terminate(_reason?: string): void {}

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }

  private async solve(
    requestId: number,
    solveRequest: CpSatSolveRequest,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
    requestedThreads: number,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
      requestedThreads,
    ));
    const modelBytes = solveRequest.cpModelProto;
    const paramsBytes = solveRequest.satParametersProto;
    const flags = callbackFlags(solveRequest.callbackMask);
    const lenPtr = module._malloc(4);
    const modelPtr = copyBytesToHeap(module, modelBytes);
    const paramsPtr = copyBytesToHeap(module, paramsBytes);
    let responsePtr = 0;
    let callbackId = 0;
    let callbackError: unknown = null;
    const pendingCallbacks: Promise<void>[] = [];

    try {
      if (flags) {
        const callbacks = cpSatWasmCallbacks(module);
        callbackId = callbacks.nextId++;
        callbacks.sinks.set(callbackId, (eventType, payload) => {
          const event = cpSatCallbackEvent(eventType, payload);
          if (!event || callbackError) return;
          try {
            const pending = onEvent(event);
            if (pending) {
              pendingCallbacks.push(Promise.resolve(pending).catch((error) => {
                callbackError ??= error;
              }));
            }
          } catch (error) {
            callbackError ??= error;
          }
        });
        responsePtr = await module.ccall(
          'solve_model_with_callback_events',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, flags, callbackId, lenPtr],
          { async: true },
        ) as number;
      } else {
        responsePtr = await module.ccall(
          'solve_model',
          'number',
          ['number', 'number', 'number', 'number', 'number'],
          [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, lenPtr],
          { async: true },
        ) as number;
      }

      const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
      const bytes = responsePtr && len
        ? module.HEAPU8.slice(responsePtr, responsePtr + len)
        : new Uint8Array();
      await Promise.all(pendingCallbacks);
      if (callbackError) throw callbackError;
      return create(CpSatBridgeResponseSchema, {
        payload: {
          case: 'solveResult',
          value: create(CpSatSolveResultSchema, {
            cpSolverResponseProto: bytes,
          }),
        },
      });
    } finally {
      if (callbackId) cpSatWasmCallbacks(module).sinks.delete(callbackId);
      if (modelPtr) module._free(modelPtr);
      if (paramsPtr) module._free(paramsPtr);
      if (lenPtr) module._free(lenPtr);
      if (responsePtr) module._free_buffer(responsePtr);
    }
  }

  private async validate(
    requestId: number,
    validateRequest: CpSatValidateRequest,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
    const modelBytes = validateRequest.cpModelProto;
    const lenPtr = module._malloc(4);
    const modelPtr = copyBytesToHeap(module, modelBytes);
    let msgPtr = 0;

    try {
      msgPtr = await module.ccall(
        'validate_model',
        'number',
        ['number', 'number', 'number'],
        [modelPtr, modelBytes.length, lenPtr],
        { async: true },
      ) as number;

      const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
      const message = msgPtr && len
        ? new TextDecoder().decode(module.HEAPU8.slice(msgPtr, msgPtr + len))
        : '';

      return create(CpSatBridgeResponseSchema, {
        payload: {
          case: 'validateResult',
          value: create(CpSatValidateResultSchema, { ok: message.length === 0, message }),
        },
      });
    } finally {
      if (modelPtr) module._free(modelPtr);
      if (lenPtr) module._free(lenPtr);
      if (msgPtr) module._free_buffer(msgPtr);
    }
  }

  private async getSchemas(
    requestId: number,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
    return create(CpSatBridgeResponseSchema, {
      payload: {
        case: 'schemaResult',
        value: create(CpSatSchemaResultSchema, {
          cpModelProtoSchema: module.ccall('get_cp_model_schema', 'string', [], []),
          satParametersProtoSchema: module.ccall('get_sat_parameters_schema', 'string', [], []),
        }),
      },
    });
  }

}

export function createCpSatCallbackMask(solution: boolean, bestBound: boolean, log: boolean) {
  return create(CpSatCallbackMaskSchema, { solution, bestBound, log });
}
