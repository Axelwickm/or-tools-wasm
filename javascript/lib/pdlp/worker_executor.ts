import type { PdlpBridgeRequest, PdlpBridgeResponse } from '../generated/bridge/pdlp_pb.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { pdlpBridgeCodec, type PdlpExecutorLike } from './executor.js';

async function createPdlpWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-pdlp' },
  );
}

export class PdlpWorkerExecutor
  extends SolverWorkerExecutor<PdlpBridgeRequest, PdlpBridgeResponse, never>
  implements PdlpExecutorLike {
  constructor() { super(pdlpBridgeCodec, createPdlpWorker); }
}
