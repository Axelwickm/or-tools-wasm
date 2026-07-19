import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import {
  type KnapsackBridgeRequest,
  type KnapsackBridgeResponse,
} from '../generated/bridge/knapsack_pb.js';
import { knapsackBridgeCodec, type KnapsackExecutorLike } from './executor.js';

export class KnapsackServerExecutor
  extends SolverServerExecutor<KnapsackBridgeRequest, KnapsackBridgeResponse, never>
  implements KnapsackExecutorLike {
  constructor(configuration: ServerExecutorConfiguration) {
    super(knapsackBridgeCodec, configuration);
  }
}
