import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { readWasmResult, withWasmCString } from '../wasm_memory.js';

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

export async function executeKnapsackWithModule(
  module: OrToolsWasmModule,
  solverType: number,
  name: string,
  useReduction: boolean,
  timeLimitSeconds: number,
  profits: number[],
  weights: number[][],
  capacities: number[],
): Promise<NativeKnapsackResult> {
  const flattenedWeights = flattenKnapsackWeights(weights, profits.length);
  const profitsPtr = copyFloat64ToHeap(module, profits);
  const weightsPtr = copyFloat64ToHeap(module, flattenedWeights);
  const capacitiesPtr = copyFloat64ToHeap(module, capacities);
  try {
    const bytes = await withWasmCString(module, name, (namePtr) => readWasmResult(
      module,
      (lengthPtr) => module.ccall(
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
      ) as Promise<number>,
      (pointer) => module.ccall('free_buffer', undefined, ['number'], [pointer]),
    ));
    const result = JSON.parse(new TextDecoder().decode(bytes)) as NativeKnapsackResult;
    if (!result.ok) {
      throw new Error(result.error || 'KnapsackSolver.solve: native solve failed.');
    }
    return result;
  } finally {
    if (profitsPtr) module._free(profitsPtr);
    if (weightsPtr) module._free(weightsPtr);
    if (capacitiesPtr) module._free(capacitiesPtr);
  }
}
