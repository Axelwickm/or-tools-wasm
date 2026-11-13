// Work around https://github.com/emscripten-core/emscripten/issues/28258.
// Remove once the pinned SDK retains the runtime across JSPI pthread entry.
export function patchJspiPthreadEntry(runtime: string): string {
  if (!runtime.includes('WebAssembly.promising') || !runtime.includes('var invokeEntryPoint=')) return runtime;
  const start = runtime.indexOf('var invokeEntryPoint=async(ptr,arg)=>{');
  const tail = 'finish(result)};';
  const end = runtime.indexOf(tail, start);
  if (start < 0 || end < 0) throw new Error('Unsupported Emscripten JSPI pthread entry');
  const entry = runtime.slice(start, end + tail.length);
  const call = 'var result=WebAssembly.promising(getWasmTableEntry(ptr))(arg);';
  const pending = 'var result;runtimeKeepalivePush();try{result=await WebAssembly.promising(getWasmTableEntry(ptr))(arg)}finally{runtimeKeepalivePop()}';
  if (entry.includes(pending)) return runtime;
  if (!entry.includes(call) || !entry.includes('result=await result;finish(result)')) {
    throw new Error('Unsupported Emscripten JSPI pthread entry lifetime');
  }
  // Await inside try so synchronous invocation errors and rejected promises
  // both release our keepalive. Do not introduce another await between the pop
  // and finish: a mailbox microtask in that gap could prematurely exit again.
  const patched = entry.replace(call, pending)
    .replace('result=await result;finish(result)', 'finish(result)');
  return runtime.slice(0, start) + patched + runtime.slice(end + tail.length);
}
