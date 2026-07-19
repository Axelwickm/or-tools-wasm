import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
  MpSolverBridgeRequestSchema,
  MpSolverBridgeResponseSchema,
  MpSolverSchemaResultSchema,
  type MpSolverBridgeRequest,
  type MpSolverBridgeResponse,
} from '../generated/bridge/mp_solver_pb.js';
import { loadMPSolverRuntime } from '../runtime_loader.js';
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

export type MpSolverExecutorRequest = MpSolverBridgeRequest['payload'];
export type MpSolverExecutorLike = SolverExecutor<MpSolverExecutorRequest, MpSolverBridgeResponse, never>;
export type MpSolverExecutorEvent = SolverJobEvent;

export const mpSolverBridgeCodec: SolverBridgeCodec<MpSolverExecutorRequest, MpSolverBridgeResponse, never> = {
  solver: 'mp-solver',
  label: 'MP Solver',
  encodeRequest: (payload) => toBinary(MpSolverBridgeRequestSchema, create(MpSolverBridgeRequestSchema, { payload })),
  decodeRequest: (payload) => fromBinary(MpSolverBridgeRequestSchema, payload).payload,
  encodeResult: (response) => toBinary(MpSolverBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(MpSolverBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

function copyBytes(module: OrToolsWasmModule, bytes: Uint8Array) {
  if (!bytes.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

export class MpSolverExecutor implements MpSolverExecutorLike {
  readonly solver = 'mp-solver';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private readonly cancelled = new Set<number>();

  async load() { await this.module(); }
  terminate(_reason?: string) {}

  execute(request: MpSolverExecutorRequest, options: SolverExecutionOptions<never>): SolverJob<MpSolverBridgeResponse> {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options),
    };
  }

  private module() { return this.modulePromise ??= loadMPSolverRuntime(); }

  private async run(requestId: number, request: MpSolverExecutorRequest, options: SolverExecutionOptions<never>) {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.STARTING, createdAt));
      const threads = request.case === 'solve' ? Math.max(1, request.value.numThreads) : 1;
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.RUNNING, createdAt, BigInt(Date.now()), threads));
      const module = await this.module();
      let response: MpSolverBridgeResponse;
      if (request.case === 'solve') {
        response = create(MpSolverBridgeResponseSchema, {
          payload: { case: 'responseProto', value: await this.solve(module, request.value.requestProto, request.value.numThreads) },
        });
      } else if (request.case === 'schema') {
        response = create(MpSolverBridgeResponseSchema, {
          payload: { case: 'schema', value: create(MpSolverSchemaResultSchema, {
            linearSolverProtoSchema: module.ccall('get_linear_solver_schema', 'string', [], []) as string,
            optionalBooleanProtoSchema: module.ccall('get_optional_boolean_schema', 'string', [], []) as string,
          }) },
        });
      } else {
        throw new Error('MP Solver request has no operation.');
      }
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, this.cancelled.has(requestId) ? SolverJobState.CANCELLED : SolverJobState.SUCCEEDED, createdAt,
      ));
      return response;
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

  private async solve(module: OrToolsWasmModule, bytes: Uint8Array, numThreads: number) {
    const requestPtr = copyBytes(module, bytes);
    const lenPtr = module._malloc(4);
    let responsePtr = 0;
    try {
      responsePtr = await module.ccall(
        numThreads > 1 ? 'mp_solver_solve_model_request_with_threads' : 'mp_solver_solve_model_request',
        'number',
        numThreads > 1 ? ['number', 'number', 'number', 'number'] : ['number', 'number', 'number'],
        numThreads > 1 ? [requestPtr, bytes.length, numThreads, lenPtr] : [requestPtr, bytes.length, lenPtr],
        { async: true },
      ) as number;
      const length = new DataView(module.HEAPU8.buffer, lenPtr, 4).getUint32(0, true);
      return responsePtr && length ? module.HEAPU8.slice(responsePtr, responsePtr + length) : new Uint8Array();
    } finally {
      if (responsePtr) module._free(responsePtr);
      if (requestPtr) module._free(requestPtr);
      module._free(lenPtr);
    }
  }
}
