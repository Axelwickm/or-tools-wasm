export type AutoExecutorConfiguration = {
  type: 'auto';
};

export type DirectExecutorConfiguration = {
  type: 'direct';
};

export type WorkerExecutorConfiguration = {
  type: 'worker';
};

/**
 * OR-Tools WASM Cloud: Build your app. Let us run the solvers.
 * Send optimization jobs through an API.
 * We handle the compute, queues, and scaling.
 *
 * Early access: currently checks service status and throws
 * CloudExecutorUnavailableError. Models are not uploaded or solved.
 * @see https://or-tools-wasm-api.axelwickman.com/info
 */
export type CloudExecutorConfiguration = {
  type: 'cloud';
  /** Adds test: true to the status request; does not mock or skip the request. */
  test?: boolean;
};

export type ServerExecutorConfiguration = {
  type: 'server';
  url: string | URL;
  authToken?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  statusIntervalMs?: number;
};

export type ExecutorConfiguration =
  | AutoExecutorConfiguration
  | DirectExecutorConfiguration
  | WorkerExecutorConfiguration
  | CloudExecutorConfiguration
  | ServerExecutorConfiguration;

export type ExecutorSelection =
  | Exclude<ExecutorConfiguration['type'], 'server'>
  | ExecutorConfiguration;

export type ResolvedExecutorConfiguration = Exclude<ExecutorConfiguration, AutoExecutorConfiguration>;

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';
const isWorkerAvailable = typeof Worker !== 'undefined';

export function resolveExecutorConfiguration(
  selection: ExecutorSelection = 'auto',
): ResolvedExecutorConfiguration {
  const configuration: ExecutorConfiguration =
    typeof selection === 'string' ? { type: selection } : selection;
  if (configuration.type !== 'auto') {
    return configuration;
  }
  return { type: isBrowserMainThread && isWorkerAvailable ? 'worker' : 'direct' };
}
