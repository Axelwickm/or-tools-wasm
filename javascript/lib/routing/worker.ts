/// <reference lib="webworker" />

import { installSolverWorker } from '../solver_worker.js';
import { loadRoutingRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { DirectRoutingExecutor } from './direct_executor.js';
import { routingProtocol } from './protocol.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function loadRoutingWorkerRuntime() {
  return modulePromise ??= loadRoutingRuntime();
}

async function sharedCancellation() {
  const module = await loadRoutingWorkerRuntime();
  const memory = module.HEAPU8.buffer;
  if (!(memory instanceof SharedArrayBuffer)) {
    throw new Error('Routing worker cancellation requires shared WASM memory.');
  }
  const interruptAddress = module._routing_interrupt_address
    ?? module.routing_interrupt_address;
  if (typeof interruptAddress !== 'function') {
    throw new Error('Routing interrupt address export unavailable.');
  }
  return {
    memory,
    byteOffset: interruptAddress() as number,
  };
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectRoutingExecutor(loadRoutingWorkerRuntime),
  routingProtocol,
  { cancellation: sharedCancellation },
);
