import {
  decodeSolverBridgeRequest,
  decodeSolverBridgeResponse,
  encodeSolverBridgeRequest,
  type SolverBridgeCodec,
} from './solver_bridge.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobCancelledError,
  SolverExecutorBusyError,
  SolverJobState,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
} from './solver_executor.js';
import type {
  SolverWorkerCancellationMessage,
  SolverWorkerMessage,
} from './solver_worker.js';

export type WorkerLike<Request, Response> = {
  postMessage(message: Request, transfer?: Transferable[]): void;
  terminate(): void | Promise<number>;
  ref?(): void;
  unref?(): void;
  onmessage?: ((event: MessageEvent<Response>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  on?(event: 'message', listener: (message: Response) => void): void;
  on?(event: 'error', listener: (error: Error) => void): void;
};

export type SolverWorkerLike = WorkerLike<Uint8Array, SolverWorkerMessage>;

type PendingRequest<Response> = {
  resolve(value: Response): void;
  reject(reason: unknown): void;
  onEvent?(value: Response): void | Promise<void>;
  eventChain: Promise<void>;
};

type WorkerJobState<Request> = {
  cancelled: boolean;
  createdAtMs: bigint;
  request: Request;
  error?: Error;
};

export type ManagedWorkerOptions<Request, Response> = {
  createWorker(): Promise<WorkerLike<Request, Response>>;
  isReady?(message: Response): boolean;
  getRequestId(request: Request): number;
  getResponseId(message: Response): number | undefined;
  isEvent?(message: Response): boolean;
  isError?(message: Response): boolean;
  errorMessage?(message: Response): string;
  loadErrorMessage?(error: Error | ErrorEvent): string;
  handleMessage?(message: Response): boolean;
};

export class ManagedWorker<Request, Response> {
  private worker: WorkerLike<Request, Response> | null = null;
  private workerPromise: Promise<WorkerLike<Request, Response>> | null = null;
  private readyPromise: Promise<void> | null = null;
  private rejectReady: ((reason: unknown) => void) | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest<Response>>();
  private generation = 0;
  private terminationError: Error = new Error('Worker terminated.');

  constructor(private readonly options: ManagedWorkerOptions<Request, Response>) {}

  async load(): Promise<void> {
    const worker = await this.ensureReady();
    worker.unref?.();
  }

  async post(
    request: Request,
    onEvent?: (value: Response) => void | Promise<void>,
    transfer?: Transferable[],
    beforePost?: () => void,
  ): Promise<Response> {
    const generation = this.generation;
    const worker = await this.ensureReady(generation);
    worker.ref?.();
    return new Promise<Response>((resolve, reject) => {
      beforePost?.();
      this.pendingRequests.set(this.options.getRequestId(request), {
        resolve,
        reject,
        onEvent,
        eventChain: Promise.resolve(),
      });
      worker.postMessage(request, transfer);
    });
  }

  terminate(reason?: string | Error): void {
    const error = reason instanceof Error
      ? reason
      : new Error(reason ?? 'Worker terminated.');
    this.generation++;
    this.terminationError = error;
    this.worker?.terminate();
    this.worker = null;
    this.workerPromise = null;
    this.rejectReady?.(error);
    this.rejectReady = null;
    this.readyPromise = null;
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private async ensureReady(generation = this.generation): Promise<WorkerLike<Request, Response>> {
    const worker = await this.ensureWorker(generation);
    if (!this.readyPromise) {
      throw new Error('Worker ready state unavailable.');
    }
    await this.readyPromise;
    if (generation !== this.generation) throw this.terminationError;
    return worker;
  }

  private async ensureWorker(generation: number): Promise<WorkerLike<Request, Response>> {
    if (generation !== this.generation) throw this.terminationError;
    if (this.worker) return this.worker;

    this.workerPromise ??= this.options.createWorker();
    const worker = await this.workerPromise;
    if (generation !== this.generation) {
      worker.terminate();
      throw this.terminationError;
    }
    this.worker = worker;
    this.workerPromise = null;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      const handleMessage = (message: Response) => {
        if (this.options.handleMessage?.(message)) return;
        if (this.options.isReady?.(message)) {
          this.rejectReady = null;
          resolve();
          return;
        }

        const id = this.options.getResponseId(message);
        const pending = id === undefined ? undefined : this.pendingRequests.get(id);

        if (this.options.isEvent?.(message)) {
          if (pending?.onEvent) {
            pending.eventChain = pending.eventChain
              .then(() => pending.onEvent?.(message))
              .catch((error) => {
                if (this.pendingRequests.get(id!) === pending) {
                  this.pendingRequests.delete(id!);
                }
                pending.reject(error);
                if (this.pendingRequests.size === 0) worker.unref?.();
              });
          }
          return;
        }

        if (this.options.isError?.(message)) {
          const error = new Error(this.options.errorMessage?.(message) ?? 'Worker request failed.');
          if (pending) {
            pending.reject(error);
            this.pendingRequests.delete(id!);
            if (this.pendingRequests.size === 0) worker.unref?.();
          } else {
            reject(error);
          }
          return;
        }

        if (pending) {
          this.pendingRequests.delete(id!);
          pending.eventChain.then(
            () => {
              pending.resolve(message);
              if (this.pendingRequests.size === 0) worker.unref?.();
            },
            (error) => {
              pending.reject(error);
              if (this.pendingRequests.size === 0) worker.unref?.();
            },
          );
        }
      };

      const handleError = (errorLike: Error | ErrorEvent) => {
        const message = this.options.loadErrorMessage?.(errorLike)
          ?? defaultLoadErrorMessage(errorLike);
        const error = new Error(message);
        this.rejectReady = null;
        reject(error);
        this.terminate(error.message);
      };

      if (typeof worker.on === 'function') {
        worker.on('message', handleMessage);
        worker.on('error', handleError);
      } else {
        worker.onmessage = (event: MessageEvent<Response>) => handleMessage(event.data);
        worker.onerror = handleError;
      }
      if (!this.options.isReady) {
        this.rejectReady = null;
        resolve();
      }
    });

    return worker;
  }
}

export function defaultLoadErrorMessage(errorLike: Error | ErrorEvent): string {
  const detail = errorLike instanceof Error
    ? errorLike.message
    : errorLike.error instanceof Error
      ? errorLike.error.message
      : errorLike.message || 'The runtime blocked or failed to load the worker module.';
  return `Worker failed to load: ${detail}`;
}

export class SolverWorkerExecutor<Request, Response, Event>
implements SolverExecutor<Request, Response, Event> {
  readonly solver: string;
  private nextRequestId = 1;
  private readonly worker: ManagedWorker<Uint8Array, SolverWorkerMessage>;
  private activeJob: WorkerJobState<Request> | null = null;
  private cancellation: SolverWorkerCancellationMessage | null = null;

  constructor(
    private readonly codec: SolverBridgeCodec<Request, Response, Event>,
    createWorker: () => Promise<SolverWorkerLike>,
    private readonly supportsSharedCancellation:
      | boolean
      | ((request: Request) => boolean) = false,
  ) {
    this.solver = codec.solver;
    this.worker = new ManagedWorker({
      createWorker,
      isReady: (bytes) => {
        if (!(bytes instanceof Uint8Array)) return false;
        const response = decodeSolverBridgeResponse(bytes);
        return response.solver === this.solver && response.payload.case === 'ready';
      },
      getRequestId: (bytes) => decodeSolverBridgeRequest(bytes).requestId,
      getResponseId: (bytes) => bytes instanceof Uint8Array
        ? decodeSolverBridgeResponse(bytes).requestId
        : undefined,
      isEvent: (bytes) => {
        if (!(bytes instanceof Uint8Array)) return false;
        const payload = decodeSolverBridgeResponse(bytes).payload.case;
        return payload === 'eventPayload' || payload === 'status';
      },
      handleMessage: (message) => {
        if (message instanceof Uint8Array) return false;
        this.cancellation = message;
        return true;
      },
      loadErrorMessage: (error) =>
        defaultLoadErrorMessage(error).replace('Worker', `${codec.label} worker`),
    });
  }

  execute(request: Request, options: SolverExecutionOptions<Event>): SolverJob<Response> {
    if (this.activeJob) throw new SolverExecutorBusyError(this.codec.label);
    const requestId = this.nextRequestId++;
    const state: WorkerJobState<Request> = {
      cancelled: false,
      createdAtMs: BigInt(Date.now()),
      request,
    };
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, request, options, state).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: () => this.cancel(requestId, options, state),
    };
  }

  async load(): Promise<void> {
    await this.worker.load();
  }

  terminate(reason?: string): void {
    this.worker.terminate(reason ?? `${this.codec.label} worker executor terminated.`);
  }

  private async run(
    requestId: number,
    request: Request,
    options: SolverExecutionOptions<Event>,
    state: WorkerJobState<Request>,
  ): Promise<Response> {
    const bytes = encodeSolverBridgeRequest({
      requestId,
      solver: this.solver,
      payload: this.codec.encodeRequest(request),
    });
    let failureHandled = false;
    try {
      const resultBytes = await this.worker.post(bytes, async (eventBytes) => {
        if (!(eventBytes instanceof Uint8Array)) return;
        const outer = decodeSolverBridgeResponse(eventBytes);
        if (outer.payload.case === 'status') {
          await options.onEvent({ type: 'status', status: outer.payload.value });
        } else if (outer.payload.case === 'eventPayload') {
          const event = this.codec.decodeEvent?.(outer.payload.value);
          if (event !== null && event !== undefined) await options.onEvent(event);
        }
      }, [bytes.buffer], () => {
        if (this.cancellation) {
          Atomics.store(
            new Uint8Array(this.cancellation.memory),
            this.cancellation.byteOffset,
            0,
          );
        }
        if (state.cancelled) throw state.error;
      });
      if (!(resultBytes instanceof Uint8Array)) {
        throw new Error(`${this.codec.label} worker returned an invalid message.`);
      }
      if (state.cancelled) throw state.error;
      const outer = decodeSolverBridgeResponse(resultBytes);
      if (outer.payload.case === 'failure') {
        failureHandled = true;
        await options.onEvent({ type: 'failure', failure: outer.payload.value });
        const error = new Error(outer.payload.value.message);
        if (outer.payload.value.trace) error.stack = outer.payload.value.trace;
        throw error;
      }
      if (outer.payload.case !== 'resultPayload') {
        throw new Error(
          `${this.codec.label} worker returned unexpected response: ${outer.payload.case ?? 'empty'}`,
        );
      }
      return this.codec.decodeResult(outer.payload.value);
    } catch (error) {
      if (state.cancelled) {
        await options.onEvent(createSolverJobStatusEvent(
          this.solver,
          requestId,
          SolverJobState.CANCELLED,
          state.createdAtMs,
        ));
        throw state.error ?? error;
      }
      if (!failureHandled) {
        await options.onEvent(createSolverFailureEvent(
          this.solver,
          requestId,
          error instanceof Error ? error.message : String(error),
          SolverFailureKind.WORKER_CRASH,
          error instanceof Error ? error.stack ?? '' : '',
          true,
        ));
      }
      throw error;
    }
  }

  private async cancel(
    targetRequestId: number,
    options: SolverExecutionOptions<Event>,
    state: WorkerJobState<Request>,
  ): Promise<void> {
    if (this.activeJob !== state || state.cancelled) return;
    state.cancelled = true;
    state.error = new SolverJobCancelledError(this.codec.label, targetRequestId);
    await options.onEvent(createSolverJobStatusEvent(
      this.solver,
      targetRequestId,
      SolverJobState.CANCELLING,
      state.createdAtMs,
    ));
    const supportsSharedCancellation = typeof this.supportsSharedCancellation === 'function'
      ? this.supportsSharedCancellation(state.request)
      : this.supportsSharedCancellation;
    if (!supportsSharedCancellation) {
      this.worker.terminate(state.error);
      return;
    }
    await this.worker.load();
    if (!this.cancellation) {
      throw new Error(`${this.codec.label} worker did not provide a cancellation signal.`);
    }
    Atomics.store(
      new Uint8Array(this.cancellation.memory),
      this.cancellation.byteOffset,
      1,
    );
  }
}
