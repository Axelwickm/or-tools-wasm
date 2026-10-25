export function patchJspiAsyncCtors(runtime: string): string {
  if (!runtime.includes('WebAssembly.promising')) return runtime;

  if (runtime.includes('async function initRuntime()')) return runtime;

  return runtime
    // Release builds omit assertions, stack cookies and the debug worker hook.
    .replace(
      /function initRuntime\(\)\{([^{}]*?)wasmExports\["__wasm_call_ctors"\]\(\);?([^{}]*)\}/,
      'async function initRuntime(){$1await wasmExports["__wasm_call_ctors"]();$2}',
    )
    .split('initRuntime();readyPromiseResolve?.(Module);').join('await initRuntime();readyPromiseResolve?.(Module);')
    .split('initRuntime();postRun()').join('await initRuntime();postRun()')
    .split('if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}').join('if(ENVIRONMENT_IS_PTHREAD){await initRuntime();return}');
}
