// Bound connection setup, not the duration of a streamed solver job.
export async function serverRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const connection = new AbortController();
  const timer = setTimeout(() => connection.abort(), 10_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, connection.signal]) : connection.signal;
  let response: Response;
  try {
    response = await fetch(input, { ...init, signal });
  } catch (cause) {
    if (init?.signal?.aborted) throw cause;
    throw Object.assign(new Error(
      connection.signal.aborted
        ? 'Server connection timed out. Check that the server is running and the endpoint is correct.'
        : 'Cannot reach the server. Check that it is running, the endpoint is correct, and your browser allows the connection (CORS / HTTPS).',
    ), { cause });
  } finally {
    clearTimeout(timer);
  }
  return response;
}
