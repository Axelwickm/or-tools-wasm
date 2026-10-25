import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createRuntimeLoader,
  isJspiSupported,
  type RuntimeFlavor,
  type RuntimeName,
  type RuntimeModuleFactory,
} from './runtime_loader_core.js';

async function loadFactory(runtimeUrl: string): Promise<RuntimeModuleFactory> {
  const { default: createModule } = await import(runtimeUrl);
  return createModule as RuntimeModuleFactory;
}

function locateNodeRuntimeFile(fileName: string) {
  if (fileName.endsWith('.wasm')) {
    const sharedFileName = fileName.replace(/_node(?=_asyncify\.wasm$|\.wasm$)/, '');
    return fileURLToPath(new URL(`../wasm/${sharedFileName}`, import.meta.url));
  }
  return fileURLToPath(new URL(`../node-wasm/${fileName}`, import.meta.url));
}

function locateWebRuntimeFile(fileName: string) {
  return new URL(`../wasm/${fileName}`, import.meta.url).href;
}

function shouldUseWebRuntimeAssets() {
  const hostState = globalThis as { Bun?: unknown; Deno?: unknown };
  return typeof hostState.Deno !== 'undefined' || typeof hostState.Bun !== 'undefined';
}

function bunWebRuntimeGlobalCleanup() {
  const hostState = globalThis as { Bun?: unknown; window?: unknown };
  if (typeof hostState.Bun === 'undefined') return undefined;
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = hostState.window;
  return () => {
    if (hadWindow) {
      hostState.window = previousWindow;
    } else if (hostState.window === globalThis) {
      delete hostState.window;
    }
  };
}

const loader = createRuntimeLoader({ loadFactory });

function loadNamedRuntime(runtimeName: RuntimeName, flavor?: RuntimeFlavor) {
  return loader.loadRuntime(runtimeName, async selectedFlavor => {
    const suffix = selectedFlavor === 'asyncify' ? '_asyncify' : '';
    const artifact = {
      webJs: `${runtimeName}${suffix}.js`,
      nodeJs: `${runtimeName}_node${suffix}.js`,
      wasm: `${runtimeName}${suffix}.wasm`,
    };
    if (shouldUseWebRuntimeAssets()) {
      const wasmUrl = new URL(`../wasm/${artifact.wasm}`, import.meta.url);
      return {
        jsUrl: new URL(`../wasm/${artifact.webJs}`, import.meta.url).href,
        locateFile: locateWebRuntimeFile,
        wasmBinary: new Uint8Array(await readFile(wasmUrl)),
        cleanupGlobalState: bunWebRuntimeGlobalCleanup(),
      };
    }
    return {
      jsUrl: new URL(`../node-wasm/${artifact.nodeJs}`, import.meta.url).href,
      locateFile: locateNodeRuntimeFile,
    };
  }, flavor);
}

export { isJspiSupported };
export const terminateLoadedRuntimeThreads = loader.terminateLoadedRuntimeThreads;
export const loadRuntime = () => loadNamedRuntime('cp_sat_runtime');
export const loadRuntimeAsyncify = () => loadNamedRuntime('cp_sat_runtime', 'asyncify');
export const loadRoutingRuntime = () => loadNamedRuntime('routing_runtime');
export const loadRoutingRuntimeAsyncify = () => loadNamedRuntime('routing_runtime', 'asyncify');
export const loadMPSolverRuntime = () => loadNamedRuntime('mp_solver_runtime');
export const loadMPSolverRuntimeAsyncify = () => loadNamedRuntime('mp_solver_runtime', 'asyncify');
export const loadMathOptRuntime = () => loadNamedRuntime('mathopt_runtime');
export const loadMathOptRuntimeAsyncify = () => loadNamedRuntime('mathopt_runtime', 'asyncify');
export const loadPdlpRuntime = () => loadNamedRuntime('pdlp_runtime');
export const loadPdlpRuntimeAsyncify = () => loadNamedRuntime('pdlp_runtime', 'asyncify');
export const loadGraphRuntime = () => loadNamedRuntime('graph_runtime');
export const loadGraphRuntimeAsyncify = () => loadNamedRuntime('graph_runtime', 'asyncify');
export const loadSetCoverRuntime = () => loadNamedRuntime('set_cover_runtime');
export const loadSetCoverRuntimeAsyncify = () => loadNamedRuntime('set_cover_runtime', 'asyncify');
