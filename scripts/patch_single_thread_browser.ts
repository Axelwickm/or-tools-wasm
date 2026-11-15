/** Keep the WASM binary unchanged: disable pthread startup only in browsers
 * without isolation. Capacity imports count the calling solver thread there.
 */
export function patchSingleThreadBrowser(source: string): string {
  const single = '(typeof globalThis.crossOriginIsolated==="boolean"&&(globalThis.crossOriginIsolated!==true||typeof globalThis.SharedArrayBuffer!=="function"))';
  source = source.split('()=>PThread.unusedWorkers.length').join(`()=>${single}?1:PThread.unusedWorkers.length`);
  if (source.includes('/* ortools-single-thread-browser */')) return source;
  const pool = /var pthreadPoolSize=(navigator\.hardwareConcurrency(?:\+1)?);/;
  if (!pool.test(source)) throw new Error('Unsupported Emscripten pthread pool initialization');
  return source.replace(pool, `/* ortools-single-thread-browser */var pthreadPoolSize=${single}?0:$1;`)
    .split('return PThread.unusedWorkers.length').join(`return ${single}?1:PThread.unusedWorkers.length`)
    .split('return Math.max(0,PThread.unusedWorkers.length-1)').join(`return ${single}?1:Math.max(0,PThread.unusedWorkers.length-1)`);
}
