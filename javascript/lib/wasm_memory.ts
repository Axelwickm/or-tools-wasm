import type { OrToolsWasmModule } from './wasm_module_types.js';

export function allocateWasm(module: OrToolsWasmModule, size: number): number {
  const pointer = module._malloc(size);
  if (!pointer) throw new Error('Could not allocate WASM memory.');
  return pointer;
}

export function allocateWasmBytes(
  module: OrToolsWasmModule,
  bytes: Uint8Array | null | undefined,
  minimumSize = 0,
): number {
  const size = Math.max(bytes?.length ?? 0, minimumSize);
  if (!size) return 0;
  const pointer = allocateWasm(module, size);
  try {
    if (bytes) module.HEAPU8.set(bytes, pointer);
    return pointer;
  } catch (error) { module._free(pointer); throw error; }
}

export type WasmByteAllocator = (bytes: Uint8Array, minimumSize?: number) => number;

export async function withWasmAllocations<T>(module: OrToolsWasmModule,
  use: (allocate: WasmByteAllocator) => T | Promise<T>): Promise<T> {
  const pointers: number[] = [];
  try {
    return await use((bytes, minimumSize) => {
      const pointer = allocateWasmBytes(module, bytes, minimumSize);
      if (pointer) pointers.push(pointer);
      return pointer;
    });
  } finally { for (const pointer of pointers) module._free(pointer); }
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
  const lengthPointer = allocateWasm(module, Uint32Array.BYTES_PER_ELEMENT);
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
    try { if (resultPointer) release(resultPointer); }
    finally { module._free(lengthPointer); }
  }
}
