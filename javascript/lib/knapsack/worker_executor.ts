import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import type { KnapsackBridgeRequest, KnapsackBridgeResponse } from '../generated/bridge/knapsack_pb.js';
import { knapsackBridgeCodec, type KnapsackExecutorLike } from './executor.js';

async function createKnapsackWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-knapsack' },
  );
}

export class KnapsackWorkerExecutor
  extends SolverWorkerExecutor<KnapsackBridgeRequest, KnapsackBridgeResponse, never>
  implements KnapsackExecutorLike {
  constructor() {
    super(knapsackBridgeCodec, createKnapsackWorker);
  }
}
