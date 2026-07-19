/// <reference lib="webworker" />
import { installSolverWorker } from '../solver_worker.js';
import { RoutingExecutor, routingBridgeCodec } from './executor.js';
installSolverWorker(self as DedicatedWorkerGlobalScope, new RoutingExecutor(), routingBridgeCodec);
