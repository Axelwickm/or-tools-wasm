import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import type { NetworkFlowBridgeResponse } from '../generated/bridge/network_flow_pb.js';
import {
  networkFlowBridgeCodec,
  type NetworkFlowExecutorLike,
  type NetworkFlowExecutorRequest,
} from './executor.js';

export class NetworkFlowServerExecutor
  extends SolverServerExecutor<NetworkFlowExecutorRequest, NetworkFlowBridgeResponse, never>
  implements NetworkFlowExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) {
    super(networkFlowBridgeCodec, configuration);
  }
}
