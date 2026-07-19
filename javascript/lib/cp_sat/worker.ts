/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { CpSatExecutor, cpSatBridgeCodec } from './executor.js';

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new CpSatExecutor(),
  cpSatBridgeCodec,
);
