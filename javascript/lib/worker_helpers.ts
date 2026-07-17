type WorkerLike<Request, Response> = {
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
