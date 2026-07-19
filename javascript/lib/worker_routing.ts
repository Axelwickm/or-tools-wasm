import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadRoutingRuntime } from './runtime_loader.js';

export type RoutingModelOperation =
  | { type: 'addDimension'; transitMatrix: BigInt64Array; slackMax: number; capacity: number; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleCapacity'; transitMatrix: BigInt64Array; slackMax: number; capacities: number[]; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDimensionWithVehicleTransits'; transitMatrices: BigInt64Array[]; slackMax: number; capacity: number; fixStartCumulToZero: boolean; name: string }
  | { type: 'addConstantDimension'; value: number; capacity: number; fixStartCumulToZero: boolean; name: string }
  | { type: 'addVectorDimension'; values: number[]; capacity: number; fixStartCumulToZero: boolean; name: string }
  | { type: 'addMatrixDimension'; matrix: number[][]; capacity: number; fixStartCumulToZero: boolean; name: string }
  | { type: 'addDisjunction'; indices: number[]; penalty?: number }
  | { type: 'addPickupAndDelivery'; pickup: number; delivery: number };

export type RoutingSolveRequest = {
  numLocations: number;
  numVehicles: number;
  starts: number[];
  ends: number[];
  firstSolutionStrategy: number;
  solutionLimit: number;
  transitMatrix: BigInt64Array;
  transitMatrixDimension: number;
  operations: RoutingModelOperation[];
  dimensionNames: string[];
};

export type RoutingSolveResult = {
  status: number;
  objectiveValue: number;
  nextValues: number[];
  starts: number[];
  ends: number[];
  dimensionCumulValues: Record<string, number[]>;
};

let modulePromise: Promise<OrToolsWasmModule> | null = null;

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function toInt64(value: number): bigint {
  return globalThis.BigInt(value);
}

function loadModule() {
  modulePromise ??= loadRoutingRuntime();
  return modulePromise;
}

function copyInt32Array(module: OrToolsWasmModule, values: number[]): number {
  const array = new Int32Array(values);
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer), ptr);
  return ptr;
}

function copyInt64Array(module: OrToolsWasmModule, values: BigInt64Array | number[]): { ptr: number; length: number } {
  const array = values instanceof BigInt64Array
    ? values
    : new BigInt64Array(values.map((value) => BigInt(value)));
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), ptr);
  return { ptr, length: array.length };
}

function copyString(module: OrToolsWasmModule, value: string): number {
  const bytes = new TextEncoder().encode(`${value}\0`);
  const ptr = module._malloc(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

async function withStringAsync<T>(module: OrToolsWasmModule, value: string, fn: (ptr: number) => T | Promise<T>): Promise<T> {
  const ptr = copyString(module, value);
  try {
    return await fn(ptr);
  } finally {
    module._free(ptr);
  }
}

async function ccallNumber(
  module: OrToolsWasmModule,
  name: string,
  argTypes: string[],
  args: unknown[],
): Promise<number> {
  return await module.ccall(name, 'number', argTypes, args, { async: true }) as number;
}

async function ccallBigInt(
  module: OrToolsWasmModule,
  name: string,
  argTypes: string[],
  args: unknown[],
): Promise<bigint> {
  return await module.ccall(name, 'bigint', argTypes, args, { async: true }) as bigint;
}

async function registerTransitMatrix(
  module: OrToolsWasmModule,
  modelHandle: number,
  matrix: BigInt64Array,
  dimension: number,
): Promise<number> {
  const { ptr, length } = copyInt64Array(module, matrix);
  try {
    const evaluatorIndex = await ccallNumber(
      module,
      'routing_register_matrix_transit_callback',
      ['number', 'number', 'number', 'number'],
      [modelHandle, ptr, length, dimension],
    );
    if (evaluatorIndex < 0) {
      throw new Error('Routing worker failed to register transit matrix.');
    }
    return evaluatorIndex;
  } finally {
    module._free(ptr);
  }
}

async function solveRoutingWithModule(
  module: OrToolsWasmModule,
  message: RoutingSolveRequest,
): Promise<RoutingSolveResult | null> {
  let managerHandle = 0;
  let modelHandle = 0;
  let startsPtr = 0;
  let endsPtr = 0;
  try {
    startsPtr = copyInt32Array(module, message.starts);
    endsPtr = copyInt32Array(module, message.ends);
    managerHandle = await ccallNumber(
      module,
      'routing_create_index_manager_starts_ends',
      ['number', 'number', 'number', 'number'],
      [message.numLocations, message.numVehicles, startsPtr, endsPtr],
    );
    modelHandle = await ccallNumber(module, 'routing_create_model', ['number'], [managerHandle]);
    const evaluatorIndex = await registerTransitMatrix(module, modelHandle, message.transitMatrix, message.transitMatrixDimension);
    await ccallNumber(
      module,
      'routing_set_arc_cost_evaluator_of_all_vehicles',
      ['number', 'number'],
      [modelHandle, evaluatorIndex],
    );

    for (const operation of message.operations) {
      if (operation.type === 'addDimension') {
        const index = await registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        await withStringAsync(module, operation.name, async (namePtr) => {
          await ccallNumber(
            module,
            'routing_add_dimension',
            ['number', 'number', 'bigint', 'bigint', 'number', 'number'],
            [modelHandle, index, BigInt(operation.slackMax), BigInt(operation.capacity), operation.fixStartCumulToZero ? 1 : 0, namePtr],
          );
        });
      } else if (operation.type === 'addDimensionWithVehicleCapacity') {
        const index = await registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        const capacities = copyInt64Array(module, operation.capacities);
        try {
          await withStringAsync(module, operation.name, async (namePtr) => {
            await ccallNumber(
              module,
              'routing_add_dimension_with_vehicle_capacity',
              ['number', 'number', 'bigint', 'number', 'number', 'number', 'number'],
              [modelHandle, index, BigInt(operation.slackMax), capacities.ptr, capacities.length, operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(capacities.ptr);
        }
      } else if (operation.type === 'addDimensionWithVehicleTransits') {
        const evaluatorIndices: number[] = [];
        for (const matrix of operation.transitMatrices) {
          evaluatorIndices.push(await registerTransitMatrix(module, modelHandle, matrix, message.transitMatrixDimension));
        }
        const evaluatorsPtr = copyInt32Array(module, evaluatorIndices);
        try {
          await withStringAsync(module, operation.name, async (namePtr) => {
            await ccallNumber(
              module,
              'routing_add_dimension_with_vehicle_transits',
              ['number', 'number', 'number', 'bigint', 'bigint', 'number', 'number'],
              [modelHandle, evaluatorsPtr, evaluatorIndices.length, BigInt(operation.slackMax), BigInt(operation.capacity), operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(evaluatorsPtr);
        }
      } else if (operation.type === 'addConstantDimension') {
        await withStringAsync(module, operation.name, async (namePtr) => {
          await ccallNumber(
            module,
            'routing_add_constant_dimension',
            ['number', 'bigint', 'bigint', 'number', 'number'],
            [modelHandle, BigInt(operation.value), BigInt(operation.capacity), operation.fixStartCumulToZero ? 1 : 0, namePtr],
          );
        });
      } else if (operation.type === 'addVectorDimension') {
        const values = copyInt64Array(module, operation.values);
        try {
          await withStringAsync(module, operation.name, async (namePtr) => {
            await ccallNumber(
              module,
              'routing_add_vector_dimension',
              ['number', 'number', 'number', 'bigint', 'number', 'number'],
              [modelHandle, values.ptr, values.length, BigInt(operation.capacity), operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(values.ptr);
        }
      } else if (operation.type === 'addMatrixDimension') {
        const flat = operation.matrix.flat();
        const matrix = copyInt64Array(module, flat);
        try {
          await withStringAsync(module, operation.name, async (namePtr) => {
            await ccallNumber(
              module,
              'routing_add_matrix_dimension',
              ['number', 'number', 'number', 'number', 'bigint', 'number', 'number'],
              [modelHandle, matrix.ptr, matrix.length, operation.matrix.length, BigInt(operation.capacity), operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(matrix.ptr);
        }
      } else if (operation.type === 'addDisjunction') {
        const indices = copyInt64Array(module, operation.indices);
        try {
          await ccallNumber(
            module,
            'routing_add_disjunction',
            ['number', 'number', 'number', 'bigint', 'number'],
            [modelHandle, indices.ptr, indices.length, BigInt(operation.penalty ?? 0), operation.penalty === undefined ? 0 : 1],
          );
        } finally {
          module._free(indices.ptr);
        }
      } else if (operation.type === 'addPickupAndDelivery') {
        await ccallNumber(
          module,
          'routing_add_pickup_and_delivery',
          ['number', 'bigint', 'bigint'],
          [modelHandle, toInt64(operation.pickup), toInt64(operation.delivery)],
        );
      }
    }
    const ok = await ccallNumber(
      module,
      'routing_solve_with_parameters_ext',
      ['number', 'number', 'number'],
      [modelHandle, message.firstSolutionStrategy, message.solutionLimit],
    );
    if (ok !== 1) {
      return null;
    }

    const starts: number[] = [];
    const ends: number[] = [];
    const nextValues = Array.from({ length: message.transitMatrixDimension }, (_, index) => index);
    const dimensionCumulValues: Record<string, number[]> = {};

    for (let vehicle = 0; vehicle < message.numVehicles; vehicle++) {
      let index = toNumber(await ccallBigInt(module, 'routing_start', ['number', 'number'], [modelHandle, vehicle]));
      starts.push(index);
      while (await ccallNumber(module, 'routing_is_end', ['number', 'bigint'], [modelHandle, toInt64(index)]) !== 1) {
        const next = toNumber(await ccallBigInt(module, 'routing_next_value', ['number', 'bigint'], [modelHandle, toInt64(index)]));
        nextValues[index] = next;
        index = next;
      }
      ends.push(index);
    }

    for (const dimensionName of message.dimensionNames) {
      dimensionCumulValues[dimensionName] = [];
      await withStringAsync(module, dimensionName, async (namePtr) => {
        for (let index = 0; index < message.transitMatrixDimension; index++) {
          dimensionCumulValues[dimensionName][index] = toNumber(
            await ccallBigInt(
              module,
              'routing_assignment_dimension_cumul_value',
              ['number', 'number', 'bigint'],
              [modelHandle, namePtr, toInt64(index)],
            ),
          );
        }
      });
    }

    return {
      status: await ccallNumber(module, 'routing_status', ['number'], [modelHandle]),
      objectiveValue: toNumber(await ccallBigInt(module, 'routing_assignment_objective_value', ['number'], [modelHandle])),
      nextValues,
      starts,
      ends,
      dimensionCumulValues,
    };
  } finally {
    // OR-Tools currently aborts when deleting solved routing models in this
    // wasm worker path. Chromium can also abort on post-solve heap frees, so
    // the bridge keeps these small buffers with the retained native handles.
  }
}

export async function solveRoutingInWorker(message: RoutingSolveRequest): Promise<RoutingSolveResult | null> {
  return await solveRoutingWithModule(await loadModule(), message);
}
