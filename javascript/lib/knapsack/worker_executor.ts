import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import type { KnapsackBridgeRequest, KnapsackBridgeResponse } from '../generated/bridge/knapsack_pb.js';
import { knapsackBridgeCodec, type KnapsackExecutorLike } from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;

const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;

async function createKnapsackWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
      name: 'ortools-executor-knapsack',
    });
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(
      new URL('./knapsack_node_worker_bridge.js', import.meta.url),
      { execArgv: [] },
    ) as WorkerLike<Uint8Array, Uint8Array>;
  }
  return new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
    name: 'ortools-executor-knapsack',
  });
}

export class KnapsackWorkerExecutor
  extends SolverWorkerExecutor<KnapsackBridgeRequest, KnapsackBridgeResponse, never>
  implements KnapsackExecutorLike {
  constructor() {
    super(knapsackBridgeCodec, createKnapsackWorker);
  }
}
