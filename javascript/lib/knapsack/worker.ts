/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { KnapsackExecutor, knapsackBridgeCodec } from './executor.js';

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new KnapsackExecutor(),
  knapsackBridgeCodec,
);
