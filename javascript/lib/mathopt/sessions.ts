import type {
  MathOptIncrementalSolveOptions, MathOptSolveOptions, MathOptProtoUpdateOptions,
  MathOptInfeasibleSubsystemOptions, MathOptIncrementalSolverOptions, MathOptSolveResult,
  MathOptIncrementalInfeasibleSubsystemOptions, MathOptProtoIncrementalSolveOptions,
  MathOptProtoIncrementalSolverOptions, MathOptProtoSolveResult,
} from './types.js';
import {
  MathOptSolverType, solveCallbackRegistration, solveInterrupterState, encodeSolveRequest,
} from './parameters.js';
import { createMathOptExecutor, executeMathOptRequest, assertRawMathOptOptions } from './execution.js';
import {
  decodeInfeasibleSubsystemResponse, captureResultIds, decodeSolveResponse, decodeProtoSolveResponse,
} from './results.js';
import { ObserverScope, createAbortError, executeSolverJob } from '../solver_job.js';
import type { MathOptExecutor } from './protocol.js';
import type { ExecutorSelection } from '../executor_configuration.js';
import { decodeMathOptResponse } from './rpc_proto.js';
import { toIndex } from '../int64.js';
import {
  type MathOptProtoInfeasibleSubsystemResult, type MathOptInfeasibleSubsystemResult, captureSubsystemHandles,
  bindInfeasibleSubsystem,
} from './iis.js';
import { type MathOptModelSnapshot, encodeModelSnapshot, encodeModelUpdate } from './model_snapshot.js';
import { type MathOptModel, snapshotModel } from './model.js';
import {
  type MathOptModelProto, encodeMathOptModelProto, type MathOptModelUpdateProto, encodeMathOptModelUpdateProto,
} from './model_proto.js';

class MathOptRuntimeLostError extends Error {
  constructor() {
    super('MathOpt IncrementalSolver runtime was replaced; close it and create a new solver.');
    this.name = 'MathOptRuntimeLostError';
  }
}

abstract class MathOptIncrementalSession<TOptions extends MathOptIncrementalSolveOptions> {
  private readonly initPromise: Promise<number>;
  private handle: number | null = null;
  private runtime: object | undefined;
  private state: 'open' | 'failed' | 'closing' | 'closed' = 'open';
  private activeOperation: Promise<unknown> | null = null;
  private closePromise: Promise<void> | null = null;
  private callbackDepth = 0;
  private readonly eventScope = new ObserverScope();
  private readonly executor: MathOptExecutor;
  readonly options: TOptions;

  constructor(request: () => Uint8Array, readonly solverType: MathOptSolverType | keyof typeof MathOptSolverType,
      options: TOptions & { executor?: ExecutorSelection }) {
    const { executor, ...solveOptions } = options;
    this.executor = createMathOptExecutor(executor);
    this.options = solveOptions as TOptions;
    this.initPromise = this.create(request).finally(() => this.eventScope.finish());
    // Retain eager creation failures for solve/update, without an unhandled rejection.
    void this.initPromise.catch(() => {});
  }

  private async create(requestFactory: () => Uint8Array): Promise<number> {
    const request = requestFactory();
    const createdHandle = (responseBytes: Uint8Array) => {
      const response = decodeMathOptResponse(responseBytes, 'MathOpt incremental solver creation');
      const handleText = response.messages[response.messages.length - 1];
      const handle = handleText === undefined ? 0 : toIndex(BigInt(handleText), 'MathOpt incremental solver handle');
      if (handle <= 0) throw new Error('MathOpt incremental solver creation returned no solver handle.');
      return handle;
    };
    let handle = 0;
    await executeMathOptRequest(this.executor, { type: 'incrementalCreate', request }, this.withLifecycleEvent(this.options),
      responseBytes => { handle = createdHandle(responseBytes); this.handle = handle; },
      runtime => { this.runtime = runtime; },
      async responseBytes => {
        const handle = createdHandle(responseBytes);
        await executeMathOptRequest(this.executor, { type: 'incrementalDelete', handle: BigInt(handle) }, {});
      });
    return handle;
  }

  protected run<T>(action: (handle: number) => Promise<T>): Promise<T> {
    if (this.state === 'failed') return Promise.reject(new Error('MathOpt IncrementalSolver is unusable after a failed operation; close it and create a new solver.'));
    if (this.state !== 'open') return Promise.reject(new Error('MathOpt IncrementalSolver is closed or closing.'));
    if (this.activeOperation) return Promise.reject(new Error('MathOpt IncrementalSolver already has a solve or update in progress.'));
    let operation!: Promise<T>;
    operation = (async () => {
      let handle: number;
      try { handle = await this.initPromise; } catch (error) { this.fail(); throw error; }
      return action(handle);
    })().finally(() => { this.eventScope.finish(); if (this.activeOperation === operation) this.activeOperation = null; });
    this.activeOperation = operation;
    return operation;
  }

  protected fail(): void { if (this.state === 'open') this.state = 'failed'; }

  protected async nativeSolve<T>(handle: number, request: Uint8Array, options: MathOptSolveOptions,
      decode: (bytes: Uint8Array) => T, modelUpdate?: Uint8Array): Promise<T> {
    // A cancellation before dispatch cannot change native session state.
    if (options.signal?.aborted) throw createAbortError(options.signal);
    const callbackRegistration = solveCallbackRegistration(options);
    const interrupterState = solveInterrupterState(options);
    let result!: T;
    let committed = false;
    try {
      await executeMathOptRequest(this.executor, {
        type: 'incrementalSolve', handle: BigInt(handle), request, modelUpdate,
        useInterrupter: interrupterState.useInterrupter, interruptAtStart: interrupterState.interrupted,
        callbackRegistration, streamMessages: Boolean(options.messageCallback || options.onEvent),
      }, this.withLifecycleEvent(options), bytes => { result = decode(bytes); committed = true; }, runtime => this.assertRuntime(runtime));
    } catch (error) { if (!committed) this.fail(); throw error; }
    return result;
  }

  protected async nativeUpdate(handle: number, modelUpdate: Uint8Array, options: MathOptProtoUpdateOptions): Promise<boolean> {
    if (options.signal?.aborted) throw createAbortError(options.signal);
    let updated = false, committed = false;
    try {
      await executeSolverJob(this.executor, { type: 'incrementalUpdate', handle: BigInt(handle), modelUpdate }, {
        signal: options.signal, onEvent: this.withLifecycleEvent(options).onEvent,
        onDispatch: runtime => this.assertRuntime(runtime),
        onSuccess: result => {
          if (!('updated' in result)) throw new Error('MathOpt executor returned the wrong update response.');
          updated = result.updated;
          if (!updated) this.fail();
          committed = true;
        },
      });
    } catch (error) { if (!committed) this.fail(); throw error; }
    return updated;
  }

  protected async nativeInfeasibleSubsystem<T>(handle: number, request: Uint8Array,
      options: MathOptInfeasibleSubsystemOptions, decode: (result: MathOptProtoInfeasibleSubsystemResult) => T,
      modelUpdate?: Uint8Array): Promise<T> {
    if (options.signal?.aborted) throw createAbortError(options.signal);
    const state = solveInterrupterState(options);
    let result!: T, committed = false;
    try {
      await executeMathOptRequest(this.executor, {
        type: 'computeInfeasibleSubsystem', handle: BigInt(handle), request, modelUpdate,
        useInterrupter: state.useInterrupter, interruptAtStart: state.interrupted,
        streamMessages: Boolean(options.messageCallback || options.onEvent),
      }, this.withLifecycleEvent(options), bytes => {
        result = decode(decodeInfeasibleSubsystemResponse(bytes));
        committed = true;
      }, runtime => this.assertRuntime(runtime));
    } catch (error) { if (!committed) this.fail(); throw error; }
    return result;
  }

  close(): Promise<void> {
    if (this.callbackDepth > 0 || this.eventScope.running) return Promise.reject(new Error('MathOpt IncrementalSolver cannot be closed while one of its callbacks is running.'));
    if (this.state === 'closed') return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    let attempt!: Promise<void>;
    attempt = this.closeOnce().then(() => {
      this.handle = null; this.runtime = undefined; this.state = 'closed';
    }).finally(() => { if (this.closePromise === attempt) this.closePromise = null; });
    this.closePromise = attempt;
    return attempt;
  }

  private async closeOnce(): Promise<void> {
    await this.initPromise.catch(() => undefined);
    await this.activeOperation?.catch(() => undefined);
    if (this.handle === null) return;
    try {
      await executeMathOptRequest(this.executor, { type: 'incrementalDelete', handle: BigInt(this.handle) },
        { threads: this.options.threads }, undefined, runtime => this.assertRuntime(runtime));
    } catch (error) {
      // Never use a stale handle against its replacement runtime.
      if (!(error instanceof MathOptRuntimeLostError)) throw error;
    }
  }

  private assertRuntime(runtime: object): void { if (runtime !== this.runtime) throw new MathOptRuntimeLostError(); }

  private withLifecycleEvent<T extends MathOptSolveOptions>(options: T): T {
    if (!options.onEvent && !options.callback && !options.messageCallback) return options;
    const { onEvent, callback, messageCallback } = options;
    return { ...options,
      callback: callback ? data => {
        this.callbackDepth++;
        try { return callback(data); } finally { this.callbackDepth--; }
      } : undefined,
      messageCallback: messageCallback ? messages => {
        this.callbackDepth++;
        try { return messageCallback(messages); } finally { this.callbackDepth--; }
      } : undefined,
      onEvent: onEvent ? this.eventScope.wrap(onEvent) : undefined,
    };
  }
}

export class MathOptIncrementalSolver extends MathOptIncrementalSession<MathOptIncrementalSolveOptions> {
  private checkpoint: MathOptModelSnapshot;
  private readonly removeNames: boolean;

  constructor(readonly model: MathOptModel, solverType: MathOptSolverType | keyof typeof MathOptSolverType = MathOptSolverType.GLOP,
      options: MathOptIncrementalSolverOptions = {}) {
    const checkpoint = snapshotModel(model);
    super(() => encodeSolveRequest(model, { ...options, solverType },
      encodeModelSnapshot(model.name, checkpoint, options)), solverType, options);
    this.checkpoint = checkpoint;
    this.removeNames = options.removeNames ?? false;
  }

  async solve(options: MathOptIncrementalSolveOptions = {}): Promise<MathOptSolveResult> {
    if ('removeNames' in options) throw new TypeError('MathOpt IncrementalSolver removeNames is fixed at construction.');
    const merged = { ...this.options, ...options, solverType: this.solverType, removeNames: this.removeNames };
    const submitted = snapshotModel(this.model);
    const request = encodeSolveRequest(this.model, merged, encodeModelSnapshot(this.model.name, submitted, merged));
    const names = captureResultIds(this.model);
    return this.run(handle => {
      const update = encodeModelUpdate(this.checkpoint, submitted, { removeNames: this.removeNames });
      return this.nativeSolve(handle, request, merged, bytes => {
        const result = decodeSolveResponse(bytes, this.model, names);
        this.checkpoint = submitted;
        return result;
      }, update ?? undefined);
    });
  }

  async computeInfeasibleSubsystem(options: MathOptIncrementalInfeasibleSubsystemOptions = {}): Promise<MathOptInfeasibleSubsystemResult> {
    const merged = incrementalInfeasibleSubsystemOptions(this.options, options, this.solverType);
    const submitted = snapshotModel(this.model);
    const request = encodeSolveRequest(new Uint8Array(), merged,
      encodeModelSnapshot(this.model.name, submitted, { removeNames: this.removeNames }));
    const handles = captureSubsystemHandles(this.model);
    return this.run(handle => {
      const update = encodeModelUpdate(this.checkpoint, submitted, { removeNames: this.removeNames });
      return this.nativeInfeasibleSubsystem(handle, request, merged, result => {
        const bound = bindInfeasibleSubsystem(result.response, handles, result.messages);
        this.checkpoint = submitted;
        return bound;
      }, update ?? undefined);
    });
  }

}

export class MathOptProtoIncrementalSolver extends MathOptIncrementalSession<MathOptProtoIncrementalSolveOptions> {
  constructor(model: Uint8Array | MathOptModelProto, solverType: MathOptSolverType | keyof typeof MathOptSolverType = MathOptSolverType.GLOP,
      options: MathOptProtoIncrementalSolverOptions = {}) {
    assertRawMathOptOptions(options);
    super(() => encodeSolveRequest(encodeMathOptModelProto(model), { ...options, solverType }), solverType, options);
  }

  async solve(options: MathOptProtoIncrementalSolveOptions = {}): Promise<MathOptProtoSolveResult> {
    const merged = { ...this.options, ...options, solverType: this.solverType };
    assertRawMathOptOptions(merged);
    const request = encodeSolveRequest(new Uint8Array(), merged);
    return this.run(handle => this.nativeSolve(handle, request, merged, decodeProtoSolveResponse));
  }

  async update(modelUpdate: Uint8Array | MathOptModelUpdateProto, options: MathOptProtoUpdateOptions = {}): Promise<boolean> {
    const bytes = encodeMathOptModelUpdateProto(modelUpdate);
    const merged = { signal: this.options.signal, onEvent: this.options.onEvent, ...options };
    return this.run(handle => this.nativeUpdate(handle, bytes, merged));
  }

  async computeInfeasibleSubsystem(options: MathOptIncrementalInfeasibleSubsystemOptions = {}): Promise<MathOptProtoInfeasibleSubsystemResult> {
    const merged = incrementalInfeasibleSubsystemOptions(this.options, options, this.solverType);
    const request = encodeSolveRequest(new Uint8Array(), merged);
    return this.run(handle => this.nativeInfeasibleSubsystem(handle, request, merged, result => result));
  }
}

function incrementalInfeasibleSubsystemOptions(defaults: MathOptSolveOptions,
    options: MathOptIncrementalInfeasibleSubsystemOptions, solverType: MathOptSolveOptions['solverType']): MathOptInfeasibleSubsystemOptions {
  // Solve-only settings, including optimization callbacks, do not apply to IIS.
  const { interrupter, messageCallback, timeLimitSeconds, nodeLimit, threads, enableOutput, randomSeed, gscip, onEvent, signal } = defaults;
  return { interrupter, messageCallback, timeLimitSeconds, nodeLimit, threads, enableOutput, randomSeed, gscip, onEvent, signal,
    ...options, solverType };
}
