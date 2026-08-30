/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadSetCoverRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { DirectSetCoverExecutor } from './direct_executor.js';
import { setCoverProtocol } from './protocol.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadSetCoverWorkerRuntime() {
  return modulePromise ??= loadSetCoverRuntime();
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectSetCoverExecutor(loadSetCoverWorkerRuntime),
  setCoverProtocol,
);
