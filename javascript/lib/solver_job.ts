import { printCloudNotice } from './cloud_notice.js';
import type {
  SolverExecutor,
  SolverExecutorEventHandler,
  SolverJobEvent,
  SolverResourceRequest,
} from './solver_executor.js';

export type ExecuteSolverJobOptions<Response, Event> = {
  showCloudNotice?: boolean;
  resources?: SolverResourceRequest;
  onEvent?: SolverExecutorEventHandler<SolverJobEvent | Event>;
  // Commit solver-specific state before deferred callback or abort failures escape.
  onSuccess?(response: Response): void | Promise<void>;
  signal?: AbortSignal;
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
  let eventChain = Promise.resolve();
  const onEvent: SolverExecutorEventHandler<SolverJobEvent | Event> = (event) => {
    eventChain = eventChain.then(async () => {
      if (callbackFailure) return;
      try {
        await options.onEvent?.(event);
      } catch (error) {
        callbackFailure = { error };
      }
    });
    return eventChain;
  };
  const job = executor.execute(request, {
    resources: options.resources,
    onEvent,
  });

  let abortFailure: { error: unknown } | undefined;
  const onAbort = () => {
    if (!options.signal || abortFailure) return;
    abortFailure = { error: createAbortError(options.signal) };
    void job.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  try {
    let response: Response;
    try {
      response = await job.result;
    } catch (error) {
      await eventChain;
      throw error;
    }
    await eventChain;
    await options.onSuccess?.(response);
    if (callbackFailure) throw callbackFailure.error;
    if (abortFailure) throw abortFailure.error;
    if (options.showCloudNotice) printCloudNotice();
    return response;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
