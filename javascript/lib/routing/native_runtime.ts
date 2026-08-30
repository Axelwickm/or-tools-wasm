import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { withWasmCString } from '../wasm_memory.js';
import type { RoutingSolveRequest, RoutingSolveResult } from './protocol.js';

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function toInt64(value: number): bigint {
  return globalThis.BigInt(value);
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

async function ccallVoid(
  module: OrToolsWasmModule,
  name: string,
  argTypes: string[],
  args: unknown[],
): Promise<void> {
  await module.ccall(name, undefined, argTypes, args, { async: true });
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
      throw new Error('Routing executor failed to register transit matrix.');
    }
    return evaluatorIndex;
  } finally {
    module._free(ptr);
  }
}

export async function solveRoutingWithModule(
  module: OrToolsWasmModule,
  message: RoutingSolveRequest,
  interruptible = false,
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
        await withWasmCString(module, operation.name, async (namePtr) => {
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
          await withWasmCString(module, operation.name, async (namePtr) => {
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
          await withWasmCString(module, operation.name, async (namePtr) => {
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
        await withWasmCString(module, operation.name, async (namePtr) => {
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
          await withWasmCString(module, operation.name, async (namePtr) => {
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
          await withWasmCString(module, operation.name, async (namePtr) => {
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
      } else if (operation.type === 'addVehicleEqualityConstraint') {
        const ok = await ccallNumber(
          module,
          'routing_add_vehicle_equality_constraint',
          ['number', 'bigint', 'bigint'],
          [modelHandle, toInt64(operation.left), toInt64(operation.right)],
        );
        if (ok !== 1) throw new Error('Routing failed to add a vehicle equality constraint.');
      } else if (operation.type === 'addCumulLessOrEqualConstraint') {
        const ok = await withWasmCString(module, operation.dimensionName, (namePtr) => ccallNumber(
          module,
          'routing_add_dimension_cumul_less_or_equal_constraint',
          ['number', 'number', 'bigint', 'bigint'],
          [modelHandle, namePtr, toInt64(operation.left), toInt64(operation.right)],
        ));
        if (ok !== 1) throw new Error('Routing failed to add a cumul precedence constraint.');
      } else if (operation.type === 'setSoftSpanUpperBound') {
        await withWasmCString(module, operation.dimensionName, (namePtr) => ccallVoid(
          module,
          'routing_dimension_set_soft_span_upper_bound',
          ['number', 'number', 'bigint', 'bigint', 'number'],
          [modelHandle, namePtr, toInt64(operation.bound), toInt64(operation.cost), operation.vehicle],
        ));
      } else if (operation.type === 'setQuadraticCostSoftSpanUpperBound') {
        await withWasmCString(module, operation.dimensionName, (namePtr) => ccallVoid(
          module,
          'routing_dimension_set_quadratic_cost_soft_span_upper_bound',
          ['number', 'number', 'bigint', 'bigint', 'number'],
          [modelHandle, namePtr, toInt64(operation.bound), toInt64(operation.cost), operation.vehicle],
        ));
      }
    }
    let ok: number;
    if (message.initialAssignment) {
      const routes = message.initialAssignment.routes;
      const values = copyInt64Array(module, routes.flat());
      const routeLengthsPtr = copyInt32Array(module, routes.map((route) => route.length));
      try {
        const read = await ccallNumber(
          module,
          'routing_read_assignment_from_routes',
          ['number', 'number', 'number', 'number', 'number'],
          [
            modelHandle,
            values.ptr,
            routeLengthsPtr,
            routes.length,
            message.initialAssignment.ignoreInactiveIndices ? 1 : 0,
          ],
        );
        ok = read === 1
          ? await ccallNumber(
              module,
              'routing_solve_from_assignment_with_parameters',
              ['number', 'number', 'number', 'number'],
              [modelHandle, message.firstSolutionStrategy, message.solutionLimit, interruptible ? 1 : 0],
            )
          : 0;
      } finally {
        module._free(values.ptr);
        module._free(routeLengthsPtr);
      }
    } else {
      ok = await ccallNumber(
        module,
        'routing_solve_with_parameters_ext',
        ['number', 'number', 'number', 'number'],
        [modelHandle, message.firstSolutionStrategy, message.solutionLimit, interruptible ? 1 : 0],
      );
    }
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
      await withWasmCString(module, dimensionName, async (namePtr) => {
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
    if (modelHandle) {
      await ccallVoid(module, 'routing_delete_model', ['number'], [modelHandle]);
    }
    if (managerHandle) {
      await ccallVoid(module, 'routing_delete_index_manager', ['number'], [managerHandle]);
    }
    if (startsPtr) module._free(startsPtr);
    if (endsPtr) module._free(endsPtr);
  }
}
