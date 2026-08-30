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
import { allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import type {
  MpSolverExecutor,
  MpSolverJob,
  MpSolverOperation,
  MpSolverResult,
} from './protocol.js';

export class DirectMpSolverExecutor implements MpSolverExecutor {
  readonly solver = 'mp-solver';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadMPSolverRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: MpSolverOperation,
    options: SolverExecutionOptions<never>,
  ): MpSolverJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = {};
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: () => Promise.reject(
        new SolverCancellationUnsupportedError(this.solver),
      ),
    };
  }

  private module() {
    return this.modulePromise ??= this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    operation: MpSolverOperation,
    options: SolverExecutionOptions<never>,
  ): Promise<MpSolverResult> {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.STARTING,
        createdAt,
      ));
      const module = await this.module();
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.RUNNING,
        createdAt,
        BigInt(Date.now()),
      ));
      const result = await this.executeNative(module, operation);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.SUCCEEDED,
        createdAt,
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
        this.solver,
        requestId,
        SolverJobState.FAILED,
        createdAt,
      ));
      throw error;
    }
  }

  private async executeNative(
    module: OrToolsWasmModule,
    operation: MpSolverOperation,
  ): Promise<MpSolverResult> {
    if (operation.type === 'schema') {
      return {
        type: 'schema',
        linearSolverProtoSchema: module.ccall(
          'get_linear_solver_schema',
          'string',
          [],
          [],
        ) as string,
        optionalBooleanProtoSchema: module.ccall(
          'get_optional_boolean_schema',
          'string',
          [],
          [],
        ) as string,
      };
    }

    const requestPointer = allocateWasmBytes(module, operation.request);
    try {
      const response = await readWasmResult(module, async (length) => await module.ccall(
        operation.numThreads > 1
          ? 'mp_solver_solve_model_request_with_threads'
          : 'mp_solver_solve_model_request',
        'number',
        operation.numThreads > 1
          ? ['number', 'number', 'number', 'number', 'number']
          : ['number', 'number', 'number', 'number'],
        operation.numThreads > 1
          ? [
            requestPointer,
            operation.request.length,
            operation.numThreads,
            operation.interruptible ? 1 : 0,
            length,
          ]
          : [
            requestPointer,
            operation.request.length,
            operation.interruptible ? 1 : 0,
            length,
          ],
        { async: true },
      ) as number);
      return { type: 'solve', response };
    } finally {
      if (requestPointer) module._free(requestPointer);
    }
  }
}
