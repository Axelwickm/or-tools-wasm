import type { OrToolsWasmModule } from './wasm_module_types.js';

type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<OrToolsWasmModule>;
type RuntimeFlavor = 'jspi' | 'asyncify';
type RuntimeKey = 'cp_sat' | 'cp_sat_asyncify' | 'routing_asyncify' | 'mp_solver' | 'mathopt';

const cpSatRuntimeJsUrl = new URL('#internal-wasm/cp_sat_runtime.js?no-inline', import.meta.url).href;
const cpSatRuntimeAsyncifyJsUrl = new URL('#internal-wasm/cp_sat_runtime_asyncify.js?no-inline', import.meta.url).href;
const routingRuntimeAsyncifyJsUrl = new URL('#internal-wasm/routing_runtime_asyncify.js?no-inline', import.meta.url).href;
const mpSolverRuntimeJsUrl = new URL('#internal-wasm/mp_solver_runtime.js?no-inline', import.meta.url).href;
const mathOptRuntimeJsUrl = new URL('#internal-wasm/mathopt_runtime.js?no-inline', import.meta.url).href;

const cpSatRuntimeWasmUrl = new URL('#internal-wasm/cp_sat_runtime.wasm?no-inline', import.meta.url).href;
const cpSatRuntimeAsyncifyWasmUrl = new URL('#internal-wasm/cp_sat_runtime_asyncify.wasm?no-inline', import.meta.url).href;
const routingRuntimeAsyncifyWasmUrl = new URL('#internal-wasm/routing_runtime_asyncify.wasm?no-inline', import.meta.url).href;
const mpSolverRuntimeWasmUrl = new URL('#internal-wasm/mp_solver_runtime.wasm?no-inline', import.meta.url).href;
const mathOptRuntimeWasmUrl = new URL('#internal-wasm/mathopt_runtime.wasm?no-inline', import.meta.url).href;

const modulePromises: Partial<Record<RuntimeKey, Promise<OrToolsWasmModule>>> = {};
let selectedFlavor: RuntimeFlavor | null = null;

function isJspiSupported(): boolean {
  const wasm = WebAssembly as typeof WebAssembly & { promising?: unknown };
  return typeof wasm !== 'undefined' && typeof wasm.promising === 'function';
}

function selectRuntimeFlavor(): RuntimeFlavor {
  if (selectedFlavor) {
    return selectedFlavor;
  }
  selectedFlavor = isJspiSupported() ? 'jspi' : 'asyncify';
  if (selectedFlavor === 'jspi') {
    console.log('JSPI is supported. Using ASYNCIFY=2.');
  } else {
    console.log('JSPI not found. Falling back to ASYNCIFY=1.');
  }
  return selectedFlavor;
}

async function loadFactory(runtimeUrl: string): Promise<RuntimeModuleFactory> {
  const { default: createModule } = await import(/* webpackIgnore: true */ /* @vite-ignore */ runtimeUrl);
  return createModule as RuntimeModuleFactory;
}

function locateRuntimeFile(fileName: string) {
  if (fileName === 'cp_sat_runtime.js') return cpSatRuntimeJsUrl;
  if (fileName === 'cp_sat_runtime_asyncify.js') return cpSatRuntimeAsyncifyJsUrl;
  if (fileName === 'routing_runtime_asyncify.js') return routingRuntimeAsyncifyJsUrl;
  if (fileName === 'mp_solver_runtime.js') return mpSolverRuntimeJsUrl;
  if (fileName === 'mathopt_runtime.js') return mathOptRuntimeJsUrl;
  if (fileName === 'cp_sat_runtime.wasm') return cpSatRuntimeWasmUrl;
  if (fileName === 'cp_sat_runtime_asyncify.wasm') return cpSatRuntimeAsyncifyWasmUrl;
  if (fileName === 'routing_runtime_asyncify.wasm') return routingRuntimeAsyncifyWasmUrl;
  if (fileName === 'mp_solver_runtime.wasm') return mpSolverRuntimeWasmUrl;
  if (fileName === 'mathopt_runtime.wasm') return mathOptRuntimeWasmUrl;
  return fileName;
}

function createRuntime(key: RuntimeKey, runtimeUrl: string): Promise<OrToolsWasmModule> {
  modulePromises[key] ??= (async () => {
    const createModule = await loadFactory(runtimeUrl);
    return createModule({
      locateFile: locateRuntimeFile,
      mainScriptUrlOrBlob: runtimeUrl,
    });
  })();
  return modulePromises[key];
}

export async function loadRuntime(): Promise<OrToolsWasmModule> {
  const flavor = selectRuntimeFlavor();
  return flavor === 'jspi'
    ? createRuntime('cp_sat', cpSatRuntimeJsUrl)
    : createRuntime('cp_sat_asyncify', cpSatRuntimeAsyncifyJsUrl);
}

export async function loadRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('cp_sat_asyncify', cpSatRuntimeAsyncifyJsUrl);
}

export async function loadRoutingRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('routing_asyncify', routingRuntimeAsyncifyJsUrl);
}

export async function loadMPSolverRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('mp_solver', mpSolverRuntimeJsUrl);
}

export async function loadMathOptRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('mathopt', mathOptRuntimeJsUrl);
}

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
