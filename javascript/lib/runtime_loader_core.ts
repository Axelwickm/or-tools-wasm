import type { OrToolsWasmModule } from './wasm_module_types.js';

export type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<OrToolsWasmModule>;
export type RuntimeFlavor = 'jspi' | 'asyncify';
export type RuntimeName =
  | 'cp_sat_runtime'
  | 'routing_runtime'
  | 'mp_solver_runtime'
  | 'mathopt_runtime'
  | 'pdlp_runtime'
  | 'graph_runtime'
  | 'set_cover_runtime';

type RuntimeKey = `${RuntimeName}:${RuntimeFlavor}`;

export type RuntimeAsset = {
  jsUrl: string;
  locateFile: (fileName: string) => string;
  wasmBinary?: Uint8Array;
  mainScriptUrlOrBlob?: string;
  cleanupGlobalState?: () => void;
};

export type RuntimeLoaderAdapter = {
  loadFactory(runtimeUrl: string): Promise<RuntimeModuleFactory>;
  logFlavorSelection?: boolean;
};

type RuntimeWithPthreads = OrToolsWasmModule & {
  PThread?: {
    terminateAllThreads?: () => void;
  };
};

export function isJspiSupported(): boolean {
  const wasm = globalThis.WebAssembly as (typeof WebAssembly & { promising?: unknown }) | undefined;
  return typeof wasm?.promising === 'function';
}

export function preferredRuntimeFlavor(): RuntimeFlavor {
  return isJspiSupported() ? 'jspi' : 'asyncify';
}

export function createRuntimeLoader(adapter: RuntimeLoaderAdapter) {
  const modulePromises: Partial<Record<RuntimeKey, Promise<OrToolsWasmModule>>> = {};
  let selectedFlavor: RuntimeFlavor | null = null;

  function selectRuntimeFlavor(): RuntimeFlavor {
    if (selectedFlavor) {
      return selectedFlavor;
    }
    selectedFlavor = preferredRuntimeFlavor();
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
    resolveAsset: (flavor: RuntimeFlavor) => RuntimeAsset | Promise<RuntimeAsset>,
    flavor: RuntimeFlavor = selectRuntimeFlavor(),
  ): Promise<OrToolsWasmModule> {
    const key: RuntimeKey = `${runtimeName}:${flavor}`;
    modulePromises[key] ??= (async () => {
      const asset = await resolveAsset(flavor);
      try {
        const createModule = await adapter.loadFactory(asset.jsUrl);
        const moduleOverrides: Record<string, unknown> = {
          locateFile: asset.locateFile,
          noExitRuntime: true,
        };
        if (asset.wasmBinary) {
          moduleOverrides.wasmBinary = asset.wasmBinary;
        }
        if (asset.mainScriptUrlOrBlob) {
          moduleOverrides.mainScriptUrlOrBlob = asset.mainScriptUrlOrBlob;
        }
        return await createModule(moduleOverrides);
      } finally {
        asset.cleanupGlobalState?.();
      }
    })();
    const loading = modulePromises[key];
    try { return await loading; }
    catch (error) {
      if (modulePromises[key] === loading) delete modulePromises[key];
      throw error;
    }
  }

  async function terminateLoadedRuntimeThreads(): Promise<void> {
    const loadedModules = Object.entries(modulePromises);
    const modules = await Promise.allSettled(loadedModules.map(([, module]) => module));
    try {
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
    } finally {
      for (const [key, loading] of loadedModules) {
        if (modulePromises[key as RuntimeKey] === loading) delete modulePromises[key as RuntimeKey];
      }
    }
  }

  return {
    terminateLoadedRuntimeThreads,
    loadRuntime: createRuntime,
  };
}
