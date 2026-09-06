import { loadMathOptRuntime } from '../runtime_loader.js';
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
import { toIndex } from '../int64.js';
import type {
  MathOptExecutor,
  MathOptJob,
  MathOptOperation,
} from './protocol.js';

export class DirectMathOptExecutor implements MathOptExecutor {
  readonly solver = 'mathopt';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadMathOptRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: MathOptOperation,
    options: SolverExecutionOptions<never>,
  ): MathOptJob {
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
    operation: MathOptOperation,
    options: SolverExecutionOptions<never>,
  ) {
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
      const response = await this.executeNative(module, operation);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.SUCCEEDED,
        createdAt,
      ));
      return { response };
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
    operation: MathOptOperation,
  ): Promise<Uint8Array> {
    switch (operation.type) {
      case 'solve': {
        const pointer = allocateWasmBytes(module, operation.request);
        try {
          return await readWasmResult(module, async (length) => await module.ccall(
            'mathopt_solve_request',
            'number',
            ['number', 'number', 'number', 'number', 'number'],
            [
              pointer,
              operation.request.length,
              operation.useInterrupter ? 1 : 0,
              operation.interruptAtStart ? 1 : 0,
              length,
            ],
            { async: true },
          ) as number);
        } finally {
          if (pointer) module._free(pointer);
        }
      }
      case 'incrementalCreate': {
        const pointer = allocateWasmBytes(module, operation.request);
        try {
          return await readWasmResult(module, async (length) => await module.ccall(
            'mathopt_incremental_create',
            'number',
            ['number', 'number', 'number'],
            [pointer, operation.request.length, length],
            { async: true },
          ) as number);
        } finally {
          if (pointer) module._free(pointer);
        }
      }
      case 'incrementalSolve': {
        const requestPointer = allocateWasmBytes(module, operation.request);
        const updatePointer = operation.modelUpdate
          ? allocateWasmBytes(module, operation.modelUpdate)
          : 0;
        try {
          return await readWasmResult(module, async (length) => await module.ccall(
            'mathopt_incremental_solve',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [
              toIndex(operation.handle, 'MathOpt incremental solver handle'),
              requestPointer,
              operation.request.length,
              updatePointer,
              operation.modelUpdate?.length ?? 0,
              operation.modelUpdate ? 1 : 0,
              operation.useInterrupter ? 1 : 0,
              operation.interruptAtStart ? 1 : 0,
              length,
            ],
            { async: true },
          ) as number);
        } finally {
          if (requestPointer) module._free(requestPointer);
          if (updatePointer) module._free(updatePointer);
        }
      }
      case 'incrementalDelete':
        await module.ccall(
          'mathopt_incremental_delete',
          undefined,
          ['number'],
          [toIndex(operation.handle, 'MathOpt incremental solver handle')],
          { async: true },
        );
        return new Uint8Array();
    }
  }
}
