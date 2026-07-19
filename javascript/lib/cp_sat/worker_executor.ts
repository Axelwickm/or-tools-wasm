import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import type { CpSatBridgeResponse } from '../generated/bridge/cp_sat_pb.js';
import {
  cpSatBridgeCodec,
  type CpSatExecutorLike,
  type CpSatExecutorRequest,
} from './executor.js';

async function createCpSatWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-cp-sat' },
  );
}

export class CpSatWorkerExecutor
  extends SolverWorkerExecutor<CpSatExecutorRequest, CpSatBridgeResponse, CpSatBridgeResponse>
  implements CpSatExecutorLike {
  constructor() {
    super(cpSatBridgeCodec, createCpSatWorker);
  }
}
