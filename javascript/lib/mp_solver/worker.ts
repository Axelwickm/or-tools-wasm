/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadMPSolverRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { DirectMpSolverExecutor } from './direct_executor.js';
import { mpSolverProtocol } from './protocol.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadMpSolverRuntime() {
  modulePromise ??= loadMPSolverRuntime();
  return modulePromise;
}

async function sharedCancellation() {
  const module = await loadMpSolverRuntime();
  const memory = module.HEAPU8.buffer;
  if (!(memory instanceof SharedArrayBuffer)) {
    throw new Error('MP Solver worker cancellation requires shared WASM memory.');
  }
  const interruptAddress = module._mp_solver_interrupt_address
    ?? module.mp_solver_interrupt_address;
  if (typeof interruptAddress !== 'function') {
    throw new Error('MP Solver interrupt address export unavailable.');
  }
  return {
    memory,
    byteOffset: interruptAddress() as number,
  };
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectMpSolverExecutor(loadMpSolverRuntime),
  mpSolverProtocol,
  { cancellation: sharedCancellation },
);
