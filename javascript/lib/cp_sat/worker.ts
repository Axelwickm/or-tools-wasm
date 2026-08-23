/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { cpSatProtocol } from './protocol.js';
import { DirectCpSatExecutor } from './direct_executor.js';

const executor = new DirectCpSatExecutor();

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  executor,
  cpSatProtocol,
  { cancellation: () => executor.workerCancellation() },
);
