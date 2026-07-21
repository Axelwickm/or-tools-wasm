import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadMPSolverNativeModule } from './native_runtime.js';
import { create } from '@bufbuild/protobuf';
import type { ExecutorConfiguration, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import {
  MpSolverSchemaRequestSchema,
  MpSolverSolveRequestSchema,
} from '../generated/bridge/mp_solver_pb.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { MpSolverExecutor, type MpSolverExecutorLike } from './executor.js';
import { MpSolverServerExecutor } from './server_executor.js';
import { MpSolverWorkerExecutor } from './worker_executor.js';
import * as protobufModule from 'protobufjs';

let mpSolverModule: OrToolsWasmModule | null = null;
let mpSolverExports: MpSolverExports | null = null;

type CReturn = 'number' | 'bigint' | undefined;
type CArg = 'number' | 'bigint';

function shouldUseSerializedMPSolverBackend(): boolean {
  return resolvedExecutorConfiguration.type !== 'direct';
}

const directExecutor = new MpSolverExecutor();
const workerExecutor = new MpSolverWorkerExecutor();
let resolvedExecutorConfiguration = resolveExecutorConfiguration();
let executor: MpSolverExecutorLike = createResolvedExecutor(resolvedExecutorConfiguration);

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): MpSolverExecutorLike {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new MpSolverServerExecutor(configuration);
  }
}

export function setMPSolverExecutor(configuration: ExecutorConfiguration): void {
  resolvedExecutorConfiguration = resolveExecutorConfiguration(configuration);
  executor = createResolvedExecutor(resolvedExecutorConfiguration);
}

export type MPSolverEvent = SolverJobEvent;
export type MPSolverExecutionOptions = {
  onEvent?: (event: MPSolverEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

type MpSolverExports = {
  solverInfinity(): number;
  solverSupportsProblemType(problemType: number): number;
  solverCreate(namePtr: number, problemType: number): number;
  solverCreateSolver(solverIdPtr: number): number;
  solverParseSolverType(solverIdPtr: number): number;
  solverName(solverHandle: number): number;
  solverProblemType(solverHandle: number): number;
  solverIsMip(solverHandle: number): number;
  solverClear(solverHandle: number): void;
  solverDelete(solverHandle: number): void;
  solverVariable(solverHandle: number, index: number): number;
  solverLookupVariable(solverHandle: number, namePtr: number): number;
  solverVar(solverHandle: number, lb: number, ub: number, integer: number, namePtr: number): number;
  solverNumVar(solverHandle: number, lb: number, ub: number, namePtr: number): number;
  solverIntVar(solverHandle: number, lb: number, ub: number, namePtr: number): number;
  solverBoolVar(solverHandle: number, namePtr: number): number;
  solverConstraint(solverHandle: number, index: number): number;
  solverLookupConstraint(solverHandle: number, namePtr: number): number;
  solverRowConstraint(solverHandle: number, lb: number, ub: number, namePtr: number): number;
  solverUnboundedRowConstraint(solverHandle: number, namePtr: number): number;
  constraintClear(constraintHandle: number): void;
  constraintSetCoefficient(constraintHandle: number, variableHandle: number, coefficient: number): void;
  constraintGetCoefficient(constraintHandle: number, variableHandle: number): number;
  constraintName(constraintHandle: number): number;
  constraintIndex(constraintHandle: number): number;
  constraintLb(constraintHandle: number): number;
  constraintUb(constraintHandle: number): number;
  constraintSetLb(constraintHandle: number, lb: number): void;
  constraintSetUb(constraintHandle: number, ub: number): void;
  constraintSetBounds(constraintHandle: number, lb: number, ub: number): void;
  constraintDualValue(constraintHandle: number): number;
  constraintBasisStatus(constraintHandle: number): number;
  constraintIsLazy(constraintHandle: number): number;
  constraintSetIsLazy(constraintHandle: number, laziness: number): void;
  objectiveClear(solverHandle: number): void;
  objectiveSetCoefficient(solverHandle: number, variableHandle: number, coefficient: number): void;
  objectiveGetCoefficient(solverHandle: number, variableHandle: number): number;
  objectiveSetOffset(solverHandle: number, offset: number): void;
  objectiveOffset(solverHandle: number): number;
  objectiveAddOffset(solverHandle: number, offset: number): void;
  objectiveSetOptimizationDirection(solverHandle: number, maximize: number): void;
  objectiveSetMinimization(solverHandle: number): void;
  objectiveSetMaximization(solverHandle: number): void;
  objectiveValue(solverHandle: number): number;
  objectiveBestBound(solverHandle: number): number;
  objectiveMaximization(solverHandle: number): number;
  objectiveMinimization(solverHandle: number): number;
  solverExportModelProto(solverHandle: number, lenPtr: number): number;
  solverExportModelRequestProto(
    solverHandle: number,
    solverType: number,
    timeLimitSeconds: number,
    enableOutput: number,
    solverSpecificParametersPtr: number,
    lenPtr: number,
  ): number;
  solverLoadSolutionProto(solverHandle: number, responsePtr: number, responseLength: number, tolerance: number): number;
  solverVerifySolution(solverHandle: number, tolerance: number, logErrors: number): number;
  solverReset(solverHandle: number): void;
  solverInterruptSolve(solverHandle: number): number;
  solverNextSolution(solverHandle: number): number;
  solverEnableOutput(solverHandle: number): void;
  solverSuppressOutput(solverHandle: number): void;
  solverOutputIsEnabled(solverHandle: number): number;
  solverSetTimeLimit(solverHandle: number, milliseconds: number | bigint): void;
  solverTimeLimit(solverHandle: number): number | bigint;
  solverSetNumThreads(solverHandle: number, numThreads: number): number;
  solverGetNumThreads(solverHandle: number): number;
  solverSetSolverSpecificParametersAsString(solverHandle: number, parametersPtr: number): number;
  solverGetSolverSpecificParametersAsString(solverHandle: number): number;
  solverSolverVersion(solverHandle: number): number;
  solverExportModelAsLpFormat(solverHandle: number, obfuscate: number): number;
  solverExportModelAsMpsFormat(solverHandle: number, fixedFormat: number, obfuscate: number): number;
  solverConstraintActivity(solverHandle: number, constraintIndex: number): number;
  solverComputeExactConditionNumber(solverHandle: number): number;
  solverSetHint(solverHandle: number, variableHandlesPtr: number, valuesPtr: number, count: number): void;
  lastStringResult(): number;
  solverNumVariables(solverHandle: number): number;
  solverNumConstraints(solverHandle: number): number;
  solverWallTime(solverHandle: number): number | bigint;
  solverIterations(solverHandle: number): number | bigint;
  solverNodes(solverHandle: number): number | bigint;
  variableName(variableHandle: number): number;
  variableIndex(variableHandle: number): number;
  variableSolutionValue(variableHandle: number): number;
  variableUnroundedSolutionValue(variableHandle: number): number;
  variableReducedCost(variableHandle: number): number;
  variableBasisStatus(variableHandle: number): number;
  variableLb(variableHandle: number): number;
  variableUb(variableHandle: number): number;
  variableInteger(variableHandle: number): number;
  variableSetInteger(variableHandle: number, integer: number): void;
  variableSetLb(variableHandle: number, lb: number): void;
  variableSetUb(variableHandle: number, ub: number): void;
  variableSetBounds(variableHandle: number, lb: number, ub: number): void;
  variableBranchingPriority(variableHandle: number): number;
  variableSetBranchingPriority(variableHandle: number, priority: number): void;
  parametersCreate(): number;
  parametersDelete(parametersHandle: number): void;
  parametersSetDoubleParam(parametersHandle: number, param: number, value: number): void;
  parametersGetDoubleParam(parametersHandle: number, param: number): number;
  parametersResetDoubleParam(parametersHandle: number, param: number): void;
  parametersSetIntegerParam(parametersHandle: number, param: number, value: number): void;
  parametersGetIntegerParam(parametersHandle: number, param: number): number;
  parametersResetIntegerParam(parametersHandle: number, param: number): void;
  parametersReset(parametersHandle: number): void;
};

function toNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : value as number;
}

function stringBytes(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`);
}

function wrap<T extends (...args: never[]) => unknown>(
  module: OrToolsWasmModule,
  name: string,
  returnType: CReturn,
  argTypes: CArg[],
): T {
  return module.cwrap(name, returnType, argTypes) as unknown as T;
}

function createMpSolverExports(module: OrToolsWasmModule): MpSolverExports {
  return {
    solverInfinity: wrap(module, 'mp_solver_infinity', 'number', []),
    solverSupportsProblemType: wrap(module, 'mp_solver_supports_problem_type', 'number', ['number']),
    solverCreate: wrap(module, 'mp_solver_create', 'number', ['number', 'number']),
    solverCreateSolver: wrap(module, 'mp_solver_create_solver', 'number', ['number']),
    solverParseSolverType: wrap(module, 'mp_solver_parse_solver_type', 'number', ['number']),
    solverName: wrap(module, 'mp_solver_name', 'number', ['number']),
    solverProblemType: wrap(module, 'mp_solver_problem_type', 'number', ['number']),
    solverIsMip: wrap(module, 'mp_solver_is_mip', 'number', ['number']),
    solverClear: wrap(module, 'mp_solver_clear', undefined, ['number']),
    solverDelete: wrap(module, 'mp_solver_delete', undefined, ['number']),
    solverVariable: wrap(module, 'mp_solver_variable', 'number', ['number', 'number']),
    solverLookupVariable: wrap(module, 'mp_solver_lookup_variable', 'number', ['number', 'number']),
    solverVar: wrap(module, 'mp_solver_var', 'number', ['number', 'number', 'number', 'number', 'number']),
    solverNumVar: wrap(module, 'mp_solver_num_var', 'number', ['number', 'number', 'number', 'number']),
    solverIntVar: wrap(module, 'mp_solver_int_var', 'number', ['number', 'number', 'number', 'number']),
    solverBoolVar: wrap(module, 'mp_solver_bool_var', 'number', ['number', 'number']),
    solverConstraint: wrap(module, 'mp_solver_constraint', 'number', ['number', 'number']),
    solverLookupConstraint: wrap(module, 'mp_solver_lookup_constraint', 'number', ['number', 'number']),
    solverRowConstraint: wrap(module, 'mp_solver_row_constraint', 'number', ['number', 'number', 'number', 'number']),
    solverUnboundedRowConstraint: wrap(module, 'mp_solver_unbounded_row_constraint', 'number', ['number', 'number']),
    constraintClear: wrap(module, 'mp_constraint_clear', undefined, ['number']),
    constraintSetCoefficient: wrap(module, 'mp_constraint_set_coefficient', undefined, ['number', 'number', 'number']),
    constraintGetCoefficient: wrap(module, 'mp_constraint_get_coefficient', 'number', ['number', 'number']),
    constraintName: wrap(module, 'mp_constraint_name', 'number', ['number']),
    constraintIndex: wrap(module, 'mp_constraint_index', 'number', ['number']),
    constraintLb: wrap(module, 'mp_constraint_lb', 'number', ['number']),
    constraintUb: wrap(module, 'mp_constraint_ub', 'number', ['number']),
    constraintSetLb: wrap(module, 'mp_constraint_set_lb', undefined, ['number', 'number']),
    constraintSetUb: wrap(module, 'mp_constraint_set_ub', undefined, ['number', 'number']),
    constraintSetBounds: wrap(module, 'mp_constraint_set_bounds', undefined, ['number', 'number', 'number']),
    constraintDualValue: wrap(module, 'mp_constraint_dual_value', 'number', ['number']),
    constraintBasisStatus: wrap(module, 'mp_constraint_basis_status', 'number', ['number']),
    constraintIsLazy: wrap(module, 'mp_constraint_is_lazy', 'number', ['number']),
    constraintSetIsLazy: wrap(module, 'mp_constraint_set_is_lazy', undefined, ['number', 'number']),
    objectiveClear: wrap(module, 'mp_objective_clear', undefined, ['number']),
    objectiveSetCoefficient: wrap(module, 'mp_objective_set_coefficient', undefined, ['number', 'number', 'number']),
    objectiveGetCoefficient: wrap(module, 'mp_objective_get_coefficient', 'number', ['number', 'number']),
    objectiveSetOffset: wrap(module, 'mp_objective_set_offset', undefined, ['number', 'number']),
    objectiveOffset: wrap(module, 'mp_objective_offset', 'number', ['number']),
    objectiveAddOffset: wrap(module, 'mp_objective_add_offset', undefined, ['number', 'number']),
    objectiveSetOptimizationDirection: wrap(module, 'mp_objective_set_optimization_direction', undefined, ['number', 'number']),
    objectiveSetMinimization: wrap(module, 'mp_objective_set_minimization', undefined, ['number']),
    objectiveSetMaximization: wrap(module, 'mp_objective_set_maximization', undefined, ['number']),
    objectiveValue: wrap(module, 'mp_objective_value', 'number', ['number']),
    objectiveBestBound: wrap(module, 'mp_objective_best_bound', 'number', ['number']),
    objectiveMaximization: wrap(module, 'mp_objective_maximization', 'number', ['number']),
    objectiveMinimization: wrap(module, 'mp_objective_minimization', 'number', ['number']),
    solverExportModelProto: wrap(module, 'mp_solver_export_model_proto', 'number', ['number', 'number']),
    solverExportModelRequestProto: wrap(module, 'mp_solver_export_model_request_proto', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
    solverLoadSolutionProto: wrap(module, 'mp_solver_load_solution_proto', 'number', ['number', 'number', 'number', 'number']),
    solverVerifySolution: wrap(module, 'mp_solver_verify_solution', 'number', ['number', 'number', 'number']),
    solverReset: wrap(module, 'mp_solver_reset', undefined, ['number']),
    solverInterruptSolve: wrap(module, 'mp_solver_interrupt_solve', 'number', ['number']),
    solverNextSolution: wrap(module, 'mp_solver_next_solution', 'number', ['number']),
    solverEnableOutput: wrap(module, 'mp_solver_enable_output', undefined, ['number']),
    solverSuppressOutput: wrap(module, 'mp_solver_suppress_output', undefined, ['number']),
    solverOutputIsEnabled: wrap(module, 'mp_solver_output_is_enabled', 'number', ['number']),
    solverSetTimeLimit: wrap(module, 'mp_solver_set_time_limit', undefined, ['number', 'bigint']),
    solverTimeLimit: wrap(module, 'mp_solver_time_limit', 'bigint', ['number']),
    solverSetNumThreads: wrap(module, 'mp_solver_set_num_threads', 'number', ['number', 'number']),
    solverGetNumThreads: wrap(module, 'mp_solver_get_num_threads', 'number', ['number']),
    solverSetSolverSpecificParametersAsString: wrap(module, 'mp_solver_set_solver_specific_parameters_as_string', 'number', ['number', 'number']),
    solverGetSolverSpecificParametersAsString: wrap(module, 'mp_solver_get_solver_specific_parameters_as_string', 'number', ['number']),
    solverSolverVersion: wrap(module, 'mp_solver_solver_version', 'number', ['number']),
    solverExportModelAsLpFormat: wrap(module, 'mp_solver_export_model_as_lp_format', 'number', ['number', 'number']),
    solverExportModelAsMpsFormat: wrap(module, 'mp_solver_export_model_as_mps_format', 'number', ['number', 'number', 'number']),
    solverConstraintActivity: wrap(module, 'mp_solver_constraint_activity', 'number', ['number', 'number']),
    solverComputeExactConditionNumber: wrap(module, 'mp_solver_compute_exact_condition_number', 'number', ['number']),
    solverSetHint: wrap(module, 'mp_solver_set_hint', undefined, ['number', 'number', 'number', 'number']),
    lastStringResult: wrap(module, 'mp_last_string_result', 'number', []),
    solverNumVariables: wrap(module, 'mp_solver_num_variables', 'number', ['number']),
    solverNumConstraints: wrap(module, 'mp_solver_num_constraints', 'number', ['number']),
    solverWallTime: wrap(module, 'mp_solver_wall_time', 'bigint', ['number']),
    solverIterations: wrap(module, 'mp_solver_iterations', 'bigint', ['number']),
    solverNodes: wrap(module, 'mp_solver_nodes', 'bigint', ['number']),
    variableName: wrap(module, 'mp_variable_name', 'number', ['number']),
    variableIndex: wrap(module, 'mp_variable_index', 'number', ['number']),
    variableSolutionValue: wrap(module, 'mp_variable_solution_value', 'number', ['number']),
    variableUnroundedSolutionValue: wrap(module, 'mp_variable_unrounded_solution_value', 'number', ['number']),
    variableReducedCost: wrap(module, 'mp_variable_reduced_cost', 'number', ['number']),
    variableBasisStatus: wrap(module, 'mp_variable_basis_status', 'number', ['number']),
    variableLb: wrap(module, 'mp_variable_lb', 'number', ['number']),
    variableUb: wrap(module, 'mp_variable_ub', 'number', ['number']),
    variableInteger: wrap(module, 'mp_variable_integer', 'number', ['number']),
    variableSetInteger: wrap(module, 'mp_variable_set_integer', undefined, ['number', 'number']),
    variableSetLb: wrap(module, 'mp_variable_set_lb', undefined, ['number', 'number']),
    variableSetUb: wrap(module, 'mp_variable_set_ub', undefined, ['number', 'number']),
    variableSetBounds: wrap(module, 'mp_variable_set_bounds', undefined, ['number', 'number', 'number']),
    variableBranchingPriority: wrap(module, 'mp_variable_branching_priority', 'number', ['number']),
    variableSetBranchingPriority: wrap(module, 'mp_variable_set_branching_priority', undefined, ['number', 'number']),
    parametersCreate: wrap(module, 'mp_solver_parameters_create', 'number', []),
    parametersDelete: wrap(module, 'mp_solver_parameters_delete', undefined, ['number']),
    parametersSetDoubleParam: wrap(module, 'mp_solver_parameters_set_double_param', undefined, ['number', 'number', 'number']),
    parametersGetDoubleParam: wrap(module, 'mp_solver_parameters_get_double_param', 'number', ['number', 'number']),
    parametersResetDoubleParam: wrap(module, 'mp_solver_parameters_reset_double_param', undefined, ['number', 'number']),
    parametersSetIntegerParam: wrap(module, 'mp_solver_parameters_set_integer_param', undefined, ['number', 'number', 'number']),
    parametersGetIntegerParam: wrap(module, 'mp_solver_parameters_get_integer_param', 'number', ['number', 'number']),
    parametersResetIntegerParam: wrap(module, 'mp_solver_parameters_reset_integer_param', undefined, ['number', 'number']),
    parametersReset: wrap(module, 'mp_solver_parameters_reset', undefined, ['number']),
  };
}

async function loadMpSolverModule(): Promise<OrToolsWasmModule> {
  mpSolverModule = await loadMPSolverNativeModule();
  mpSolverExports ??= createMpSolverExports(mpSolverModule);
  return mpSolverModule;
}

function getMpSolverModule(): OrToolsWasmModule {
  if (!mpSolverModule) {
    throw new Error('MPSolver API is not initialized. Call await initMPSolver() before constructing MPSolver objects.');
  }
  return mpSolverModule;
}

function getMpSolverExports(): MpSolverExports {
  if (!mpSolverExports) {
    throw new Error('MPSolver API is not initialized. Call await initMPSolver() before constructing MPSolver objects.');
  }
  return mpSolverExports;
}

function withCString<T>(module: OrToolsWasmModule, value: string, fn: (ptr: number) => T): T {
  const bytes = stringBytes(value);
  const ptr = module._malloc(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  try {
    return fn(ptr);
  } finally {
    module._free(ptr);
  }
}

function readUint32LE(buffer: ArrayBufferLike, ptr: number) {
  return new DataView(buffer, ptr, 4).getUint32(0, true);
}

function copyBytesToHeap(module: OrToolsWasmModule, bytes: Uint8Array | null) {
  if (!bytes?.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

async function readNativeBytes(
  module: OrToolsWasmModule,
  fn: (lenPtr: number) => number | Promise<number>,
) {
  const lenPtr = module._malloc(4);
  let responsePtr = 0;
  try {
    responsePtr = await fn(lenPtr);
    const len = readUint32LE(module.HEAPU8.buffer, lenPtr);
    return responsePtr && len ? module.HEAPU8.slice(responsePtr, responsePtr + len) : new Uint8Array();
  } finally {
    if (responsePtr) {
      module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
    }
    module._free(lenPtr);
  }
}

export type LinearSolverSchemas = {
  linear_solver: string;
  optional_boolean: string;
};

export type MPSolverModelRequest = Record<string, unknown>;
export type MPSolverSolutionResponse = Record<string, unknown>;

export type MPSolverProtoSolveResult = {
  bytes: Uint8Array;
  response: MPSolverSolutionResponse;
};

export type MPSolverProtoSolveOptions = {
  solverType?: OptimizationProblemType;
  timeLimitSeconds?: number;
  enableOutput?: boolean;
  solverSpecificParameters?: string;
  loadSolution?: boolean;
  tolerance?: number;
  numThreads?: number;
  num_threads?: number;
} & MPSolverExecutionOptions;

type ProtobufRoot = import('protobufjs').Root;
type ProtobufType = import('protobufjs').Type;

let linearSolverSchemasPromise: Promise<LinearSolverSchemas> | null = null;
let linearSolverRootPromise: Promise<ProtobufRoot> | null = null;
let mpModelTypePromise: Promise<ProtobufType> | null = null;
let mpModelRequestTypePromise: Promise<ProtobufType> | null = null;
let mpSolutionResponseTypePromise: Promise<ProtobufType> | null = null;

async function getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
  linearSolverSchemasPromise ??= (async () => {
    const job = executor.execute(
      { case: 'schema', value: create(MpSolverSchemaRequestSchema) },
      { onEvent: () => {} },
    );
    const response = await job.result;
    if (response.payload.case !== 'schema') throw new Error('MP Solver executor returned the wrong schema response.');
    return {
      linear_solver: response.payload.value.linearSolverProtoSchema,
      optional_boolean: response.payload.value.optionalBooleanProtoSchema,
    };
  })();
  return linearSolverSchemasPromise;
}

async function resolveLinearSolverRoot(): Promise<ProtobufRoot> {
  linearSolverRootPromise ??= (async () => {
    const schemas = await getLinearSolverSchemas();
    const optionalRoot = protobufModule.parse(schemas.optional_boolean).root;
    const linearSolverSource = schemas.linear_solver.replace(/^import "ortools\/util\/optional_boolean\.proto";\s*$/m, '');
    return protobufModule.parse(linearSolverSource, optionalRoot).root;
  })();
  return linearSolverRootPromise;
}

async function resolveMPModelRequestType(): Promise<ProtobufType> {
  mpModelRequestTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPModelRequest');
  })();
  return mpModelRequestTypePromise;
}

async function resolveMPModelType(): Promise<ProtobufType> {
  mpModelTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPModelProto');
  })();
  return mpModelTypePromise;
}

async function resolveMPSolutionResponseType(): Promise<ProtobufType> {
  mpSolutionResponseTypePromise ??= (async () => {
    const root = await resolveLinearSolverRoot();
    return root.lookupType('operations_research.MPSolutionResponse');
  })();
  return mpSolutionResponseTypePromise;
}

async function encodeMPModelRequest(request: MPSolverModelRequest): Promise<Uint8Array> {
  const type = await resolveMPModelRequestType();
  const error = type.verify(request);
  if (error) {
    throw new Error(`MPSolver.createModelRequest: ${error}`);
  }
  return type.encode(type.create(request)).finish();
}

async function encodeMPModel(model: MPSolverModelRequest): Promise<Uint8Array> {
  const type = await resolveMPModelType();
  const error = type.verify(model);
  if (error) {
    throw new Error(`MPSolver.exportModelProto: ${error}`);
  }
  return type.encode(type.create(model)).finish();
}

async function decodeMPSolutionResponse(bytes: Uint8Array): Promise<MPSolverSolutionResponse> {
  const type = await resolveMPSolutionResponseType();
  return type.toObject(type.decode(bytes), {
    enums: String,
    longs: Number,
    defaults: true,
    arrays: true,
    objects: true,
  }) as MPSolverSolutionResponse;
}

async function encodeMPSolutionResponse(response: MPSolverSolutionResponse): Promise<Uint8Array> {
  const type = await resolveMPSolutionResponseType();
  const error = type.verify(response);
  if (error) {
    throw new Error(`MPSolver.createSolutionResponse: ${error}`);
  }
  return type.encode(type.create(response)).finish();
}

function normalizedNumThreads(options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads'> = {}): number | undefined {
  const numThreads = options.numThreads ?? options.num_threads;
  return typeof numThreads === 'number' && Number.isInteger(numThreads) && numThreads > 1 ? numThreads : undefined;
}

async function solveModelRequestBytes(
  requestBytes: Uint8Array,
  options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads' | 'onEvent' | 'signal'> = {},
): Promise<Uint8Array> {
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('MP Solver solve aborted.', 'AbortError');
  const numThreads = normalizedNumThreads(options) ?? 1;
  const job = executor.execute(
    { case: 'solve', value: create(MpSolverSolveRequestSchema, { requestProto: requestBytes, numThreads }) },
    { requestedThreads: numThreads, onEvent: options.onEvent ?? (() => {}) },
  );
  const abort = () => { void job.cancel().catch(() => {}); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await job.result;
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('MP Solver solve aborted.', 'AbortError');
    if (response.payload.case !== 'responseProto') throw new Error('MP Solver executor returned the wrong solve response.');
    return response.payload.value;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

function readCString(module: OrToolsWasmModule, ptr: number): string {
  return ptr === 0 ? '' : module.UTF8ToString(ptr);
}

export async function initMPSolver(): Promise<void> {
  await executor.load();
  if (!shouldUseSerializedMPSolverBackend()) await loadMpSolverModule();
}

export enum OptimizationProblemType {
  CLP_LINEAR_PROGRAMMING = 0,
  GLPK_LINEAR_PROGRAMMING = 1,
  GLOP_LINEAR_PROGRAMMING = 2,
  PDLP_LINEAR_PROGRAMMING = 8,
  HIGHS_LINEAR_PROGRAMMING = 15,
  SCIP_MIXED_INTEGER_PROGRAMMING = 3,
  GLPK_MIXED_INTEGER_PROGRAMMING = 4,
  CBC_MIXED_INTEGER_PROGRAMMING = 5,
  HIGHS_MIXED_INTEGER_PROGRAMMING = 16,
  GUROBI_LINEAR_PROGRAMMING = 6,
  GUROBI_MIXED_INTEGER_PROGRAMMING = 7,
  CPLEX_LINEAR_PROGRAMMING = 10,
  CPLEX_MIXED_INTEGER_PROGRAMMING = 11,
  XPRESS_LINEAR_PROGRAMMING = 101,
  XPRESS_MIXED_INTEGER_PROGRAMMING = 102,
  COPT_LINEAR_PROGRAMMING = 103,
  COPT_MIXED_INTEGER_PROGRAMMING = 104,
  BOP_INTEGER_PROGRAMMING = 12,
  SAT_INTEGER_PROGRAMMING = 14,
  KNAPSACK_MIXED_INTEGER_PROGRAMMING = 13,
}

export enum MPSolverResultStatus {
  OPTIMAL = 0,
  FEASIBLE = 1,
  INFEASIBLE = 2,
  UNBOUNDED = 3,
  ABNORMAL = 4,
  MODEL_INVALID = 5,
  NOT_SOLVED = 6,
}

export enum BasisStatus {
  FREE = 0,
  AT_LOWER_BOUND = 1,
  AT_UPPER_BOUND = 2,
  FIXED_VALUE = 3,
  BASIC = 4,
}

export enum DoubleParam {
  RELATIVE_MIP_GAP = 0,
  PRIMAL_TOLERANCE = 1,
  DUAL_TOLERANCE = 2,
}

export enum IntegerParam {
  PRESOLVE = 1000,
  LP_ALGORITHM = 1001,
  INCREMENTALITY = 1002,
  SCALING = 1003,
}

export enum PresolveValues {
  PRESOLVE_OFF = 0,
  PRESOLVE_ON = 1,
}

export enum LpAlgorithmValues {
  DUAL = 10,
  PRIMAL = 11,
  BARRIER = 12,
}

export enum IncrementalityValues {
  INCREMENTALITY_OFF = 0,
  INCREMENTALITY_ON = 1,
}

export enum ScalingValues {
  SCALING_OFF = 0,
  SCALING_ON = 1,
}

type MpWorkerVariableState = {
  index: number;
  name: string;
  lb: number;
  ub: number;
  integer: boolean;
  branchingPriority: number;
  solutionValue: number;
  unroundedSolutionValue: number;
  reducedCost: number;
  basisStatus: BasisStatus;
};

type MpWorkerConstraintState = {
  index: number;
  name: string;
  lb: number;
  ub: number;
  coeffs: Map<number, number>;
  dualValue: number;
  basisStatus: BasisStatus;
  lazy: boolean;
};

type MpWorkerObjectiveState = {
  coeffs: Map<number, number>;
  offset: number;
  maximize: boolean;
  value: number;
  bestBound: number;
};

type MpWorkerSolverState = {
  name: string;
  problemType: OptimizationProblemType;
  variables: MpWorkerVariableState[];
  constraints: MpWorkerConstraintState[];
  objective: MpWorkerObjectiveState;
  outputEnabled: boolean;
  timeLimitMs: number;
  numThreads: number;
  solverSpecificParameters: string;
  hints: { varIndex: number[]; varValue: number[] } | null;
  deleted: boolean;
  wallTimeMs: number;
  iterations: number;
  nodes: number;
  solutionLoaded: boolean;
};

const workerSupportedProblemTypes = new Set<OptimizationProblemType>([
  OptimizationProblemType.CLP_LINEAR_PROGRAMMING,
  OptimizationProblemType.GLPK_LINEAR_PROGRAMMING,
  OptimizationProblemType.GLOP_LINEAR_PROGRAMMING,
  OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING,
  OptimizationProblemType.BOP_INTEGER_PROGRAMMING,
  OptimizationProblemType.SAT_INTEGER_PROGRAMMING,
  OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING,
]);

const workerSolverTypeAliases = new Map<string, OptimizationProblemType>([
  ['CLP', OptimizationProblemType.CLP_LINEAR_PROGRAMMING],
  ['CLP_LINEAR_PROGRAMMING', OptimizationProblemType.CLP_LINEAR_PROGRAMMING],
  ['GLPK_LP', OptimizationProblemType.GLPK_LINEAR_PROGRAMMING],
  ['GLPK_LINEAR_PROGRAMMING', OptimizationProblemType.GLPK_LINEAR_PROGRAMMING],
  ['GLOP', OptimizationProblemType.GLOP_LINEAR_PROGRAMMING],
  ['GLOP_LINEAR_PROGRAMMING', OptimizationProblemType.GLOP_LINEAR_PROGRAMMING],
  ['SCIP', OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING],
  ['SCIP_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING],
  ['CBC', OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING],
  ['CBC_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING],
  ['GLPK', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['GLPK_MIP', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['GLPK_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING],
  ['BOP', OptimizationProblemType.BOP_INTEGER_PROGRAMMING],
  ['BOP_INTEGER_PROGRAMMING', OptimizationProblemType.BOP_INTEGER_PROGRAMMING],
  ['SAT', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['CP_SAT', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['SAT_INTEGER_PROGRAMMING', OptimizationProblemType.SAT_INTEGER_PROGRAMMING],
  ['KNAPSACK', OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING],
  ['KNAPSACK_MIXED_INTEGER_PROGRAMMING', OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING],
]);

function normalizeWorkerSolverId(solverId: string): string {
  return solverId.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function workerParseSolverType(solverId: string): OptimizationProblemType | null {
  return workerSolverTypeAliases.get(normalizeWorkerSolverId(solverId)) ?? null;
}

function workerSupportsProblemType(problemType: OptimizationProblemType): boolean {
  return workerSupportedProblemTypes.has(problemType);
}

function workerProblemIsMip(problemType: OptimizationProblemType): boolean {
  return problemType === OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.HIGHS_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.GUROBI_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CPLEX_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.XPRESS_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.COPT_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.BOP_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING;
}

function workerProblemSupportsNumThreads(problemType: OptimizationProblemType): boolean {
  return problemType === OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING
    || problemType === OptimizationProblemType.SAT_INTEGER_PROGRAMMING;
}

function createWorkerSolverState(name: string, problemType: OptimizationProblemType): MpWorkerSolverState {
  if (!workerSupportsProblemType(problemType)) {
    throw new Error(`MPSolver: problem type ${problemType} is not supported by the serialized backend.`);
  }
  return {
    name,
    problemType,
    variables: [],
    constraints: [],
    objective: {
      coeffs: new Map(),
      offset: 0,
      maximize: false,
      value: 0,
      bestBound: 0,
    },
    outputEnabled: false,
    timeLimitMs: 0,
    numThreads: 1,
    solverSpecificParameters: '',
    hints: null,
    deleted: false,
    wallTimeMs: 0,
    iterations: 0,
    nodes: 0,
    solutionLoaded: false,
  };
}

function workerDoubleDefault(param: DoubleParam): number {
  if (param === DoubleParam.RELATIVE_MIP_GAP) return MPSolverParameters.kDefaultRelativeMipGap;
  if (param === DoubleParam.PRIMAL_TOLERANCE) return MPSolverParameters.kDefaultPrimalTolerance;
  if (param === DoubleParam.DUAL_TOLERANCE) return MPSolverParameters.kDefaultDualTolerance;
  return 0;
}

function workerIntegerDefault(param: IntegerParam): number {
  if (param === IntegerParam.PRESOLVE) return MPSolverParameters.kDefaultPresolve;
  if (param === IntegerParam.INCREMENTALITY) return MPSolverParameters.kDefaultIncrementality;
  if (param === IntegerParam.LP_ALGORITHM) return LpAlgorithmValues.DUAL;
  if (param === IntegerParam.SCALING) return ScalingValues.SCALING_ON;
  return 0;
}

function workerStatusToResultStatus(status: unknown): MPSolverResultStatus {
  if (typeof status === 'number') {
    if (status === 0) return MPSolverResultStatus.OPTIMAL;
    if (status === 1) return MPSolverResultStatus.FEASIBLE;
    if (status === 2) return MPSolverResultStatus.INFEASIBLE;
    if (status === 3) return MPSolverResultStatus.UNBOUNDED;
    if (status === 4) return MPSolverResultStatus.ABNORMAL;
    if (status === 5) return MPSolverResultStatus.MODEL_INVALID;
    if (status === 6) return MPSolverResultStatus.NOT_SOLVED;
  }
  if (status === 'MPSOLVER_OPTIMAL') return MPSolverResultStatus.OPTIMAL;
  if (status === 'MPSOLVER_FEASIBLE') return MPSolverResultStatus.FEASIBLE;
  if (status === 'MPSOLVER_INFEASIBLE') return MPSolverResultStatus.INFEASIBLE;
  if (status === 'MPSOLVER_UNBOUNDED') return MPSolverResultStatus.UNBOUNDED;
  if (status === 'MPSOLVER_ABNORMAL') return MPSolverResultStatus.ABNORMAL;
  if (status === 'MPSOLVER_MODEL_INVALID'
    || status === 'MPSOLVER_MODEL_INVALID_SOLUTION_HINT'
    || status === 'MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS') {
    return MPSolverResultStatus.MODEL_INVALID;
  }
  return MPSolverResultStatus.NOT_SOLVED;
}

function workerStatusHasSolution(status: unknown): boolean {
  const resultStatus = workerStatusToResultStatus(status);
  return resultStatus === MPSolverResultStatus.OPTIMAL || resultStatus === MPSolverResultStatus.FEASIBLE;
}

function workerConstraintActivity(state: MpWorkerSolverState, constraint: MpWorkerConstraintState): number {
  let value = 0;
  for (const [variableIndex, coefficient] of constraint.coeffs) {
    value += coefficient * (state.variables[variableIndex]?.solutionValue ?? 0);
  }
  return value;
}

function workerObjectiveValue(state: MpWorkerSolverState): number {
  let value = state.objective.offset;
  for (const [variableIndex, coefficient] of state.objective.coeffs) {
    value += coefficient * (state.variables[variableIndex]?.solutionValue ?? 0);
  }
  return value;
}

function workerBasisStatusForBounds(value: number, lb: number, ub: number): BasisStatus {
  const tolerance = 1e-7;
  if (Number.isFinite(lb) && Number.isFinite(ub) && Math.abs(lb - ub) <= tolerance) {
    return BasisStatus.FIXED_VALUE;
  }
  if (Number.isFinite(lb) && Math.abs(value - lb) <= tolerance) return BasisStatus.AT_LOWER_BOUND;
  if (Number.isFinite(ub) && Math.abs(value - ub) <= tolerance) return BasisStatus.AT_UPPER_BOUND;
  return BasisStatus.BASIC;
}

function workerModelProto(state: MpWorkerSolverState): MPSolverModelRequest {
  const model: MPSolverModelRequest = {
    name: state.name,
    maximize: state.objective.maximize,
    objectiveOffset: state.objective.offset,
    variable: state.variables.map((variable) => ({
      lowerBound: variable.lb,
      upperBound: variable.ub,
      objectiveCoefficient: state.objective.coeffs.get(variable.index) ?? 0,
      isInteger: variable.integer,
      name: variable.name,
      branchingPriority: variable.branchingPriority,
    })),
    constraint: state.constraints.map((constraint) => ({
      lowerBound: constraint.lb,
      upperBound: constraint.ub,
      varIndex: [...constraint.coeffs.keys()],
      coefficient: [...constraint.coeffs.values()],
      name: constraint.name,
      isLazy: constraint.lazy,
    })),
  };
  if (state.hints && state.hints.varIndex.length > 0) {
    model.solutionHint = state.hints;
  }
  return model;
}

function workerModelRequest(state: MpWorkerSolverState, options: MPSolverProtoSolveOptions = {}): MPSolverModelRequest {
  const request: MPSolverModelRequest = {
    solverType: options.solverType ?? state.problemType,
    model: workerModelProto(state),
  };
  const timeLimitSeconds = options.timeLimitSeconds ?? (state.timeLimitMs > 0 ? state.timeLimitMs / 1000 : undefined);
  if (timeLimitSeconds !== undefined) request.solverTimeLimitSeconds = timeLimitSeconds;
  const enableOutput = options.enableOutput ?? state.outputEnabled;
  if (enableOutput) request.enableInternalSolverOutput = true;
  const solverSpecificParameters = options.solverSpecificParameters ?? state.solverSpecificParameters;
  if (solverSpecificParameters) request.solverSpecificParameters = solverSpecificParameters;
  return request;
}

function applyWorkerSolutionResponse(state: MpWorkerSolverState, response: MPSolverSolutionResponse): boolean {
  const loaded = workerStatusHasSolution(response.status);
  const variableValues = Array.isArray(response.variableValue) ? response.variableValue : [];
  for (const variable of state.variables) {
    const value = Number(variableValues[variable.index] ?? 0);
    variable.solutionValue = value;
    variable.unroundedSolutionValue = value;
    variable.basisStatus = workerBasisStatusForBounds(value, variable.lb, variable.ub);
  }
  const reducedCosts = Array.isArray(response.reducedCost) ? response.reducedCost : [];
  for (const variable of state.variables) {
    if (variable.index < reducedCosts.length) {
      variable.reducedCost = Number(reducedCosts[variable.index]);
    }
  }
  const dualValues = Array.isArray(response.dualValue) ? response.dualValue : [];
  for (const constraint of state.constraints) {
    if (constraint.index < dualValues.length) {
      constraint.dualValue = Number(dualValues[constraint.index]);
    }
    constraint.basisStatus = workerBasisStatusForBounds(workerConstraintActivity(state, constraint), constraint.lb, constraint.ub);
  }
  state.objective.value = typeof response.objectiveValue === 'number' ? response.objectiveValue : workerObjectiveValue(state);
  state.objective.bestBound = workerProblemIsMip(state.problemType) && typeof response.bestObjectiveBound === 'number'
    ? response.bestObjectiveBound
    : state.objective.value;
  const reportedWallTime = workerSolveWallTimeMs(response);
  if (reportedWallTime !== undefined) state.wallTimeMs = reportedWallTime;
  state.solutionLoaded = loaded;
  return loaded;
}

function workerSolveWallTimeMs(response: MPSolverSolutionResponse): number | undefined {
  const solveInfo = response.solveInfo as { solveWallTimeSeconds?: number } | undefined;
  return typeof solveInfo?.solveWallTimeSeconds === 'number'
    ? Math.round(solveInfo.solveWallTimeSeconds * 1000)
    : undefined;
}

function resetWorkerSolution(state: MpWorkerSolverState): void {
  for (const variable of state.variables) {
    variable.solutionValue = 0;
    variable.unroundedSolutionValue = 0;
    variable.reducedCost = 0;
    variable.basisStatus = BasisStatus.FREE;
  }
  for (const constraint of state.constraints) {
    constraint.dualValue = 0;
    constraint.basisStatus = BasisStatus.FREE;
  }
  state.objective.value = 0;
  state.objective.bestBound = 0;
  state.wallTimeMs = 0;
  state.iterations = 0;
  state.nodes = 0;
  state.solutionLoaded = false;
}

type MPVariableRef = {
  index: number;
  handle?: number;
};

type MPConstraintRef = {
  index: number;
  handle?: number;
};

interface MPSolverParametersBackend {
  nativeHandle(): number;
  setDoubleParam(param: DoubleParam, value: number): void;
  getDoubleParam(param: DoubleParam): number;
  resetDoubleParam(param: DoubleParam): void;
  setIntegerParam(param: IntegerParam, value: number): void;
  getIntegerParam(param: IntegerParam): number;
  resetIntegerParam(param: IntegerParam): void;
  reset(): void;
  delete(): void;
}

interface MPSolverBackend {
  name(): string;
  problemType(): OptimizationProblemType;
  isMip(): boolean;
  clear(): void;
  infinity(): number;
  variable(index: number): MPVariableRef;
  variables(): MPVariableRef[];
  lookupVariable(name: string): MPVariableRef | null;
  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableRef;
  variableSolutionValue(ref: MPVariableRef): number;
  variableUnroundedSolutionValue(ref: MPVariableRef): number;
  variableReducedCost(ref: MPVariableRef): number;
  variableBasisStatus(ref: MPVariableRef): BasisStatus;
  variableIndex(ref: MPVariableRef): number;
  variableName(ref: MPVariableRef): string;
  variableLb(ref: MPVariableRef): number;
  variableUb(ref: MPVariableRef): number;
  setVariableBounds(ref: MPVariableRef, lb: number, ub: number): void;
  setVariableLb(ref: MPVariableRef, lb: number): void;
  setVariableUb(ref: MPVariableRef, ub: number): void;
  variableInteger(ref: MPVariableRef): boolean;
  setVariableInteger(ref: MPVariableRef, integer: boolean): void;
  variableBranchingPriority(ref: MPVariableRef): number;
  setVariableBranchingPriority(ref: MPVariableRef, priority: number): void;
  constraint(index: number): MPConstraintRef;
  constraints(): MPConstraintRef[];
  lookupConstraint(name: string): MPConstraintRef | null;
  addConstraint(lb: number | null, ub: number | null, name: string): MPConstraintRef;
  setConstraintCoefficient(constraint: MPConstraintRef, variable: MPVariableRef, coefficient: number): void;
  constraintCoefficient(constraint: MPConstraintRef, variable: MPVariableRef): number;
  clearConstraint(constraint: MPConstraintRef): void;
  constraintIndex(ref: MPConstraintRef): number;
  constraintName(ref: MPConstraintRef): string;
  constraintLb(ref: MPConstraintRef): number;
  constraintUb(ref: MPConstraintRef): number;
  setConstraintBounds(ref: MPConstraintRef, lb: number, ub: number): void;
  setConstraintLb(ref: MPConstraintRef, lb: number): void;
  setConstraintUb(ref: MPConstraintRef, ub: number): void;
  constraintDualValue(ref: MPConstraintRef): number;
  constraintBasisStatus(ref: MPConstraintRef): BasisStatus;
  constraintIsLazy(ref: MPConstraintRef): boolean;
  setConstraintIsLazy(ref: MPConstraintRef, laziness: boolean): void;
  clearObjective(): void;
  setObjectiveCoefficient(variable: MPVariableRef, coefficient: number): void;
  objectiveCoefficient(variable: MPVariableRef): number;
  setObjectiveOffset(offset: number): void;
  addObjectiveOffset(offset: number): void;
  objectiveOffset(): number;
  setObjectiveDirection(maximize: boolean): void;
  objectiveValue(): number;
  objectiveBestBound(): number;
  objectiveMaximization(): boolean;
  solve(parameters?: MPSolverParametersBackend): Promise<MPSolverResultStatus>;
  exportModelProto(): Promise<Uint8Array>;
  exportModelRequestProto(options?: MPSolverProtoSolveOptions): Promise<Uint8Array>;
  loadSolutionFromProto(response: Uint8Array | MPSolverSolutionResponse, tolerance: number): Promise<boolean>;
  verifySolution(tolerance: number, logErrors: boolean): boolean;
  reset(): void;
  interruptSolve(): boolean;
  nextSolution(): boolean;
  enableOutput(): void;
  suppressOutput(): void;
  outputIsEnabled(): boolean;
  setTimeLimit(milliseconds: number): void;
  timeLimit(): number;
  setNumThreads(numThreads: number): boolean;
  getNumThreads(): number;
  setSolverSpecificParametersAsString(parameters: string): boolean;
  getSolverSpecificParametersAsString(): string;
  solverVersion(): string;
  computeConstraintActivities(): number[];
  computeExactConditionNumber(): number;
  setHint(variables: MPVariableRef[], values: number[]): void;
  exportModelAsLpFormat(obfuscate: boolean): string;
  exportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string;
  numVariables(): number;
  numConstraints(): number;
  wallTime(): number;
  iterations(): number;
  nodes(): number;
  delete(): void;
}

function nativeVariableHandle(ref: MPVariableRef): number {
  if (!ref.handle) throw new Error('MPSolver: native variable handle is not available.');
  return ref.handle;
}

function nativeConstraintHandle(ref: MPConstraintRef): number {
  if (!ref.handle) throw new Error('MPSolver: native constraint handle is not available.');
  return ref.handle;
}

class NativeMPSolverParametersBackend implements MPSolverParametersBackend {
  private handle = 0;

  constructor(private readonly exports: MpSolverExports = getMpSolverExports()) {
    this.handle = this.exports.parametersCreate();
    if (this.handle === 0) {
      throw new Error('MPSolverParameters: failed to create parameters.');
    }
  }

  nativeHandle(): number {
    return this.handle;
  }

  setDoubleParam(param: DoubleParam, value: number): void {
    this.exports.parametersSetDoubleParam(this.handle, param, value);
  }

  getDoubleParam(param: DoubleParam): number {
    return this.exports.parametersGetDoubleParam(this.handle, param);
  }

  resetDoubleParam(param: DoubleParam): void {
    this.exports.parametersResetDoubleParam(this.handle, param);
  }

  setIntegerParam(param: IntegerParam, value: number): void {
    this.exports.parametersSetIntegerParam(this.handle, param, value);
  }

  getIntegerParam(param: IntegerParam): number {
    return this.exports.parametersGetIntegerParam(this.handle, param);
  }

  resetIntegerParam(param: IntegerParam): void {
    this.exports.parametersResetIntegerParam(this.handle, param);
  }

  reset(): void {
    this.exports.parametersReset(this.handle);
  }

  delete(): void {
    if (this.handle !== 0) {
      this.exports.parametersDelete(this.handle);
      this.handle = 0;
    }
  }
}

class BridgeMPSolverParametersBackend implements MPSolverParametersBackend {
  private readonly doubleParams = new Map<DoubleParam, number>();
  private readonly integerParams = new Map<IntegerParam, number>();

  nativeHandle(): number {
    throw new Error('MPSolverParameters: native handle is not available for worker-backed parameters.');
  }

  setDoubleParam(param: DoubleParam, value: number): void {
    this.doubleParams.set(param, value);
  }

  getDoubleParam(param: DoubleParam): number {
    return this.doubleParams.get(param) ?? workerDoubleDefault(param);
  }

  resetDoubleParam(param: DoubleParam): void {
    this.doubleParams.delete(param);
  }

  setIntegerParam(param: IntegerParam, value: number): void {
    this.integerParams.set(param, value);
  }

  getIntegerParam(param: IntegerParam): number {
    return this.integerParams.get(param) ?? workerIntegerDefault(param);
  }

  resetIntegerParam(param: IntegerParam): void {
    this.integerParams.delete(param);
  }

  reset(): void {
    this.doubleParams.clear();
    this.integerParams.clear();
  }

  delete(): void {
    this.reset();
  }
}

class NativeMPSolverBackend implements MPSolverBackend {
  private handle = 0;

  constructor(
    private readonly module: OrToolsWasmModule,
    private readonly exports: MpSolverExports,
    nameOrHandle: string | number,
    problemType?: OptimizationProblemType,
  ) {
    if (typeof nameOrHandle === 'number') {
      this.handle = nameOrHandle;
    } else {
      this.handle = withCString(this.module, nameOrHandle, (namePtr) => {
        return this.exports.solverCreate(namePtr, problemType as OptimizationProblemType);
      });
    }
    if (this.handle === 0) {
      throw new Error('MPSolver: failed to create solver.');
    }
  }

  static create(name: string, problemType: OptimizationProblemType): NativeMPSolverBackend {
    return new NativeMPSolverBackend(getMpSolverModule(), getMpSolverExports(), name, problemType);
  }

  static createSolver(solverId: string): NativeMPSolverBackend | null {
    const module = getMpSolverModule();
    const exports = getMpSolverExports();
    const handle = withCString(module, solverId, (solverIdPtr) => exports.solverCreateSolver(solverIdPtr));
    return handle === 0 ? null : new NativeMPSolverBackend(module, exports, handle);
  }

  name(): string {
    return readCString(this.module, this.exports.solverName(this.handle));
  }

  problemType(): OptimizationProblemType {
    return this.exports.solverProblemType(this.handle);
  }

  isMip(): boolean {
    return this.exports.solverIsMip(this.handle) === 1;
  }

  clear(): void {
    this.exports.solverClear(this.handle);
  }

  infinity(): number {
    return this.exports.solverInfinity();
  }

  variable(index: number): MPVariableRef {
    const handle = this.exports.solverVariable(this.handle, index);
    if (handle === 0) throw new Error(`MPSolver.variable: no variable at index ${index}.`);
    return { index, handle };
  }

  variables(): MPVariableRef[] {
    return Array.from({ length: this.numVariables() }, (_, index) => this.variable(index));
  }

  lookupVariable(name: string): MPVariableRef | null {
    const handle = withCString(this.module, name, (namePtr) => this.exports.solverLookupVariable(this.handle, namePtr));
    return handle === 0 ? null : { index: this.exports.variableIndex(handle), handle };
  }

  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableRef {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverVar(this.handle, lb, ub, integer ? 1 : 0, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.Var: failed to create variable '${name}'.`);
    return { index: this.exports.variableIndex(handle), handle };
  }

  variableSolutionValue(ref: MPVariableRef): number {
    return this.exports.variableSolutionValue(nativeVariableHandle(ref));
  }

  variableUnroundedSolutionValue(ref: MPVariableRef): number {
    return this.exports.variableUnroundedSolutionValue(nativeVariableHandle(ref));
  }

  variableReducedCost(ref: MPVariableRef): number {
    return this.exports.variableReducedCost(nativeVariableHandle(ref));
  }

  variableBasisStatus(ref: MPVariableRef): BasisStatus {
    return this.exports.variableBasisStatus(nativeVariableHandle(ref));
  }

  variableIndex(ref: MPVariableRef): number {
    return this.exports.variableIndex(nativeVariableHandle(ref));
  }

  variableName(ref: MPVariableRef): string {
    return readCString(this.module, this.exports.variableName(nativeVariableHandle(ref)));
  }

  variableLb(ref: MPVariableRef): number {
    return this.exports.variableLb(nativeVariableHandle(ref));
  }

  variableUb(ref: MPVariableRef): number {
    return this.exports.variableUb(nativeVariableHandle(ref));
  }

  setVariableBounds(ref: MPVariableRef, lb: number, ub: number): void {
    this.exports.variableSetBounds(nativeVariableHandle(ref), lb, ub);
  }

  setVariableLb(ref: MPVariableRef, lb: number): void {
    this.exports.variableSetLb(nativeVariableHandle(ref), lb);
  }

  setVariableUb(ref: MPVariableRef, ub: number): void {
    this.exports.variableSetUb(nativeVariableHandle(ref), ub);
  }

  variableInteger(ref: MPVariableRef): boolean {
    return this.exports.variableInteger(nativeVariableHandle(ref)) === 1;
  }

  setVariableInteger(ref: MPVariableRef, integer: boolean): void {
    this.exports.variableSetInteger(nativeVariableHandle(ref), integer ? 1 : 0);
  }

  variableBranchingPriority(ref: MPVariableRef): number {
    return this.exports.variableBranchingPriority(nativeVariableHandle(ref));
  }

  setVariableBranchingPriority(ref: MPVariableRef, priority: number): void {
    this.exports.variableSetBranchingPriority(nativeVariableHandle(ref), priority);
  }

  constraint(index: number): MPConstraintRef {
    const handle = this.exports.solverConstraint(this.handle, index);
    if (handle === 0) throw new Error(`MPSolver.constraint: no constraint at index ${index}.`);
    return { index, handle };
  }

  constraints(): MPConstraintRef[] {
    return Array.from({ length: this.numConstraints() }, (_, index) => this.constraint(index));
  }

  lookupConstraint(name: string): MPConstraintRef | null {
    const handle = withCString(this.module, name, (namePtr) => this.exports.solverLookupConstraint(this.handle, namePtr));
    return handle === 0 ? null : { index: this.exports.constraintIndex(handle), handle };
  }

  addConstraint(lb: number | null, ub: number | null, name: string): MPConstraintRef {
    const hasBounds = typeof lb === 'number' && typeof ub === 'number';
    const handle = withCString(this.module, name, (namePtr) => {
      return hasBounds
        ? this.exports.solverRowConstraint(this.handle, lb, ub, namePtr)
        : this.exports.solverUnboundedRowConstraint(this.handle, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.Constraint: failed to create constraint '${name}'.`);
    return { index: this.exports.constraintIndex(handle), handle };
  }

  setConstraintCoefficient(constraint: MPConstraintRef, variable: MPVariableRef, coefficient: number): void {
    this.exports.constraintSetCoefficient(nativeConstraintHandle(constraint), nativeVariableHandle(variable), coefficient);
  }

  constraintCoefficient(constraint: MPConstraintRef, variable: MPVariableRef): number {
    return this.exports.constraintGetCoefficient(nativeConstraintHandle(constraint), nativeVariableHandle(variable));
  }

  clearConstraint(constraint: MPConstraintRef): void {
    this.exports.constraintClear(nativeConstraintHandle(constraint));
  }

  constraintIndex(ref: MPConstraintRef): number {
    return this.exports.constraintIndex(nativeConstraintHandle(ref));
  }

  constraintName(ref: MPConstraintRef): string {
    return readCString(this.module, this.exports.constraintName(nativeConstraintHandle(ref)));
  }

  constraintLb(ref: MPConstraintRef): number {
    return this.exports.constraintLb(nativeConstraintHandle(ref));
  }

  constraintUb(ref: MPConstraintRef): number {
    return this.exports.constraintUb(nativeConstraintHandle(ref));
  }

  setConstraintBounds(ref: MPConstraintRef, lb: number, ub: number): void {
    this.exports.constraintSetBounds(nativeConstraintHandle(ref), lb, ub);
  }

  setConstraintLb(ref: MPConstraintRef, lb: number): void {
    this.exports.constraintSetLb(nativeConstraintHandle(ref), lb);
  }

  setConstraintUb(ref: MPConstraintRef, ub: number): void {
    this.exports.constraintSetUb(nativeConstraintHandle(ref), ub);
  }

  constraintDualValue(ref: MPConstraintRef): number {
    return this.exports.constraintDualValue(nativeConstraintHandle(ref));
  }

  constraintBasisStatus(ref: MPConstraintRef): BasisStatus {
    return this.exports.constraintBasisStatus(nativeConstraintHandle(ref));
  }

  constraintIsLazy(ref: MPConstraintRef): boolean {
    return this.exports.constraintIsLazy(nativeConstraintHandle(ref)) === 1;
  }

  setConstraintIsLazy(ref: MPConstraintRef, laziness: boolean): void {
    this.exports.constraintSetIsLazy(nativeConstraintHandle(ref), laziness ? 1 : 0);
  }

  clearObjective(): void {
    this.exports.objectiveClear(this.handle);
  }

  setObjectiveCoefficient(variable: MPVariableRef, coefficient: number): void {
    this.exports.objectiveSetCoefficient(this.handle, nativeVariableHandle(variable), coefficient);
  }

  objectiveCoefficient(variable: MPVariableRef): number {
    return this.exports.objectiveGetCoefficient(this.handle, nativeVariableHandle(variable));
  }

  setObjectiveOffset(offset: number): void {
    this.exports.objectiveSetOffset(this.handle, offset);
  }

  addObjectiveOffset(offset: number): void {
    this.exports.objectiveAddOffset(this.handle, offset);
  }

  objectiveOffset(): number {
    return this.exports.objectiveOffset(this.handle);
  }

  setObjectiveDirection(maximize: boolean): void {
    this.exports.objectiveSetOptimizationDirection(this.handle, maximize ? 1 : 0);
  }

  objectiveValue(): number {
    return this.exports.objectiveValue(this.handle);
  }

  objectiveBestBound(): number {
    return this.exports.objectiveBestBound(this.handle);
  }

  objectiveMaximization(): boolean {
    return this.exports.objectiveMaximization(this.handle) === 1;
  }

  async solve(parameters?: MPSolverParametersBackend): Promise<MPSolverResultStatus> {
    return parameters
      ? await this.module.ccall(
        'mp_solver_solve_with_parameters',
        'number',
        ['number', 'number'],
        [this.handle, parameters.nativeHandle()],
        { async: true },
      ) as MPSolverResultStatus
      : await this.module.ccall(
        'mp_solver_solve',
        'number',
        ['number'],
        [this.handle],
        { async: true },
      ) as MPSolverResultStatus;
  }

  exportModelProto(): Promise<Uint8Array> {
    return readNativeBytes(this.module, (lenPtr) => this.exports.solverExportModelProto(this.handle, lenPtr));
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    const solverType = options.solverType ?? this.problemType();
    const parameters = options.solverSpecificParameters ?? '';
    return withCString(this.module, parameters, (parametersPtr) => {
      return readNativeBytes(this.module, (lenPtr) => {
        return this.exports.solverExportModelRequestProto(
          this.handle,
          solverType,
          options.timeLimitSeconds ?? 0,
          options.enableOutput ? 1 : 0,
          parametersPtr,
          lenPtr,
        );
      });
    });
  }

  async loadSolutionFromProto(response: Uint8Array | MPSolverSolutionResponse, tolerance: number): Promise<boolean> {
    const responseBytes = response instanceof Uint8Array ? response : await encodeMPSolutionResponse(response);
    const responsePtr = copyBytesToHeap(this.module, responseBytes);
    try {
      return this.exports.solverLoadSolutionProto(this.handle, responsePtr, responseBytes.length, tolerance) === 1;
    } finally {
      if (responsePtr) this.module._free(responsePtr);
    }
  }

  verifySolution(tolerance: number, logErrors: boolean): boolean {
    return this.exports.solverVerifySolution(this.handle, tolerance, logErrors ? 1 : 0) === 1;
  }

  reset(): void {
    this.exports.solverReset(this.handle);
  }

  interruptSolve(): boolean {
    return this.exports.solverInterruptSolve(this.handle) === 1;
  }

  nextSolution(): boolean {
    return this.exports.solverNextSolution(this.handle) === 1;
  }

  enableOutput(): void {
    this.exports.solverEnableOutput(this.handle);
  }

  suppressOutput(): void {
    this.exports.solverSuppressOutput(this.handle);
  }

  outputIsEnabled(): boolean {
    return this.exports.solverOutputIsEnabled(this.handle) === 1;
  }

  setTimeLimit(milliseconds: number): void {
    this.exports.solverSetTimeLimit(this.handle, BigInt(Math.trunc(milliseconds)));
  }

  timeLimit(): number {
    return toNumber(this.exports.solverTimeLimit(this.handle));
  }

  setNumThreads(numThreads: number): boolean {
    return this.exports.solverSetNumThreads(this.handle, numThreads) === 1;
  }

  getNumThreads(): number {
    return this.exports.solverGetNumThreads(this.handle);
  }

  setSolverSpecificParametersAsString(parameters: string): boolean {
    return withCString(this.module, parameters, (parametersPtr) => {
      return this.exports.solverSetSolverSpecificParametersAsString(this.handle, parametersPtr) === 1;
    });
  }

  getSolverSpecificParametersAsString(): string {
    this.exports.solverGetSolverSpecificParametersAsString(this.handle);
    return readCString(this.module, this.exports.lastStringResult());
  }

  solverVersion(): string {
    return readCString(this.module, this.exports.solverSolverVersion(this.handle));
  }

  computeConstraintActivities(): number[] {
    return Array.from({ length: this.numConstraints() }, (_, index) => this.exports.solverConstraintActivity(this.handle, index));
  }

  computeExactConditionNumber(): number {
    return this.exports.solverComputeExactConditionNumber(this.handle);
  }

  setHint(variables: MPVariableRef[], values: number[]): void {
    const variableBytes = variables.length * Int32Array.BYTES_PER_ELEMENT;
    const valueBytes = values.length * Float64Array.BYTES_PER_ELEMENT;
    const variablePtr = this.module._malloc(variableBytes);
    const valuePtr = this.module._malloc(valueBytes);
    try {
      new Int32Array(this.module.HEAPU8.buffer, variablePtr, variables.length).set(variables.map(nativeVariableHandle));
      new Float64Array(this.module.HEAPU8.buffer, valuePtr, values.length).set(values);
      this.exports.solverSetHint(this.handle, variablePtr, valuePtr, variables.length);
    } finally {
      this.module._free(variablePtr);
      this.module._free(valuePtr);
    }
  }

  exportModelAsLpFormat(obfuscate: boolean): string {
    this.exports.solverExportModelAsLpFormat(this.handle, obfuscate ? 1 : 0);
    return readCString(this.module, this.exports.lastStringResult());
  }

  exportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string {
    this.exports.solverExportModelAsMpsFormat(this.handle, fixedFormat ? 1 : 0, obfuscate ? 1 : 0);
    return readCString(this.module, this.exports.lastStringResult());
  }

  numVariables(): number {
    return this.exports.solverNumVariables(this.handle);
  }

  numConstraints(): number {
    return this.exports.solverNumConstraints(this.handle);
  }

  wallTime(): number {
    return toNumber(this.exports.solverWallTime(this.handle));
  }

  iterations(): number {
    return toNumber(this.exports.solverIterations(this.handle));
  }

  nodes(): number {
    return toNumber(this.exports.solverNodes(this.handle));
  }

  delete(): void {
    if (this.handle !== 0) {
      this.exports.solverDelete(this.handle);
      this.handle = 0;
    }
  }
}

class SerializedMPSolverBackend implements MPSolverBackend {
  private readonly state: MpWorkerSolverState;

  constructor(name: string, problemType: OptimizationProblemType) {
    this.state = createWorkerSolverState(name, problemType);
  }

  private variableState(ref: MPVariableRef): MpWorkerVariableState {
    const variable = this.state.variables[ref.index];
    if (!variable) throw new Error(`MPSolver.variable: no variable at index ${ref.index}.`);
    return variable;
  }

  private constraintState(ref: MPConstraintRef): MpWorkerConstraintState {
    const constraint = this.state.constraints[ref.index];
    if (!constraint) throw new Error(`MPSolver.constraint: no constraint at index ${ref.index}.`);
    return constraint;
  }

  name(): string {
    return this.state.name;
  }

  problemType(): OptimizationProblemType {
    return this.state.problemType;
  }

  isMip(): boolean {
    return workerProblemIsMip(this.state.problemType);
  }

  clear(): void {
    this.state.variables = [];
    this.state.constraints = [];
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.hints = null;
    resetWorkerSolution(this.state);
  }

  infinity(): number {
    return Number.POSITIVE_INFINITY;
  }

  variable(index: number): MPVariableRef {
    this.variableState({ index });
    return { index };
  }

  variables(): MPVariableRef[] {
    return this.state.variables.map((variable) => ({ index: variable.index }));
  }

  lookupVariable(name: string): MPVariableRef | null {
    const variable = this.state.variables.find((candidate) => candidate.name === name);
    return variable ? { index: variable.index } : null;
  }

  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableRef {
    const variable: MpWorkerVariableState = {
      index: this.state.variables.length,
      name,
      lb,
      ub,
      integer,
      branchingPriority: 0,
      solutionValue: 0,
      unroundedSolutionValue: 0,
      reducedCost: 0,
      basisStatus: BasisStatus.FREE,
    };
    this.state.variables.push(variable);
    return { index: variable.index };
  }

  variableSolutionValue(ref: MPVariableRef): number {
    return this.variableState(ref).solutionValue;
  }

  variableUnroundedSolutionValue(ref: MPVariableRef): number {
    return this.variableState(ref).unroundedSolutionValue;
  }

  variableReducedCost(ref: MPVariableRef): number {
    return this.variableState(ref).reducedCost;
  }

  variableBasisStatus(ref: MPVariableRef): BasisStatus {
    return this.variableState(ref).basisStatus;
  }

  variableIndex(ref: MPVariableRef): number {
    return this.variableState(ref).index;
  }

  variableName(ref: MPVariableRef): string {
    return this.variableState(ref).name;
  }

  variableLb(ref: MPVariableRef): number {
    return this.variableState(ref).lb;
  }

  variableUb(ref: MPVariableRef): number {
    return this.variableState(ref).ub;
  }

  setVariableBounds(ref: MPVariableRef, lb: number, ub: number): void {
    const variable = this.variableState(ref);
    variable.lb = lb;
    variable.ub = ub;
  }

  setVariableLb(ref: MPVariableRef, lb: number): void {
    this.variableState(ref).lb = lb;
  }

  setVariableUb(ref: MPVariableRef, ub: number): void {
    this.variableState(ref).ub = ub;
  }

  variableInteger(ref: MPVariableRef): boolean {
    return this.variableState(ref).integer;
  }

  setVariableInteger(ref: MPVariableRef, integer: boolean): void {
    this.variableState(ref).integer = integer;
  }

  variableBranchingPriority(ref: MPVariableRef): number {
    return this.variableState(ref).branchingPriority;
  }

  setVariableBranchingPriority(ref: MPVariableRef, priority: number): void {
    this.variableState(ref).branchingPriority = priority;
  }

  constraint(index: number): MPConstraintRef {
    this.constraintState({ index });
    return { index };
  }

  constraints(): MPConstraintRef[] {
    return this.state.constraints.map((constraint) => ({ index: constraint.index }));
  }

  lookupConstraint(name: string): MPConstraintRef | null {
    const constraint = this.state.constraints.find((candidate) => candidate.name === name);
    return constraint ? { index: constraint.index } : null;
  }

  addConstraint(lb: number | null, ub: number | null, name: string): MPConstraintRef {
    const constraint: MpWorkerConstraintState = {
      index: this.state.constraints.length,
      name,
      lb: lb ?? Number.NEGATIVE_INFINITY,
      ub: ub ?? Number.POSITIVE_INFINITY,
      coeffs: new Map(),
      dualValue: 0,
      basisStatus: BasisStatus.FREE,
      lazy: false,
    };
    this.state.constraints.push(constraint);
    return { index: constraint.index };
  }

  setConstraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef, coefficient: number): void {
    const constraint = this.constraintState(constraintRef);
    if (coefficient === 0) {
      constraint.coeffs.delete(variableRef.index);
    } else {
      constraint.coeffs.set(variableRef.index, coefficient);
    }
  }

  constraintCoefficient(constraintRef: MPConstraintRef, variableRef: MPVariableRef): number {
    return this.constraintState(constraintRef).coeffs.get(variableRef.index) ?? 0;
  }

  clearConstraint(constraint: MPConstraintRef): void {
    this.constraintState(constraint).coeffs.clear();
  }

  constraintIndex(ref: MPConstraintRef): number {
    return this.constraintState(ref).index;
  }

  constraintName(ref: MPConstraintRef): string {
    return this.constraintState(ref).name;
  }

  constraintLb(ref: MPConstraintRef): number {
    return this.constraintState(ref).lb;
  }

  constraintUb(ref: MPConstraintRef): number {
    return this.constraintState(ref).ub;
  }

  setConstraintBounds(ref: MPConstraintRef, lb: number, ub: number): void {
    const constraint = this.constraintState(ref);
    constraint.lb = lb;
    constraint.ub = ub;
  }

  setConstraintLb(ref: MPConstraintRef, lb: number): void {
    this.constraintState(ref).lb = lb;
  }

  setConstraintUb(ref: MPConstraintRef, ub: number): void {
    this.constraintState(ref).ub = ub;
  }

  constraintDualValue(ref: MPConstraintRef): number {
    return this.constraintState(ref).dualValue;
  }

  constraintBasisStatus(ref: MPConstraintRef): BasisStatus {
    return this.constraintState(ref).basisStatus;
  }

  constraintIsLazy(ref: MPConstraintRef): boolean {
    return this.constraintState(ref).lazy;
  }

  setConstraintIsLazy(ref: MPConstraintRef, laziness: boolean): void {
    this.constraintState(ref).lazy = laziness;
  }

  clearObjective(): void {
    this.state.objective.coeffs.clear();
    this.state.objective.offset = 0;
    this.state.objective.value = 0;
    this.state.objective.bestBound = 0;
  }

  setObjectiveCoefficient(variable: MPVariableRef, coefficient: number): void {
    if (coefficient === 0) {
      this.state.objective.coeffs.delete(variable.index);
    } else {
      this.state.objective.coeffs.set(variable.index, coefficient);
    }
  }

  objectiveCoefficient(variable: MPVariableRef): number {
    return this.state.objective.coeffs.get(variable.index) ?? 0;
  }

  setObjectiveOffset(offset: number): void {
    this.state.objective.offset = offset;
  }

  addObjectiveOffset(offset: number): void {
    this.state.objective.offset += offset;
  }

  objectiveOffset(): number {
    return this.state.objective.offset;
  }

  setObjectiveDirection(maximize: boolean): void {
    this.state.objective.maximize = maximize;
  }

  objectiveValue(): number {
    return this.state.objective.value;
  }

  objectiveBestBound(): number {
    return this.state.objective.bestBound;
  }

  objectiveMaximization(): boolean {
    return this.state.objective.maximize;
  }

  async solve(): Promise<MPSolverResultStatus> {
    const started = Date.now();
    const result = await MPSolver.solveModelRequest(
      workerModelRequest(this.state),
      { numThreads: this.state.numThreads },
    );
    applyWorkerSolutionResponse(this.state, result.response);
    if (workerSolveWallTimeMs(result.response) === undefined) {
      this.state.wallTimeMs = Date.now() - started;
    }
    return workerStatusToResultStatus(result.response.status);
  }

  exportModelProto(): Promise<Uint8Array> {
    return encodeMPModel(workerModelProto(this.state));
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return encodeMPModelRequest(workerModelRequest(this.state, options));
  }

  async loadSolutionFromProto(response: Uint8Array | MPSolverSolutionResponse, _tolerance: number): Promise<boolean> {
    const decoded = response instanceof Uint8Array ? await decodeMPSolutionResponse(response) : response;
    return applyWorkerSolutionResponse(this.state, decoded);
  }

  verifySolution(tolerance: number): boolean {
    if (!this.state.solutionLoaded) return false;
    for (const variable of this.state.variables) {
      if (variable.solutionValue < variable.lb - tolerance || variable.solutionValue > variable.ub + tolerance) return false;
      if (variable.integer && Math.abs(variable.solutionValue - Math.round(variable.solutionValue)) > tolerance) return false;
    }
    for (const constraint of this.state.constraints) {
      const activity = workerConstraintActivity(this.state, constraint);
      if (activity < constraint.lb - tolerance || activity > constraint.ub + tolerance) return false;
    }
    return true;
  }

  reset(): void {
    resetWorkerSolution(this.state);
  }

  interruptSolve(): boolean {
    return false;
  }

  nextSolution(): boolean {
    return false;
  }

  enableOutput(): void {
    this.state.outputEnabled = true;
  }

  suppressOutput(): void {
    this.state.outputEnabled = false;
  }

  outputIsEnabled(): boolean {
    return this.state.outputEnabled;
  }

  setTimeLimit(milliseconds: number): void {
    this.state.timeLimitMs = Math.trunc(milliseconds);
  }

  timeLimit(): number {
    return this.state.timeLimitMs;
  }

  setNumThreads(numThreads: number): boolean {
    if (!Number.isInteger(numThreads) || numThreads < 1) return false;
    if (!workerProblemSupportsNumThreads(this.state.problemType)) {
      return false;
    }
    this.state.numThreads = numThreads;
    return true;
  }

  getNumThreads(): number {
    return this.state.numThreads;
  }

  setSolverSpecificParametersAsString(parameters: string): boolean {
    this.state.solverSpecificParameters = parameters;
    return true;
  }

  getSolverSpecificParametersAsString(): string {
    return this.state.solverSpecificParameters;
  }

  solverVersion(): string {
    return 'OR-Tools serialized MPSolver';
  }

  computeConstraintActivities(): number[] {
    return this.state.constraints.map((constraint) => workerConstraintActivity(this.state, constraint));
  }

  computeExactConditionNumber(): number {
    return 0;
  }

  setHint(variables: MPVariableRef[], values: number[]): void {
    this.state.hints = {
      varIndex: variables.map((variable) => variable.index),
      varValue: [...values],
    };
  }

  exportModelAsLpFormat(_obfuscate: boolean): string {
    return `${this.state.objective.maximize ? 'Maximize' : 'Minimize'}\n obj: ${this.state.name}\nSubject To\n${this.state.constraints.map((c) => ` ${c.name}`).join('\n')}\nEnd\n`;
  }

  exportModelAsMpsFormat(_fixedFormat: boolean, _obfuscate: boolean): string {
    return `NAME          ${this.state.name}\nROWS\nCOLUMNS\nRHS\nBOUNDS\nENDATA\n`;
  }

  numVariables(): number {
    return this.state.variables.length;
  }

  numConstraints(): number {
    return this.state.constraints.length;
  }

  wallTime(): number {
    return this.state.wallTimeMs;
  }

  iterations(): number {
    return this.state.iterations;
  }

  nodes(): number {
    return this.state.nodes;
  }

  delete(): void {
    this.state.deleted = true;
    this.clear();
  }
}

export class MPVariable {
  constructor(
    private readonly backend: MPSolverBackend,
    readonly ref: MPVariableRef,
  ) {}

  SolutionValue(): number {
    return this.solution_value();
  }

  solution_value(): number {
    return this.backend.variableSolutionValue(this.ref);
  }

  unrounded_solution_value(): number {
    return this.backend.variableUnroundedSolutionValue(this.ref);
  }

  ReducedCost(): number {
    return this.reduced_cost();
  }

  reduced_cost(): number {
    return this.backend.variableReducedCost(this.ref);
  }

  basis_status(): BasisStatus {
    return this.backend.variableBasisStatus(this.ref);
  }

  index(): number {
    return this.backend.variableIndex(this.ref);
  }

  name(): string {
    return this.backend.variableName(this.ref);
  }

  Lb(): number {
    return this.backend.variableLb(this.ref);
  }

  Ub(): number {
    return this.backend.variableUb(this.ref);
  }

  SetBounds(lb: number, ub: number): void {
    this.backend.setVariableBounds(this.ref, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.backend.setVariableLb(this.ref, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.backend.setVariableUb(this.ref, ub);
  }

  Integer(): boolean {
    return this.backend.variableInteger(this.ref);
  }

  SetInteger(integer: boolean): void {
    this.backend.setVariableInteger(this.ref, integer);
  }

  branching_priority(): number {
    return this.backend.variableBranchingPriority(this.ref);
  }

  SetBranchingPriority(priority: number): void {
    this.backend.setVariableBranchingPriority(this.ref, priority);
  }

  toString(): string {
    return this.name();
  }
}

export class MPConstraint {
  constructor(
    private readonly backend: MPSolverBackend,
    readonly ref: MPConstraintRef,
  ) {}

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.backend.setConstraintCoefficient(this.ref, variable.ref, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.backend.constraintCoefficient(this.ref, variable.ref);
  }

  Clear(): void {
    this.backend.clearConstraint(this.ref);
  }

  index(): number {
    return this.backend.constraintIndex(this.ref);
  }

  name(): string {
    return this.backend.constraintName(this.ref);
  }

  Lb(): number {
    return this.backend.constraintLb(this.ref);
  }

  Ub(): number {
    return this.backend.constraintUb(this.ref);
  }

  SetBounds(lb: number, ub: number): void {
    this.backend.setConstraintBounds(this.ref, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.backend.setConstraintLb(this.ref, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.backend.setConstraintUb(this.ref, ub);
  }

  DualValue(): number {
    return this.dual_value();
  }

  dual_value(): number {
    return this.backend.constraintDualValue(this.ref);
  }

  basis_status(): BasisStatus {
    return this.backend.constraintBasisStatus(this.ref);
  }

  is_lazy(): boolean {
    return this.backend.constraintIsLazy(this.ref);
  }

  set_is_lazy(laziness: boolean): void {
    this.backend.setConstraintIsLazy(this.ref, laziness);
  }
}

export class MPObjective {
  constructor(private readonly backend: MPSolverBackend) {}

  Clear(): void {
    this.backend.clearObjective();
  }

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.backend.setObjectiveCoefficient(variable.ref, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.backend.objectiveCoefficient(variable.ref);
  }

  SetOffset(offset: number): void {
    this.backend.setObjectiveOffset(offset);
  }

  AddOffset(offset: number): void {
    this.backend.addObjectiveOffset(offset);
  }

  Offset(): number {
    return this.offset();
  }

  offset(): number {
    return this.backend.objectiveOffset();
  }

  SetOptimizationDirection(maximize: boolean): void {
    this.backend.setObjectiveDirection(maximize);
  }

  SetMinimization(): void {
    this.backend.setObjectiveDirection(false);
  }

  SetMaximization(): void {
    this.backend.setObjectiveDirection(true);
  }

  Value(): number {
    return this.backend.objectiveValue();
  }

  BestBound(): number {
    return this.backend.objectiveBestBound();
  }

  maximization(): boolean {
    return this.backend.objectiveMaximization();
  }

  minimization(): boolean {
    return !this.backend.objectiveMaximization();
  }
}

export class MPSolverParameters {
  static readonly RELATIVE_MIP_GAP = DoubleParam.RELATIVE_MIP_GAP;
  static readonly PRIMAL_TOLERANCE = DoubleParam.PRIMAL_TOLERANCE;
  static readonly DUAL_TOLERANCE = DoubleParam.DUAL_TOLERANCE;
  static readonly PRESOLVE = IntegerParam.PRESOLVE;
  static readonly LP_ALGORITHM = IntegerParam.LP_ALGORITHM;
  static readonly INCREMENTALITY = IntegerParam.INCREMENTALITY;
  static readonly SCALING = IntegerParam.SCALING;
  static readonly PRESOLVE_OFF = PresolveValues.PRESOLVE_OFF;
  static readonly PRESOLVE_ON = PresolveValues.PRESOLVE_ON;
  static readonly DUAL = LpAlgorithmValues.DUAL;
  static readonly PRIMAL = LpAlgorithmValues.PRIMAL;
  static readonly BARRIER = LpAlgorithmValues.BARRIER;
  static readonly INCREMENTALITY_OFF = IncrementalityValues.INCREMENTALITY_OFF;
  static readonly INCREMENTALITY_ON = IncrementalityValues.INCREMENTALITY_ON;
  static readonly SCALING_OFF = ScalingValues.SCALING_OFF;
  static readonly SCALING_ON = ScalingValues.SCALING_ON;
  static readonly kDefaultRelativeMipGap = 1e-4;
  static readonly kDefaultPrimalTolerance = 1e-7;
  static readonly kDefaultDualTolerance = 1e-7;
  static readonly kDefaultPresolve = PresolveValues.PRESOLVE_ON;
  static readonly kDefaultIncrementality = IncrementalityValues.INCREMENTALITY_ON;

  readonly backend: MPSolverParametersBackend;

  constructor() {
    this.backend = shouldUseSerializedMPSolverBackend()
      ? new BridgeMPSolverParametersBackend()
      : new NativeMPSolverParametersBackend();
  }

  get nativeHandle(): number {
    return this.backend.nativeHandle();
  }

  SetDoubleParam(param: DoubleParam, value: number): void {
    this.backend.setDoubleParam(param, value);
  }

  GetDoubleParam(param: DoubleParam): number {
    return this.backend.getDoubleParam(param);
  }

  ResetDoubleParam(param: DoubleParam): void {
    this.backend.resetDoubleParam(param);
  }

  SetIntegerParam(param: IntegerParam, value: number): void {
    this.backend.setIntegerParam(param, value);
  }

  GetIntegerParam(param: IntegerParam): number {
    return this.backend.getIntegerParam(param);
  }

  ResetIntegerParam(param: IntegerParam): void {
    this.backend.resetIntegerParam(param);
  }

  Reset(): void {
    this.backend.reset();
  }

  delete(): void {
    this.backend.delete();
  }
}

export class MPSolver {
  static readonly CLP_LINEAR_PROGRAMMING = OptimizationProblemType.CLP_LINEAR_PROGRAMMING;
  static readonly GLPK_LINEAR_PROGRAMMING = OptimizationProblemType.GLPK_LINEAR_PROGRAMMING;
  static readonly GLOP_LINEAR_PROGRAMMING = OptimizationProblemType.GLOP_LINEAR_PROGRAMMING;
  static readonly PDLP_LINEAR_PROGRAMMING = OptimizationProblemType.PDLP_LINEAR_PROGRAMMING;
  static readonly HIGHS_LINEAR_PROGRAMMING = OptimizationProblemType.HIGHS_LINEAR_PROGRAMMING;
  static readonly SCIP_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING;
  static readonly GLPK_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.GLPK_MIXED_INTEGER_PROGRAMMING;
  static readonly CBC_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.CBC_MIXED_INTEGER_PROGRAMMING;
  static readonly HIGHS_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.HIGHS_MIXED_INTEGER_PROGRAMMING;
  static readonly GUROBI_LINEAR_PROGRAMMING = OptimizationProblemType.GUROBI_LINEAR_PROGRAMMING;
  static readonly GUROBI_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.GUROBI_MIXED_INTEGER_PROGRAMMING;
  static readonly CPLEX_LINEAR_PROGRAMMING = OptimizationProblemType.CPLEX_LINEAR_PROGRAMMING;
  static readonly CPLEX_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.CPLEX_MIXED_INTEGER_PROGRAMMING;
  static readonly XPRESS_LINEAR_PROGRAMMING = OptimizationProblemType.XPRESS_LINEAR_PROGRAMMING;
  static readonly XPRESS_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.XPRESS_MIXED_INTEGER_PROGRAMMING;
  static readonly COPT_LINEAR_PROGRAMMING = OptimizationProblemType.COPT_LINEAR_PROGRAMMING;
  static readonly COPT_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.COPT_MIXED_INTEGER_PROGRAMMING;
  static readonly BOP_INTEGER_PROGRAMMING = OptimizationProblemType.BOP_INTEGER_PROGRAMMING;
  static readonly SAT_INTEGER_PROGRAMMING = OptimizationProblemType.SAT_INTEGER_PROGRAMMING;
  static readonly KNAPSACK_MIXED_INTEGER_PROGRAMMING = OptimizationProblemType.KNAPSACK_MIXED_INTEGER_PROGRAMMING;
  static readonly OPTIMAL = MPSolverResultStatus.OPTIMAL;
  static readonly FEASIBLE = MPSolverResultStatus.FEASIBLE;
  static readonly INFEASIBLE = MPSolverResultStatus.INFEASIBLE;
  static readonly UNBOUNDED = MPSolverResultStatus.UNBOUNDED;
  static readonly ABNORMAL = MPSolverResultStatus.ABNORMAL;
  static readonly MODEL_INVALID = MPSolverResultStatus.MODEL_INVALID;
  static readonly NOT_SOLVED = MPSolverResultStatus.NOT_SOLVED;
  static readonly FREE = BasisStatus.FREE;
  static readonly AT_LOWER_BOUND = BasisStatus.AT_LOWER_BOUND;
  static readonly AT_UPPER_BOUND = BasisStatus.AT_UPPER_BOUND;
  static readonly FIXED_VALUE = BasisStatus.FIXED_VALUE;
  static readonly BASIC = BasisStatus.BASIC;

  readonly ready: Promise<void> = Promise.resolve();
  private readonly backend: MPSolverBackend;
  private readonly objective: MPObjective;

  constructor(name: string, problemType: OptimizationProblemType);
  constructor(module: OrToolsWasmModule, exports: MpSolverExports, handle: number);
  constructor(
    nameOrModule: string | OrToolsWasmModule,
    problemTypeOrExports: OptimizationProblemType | MpSolverExports,
    maybeHandle?: number,
  ) {
    if (typeof nameOrModule === 'string') {
      this.backend = shouldUseSerializedMPSolverBackend()
        ? new SerializedMPSolverBackend(nameOrModule, problemTypeOrExports as OptimizationProblemType)
        : NativeMPSolverBackend.create(nameOrModule, problemTypeOrExports as OptimizationProblemType);
    } else {
      this.backend = new NativeMPSolverBackend(nameOrModule, problemTypeOrExports as MpSolverExports, maybeHandle ?? 0);
    }
    this.objective = new MPObjective(this.backend);
  }

  static CreateSolver(solverId: string): MPSolver | null {
    if (shouldUseSerializedMPSolverBackend()) {
      const problemType = workerParseSolverType(solverId);
      return problemType !== null && workerSupportsProblemType(problemType)
        ? new MPSolver(solverId, problemType)
        : null;
    }
    const backend = NativeMPSolverBackend.createSolver(solverId);
    if (!backend) return null;
    const solver = Object.create(MPSolver.prototype) as MPSolver;
    Object.defineProperty(solver, 'backend', { value: backend });
    Object.defineProperty(solver, 'objective', { value: new MPObjective(backend) });
    Object.defineProperty(solver, 'ready', { value: Promise.resolve() });
    return solver;
  }

  static Infinity(): number {
    return shouldUseSerializedMPSolverBackend() ? Number.POSITIVE_INFINITY : getMpSolverExports().solverInfinity();
  }

  static SupportsProblemType(problemType: OptimizationProblemType): boolean {
    return shouldUseSerializedMPSolverBackend()
      ? workerSupportsProblemType(problemType)
      : getMpSolverExports().solverSupportsProblemType(problemType) === 1;
  }

  static ParseSolverType(solverId: string): OptimizationProblemType | null {
    if (shouldUseSerializedMPSolverBackend()) {
      return workerParseSolverType(solverId);
    }
    const module = getMpSolverModule();
    const exports = getMpSolverExports();
    const problemType = withCString(module, solverId, (solverIdPtr) => {
      return exports.solverParseSolverType(solverIdPtr);
    });
    return problemType < 0 ? null : problemType;
  }

  static ParseAndCheckSupportForProblemType(solverId: string): OptimizationProblemType | null {
    const problemType = MPSolver.ParseSolverType(solverId);
    if (problemType === null) return null;
    return MPSolver.SupportsProblemType(problemType) ? problemType : null;
  }

  static setExecutor(configuration: ExecutorConfiguration): void {
    setMPSolverExecutor(configuration);
  }

  static getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
    return getLinearSolverSchemas();
  }

  static createModelRequest(request: MPSolverModelRequest): Promise<Uint8Array> {
    return encodeMPModelRequest(request);
  }

  static decodeSolutionResponse(bytes: Uint8Array): Promise<MPSolverSolutionResponse> {
    return decodeMPSolutionResponse(bytes);
  }

  static createSolutionResponse(response: MPSolverSolutionResponse): Promise<Uint8Array> {
    return encodeMPSolutionResponse(response);
  }

  static async solveModelRequest(
    request: Uint8Array | MPSolverModelRequest,
    options: Pick<MPSolverProtoSolveOptions, 'numThreads' | 'num_threads'> = {},
  ): Promise<MPSolverProtoSolveResult> {
    const requestBytes = request instanceof Uint8Array ? request : await encodeMPModelRequest(request);
    const bytes = await solveModelRequestBytes(requestBytes, options);
    return {
      bytes,
      response: await decodeMPSolutionResponse(bytes),
    };
  }

  Name(): string {
    return this.backend.name();
  }

  ProblemType(): OptimizationProblemType {
    return this.backend.problemType();
  }

  IsMip(): boolean {
    return this.IsMIP();
  }

  IsMIP(): boolean {
    return this.backend.isMip();
  }

  Clear(): void {
    this.backend.clear();
  }

  infinity(): number {
    return this.backend.infinity();
  }

  variable(index: number): MPVariable {
    return new MPVariable(this.backend, this.backend.variable(index));
  }

  variables(): MPVariable[] {
    return this.backend.variables().map((ref) => new MPVariable(this.backend, ref));
  }

  LookupVariableOrNull(name: string): MPVariable | null {
    const ref = this.backend.lookupVariable(name);
    return ref ? new MPVariable(this.backend, ref) : null;
  }

  LookupVariable(name: string): MPVariable | null {
    return this.LookupVariableOrNull(name);
  }

  Var(lb: number, ub: number, integer: boolean, name: string): MPVariable {
    return new MPVariable(this.backend, this.backend.addVariable(lb, ub, integer, name));
  }

  NumVar(lb: number, ub: number, name: string): MPVariable {
    return this.Var(lb, ub, false, name);
  }

  IntVar(lb: number, ub: number, name: string): MPVariable {
    return this.Var(lb, ub, true, name);
  }

  BoolVar(name: string): MPVariable {
    return this.Var(0, 1, true, name);
  }

  constraint(index: number): MPConstraint {
    return new MPConstraint(this.backend, this.backend.constraint(index));
  }

  constraints(): MPConstraint[] {
    return this.backend.constraints().map((ref) => new MPConstraint(this.backend, ref));
  }

  LookupConstraintOrNull(name: string): MPConstraint | null {
    const ref = this.backend.lookupConstraint(name);
    return ref ? new MPConstraint(this.backend, ref) : null;
  }

  LookupConstraint(name: string): MPConstraint | null {
    return this.LookupConstraintOrNull(name);
  }

  Constraint(): MPConstraint;
  Constraint(name: string): MPConstraint;
  Constraint(lb: number, ub: number, name?: string): MPConstraint;
  Constraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    const hasBounds = typeof lbOrName === 'number' && typeof ub === 'number';
    const constraintName = typeof lbOrName === 'string' ? lbOrName : name;
    return new MPConstraint(
      this.backend,
      this.backend.addConstraint(hasBounds ? lbOrName : null, hasBounds ? ub : null, constraintName),
    );
  }

  RowConstraint(): MPConstraint;
  RowConstraint(name: string): MPConstraint;
  RowConstraint(lb: number, ub: number, name?: string): MPConstraint;
  RowConstraint(lbOrName?: number | string, ub?: number, name = ''): MPConstraint {
    if (typeof lbOrName === 'number') {
      if (typeof ub !== 'number') throw new Error('MPSolver.RowConstraint: upper bound is required.');
      return this.Constraint(lbOrName, ub, name);
    }
    return this.Constraint(lbOrName ?? '');
  }

  Objective(): MPObjective {
    return this.objective;
  }

  async Solve(parameters?: MPSolverParameters): Promise<MPSolverResultStatus> {
    return this.backend.solve(parameters?.backend);
  }

  exportModelProto(): Promise<Uint8Array> {
    return this.backend.exportModelProto();
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    return this.backend.exportModelRequestProto(options);
  }

  async SolveWithProto(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult & { loaded: boolean }> {
    const requestBytes = await this.exportModelRequestProto(options);
    const result = await MPSolver.solveModelRequest(requestBytes, options);
    let loaded = false;
    if (options.loadSolution ?? true) {
      loaded = await this.LoadSolutionFromProto(result.bytes, options.tolerance);
    }
    return { ...result, loaded };
  }

  async LoadSolutionFromProto(
    response: Uint8Array | MPSolverSolutionResponse = {},
    tolerance = 1e-7,
  ): Promise<boolean> {
    return this.backend.loadSolutionFromProto(response, tolerance);
  }

  VerifySolution(tolerance: number, logErrors: boolean): boolean {
    return this.backend.verifySolution(tolerance, logErrors);
  }

  Reset(): void {
    this.backend.reset();
  }

  InterruptSolve(): boolean {
    return this.backend.interruptSolve();
  }

  NextSolution(): boolean {
    return this.backend.nextSolution();
  }

  EnableOutput(): void {
    this.backend.enableOutput();
  }

  SuppressOutput(): void {
    this.backend.suppressOutput();
  }

  OutputIsEnabled(): boolean {
    return this.backend.outputIsEnabled();
  }

  SetTimeLimit(milliseconds: number): void {
    this.set_time_limit(milliseconds);
  }

  set_time_limit(milliseconds: number): void {
    this.backend.setTimeLimit(milliseconds);
  }

  time_limit(): number {
    return this.backend.timeLimit();
  }

  SetNumThreads(numThreads: number): boolean {
    return this.backend.setNumThreads(numThreads);
  }

  GetNumThreads(): number {
    return this.backend.getNumThreads();
  }

  SetSolverSpecificParametersAsString(parameters: string): boolean {
    return this.backend.setSolverSpecificParametersAsString(parameters);
  }

  GetSolverSpecificParametersAsString(): string {
    return this.backend.getSolverSpecificParametersAsString();
  }

  SolverVersion(): string {
    return this.backend.solverVersion();
  }

  ComputeConstraintActivities(): number[] {
    return this.backend.computeConstraintActivities();
  }

  ComputeExactConditionNumber(): number {
    return this.backend.computeExactConditionNumber();
  }

  SetHint(variables: MPVariable[], values: number[]): void {
    if (variables.length !== values.length) {
      throw new Error(`MPSolver.SetHint: variable/value length mismatch (${variables.length} !== ${values.length}).`);
    }
    this.backend.setHint(variables.map((variable) => variable.ref), values);
  }

  ExportModelAsLpFormat(obfuscate: boolean): string {
    return this.backend.exportModelAsLpFormat(obfuscate);
  }

  ExportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string {
    return this.backend.exportModelAsMpsFormat(fixedFormat, obfuscate);
  }

  NumVariables(): number {
    return this.backend.numVariables();
  }

  NumConstraints(): number {
    return this.backend.numConstraints();
  }

  WallTime(): number {
    return this.backend.wallTime();
  }

  wall_time(): number {
    return this.WallTime();
  }

  Iterations(): number {
    return this.backend.iterations();
  }

  iterations(): number {
    return this.Iterations();
  }

  nodes(): number {
    return this.backend.nodes();
  }

  delete(): void {
    this.backend.delete();
  }
}
