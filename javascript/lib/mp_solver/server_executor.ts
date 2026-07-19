import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import type { MpSolverBridgeResponse } from '../generated/bridge/mp_solver_pb.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { mpSolverBridgeCodec, type MpSolverExecutorLike, type MpSolverExecutorRequest } from './executor.js';

export class MpSolverServerExecutor
  extends SolverServerExecutor<MpSolverExecutorRequest, MpSolverBridgeResponse, never>
  implements MpSolverExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) { super(mpSolverBridgeCodec, configuration); }
}
