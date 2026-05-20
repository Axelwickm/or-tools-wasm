import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;

const isPackagedBrowserBuild = typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined'
  && __ORTOOLS_WASM_BROWSER_BUILD__;
const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';
const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;
const workerBridgeAvailable = ((isBrowserMainThread || isDeno || isBun) && typeof Worker !== 'undefined') || isNode;

type BridgeWorker = {
  postMessage(message: WorkerRequest): void;
  terminate(): void | Promise<number>;
  unref?(): void;
  onmessage?: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  on?(event: 'message', listener: (message: WorkerResponse) => void): void;
  on?(event: 'error', listener: (error: Error) => void): void;
};

let worker: BridgeWorker | null = null;
let workerReadyPromise: Promise<void> | null = null;
let workerBridgePreferred = isBrowserMainThread && workerBridgeAvailable;
let nextRequestId = 1;

const pendingWorkerRequests = new Map<
  number,
  {
    resolve(value: WorkerResponse): void;
    reject(reason: unknown): void;
    onEvent?(value: WorkerResponse): void;
  }
>();

export function shouldUseWorkerBridge() {
  return workerBridgePreferred && workerBridgeAvailable;
}

export function isWorkerBridgeEnabled() {
  return shouldUseWorkerBridge();
}

export function isWorkerBridgeAvailable() {
  return workerBridgeAvailable;
}

export function setWorkerBridgeEnabled(enabled: boolean) {
  workerBridgePreferred = Boolean(enabled);
  if (workerBridgePreferred && !workerBridgeAvailable) {
    console.warn('Worker bridge requested but no worker is initialized in this environment.');
  } else if (!workerBridgePreferred) {
    terminateWorkerBridge('OR-Tools worker bridge disabled.');
  }
}

export function nextWorkerBridgeRequestId() {
  return nextRequestId++;
}

export function terminateWorkerBridge(reason?: string) {
  if (!worker) return;
  worker.terminate();
  worker = null;
  workerReadyPromise = null;
  const error = new Error(reason ?? 'OR-Tools worker terminated.');
  for (const pending of pendingWorkerRequests.values()) {
    pending.reject(error);
  }
  pendingWorkerRequests.clear();
}

async function createBridgeWorker(): Promise<BridgeWorker> {
  if (!isPackagedBrowserBuild && (isNode || isDeno)) {
    const workerThreadsSpecifier = 'node:worker_threads';
    const { Worker: NodeWorker } = await import(workerThreadsSpecifier);
    return new NodeWorker(new URL('./node_worker_bridge.js', import.meta.url)) as BridgeWorker;
  }
  return new Worker(new URL('./ortools_worker.js', import.meta.url), { type: 'module' }) as BridgeWorker;
}

async function ensureWorker(): Promise<BridgeWorker> {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  if (worker) {
    return worker;
  }
  const instance = await createBridgeWorker();
  instance.unref?.();
  worker = instance;
  workerReadyPromise = new Promise<void>((resolve, reject) => {
    const handleMessage = (message: WorkerResponse) => {
      if (message.type === 'ready') {
        resolve();
        return;
      }
      const pending = pendingWorkerRequests.get(message.id);
      if (message.type === 'solveCallback') {
        if (pending?.onEvent) {
          try {
            pending.onEvent(message);
          } catch (error) {
            pendingWorkerRequests.delete(message.id);
            pending.reject(error);
          }
        }
        return;
      }
      if (message.type === 'error') {
        const error = new Error(message.error);
        if (pending) {
          pending.reject(error);
          pendingWorkerRequests.delete(message.id);
        } else {
          reject(error);
        }
        return;
      }
      if (pending) {
        pendingWorkerRequests.delete(message.id);
        pending.resolve(message);
      }
    };
    const handleError = (errorLike: Error | ErrorEvent) => {
      const detail = errorLike instanceof Error
        ? errorLike.message
        : errorLike.error instanceof Error
          ? errorLike.error.message
          : errorLike.message || 'The runtime blocked or failed to load the worker module.';
      const error = new Error(`OR-Tools worker failed to load: ${detail}`);
      reject(error);
      terminateWorkerBridge(error.message);
    };
    if (typeof instance.on === 'function') {
      instance.on('message', handleMessage);
      instance.on('error', handleError);
    } else {
      instance.onmessage = (event: MessageEvent<WorkerResponse>) => handleMessage(event.data);
      instance.onerror = handleError;
    }
  });
  return instance;
}

async function waitForWorkerReady() {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  await ensureWorker();
  if (!workerReadyPromise) {
    throw new Error('Worker ready state unavailable.');
  }
  await workerReadyPromise;
}

export async function postWorkerRequest<T extends WorkerResponse>(
  request: WorkerRequest,
  onEvent?: (value: WorkerResponse) => void,
): Promise<T> {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  const workerInstance = await ensureWorker();
  await waitForWorkerReady();
  return new Promise<T>((resolve, reject) => {
    pendingWorkerRequests.set(request.id, {
      resolve: (value: WorkerResponse) => resolve(value as T),
      reject,
      onEvent,
    });
    workerInstance.postMessage(request);
  });
}
