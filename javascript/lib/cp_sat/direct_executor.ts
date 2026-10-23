import { trackPendingEvent } from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasmBytes, readWasmResult, withWasmAllocations } from '../wasm_memory.js';
import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
import { loadRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverFailureKind as SolverFailureKindType,
  type SolverJobState as SolverJobStateType,
  type SolverExecutionOptions,
  type SolverExecutorEventHandler,
  type SolverJobEvent,
} from '../solver_executor.js';
import type {
  CpSatCallbackMask,
  CpSatExecutor,
  CpSatJob,
  CpSatOperation,
  CpSatResult,
  CpSatSolverEvent,
} from './protocol.js';

const SOLUTION_CALLBACK_FLAG = 1 << 0;
const BEST_BOUND_CALLBACK_FLAG = 1 << 1;
const LOG_CALLBACK_FLAG = 1 << 2;
const SOLUTION_CALLBACK_EVENT = 1;
const BEST_BOUND_CALLBACK_EVENT = 2;
const LOG_CALLBACK_EVENT = 3;

type CpSatRunResult = {
  response: CpSatResult;
  terminalState: SolverJobStateType;
};

function callbackFlags(mask?: CpSatCallbackMask) {
  let flags = 0;
  if (mask?.solution) flags |= SOLUTION_CALLBACK_FLAG;
  if (mask?.bestBound) flags |= BEST_BOUND_CALLBACK_FLAG;
  if (mask?.log) flags |= LOG_CALLBACK_FLAG;
  return flags;
}

type CpSatWasmCallbackRegistry = {
  nextId: number;
  sinks: Map<number, (eventType: number, payload: Uint8Array) => void>;
};

function cpSatWasmCallbacks(module: OrToolsWasmModule): CpSatWasmCallbackRegistry {
  return module.__ortoolsCpSatCallbacks ??= {
    nextId: 1,
    sinks: new Map(),
  };
}

function cpSatCallbackEvent(eventType: number, payload: Uint8Array): CpSatSolverEvent | null {
  if (eventType === SOLUTION_CALLBACK_EVENT) {
    return { type: 'solution', response: payload };
  }
  if (eventType === BEST_BOUND_CALLBACK_EVENT) {
    return {
      type: 'bestBound',
      bound: new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getFloat64(0, true),
    };
  }
  if (eventType === LOG_CALLBACK_EVENT) {
    return { type: 'log', message: new TextDecoder().decode(payload) };
  }
  return null;
}

async function nativeStatistics(module: OrToolsWasmModule, input: Uint8Array, response: boolean): Promise<string> {
  const pointer = allocateWasmBytes(module, input);
  try {
    const bytes = await readWasmResult(module, length => module.ccall('cp_sat_statistics', 'number',
      ['number', 'number', 'number', 'number'], [pointer, input.length, response ? 1 : 0, length]) as number,
      pointer => module._free_buffer(pointer));
    const report = new TextDecoder().decode(bytes);
    if (module.ccall('cp_sat_statistics_failed', 'number', [], [])) throw new Error(report || 'Failed to generate CP-SAT statistics.');
    if (!report) throw new Error('Failed to generate CP-SAT statistics.');
    return report;
  } finally { module._free(pointer); }
}

function nowMs() {
  return BigInt(Date.now());
}

function createCpSatJobStatusEvent(
  requestId: number,
  state: SolverJobStateType,
  createdAtMs: bigint,
  startedAtMs: bigint = 0n,
): SolverJobEvent {
  return createSolverJobStatusEvent(
    'cp-sat', requestId, state, createdAtMs, startedAtMs,
  );
}

function createCpSatFailureEvent(
  requestId: number,
  message: string,
  kind: SolverFailureKindType = SolverFailureKind.INTERNAL,
  trace = '',
  retryable = false,
): SolverJobEvent {
  return createSolverFailureEvent('cp-sat', requestId, message, kind, trace, retryable);
}

export class DirectCpSatExecutor implements CpSatExecutor {
  readonly solver = 'cp-sat';

  private nextRequestId = 1;
  private activeJob: { cancelled: boolean; nativeRunning: boolean } | null = null;

  constructor(private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadRuntime) {}

  async load(): Promise<void> {
    await this.module();
  }

  private module() {
    return this.loadModuleImpl();
  }

  execute(
    payload: CpSatOperation,
    options: SolverExecutionOptions<CpSatSolverEvent>,
  ): CpSatJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextCpSatRequestId();
    const state = { cancelled: false, nativeRunning: false };
    this.activeJob = state;
    const stop = async () => {
      if (payload.type !== 'solve') throw new SolverCancellationUnsupportedError(this.solver);
      if (this.activeJob !== state) return;
      state.cancelled = true;
      const module = await this.module();
      if (this.activeJob === state && state.nativeRunning) this.interrupt(module);
    };
    return {
      requestId,
      result: this.run(requestId, payload, options.onEvent).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: stop,
      interrupt: stop,
    };
  }

  private interrupt(module: OrToolsWasmModule) {
    const address = module.ccall('cp_sat_interrupt_address', 'number', [], []) as number;
    Atomics.store(module.HEAPU8, address, 1);
  }

  private async run(
    requestId: number,
    payload: CpSatOperation,
    onEvent: SolverExecutorEventHandler<SolverJobEvent | CpSatSolverEvent>,
  ): Promise<CpSatResult> {
    const createdAtMs = nowMs();
    try {
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        SolverJobState.STARTING,
        createdAtMs,
      ));
      let result: CpSatRunResult;
      switch (payload.type) {
        case 'checkSolution': {
          const module = await this.module();
          const feasible = await withWasmRuntimeLock(module, () => withWasmAllocations(module, async allocate => {
            const model = allocate(payload.model);
            const values = allocate(new Uint8Array(new BigInt64Array(payload.values).buffer));
            const output = allocate(new Uint8Array(4));
            const error = await readWasmResult(module, length => module.ccall('cp_sat_solution_is_feasible', 'number',
              ['number', 'number', 'number', 'number', 'number', 'number'],
              [model, payload.model.length, values, payload.values.length, output, length], { async: true }) as Promise<number>,
              pointer => module._free_buffer(pointer));
            const answer = new DataView(module.HEAPU8.buffer).getInt32(output, true);
            if (answer !== 0 && answer !== 1) throw new Error(new TextDecoder().decode(error) || 'Failed to check CP-SAT solution.');
            return answer === 1;
          }));
          result = { response: { type: 'solutionFeasible', feasible }, terminalState: SolverJobState.SUCCEEDED };
          break;
        }
        case 'solve':
          result = {
            response: await this.solve(requestId, payload, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        case 'exportModelText': {
          const module = await this.module();
          const text = await withWasmRuntimeLock(module, async () => {
            const pointer = allocateWasmBytes(module, payload.input);
            try {
              const bytes = await readWasmResult(module, length => module.ccall('cp_sat_export_model_text', 'number',
                ['number', 'number', 'number'], [pointer, payload.input.length, length]) as number,
                pointer => module._free_buffer(pointer));
              const text = new TextDecoder().decode(bytes);
              if (module.ccall('cp_sat_model_text_failed', 'number', [], [])) throw new Error(text || 'Failed to export CP-SAT model text.');
              return text;
            } finally { module._free(pointer); }
          });
          result = { response: { type: 'modelText', text }, terminalState: SolverJobState.SUCCEEDED };
          break;
        }
        case 'modelStats':
        case 'responseStats': {
          const module = await this.module();
          const report = await withWasmRuntimeLock(module, () => nativeStatistics(module, payload.input, payload.type === 'responseStats'));
          result = { response: { type: 'statistics', report }, terminalState: SolverJobState.SUCCEEDED };
          break;
        }
        case 'validate':
          result = {
            response: await this.validate(requestId, payload, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
        default:
          throw new Error('Unsupported CP-SAT operation.');
      }
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        result.terminalState,
        createdAtMs,
      ));
      return result.response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureEvent(requestId, message, SolverFailureKind.INTERNAL, trace);
      await onEvent(failure);
      await onEvent(createCpSatJobStatusEvent(
        requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      throw error;
    }
  }

  terminate(_reason?: string): void {}

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }

  private async solve(
    requestId: number,
    solveRequest: Extract<CpSatOperation, { type: 'solve' }>,
    createdAtMs: bigint,
    onEvent: SolverExecutorEventHandler<SolverJobEvent | CpSatSolverEvent>,
  ): Promise<CpSatResult> {
    const module = await this.module();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
    const modelBytes = solveRequest.model;
    const paramsBytes = solveRequest.parameters;
    const flags = callbackFlags(solveRequest.callbacks);
    let callbackError: { error: unknown } | undefined;
    const pendingCallbacks = new Set<Promise<void>>();
    const bytes = await withWasmRuntimeLock(module, () => withWasmAllocations(module, async allocate => {
      const modelPtr = allocate(modelBytes);
      const paramsPtr = allocate(paramsBytes);
      let callbackId = 0;
      let interruptAddress: number | undefined;

      const state = this.activeJob;
      if (!state) throw new Error('CP-SAT solve has no active job.');
      try {
        const bytes = await readWasmResult(module, async (lengthPointer) => {
          interruptAddress = module.ccall('cp_sat_interrupt_address', 'number', [], []) as number;
          state.nativeRunning = true;
          if (state.cancelled) Atomics.store(module.HEAPU8, interruptAddress, 1);
          if (!flags) {
            return await module.ccall(
              'solve_model',
              'number',
              ['number', 'number', 'number', 'number', 'number'],
              [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, lengthPointer],
              { async: true },
            ) as number;
          }
          const callbacks = cpSatWasmCallbacks(module);
          callbackId = callbacks.nextId++;
          callbacks.sinks.set(callbackId, (eventType, payload) => {
            const event = cpSatCallbackEvent(eventType, payload);
            if (!event || callbackError) return;
            try {
              const pending = onEvent(event);
              trackPendingEvent(pendingCallbacks, pending, error => { callbackError ??= { error }; });
            } catch (error) {
              callbackError ??= { error };
            }
          });
          return await module.ccall(
            'solve_model_with_callback_events',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, flags, callbackId, lengthPointer],
            { async: true },
          ) as number;
        }, (pointer) => module._free_buffer(pointer));
        state.nativeRunning = false;
        return { bytes, statistics: await nativeStatistics(module, bytes, true) };
      } finally {
        state.nativeRunning = false;
        // A queued JS stop can arrive after the native exit guard resets this.
        // Clear it while holding the runtime lock so the next solve starts clean.
        if (interruptAddress !== undefined) Atomics.store(module.HEAPU8, interruptAddress, 0);
        if (callbackId) cpSatWasmCallbacks(module).sinks.delete(callbackId);
      }
    }));
    // Release native access before awaiting callbacks: a callback may await
    // another entry point that uses this same runtime.
    await Promise.all(pendingCallbacks);
    if (callbackError) throw callbackError.error;
    return { type: 'solve', response: bytes.bytes, statistics: bytes.statistics };
  }

  private async validate(
    requestId: number,
    validateRequest: Extract<CpSatOperation, { type: 'validate' }>,
    createdAtMs: bigint,
    onEvent: SolverExecutorEventHandler<SolverJobEvent | CpSatSolverEvent>,
  ): Promise<CpSatResult> {
    const module = await this.module();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
    return withWasmRuntimeLock(module, async () => {
      const modelBytes = validateRequest.model;
      const modelPtr = allocateWasmBytes(module, modelBytes);

      try {
        const bytes = await readWasmResult(
          module,
          (lengthPointer) => module.ccall(
            'validate_model',
            'number',
            ['number', 'number', 'number'],
            [modelPtr, modelBytes.length, lengthPointer],
            { async: true },
          ) as number | Promise<number>,
          (pointer) => module._free_buffer(pointer),
        );
        const message = new TextDecoder().decode(bytes);

        return { type: 'validate', ok: message.length === 0, message };
      } finally {
        if (modelPtr) module._free(modelPtr);
      }
    });
  }

}
