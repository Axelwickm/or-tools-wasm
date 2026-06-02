import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createRuntimeLoader,
  isJspiSupported,
  RUNTIME_ARTIFACTS,
  type RuntimeModuleFactory,
  type RuntimeName,
} from './runtime_loader_core.js';

async function loadFactory(runtimeUrl: string): Promise<RuntimeModuleFactory> {
  const { default: createModule } = await import(runtimeUrl);
  return createModule as RuntimeModuleFactory;
}

function locateNodeRuntimeFile(fileName: string) {
  return fileURLToPath(new URL(`../node-wasm/${fileName}`, import.meta.url));
}

function locateWebRuntimeFile(fileName: string) {
  return new URL(`../wasm/${fileName}`, import.meta.url).href;
}

const bunWebAssetRuntimes = new Set<RuntimeName>([
  'cp_sat_runtime',
  'routing_runtime',
  'mp_solver_runtime',
  'mathopt_runtime',
]);

function shouldUseWebRuntimeAssets(runtimeName: RuntimeName) {
  const hostState = globalThis as { Bun?: unknown; Deno?: unknown };
  if (typeof hostState.Deno !== 'undefined') return true;
  if (typeof hostState.Bun !== 'undefined') return bunWebAssetRuntimes.has(runtimeName);
  return false;
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

const loader = createRuntimeLoader({
  loadFactory,
  async resolveAsset(runtimeName, flavor) {
    const artifact = RUNTIME_ARTIFACTS[runtimeName][flavor];
    if (shouldUseWebRuntimeAssets(runtimeName)) {
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
  },
});

export { isJspiSupported };
export const terminateLoadedRuntimeThreads = loader.terminateLoadedRuntimeThreads;
export const loadRuntime = loader.loadRuntime;
export const loadRuntimeAsyncify = loader.loadRuntimeAsyncify;
export const loadRoutingRuntime = loader.loadRoutingRuntime;
export const loadRoutingRuntimeAsyncify = loader.loadRoutingRuntimeAsyncify;
export const loadMPSolverRuntime = loader.loadMPSolverRuntime;
export const loadMPSolverRuntimeAsyncify = loader.loadMPSolverRuntimeAsyncify;
export const loadMathOptRuntime = loader.loadMathOptRuntime;
export const loadMathOptRuntimeAsyncify = loader.loadMathOptRuntimeAsyncify;
export const loadPdlpRuntime = loader.loadPdlpRuntime;
export const loadPdlpRuntimeAsyncify = loader.loadPdlpRuntimeAsyncify;
export const loadGraphRuntime = loader.loadGraphRuntime;
export const loadGraphRuntimeAsyncify = loader.loadGraphRuntimeAsyncify;
export const loadSetCoverRuntime = loader.loadSetCoverRuntime;
export const loadSetCoverRuntimeAsyncify = loader.loadSetCoverRuntimeAsyncify;

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
