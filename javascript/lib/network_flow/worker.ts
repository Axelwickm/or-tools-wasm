/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadGraphRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { DirectNetworkFlowExecutor } from './direct_executor.js';
import { networkFlowProtocol } from './protocol.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadNetworkFlowWorkerRuntime() {
  return modulePromise ??= loadGraphRuntime();
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectNetworkFlowExecutor(loadNetworkFlowWorkerRuntime),
  networkFlowProtocol,
);
