import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import type { CpSatBridgeResponse } from '../generated/bridge/cp_sat_pb.js';
import {
  cpSatBridgeCodec,
  type CpSatExecutorLike,
  type CpSatExecutorRequest,
} from './executor.js';

export class CpSatServerExecutor
  extends SolverServerExecutor<CpSatExecutorRequest, CpSatBridgeResponse, CpSatBridgeResponse>
  implements CpSatExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) {
    super(cpSatBridgeCodec, configuration);
  }
}
