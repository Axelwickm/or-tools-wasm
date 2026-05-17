import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';
import { loadRuntimeAsyncify } from './runtime_loader.js';
import type { WorkerResponse } from './worker_protocol.js';
import {
  nextWorkerBridgeRequestId,
  postWorkerRequest,
  shouldUseWorkerBridge,
} from './worker_bridge.js';
import * as protobufModule from 'protobufjs';

let mpSolverModulePromise: Promise<MainModule> | null = null;
let mpSolverModule: MainModule | null = null;
let mpSolverExports: MpSolverExports | null = null;

type CReturn = 'number' | 'bigint' | undefined;
type CArg = 'number' | 'bigint';

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
  solverSolve(solverHandle: number): MPSolverResultStatus;
  solverSolveWithParameters(solverHandle: number, parametersHandle: number): MPSolverResultStatus;
  solverExportModelProto(solverHandle: number, lenPtr: number): number;
  solverExportModelRequestProto(
    solverHandle: number,
    solverType: number,
    timeLimitSeconds: number,
    enableOutput: number,
    solverSpecificParametersPtr: number,
    lenPtr: number,
  ): number;
  solverSolveModelRequest(requestPtr: number, requestLength: number, lenPtr: number): number;
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
  module: MainModule,
  name: string,
  returnType: CReturn,
  argTypes: CArg[],
): T {
  return module.cwrap(name, returnType, argTypes) as T;
}

function createMpSolverExports(module: MainModule): MpSolverExports {
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
    solverSolve: wrap(module, 'mp_solver_solve', 'number', ['number']),
    solverSolveWithParameters: wrap(module, 'mp_solver_solve_with_parameters', 'number', ['number', 'number']),
    solverExportModelProto: wrap(module, 'mp_solver_export_model_proto', 'number', ['number', 'number']),
    solverExportModelRequestProto: wrap(module, 'mp_solver_export_model_request_proto', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
    solverSolveModelRequest: wrap(module, 'mp_solver_solve_model_request', 'number', ['number', 'number', 'number']),
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

async function loadMpSolverModule(): Promise<MainModule> {
  mpSolverModulePromise ??= loadRuntimeAsyncify();
  mpSolverModule = await mpSolverModulePromise;
  mpSolverExports ??= createMpSolverExports(mpSolverModule);
  return mpSolverModule;
}

function getMpSolverModule(): MainModule {
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

function withCString<T>(module: MainModule, value: string, fn: (ptr: number) => T): T {
  const bytes = stringBytes(value);
  const ptr = module._malloc(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  try {
    return fn(ptr);
  } finally {
    module._free(ptr);
  }
}

function readUint32LE(buffer: ArrayBuffer, ptr: number) {
  return new DataView(buffer, ptr, 4).getUint32(0, true);
}

function copyBytesToHeap(module: MainModule, bytes: Uint8Array | null) {
  if (!bytes?.length) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

async function readNativeBytes(
  module: MainModule,
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
};

type ProtobufRoot = import('protobufjs').Root;
type ProtobufType = import('protobufjs').Type;

let linearSolverSchemasPromise: Promise<LinearSolverSchemas> | null = null;
let linearSolverRootPromise: Promise<ProtobufRoot> | null = null;
let mpModelRequestTypePromise: Promise<ProtobufType> | null = null;
let mpSolutionResponseTypePromise: Promise<ProtobufType> | null = null;

async function getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
  linearSolverSchemasPromise ??= (async () => {
    if (shouldUseWorkerBridge()) {
      const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'schemaResult' }>>({
        type: 'getSchemas',
        id: nextWorkerBridgeRequestId(),
      });
      return {
        linear_solver: response.schemas.linear_solver,
        optional_boolean: response.schemas.optional_boolean,
      };
    }
    const module = await loadMpSolverModule();
    return {
      linear_solver: module.ccall('get_linear_solver_schema', 'string', [], []) as string,
      optional_boolean: module.ccall('get_optional_boolean_schema', 'string', [], []) as string,
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

async function solveModelRequestDirect(requestBytes: Uint8Array): Promise<Uint8Array> {
  const module = await loadMpSolverModule();
  const exports = getMpSolverExports();
  const requestPtr = copyBytesToHeap(module, requestBytes);
  try {
    return readNativeBytes(module, (lenPtr) => {
      return exports.solverSolveModelRequest(requestPtr, requestBytes.length, lenPtr);
    });
  } finally {
    if (requestPtr) module._free(requestPtr);
  }
}

async function solveModelRequestBytes(requestBytes: Uint8Array): Promise<Uint8Array> {
  if (shouldUseWorkerBridge()) {
    const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'mpSolverSolveResult' }>>({
      type: 'mpSolverSolve',
      id: nextWorkerBridgeRequestId(),
      requestBytes,
    });
    return new Uint8Array(response.bytes);
  }
  return solveModelRequestDirect(requestBytes);
}

function readCString(module: MainModule, ptr: number): string {
  return ptr === 0 ? '' : module.UTF8ToString(ptr);
}

export async function initMPSolver(): Promise<void> {
  await loadMpSolverModule();
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

export class MPVariable {
  constructor(
    private readonly exports: MpSolverExports,
    readonly nativeHandle: number,
    private readonly displayName: string,
  ) {}

  SolutionValue(): number {
    return this.solution_value();
  }

  solution_value(): number {
    return this.exports.variableSolutionValue(this.nativeHandle);
  }

  unrounded_solution_value(): number {
    return this.exports.variableUnroundedSolutionValue(this.nativeHandle);
  }

  ReducedCost(): number {
    return this.reduced_cost();
  }

  reduced_cost(): number {
    return this.exports.variableReducedCost(this.nativeHandle);
  }

  basis_status(): BasisStatus {
    return this.exports.variableBasisStatus(this.nativeHandle);
  }

  index(): number {
    return this.exports.variableIndex(this.nativeHandle);
  }

  name(): string {
    return readCString(getMpSolverModule(), this.exports.variableName(this.nativeHandle));
  }

  Lb(): number {
    return this.exports.variableLb(this.nativeHandle);
  }

  Ub(): number {
    return this.exports.variableUb(this.nativeHandle);
  }

  SetBounds(lb: number, ub: number): void {
    this.exports.variableSetBounds(this.nativeHandle, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.exports.variableSetLb(this.nativeHandle, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.exports.variableSetUb(this.nativeHandle, ub);
  }

  Integer(): boolean {
    return this.exports.variableInteger(this.nativeHandle) === 1;
  }

  SetInteger(integer: boolean): void {
    this.exports.variableSetInteger(this.nativeHandle, integer ? 1 : 0);
  }

  branching_priority(): number {
    return this.exports.variableBranchingPriority(this.nativeHandle);
  }

  SetBranchingPriority(priority: number): void {
    this.exports.variableSetBranchingPriority(this.nativeHandle, priority);
  }

  toString(): string {
    return this.displayName || this.name();
  }
}

export class MPConstraint {
  constructor(
    private readonly exports: MpSolverExports,
    readonly nativeHandle: number,
    private readonly displayName: string,
  ) {}

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.exports.constraintSetCoefficient(this.nativeHandle, variable.nativeHandle, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.exports.constraintGetCoefficient(this.nativeHandle, variable.nativeHandle);
  }

  Clear(): void {
    this.exports.constraintClear(this.nativeHandle);
  }

  index(): number {
    return this.exports.constraintIndex(this.nativeHandle);
  }

  name(): string {
    return readCString(getMpSolverModule(), this.exports.constraintName(this.nativeHandle));
  }

  Lb(): number {
    return this.exports.constraintLb(this.nativeHandle);
  }

  Ub(): number {
    return this.exports.constraintUb(this.nativeHandle);
  }

  SetBounds(lb: number, ub: number): void {
    this.exports.constraintSetBounds(this.nativeHandle, lb, ub);
  }

  SetLb(lb: number): void {
    this.SetLB(lb);
  }

  SetLB(lb: number): void {
    this.exports.constraintSetLb(this.nativeHandle, lb);
  }

  SetUb(ub: number): void {
    this.SetUB(ub);
  }

  SetUB(ub: number): void {
    this.exports.constraintSetUb(this.nativeHandle, ub);
  }

  DualValue(): number {
    return this.dual_value();
  }

  dual_value(): number {
    return this.exports.constraintDualValue(this.nativeHandle);
  }

  basis_status(): BasisStatus {
    return this.exports.constraintBasisStatus(this.nativeHandle);
  }

  is_lazy(): boolean {
    return this.exports.constraintIsLazy(this.nativeHandle) === 1;
  }

  set_is_lazy(laziness: boolean): void {
    this.exports.constraintSetIsLazy(this.nativeHandle, laziness ? 1 : 0);
  }
}

export class MPObjective {
  constructor(
    private readonly exports: MpSolverExports,
    private readonly solverHandle: number,
  ) {}

  Clear(): void {
    this.exports.objectiveClear(this.solverHandle);
  }

  SetCoefficient(variable: MPVariable, coefficient: number): void {
    this.exports.objectiveSetCoefficient(this.solverHandle, variable.nativeHandle, coefficient);
  }

  GetCoefficient(variable: MPVariable): number {
    return this.exports.objectiveGetCoefficient(this.solverHandle, variable.nativeHandle);
  }

  SetOffset(offset: number): void {
    this.exports.objectiveSetOffset(this.solverHandle, offset);
  }

  AddOffset(offset: number): void {
    this.exports.objectiveAddOffset(this.solverHandle, offset);
  }

  Offset(): number {
    return this.offset();
  }

  offset(): number {
    return this.exports.objectiveOffset(this.solverHandle);
  }

  SetOptimizationDirection(maximize: boolean): void {
    this.exports.objectiveSetOptimizationDirection(this.solverHandle, maximize ? 1 : 0);
  }

  SetMinimization(): void {
    this.exports.objectiveSetMinimization(this.solverHandle);
  }

  SetMaximization(): void {
    this.exports.objectiveSetMaximization(this.solverHandle);
  }

  Value(): number {
    return this.exports.objectiveValue(this.solverHandle);
  }

  BestBound(): number {
    return this.exports.objectiveBestBound(this.solverHandle);
  }

  maximization(): boolean {
    return this.exports.objectiveMaximization(this.solverHandle) === 1;
  }

  minimization(): boolean {
    return this.exports.objectiveMinimization(this.solverHandle) === 1;
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

  private readonly exports: MpSolverExports;
  private handle = 0;

  constructor() {
    this.exports = getMpSolverExports();
    this.handle = this.exports.parametersCreate();
    if (this.handle === 0) {
      throw new Error('MPSolverParameters: failed to create parameters.');
    }
  }

  get nativeHandle(): number {
    return this.handle;
  }

  SetDoubleParam(param: DoubleParam, value: number): void {
    this.exports.parametersSetDoubleParam(this.handle, param, value);
  }

  GetDoubleParam(param: DoubleParam): number {
    return this.exports.parametersGetDoubleParam(this.handle, param);
  }

  ResetDoubleParam(param: DoubleParam): void {
    this.exports.parametersResetDoubleParam(this.handle, param);
  }

  SetIntegerParam(param: IntegerParam, value: number): void {
    this.exports.parametersSetIntegerParam(this.handle, param, value);
  }

  GetIntegerParam(param: IntegerParam): number {
    return this.exports.parametersGetIntegerParam(this.handle, param);
  }

  ResetIntegerParam(param: IntegerParam): void {
    this.exports.parametersResetIntegerParam(this.handle, param);
  }

  Reset(): void {
    this.exports.parametersReset(this.handle);
  }

  delete(): void {
    if (this.handle !== 0) {
      this.exports.parametersDelete(this.handle);
      this.handle = 0;
    }
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
  private readonly module: MainModule;
  private readonly exports: MpSolverExports;
  private handle = 0;
  private readonly objective: MPObjective;

  constructor(name: string, problemType: OptimizationProblemType);
  constructor(module: MainModule, exports: MpSolverExports, handle: number);
  constructor(
    nameOrModule: string | MainModule,
    problemTypeOrExports: OptimizationProblemType | MpSolverExports,
    maybeHandle?: number,
  ) {
    if (typeof nameOrModule === 'string') {
      this.module = getMpSolverModule();
      this.exports = getMpSolverExports();
      this.handle = withCString(this.module, nameOrModule, (namePtr) => {
        return this.exports.solverCreate(namePtr, problemTypeOrExports as OptimizationProblemType);
      });
    } else {
      this.module = nameOrModule;
      this.exports = problemTypeOrExports as MpSolverExports;
      this.handle = maybeHandle ?? 0;
    }
    if (this.handle === 0) {
      throw new Error('MPSolver: failed to create solver.');
    }
    this.objective = new MPObjective(this.exports, this.handle);
  }

  static CreateSolver(solverId: string): MPSolver | null {
    const module = getMpSolverModule();
    const exports = getMpSolverExports();
    const handle = withCString(module, solverId, (solverIdPtr) => {
      return exports.solverCreateSolver(solverIdPtr);
    });
    if (handle === 0) return null;
    return new MPSolver(module, exports, handle);
  }

  static Infinity(): number {
    return getMpSolverExports().solverInfinity();
  }

  static SupportsProblemType(problemType: OptimizationProblemType): boolean {
    return getMpSolverExports().solverSupportsProblemType(problemType) === 1;
  }

  static ParseSolverType(solverId: string): OptimizationProblemType | null {
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

  static getLinearSolverSchemas(): Promise<LinearSolverSchemas> {
    return getLinearSolverSchemas();
  }

  static createModelRequest(request: MPSolverModelRequest): Promise<Uint8Array> {
    return encodeMPModelRequest(request);
  }

  static decodeSolutionResponse(bytes: Uint8Array): Promise<MPSolverSolutionResponse> {
    return decodeMPSolutionResponse(bytes);
  }

  static async solveModelRequest(request: Uint8Array | MPSolverModelRequest): Promise<MPSolverProtoSolveResult> {
    const requestBytes = request instanceof Uint8Array ? request : await encodeMPModelRequest(request);
    const bytes = await solveModelRequestBytes(requestBytes);
    return {
      bytes,
      response: await decodeMPSolutionResponse(bytes),
    };
  }

  Name(): string {
    return readCString(this.module, this.exports.solverName(this.handle));
  }

  ProblemType(): OptimizationProblemType {
    return this.exports.solverProblemType(this.handle);
  }

  IsMip(): boolean {
    return this.IsMIP();
  }

  IsMIP(): boolean {
    return this.exports.solverIsMip(this.handle) === 1;
  }

  Clear(): void {
    this.exports.solverClear(this.handle);
  }

  infinity(): number {
    return this.exports.solverInfinity();
  }

  variable(index: number): MPVariable {
    const handle = this.exports.solverVariable(this.handle, index);
    if (handle === 0) throw new Error(`MPSolver.variable: no variable at index ${index}.`);
    return new MPVariable(this.exports, handle, '');
  }

  variables(): MPVariable[] {
    return Array.from({ length: this.NumVariables() }, (_, index) => this.variable(index));
  }

  LookupVariableOrNull(name: string): MPVariable | null {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverLookupVariable(this.handle, namePtr);
    });
    return handle === 0 ? null : new MPVariable(this.exports, handle, name);
  }

  LookupVariable(name: string): MPVariable | null {
    return this.LookupVariableOrNull(name);
  }

  Var(lb: number, ub: number, integer: boolean, name: string): MPVariable {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverVar(this.handle, lb, ub, integer ? 1 : 0, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.Var: failed to create variable '${name}'.`);
    return new MPVariable(this.exports, handle, name);
  }

  NumVar(lb: number, ub: number, name: string): MPVariable {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverNumVar(this.handle, lb, ub, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.NumVar: failed to create variable '${name}'.`);
    return new MPVariable(this.exports, handle, name);
  }

  IntVar(lb: number, ub: number, name: string): MPVariable {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverIntVar(this.handle, lb, ub, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.IntVar: failed to create variable '${name}'.`);
    return new MPVariable(this.exports, handle, name);
  }

  BoolVar(name: string): MPVariable {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverBoolVar(this.handle, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.BoolVar: failed to create variable '${name}'.`);
    return new MPVariable(this.exports, handle, name);
  }

  constraint(index: number): MPConstraint {
    const handle = this.exports.solverConstraint(this.handle, index);
    if (handle === 0) throw new Error(`MPSolver.constraint: no constraint at index ${index}.`);
    return new MPConstraint(this.exports, handle, '');
  }

  constraints(): MPConstraint[] {
    return Array.from({ length: this.NumConstraints() }, (_, index) => this.constraint(index));
  }

  LookupConstraintOrNull(name: string): MPConstraint | null {
    const handle = withCString(this.module, name, (namePtr) => {
      return this.exports.solverLookupConstraint(this.handle, namePtr);
    });
    return handle === 0 ? null : new MPConstraint(this.exports, handle, name);
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
    const handle = withCString(this.module, constraintName, (namePtr) => {
      if (!hasBounds) {
        return this.exports.solverUnboundedRowConstraint(this.handle, namePtr);
      }
      return this.exports.solverRowConstraint(this.handle, lbOrName, ub, namePtr);
    });
    if (handle === 0) throw new Error(`MPSolver.Constraint: failed to create constraint '${constraintName}'.`);
    return new MPConstraint(this.exports, handle, constraintName);
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

  Solve(parameters?: MPSolverParameters): MPSolverResultStatus {
    if (parameters) {
      return this.exports.solverSolveWithParameters(this.handle, parameters.nativeHandle);
    }
    return this.exports.solverSolve(this.handle);
  }

  exportModelProto(): Promise<Uint8Array> {
    return readNativeBytes(this.module, (lenPtr) => this.exports.solverExportModelProto(this.handle, lenPtr));
  }

  exportModelRequestProto(options: MPSolverProtoSolveOptions = {}): Promise<Uint8Array> {
    const solverType = options.solverType ?? this.ProblemType();
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

  async SolveWithProto(options: MPSolverProtoSolveOptions = {}): Promise<MPSolverProtoSolveResult & { loaded: boolean }> {
    const requestBytes = await this.exportModelRequestProto(options);
    const result = await MPSolver.solveModelRequest(requestBytes);
    let loaded = false;
    if (options.loadSolution ?? true) {
      const responsePtr = copyBytesToHeap(this.module, result.bytes);
      try {
        loaded = this.exports.solverLoadSolutionProto(
          this.handle,
          responsePtr,
          result.bytes.length,
          options.tolerance ?? 1e-7,
        ) === 1;
      } finally {
        if (responsePtr) this.module._free(responsePtr);
      }
    }
    return { ...result, loaded };
  }

  VerifySolution(tolerance: number, logErrors: boolean): boolean {
    return this.exports.solverVerifySolution(this.handle, tolerance, logErrors ? 1 : 0) === 1;
  }

  Reset(): void {
    this.exports.solverReset(this.handle);
  }

  InterruptSolve(): boolean {
    return this.exports.solverInterruptSolve(this.handle) === 1;
  }

  NextSolution(): boolean {
    return this.exports.solverNextSolution(this.handle) === 1;
  }

  EnableOutput(): void {
    this.exports.solverEnableOutput(this.handle);
  }

  SuppressOutput(): void {
    this.exports.solverSuppressOutput(this.handle);
  }

  OutputIsEnabled(): boolean {
    return this.exports.solverOutputIsEnabled(this.handle) === 1;
  }

  SetTimeLimit(milliseconds: number): void {
    this.set_time_limit(milliseconds);
  }

  set_time_limit(milliseconds: number): void {
    this.exports.solverSetTimeLimit(this.handle, BigInt(Math.trunc(milliseconds)));
  }

  time_limit(): number {
    return toNumber(this.exports.solverTimeLimit(this.handle));
  }

  SetNumThreads(numThreads: number): boolean {
    return this.exports.solverSetNumThreads(this.handle, numThreads) === 1;
  }

  GetNumThreads(): number {
    return this.exports.solverGetNumThreads(this.handle);
  }

  SetSolverSpecificParametersAsString(parameters: string): boolean {
    return withCString(this.module, parameters, (parametersPtr) => {
      return this.exports.solverSetSolverSpecificParametersAsString(this.handle, parametersPtr) === 1;
    });
  }

  GetSolverSpecificParametersAsString(): string {
    this.exports.solverGetSolverSpecificParametersAsString(this.handle);
    return readCString(this.module, this.exports.lastStringResult());
  }

  SolverVersion(): string {
    return readCString(this.module, this.exports.solverSolverVersion(this.handle));
  }

  ComputeConstraintActivities(): number[] {
    return Array.from({ length: this.NumConstraints() }, (_, index) => {
      return this.exports.solverConstraintActivity(this.handle, index);
    });
  }

  ComputeExactConditionNumber(): number {
    return this.exports.solverComputeExactConditionNumber(this.handle);
  }

  SetHint(variables: MPVariable[], values: number[]): void {
    if (variables.length !== values.length) {
      throw new Error(`MPSolver.SetHint: variable/value length mismatch (${variables.length} !== ${values.length}).`);
    }
    const variableBytes = variables.length * Int32Array.BYTES_PER_ELEMENT;
    const valueBytes = values.length * Float64Array.BYTES_PER_ELEMENT;
    const variablePtr = this.module._malloc(variableBytes);
    const valuePtr = this.module._malloc(valueBytes);
    try {
      const variableView = new Int32Array(this.module.HEAPU8.buffer, variablePtr, variables.length);
      const valueView = new Float64Array(this.module.HEAPU8.buffer, valuePtr, values.length);
      variableView.set(variables.map((variable) => variable.nativeHandle));
      valueView.set(values);
      this.exports.solverSetHint(this.handle, variablePtr, valuePtr, variables.length);
    } finally {
      this.module._free(variablePtr);
      this.module._free(valuePtr);
    }
  }

  ExportModelAsLpFormat(obfuscate: boolean): string {
    this.exports.solverExportModelAsLpFormat(this.handle, obfuscate ? 1 : 0);
    return readCString(this.module, this.exports.lastStringResult());
  }

  ExportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string {
    this.exports.solverExportModelAsMpsFormat(this.handle, fixedFormat ? 1 : 0, obfuscate ? 1 : 0);
    return readCString(this.module, this.exports.lastStringResult());
  }

  NumVariables(): number {
    return this.exports.solverNumVariables(this.handle);
  }

  NumConstraints(): number {
    return this.exports.solverNumConstraints(this.handle);
  }

  WallTime(): number {
    return toNumber(this.exports.solverWallTime(this.handle));
  }

  wall_time(): number {
    return this.WallTime();
  }

  Iterations(): number {
    return toNumber(this.exports.solverIterations(this.handle));
  }

  iterations(): number {
    return this.Iterations();
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
