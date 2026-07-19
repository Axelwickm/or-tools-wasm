/// <reference lib="webworker" />
import { installSolverWorker } from '../solver_worker.js';
import { MathOptExecutor, mathOptBridgeCodec } from './executor.js';
installSolverWorker(self as DedicatedWorkerGlobalScope, new MathOptExecutor(), mathOptBridgeCodec);
