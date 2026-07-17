import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

export type ServerBridgeOptions = {
  url?: string | URL | null;
  enabled?: boolean;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
};

type ServerBridgeEnvelope = {
  response?: unknown;
  events?: unknown;
  error?: string;
};

const DEFAULT_SERVER_BRIDGE_URL = 'http://127.0.0.1:8080';

let serverBridgeBaseUrl: string | null = null;
let serverBridgePreferred = false;
let serverBridgeHeaders: Record<string, string> = {};
let serverBridgeFetch: typeof fetch | null = null;

function environmentServerUrl(): string | null {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.ORTOOLS_WASM_SERVER_URL ?? null;
  } catch {
    return null;
  }
}

const initialServerUrl = environmentServerUrl();
if (initialServerUrl) {
  serverBridgeBaseUrl = initialServerUrl;
  serverBridgePreferred = true;
}

function normalizeBaseUrl(url: string | URL): string {
  const value = String(url);
  return value.endsWith('/') ? value : `${value}/`;
}

function requestEndpoint(baseUrl: string): string {
  return new URL('v1/request', normalizeBaseUrl(baseUrl)).href;
}

function currentFetch(): typeof fetch {
  const fetchFn = serverBridgeFetch ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('OR-Tools server bridge requires fetch().');
  }
  return fetchFn.bind(globalThis) as typeof fetch;
}

export function configureServerBridge(options: string | URL | ServerBridgeOptions | null): void {
  if (options === null) {
    serverBridgePreferred = false;
    return;
  }
  if (typeof options === 'string' || options instanceof URL) {
    setServerBridgeUrl(options);
    return;
  }

  if ('url' in options) {
    serverBridgeBaseUrl = options.url === null || options.url === undefined ? null : String(options.url);
    if (options.enabled === undefined) {
      serverBridgePreferred = serverBridgeBaseUrl !== null;
    }
  }
  if (options.headers) {
    serverBridgeHeaders = { ...options.headers };
  }
  if (options.fetch) {
    serverBridgeFetch = options.fetch;
  }
  if (options.enabled !== undefined) {
    setServerBridgeEnabled(options.enabled);
  }
}

export function setServerBridgeUrl(url: string | URL | null): void {
  serverBridgeBaseUrl = url === null ? null : String(url);
  serverBridgePreferred = serverBridgeBaseUrl !== null;
}

export function getServerBridgeUrl(): string | null {
  return serverBridgeBaseUrl;
}

export function setServerBridgeEnabled(enabled: boolean): void {
  serverBridgePreferred = Boolean(enabled);
  if (serverBridgePreferred && !serverBridgeBaseUrl) {
    serverBridgeBaseUrl = DEFAULT_SERVER_BRIDGE_URL;
  }
}

export function isServerBridgeEnabled(): boolean {
  return serverBridgePreferred && serverBridgeBaseUrl !== null;
}

export async function postServerRequest<T extends WorkerResponse>(
  request: WorkerRequest,
  onEvent?: (value: WorkerResponse) => void,
): Promise<T> {
  if (!isServerBridgeEnabled() || !serverBridgeBaseUrl) {
    throw new Error('OR-Tools server bridge is not enabled.');
  }

  const response = await currentFetch()(requestEndpoint(serverBridgeBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...serverBridgeHeaders,
    },
    body: JSON.stringify({ request }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OR-Tools server bridge request failed (${response.status} ${response.statusText}): ${detail}`);
  }

  const envelope = await response.json() as ServerBridgeEnvelope;
  if (envelope.error) {
    throw new Error(envelope.error);
  }

  const events = (envelope.events ?? []) as WorkerResponse[];
  if (!Array.isArray(events)) {
    throw new Error('OR-Tools server bridge returned an invalid event payload.');
  }
  for (const event of events) {
    onEvent?.(event);
  }

  const decodedResponse = envelope.response as T;
  if (decodedResponse?.type === 'error') {
    throw new Error(decodedResponse.error);
  }
  return decodedResponse;
}
