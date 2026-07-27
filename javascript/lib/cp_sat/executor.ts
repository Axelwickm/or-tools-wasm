import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import { loadRuntime } from '../runtime_loader.js';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobState,
  type SolverFailureKind as SolverFailureKindType,
  type SolverJobState as SolverJobStateType,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
  type SolverJobEvent,
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
  terminalState: SolverJobStateType;
};

export const cpSatBridgeCodec: SolverBridgeCodec<
  CpSatExecutorRequest,
  CpSatBridgeResponse,
  CpSatBridgeResponse
> = {
  solver: 'cp-sat',
  label: 'CP-SAT',
  encodeRequest: (payload) => toBinary(
    CpSatBridgeRequestSchema,
    create(CpSatBridgeRequestSchema, { payload }),
  ),
  decodeRequest: (payload) => fromBinary(CpSatBridgeRequestSchema, payload).payload,
  encodeResult: (response) => toBinary(CpSatBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(CpSatBridgeResponseSchema, payload),
  encodeEvent: (event) => toBinary(CpSatBridgeResponseSchema, event),
  decodeEvent: (payload) => fromBinary(CpSatBridgeResponseSchema, payload),
};

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

function nowMs() {
  return BigInt(Date.now());
}

function createCpSatJobStatusEvent(
  requestId: number,
  state: SolverJobStateType,
  createdAtMs: bigint,
  startedAtMs: bigint = 0n,
  allocatedThreads = 0,
  queuePosition = 0,
): SolverJobEvent {
  return createSolverJobStatusEvent(
    'cp-sat', requestId, state, createdAtMs, startedAtMs, allocatedThreads, queuePosition,
  );
}

function createCpSatFailureEvent(
  requestId: number,
  message: string,
  kind: SolverFailureKindType = SolverFailureKind.INTERNAL,
  trace = '',
  retryable = false,
): SolverJobEvent {
  return createSolverFailureEvent('cp-sat', requestId, message, kind, trace, retryable);
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
    const modelPtr = allocateWasmBytes(module, modelBytes);
    const paramsPtr = allocateWasmBytes(module, paramsBytes);
    let callbackId = 0;
    let callbackError: unknown = null;
    const pendingCallbacks: Promise<void>[] = [];

    try {
      const bytes = await readWasmResult(module, async (lengthPointer) => {
        if (!flags) {
          return await module.ccall(
            'solve_model',
            'number',
            ['number', 'number', 'number', 'number', 'number'],
            [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, lengthPointer],
            { async: true },
          ) as number;
        }
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
        return await module.ccall(
          'solve_model_with_callback_events',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, flags, callbackId, lengthPointer],
          { async: true },
        ) as number;
      }, (pointer) => module._free_buffer(pointer));
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
    const modelPtr = allocateWasmBytes(module, modelBytes);

    try {
      const bytes = await readWasmResult(
        module,
        (lengthPointer) => module.ccall(
          'validate_model',
          'number',
          ['number', 'number', 'number'],
          [modelPtr, modelBytes.length, lengthPointer],
          { async: true },
        ) as number | Promise<number>,
        (pointer) => module._free_buffer(pointer),
      );
      const message = new TextDecoder().decode(bytes);

      return create(CpSatBridgeResponseSchema, {
        payload: {
          case: 'validateResult',
          value: create(CpSatValidateResultSchema, { ok: message.length === 0, message }),
        },
      });
    } finally {
      if (modelPtr) module._free(modelPtr);
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
