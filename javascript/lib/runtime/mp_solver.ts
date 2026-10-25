import { loadBrowserRuntime, type BrowserRuntimeAsset } from '../runtime_loader.js';
import type { RuntimeFlavor } from '../runtime_loader_core.js';

function resolveAsset(flavor: RuntimeFlavor): BrowserRuntimeAsset {
  return flavor === 'jspi' ? {
    jsUrl: new URL('#internal-wasm/mp_solver_runtime.js?no-inline', import.meta.url).href,
    wasmUrl: new URL('#internal-wasm/mp_solver_runtime.wasm?no-inline', import.meta.url).href,
  } : {
    jsUrl: new URL('#internal-wasm/mp_solver_runtime_asyncify.js?no-inline', import.meta.url).href,
    wasmUrl: new URL('#internal-wasm/mp_solver_runtime_asyncify.wasm?no-inline', import.meta.url).href,
  };
}

export const loadMPSolverRuntime = () => loadBrowserRuntime('mp_solver_runtime', resolveAsset);
export const loadMPSolverRuntimeAsyncify = () => loadBrowserRuntime('mp_solver_runtime', resolveAsset, 'asyncify');
