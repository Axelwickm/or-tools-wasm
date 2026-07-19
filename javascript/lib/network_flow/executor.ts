import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadGraphRuntime } from '../runtime_loader.js';
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
  NetworkFlowBridgeRequestSchema,
  NetworkFlowBridgeResponseSchema,
  type NetworkFlowBridgeRequest,
  type NetworkFlowBridgeResponse,
} from '../generated/bridge/network_flow_pb.js';

export type NetworkFlowExecutorRequest = NetworkFlowBridgeRequest['payload'];
export type NetworkFlowExecutorLike = SolverExecutor<
  NetworkFlowExecutorRequest,
  NetworkFlowBridgeResponse,
  never
>;
export type NetworkFlowExecutorJob = SolverJob<NetworkFlowBridgeResponse>;
export type NetworkFlowExecutorEvent = SolverJobEvent;

type NativeResult = { ok: false; error: string } | NativeSuccess;
type NativeSuccess = {
  ok: true;
  status: number;
  optimalFlow?: number;
  optimalCost?: number;
  maximumFlow?: number;
  numNodes: number;
  numArcs: number;
  flows?: number[];
  sourceSideMinCut?: number[];
  sinkSideMinCut?: number[];
  rightMates?: number[];
  assignmentCosts?: number[];
};

export const networkFlowBridgeCodec: SolverBridgeCodec<
  NetworkFlowExecutorRequest,
  NetworkFlowBridgeResponse,
  never
> = {
  solver: 'network-flow',
  label: 'Network Flow',
  encodeRequest: (payload) => toBinary(
    NetworkFlowBridgeRequestSchema,
    create(NetworkFlowBridgeRequestSchema, { payload }),
  ),
  decodeRequest: (payload) => fromBinary(NetworkFlowBridgeRequestSchema, payload).payload,
  encodeResult: (response) => toBinary(NetworkFlowBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(NetworkFlowBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, ptr, values.length).set(values);
  return ptr;
}

function parseResult(value: string): NativeSuccess {
  const result = JSON.parse(value) as NativeResult;
  if (!result.ok) throw new Error(result.error);
  return result;
}

function response(result: NativeSuccess): NetworkFlowBridgeResponse {
  return create(NetworkFlowBridgeResponseSchema, {
    status: result.status,
    optimalFlow: result.optimalFlow ?? 0,
    optimalCost: result.optimalCost ?? 0,
    maximumFlow: result.maximumFlow ?? 0,
    numNodes: result.numNodes,
    numArcs: result.numArcs,
    flows: result.flows ?? [],
    sourceSideMinCut: result.sourceSideMinCut ?? [],
    sinkSideMinCut: result.sinkSideMinCut ?? [],
    rightMates: result.rightMates ?? [],
    assignmentCosts: result.assignmentCosts ?? [],
  });
}

export class NetworkFlowExecutor implements NetworkFlowExecutorLike {
  readonly solver = 'network-flow';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private readonly cancelled = new Set<number>();

  async load(): Promise<void> { await this.module(); }
  terminate(_reason?: string): void {}

  execute(
    request: NetworkFlowExecutorRequest,
    options: SolverExecutionOptions<never>,
  ): NetworkFlowExecutorJob {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options),
    };
  }

  private module() {
    return this.modulePromise ??= loadGraphRuntime();
  }

  private async run(
    requestId: number,
    request: NetworkFlowExecutorRequest,
    options: SolverExecutionOptions<never>,
  ): Promise<NetworkFlowBridgeResponse> {
    const createdAtMs = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAtMs,
      ));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAtMs, BigInt(Date.now()), 1,
      ));
      const module = await this.module();
      let result: NativeSuccess;
      switch (request.case) {
        case 'maxFlow': result = await this.maxFlow(module, request.value); break;
        case 'minCostFlow': result = await this.minCostFlow(module, request.value); break;
        case 'linearSumAssignment': result = await this.assignment(module, request.value); break;
        default: throw new Error('Network Flow request has no operation.');
      }
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        this.cancelled.has(requestId) ? SolverJobState.CANCELLED : SolverJobState.SUCCEEDED,
        createdAtMs,
      ));
      return response(result);
    } catch (error) {
      if (this.cancelled.has(requestId)) {
        await options.onEvent(createSolverJobStatusEvent(
          this.solver, requestId, SolverJobState.CANCELLED, createdAtMs,
        ));
        throw error;
      }
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      ));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.FAILED, createdAtMs,
      ));
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

  private async maxFlow(module: OrToolsWasmModule, request: Extract<NetworkFlowExecutorRequest, { case: 'maxFlow' }>['value']) {
    const tails = copyFloat64ToHeap(module, request.tails);
    const heads = copyFloat64ToHeap(module, request.heads);
    const capacities = copyFloat64ToHeap(module, request.capacities);
    try {
      return parseResult(await module.ccall(
        'graph_max_flow_solve_serialized', 'string',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [tails, heads, capacities, request.tails.length, request.source, request.sink],
        { async: true },
      ) as string);
    } finally {
      if (tails) module._free(tails);
      if (heads) module._free(heads);
      if (capacities) module._free(capacities);
    }
  }

  private async minCostFlow(module: OrToolsWasmModule, request: Extract<NetworkFlowExecutorRequest, { case: 'minCostFlow' }>['value']) {
    const tails = copyFloat64ToHeap(module, request.tails);
    const heads = copyFloat64ToHeap(module, request.heads);
    const capacities = copyFloat64ToHeap(module, request.capacities);
    const costs = copyFloat64ToHeap(module, request.unitCosts);
    const supplies = copyFloat64ToHeap(module, request.supplies);
    try {
      return parseResult(await module.ccall(
        'graph_min_cost_flow_solve_serialized', 'string',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [tails, heads, capacities, costs, request.tails.length, supplies, request.supplies.length,
          request.solveMaxFlowWithMinCost ? 1 : 0],
        { async: true },
      ) as string);
    } finally {
      for (const ptr of [tails, heads, capacities, costs, supplies]) if (ptr) module._free(ptr);
    }
  }

  private async assignment(module: OrToolsWasmModule, request: Extract<NetworkFlowExecutorRequest, { case: 'linearSumAssignment' }>['value']) {
    const left = copyFloat64ToHeap(module, request.leftNodes);
    const right = copyFloat64ToHeap(module, request.rightNodes);
    const costs = copyFloat64ToHeap(module, request.costs);
    try {
      return parseResult(await module.ccall(
        'graph_linear_sum_assignment_solve_serialized', 'string',
        ['number', 'number', 'number', 'number'],
        [left, right, costs, request.leftNodes.length],
        { async: true },
      ) as string);
    } finally {
      for (const ptr of [left, right, costs]) if (ptr) module._free(ptr);
    }
  }
}
