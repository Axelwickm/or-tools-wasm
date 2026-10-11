import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
import { loadRoutingRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { solveRoutingWithModule } from './native_runtime.js';
import type {
  RoutingExecutor,
  RoutingJob,
  RoutingOperation,
  RoutingResult,
  RoutingSolverEvent,
} from './protocol.js';

export class DirectRoutingExecutor implements RoutingExecutor {
  readonly solver = 'routing';

  private nextRequestId = 1;
  private activeJob: { cancelled: boolean; nativeRunning: boolean } | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadRoutingRuntime,
  ) {}

  async load(): Promise<void> {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: RoutingOperation,
    options: SolverExecutionOptions<RoutingSolverEvent>,
  ): RoutingJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = { cancelled: false, nativeRunning: false };
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: async () => {
        if (this.activeJob !== state) return;
        state.cancelled = true;
        const module = await this.module();
        if (this.activeJob === state && state.nativeRunning && operation.interruptible) this.interrupt(module);
      },
    };
  }

  private interrupt(module: OrToolsWasmModule) {
    const address = module.ccall('routing_interrupt_address', 'number', [], []) as number;
    Atomics.store(module.HEAPU8, address, 1);
  }

  private module() {
    return this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    operation: RoutingOperation,
    options: SolverExecutionOptions<RoutingSolverEvent>,
  ): Promise<RoutingResult> {
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
      const pendingCallbacks: Promise<void>[] = [];
      let callbackFailure: { error: unknown } | undefined;
      const result = await withWasmRuntimeLock(module, async () => {
        const registry: { nextId: number; sinks: Map<number, (bytes: Uint8Array) => void> } =
          module.__ortoolsRoutingCallbacks ??= { nextId: 1, sinks: new Map() };
        const callbackId = operation.request.solutionEvents ? registry.nextId++ : 0;
        if (callbackId) registry.sinks.set(callbackId, bytes => {
          if (callbackFailure) return;
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          try {
            const pending = options.onEvent({ type: 'solution', objectiveValue: view.getBigInt64(0, true),
              solutionCount: view.getBigInt64(8, true), unchecked: view.getBigInt64(16, true) !== 0n });
            if (pending) pendingCallbacks.push(Promise.resolve(pending).catch(error => {
              callbackFailure ??= { error };
            }));
          } catch (error) { callbackFailure ??= { error }; }
        });
        const state = this.activeJob;
        if (!state) throw new Error('Routing solve has no active job.');
        state.nativeRunning = true;
        if (state.cancelled && operation.interruptible) this.interrupt(module);
        try { return await solveRoutingWithModule(module, operation.request, operation.interruptible, callbackId); }
        finally {
          state.nativeRunning = false;
          if (callbackId) registry.sinks.delete(callbackId);
        }
      });
      await Promise.all(pendingCallbacks);
      if (callbackFailure) throw callbackFailure.error;
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.SUCCEEDED,
        createdAt,
      ));
      return { type: 'solve', ...result };
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
}
