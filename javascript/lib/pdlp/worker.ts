/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadPdlpRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { pdlpProtocol } from './protocol.js';
import { DirectPdlpExecutor } from './direct_executor.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadWorkerRuntime() {
  modulePromise ??= loadPdlpRuntime();
  return modulePromise;
}

const executor = new DirectPdlpExecutor(loadWorkerRuntime);

async function sharedCancellation() {
  const module = await loadWorkerRuntime();
  const memory = module.HEAPU8.buffer;
  if (!(memory instanceof SharedArrayBuffer)) {
    throw new Error('PDLP worker cancellation requires shared WASM memory.');
  }
  const interruptAddress = module._pdlp_interrupt_address
    ?? module.pdlp_interrupt_address;
  if (typeof interruptAddress !== 'function') {
    throw new Error('PDLP interrupt address export unavailable.');
  }
  return {
    memory,
    byteOffset: interruptAddress() as number,
  };
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  executor,
  pdlpProtocol,
  { cancellation: sharedCancellation },
);
