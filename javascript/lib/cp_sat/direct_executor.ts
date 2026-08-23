import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import { loadRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
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

export type CpSatWorkerCancellation = {
  memory: SharedArrayBuffer;
  byteOffset: number;
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

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;

  constructor(private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadRuntime) {}

  async load(): Promise<void> {
    await this.loadModule();
  }

  loadModule() {
    this.modulePromise ??= this.loadModuleImpl();
    return this.modulePromise;
  }

  async workerCancellation(): Promise<CpSatWorkerCancellation> {
    const module = await this.loadModule();
    const memory = module.HEAPU8.buffer;
    if (!(memory instanceof SharedArrayBuffer)) {
      throw new Error('CP-SAT worker cancellation requires shared WASM memory.');
    }
    const interruptAddress = module._cp_sat_interrupt_address
      ?? module.cp_sat_interrupt_address;
    if (typeof interruptAddress !== 'function') {
      const matchingExports = Object.keys(module)
        .filter((name) => name.includes('interrupt'))
        .join(', ');
      throw new Error(
        `CP-SAT interrupt address export unavailable${matchingExports ? `: ${matchingExports}` : '.'}`,
      );
    }
    return {
      memory,
      byteOffset: interruptAddress() as number,
    };
  }

  execute(
    payload: CpSatOperation,
    options: SolverExecutionOptions<CpSatSolverEvent>,
  ): CpSatJob {
    const requestId = this.nextCpSatRequestId();
    return {
      requestId,
      result: this.run(requestId, payload, options.onEvent),
      cancel: () => Promise.reject(new SolverCancellationUnsupportedError(this.solver)),
    };
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
        case 'solve':
          result = {
            response: await this.solve(requestId, payload, createdAtMs, onEvent),
            terminalState: SolverJobState.SUCCEEDED,
          };
          break;
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
    const module = await this.loadModule();
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
    const modelPtr = allocateWasmBytes(module, modelBytes);
    const paramsPtr = allocateWasmBytes(module, paramsBytes);
    let callbackId = 0;
    let callbackError: unknown = null;
    const pendingCallbacks: Promise<void>[] = [];

    try {
      const bytes = await readWasmResult(module, async (lengthPointer) => {
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
            if (pending) {
              pendingCallbacks.push(Promise.resolve(pending).catch((error) => {
                callbackError ??= error;
              }));
            }
          } catch (error) {
            callbackError ??= error;
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
      await Promise.all(pendingCallbacks);
      if (callbackError) throw callbackError;
      return { type: 'solve', response: bytes };
    } finally {
      if (callbackId) cpSatWasmCallbacks(module).sinks.delete(callbackId);
      if (modelPtr) module._free(modelPtr);
      if (paramsPtr) module._free(paramsPtr);
    }
  }

  private async validate(
    requestId: number,
    validateRequest: Extract<CpSatOperation, { type: 'validate' }>,
    createdAtMs: bigint,
    onEvent: SolverExecutorEventHandler<SolverJobEvent | CpSatSolverEvent>,
  ): Promise<CpSatResult> {
    const module = await this.loadModule();
    const startedAtMs = nowMs();
    await onEvent(createCpSatJobStatusEvent(
      requestId,
      SolverJobState.RUNNING,
      createdAtMs,
      startedAtMs,
    ));
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
  }

}
