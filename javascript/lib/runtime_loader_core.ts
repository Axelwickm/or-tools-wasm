import type { OrToolsWasmModule } from './wasm_module_types.js';

export type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<OrToolsWasmModule>;
export type RuntimeFlavor = 'jspi' | 'asyncify';
export type RuntimePlacement =
  | 'browser-main'
  | 'browser-worker'
  | 'node'
  | 'bun'
  | 'deno'
  | 'other';
export type RuntimeName =
  | 'cp_sat_runtime'
  | 'routing_runtime'
  | 'mp_solver_runtime'
  | 'mathopt_runtime'
  | 'pdlp_runtime'
  | 'graph_runtime'
  | 'set_cover_runtime';

type RuntimeKey = `${RuntimeName}:${RuntimeFlavor}`;

export type RuntimeArtifact = {
  webJs: string;
  nodeJs: string;
  wasm: string;
};

export type RuntimeAsset = {
  jsUrl: string;
  locateFile: (fileName: string) => string;
  wasmBinary?: Uint8Array;
  mainScriptUrlOrBlob?: string;
  cleanupGlobalState?: () => void;
};

export type RuntimeLoaderAdapter = {
  resolveAsset(runtimeName: RuntimeName, flavor: RuntimeFlavor): RuntimeAsset | Promise<RuntimeAsset>;
  loadFactory(runtimeUrl: string): Promise<RuntimeModuleFactory>;
  logFlavorSelection?: boolean;
};

type RuntimeWithPthreads = OrToolsWasmModule & {
  PThread?: {
    terminateAllThreads?: () => void;
  };
};

export const RUNTIME_ARTIFACTS: Record<RuntimeName, Record<RuntimeFlavor, RuntimeArtifact>> = {
  cp_sat_runtime: {
    jspi: {
      webJs: 'cp_sat_runtime.js',
      nodeJs: 'cp_sat_runtime_node.js',
      wasm: 'cp_sat_runtime.wasm',
    },
    asyncify: {
      webJs: 'cp_sat_runtime_asyncify.js',
      nodeJs: 'cp_sat_runtime_node_asyncify.js',
      wasm: 'cp_sat_runtime_asyncify.wasm',
    },
  },
  routing_runtime: {
    jspi: {
      webJs: 'routing_runtime.js',
      nodeJs: 'routing_runtime_node.js',
      wasm: 'routing_runtime.wasm',
    },
    asyncify: {
      webJs: 'routing_runtime_asyncify.js',
      nodeJs: 'routing_runtime_node_asyncify.js',
      wasm: 'routing_runtime_asyncify.wasm',
    },
  },
  mp_solver_runtime: {
    jspi: {
      webJs: 'mp_solver_runtime.js',
      nodeJs: 'mp_solver_runtime_node.js',
      wasm: 'mp_solver_runtime.wasm',
    },
    asyncify: {
      webJs: 'mp_solver_runtime_asyncify.js',
      nodeJs: 'mp_solver_runtime_node_asyncify.js',
      wasm: 'mp_solver_runtime_asyncify.wasm',
    },
  },
  mathopt_runtime: {
    jspi: {
      webJs: 'mathopt_runtime.js',
      nodeJs: 'mathopt_runtime_node.js',
      wasm: 'mathopt_runtime.wasm',
    },
    asyncify: {
      webJs: 'mathopt_runtime_asyncify.js',
      nodeJs: 'mathopt_runtime_node_asyncify.js',
      wasm: 'mathopt_runtime_asyncify.wasm',
    },
  },
  pdlp_runtime: {
    jspi: {
      webJs: 'pdlp_runtime.js',
      nodeJs: 'pdlp_runtime_node.js',
      wasm: 'pdlp_runtime.wasm',
    },
    asyncify: {
      webJs: 'pdlp_runtime_asyncify.js',
      nodeJs: 'pdlp_runtime_node_asyncify.js',
      wasm: 'pdlp_runtime_asyncify.wasm',
    },
  },
  graph_runtime: {
    jspi: {
      webJs: 'graph_runtime.js',
      nodeJs: 'graph_runtime_node.js',
      wasm: 'graph_runtime.wasm',
    },
    asyncify: {
      webJs: 'graph_runtime_asyncify.js',
      nodeJs: 'graph_runtime_node_asyncify.js',
      wasm: 'graph_runtime_asyncify.wasm',
    },
  },
  set_cover_runtime: {
    jspi: {
      webJs: 'set_cover_runtime.js',
      nodeJs: 'set_cover_runtime_node.js',
      wasm: 'set_cover_runtime.wasm',
    },
    asyncify: {
      webJs: 'set_cover_runtime_asyncify.js',
      nodeJs: 'set_cover_runtime_node_asyncify.js',
      wasm: 'set_cover_runtime_asyncify.wasm',
    },
  },
};

export function isJspiSupported(): boolean {
  const wasm = globalThis.WebAssembly as (typeof WebAssembly & { promising?: unknown }) | undefined;
  return typeof wasm?.promising === 'function';
}

export function detectRuntimePlacement(): RuntimePlacement {
  const hostState = globalThis as {
    Bun?: unknown;
    Deno?: unknown;
    document?: unknown;
    window?: unknown;
  };
  if (typeof hostState.Bun !== 'undefined') return 'bun';
  if (typeof hostState.Deno !== 'undefined') return 'deno';
  if (typeof hostState.window !== 'undefined' && typeof hostState.document !== 'undefined') {
    return 'browser-main';
  }
  if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
    return 'browser-worker';
  }
  if (typeof process !== 'undefined' && typeof process.versions?.node === 'string') return 'node';
  return 'other';
}

export function selectRuntimeFlavorForPlacement(placement = detectRuntimePlacement()): RuntimeFlavor {
  // Browser calls can cross Emscripten's JavaScript invoke trampolines. JSPI
  // cannot suspend through those frames, regardless of which thread runs WASM.
  if (
    placement === 'browser-main'
    || placement === 'browser-worker'
    || placement === 'bun'
    || placement === 'deno'
  ) {
    return 'asyncify';
  }
  return isJspiSupported() ? 'jspi' : 'asyncify';
}

export function createRuntimeLoader(adapter: RuntimeLoaderAdapter) {
  const modulePromises: Partial<Record<RuntimeKey, Promise<OrToolsWasmModule>>> = {};
  let selectedFlavor: RuntimeFlavor | null = null;

  function selectRuntimeFlavor(): RuntimeFlavor {
    if (selectedFlavor) {
      return selectedFlavor;
    }
    selectedFlavor = selectRuntimeFlavorForPlacement();
    if (adapter.logFlavorSelection) {
      console.log(
        selectedFlavor === 'jspi'
          ? 'JSPI is supported. Using JSPI runtime.'
          : 'Using Asyncify runtime.',
      );
    }
    return selectedFlavor;
  }

  async function createRuntime(
    runtimeName: RuntimeName,
    flavor: RuntimeFlavor = selectRuntimeFlavor(),
  ): Promise<OrToolsWasmModule> {
    const key: RuntimeKey = `${runtimeName}:${flavor}`;
    modulePromises[key] ??= (async () => {
      const asset = await adapter.resolveAsset(runtimeName, flavor);
      const createModule = await adapter.loadFactory(asset.jsUrl);
      const moduleOverrides: Record<string, unknown> = {
        locateFile: asset.locateFile,
      };
      if (asset.wasmBinary) {
        moduleOverrides.wasmBinary = asset.wasmBinary;
      }
      if (asset.mainScriptUrlOrBlob) {
        moduleOverrides.mainScriptUrlOrBlob = asset.mainScriptUrlOrBlob;
      }
      try {
        return await createModule(moduleOverrides);
      } finally {
        asset.cleanupGlobalState?.();
      }
    })();
    return modulePromises[key];
  }

  async function terminateLoadedRuntimeThreads(): Promise<void> {
    const modules = await Promise.allSettled(Object.values(modulePromises));
    for (const moduleResult of modules) {
      if (moduleResult.status !== 'fulfilled') continue;
      const module = moduleResult.value as RuntimeWithPthreads;
      try {
        if (Object.prototype.hasOwnProperty.call(module, 'PThread')) {
          module.PThread?.terminateAllThreads?.();
        }
      } catch (error) {
        if (!String(error).includes('PThread')) throw error;
      }
    }
  }

  return {
    terminateLoadedRuntimeThreads,
    loadRuntime: () => createRuntime('cp_sat_runtime'),
    loadRuntimeAsyncify: () => createRuntime('cp_sat_runtime', 'asyncify'),
    loadRoutingRuntime: () => createRuntime('routing_runtime'),
    loadRoutingRuntimeAsyncify: () => createRuntime('routing_runtime', 'asyncify'),
    loadMPSolverRuntime: () => createRuntime('mp_solver_runtime'),
    loadMPSolverRuntimeAsyncify: () => createRuntime('mp_solver_runtime', 'asyncify'),
    loadMathOptRuntime: () => createRuntime('mathopt_runtime'),
    loadMathOptRuntimeAsyncify: () => createRuntime('mathopt_runtime', 'asyncify'),
    loadPdlpRuntime: () => createRuntime('pdlp_runtime'),
    loadPdlpRuntimeAsyncify: () => createRuntime('pdlp_runtime', 'asyncify'),
    loadGraphRuntime: () => createRuntime('graph_runtime'),
    loadGraphRuntimeAsyncify: () => createRuntime('graph_runtime', 'asyncify'),
    loadSetCoverRuntime: () => createRuntime('set_cover_runtime'),
    loadSetCoverRuntimeAsyncify: () => createRuntime('set_cover_runtime', 'asyncify'),
  };
}
