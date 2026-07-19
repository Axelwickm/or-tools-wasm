import {
  decodeSolverBridgeRequest,
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
  encodeSolverBridgeRequest,
  type SolverBridgeCodec,
} from './solver_bridge.js';
import {
  createSolverFailureEvent,
  SolverFailureKind,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
} from './solver_executor.js';

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

type PendingRequest<Response> = {
  resolve(value: Response): void;
  reject(reason: unknown): void;
  onEvent?(value: Response): void | Promise<void>;
  eventChain: Promise<void>;
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
};

export class ManagedWorker<Request, Response> {
  private worker: WorkerLike<Request, Response> | null = null;
  private readyPromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest<Response>>();

  constructor(private readonly options: ManagedWorkerOptions<Request, Response>) {}

  async load(): Promise<void> {
    const worker = await this.ensureReady();
    worker.unref?.();
  }

  async post(request: Request, onEvent?: (value: Response) => void | Promise<void>, transfer?: Transferable[]): Promise<Response> {
    const worker = await this.ensureReady();
    worker.ref?.();
    return new Promise<Response>((resolve, reject) => {
      this.pendingRequests.set(this.options.getRequestId(request), {
        resolve,
        reject,
        onEvent,
        eventChain: Promise.resolve(),
      });
      worker.postMessage(request, transfer);
    });
  }

  terminate(reason?: string): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.readyPromise = null;
    const error = new Error(reason ?? 'Worker terminated.');
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private async ensureReady(): Promise<WorkerLike<Request, Response>> {
    const worker = await this.ensureWorker();
    if (!this.readyPromise) {
      throw new Error('Worker ready state unavailable.');
    }
    await this.readyPromise;
    return worker;
  }

  private async ensureWorker(): Promise<WorkerLike<Request, Response>> {
    if (this.worker) return this.worker;

    const worker = await this.options.createWorker();
    this.worker = worker;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const handleMessage = (message: Response) => {
        if (this.options.isReady?.(message)) {
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
      if (!this.options.isReady) resolve();
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
  private readonly worker: ManagedWorker<Uint8Array, Uint8Array>;

  constructor(
    private readonly codec: SolverBridgeCodec<Request, Response, Event>,
    createWorker: () => Promise<WorkerLike<Uint8Array, Uint8Array>>,
  ) {
    this.solver = codec.solver;
    this.worker = new ManagedWorker({
      createWorker,
      getRequestId: (bytes) => decodeSolverBridgeRequest(bytes).requestId,
      getResponseId: (bytes) => decodeSolverBridgeResponse(bytes).requestId,
      isEvent: (bytes) => {
        const payload = decodeSolverBridgeResponse(bytes).payload.case;
        return payload === 'eventPayload' || payload === 'status';
      },
      loadErrorMessage: (error) =>
        defaultLoadErrorMessage(error).replace('Worker', `${codec.label} worker`),
    });
  }

  execute(request: Request, options: SolverExecutionOptions<Event>): SolverJob<Response> {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options),
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
  ): Promise<Response> {
    const bytes = encodeSolverBridgeRequest({
      requestId,
      solver: this.solver,
      payload: this.codec.encodeRequest(request),
      requestedThreads: options.requestedThreads ?? this.codec.defaultRequestedThreads ?? 0,
    });
    let failureHandled = false;
    try {
      const resultBytes = await this.worker.post(bytes, async (eventBytes) => {
        const outer = decodeSolverBridgeResponse(eventBytes);
        if (outer.payload.case === 'status') {
          await options.onEvent({ type: 'status', status: outer.payload.value });
        } else if (outer.payload.case === 'eventPayload') {
          const event = this.codec.decodeEvent?.(outer.payload.value);
          if (event !== null && event !== undefined) await options.onEvent(event);
        }
      }, [bytes.buffer]);
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
  ): Promise<void> {
    const requestId = this.nextRequestId++;
    const bytes = encodeSolverBridgeCancelRequest(requestId, this.solver, targetRequestId);
    try {
      const responseBytes = await this.worker.post(bytes, undefined, [bytes.buffer]);
      const response = decodeSolverBridgeResponse(responseBytes);
      if (response.payload.case === 'failure') {
        throw new Error(response.payload.value.message);
      }
      if (response.payload.case !== 'cancelled' ||
          response.payload.value.targetRequestId !== targetRequestId) {
        throw new Error(`${this.codec.label} worker returned an invalid cancellation acknowledgement.`);
      }
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.WORKER_CRASH,
        error instanceof Error ? error.stack ?? '' : '',
        true,
      ));
      throw error;
    }
  }
}
