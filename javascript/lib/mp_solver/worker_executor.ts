import type { MpSolverBridgeResponse } from '../generated/bridge/mp_solver_pb.js';
import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import { mpSolverBridgeCodec, type MpSolverExecutorLike, type MpSolverExecutorRequest } from './executor.js';

async function createWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-mp-solver' },
  );
}

export class MpSolverWorkerExecutor
  extends SolverWorkerExecutor<MpSolverExecutorRequest, MpSolverBridgeResponse, never>
  implements MpSolverExecutorLike {
  constructor() { super(mpSolverBridgeCodec, createWorker); }
}
