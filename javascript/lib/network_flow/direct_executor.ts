import type { OrToolsWasmModule } from '../wasm_module_types.js';
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

function copyInt32ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const array = new Int32Array(values);
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer), ptr);
  return ptr;
}

function copyInt64ToHeap(module: OrToolsWasmModule, values: bigint[]) {
  if (!values.length) return 0;
  const array = BigInt64Array.from(values);
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer), ptr);
  return ptr;
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
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
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
    return this.modulePromise ??= this.loadModuleImpl();
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
    if (operation.type === 'maxFlow') {
      const tails = copyInt32ToHeap(module, operation.tails);
      const heads = copyInt32ToHeap(module, operation.heads);
      const capacities = copyInt64ToHeap(module, operation.capacities);
      try {
        return parseResult(await module.ccall(
          'graph_max_flow_solve_serialized', 'string',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [tails, heads, capacities, operation.tails.length, operation.source, operation.sink],
          { async: true },
        ) as string);
      } finally {
        for (const ptr of [tails, heads, capacities]) if (ptr) module._free(ptr);
      }
    }
    if (operation.type === 'minCostFlow') {
      const tails = copyInt32ToHeap(module, operation.tails);
      const heads = copyInt32ToHeap(module, operation.heads);
      const capacities = copyInt64ToHeap(module, operation.capacities);
      const costs = copyInt64ToHeap(module, operation.unitCosts);
      const supplies = copyInt64ToHeap(module, operation.supplies);
      try {
        return parseResult(await module.ccall(
          'graph_min_cost_flow_solve_serialized', 'string',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [tails, heads, capacities, costs, operation.tails.length, supplies, operation.supplies.length,
            operation.solveMaxFlowWithMinCost ? 1 : 0],
          { async: true },
        ) as string);
      } finally {
        for (const ptr of [tails, heads, capacities, costs, supplies]) if (ptr) module._free(ptr);
      }
    }
    const left = copyInt32ToHeap(module, operation.leftNodes);
    const right = copyInt32ToHeap(module, operation.rightNodes);
    const costs = copyInt64ToHeap(module, operation.costs);
    try {
      return parseResult(await module.ccall(
        'graph_linear_sum_assignment_solve_serialized', 'string',
        ['number', 'number', 'number', 'number'],
        [left, right, costs, operation.leftNodes.length],
        { async: true },
      ) as string);
    } finally {
      for (const ptr of [left, right, costs]) if (ptr) module._free(ptr);
    }
  }
}
