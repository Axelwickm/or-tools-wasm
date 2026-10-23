import { printCloudNotice } from './cloud_notice.js';
import type {
  SolverExecutor,
  SolverExecutorEventHandler,
  SolverJobEvent,
  SolverResourceRequest,
  SolverJob,
} from './solver_executor.js';

export type ExecuteSolverJobOptions<Response, Event> = {
  showCloudNotice?: boolean;
  resources?: SolverResourceRequest;
  onDispatch?: (runtime: object) => void;
  onEvent?: SolverExecutorEventHandler<SolverJobEvent | Event>;
  // Native one-way notifications can invoke a synchronous observer during search.
  onEventSync?: (event: SolverJobEvent | Event) => void;
  onCallback?: (payload: Uint8Array) => Uint8Array;
  // Commit solver-specific state before deferred callback or abort failures escape.
  onSuccess?(response: Response): void | Promise<void>;
  onAbandonedResult?: (payload: Uint8Array) => void | Promise<void>;
  signal?: AbortSignal;
  // Native interruption may return a useful stopped result instead of throwing.
  interruptSignal?: AbortSignal;
};

// Reentrant close is unsafe while an operation is awaiting its observer. Once
// the operation ends, a detached observer must not keep the session unclosable.
export class ObserverScope {
  private current: object | undefined;
  get running(): boolean { return this.current !== undefined; }
  finish(): void { this.current = undefined; }

  wrap<Event>(handler: SolverExecutorEventHandler<Event>): SolverExecutorEventHandler<Event> {
    return async event => {
      const marker = this.current = {};
      try { await handler(event); }
      finally { if (this.current === marker) this.current = undefined; }
    };
  }
}

export function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const message = signal.reason === undefined ? 'The solver job was aborted.' : String(signal.reason);
  if (typeof DOMException !== 'undefined') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export async function executeSolverJob<Request, Response, Event>(
  executor: SolverExecutor<Request, Response, Event>,
  request: Request,
  options: ExecuteSolverJobOptions<Response, Event>,
): Promise<Response> {
  if (options.signal?.aborted) throw createAbortError(options.signal);

  let callbackFailure: { error: unknown } | undefined;
  let nativeCallbackFailure: { error: unknown } | undefined;
  let eventChain = Promise.resolve();
  let job: SolverJob<Response> | undefined;
  let observersStopped = false;
  let releaseObservers!: () => void;
  let releaseCurrentObserver: (() => void) | undefined;
  const observerStop = new Promise<void>(resolve => { releaseObservers = resolve; });
  const stopObservers = () => {
    observersStopped = true;
    releaseCurrentObserver?.();
    releaseObservers();
  };
  const failObserver = (error: unknown) => {
    if (callbackFailure) return;
    callbackFailure = { error };
    stopObservers();
    // Synchronous notifications can arrive before execute() returns its job.
    if (job) void job.cancel().catch(() => {});
    else queueMicrotask(() => { void job?.cancel().catch(() => {}); });
  };
  const onEvent = (event: SolverJobEvent | Event): void => {
    if (observersStopped || options.signal?.aborted) return;
    if (!callbackFailure) {
      try { options.onEventSync?.(event); } catch (error) { failObserver(error); }
    }
    if (!options.onEvent || observersStopped) return;
    eventChain = eventChain.then(async () => {
      if (observersStopped) return;
      try {
        // Cancellation releases the event queue without awaiting unrelated
        // user work. Promise.race still consumes a late observer rejection.
        const observed = options.onEvent!(event);
        const cancelled = new Promise<void>(resolve => {
          if (observersStopped) resolve();
          else releaseCurrentObserver = resolve;
        });
        // Only this in-flight observer has a cancellation waiter. Racing each
        // event against a shared pending promise would retain settled events.
        try { await Promise.race([observed, cancelled]); }
        finally { releaseCurrentObserver = undefined; }
      } catch (error) {
        // A failed observer cannot consume further progress. Stop native work
        // when the executor supports cancellation, retaining the original error.
        failObserver(error);
      }
    });
    // Executors receive synchronous ingress; this layer owns observer order,
    // failures and draining instead of retaining the same promises twice.
  };
  job = executor.execute(request, {
    resources: options.resources,
    onDispatch: options.onDispatch,
    onAbandonedResult: options.onAbandonedResult,
    onEvent,
    onCallback: options.onCallback ? (payload) => {
      if (nativeCallbackFailure) throw nativeCallbackFailure.error;
      try { return options.onCallback!(payload); }
      catch (error) { nativeCallbackFailure ??= { error }; stopObservers(); throw error; }
    } : undefined,
  });

  let abortFailure: { error: unknown } | undefined;
  const onAbort = () => {
    if (!options.signal || abortFailure) return;
    abortFailure = { error: createAbortError(options.signal) };
    stopObservers();
    void job?.cancel().catch(() => {});
  };
  const onInterrupt = () => { if (job) void (job.interrupt?.() ?? job.cancel()).catch(() => {}); };
  // Preserve the native result for pre-interrupted requests too. Solvers may
  // also encode this state; never substitute cancellation before dispatch.
  if (options.interruptSignal?.aborted) void job.interrupt?.().catch(() => {});
  else options.interruptSignal?.addEventListener('abort', onInterrupt, { once: true });
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  try {
    let response: Response;
    try {
      response = await job.result;
    } catch (error) {
      stopObservers();
      await Promise.race([eventChain, observerStop]);
      // A cancellation caused by a callback must not hide that callback's failure.
      if (nativeCallbackFailure) throw nativeCallbackFailure.error;
      // A transport deadline can settle a stop requested by the caller before
      // the executor's cancellation deadline; preserve that caller's reason.
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' && abortFailure)) {
        if (callbackFailure) throw callbackFailure.error;
        if (abortFailure) throw abortFailure.error;
      }
      throw error;
    }
    await Promise.race([eventChain, observerStop]);
    await options.onSuccess?.(response);
    if (nativeCallbackFailure) throw nativeCallbackFailure.error;
    if (callbackFailure) throw callbackFailure.error;
    if (abortFailure) throw abortFailure.error;
    if (options.showCloudNotice) printCloudNotice();
    return response;
  } finally {
    stopObservers();
    options.signal?.removeEventListener('abort', onAbort);
    options.interruptSignal?.removeEventListener('abort', onInterrupt);
  }
}
