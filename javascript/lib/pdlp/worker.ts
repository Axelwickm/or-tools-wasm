/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { PdlpExecutor, pdlpBridgeCodec } from './executor.js';

installSolverWorker(self as DedicatedWorkerGlobalScope, new PdlpExecutor(), pdlpBridgeCodec);
