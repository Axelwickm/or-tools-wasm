import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import type { NetworkFlowBridgeResponse } from '../generated/bridge/network_flow_pb.js';
import {
  networkFlowBridgeCodec,
  type NetworkFlowExecutorLike,
  type NetworkFlowExecutorRequest,
} from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;
const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;

async function createNetworkFlowWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module', name: 'ortools-executor-network-flow',
    });
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(
      new URL('./network_flow_node_worker_bridge.js', import.meta.url),
      { execArgv: [] },
    ) as WorkerLike<Uint8Array, Uint8Array>;
  }
  return new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module', name: 'ortools-executor-network-flow',
  });
}

export class NetworkFlowWorkerExecutor
  extends SolverWorkerExecutor<NetworkFlowExecutorRequest, NetworkFlowBridgeResponse, never>
  implements NetworkFlowExecutorLike {
  constructor() { super(networkFlowBridgeCodec, createNetworkFlowWorker); }
}
