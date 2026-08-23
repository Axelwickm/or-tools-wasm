export type AutoExecutorConfiguration = {
  type: 'auto';
};

export type DirectExecutorConfiguration = {
  type: 'direct';
};

export type WorkerExecutorConfiguration = {
  type: 'worker';
};

export type CloudExecutorConfiguration = {
  type: 'cloud';
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
