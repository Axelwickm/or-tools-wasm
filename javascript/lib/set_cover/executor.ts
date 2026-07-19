import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadSetCoverRuntime } from '../runtime_loader.js';
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
import {
  SetCoverBridgeRequestSchema,
  SetCoverBridgeResponseSchema,
  type SetCoverBridgeRequest,
  type SetCoverBridgeResponse,
} from '../generated/bridge/set_cover_pb.js';

export type SetCoverExecutorLike = SolverExecutor<SetCoverBridgeRequest, SetCoverBridgeResponse, never>;
export type SetCoverExecutorJob = SolverJob<SetCoverBridgeResponse>;
export type SetCoverExecutorEvent = SolverJobEvent;

type NativeResult = { ok: false; error: string } | ({ ok: true } & Omit<SetCoverBridgeResponse, '$typeName'>);

export const setCoverBridgeCodec: SolverBridgeCodec<SetCoverBridgeRequest, SetCoverBridgeResponse, never> = {
  solver: 'set-cover',
  label: 'Set Cover',
  encodeRequest: (request) => toBinary(SetCoverBridgeRequestSchema, request),
  decodeRequest: (payload) => fromBinary(SetCoverBridgeRequestSchema, payload),
  encodeResult: (response) => toBinary(SetCoverBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(SetCoverBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, ptr, values.length).set(values);
  return ptr;
}

function operationCode(operation: SetCoverBridgeRequest['operation']) {
  if (operation < 1 || operation > 8) throw new Error('Set Cover request has no valid operation.');
  return operation - 1;
}

export class SetCoverExecutor implements SetCoverExecutorLike {
  readonly solver = 'set-cover';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private readonly cancelled = new Set<number>();

  async load(): Promise<void> { await this.module(); }
  terminate(_reason?: string): void {}

  execute(request: SetCoverBridgeRequest, options: SolverExecutionOptions<never>): SetCoverExecutorJob {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options),
    };
  }

  private module() { return this.modulePromise ??= loadSetCoverRuntime(); }

  private async run(
    requestId: number,
    request: SetCoverBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): Promise<SetCoverBridgeResponse> {
    const createdAtMs = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.STARTING, createdAtMs));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAtMs, BigInt(Date.now()), 1,
      ));
      const response = await this.solve(await this.module(), request);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        this.cancelled.has(requestId) ? SolverJobState.CANCELLED : SolverJobState.SUCCEEDED,
        createdAtMs,
      ));
      return response;
    } catch (error) {
      if (this.cancelled.has(requestId)) {
        await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.CANCELLED, createdAtMs));
        throw error;
      }
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      ));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.FAILED, createdAtMs));
      throw error;
    } finally {
      this.cancelled.delete(requestId);
    }
  }

  private async cancel(requestId: number, options: SolverExecutionOptions<never>) {
    this.cancelled.add(requestId);
    await options.onEvent(createSolverJobStatusEvent(
      this.solver, requestId, SolverJobState.CANCELLING, BigInt(Date.now()),
    ));
  }

  private async solve(module: OrToolsWasmModule, request: SetCoverBridgeRequest) {
    const costs = copyFloat64ToHeap(module, request.costs);
    const starts = copyFloat64ToHeap(module, request.starts);
    const elements = copyFloat64ToHeap(module, request.elements);
    const selected = copyFloat64ToHeap(module, request.selected.map(Number));
    const focus = request.hasFocus ? copyFloat64ToHeap(module, request.focus.map(Number)) : 0;
    try {
      const parsed = JSON.parse(await module.ccall(
        'set_cover_next_solution_serialized',
        'string',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [costs, starts, elements, request.costs.length, request.elements.length, selected, focus,
          operationCode(request.operation), request.maxIterations],
        { async: true },
      ) as string) as NativeResult;
      if (!parsed.ok) throw new Error(parsed.error);
      return create(SetCoverBridgeResponseSchema, parsed);
    } finally {
      for (const ptr of [costs, starts, elements, selected, focus]) if (ptr) module._free(ptr);
    }
  }
}
