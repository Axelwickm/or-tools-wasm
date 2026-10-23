import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { withWasmAllocations, type WasmByteAllocator } from '../wasm_memory.js';
import { loadGraphRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import type {
  NetworkFlowExecutor,
  NetworkFlowJob,
  NetworkFlowOperation,
  NetworkFlowResult,
} from './protocol.js';

type NativeResult =
  | { ok: false; error: string }
  | {
    ok: true;
    status: number;
    numNodes: number;
    numArcs: number;
    optimalFlow?: string;
    optimalCost?: string;
    maximumFlow?: string;
    flows?: string[];
    sourceSideMinCut?: number[];
    sinkSideMinCut?: number[];
    rightMates?: number[];
    assignmentCosts?: string[];
  };

function copyInt32ToHeap(allocate: WasmByteAllocator, values: number[]) {
  const array = new Int32Array(values);
  return allocate(new Uint8Array(array.buffer));
}

function copyInt64ToHeap(allocate: WasmByteAllocator, values: bigint[]) {
  const array = BigInt64Array.from(values);
  return allocate(new Uint8Array(array.buffer));
}

function parseResult(value: string): NetworkFlowResult {
  const result = JSON.parse(value) as NativeResult;
  if (!result.ok) throw new Error(result.error);
  return {
    status: result.status,
    optimalFlow: BigInt(result.optimalFlow ?? '0'),
    optimalCost: BigInt(result.optimalCost ?? '0'),
    maximumFlow: BigInt(result.maximumFlow ?? '0'),
    numNodes: result.numNodes,
    numArcs: result.numArcs,
    flows: (result.flows ?? []).map(BigInt),
    sourceSideMinCut: result.sourceSideMinCut ?? [],
    sinkSideMinCut: result.sinkSideMinCut ?? [],
    rightMates: result.rightMates ?? [],
    assignmentCosts: (result.assignmentCosts ?? []).map(BigInt),
  };
}

export class DirectNetworkFlowExecutor implements NetworkFlowExecutor {
  readonly solver = 'network-flow';
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadGraphRuntime,
  ) {}

  async load(): Promise<void> { await this.module(); }
  terminate(_reason?: string): void {}

  execute(
    operation: NetworkFlowOperation,
    options: SolverExecutionOptions<never>,
  ): NetworkFlowJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = {};
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: () => Promise.reject(new SolverCancellationUnsupportedError(this.solver)),
    };
  }

  private module() {
    return this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    operation: NetworkFlowOperation,
    options: SolverExecutionOptions<never>,
  ): Promise<NetworkFlowResult> {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAt,
      ));
      const module = await this.module();
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAt, BigInt(Date.now()),
      ));
      const result = await this.executeNative(module, operation);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.SUCCEEDED, createdAt,
      ));
      return result;
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      ));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.FAILED, createdAt,
      ));
      throw error;
    }
  }

  private async executeNative(
    module: OrToolsWasmModule,
    operation: NetworkFlowOperation,
  ): Promise<NetworkFlowResult> {
    return withWasmAllocations(module, async allocate => {
      if (operation.type === 'maxFlow') {
        const tails = copyInt32ToHeap(allocate, operation.tails);
        const heads = copyInt32ToHeap(allocate, operation.heads);
        const capacities = copyInt64ToHeap(allocate, operation.capacities);
        return parseResult(await module.ccall(
          'graph_max_flow_solve_serialized', 'string',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [tails, heads, capacities, operation.tails.length, operation.source, operation.sink],
          { async: true },
        ) as string);
      }
      if (operation.type === 'minCostFlow') {
        const tails = copyInt32ToHeap(allocate, operation.tails);
        const heads = copyInt32ToHeap(allocate, operation.heads);
        const capacities = copyInt64ToHeap(allocate, operation.capacities);
        const costs = copyInt64ToHeap(allocate, operation.unitCosts);
        const supplies = copyInt64ToHeap(allocate, operation.supplies);
        return parseResult(await module.ccall(
          'graph_min_cost_flow_solve_serialized', 'string',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [tails, heads, capacities, costs, operation.tails.length, supplies, operation.supplies.length,
            operation.solveMaxFlowWithMinCost ? 1 : 0, Number(operation.priceScaling ?? true)],
          { async: true },
        ) as string);
      }
      const left = copyInt32ToHeap(allocate, operation.leftNodes);
      const right = copyInt32ToHeap(allocate, operation.rightNodes);
      const costs = copyInt64ToHeap(allocate, operation.costs);
      return parseResult(await module.ccall(
        'graph_linear_sum_assignment_solve_serialized', 'string',
        ['number', 'number', 'number', 'number'],
        [left, right, costs, operation.leftNodes.length],
        { async: true },
      ) as string);
    });
  }
}
