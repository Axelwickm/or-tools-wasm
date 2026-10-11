import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { withWasmCString, allocateWasm, allocateWasmBytes } from '../wasm_memory.js';
import { RoutingVariableKind, routingDimensionValueKinds, type RoutingSolveRequest, type RoutingSolveResult, type RoutingLinearExpression, type RoutingDomainResult, type RoutingAssignmentVariable, type RoutingResourceData, type RoutingResourceInspectionData, type RoutingBooleanExpressionData } from './protocol.js';
import { toIndex, toInt64, type IntValue } from '../int64.js';

function copyInt32Array(module: OrToolsWasmModule, values: number[]): number {
  const array = new Int32Array(values);
  return allocateWasmBytes(module, new Uint8Array(array.buffer), 4);
}

function copyInt64Array(module: OrToolsWasmModule, values: BigInt64Array | IntValue[]): { ptr: number; length: number } {
  const array = values instanceof BigInt64Array
    ? values
    : BigInt64Array.from(values, (value) => toInt64(value));
  const ptr = allocateWasmBytes(module, new Uint8Array(array.buffer, array.byteOffset, array.byteLength), 8);
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

async function createLinearExpression(module: OrToolsWasmModule, model: number, expression: RoutingLinearExpression): Promise<number> {
  const pointers: number[] = [];
  try {
    const resourceGroups = copyInt32Array(module, expression.terms.map(term => term.variable.resourceGroup ?? 0)); pointers.push(resourceGroups);
    const kinds = copyInt32Array(module, expression.terms.map(term => term.variable.kind)); pointers.push(kinds);
    const indices = copyInt64Array(module, expression.terms.map(term => BigInt(term.variable.index))); pointers.push(indices.ptr);
    const coefficients = copyInt64Array(module, expression.terms.map(term => term.coefficient)); pointers.push(coefficients.ptr);
    const names = expression.terms.map(term => {
      const bytes = new TextEncoder().encode(`${term.variable.dimensionName}\0`);
      const pointer = allocateWasmBytes(module, bytes); pointers.push(pointer); return pointer;
    });
    const namesPtr = copyInt32Array(module, names); pointers.push(namesPtr);
    const id = await ccallNumber(module, 'routing_create_linear_expression',
      ['number', 'number', 'number', 'number', 'number', 'number', 'bigint', 'number'],
      [model, kinds, indices.ptr, coefficients.ptr, namesPtr, expression.terms.length, expression.offset, resourceGroups]);
    if (!id) throw new Error('Routing expression has an invalid variable reference.');
    return id;
  } finally { for (const pointer of pointers) module._free(pointer); }
}

async function createBooleanExpression(module: OrToolsWasmModule, model: number, expression: RoutingBooleanExpressionData): Promise<number> {
  let left = 0, right = 0, comparison = 0, value = 0;
  const kinds = { constant: 1, variable: 2, comparison: 3, and: 4, or: 5, not: 6 };
  if (expression.kind === 'constant') value = expression.value ? 1 : 0;
  else if (expression.kind === 'variable') left = await createLinearExpression(module, model, { terms: [{ variable: expression.variable, coefficient: 1n }], offset: 0n });
  else if (expression.kind === 'comparison') {
    left = await createLinearExpression(module, model, expression.comparison.left);
    right = await createLinearExpression(module, model, expression.comparison.right);
    comparison = expression.comparison.comparison;
  }
  const children: number[] = [];
  if ('operands' in expression) for (const operand of expression.operands) children.push(await createBooleanExpression(module, model, operand));
  const pointer = copyInt32Array(module, children);
  try {
    const id = await ccallNumber(module, 'routing_create_boolean_expression', Array(8).fill('number'),
      [model, kinds[expression.kind], value, comparison, left, right, pointer, children.length]);
    if (!id) throw new Error('Invalid native Routing Boolean expression.');
    return id;
  } finally { module._free(pointer); }
}

async function solveWithSearchParameters(
  module: OrToolsWasmModule, modelHandle: number, message: RoutingSolveRequest,
  fromAssignment: boolean, interruptible: boolean,
): Promise<number> {
  const bytes = message.searchParametersProto;
  const pointer = allocateWasmBytes(module, bytes, 1);
  try {
    const result = await withWasmCString(module, (message.searchParameterFields ?? []).join(','), async fieldPaths =>
      ccallNumber(module, 'routing_solve_with_parameters_proto',
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [modelHandle, pointer, bytes.length, fieldPaths, fromAssignment ? 1 : 0, interruptible ? 1 : 0]));
    if (result < 0) {
      const error = await module.ccall('routing_last_search_parameter_error', 'string', [], []);
      throw new Error(`Routing search parameters: ${error}`);
    }
    return result;
  } finally { module._free(pointer); }
}

export async function solveRoutingWithModule(
  module: OrToolsWasmModule,
  message: RoutingSolveRequest,
  interruptible = false,
  callbackId = 0,
): Promise<{ status: number; solution: RoutingSolveResult | null; localSearchProfile: string; automaticFirstSolutionStrategy: number; domainResults?: RoutingDomainResult[]; arcCosts?: bigint[]; resourceInspection?: RoutingResourceInspectionData }> {
  let managerHandle = 0;
  let modelHandle = 0;
  let startsPtr = 0;
  let endsPtr = 0;
  if (message.readAssignmentOnly && !message.initialAssignment) throw new Error('Routing assignment validation requires routes.');
  try {
    startsPtr = copyInt32Array(module, message.starts);
    endsPtr = copyInt32Array(module, message.ends);
    managerHandle = await ccallNumber(
      module,
      'routing_create_index_manager_starts_ends',
      ['number', 'number', 'number', 'number'],
      [message.numLocations, message.numVehicles, startsPtr, endsPtr],
    );
    if (message.modelParametersProto !== undefined) {
      const bytes = message.modelParametersProto;
      const pointer = allocateWasmBytes(module, bytes, 1);
      try {
        modelHandle = await withWasmCString(module, (message.modelParameterFields ?? []).join(','), paths =>
          ccallNumber(module, 'routing_create_model_with_parameters',
            ['number', 'number', 'number', 'number'], [managerHandle, pointer, bytes.length, paths]));
      } finally { module._free(pointer); }
    } else modelHandle = await ccallNumber(module, 'routing_create_model', ['number'], [managerHandle]);
    if (callbackId && message.solutionEvents) module.ccall('routing_add_solution_callback', undefined,
      ['number', 'number', 'number'], [modelHandle, callbackId, message.trackUncheckedNeighbors ? 1 : 0]);
    if (!modelHandle) throw new Error(`Routing model parameters: ${module.ccall('routing_last_search_parameter_error', 'string', [], [])}`);
    const evaluatorIndex = await registerTransitMatrix(module, modelHandle, message.transitMatrix, message.transitMatrixDimension);
    await ccallNumber(
      module,
      'routing_set_arc_cost_evaluator_of_all_vehicles',
      ['number', 'number'],
      [modelHandle, evaluatorIndex],
    );

    for (let group = 0; group < (message.resourceGroups?.length ?? 0); ++group) {
      if (await ccallNumber(module, 'routing_add_resource_group', ['number'], [modelHandle]) !== group) throw new Error('Failed to create Routing resource group.');
    }
    for (const operation of message.operations) {
      if (operation.type === 'addIntegerExpression') {
        const operands: number[] = [];
        for (const operand of operation.operands) operands.push(await createLinearExpression(module, modelHandle, operand));
        const pointer = copyInt32Array(module, operands);
        try {
          const expression = await ccallNumber(module, 'routing_create_integer_expression', Array(4).fill('number'), [modelHandle, operation.kind, pointer, operands.length]);
          if (!expression || await ccallNumber(module, 'routing_register_integer_variable', Array(3).fill('number'), [modelHandle, operation.index, expression]) !== 1) {
            throw new Error('Invalid native Routing integer expression kind, arity or operands.');
          }
        } finally { module._free(pointer); }
      } else if (operation.type === 'addBooleanVariable' || operation.type === 'addBooleanConstraint') {
        const expression = await createBooleanExpression(module, modelHandle, operation.expression);
        const ok = operation.type === 'addBooleanVariable'
          ? await ccallNumber(module, 'routing_register_boolean_variable', ['number', 'number', 'number'], [modelHandle, operation.index, expression])
          : await ccallNumber(module, 'routing_add_boolean_constraint', ['number', 'number'], [modelHandle, expression]);
        if (ok !== 1) throw new Error('Invalid native Routing Boolean variable or constraint.');
      } else if (operation.type === 'setMaximumActiveVehicles') {
        const ok = await ccallNumber(module, 'routing_set_maximum_active_vehicles', ['number', 'number'],
          [modelHandle, toIndex(operation.maximum, 'Routing maximum active vehicles', 2_147_483_647)]);
        if (ok !== 1) throw new Error('Routing failed to set the active vehicle limit.');
      } else if (operation.type === 'setFixedVehicleCost') {
        const ok = await ccallNumber(module, 'routing_set_fixed_vehicle_cost', ['number', 'number', 'bigint'],
          [modelHandle, toIndex(operation.vehicle, 'Routing fixed-cost vehicle', message.numVehicles - 1), toInt64(operation.cost)]);
        if (ok !== 1) throw new Error('Routing failed to set a fixed vehicle cost.');
      } else if (operation.type === 'setAmortizedVehicleCosts') {
        const ok = await ccallNumber(module, 'routing_set_amortized_vehicle_costs', ['number', 'number', 'bigint', 'bigint'],
          [modelHandle, toIndex(operation.vehicle, 'Routing amortized-cost vehicle', message.numVehicles - 1), toInt64(operation.linear), toInt64(operation.quadratic)]);
        if (ok !== 1) throw new Error('Routing failed to set amortized vehicle costs.');
      } else if (operation.type === 'setVehicleUsedWhenEmpty') {
        if (typeof operation.isUsed !== 'boolean') throw new TypeError('Routing empty-route usage must be a boolean.');
        const ok = await ccallNumber(module, 'routing_set_vehicle_used_when_empty', ['number', 'number', 'number'],
          [modelHandle, toIndex(operation.vehicle, 'Routing empty-route vehicle', message.numVehicles - 1), Number(operation.isUsed)]);
        if (ok !== 1) throw new Error('Routing failed to set empty-route usage.');
      } else if (operation.type === 'setArcCostEvaluatorOfVehicles') {
        if (!operation.vehicles.length || operation.vehicles.some(vehicle => !Number.isInteger(vehicle) || vehicle < 0 || vehicle >= message.numVehicles)) {
          throw new Error('Routing arc-cost vehicle is out of range.');
        }
        const index = await registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        for (const vehicle of operation.vehicles) await ccallNumber(module, 'routing_set_arc_cost_evaluator_of_vehicle',
          ['number', 'number', 'number'], [modelHandle, index, vehicle]);
      } else if (operation.type === 'addDimension') {
        const index = await registerTransitMatrix(module, modelHandle, operation.transitMatrix, message.transitMatrixDimension);
        await withWasmCString(module, operation.name, async (namePtr) => {
          await ccallNumber(
            module,
            'routing_add_dimension',
            ['number', 'number', 'bigint', 'bigint', 'number', 'number'],
            [modelHandle, index, operation.slackMax, operation.capacity, operation.fixStartCumulToZero ? 1 : 0, namePtr],
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
              [modelHandle, index, operation.slackMax, capacities.ptr, capacities.length, operation.fixStartCumulToZero ? 1 : 0, namePtr],
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
              [modelHandle, evaluatorsPtr, evaluatorIndices.length, operation.slackMax, operation.capacity, operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(evaluatorsPtr);
        }
      } else if (operation.type === 'addDimensionWithVehicleTransitAndCapacity') {
        if (operation.transitMatrices.length !== message.numVehicles || operation.capacities.length !== message.numVehicles)
          throw new RangeError('Routing dimension requires one evaluator and capacity per vehicle.');
        const evaluatorIndices: number[] = [];
        for (const matrix of operation.transitMatrices)
          evaluatorIndices.push(await registerTransitMatrix(module, modelHandle, matrix, message.transitMatrixDimension));
        const evaluatorsPtr = copyInt32Array(module, evaluatorIndices);
        try {
          const capacities = copyInt64Array(module, operation.capacities);
          try {
            const added = await withWasmCString(module, operation.name, namePtr => ccallNumber(module,
              'routing_add_dimension_with_vehicle_transit_and_capacity',
              ['number', 'number', 'number', 'bigint', 'number', 'number', 'number', 'number'],
              [modelHandle, evaluatorsPtr, evaluatorIndices.length, operation.slackMax, capacities.ptr, capacities.length,
                operation.fixStartCumulToZero ? 1 : 0, namePtr]));
            if (added !== 1) throw new Error('Routing failed to add vehicle transit/capacity dimension.');
          } finally { module._free(capacities.ptr); }
        } finally { module._free(evaluatorsPtr); }
      } else if (operation.type === 'addTypeRequirement') {
        const pointer = copyInt32Array(module, operation.requiredTypeAlternatives);
        try {
          const added = await ccallNumber(module, 'routing_add_type_requirement', ['number', 'number', 'number', 'number', 'number'],
            [modelHandle, operation.kind, operation.dependentType, pointer, operation.requiredTypeAlternatives.length]);
          if (added !== 1) throw new Error('Invalid Routing type requirement kind or visit type.');
        } finally { module._free(pointer); }
      } else if (operation.type === 'setVisitType') {
        const added = await ccallNumber(module, 'routing_set_visit_type', ['number', 'bigint', 'number', 'number'],
          [modelHandle, toInt64(operation.index), operation.visitType, operation.policy]);
        if (added !== 1) throw new Error('Invalid Routing visit-type index, type or policy.');
      } else if (operation.type === 'addHardTypeIncompatibility') {
        const added = await ccallNumber(module, 'routing_add_hard_type_incompatibility', ['number', 'number', 'number'],
          [modelHandle, operation.type1, operation.type2]);
        if (added !== 1) throw new Error('Routing hard incompatibility references an unknown visit type.');
      } else if (operation.type === 'addTemporalTypeIncompatibility') {
        const added = await ccallNumber(module, 'routing_add_temporal_type_incompatibility', ['number', 'number', 'number'],
          [modelHandle, operation.type1, operation.type2]);
        if (added !== 1) throw new Error('Routing temporal incompatibility references an unknown visit type.');
      } else if (operation.type === 'setNextValues') {
        const values = copyInt64Array(module, Array.from(operation.values, value =>
          toIndex(value, 'Routing successor value', message.transitMatrixDimension - 1)));
        try {
          const added = await ccallNumber(module, 'routing_set_next_values',
            ['number', 'bigint', 'number', 'number'], [modelHandle, toInt64(operation.index), values.ptr, values.length]);
          if (added !== 1) throw new Error('Routing successor domain has an invalid index or value.');
        } finally {
          module._free(values.ptr);
        }
      } else if (operation.type === 'setVehicleValues') {
        const values = Array.from(operation.values, value => {
          const exact = toInt64(value, 'Routing vehicle domain value');
          if (exact < -1n || exact >= BigInt(message.numVehicles)) throw new RangeError('Invalid Routing vehicle domain value.');
          return Number(exact);
        });
        const pointer = copyInt32Array(module, values);
        try {
          const added = await ccallNumber(module, 'routing_set_vehicle_values',
            ['number', 'bigint', 'number', 'number'], [modelHandle, toInt64(operation.index), pointer, values.length]);
          if (added !== 1) throw new Error('Routing vehicle domain has an invalid index or value.');
        } finally {
          module._free(pointer);
        }
      } else if (operation.type === 'setAllowedVehiclesForIndex') {
        const vehicles = operation.vehicles.map(vehicle => toIndex(vehicle, 'Routing eligible vehicle', message.numVehicles - 1));
        const pointer = copyInt32Array(module, vehicles);
        try {
          const added = await ccallNumber(module, 'routing_set_allowed_vehicles_for_index',
            ['number', 'number', 'number', 'bigint'], [modelHandle, pointer, vehicles.length, toInt64(operation.index)]);
          if (added !== 1) throw new Error('Routing vehicle eligibility has invalid vehicles or index.');
        } finally {
          module._free(pointer);
        }
      } else if (operation.type === 'setActiveValues') {
        const values = Array.from(operation.values, value => toIndex(value, 'Routing active domain value', 1));
        const pointer = copyInt32Array(module, values);
        try {
          const added = await ccallNumber(module, 'routing_set_active_values',
            ['number', 'bigint', 'number', 'number'], [modelHandle, toInt64(operation.index), pointer, values.length]);
          if (added !== 1) throw new Error('Routing active domain has an invalid index or value.');
        } finally { module._free(pointer); }
      } else if (operation.type === 'setDimensionValue') {
        const added = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_dimension_set_value', ['number', 'number', 'number', 'number', 'bigint'],
          [modelHandle, namePtr, routingDimensionValueKinds[operation.setting], operation.vehicle ?? -1, toInt64(operation.value)]));
        if (added !== 1) throw new Error('Routing dimension setting has an unknown dimension, invalid kind, vehicle or value.');
      } else if (operation.type === 'modifyDomain') {
        const values = copyInt64Array(module, operation.values);
        try {
          const result = await withWasmCString(module, operation.variable.dimensionName, name => ccallNumber(module,
            'routing_modify_domain', ['number', 'number', 'number', 'bigint', 'number', 'bigint', 'bigint', 'number', 'number', 'number'],
            [modelHandle, operation.variable.kind, name, BigInt(operation.variable.index), operation.action,
              operation.lower, operation.upper, values.ptr, values.length, operation.variable.resourceGroup ?? 0]));
          if (result !== 1) throw new Error('Invalid Routing domain operation.');
        } finally { module._free(values.ptr); }
      } else if (operation.type === 'addLinearConstraint') {
        const left = await createLinearExpression(module, modelHandle, operation.left);
        const right = await createLinearExpression(module, modelHandle, operation.right);
        if (operation.conditions?.length || operation.booleanConditions?.length) {
          const conditions: number[] = [];
          for (const condition of operation.conditions ?? []) conditions.push(
            await createLinearExpression(module, modelHandle, condition.left),
            await createLinearExpression(module, modelHandle, condition.right), condition.comparison);
          const booleanConditions: number[] = [];
          for (const condition of operation.booleanConditions ?? []) booleanConditions.push(await createBooleanExpression(module, modelHandle, condition));
          const booleanPointer = copyInt32Array(module, booleanConditions);
          let pointer = 0;
          try {
            pointer = copyInt32Array(module, conditions);
            if (await ccallNumber(module, 'routing_add_conditional_linear_constraint',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [modelHandle, left, right, operation.comparison, pointer, operation.conditions?.length ?? 0, booleanPointer, booleanConditions.length]) !== 1)
              throw new Error('Invalid Routing conditional comparison.');
          } finally { if (pointer) module._free(pointer); module._free(booleanPointer); }
        } else if (await ccallNumber(module, 'routing_add_linear_constraint', ['number', 'number', 'number', 'number'],
          [modelHandle, left, right, operation.comparison]) !== 1) throw new Error('Invalid Routing comparison.');
      } else if (operation.type === 'addFinalizer') {
        const added = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_add_finalizer', ['number', 'number', 'number', 'bigint', 'number', 'bigint', 'number', 'bigint', 'number'],
          [modelHandle, operation.variableKind, namePtr, toInt64(operation.index), operation.kind,
            toInt64(operation.target), operation.weight === undefined ? 0 : 1, toInt64(operation.weight ?? 0n), operation.resourceGroup ?? 0]));
        if (added !== 1) throw new Error('Routing finalizer has an invalid variable, dimension or kind.');
      } else if (operation.type === 'setSlackBounds') {
        const added = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_dimension_set_slack_bounds', ['number', 'number', 'bigint', 'bigint', 'bigint'],
          [modelHandle, namePtr, toInt64(operation.index), toInt64(operation.lower), toInt64(operation.upper)]));
        if (added !== 1) throw new Error('Routing slack bounds have an unknown dimension, invalid index or reversed range.');
      } else if (operation.type === 'setCumulBounds') {
        const added = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_dimension_set_cumul_bounds', ['number', 'number', 'bigint', 'bigint', 'bigint'],
          [modelHandle, namePtr, toInt64(operation.index), operation.lower, operation.upper]));
        if (added !== 1) throw new Error('Routing cumul bounds have an unknown dimension, invalid index or reversed range.');
      } else if (operation.type === 'addNodePrecedence') {
        const added = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_dimension_add_node_precedence', ['number', 'number', 'bigint', 'bigint', 'bigint'],
          [modelHandle, namePtr, toInt64(operation.first), toInt64(operation.second), operation.offset]));
        if (added !== 1) throw new Error('Routing node precedence has an unknown dimension or invalid indices.');
      } else if (operation.type === 'addConstantDimension') {
        await withWasmCString(module, operation.name, async (namePtr) => {
          await ccallNumber(
            module,
            operation.slackMax === undefined ? 'routing_add_constant_dimension' : 'routing_add_constant_dimension_with_slack',
            operation.slackMax === undefined ? ['number', 'bigint', 'bigint', 'number', 'number']
              : ['number', 'bigint', 'bigint', 'bigint', 'number', 'number'],
            operation.slackMax === undefined ? [modelHandle, operation.value, operation.capacity, operation.fixStartCumulToZero ? 1 : 0, namePtr]
              : [modelHandle, operation.value, operation.capacity, operation.slackMax, operation.fixStartCumulToZero ? 1 : 0, namePtr],
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
              [modelHandle, values.ptr, values.length, operation.capacity, operation.fixStartCumulToZero ? 1 : 0, namePtr],
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
              [modelHandle, matrix.ptr, matrix.length, operation.matrix.length, operation.capacity, operation.fixStartCumulToZero ? 1 : 0, namePtr],
            );
          });
        } finally {
          module._free(matrix.ptr);
        }
      } else if (operation.type === 'addSoftSameVehicleConstraint') {
        const indices = copyInt64Array(module, operation.indices);
        try {
          const ok = await ccallNumber(module, 'routing_add_soft_same_vehicle_constraint', ['number', 'number', 'number', 'bigint'],
            [modelHandle, indices.ptr, indices.length, toInt64(operation.cost)]);
          if (ok !== 1) throw new Error('Routing failed to add a soft same-vehicle constraint.');
        } finally { module._free(indices.ptr); }
      } else if (operation.type === 'setPickupDeliveryPolicy') {
        const ok = await ccallNumber(module, 'routing_set_pickup_delivery_policy', ['number', 'number', 'number'],
          [modelHandle, toIndex(operation.vehicle, 'Routing pickup/delivery vehicle', message.numVehicles - 1), toIndex(operation.policy, 'Routing pickup/delivery policy', 2)]);
        if (ok !== 1) throw new Error('Routing failed to set a pickup/delivery policy.');
      } else if (operation.type === 'addDisjunction') {
        const indices = copyInt64Array(module, operation.indices);
        try {
          const id = await ccallNumber(
            module,
            'routing_add_disjunction_with_options',
            ['number', 'number', 'number', 'bigint', 'number', 'bigint', 'number'],
            [modelHandle, indices.ptr, indices.length, operation.penalty ?? 0n, operation.penalty === undefined ? 0 : 1,
              operation.maxCardinality ?? 1n, operation.penaltyCostBehavior ?? 0],
          );
          if (id < 0) throw new Error('Routing failed to add disjunction indices.');
        } finally {
          module._free(indices.ptr);
        }
      } else if (operation.type === 'addPickupAndDelivery') {
        const ok = await ccallNumber(
          module,
          'routing_add_pickup_and_delivery',
          ['number', 'bigint', 'bigint'],
          [modelHandle, toInt64(operation.pickup), toInt64(operation.delivery)],
        );
        if (ok !== 1) throw new Error('Routing failed to add pickup/delivery indices.');
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
      } else if (operation.type === 'setCumulSoftBound') {
        const ok = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          'routing_dimension_set_cumul_soft_bound', ['number', 'number', 'bigint', 'bigint', 'bigint', 'number'],
          [modelHandle, namePtr, toInt64(operation.index), toInt64(operation.bound), toInt64(operation.coefficient), Number(operation.lower)]));
        if (ok !== 1) throw new Error('Routing failed to set a soft cumul bound.');
      } else if (operation.type === 'setSoftSpanUpperBound' || operation.type === 'setQuadraticCostSoftSpanUpperBound') {
        const name = operation.type === 'setSoftSpanUpperBound'
          ? 'routing_dimension_set_soft_span_upper_bound' : 'routing_dimension_set_quadratic_cost_soft_span_upper_bound';
        const ok = await withWasmCString(module, operation.dimensionName, namePtr => ccallNumber(module,
          name, ['number', 'number', 'bigint', 'bigint', 'number'],
          [modelHandle, namePtr, toInt64(operation.bound), toInt64(operation.cost), operation.vehicle]));
        if (ok !== 1) throw new Error('Routing failed to set a soft span bound.');
      }
    }
    for (const [groupIndex, group] of (message.resourceGroups ?? []).entries()) {
      for (const [resourceIndex, resource] of group.resources.entries()) {
        const start = copyInt64Array(module, resource.startDomain);
        try {
          const end = copyInt64Array(module, resource.endDomain);
          try {
            const added = await withWasmCString(module, resource.dimensionName, name => ccallNumber(module, 'routing_add_resource',
              ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
              [modelHandle, groupIndex, name, start.ptr, start.length, end.ptr, end.length]));
            if (added !== resourceIndex) throw new Error('Invalid Routing resource attributes or dimension.');
          } finally { module._free(end.ptr); }
        } finally { module._free(start.ptr); }
      }
      for (const vehicle of group.requiredVehicles) if (await ccallNumber(module, 'routing_require_resource', ['number', 'number', 'number'],
        [modelHandle, groupIndex, vehicle]) !== 1) throw new Error('Invalid Routing resource vehicle.');
      for (const allowed of group.allowedResources) {
        const ptr = copyInt32Array(module, allowed.resources);
        try {
          if (await ccallNumber(module, 'routing_allow_resources', ['number', 'number', 'number', 'number', 'number'],
            [modelHandle, groupIndex, allowed.vehicle, ptr, allowed.resources.length]) !== 1) throw new Error('Invalid Routing resource eligibility.');
        } finally { module._free(ptr); }
      }
    }

    if (message.resourceInspectionGroup !== undefined) {
      const group = toIndex(message.resourceInspectionGroup, 'Routing resource group', (message.resourceGroups?.length ?? 0) - 1);
      module.ccall('routing_close_model', null, ['number'], [modelHandle]);
      const count = await ccallNumber(module, 'routing_resource_classes_count', ['number', 'number'], [modelHandle, group]);
      if (count < 0) throw new Error('Invalid native Routing resource inspection group.');
      const readArray = async (name: string, types: string[], args: unknown[], exact: boolean): Promise<Array<number | bigint>> => {
        const length = await ccallNumber(module, name, [...types, 'number', 'number'], [...args, 0, 0]);
        if (length < 0) throw new Error('Invalid native Routing resource inspection.');
        if (length === 0) return [];
        const width = exact ? 8 : 4, pointer = allocateWasm(module, width * length);
        try {
          if (await ccallNumber(module, name, [...types, 'number', 'number'], [...args, pointer, length]) !== length) throw new Error('Native Routing resource inspection size changed.');
          const view = new DataView(module.HEAPU8.buffer, pointer, width * length);
          return Array.from({ length }, (_, index) => exact ? view.getBigInt64(index * width, true) : view.getInt32(index * width, true));
        } finally { module._free(pointer); }
      };
      const attributes = async (index: number, forClass: boolean): Promise<RoutingResourceData[]> => {
        const result: RoutingResourceData[] = [];
        for (const dimensionName of message.dimensionNames) {
          const domains = await withWasmCString(module, dimensionName, async name => {
            const args = [modelHandle, group, index, name, forClass ? 1 : 0];
            const types = ['number', 'number', 'number', 'number', 'number', 'number'];
            return { startDomain: await readArray('routing_resource_attributes', types, [...args, 0], true) as bigint[],
              endDomain: await readArray('routing_resource_attributes', types, [...args, 1], true) as bigint[] };
          });
          result.push({ dimensionName, ...domains });
        }
        return result;
      };
      const resourceInspection: RoutingResourceInspectionData = { affectedDimensions: [], resources: [], classes: [] };
      for (const dimensionName of message.dimensionNames) {
        const affected = await withWasmCString(module, dimensionName, name => ccallNumber(module, 'routing_resource_dimension_affected',
          ['number', 'number', 'number'], [modelHandle, group, name]));
        if (affected < 0) throw new Error('Unknown native Routing resource inspection dimension.');
        if (affected) resourceInspection.affectedDimensions.push(dimensionName);
      }
      for (let resource = 0; resource < message.resourceGroups![group].resources.length; ++resource) {
        const classIndex = await ccallNumber(module, 'routing_resource_class_index', ['number', 'number', 'number'], [modelHandle, group, resource]);
        if (classIndex < 0) throw new Error('Native Routing model did not compute resource classes.');
        resourceInspection.resources.push({ classIndex, dimensionAttributes: await attributes(resource, false) });
      }
      for (let resourceClass = 0; resourceClass < count; ++resourceClass) resourceInspection.classes.push({
        resourceIndices: await readArray('routing_resources_in_class', ['number', 'number', 'number'], [modelHandle, group, resourceClass], false) as number[],
        dimensionAttributes: await attributes(resourceClass, true),
      });
      return { status: 0, solution: null, resourceInspection, localSearchProfile: '', automaticFirstSolutionStrategy: 0 };
    }
    if (message.domainQueries?.length) {
      const domainResults: RoutingDomainResult[] = [];
      for (const query of message.domainQueries) {
        const pointer = allocateWasm(module, 40);
        try {
          const result = await withWasmCString(module, query.variable.dimensionName, name => ccallNumber(module,
            'routing_inspect_variable', ['number', 'number', 'number', 'bigint', 'number', 'bigint', 'number', 'number', 'number'],
            [modelHandle, query.variable.kind, name, BigInt(query.variable.index), query.containsValue === undefined ? 0 : 1,
              query.containsValue ?? 0n, query.softLowerBound === undefined ? 0 : query.softLowerBound ? 1 : 2, pointer, query.variable.resourceGroup ?? 0]));
          if (result !== 1) throw new Error('Invalid Routing variable domain query.');
          const view = new DataView(module.HEAPU8.buffer, pointer, 40);
          const flags = view.getBigInt64(24, true);
          domainResults.push({ min: view.getBigInt64(0, true), max: view.getBigInt64(8, true), size: view.getBigUint64(16, true),
            bound: (flags & 1n) !== 0n, ...(query.softLowerBound === undefined ? {} : { softBound: view.getBigInt64(32, true) }), ...(query.containsValue === undefined ? {} : { contains: (flags & 2n) !== 0n }) });
        } finally { module._free(pointer); }
      }
      return { status: 0, solution: null, localSearchProfile: '', automaticFirstSolutionStrategy: 0, domainResults };
    }
    if (message.arcCostQueries?.length) {
      module.ccall('routing_close_model', null, ['number'], [modelHandle]);
      const arcCosts: bigint[] = [];
      for (const query of message.arcCostQueries) {
        arcCosts.push(module.ccall('routing_get_arc_cost_for_vehicle', 'bigint',
          ['number', 'bigint', 'bigint', 'number'], [modelHandle, query.fromIndex, query.toIndex, query.vehicle]) as bigint);
      }
      return { status: 0, solution: null, localSearchProfile: '', automaticFirstSolutionStrategy: 0, arcCosts };
    }
    const dimensionVariableKinds = [RoutingVariableKind.ROUTING_VARIABLE_SLACK,
      RoutingVariableKind.ROUTING_VARIABLE_TRANSIT, RoutingVariableKind.ROUTING_VARIABLE_FIXED_TRANSIT];
    const captureGroups = message.dimensionNames.flatMap(dimensionName => dimensionVariableKinds.map(kind => ({
      kind, dimensionName, count: message.transitMatrixDimension - message.numVehicles,
    })));
    for (const kind of [RoutingVariableKind.ROUTING_VARIABLE_ACTIVE_VEHICLE, RoutingVariableKind.ROUTING_VARIABLE_ROUTE_CONSIDERED]) {
      captureGroups.push({ kind, dimensionName: '', count: message.numVehicles });
    }
    captureGroups.push({ kind: RoutingVariableKind.ROUTING_VARIABLE_BOOLEAN, dimensionName: '',
      count: message.operations.filter(operation => operation.type === 'addBooleanVariable').length });
    captureGroups.push({ kind: RoutingVariableKind.ROUTING_VARIABLE_EXPRESSION, dimensionName: '',
      count: message.operations.filter(operation => operation.type === 'addIntegerExpression').length });
    for (const group of captureGroups) {
      const captured = await withWasmCString(module, group.dimensionName, name => ccallNumber(module,
        'routing_capture_assignment_variables', ['number', 'number', 'number'], [modelHandle, group.kind, name]));
      if (captured !== 1) throw new Error('Failed to capture native Routing assignment variables.');
    }
    let ok: number;
    const initialAssignment = message.initialAssignment;
    if (initialAssignment) {
      const routes = initialAssignment.routes;
      const values = copyInt64Array(module, routes.flat());
      let routeLengthsPtr = 0;
      try {
        routeLengthsPtr = copyInt32Array(module, routes.map((route) => route.length));
        const bytes = message.searchParametersProto ?? new Uint8Array();
        const parametersPtr = allocateWasmBytes(module, bytes, 1);
        let read: number;
        try {
          read = await withWasmCString(module, (message.searchParameterFields ?? []).join(','), fieldPaths => ccallNumber(
            module, 'routing_read_assignment_from_routes_proto',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [modelHandle, values.ptr, routeLengthsPtr, routes.length, initialAssignment.ignoreInactiveIndices ? 1 : 0,
              parametersPtr, bytes.length, fieldPaths, interruptible ? 1 : 0],
          ));
        } finally { module._free(parametersPtr); }
        if (read < 0) throw new Error(`Routing search parameters: ${module.ccall('routing_last_search_parameter_error', 'string', [], [])}`);
        ok = read === 1 && !message.readAssignmentOnly
          ? await solveWithSearchParameters(module, modelHandle, message, true, interruptible)
          : read;
      } finally {
        module._free(values.ptr);
        if (routeLengthsPtr) module._free(routeLengthsPtr);
      }
    } else {
      ok = await solveWithSearchParameters(module, modelHandle, message, false, interruptible);
    }
    const nativeStatus = await ccallNumber(module, 'routing_status', ['number'], [modelHandle]);
    const status = ok !== 1 && message.initialAssignment && nativeStatus === 0 ? 3 : nativeStatus;
    const localSearchProfile = module.ccall('routing_local_search_profile', 'string', ['number'], [modelHandle]) as string;
    const automaticFirstSolutionStrategy = await ccallNumber(module, 'routing_get_automatic_first_solution_strategy', ['number'], [modelHandle]);
    if (ok !== 1) return { status, solution: null, localSearchProfile, automaticFirstSolutionStrategy };

    const starts: number[] = [];
    const ends: number[] = [];
    const nextValues = Array.from({ length: message.transitMatrixDimension }, (_, index) => index);
    const vehicleValues: number[] = [];
    for (let index = 0; index < message.transitMatrixDimension; ++index) {
      vehicleValues.push(await ccallNumber(module, 'routing_assignment_vehicle_value',
        ['number', 'bigint'], [modelHandle, toInt64(index)]));
    }
    const dimensionCumulValues: Record<string, bigint[]> = Object.create(null);
    const dimensionCumulMaxs: Record<string, bigint[]> = Object.create(null);

    for (let vehicle = 0; vehicle < message.numVehicles; vehicle++) {
      let index = toIndex(await ccallBigInt(module, 'routing_start', ['number', 'number'], [modelHandle, vehicle]), 'route start index');
      starts.push(index);
      while (await ccallNumber(module, 'routing_is_end', ['number', 'bigint'], [modelHandle, toInt64(index)]) !== 1) {
        const next = toIndex(await ccallBigInt(module, 'routing_next_value', ['number', 'bigint'], [modelHandle, toInt64(index)]), 'next index');
        nextValues[index] = next;
        index = next;
      }
      ends.push(index);
    }

    for (const dimensionName of message.dimensionNames) {
      dimensionCumulValues[dimensionName] = [];
      dimensionCumulMaxs[dimensionName] = [];
      await withWasmCString(module, dimensionName, async (namePtr) => {
        for (let index = 0; index < message.transitMatrixDimension; index++) {
          dimensionCumulValues[dimensionName][index] = await ccallBigInt(
              module,
              'routing_assignment_dimension_cumul_value',
              ['number', 'number', 'bigint'],
              [modelHandle, namePtr, toInt64(index)],
            );
          dimensionCumulMaxs[dimensionName][index] = await ccallBigInt(module,
            'routing_assignment_dimension_cumul_max', ['number', 'number', 'bigint'], [modelHandle, namePtr, toInt64(index)]);
        }
      });
    }

    const assignmentVariables: RoutingAssignmentVariable[] = [];
    const boundsPointer = allocateWasm(module, 16);
    try {
      for (const group of captureGroups) await withWasmCString(module, group.dimensionName, async name => {
        for (let index = 0; index < group.count; ++index) {
          const found = await ccallNumber(module, 'routing_assignment_variable_bounds', ['number', 'number', 'number', 'bigint', 'number'],
            [modelHandle, group.kind, name, BigInt(index), boundsPointer]);
          if (found !== 1) throw new Error('Native Routing assignment has no captured variable bounds.');
          const view = new DataView(module.HEAPU8.buffer, boundsPointer, 16);
          assignmentVariables.push({ variable: { kind: group.kind, dimensionName: group.dimensionName, index }, min: view.getBigInt64(0, true), max: view.getBigInt64(8, true) });
        }
      });
    } finally { module._free(boundsPointer); }

    const resourceAssignments: Array<{ mins: bigint[]; maxs: bigint[] }> = [];
    const resourceBounds = allocateWasm(module, 16);
    try {
      for (let group = 0; group < (message.resourceGroups?.length ?? 0); ++group) {
        const values = { mins: [] as bigint[], maxs: [] as bigint[] };
        for (let vehicle = 0; vehicle < message.numVehicles; ++vehicle) {
          if (await ccallNumber(module, 'routing_assignment_resource_bounds', ['number', 'number', 'number', 'number'],
            [modelHandle, group, vehicle, resourceBounds]) !== 1) throw new Error('Native Routing assignment has no resource bounds.');
          const view = new DataView(module.HEAPU8.buffer, resourceBounds, 16);
          values.mins.push(view.getBigInt64(0, true)); values.maxs.push(view.getBigInt64(8, true));
        }
        resourceAssignments.push(values);
      }
    } finally { module._free(resourceBounds); }
    const solution = {
      status,
      objectiveValue: await ccallBigInt(module, 'routing_assignment_objective_value', ['number'], [modelHandle]),
      nextValues,
      vehicleValues,
      starts,
      ends,
      dimensionCumulValues,
      assignmentVariables,
      ...(resourceAssignments.length ? { resourceAssignments } : {}),
      dimensionCumulMins: dimensionCumulValues,
      dimensionCumulMaxs,
    };
    return { status, solution, localSearchProfile, automaticFirstSolutionStrategy };
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
