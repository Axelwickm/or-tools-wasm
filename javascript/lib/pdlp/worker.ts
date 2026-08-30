/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { DirectPdlpExecutor } from './direct_executor.js';
import { pdlpProtocol } from './protocol.js';

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectPdlpExecutor(),
  pdlpProtocol,
);
