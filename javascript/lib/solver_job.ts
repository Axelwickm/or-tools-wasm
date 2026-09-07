import type {
  SolverExecutor,
  SolverExecutorEventHandler,
  SolverJobEvent,
  SolverResourceRequest,
} from './solver_executor.js';

export type ExecuteSolverJobOptions<Response, Event> = {
  resources?: SolverResourceRequest;
  onEvent?: SolverExecutorEventHandler<SolverJobEvent | Event>;
  // Commit solver-specific state before deferred callback or abort failures escape.
  onSuccess?(response: Response): void | Promise<void>;
  signal?: AbortSignal;
  abortError(signal: AbortSignal): unknown;
};

export async function executeSolverJob<Request, Response, Event>(
  executor: SolverExecutor<Request, Response, Event>,
  request: Request,
  options: ExecuteSolverJobOptions<Response, Event>,
): Promise<Response> {
  if (options.signal?.aborted) throw options.abortError(options.signal);

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
    abortFailure = { error: options.abortError(options.signal) };
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
    return response;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
