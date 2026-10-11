import type { OrToolsWasmModule } from './wasm_module_types.js';

// Separate package entry points can share one cached native runtime. Store the
// queue on the module itself so independently bundled executors coordinate.
export async function withWasmRuntimeLock<T>(module: OrToolsWasmModule, run: () => Promise<T>): Promise<T> {
  const previous: Promise<void> = module.__ortoolsNativeCallTail ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  module.__ortoolsNativeCallTail = current;
  await previous;
  try { return await run(); }
  finally {
    release();
    if (module.__ortoolsNativeCallTail === current) delete module.__ortoolsNativeCallTail;
  }
}
