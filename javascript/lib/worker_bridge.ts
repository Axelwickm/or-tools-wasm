import type { WorkerRequest, WorkerResponse } from './worker_protocol.js';

const isBrowserMainThread = typeof window !== 'undefined' && typeof document !== 'undefined';
const workerCapable = typeof Worker !== 'undefined';
const workerBridgeAvailable = isBrowserMainThread && workerCapable;

let worker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
let workerBridgePreferred = workerBridgeAvailable;
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

export function setWorkerBridgeEnabled(enabled: boolean) {
  workerBridgePreferred = Boolean(enabled);
  if (workerBridgePreferred && !workerBridgeAvailable) {
    console.warn('Worker bridge requested but no worker is initialized in this environment.');
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

function ensureWorker(): Worker {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  if (worker) {
    return worker;
  }
  const instance = new Worker(new URL('./cpsat_worker.js', import.meta.url), { type: 'module' });
  worker = instance;
  workerReadyPromise = new Promise<void>((resolve, reject) => {
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        resolve();
        return;
      }
      const pending = pendingWorkerRequests.get(message.id);
      if (message.type === 'solveCallback') {
        pending?.onEvent?.(message);
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
    instance.onerror = (event: ErrorEvent) => {
      const detail = event.error instanceof Error
        ? event.error.message
        : event.message || 'The browser blocked or failed to load the worker module.';
      const error = new Error(`OR-Tools worker failed to load: ${detail}`);
      reject(error);
      terminateWorkerBridge(error.message);
    };
  });
  return instance;
}

async function waitForWorkerReady() {
  if (!workerBridgeAvailable) {
    throw new Error('Worker bridge is not available.');
  }
  ensureWorker();
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
  const workerInstance = ensureWorker();
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
