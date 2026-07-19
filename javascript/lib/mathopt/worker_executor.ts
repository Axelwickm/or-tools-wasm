import type { MathOptBridgeResponse } from '../generated/bridge/mathopt_pb.js';
import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import { mathOptBridgeCodec, type MathOptExecutorLike, type MathOptExecutorRequest } from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;
const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;
async function createWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-mathopt' });
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(new URL('./mathopt_node_worker_bridge.js', import.meta.url), { execArgv: [] }) as WorkerLike<Uint8Array, Uint8Array>;
  }
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-mathopt' });
}
export class MathOptWorkerExecutor extends SolverWorkerExecutor<MathOptExecutorRequest, MathOptBridgeResponse, never> implements MathOptExecutorLike {
  constructor() { super(mathOptBridgeCodec, createWorker); }
}
