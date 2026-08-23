import type { SetCoverBridgeRequest, SetCoverBridgeResponse } from '../generated/bridge/set_cover_pb.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { setCoverBridgeCodec, type SetCoverExecutorLike } from './executor.js';

async function createSetCoverWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-set-cover' },
  );
}

export class SetCoverWorkerExecutor
  extends SolverWorkerExecutor<SetCoverBridgeRequest, SetCoverBridgeResponse, never>
  implements SetCoverExecutorLike {
  constructor() { super(setCoverBridgeCodec, createSetCoverWorker); }
}
