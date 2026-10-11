import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { readWasmResult, withWasmCString, withWasmAllocations, type WasmByteAllocator } from '../wasm_memory.js';

export type NativeKnapsackResult = {
  ok: boolean;
  profit?: bigint;
  optimal?: boolean;
  name?: string;
  contains?: boolean[];
  error?: string;
};

function copyInt64ToHeap(allocate: WasmByteAllocator, values: bigint[]): number {
  const array = BigInt64Array.from(values);
  return allocate(new Uint8Array(array.buffer));
}

function flattenKnapsackWeights(weights: bigint[][], itemCount: number): bigint[] {
  const flattened: bigint[] = [];
  for (const dimension of weights) {
    if (dimension.length !== itemCount) {
      throw new Error('KnapsackSolver.init: each weight dimension must match profits length.');
    }
    for (const weight of dimension) flattened.push(weight);
  }
  return flattened;
}

export async function executeKnapsackWithModule(
  module: OrToolsWasmModule,
  solverType: number,
  name: string,
  useReduction: boolean,
  timeLimitSeconds: number,
  numWorkers: number,
  profits: bigint[],
  weights: bigint[][],
  capacities: bigint[],
): Promise<NativeKnapsackResult> {
  const flattenedWeights = flattenKnapsackWeights(weights, profits.length);
  return withWasmAllocations(module, async allocate => {
    const profitsPtr = copyInt64ToHeap(allocate, profits);
    const weightsPtr = copyInt64ToHeap(allocate, flattenedWeights);
    const capacitiesPtr = copyInt64ToHeap(allocate, capacities);
    const bytes = await withWasmCString(module, name, (namePtr) => readWasmResult(
      module,
      (lengthPtr) => module.ccall(
        'knapsack_solve_serialized',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [
          solverType,
          namePtr,
          useReduction ? 1 : 0,
          timeLimitSeconds,
          numWorkers,
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
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Omit<NativeKnapsackResult, 'profit'> & { profit?: string };
    const result: NativeKnapsackResult = {
      ...parsed,
      profit: parsed.profit === undefined ? undefined : BigInt(parsed.profit),
    };
    if (!result.ok) {
      throw new Error(result.error || 'KnapsackSolver.solve: native solve failed.');
    }
    return result;
  });
}
