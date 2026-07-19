import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  MathOptBridgeRequestSchema,
  MathOptBridgeResponseSchema,
  type MathOptBridgeRequest,
  type MathOptBridgeResponse,
} from '../generated/bridge/mathopt_pb.js';
import { loadMathOptRuntime } from '../runtime_loader.js';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
  type SolverJobEvent,
} from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';

export type MathOptExecutorRequest = MathOptBridgeRequest['payload'];
export type MathOptExecutorLike = SolverExecutor<MathOptExecutorRequest, MathOptBridgeResponse, never>;
export type MathOptExecutorEvent = SolverJobEvent;

export const mathOptBridgeCodec: SolverBridgeCodec<MathOptExecutorRequest, MathOptBridgeResponse, never> = {
  solver: 'mathopt',
  label: 'MathOpt',
  encodeRequest: (payload) => toBinary(MathOptBridgeRequestSchema, create(MathOptBridgeRequestSchema, { payload })),
  decodeRequest: (payload) => fromBinary(MathOptBridgeRequestSchema, payload).payload,
  encodeResult: (response) => toBinary(MathOptBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(MathOptBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

function copyBytes(module: OrToolsWasmModule, bytes: Uint8Array) {
  if (!bytes.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

async function resultBytes(
  module: OrToolsWasmModule,
  call: (lengthPointer: number) => Promise<number>,
) {
  const lengthPointer = module._malloc(4);
  let resultPointer = 0;
  try {
    resultPointer = await call(lengthPointer);
    const length = new DataView(module.HEAPU8.buffer, lengthPointer, 4).getUint32(0, true);
    return resultPointer && length ? module.HEAPU8.slice(resultPointer, resultPointer + length) : new Uint8Array();
  } finally {
    if (resultPointer) module._free(resultPointer);
    module._free(lengthPointer);
  }
}

export class MathOptExecutor implements MathOptExecutorLike {
  readonly solver = 'mathopt';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private readonly cancelled = new Set<number>();

  async load() { await this.module(); }
  terminate(_reason?: string) {}
  private module() { return this.modulePromise ??= loadMathOptRuntime(); }

  execute(request: MathOptExecutorRequest, options: SolverExecutionOptions<never>): SolverJob<MathOptBridgeResponse> {
    const requestId = this.nextRequestId++;
    return { requestId, result: this.run(requestId, request, options), cancel: () => this.cancel(requestId, options) };
  }

  private async run(requestId: number, request: MathOptExecutorRequest, options: SolverExecutionOptions<never>) {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.STARTING, createdAt));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.RUNNING, createdAt, BigInt(Date.now()), options.requestedThreads ?? 1));
      const bytes = await this.executeNative(await this.module(), request);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, this.cancelled.has(requestId) ? SolverJobState.CANCELLED : SolverJobState.SUCCEEDED, createdAt,
      ));
      return create(MathOptBridgeResponseSchema, { solveResponseProto: bytes });
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(this.solver, requestId,
        error instanceof Error ? error.message : String(error), SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : ''));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.FAILED, createdAt));
      throw error;
    } finally { this.cancelled.delete(requestId); }
  }

  private async cancel(requestId: number, options: SolverExecutionOptions<never>) {
    this.cancelled.add(requestId);
    await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.CANCELLING, BigInt(Date.now())));
  }

  private async executeNative(module: OrToolsWasmModule, request: MathOptExecutorRequest) {
    switch (request.case) {
      case 'solve': {
        const ptr = copyBytes(module, request.value.solveRequestProto);
        try { return await resultBytes(module, async (len) => await module.ccall(
          'mathopt_solve_request', 'number', ['number', 'number', 'number', 'number', 'number'],
          [ptr, request.value.solveRequestProto.length, request.value.useInterrupter ? 1 : 0, request.value.interruptAtStart ? 1 : 0, len], { async: true },
        ) as number); } finally { if (ptr) module._free(ptr); }
      }
      case 'incrementalCreate': {
        const ptr = copyBytes(module, request.value.solveRequestProto);
        try { return await resultBytes(module, async (len) => await module.ccall(
          'mathopt_incremental_create', 'number', ['number', 'number', 'number'],
          [ptr, request.value.solveRequestProto.length, len], { async: true },
        ) as number); } finally { if (ptr) module._free(ptr); }
      }
      case 'incrementalSolve': {
        const value = request.value;
        const requestPtr = copyBytes(module, value.solveRequestProto);
        const updatePtr = value.modelUpdateProto ? copyBytes(module, value.modelUpdateProto) : 0;
        try { return await resultBytes(module, async (len) => await module.ccall(
          'mathopt_incremental_solve', 'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [Number(value.handle), requestPtr, value.solveRequestProto.length, updatePtr, value.modelUpdateProto?.length ?? 0,
            value.modelUpdateProto ? 1 : 0, value.useInterrupter ? 1 : 0, value.interruptAtStart ? 1 : 0, len], { async: true },
        ) as number); } finally { if (requestPtr) module._free(requestPtr); if (updatePtr) module._free(updatePtr); }
      }
      case 'incrementalDelete':
        await module.ccall('mathopt_incremental_delete', undefined, ['number'], [Number(request.value.handle)], { async: true });
        return new Uint8Array();
      default:
        throw new Error('MathOpt request has no operation.');
    }
  }
}
