/// <reference lib="webworker" />
import { installSolverWorker } from '../solver_worker.js';
import { DirectMathOptExecutor } from './direct_executor.js';
import { mathOptProtocol } from './protocol.js';

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectMathOptExecutor(),
  mathOptProtocol,
);
