/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { SetCoverExecutor, setCoverBridgeCodec } from './executor.js';

installSolverWorker(self as DedicatedWorkerGlobalScope, new SetCoverExecutor(), setCoverBridgeCodec);
