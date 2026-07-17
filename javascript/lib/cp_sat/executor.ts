import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadRuntime } from '../runtime_loader.js';
import { encodeSolverBridgeRequest } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  CpSatBridgeResponseSchema,
  CpSatBridgeRequestSchema,
  CpSatCallbackMaskSchema,
  CpSatSolveEventSchema,
  CpSatSolveResultSchema,
  CpSatValidateResultSchema,
  CpSatSchemaResultSchema,
  CpSatCancelRequestSchema,
  CpSatCancelledSchema,
  CpSatBridgeErrorSchema,
  type CpSatCallbackMask,
  type CpSatSolveEvent,
  type CpSatSolveRequest,
  type CpSatValidateRequest,
  type CpSatCancelRequest,
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

export type CpSatExecutorEventHandler = (event: CpSatBridgeResponse) => void | Promise<void>;
export type CpSatExecutorBytesEventHandler = (eventBytes: Uint8Array) => void | Promise<void>;
export type CpSatExecutorRequest = CpSatBridgeRequest['payload'];
export type CpSatExecutorJob = SolverJob<CpSatBridgeResponse>;
export type CpSatExecutorLike = SolverExecutor<CpSatExecutorRequest, CpSatBridgeResponse, CpSatBridgeResponse>;
type CpSatRunResult = {
  response: CpSatBridgeResponse;
  terminalState: SolverJobState;
};

const readUint32LE = (buffer: ArrayBufferLike, ptr: number) =>
  new DataView(buffer, ptr, 4).getUint32(0, true);

function readUint32FromBytes(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function callbackFlags(mask?: CpSatCallbackMask) {
  let flags = 0;
  if (mask?.solution) flags |= SOLUTION_CALLBACK_FLAG;
  if (mask?.bestBound) flags |= BEST_BOUND_CALLBACK_FLAG;
  if (mask?.log) flags |= LOG_CALLBACK_FLAG;
  return flags;
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

export function createCpSatJobStatusBridgeResponse(
  requestId: number,
  state: SolverJobState,
  createdAtMs: bigint,
  startedAtMs: bigint = 0n,
  allocatedThreads = 0,
  queuePosition = 0,
): CpSatBridgeResponse {
  return create(CpSatBridgeResponseSchema, {
    requestId,
    payload: {
      case: 'jobStatus',
      value: create(SolverJobStatusSchema, {
        requestId,
        solver: 'cp-sat',
        state,
        createdAtMs,
        startedAtMs,
        allocatedThreads,
        queuePosition,
      }),
    },
  });
}

export function createCpSatFailureBridgeResponse(
  requestId: number,
  message: string,
  kind: SolverFailureKind = SolverFailureKind.INTERNAL,
  trace = '',
  retryable = false,
): CpSatBridgeResponse {
  return create(CpSatBridgeResponseSchema, {
    requestId,
    payload: {
      case: 'failure',
      value: create(SolverJobFailureSchema, {
        requestId,
        solver: 'cp-sat',
        kind,
        message,
        trace,
        retryable,
      }),
    },
  });
}

export function cpSatResponseFromSolverBridgeResponse(
  requestId: number,
  response: SolverBridgeResponse,
  failureKind: SolverFailureKind,
): CpSatBridgeResponse {
  switch (response.payload.case) {
    case 'eventPayload':
    case 'resultPayload':
      return fromBinary(CpSatBridgeResponseSchema, response.payload.value);
    case 'status':
      return create(CpSatBridgeResponseSchema, {
        requestId,
        payload: {
          case: 'jobStatus',
          value: response.payload.value,
        },
      });
    case 'failure':
      return create(CpSatBridgeResponseSchema, {
        requestId,
        payload: {
          case: 'failure',
          value: response.payload.value,
        },
      });
    default:
      return createCpSatFailureBridgeResponse(
        requestId,
        'Solver bridge response has no payload.',
        failureKind,
        '',
        true,
      );
  }
}

function requestedThreads(request: CpSatBridgeRequest): number {
  return request.payload.case === 'solve' ? request.payload.value.allocatedThreads : 0;
}

export function encodeCpSatSolverBridgeRequest(request: CpSatBridgeRequest): Uint8Array {
  return encodeSolverBridgeRequest({
    requestId: request.requestId,
    solver: 'cp-sat',
    payload: toBinary(CpSatBridgeRequestSchema, request),
    requestedThreads: requestedThreads(request),
  });
}

export class CpSatExecutor implements CpSatExecutorLike {
  readonly solver = 'cp-sat';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;

  constructor(private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadRuntime) {}

  load() {
    return this.loadModule();
  }

  loadModule() {
    this.modulePromise ??= this.loadModuleImpl();
    return this.modulePromise;
  }

  execute(
    payload: CpSatExecutorRequest,
    onEvent: CpSatExecutorEventHandler,
  ): CpSatExecutorJob {
    const request = this.createRequest(payload);
    return {
      requestId: request.requestId,
      result: this.run(request, onEvent),
      cancel: () => this.cancel(this.nextCpSatRequestId(), request.requestId, onEvent),
    };
  }

  private async run(
    request: CpSatBridgeRequest,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const createdAtMs = nowMs();
    try {
      await onEvent(createCpSatJobStatusBridgeResponse(
        request.requestId,
        SolverJobState.STARTING,
        createdAtMs,
      ));
      let result: CpSatRunResult;
      switch (request.payload.case) {
        case 'solve':
          result = {
            response: await this.solve(request.requestId, request.payload.value, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'validate':
          result = {
            response: await this.validate(request.requestId, request.payload.value, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'schema':
          result = {
            response: await this.getSchemas(request.requestId, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'cancel':
          result = {
            response: await this.cancelRequest(request.requestId, request.payload.value, createdAtMs, onEvent),
            terminalState: SolverJobState.CANCELLED,
          };
          break;
        default:
          result = {
            response: this.error(request.requestId, 'CP-SAT bridge request has no payload.'),
            terminalState: SolverJobState.FAILED,
          };
      }
      await onEvent(createCpSatJobStatusBridgeResponse(
        request.requestId,
        result.terminalState,
        createdAtMs,
      ));
      return result.response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureBridgeResponse(request.requestId, message, SolverFailureKind.INTERNAL, trace);
      await onEvent(failure);
      await onEvent(createCpSatJobStatusBridgeResponse(
        request.requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      return failure;
    }
  }

  async executeBytes(
    requestBytes: Uint8Array,
    onEvent: CpSatExecutorBytesEventHandler,
  ): Promise<Uint8Array> {
    const request = fromBinary(CpSatBridgeRequestSchema, requestBytes);
    const response = await this.run(request, async (event) => {
      await onEvent(toBinary(CpSatBridgeResponseSchema, event));
    });
    return toBinary(CpSatBridgeResponseSchema, response);
  }

  private async cancel(
    requestId: number,
    targetRequestId: number,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    return this.run(createCpSatCancelBridgeRequest(requestId, targetRequestId), onEvent);
  }

  terminate(_reason?: string): void {}

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }

  private createRequest(payload: CpSatExecutorRequest): CpSatBridgeRequest {
    return create(CpSatBridgeRequestSchema, {
      requestId: this.nextCpSatRequestId(),
      payload,
    });
  }

  private async solve(
    requestId: number,
    solveRequest: CpSatSolveRequest,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusBridgeResponse(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
      solveRequest.allocatedThreads,
    ));
    const modelBytes = solveRequest.cpModelProto;
    const paramsBytes = solveRequest.satParametersProto;
    const flags = callbackFlags(solveRequest.callbackMask);
    const lenPtr = module._malloc(4);
    const modelPtr = copyBytesToHeap(module, modelBytes);
    const paramsPtr = copyBytesToHeap(module, paramsBytes);
    let responsePtr = 0;

    try {
      if (flags) {
        responsePtr = await module.ccall(
          'solve_model_with_callback_events',
          'number',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, flags, lenPtr],
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
      const responseBytes = flags ? await this.postCallbackEvents(requestId, bytes, onEvent) : bytes;
      return create(CpSatBridgeResponseSchema, {
        requestId,
        payload: {
          case: 'solveResult',
          value: create(CpSatSolveResultSchema, {
            cpSolverResponseProto: responseBytes,
          }),
        },
      });
    } finally {
      if (modelPtr) module._free(modelPtr);
      if (paramsPtr) module._free(paramsPtr);
      if (lenPtr) module._free(lenPtr);
      if (responsePtr) module._free_buffer(responsePtr);
    }
  }

  private async postCallbackEvents(
    requestId: number,
    envelopeBytes: Uint8Array,
    onEvent: CpSatExecutorEventHandler,
  ) {
    let offset = 0;
    const eventCount = readUint32FromBytes(envelopeBytes, offset);
    offset += 4;
    for (let i = 0; i < eventCount; i++) {
      const eventType = envelopeBytes[offset++];
      const payloadLength = readUint32FromBytes(envelopeBytes, offset);
      offset += 4;
      const payload = envelopeBytes.slice(offset, offset + payloadLength);
      offset += payloadLength;

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
        continue;
      }

      await onEvent(create(CpSatBridgeResponseSchema, {
        requestId,
        payload: {
          case: 'solveEvent',
          value: create(CpSatSolveEventSchema, { payload: eventPayload }),
        },
      }));
    }
    const responseLength = readUint32FromBytes(envelopeBytes, offset);
    offset += 4;
    return envelopeBytes.slice(offset, offset + responseLength);
  }

  private async validate(
    requestId: number,
    validateRequest: CpSatValidateRequest,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusBridgeResponse(
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
        requestId,
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
    await onEvent(createCpSatJobStatusBridgeResponse(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
    return create(CpSatBridgeResponseSchema, {
      requestId,
      payload: {
        case: 'schemaResult',
        value: create(CpSatSchemaResultSchema, {
          cpModelProtoSchema: module.ccall('get_cp_model_schema', 'string', [], []),
          satParametersProtoSchema: module.ccall('get_sat_parameters_schema', 'string', [], []),
        }),
      },
    });
  }

  private async cancelRequest(
    requestId: number,
    cancelRequest: CpSatCancelRequest,
    createdAtMs: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusBridgeResponse(
      requestId,
      SolverJobState.CANCELLING,
      createdAtMs,
      startedAtMs,
    ));
    module.ccall('interrupt_solve', 'void', [], []);
    return create(CpSatBridgeResponseSchema, {
      requestId,
      payload: {
        case: 'cancelled',
        value: create(CpSatCancelledSchema, { targetRequestId: cancelRequest.targetRequestId }),
      },
    });
  }

  private error(requestId: number, message: string): CpSatBridgeResponse {
    return create(CpSatBridgeResponseSchema, {
      requestId,
      payload: {
        case: 'error',
        value: create(CpSatBridgeErrorSchema, { message }),
      },
    });
  }
}

export function createCpSatCancelBridgeRequest(requestId: number, targetRequestId: number) {
  return create(CpSatBridgeRequestSchema, {
    requestId,
    payload: {
      case: 'cancel',
      value: create(CpSatCancelRequestSchema, { targetRequestId }),
    },
  });
}

export function createCpSatCallbackMask(solution: boolean, bestBound: boolean, log: boolean) {
  return create(CpSatCallbackMaskSchema, { solution, bestBound, log });
}
