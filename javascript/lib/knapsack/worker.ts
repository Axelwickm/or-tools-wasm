/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadMPSolverRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { DirectKnapsackExecutor } from './direct_executor.js';
import { knapsackProtocol } from './protocol.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadKnapsackWorkerRuntime() {
  return modulePromise ??= loadMPSolverRuntime();
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectKnapsackExecutor(loadKnapsackWorkerRuntime),
  knapsackProtocol,
);
