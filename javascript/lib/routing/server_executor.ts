import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import type { RoutingBridgeRequest, RoutingBridgeResponse } from '../generated/bridge/routing_pb.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { routingBridgeCodec, type RoutingExecutorLike } from './executor.js';

export class RoutingServerExecutor extends SolverServerExecutor<RoutingBridgeRequest, RoutingBridgeResponse, never> implements RoutingExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) { super(routingBridgeCodec, configuration); }
}
