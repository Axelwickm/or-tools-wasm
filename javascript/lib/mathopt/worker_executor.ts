import type { MathOptBridgeResponse } from '../generated/bridge/mathopt_pb.js';
import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import { mathOptBridgeCodec, type MathOptExecutorLike, type MathOptExecutorRequest } from './executor.js';

async function createWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-mathopt' },
  );
}
export class MathOptWorkerExecutor
  extends SolverWorkerExecutor<MathOptExecutorRequest, MathOptBridgeResponse, never>
  implements MathOptExecutorLike {
  constructor() {
    super(mathOptBridgeCodec, createWorker);
  }
}
