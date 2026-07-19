import type { RoutingBridgeRequest, RoutingBridgeResponse } from '../generated/bridge/routing_pb.js';
import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import { routingBridgeCodec, type RoutingExecutorLike } from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;
const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;
async function createRoutingWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-routing' });
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(new URL('./routing_node_worker_bridge.js', import.meta.url), { execArgv: [] }) as WorkerLike<Uint8Array, Uint8Array>;
  }
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-routing' });
}
export class RoutingWorkerExecutor extends SolverWorkerExecutor<RoutingBridgeRequest, RoutingBridgeResponse, never> implements RoutingExecutorLike {
  constructor() { super(routingBridgeCodec, createRoutingWorker); }
}
