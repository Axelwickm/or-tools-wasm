import { loadMPSolverRuntime } from '../runtime_loader.js';
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
import { executeKnapsackWithModule } from './native_runtime.js';
import type {
  KnapsackExecutor,
  KnapsackJob,
  KnapsackOperation,
  KnapsackResult,
} from './protocol.js';

export class DirectKnapsackExecutor implements KnapsackExecutor {
  readonly solver = 'knapsack';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadMPSolverRuntime,
  ) {}

  async load(): Promise<void> {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: KnapsackOperation,
    options: SolverExecutionOptions<never>,
  ): KnapsackJob {
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
    operation: KnapsackOperation,
    options: SolverExecutionOptions<never>,
  ): Promise<KnapsackResult> {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAt,
      ));
      const module = await this.module();
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAt, BigInt(Date.now()),
      ));
      const result = await executeKnapsackWithModule(
        module,
        operation.solverType,
        operation.name,
        operation.useReduction,
        operation.timeLimitSeconds,
        operation.profits,
        operation.weights,
        operation.capacities,
      );
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.SUCCEEDED, createdAt,
      ));
      return {
        profit: result.profit ?? 0n,
        optimal: result.optimal === true,
        contains: result.contains ?? [],
      };
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
}
