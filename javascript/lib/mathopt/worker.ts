/// <reference lib="webworker" />
import { installSolverWorker } from '../solver_worker.js';
import { DirectMathOptExecutor } from './direct_executor.js';
import { mathOptProtocol } from './protocol.js';
import { loadMathOptRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
let modulePromise: Promise<OrToolsWasmModule> | null = null;
function loadWorkerRuntime() { return modulePromise ??= loadMathOptRuntime(); }
async function sharedCancellation() {
  const module = await loadWorkerRuntime();
  if (!(module.HEAPU8.buffer instanceof SharedArrayBuffer)) throw new Error('MathOpt cancellation requires shared WASM memory.');
  const address = module._mathopt_interrupt_address ?? module.mathopt_interrupt_address;
  if (typeof address !== 'function') throw new Error('MathOpt interrupt address export unavailable.');
  return { memory: module.HEAPU8.buffer, byteOffset: address() as number };
}

installSolverWorker(
  self as DedicatedWorkerGlobalScope,
  new DirectMathOptExecutor(loadWorkerRuntime),
  mathOptProtocol,
  { cancellation: sharedCancellation },
);
