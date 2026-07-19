import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import type { MathOptBridgeResponse } from '../generated/bridge/mathopt_pb.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { mathOptBridgeCodec, type MathOptExecutorLike, type MathOptExecutorRequest } from './executor.js';
export class MathOptServerExecutor extends SolverServerExecutor<MathOptExecutorRequest, MathOptBridgeResponse, never> implements MathOptExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) { super(mathOptBridgeCodec, configuration); }
}
