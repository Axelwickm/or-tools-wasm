import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
import { loadMathOptRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverExecutorBusyError,
  SolverCallbackTransportError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasm, allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import { toIndex } from '../int64.js';
import {
  mathOptProtocol,
  type MathOptExecutor,
  type MathOptJob,
  type MathOptOperation,
  type MathOptResult,
  type MathOptLogEvent,
} from './protocol.js';

export class DirectMathOptExecutor implements MathOptExecutor {
  readonly solver = 'mathopt';

  private nextRequestId = 1;
  private activeJob: { cancelled: boolean; nativeRunning: boolean; interruptible: boolean; interrupted: boolean } | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadMathOptRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: MathOptOperation,
    options: SolverExecutionOptions<MathOptLogEvent>,
  ): MathOptJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = { cancelled: false, nativeRunning: false, interruptible: (operation.type === 'solve' || operation.type === 'incrementalSolve') && operation.useInterrupter, interrupted: false };
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      interrupt: async () => {
        state.interrupted = true;
        const module = await this.module();
        if (this.activeJob === state && state.nativeRunning && state.interruptible) {
          const address = module._mathopt_interrupt_address ?? module.mathopt_interrupt_address;
          if (typeof address !== 'function') throw new Error('MathOpt interrupt address export unavailable.');
          Atomics.store(module.HEAPU8, address() as number, 1);
        }
      },
      cancel: async () => {
        state.cancelled = true;
        const module = await this.module();
        if (this.activeJob === state && state.nativeRunning && state.interruptible) {
          const address = module._mathopt_interrupt_address ?? module.mathopt_interrupt_address;
          if (typeof address !== 'function') throw new Error('MathOpt interrupt address export unavailable.');
          Atomics.store(module.HEAPU8, address() as number, 1);
        }
      },
    };
  }

  private module() {
    return this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    operation: MathOptOperation,
    options: SolverExecutionOptions<MathOptLogEvent>,
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
      const response = await withWasmRuntimeLock(module, async () => {
        options.onDispatch?.(module);
        const state = this.activeJob!;
        if (state.cancelled) throw Object.assign(new Error('MathOpt operation was cancelled.'), { name: 'AbortError' });
        state.nativeRunning = operation.type === 'solve' || operation.type === 'incrementalSolve';
        try {
          const request = state.interrupted && (operation.type === 'solve' || operation.type === 'incrementalSolve')
            ? { ...operation, interruptAtStart: true } : operation;
          const registry: Map<number, (payload: Uint8Array) => number> = module.__mathoptCallbacks ??= new Map();
          const messages: Map<number, (payload: Uint8Array) => void> = module.__mathoptMessages ??= new Map();
          let callbackFailure: { error: unknown } | undefined;
          if (request.type === 'solve' || request.type === 'incrementalSolve') {
            if (request.streamMessages) messages.set(requestId, payload => {
              void options.onEvent(mathOptProtocol.decodeEvent!(payload)!);
            });
            if (request.callbackRegistration !== undefined && !options.onCallback) throw new Error('MathOpt callback registration requires a handler.');
            if (request.callbackRegistration !== undefined) registry.set(requestId, payload => {
              let reply: Uint8Array;
              // executeSolverJob retains the user exception while native search
              // terminates normally, allowing incremental state to be committed.
              try { reply = options.onCallback!(payload); }
              catch (error) {
                if (error instanceof SolverCallbackTransportError) callbackFailure ??= { error };
                return 0;
              }
              let pointer = 0;
              try {
                pointer = allocateWasm(module, 4 + reply.length);
                new DataView(module.HEAPU8.buffer).setUint32(pointer, reply.length, true);
                module.HEAPU8.set(reply, pointer + 4);
                return pointer;
              } catch (error) { if (pointer) module._free(pointer); callbackFailure ??= { error }; return 0; }
            });
          }
          try {
            const result = await this.executeNative(module, request, requestId);
            if (callbackFailure) throw callbackFailure.error;
            return result;
          } finally { registry.delete(requestId); messages.delete(requestId); }
        }
        finally { state.nativeRunning = false; }
      });
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.SUCCEEDED,
        createdAt,
      ));
      return response;
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

  private async executeNative(module: OrToolsWasmModule, operation: MathOptOperation, callbackId: number): Promise<MathOptResult> {
    if (operation.type === 'incrementalUpdate') {
      const pointer = allocateWasmBytes(module, operation.modelUpdate);
      try {
        const result = await module.ccall('mathopt_incremental_update', 'string', ['number', 'number', 'number'],
          [toIndex(operation.handle, 'MathOpt incremental solver handle'), pointer, operation.modelUpdate.length], { async: true });
        if (result !== 'true' && result !== 'false') throw new Error(String(result));
        return { updated: result === 'true' };
      } finally { module._free(pointer); }
    }
    if (operation.type === 'validateResult' || operation.type === 'convertResult') {
      const model = operation.type === 'validateResult' ? operation.request : operation.model;
      const input = operation.type === 'validateResult' ? operation.result : operation.input;
      const requestPointer = allocateWasmBytes(module, model);
      let resultPointer = 0;
      try {
        resultPointer = allocateWasmBytes(module, input);
        const args = [requestPointer, model.length, resultPointer, input.length];
        if (operation.type === 'convertResult') args.push(operation.kind);
        const output = await readWasmResult(module, async length => await module.ccall(
          operation.type === 'validateResult' ? 'mathopt_validate_result' : 'mathopt_convert_result_proto', 'number',
          [...args, length].map(() => 'number'), [...args, length], { async: true }) as number);
        if (module.ccall('mathopt_result_validation_failed', 'number', [], []) === 1)
          return { validationError: new TextDecoder().decode(output) };
        return { validatedResult: output };
      } finally { module._free(requestPointer); if (resultPointer) module._free(resultPointer); }
    }

    if (operation.type === 'validateModel') {
      const pointer = allocateWasmBytes(module, operation.model);
      try { return { validationError: module.ccall('mathopt_validate_model', 'string', ['number', 'number'], [pointer, operation.model.length]) as string }; }
      finally { module._free(pointer); }
    }
    if (operation.type === 'modelProtoToMps' || operation.type === 'mpsToModelProto') {
      const input = operation.type === 'modelProtoToMps' ? operation.model : new TextEncoder().encode(operation.mps);
      const pointer = allocateWasmBytes(module, input);
      try {
        const output = await readWasmResult(module, length => module.ccall('mathopt_mps_convert', 'number',
          ['number', 'number', 'number', 'number'], [pointer, input.length, operation.type === 'modelProtoToMps' ? 1 : 0, length]) as number);
        if (module.ccall('mathopt_mps_conversion_failed', 'number', [], [])) throw new Error(new TextDecoder().decode(output) || 'MathOpt MPS conversion failed.');
        return operation.type === 'modelProtoToMps' ? { mps: new TextDecoder().decode(output) } : { model: output };
      } finally { module._free(pointer); }
    }
    return { response: await this.executeSolverNative(module, operation, callbackId) };
  }

  private async executeSolverNative(
    module: OrToolsWasmModule,
    operation: Exclude<MathOptOperation, { type: 'modelProtoToMps' | 'mpsToModelProto' | 'validateModel' | 'validateResult' | 'convertResult' | 'incrementalUpdate' }>,
    callbackId: number,
  ): Promise<Uint8Array> {
    switch (operation.type) {
      case 'solve': {
        let callbackPointer = 0, pointer = 0;
        try {
          pointer = allocateWasmBytes(module, operation.request);
          if (operation.callbackRegistration !== undefined) {
            callbackPointer = allocateWasmBytes(module, operation.callbackRegistration, 1);
          }
          return await readWasmResult(module, async (length) => await module.ccall(
            'mathopt_solve_request',
            'number',
            Array(9).fill('number'),
            [
              pointer,
              operation.request.length,
              operation.useInterrupter ? 1 : 0,
              operation.interruptAtStart ? 1 : 0,
              length, callbackPointer, operation.callbackRegistration?.length ?? 0, operation.callbackRegistration === undefined ? 0 : callbackId,
              operation.streamMessages ? callbackId : 0,
            ],
            { async: true },
          ) as number);
        } finally {
          if (pointer) module._free(pointer);
          if (callbackPointer) module._free(callbackPointer);
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
        let callbackPointer = 0, requestPointer = 0, updatePointer = 0;
        try {
          requestPointer = allocateWasmBytes(module, operation.request);
          if (operation.callbackRegistration !== undefined) {
            callbackPointer = allocateWasmBytes(module, operation.callbackRegistration, 1);
          }
          if (operation.modelUpdate) updatePointer = allocateWasmBytes(module, operation.modelUpdate);
          return await readWasmResult(module, async (length) => await module.ccall(
            'mathopt_incremental_solve',
            'number',
            Array(13).fill('number'),
            [
              toIndex(operation.handle, 'MathOpt incremental solver handle'),
              requestPointer,
              operation.request.length,
              updatePointer,
              operation.modelUpdate?.length ?? 0,
              operation.modelUpdate ? 1 : 0,
              operation.useInterrupter ? 1 : 0,
              operation.interruptAtStart ? 1 : 0,
              length, callbackPointer, operation.callbackRegistration?.length ?? 0, operation.callbackRegistration === undefined ? 0 : callbackId,
              operation.streamMessages ? callbackId : 0,
            ],
            { async: true },
          ) as number);
        } finally {
          if (requestPointer) module._free(requestPointer);
          if (updatePointer) module._free(updatePointer);
          if (callbackPointer) module._free(callbackPointer);
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
