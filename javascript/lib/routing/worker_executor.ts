import type { RoutingBridgeRequest, RoutingBridgeResponse } from '../generated/bridge/routing_pb.js';
import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import { routingBridgeCodec, type RoutingExecutorLike } from './executor.js';

async function createRoutingWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-routing' },
  );
}
export class RoutingWorkerExecutor
  extends SolverWorkerExecutor<RoutingBridgeRequest, RoutingBridgeResponse, never>
  implements RoutingExecutorLike {
  constructor() {
    super(routingBridgeCodec, createRoutingWorker);
  }
}
