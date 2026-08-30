import { loadSetCoverRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import type {
  SetCoverExecutor,
  SetCoverJob,
  SetCoverOperation,
  SetCoverResult,
} from './protocol.js';

type NativeResult =
  | { ok: false; error: string }
  | ({ ok: true } & SetCoverResult);

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const pointer = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, pointer, values.length).set(values);
  return pointer;
}

const algorithmCode: Record<SetCoverOperation['algorithm'], number> = {
  trivial: 0,
  greedy: 1,
  elementDegree: 2,
  lazyElementDegree: 3,
  random: 4,
  steepest: 5,
  guidedLocal: 6,
  guidedTabu: 7,
};

export class DirectSetCoverExecutor implements SetCoverExecutor {
  readonly solver = 'set-cover';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadSetCoverRuntime,
  ) {}

  async load(): Promise<void> { await this.module(); }
  terminate(_reason?: string): void {}

  execute(operation: SetCoverOperation, options: SolverExecutionOptions<never>): SetCoverJob {
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
    operation: SetCoverOperation,
    options: SolverExecutionOptions<never>,
  ): Promise<SetCoverResult> {
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
    operation: SetCoverOperation,
  ): Promise<SetCoverResult> {
    const costs = copyFloat64ToHeap(module, operation.costs);
    const starts = copyFloat64ToHeap(module, operation.starts);
    const elements = copyFloat64ToHeap(module, operation.elements);
    const selected = copyFloat64ToHeap(module, operation.selected.map(Number));
    const focus = operation.focus ? copyFloat64ToHeap(module, operation.focus.map(Number)) : 0;
    try {
      const result = JSON.parse(await module.ccall(
        'set_cover_next_solution_serialized',
        'string',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [costs, starts, elements, operation.costs.length, operation.elements.length, selected, focus,
          algorithmCode[operation.algorithm], operation.maxIterations],
        { async: true },
      ) as string) as NativeResult;
      if (!result.ok) throw new Error(result.error);
      return result;
    } finally {
      for (const pointer of [costs, starts, elements, selected, focus]) {
        if (pointer) module._free(pointer);
      }
    }
  }
}
