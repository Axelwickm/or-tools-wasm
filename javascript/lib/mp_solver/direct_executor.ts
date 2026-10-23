import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
import { loadMPSolverRuntime } from '../runtime_loader.js';
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
import type {
  MpSolverExecutor,
  MpSolverLogEvent,
  MpSolverJob,
  MpSolverOperation,
  MpSolverResult,
} from './protocol.js';
import { mpSolverProtocol } from './protocol.js';

export class DirectMpSolverExecutor implements MpSolverExecutor {
  readonly solver = 'mp-solver';

  private nextRequestId = 1;
  private activeJob: { cancelled: boolean; nativeRunning: boolean; interruptible: boolean } | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadMPSolverRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(
    operation: MpSolverOperation,
    options: SolverExecutionOptions<MpSolverLogEvent>,
  ): MpSolverJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = { cancelled: false, nativeRunning: false, interruptible: (operation.type === 'solve' || operation.type === 'sessionRun') && operation.interruptible };
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: async () => {
        state.cancelled = true;
        const module = await this.module();
        if (this.activeJob === state && state.nativeRunning && state.interruptible) {
          const address = module._mp_solver_interrupt_address ?? module.mp_solver_interrupt_address;
          if (typeof address !== 'function') throw new Error('MPSolver interrupt address export unavailable.');
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
    operation: MpSolverOperation,
    options: SolverExecutionOptions<MpSolverLogEvent>,
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
      const result = await withWasmRuntimeLock(module, async () => {
        options.onDispatch?.(module);
        const state = this.activeJob!;
        if (state.cancelled) throw Object.assign(new Error('MPSolver solve was cancelled.'), { name: 'AbortError' });
        if ((operation.type === 'solve' || operation.type === 'sessionRun') && operation.callbackRegistration !== undefined && !options.onCallback)
          throw new Error('MPSolver callback registration requires a handler.');
        state.nativeRunning = operation.type === 'solve' || (operation.type === 'sessionRun' && operation.action === 0);
        const messages: Map<number, (payload: Uint8Array) => void> = module.__mpSolverMessages ??= new Map();
        if ((operation.type === 'solve' || operation.type === 'sessionRun') && operation.streamMessages)
          messages.set(requestId, payload => { void options.onEvent(mpSolverProtocol.decodeEvent!(payload)!); });
        const callbacks: Map<number, (payload: Uint8Array) => number> = module.__mpSolverCallbacks ??= new Map();
        let callbackFailure: { error: unknown } | undefined;
        if ((operation.type === 'solve' || operation.type === 'sessionRun') && operation.callbackRegistration !== undefined) {
          callbacks.set(requestId, payload => {
            let reply: Uint8Array;
            try { reply = options.onCallback!(payload); }
            catch (error) { if (error instanceof SolverCallbackTransportError) callbackFailure ??= { error }; return 0; }
            let pointer = 0;
            try {
              pointer = allocateWasm(module, 4 + reply.length);
              new DataView(module.HEAPU8.buffer).setUint32(pointer, reply.length, true);
              module.HEAPU8.set(reply, pointer + 4);
              return pointer;
            } catch (error) {
              if (pointer) module._free(pointer);
              callbackFailure ??= { error };
              return 0;
            }
          });
        }
        try {
          const result = await this.executeNative(module, operation, requestId);
          if (callbackFailure) throw callbackFailure.error;
          return result;
        } finally { callbacks.delete(requestId); messages.delete(requestId); state.nativeRunning = false; }
      });
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
    requestId: number,
  ): Promise<MpSolverResult> {
    if (operation.type === 'clampSolution' || operation.type === 'capabilities' || operation.type === 'loadSolution' || operation.type === 'exportModel' || operation.type === 'activities' || operation.type === 'sessionCreate' || operation.type === 'sessionRun' || operation.type === 'sessionClose' || (operation.type === 'solve' && (operation.streamMessages || operation.editableSnapshot || operation.startingBasis || operation.callbackRegistration))) {
      const bytes = mpSolverProtocol.encodeRequest(operation);
      const pointer = allocateWasmBytes(module, bytes);
      try {
        const response = await readWasmResult(module, async length => {
          const query = operation.type === 'clampSolution' || operation.type === 'capabilities' || operation.type === 'loadSolution' || operation.type === 'exportModel' || operation.type === 'activities';
          const entrypoint = query ? 'mp_solver_model_query_request'
            : operation.type === 'solve' ? 'mp_solver_solve_bridge_request' : 'mp_solver_session_request';
          const arguments_ = [pointer, bytes.length, length];
          if (!query) arguments_.push(requestId);
          const result = await module.ccall(entrypoint, 'number',
            arguments_.map(() => 'number'), arguments_, { async: true }) as number;
          if (!result) throw new Error(module.ccall('mp_solver_bridge_error', 'string', [], []) as string);
          return result;
        });
        return mpSolverProtocol.decodeResult(response);
      } finally { module._free(pointer); }
    }
    if (operation.type === 'schema') {
      return {
        type: 'schema',
        backendVersions: JSON.parse(module.ccall('mp_solver_backend_versions', 'string', [], []) as string),
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

    if (operation.type === 'verifySolution') {
      const modelPointer = allocateWasmBytes(module, operation.model);
      let solutionPointer = 0;
      try {
        solutionPointer = allocateWasmBytes(module, operation.solution);
        const verified = await module.ccall('mp_solver_verify_solution_proto', 'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [modelPointer, operation.model.length, solutionPointer, operation.solution.length,
            operation.solverType, operation.tolerance, operation.logErrors ? 1 : 0], { async: true }) as number;
        if (verified < 0) throw new Error(module.ccall('mp_solver_last_verification_error', 'string', [], []) as string);
        return { type: 'verifySolution', verified: verified === 1 };
      } finally {
        module._free(modelPointer);
        if (solutionPointer) module._free(solutionPointer);
      }
    }

    if (operation.type === 'validateParameters') {
      const bytes = new TextEncoder().encode(operation.parameters);
      const pointer = allocateWasmBytes(module, bytes);
      try {
        const accepted = await module.ccall('mp_solver_validate_solver_specific_parameters', 'number',
          ['number', 'number', 'number'], [operation.solverType, pointer, bytes.length], { async: true }) as number;
        if (accepted < 0) throw new Error('MPSolver parameter validation backend is unavailable.');
        return { type: 'validateParameters', accepted: accepted === 1 };
      } finally { module._free(pointer); }
    }

    if (operation.type === 'validateModel') {
      const pointer = allocateWasmBytes(module, operation.model);
      try {
        return { type: 'validateModel', error: module.ccall('mp_solver_find_error_in_model_proto', 'string',
          ['number', 'number'], [pointer, operation.model.length]) as string };
      } finally { module._free(pointer); }
    }
    if (operation.type === 'importModel') {
      const pointer = allocateWasmBytes(module, operation.model);
      try {
        const model = await readWasmResult(module, async length => await module.ccall('mp_solver_import_model', 'number',
          ['number', 'number', 'number', 'string', 'number', 'number'],
          [pointer, operation.model.length, operation.solverType, operation.name, operation.keepNames ? 1 : 0, length], { async: true }) as number);
        return { type: 'importModel', model,
          status: module.ccall('mp_solver_last_import_status', 'number', [], []) as number,
          error: module.ccall('mp_solver_last_import_error', 'string', [], []) as string };
      } finally { module._free(pointer); }
    }
    const requestPointer = allocateWasmBytes(module, operation.request);
    let parametersHandle = 0;
    try {
      if (operation.parameters) {
        parametersHandle = module.ccall('mp_solver_parameters_create', 'number', [], []) as number;
        if (!parametersHandle) throw new Error('MPSolver: failed to create solve parameters.');
        for (const [key, value] of Object.entries(operation.parameters.doubleParams)) {
          module.ccall('mp_solver_parameters_set_double_param', null,
            ['number', 'number', 'number'], [parametersHandle, Number(key), value]);
        }
        for (const [key, value] of Object.entries(operation.parameters.integerParams)) {
          module.ccall('mp_solver_parameters_set_integer_param', null,
            ['number', 'number', 'number'], [parametersHandle, Number(key), value]);
        }
      }
      const response = await readWasmResult(module, async (length) => await module.ccall(
        parametersHandle
          ? 'mp_solver_solve_model_request_with_parameters'
          : operation.numThreads > 1
          ? 'mp_solver_solve_model_request_with_threads'
          : 'mp_solver_solve_model_request',
        'number',
        parametersHandle
          ? ['number', 'number', 'number', 'number', 'number', 'number']
          : operation.numThreads > 1
          ? ['number', 'number', 'number', 'number', 'number']
          : ['number', 'number', 'number', 'number'],
        parametersHandle
          ? [requestPointer, operation.request.length, operation.numThreads,
            parametersHandle, operation.interruptible ? 1 : 0, length]
          : operation.numThreads > 1
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
      const native = parametersHandle ? JSON.parse(module.ccall('mp_solver_last_solve_metadata', 'string', [], []) as string) : {};
      const metadata = native.solverVersion ? { ...native, iterations: BigInt(native.iterations), nodes: BigInt(native.nodes), exactConditionNumber: native.exactConditionNumber === undefined ? undefined : Number(native.exactConditionNumber) } : undefined;
      return { type: 'solve', response, metadata };
    } finally {
      if (parametersHandle) module.ccall('mp_solver_parameters_delete', null, ['number'], [parametersHandle]);
      if (requestPointer) module._free(requestPointer);
    }
  }
}
