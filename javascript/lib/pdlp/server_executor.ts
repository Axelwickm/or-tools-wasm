import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import type { PdlpBridgeRequest, PdlpBridgeResponse } from '../generated/bridge/pdlp_pb.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { pdlpBridgeCodec, type PdlpExecutorLike } from './executor.js';

export class PdlpServerExecutor
  extends SolverServerExecutor<PdlpBridgeRequest, PdlpBridgeResponse, never>
  implements PdlpExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) { super(pdlpBridgeCodec, configuration); }
}
