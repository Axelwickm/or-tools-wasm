import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import type { SetCoverBridgeRequest, SetCoverBridgeResponse } from '../generated/bridge/set_cover_pb.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { setCoverBridgeCodec, type SetCoverExecutorLike } from './executor.js';

export class SetCoverServerExecutor
  extends SolverServerExecutor<SetCoverBridgeRequest, SetCoverBridgeResponse, never>
  implements SetCoverExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) {
    super(setCoverBridgeCodec, configuration);
  }
}
