/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { cpSatProtocol } from './protocol.js';
import { DirectCpSatExecutor } from './direct_executor.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadCpSatRuntime() {
  modulePromise ??= loadRuntime();
  return modulePromise;
}

const executor = new DirectCpSatExecutor(loadCpSatRuntime);

async function sharedCancellation() {
  const module = await loadCpSatRuntime();
  const memory = module.HEAPU8.buffer;
  if (!(memory instanceof SharedArrayBuffer)) {
    throw new Error('CP-SAT worker cancellation requires shared WASM memory.');
  }
  const interruptAddress = module._cp_sat_interrupt_address
    ?? module.cp_sat_interrupt_address;
  if (typeof interruptAddress !== 'function') {
    throw new Error('CP-SAT interrupt address export unavailable.');
  }
  return {
    memory,
    byteOffset: interruptAddress() as number,
  };
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  executor,
  cpSatProtocol,
  { cancellation: sharedCancellation },
);
