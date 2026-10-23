/** Reject asynchronous native callback replies while consuming rejected promises. */
export function synchronousCallbackResult<T>(result: T, errorMessage: string): T {
  if (result && typeof (result as { then?: unknown }).then === 'function') {
    void Promise.resolve(result).catch(() => undefined);
    throw new TypeError(errorMessage);
  }
  return result;
}
