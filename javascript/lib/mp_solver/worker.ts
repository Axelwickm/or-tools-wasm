/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { MpSolverExecutor, mpSolverBridgeCodec } from './executor.js';

installSolverWorker(self as DedicatedWorkerGlobalScope, new MpSolverExecutor(), mpSolverBridgeCodec);
