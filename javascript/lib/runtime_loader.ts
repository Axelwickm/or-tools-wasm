import type { OrToolsWasmModule } from './wasm_module_types.js';

type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<OrToolsWasmModule>;
type RuntimeFlavor = 'jspi' | 'asyncify';
type RuntimeName = 'cp_sat_runtime' | 'routing_runtime' | 'mp_solver_runtime' | 'mathopt_runtime';
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
};

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
  for (const flavors of Object.values(runtimeAssets)) {
    for (const asset of Object.values(flavors)) {
      if (fileName === new URL(asset.jsUrl).pathname.split('/').pop()) return asset.jsUrl;
      if (fileName === new URL(asset.wasmUrl).pathname.split('/').pop()) return asset.wasmUrl;
    }
  }
  return fileName;
}

function createRuntime(runtimeName: RuntimeName, flavor = selectRuntimeFlavor()): Promise<OrToolsWasmModule> {
  const key: RuntimeKey = `${runtimeName}:${flavor}`;
  modulePromises[key] ??= (async () => {
    const asset = runtimeAssets[runtimeName][flavor];
    const createModule = await loadFactory(asset.jsUrl);
    return createModule({
      locateFile: locateRuntimeFile,
      mainScriptUrlOrBlob: asset.jsUrl,
    });
  })();
  return modulePromises[key];
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

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
