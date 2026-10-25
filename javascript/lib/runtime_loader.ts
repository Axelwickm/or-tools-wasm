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
