import type { OrToolsWasmModule } from './wasm_module_types.js';

export function allocateWasmBytes(
  module: OrToolsWasmModule,
  bytes: Uint8Array | null | undefined,
): number {
  if (!bytes?.length) return 0;
  const pointer = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, pointer);
  return pointer;
}

export async function withWasmCString<T>(
  module: OrToolsWasmModule,
  value: string,
  use: (pointer: number) => T | Promise<T>,
): Promise<T> {
  const pointer = allocateWasmBytes(
    module,
    new TextEncoder().encode(`${value}\0`),
  );
  try {
    return await use(pointer);
  } finally {
    module._free(pointer);
  }
}

export async function readWasmResult(
  module: OrToolsWasmModule,
  invoke: (lengthPointer: number) => number | Promise<number>,
  release: (pointer: number) => void = (pointer) => module._free(pointer),
): Promise<Uint8Array> {
  const lengthPointer = module._malloc(Uint32Array.BYTES_PER_ELEMENT);
  let resultPointer = 0;
  try {
    resultPointer = await invoke(lengthPointer);
    const length = new DataView(
      module.HEAPU8.buffer,
      lengthPointer,
      Uint32Array.BYTES_PER_ELEMENT,
    ).getUint32(0, true);
    return resultPointer && length
      ? module.HEAPU8.slice(resultPointer, resultPointer + length)
      : new Uint8Array();
  } finally {
    if (resultPointer) release(resultPointer);
    module._free(lengthPointer);
  }
}
