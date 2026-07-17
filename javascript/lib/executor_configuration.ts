export type AutoExecutorConfiguration = {
  type: 'auto';
};

export type DirectExecutorConfiguration = {
  type: 'direct';
};

export type WorkerExecutorConfiguration = {
  type: 'worker';
};

type ServerEndpointConfiguration =
  | { host: string | URL; url?: never }
  | { host?: never; url: string | URL };

export type ServerExecutorConfiguration = ServerEndpointConfiguration & {
  type: 'server';
  authToken?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  statusIntervalMs?: number;
};

export type ExecutorConfiguration =
  | AutoExecutorConfiguration
  | DirectExecutorConfiguration
  | WorkerExecutorConfiguration
  | ServerExecutorConfiguration;

export type ResolvedExecutorConfiguration = Exclude<ExecutorConfiguration, AutoExecutorConfiguration>;

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';
const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;
const isWorkerAvailable = ((isBrowserMainThread || isDeno || isBun) && typeof Worker !== 'undefined') || isNode;

export function resolveExecutorConfiguration(
  configuration: ExecutorConfiguration = { type: 'auto' },
): ResolvedExecutorConfiguration {
  if (configuration.type !== 'auto') {
    return configuration;
  }
  return { type: isBrowserMainThread && isWorkerAvailable ? 'worker' : 'direct' };
}
