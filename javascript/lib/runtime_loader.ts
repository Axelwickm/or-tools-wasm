import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';

type RuntimeModuleFactory = (moduleOverrides?: Record<string, unknown>) => Promise<MainModule>;
type RuntimeFlavor = 'jspi' | 'asyncify';

const cpSatRuntimeJsUrl = new URL('#internal-wasm/cp_sat_runtime.js?no-inline', import.meta.url).href;
const cpSatRuntimeAsyncifyJsUrl = new URL('#internal-wasm/cp_sat_runtime_asyncify.js?no-inline', import.meta.url).href;
const cpSatRuntimeWasmUrl = new URL('#internal-wasm/cp_sat_runtime.wasm?no-inline', import.meta.url).href;
const cpSatRuntimeAsyncifyWasmUrl = new URL('#internal-wasm/cp_sat_runtime_asyncify.wasm?no-inline', import.meta.url).href;

const modulePromises: Partial<Record<RuntimeFlavor, Promise<MainModule>>> = {};
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

async function loadFactory(flavor = selectRuntimeFlavor()): Promise<RuntimeModuleFactory> {
  const runtimeUrl = flavor === 'jspi' ? cpSatRuntimeJsUrl : cpSatRuntimeAsyncifyJsUrl;
  const { default: createModule } = await import(/* webpackIgnore: true */ /* @vite-ignore */ runtimeUrl);
  return createModule as RuntimeModuleFactory;
}

function locateRuntimeFile(fileName: string) {
  if (fileName === 'cp_sat_runtime.js') {
    return cpSatRuntimeJsUrl;
  }
  if (fileName === 'cp_sat_runtime_asyncify.js') {
    return cpSatRuntimeAsyncifyJsUrl;
  }
  if (fileName === 'cp_sat_runtime.wasm') {
    return cpSatRuntimeWasmUrl;
  }
  if (fileName === 'cp_sat_runtime_asyncify.wasm') {
    return cpSatRuntimeAsyncifyWasmUrl;
  }
  return fileName;
}

export async function loadRuntime(): Promise<MainModule> {
  const flavor = selectRuntimeFlavor();
  if (!modulePromises[flavor]) {
    modulePromises[flavor] = (async () => {
      const createModule = await loadFactory(flavor);
      return createModule({
        locateFile: locateRuntimeFile,
        mainScriptUrlOrBlob: flavor === 'jspi' ? cpSatRuntimeJsUrl : cpSatRuntimeAsyncifyJsUrl,
      });
    })();
  }
  return modulePromises[flavor];
}

export async function loadRuntimeAsyncify(): Promise<MainModule> {
  if (!modulePromises.asyncify) {
    modulePromises.asyncify = (async () => {
      const createModule = await loadFactory('asyncify');
      return createModule({
        locateFile: locateRuntimeFile,
        mainScriptUrlOrBlob: cpSatRuntimeAsyncifyJsUrl,
      });
    })();
  }
  return modulePromises.asyncify;
}

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
