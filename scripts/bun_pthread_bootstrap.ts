// Bun may deliver pthread messages while the runtime's dynamic import is pending.
// This function is embedded in the worker Blob, so it must be self-contained.
export async function initializeBunPthread(loadRuntime: () => Promise<unknown>) {
  const pending: MessageEvent[] = [];
  self.onmessage = (event) => { pending.push(event); };
  Object.assign(globalThis, { __ORTOOLS_WASM_PTHREAD: true });
  await loadRuntime();
  for (const event of pending) self.onmessage!(event);
}
