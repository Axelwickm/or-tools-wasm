import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import type { NetworkFlowBridgeResponse } from '../generated/bridge/network_flow_pb.js';
import {
  networkFlowBridgeCodec,
  type NetworkFlowExecutorLike,
  type NetworkFlowExecutorRequest,
} from './executor.js';

async function createNetworkFlowWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-network-flow' },
  );
}

export class NetworkFlowWorkerExecutor
  extends SolverWorkerExecutor<NetworkFlowExecutorRequest, NetworkFlowBridgeResponse, never>
  implements NetworkFlowExecutorLike {
  constructor() { super(networkFlowBridgeCodec, createNetworkFlowWorker); }
}
