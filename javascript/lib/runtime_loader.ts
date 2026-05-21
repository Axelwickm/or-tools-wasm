import type { OrToolsWasmModule } from './wasm_module_types.js';

type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<OrToolsWasmModule>;
type RuntimeFlavor = 'jspi' | 'asyncify';
type RuntimeName = 'cp_sat_runtime' | 'routing_runtime' | 'mp_solver_runtime' | 'mathopt_runtime' | 'pdlp_runtime' | 'graph_runtime';
type RuntimeKey = `${RuntimeName}:${RuntimeFlavor}`;

type RuntimeAsset = {
  jsUrl: string;
  wasmUrl: string;
};

const runtimeAssets: Record<RuntimeName, Record<RuntimeFlavor, RuntimeAsset>> = {
  cp_sat_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/cp_sat_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/cp_sat_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/cp_sat_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/cp_sat_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
  routing_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/routing_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/routing_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/routing_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/routing_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
  mp_solver_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/mp_solver_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/mp_solver_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/mp_solver_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/mp_solver_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
  mathopt_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/mathopt_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/mathopt_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/mathopt_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/mathopt_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
  pdlp_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/pdlp_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/pdlp_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/pdlp_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/pdlp_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
  graph_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/graph_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/graph_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/graph_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/graph_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
};

const modulePromises: Partial<Record<RuntimeKey, Promise<OrToolsWasmModule>>> = {};
let selectedFlavor: RuntimeFlavor | null = null;

type RuntimeWithPthreads = OrToolsWasmModule & {
  PThread?: {
    terminateAllThreads?: () => void;
  };
};

function isDenoRuntimeHost(): boolean {
  return 'Deno' in globalThis;
}

function isBunRuntimeHost(): boolean {
  return 'Bun' in globalThis;
}

function isJspiSupported(): boolean {
  const wasm = WebAssembly as typeof WebAssembly & { promising?: unknown };
  return typeof wasm !== 'undefined' && typeof wasm.promising === 'function';
}

function isBrowserRuntimeHost(): boolean {
  return typeof window !== 'undefined' || typeof WorkerGlobalScope !== 'undefined';
}

function selectRuntimeFlavor(runtimeName: RuntimeName): RuntimeFlavor {
  if (isBrowserRuntimeHost()) {
    return 'asyncify';
  }
  if (isDenoRuntimeHost() || isBunRuntimeHost()) {
    return 'asyncify';
  }
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

function runtimeAssetName(url: string): string {
  const fileName = new URL(url).pathname.split('/').pop() ?? '';
  return fileName.replace(/-[A-Za-z0-9_-]+(?=\.(?:js|wasm)$)/, '');
}

function locateRuntimeFile(fileName: string) {
  for (const flavors of Object.values(runtimeAssets)) {
    for (const asset of Object.values(flavors)) {
      if (fileName === runtimeAssetName(asset.jsUrl)) return asset.jsUrl;
      if (fileName === runtimeAssetName(asset.wasmUrl)) return asset.wasmUrl;
    }
  }
  return fileName;
}

function createRuntime(runtimeName: RuntimeName, flavor = selectRuntimeFlavor(runtimeName)): Promise<OrToolsWasmModule> {
  const key: RuntimeKey = `${runtimeName}:${flavor}`;
  modulePromises[key] ??= (async () => {
    const asset = runtimeAssets[runtimeName][flavor];
    const createModule = await loadFactory(asset.jsUrl);
    const wasmBinary = new Uint8Array(await (await fetch(asset.wasmUrl)).arrayBuffer());
    return createModule({
      locateFile: locateRuntimeFile,
      wasmBinary,
      mainScriptUrlOrBlob: asset.jsUrl,
    });
  })();
  return modulePromises[key];
}

export async function terminateLoadedRuntimeThreads(): Promise<void> {
  const modules = await Promise.allSettled(Object.values(modulePromises));
  for (const moduleResult of modules) {
    if (moduleResult.status !== 'fulfilled') continue;
    const module = moduleResult.value as RuntimeWithPthreads;
    module.PThread?.terminateAllThreads?.();
  }
}

export async function loadRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('cp_sat_runtime');
}

export async function loadRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('cp_sat_runtime', 'asyncify');
}

export async function loadRoutingRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('routing_runtime');
}

export async function loadRoutingRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('routing_runtime', 'asyncify');
}

export async function loadMPSolverRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('mp_solver_runtime');
}

export async function loadMPSolverRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('mp_solver_runtime', 'asyncify');
}

export async function loadMathOptRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('mathopt_runtime');
}

export async function loadMathOptRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('mathopt_runtime', 'asyncify');
}

export async function loadPdlpRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('pdlp_runtime');
}

export async function loadPdlpRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('pdlp_runtime', 'asyncify');
}

export async function loadGraphRuntime(): Promise<OrToolsWasmModule> {
  return createRuntime('graph_runtime');
}

export async function loadGraphRuntimeAsyncify(): Promise<OrToolsWasmModule> {
  return createRuntime('graph_runtime', 'asyncify');
}

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
