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
  signal?: AbortSignal;
  // Native interruption may return a useful stopped result instead of throwing.
  interruptSignal?: AbortSignal;
};

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
  const failObserver = (error: unknown) => {
    if (callbackFailure) return;
    callbackFailure = { error };
    // Synchronous notifications can arrive before execute() returns its job.
    if (job) void job.cancel().catch(() => {});
    else queueMicrotask(() => { void job?.cancel().catch(() => {}); });
  };
  const onEvent: SolverExecutorEventHandler<SolverJobEvent | Event> = (event) => {
    if (!callbackFailure) {
      try { options.onEventSync?.(event); } catch (error) { failObserver(error); }
    }
    if (!options.onEvent) return eventChain;
    eventChain = eventChain.then(async () => {
      if (callbackFailure) return;
      try {
        await options.onEvent?.(event);
      } catch (error) {
        // A failed observer cannot consume further progress. Stop native work
        // when the executor supports cancellation, retaining the original error.
        failObserver(error);
      }
    });
    return eventChain;
  };
  job = executor.execute(request, {
    resources: options.resources,
    onDispatch: options.onDispatch,
    onEvent,
    onCallback: options.onCallback ? (payload) => {
      if (nativeCallbackFailure) throw nativeCallbackFailure.error;
      try { return options.onCallback!(payload); }
      catch (error) { nativeCallbackFailure ??= { error }; throw error; }
    } : undefined,
  });

  let abortFailure: { error: unknown } | undefined;
  const onAbort = () => {
    if (!options.signal || abortFailure) return;
    abortFailure = { error: createAbortError(options.signal) };
    void job?.cancel().catch(() => {});
  };
  const onInterrupt = () => { if (job) void (job.interrupt?.() ?? job.cancel()).catch(() => {}); };
  // A pre-interrupted native request is encoded by its solver; preserve its
  // normal result/status path instead of cancelling before it starts.
  if (!options.interruptSignal?.aborted)
    options.interruptSignal?.addEventListener('abort', onInterrupt, { once: true });
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  try {
    let response: Response;
    try {
      response = await job.result;
    } catch (error) {
      await eventChain;
      // A cancellation caused by a callback must not hide that callback's failure.
      if (nativeCallbackFailure) throw nativeCallbackFailure.error;
      if (error instanceof Error && error.name === 'AbortError') {
        if (callbackFailure) throw callbackFailure.error;
        if (abortFailure) throw abortFailure.error;
      }
      throw error;
    }
    await eventChain;
    await options.onSuccess?.(response);
    if (nativeCallbackFailure) throw nativeCallbackFailure.error;
    if (callbackFailure) throw callbackFailure.error;
    if (abortFailure) throw abortFailure.error;
    if (options.showCloudNotice) printCloudNotice();
    return response;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    options.interruptSignal?.removeEventListener('abort', onInterrupt);
  }
}
