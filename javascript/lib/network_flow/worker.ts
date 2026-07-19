/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { NetworkFlowExecutor, networkFlowBridgeCodec } from './executor.js';

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new NetworkFlowExecutor(),
  networkFlowBridgeCodec,
);
