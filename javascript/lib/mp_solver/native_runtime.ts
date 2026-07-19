import { loadMPSolverRuntime } from '../runtime_loader.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';

let modulePromise: Promise<OrToolsWasmModule> | null = null;

export function loadMPSolverNativeModule(): Promise<OrToolsWasmModule> {
  return modulePromise ??= loadMPSolverRuntime();
}

export type NativeKnapsackResult = {
  ok: boolean;
  profit?: number;
  optimal?: boolean;
  name?: string;
  contains?: boolean[];
  error?: string;
};

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]): number {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, ptr, values.length).set(values);
  return ptr;
}

function flattenKnapsackWeights(weights: number[][], itemCount: number): number[] {
  const flattened: number[] = [];
  for (const dimension of weights) {
    if (dimension.length !== itemCount) {
      throw new Error('KnapsackSolver.init: each weight dimension must match profits length.');
    }
    flattened.push(...dimension);
  }
  return flattened;
}

function withCString<T>(module: OrToolsWasmModule, value: string, fn: (ptr: number) => T): T {
  const bytes = new TextEncoder().encode(`${value}\0`);
  const ptr = module._malloc(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  try {
    return fn(ptr);
  } finally {
    module._free(ptr);
  }
}

export async function executeKnapsackNative(
  solverType: number,
  name: string,
  useReduction: boolean,
  timeLimitSeconds: number,
  profits: number[],
  weights: number[][],
  capacities: number[],
): Promise<NativeKnapsackResult> {
  const module = await loadMPSolverNativeModule();
  const flattenedWeights = flattenKnapsackWeights(weights, profits.length);
  const profitsPtr = copyFloat64ToHeap(module, profits);
  const weightsPtr = copyFloat64ToHeap(module, flattenedWeights);
  const capacitiesPtr = copyFloat64ToHeap(module, capacities);
  const lengthPtr = module._malloc(4);
  let resultPtr = 0;
  try {
    const bytes = await withCString(module, name, async (namePtr) => {
      resultPtr = await module.ccall(
        'knapsack_solve_serialized',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [
          solverType,
          namePtr,
          useReduction ? 1 : 0,
          timeLimitSeconds,
          profitsPtr,
          profits.length,
          weightsPtr,
          weights.length,
          capacitiesPtr,
          lengthPtr,
        ],
        { async: true },
      ) as number;
      const length = new DataView(module.HEAPU8.buffer, lengthPtr, 4).getUint32(0, true);
      return resultPtr && length
        ? module.HEAPU8.slice(resultPtr, resultPtr + length)
        : new Uint8Array();
    });
    const result = JSON.parse(new TextDecoder().decode(bytes)) as NativeKnapsackResult;
    if (!result.ok) {
      throw new Error(result.error || 'KnapsackSolver.solve: native solve failed.');
    }
    return result;
  } finally {
    if (resultPtr) module.ccall('free_buffer', undefined, ['number'], [resultPtr]);
    if (profitsPtr) module._free(profitsPtr);
    if (weightsPtr) module._free(weightsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
    module._free(lengthPtr);
  }
}
