import {
  createRuntimeLoader,
  type RuntimeFlavor,
  type RuntimeModuleFactory,
  type RuntimeName,
} from './runtime_loader_core.js';

export { isJspiSupported } from './runtime_loader_core.js';

export type BrowserRuntimeAsset = { jsUrl: string; wasmUrl: string };

const loader = createRuntimeLoader({
  logFlavorSelection: true,
  async loadFactory(runtimeUrl): Promise<RuntimeModuleFactory> {
    const { default: createModule } = await import(/* webpackIgnore: true */ /* @vite-ignore */ runtimeUrl);
    return createModule as RuntimeModuleFactory;
  },
});

export const terminateLoadedRuntimeThreads = loader.terminateLoadedRuntimeThreads;

export function loadBrowserRuntime(
  name: RuntimeName,
  resolveAsset: (flavor: RuntimeFlavor) => BrowserRuntimeAsset,
  flavor?: RuntimeFlavor,
) {
  return loader.loadRuntime(name, selectedFlavor => {
    // All shipped browser runtimes use shared memory, even for one search worker.
    const isolated = globalThis.crossOriginIsolated;
    const sharedMemory = typeof globalThis.SharedArrayBuffer === 'function';
    if (isolated !== true || !sharedMemory) {
      const placement = typeof document === 'undefined' ? 'browser-worker' : 'browser-main';
      throw new Error(
        'Threaded OR-Tools WASM requires a cross-origin-isolated page and SharedArrayBuffer. '
        + `crossOriginIsolated=${String(isolated)}, SharedArrayBuffer=${sharedMemory ? 'available' : 'unavailable'}, `
        + `isSecureContext=${String(globalThis.isSecureContext)}; runtime=${name}, flavor=${selectedFlavor}, placement=${placement}. `
        + 'Configure compatible Cross-Origin-Opener-Policy (COOP) and Cross-Origin-Embedder-Policy (COEP) response headers '
        + '(for example, same-origin and require-corp) and serve over HTTPS or localhost. '
        + 'These runtimes require shared memory even with one search worker.',
      );
    }
    const asset = resolveAsset(selectedFlavor);
    const baseName = selectedFlavor === 'asyncify' ? `${name}_asyncify` : name;
    return {
      jsUrl: asset.jsUrl,
      // Let Emscripten compile the response as it streams instead of buffering it.
      locateFile: file => file === `${baseName}.wasm` ? asset.wasmUrl
        : file === `${baseName}.js` ? asset.jsUrl : file,
      mainScriptUrlOrBlob: asset.jsUrl,
    };
  }, flavor);
}
