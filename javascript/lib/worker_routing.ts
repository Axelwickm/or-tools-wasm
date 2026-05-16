import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';
import { loadRuntimeAsyncify } from './runtime_loader.js';
import type { RoutingSolveRequest, RoutingSolveResult } from './worker_protocol.js';

let asyncifyModulePromise: Promise<MainModule> | null = null;

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function toInt64(value: number): bigint {
  return globalThis.BigInt(value);
}

function loadAsyncifyModule() {
  asyncifyModulePromise ??= loadRuntimeAsyncify();
  return asyncifyModulePromise;
}

function copyInt32Array(module: MainModule, values: number[]): number {
  const array = new Int32Array(values);
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer), ptr);
  return ptr;
}

function copyInt64Array(module: MainModule, values: BigInt64Array | number[]): { ptr: number; length: number } {
  const array = values instanceof BigInt64Array
    ? values
    : new BigInt64Array(values.map((value) => BigInt(value)));
  const ptr = module._malloc(array.byteLength);
  module.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), ptr);
  return { ptr, length: array.length };
}

function copyString(module: MainModule, value: string): number {
  const bytes = new TextEncoder().encode(`${value}\0`);
  const ptr = module._malloc(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

function withString<T>(module: MainModule, value: string, fn: (ptr: number) => T): T {
  const ptr = copyString(module, value);
  try {
    return fn(ptr);
  } finally {
    module._free(ptr);
  }
}

function registerTransitMatrix(
  module: MainModule,
  modelHandle: number,
  matrix: BigInt64Array,
  dimension: number,
): number {
  const { ptr, length } = copyInt64Array(module, matrix);
  try {
    const evaluatorIndex = module._routing_register_matrix_transit_callback(
      modelHandle,
      ptr,
      length,
      dimension,
    );
    if (evaluatorIndex < 0) {
      throw new Error('Routing worker failed to register transit matrix.');
    }
    return evaluatorIndex;
  } finally {
    module._free(ptr);
  }
}

function isJspiSuspendError(error: unknown) {
  return error instanceof Error && error.name === 'SuspendError';
}

async function solveRoutingWithModule(
  module: MainModule,
  message: RoutingSolveRequest,
): Promise<RoutingSolveResult | null> {
  let managerHandle = 0;
  let modelHandle = 0;
  let startsPtr = 0;
  let endsPtr = 0;
  try {
    startsPtr = copyInt32Array(module, message.starts);
    endsPtr = copyInt32Array(module, message.ends);
    managerHandle = module._routing_create_index_manager_starts_ends(
      message.numLocations,
      message.numVehicles,
      startsPtr,
      endsPtr,
    );
    modelHandle = module._routing_create_model(managerHandle);
    const evaluatorIndex = registerTransitMatrix(module, modelHandle, message.transitMatrix, message.transitMatrixDimension);
    module._routing_set_arc_cost_evaluator_of_all_vehicles(modelHandle, evaluatorIndex);

    for (const operation of message.operations) {
      if (operation.type === 'addDimension') {
        const index = registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        withString(module, operation.name, (namePtr) => {
          module._routing_add_dimension(
            modelHandle,
            index,
            BigInt(operation.slackMax),
            BigInt(operation.capacity),
            operation.fixStartCumulToZero ? 1 : 0,
            namePtr,
          );
        });
      } else if (operation.type === 'addDimensionWithVehicleCapacity') {
        const index = registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        const capacities = copyInt64Array(module, operation.capacities);
        try {
          withString(module, operation.name, (namePtr) => {
            module._routing_add_dimension_with_vehicle_capacity(
              modelHandle,
              index,
              BigInt(operation.slackMax),
              capacities.ptr,
              capacities.length,
              operation.fixStartCumulToZero ? 1 : 0,
              namePtr,
            );
          });
        } finally {
          module._free(capacities.ptr);
        }
      } else if (operation.type === 'addDimensionWithVehicleTransits') {
        const evaluatorIndices = operation.transitMatrices.map((matrix) => {
          return registerTransitMatrix(module, modelHandle, matrix, message.transitMatrixDimension);
        });
        const evaluatorsPtr = copyInt32Array(module, evaluatorIndices);
        try {
          withString(module, operation.name, (namePtr) => {
            module._routing_add_dimension_with_vehicle_transits(
              modelHandle,
              evaluatorsPtr,
              evaluatorIndices.length,
              BigInt(operation.slackMax),
              BigInt(operation.capacity),
              operation.fixStartCumulToZero ? 1 : 0,
              namePtr,
            );
          });
        } finally {
          module._free(evaluatorsPtr);
        }
      } else if (operation.type === 'addConstantDimension') {
        withString(module, operation.name, (namePtr) => {
          module._routing_add_constant_dimension(
            modelHandle,
            BigInt(operation.value),
            BigInt(operation.capacity),
            operation.fixStartCumulToZero ? 1 : 0,
            namePtr,
          );
        });
      } else if (operation.type === 'addVectorDimension') {
        const values = copyInt64Array(module, operation.values);
        try {
          withString(module, operation.name, (namePtr) => {
            module._routing_add_vector_dimension(
              modelHandle,
              values.ptr,
              values.length,
              BigInt(operation.capacity),
              operation.fixStartCumulToZero ? 1 : 0,
              namePtr,
            );
          });
        } finally {
          module._free(values.ptr);
        }
      } else if (operation.type === 'addMatrixDimension') {
        const flat = operation.matrix.flat();
        const matrix = copyInt64Array(module, flat);
        try {
          withString(module, operation.name, (namePtr) => {
            module._routing_add_matrix_dimension(
              modelHandle,
              matrix.ptr,
              matrix.length,
              operation.matrix.length,
              BigInt(operation.capacity),
              operation.fixStartCumulToZero ? 1 : 0,
              namePtr,
            );
          });
        } finally {
          module._free(matrix.ptr);
        }
      } else if (operation.type === 'addDisjunction') {
        const indices = copyInt64Array(module, operation.indices);
        try {
          module._routing_add_disjunction(
            modelHandle,
            indices.ptr,
            indices.length,
            BigInt(operation.penalty ?? 0),
            operation.penalty === undefined ? 0 : 1,
          );
        } finally {
          module._free(indices.ptr);
        }
      } else if (operation.type === 'addPickupAndDelivery') {
        module._routing_add_pickup_and_delivery(
          modelHandle,
          toInt64(operation.pickup),
          toInt64(operation.delivery),
        );
      }
    }
    const solveResult = module._routing_solve_with_parameters_ext(
      modelHandle,
      message.firstSolutionStrategy,
      message.solutionLimit,
    ) as unknown;
    const ok = solveResult && typeof solveResult === 'object' && typeof (solveResult as Promise<number>).then === 'function'
      ? await solveResult
      : solveResult;
    if (ok !== 1) {
      return null;
    }

    const starts: number[] = [];
    const ends: number[] = [];
    const nextValues = Array.from({ length: message.transitMatrixDimension }, (_, index) => index);
    const dimensionCumulValues: Record<string, number[]> = {};

    for (let vehicle = 0; vehicle < message.numVehicles; vehicle++) {
      let index = toNumber(module._routing_start(modelHandle, vehicle));
      starts.push(index);
      while (module._routing_is_end(modelHandle, toInt64(index)) !== 1) {
        const next = toNumber(module._routing_next_value(modelHandle, toInt64(index)));
        nextValues[index] = next;
        index = next;
      }
      ends.push(index);
    }

    for (const dimensionName of message.dimensionNames) {
      dimensionCumulValues[dimensionName] = [];
      withString(module, dimensionName, (namePtr) => {
        for (let index = 0; index < message.transitMatrixDimension; index++) {
          dimensionCumulValues[dimensionName][index] = toNumber(
            module._routing_assignment_dimension_cumul_value(modelHandle, namePtr, toInt64(index)),
          );
        }
      });
    }

    return {
      objectiveValue: toNumber(module._routing_assignment_objective_value(modelHandle)),
      nextValues,
      starts,
      ends,
      dimensionCumulValues,
    };
  } finally {
    if (startsPtr !== 0) module._free(startsPtr);
    if (endsPtr !== 0) module._free(endsPtr);
    // OR-Tools currently aborts when deleting solved routing models in this
    // wasm worker path, so native routing handles are intentionally retained.
  }
}

export async function solveRoutingInWorker(
  module: MainModule,
  message: RoutingSolveRequest,
): Promise<RoutingSolveResult | null> {
  try {
    return await solveRoutingWithModule(module, message);
  } catch (error) {
    if (!isJspiSuspendError(error)) {
      throw error;
    }
    return await solveRoutingWithModule(await loadAsyncifyModule(), message);
  }
}
