import {
  createRuntimeLoader,
  isJspiSupported,
  type RuntimeFlavor,
  type RuntimeModuleFactory,
  type RuntimeName,
} from './runtime_loader_core.js';

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
  set_cover_runtime: {
    jspi: {
      jsUrl: new URL('#internal-wasm/set_cover_runtime.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/set_cover_runtime.wasm?no-inline', import.meta.url).href,
    },
    asyncify: {
      jsUrl: new URL('#internal-wasm/set_cover_runtime_asyncify.js?no-inline', import.meta.url).href,
      wasmUrl: new URL('#internal-wasm/set_cover_runtime_asyncify.wasm?no-inline', import.meta.url).href,
    },
  },
};

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

const loader = createRuntimeLoader({
  logFlavorSelection: true,
  loadFactory,
  async resolveAsset(runtimeName, flavor) {
    const asset = runtimeAssets[runtimeName][flavor];
    const wasmBinary = new Uint8Array(await (await fetch(asset.wasmUrl)).arrayBuffer());
    return {
      jsUrl: asset.jsUrl,
      locateFile: locateRuntimeFile,
      wasmBinary,
      mainScriptUrlOrBlob: asset.jsUrl,
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
