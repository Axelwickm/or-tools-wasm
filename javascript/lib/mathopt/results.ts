import { type MathOptProtoInfeasibleSubsystemResult, decodeInfeasibleSubsystem } from './iis.js';
import type { MathOptModel } from './model.js';
import { decodeMathOptResponse } from './rpc_proto.js';
import type {
  MathOptProtoSolveResult, MathOptSolveResult, MathOptSolutionResult,
  MathOptPrimalSolutionResult, MathOptDualSolutionResult, MathOptPrimalRayResult,
  MathOptDualRayResult, MathOptBasisResult,
} from './types.js';
import { decodeMathOptSolveResult } from './result_proto.js';
import { toIndex } from '../int64.js';
import type { MathOptVariable } from './variable.js';
import type {
  math_opt_SolutionProto, math_opt_PrimalSolutionProto, math_opt_DualSolutionProto,
  math_opt_PrimalRayProto, math_opt_DualRayProto, math_opt_BasisProto,
} from '../generated/mathopt_result_types.js';

const terminationReasonNames: Record<number, string> = {
  0: 'TERMINATION_REASON_UNSPECIFIED',
  1: 'TERMINATION_REASON_OPTIMAL',
  2: 'TERMINATION_REASON_INFEASIBLE',
  3: 'TERMINATION_REASON_UNBOUNDED',
  4: 'TERMINATION_REASON_INFEASIBLE_OR_UNBOUNDED',
  5: 'TERMINATION_REASON_IMPRECISE',
  6: 'TERMINATION_REASON_NO_SOLUTION_FOUND',
  7: 'TERMINATION_REASON_NUMERICAL_ERROR',
  8: 'TERMINATION_REASON_OTHER_ERROR',
  9: 'TERMINATION_REASON_FEASIBLE',
};

const terminationLimitNames: Record<number, string> = {
  0: 'LIMIT_UNSPECIFIED',
  1: 'LIMIT_UNDETERMINED',
  2: 'LIMIT_ITERATION',
  3: 'LIMIT_TIME',
  4: 'LIMIT_NODE',
  5: 'LIMIT_SOLUTION',
  6: 'LIMIT_MEMORY',
  7: 'LIMIT_OBJECTIVE',
  8: 'LIMIT_NORM',
  9: 'LIMIT_INTERRUPTED',
  10: 'LIMIT_SLOW_PROGRESS',
  11: 'LIMIT_OTHER',
  12: 'LIMIT_CUTOFF',
};

const solutionStatusNames: Record<number, string> = {
  0: 'SOLUTION_STATUS_UNSPECIFIED',
  1: 'SOLUTION_STATUS_UNDETERMINED',
  2: 'SOLUTION_STATUS_FEASIBLE',
  3: 'SOLUTION_STATUS_INFEASIBLE',
};

const feasibilityStatusNames: Record<number, string> = {
  0: 'FEASIBILITY_STATUS_UNSPECIFIED',
  1: 'FEASIBILITY_STATUS_UNDETERMINED',
  2: 'FEASIBILITY_STATUS_FEASIBLE',
  3: 'FEASIBILITY_STATUS_INFEASIBLE',
};

const basisStatusNames: Record<number, string> = {
  0: 'BASIS_STATUS_UNSPECIFIED',
  1: 'BASIS_STATUS_FREE',
  2: 'BASIS_STATUS_AT_LOWER_BOUND',
  3: 'BASIS_STATUS_AT_UPPER_BOUND',
  4: 'BASIS_STATUS_FIXED_VALUE',
  5: 'BASIS_STATUS_BASIC',
};

export function decodeInfeasibleSubsystemResponse(bytes: Uint8Array): MathOptProtoInfeasibleSubsystemResult {
  const response = solveResponseParts(bytes, 'MathOpt IIS');
  return { bytes: new Uint8Array(response.resultBytes), response: decodeInfeasibleSubsystem(response.resultBytes), messages: response.messages };
}

type MathOptResultIds = { variables: Set<number>; constraints: Set<number>; quadratic: Set<number>; auxiliary: Set<number> };

export function captureResultIds(model: MathOptModel): MathOptResultIds {
  return {
    variables: new Set(model.variables().map(variable => variable.id)),
    constraints: new Set(model.linearConstraints().map(constraint => constraint.id)),
    quadratic: new Set(model.quadraticConstraints().map(constraint => constraint.id)),
    auxiliary: new Set(model.auxiliaryObjectives().map(objective => objective.id)),
  };
}

function assertResultId(ids: ReadonlySet<number>, id: number): void {
  if (!ids.has(id)) throw new RangeError(`MathOpt result contains unknown model ID ${id}.`);
}

function solveResponseParts(bytes: Uint8Array, label = 'MathOpt solve'): { resultBytes: Uint8Array; messages: string[] } {
  const response = decodeMathOptResponse(bytes, label);
  if (response.resultBytes === undefined) throw new Error(`${label} returned no result.`);
  return { resultBytes: response.resultBytes, messages: response.messages };
}

export function decodeProtoSolveResponse(bytes: Uint8Array): MathOptProtoSolveResult {
  const { resultBytes, messages } = solveResponseParts(bytes);
  return { bytes: new Uint8Array(resultBytes), response: decodeMathOptSolveResult(resultBytes), messages };
}

function enumLabel(value: number | string | undefined, names: Record<number, string>, prefix: string): string {
  return typeof value === 'string' ? value : names[value ?? 0] ?? `${prefix}_${value ?? 0}`;
}

function resultVector<T>(vector: { ids?: Array<number | bigint>; values?: T[] } | undefined,
    modelIds: ReadonlySet<number>): Record<number, T> {
  const ids = vector?.ids ?? [], values = vector?.values ?? [];
  if (ids.length !== values.length) throw new Error('MathOpt sparse vector has mismatched IDs and values.');
  return Object.fromEntries(ids.map((id, index) => {
    const key = toIndex(id, 'MathOpt result ID');
    assertResultId(modelIds, key);
    return [key, values[index]];
  }));
}

export function decodeSolveResponse(bytes: Uint8Array, model: MathOptModel, names: MathOptResultIds = captureResultIds(model)): MathOptSolveResult {
  const { resultBytes: input, messages } = solveResponseParts(bytes);
  const resultBytes = new Uint8Array(input);
  const result = decodeMathOptSolveResult(resultBytes, false);
  const stats = result.solveStats, termination = result.termination;
  const problemStatus = termination?.problemStatus ?? stats?.problemStatus;
  const duration = stats?.solveTime;
  const solveTimeSeconds = duration ? Number(duration.seconds ?? 0) + (duration.nanos ?? 0) / 1e9 : null;
  const solutions = (result.solutions ?? []).map(solution => decodeSolution(solution, names));
  const firstPrimalSolution = solutions.find(solution => solution.primalSolution?.feasibilityStatus === 'SOLUTION_STATUS_FEASIBLE')?.primalSolution ?? null;
  const answerValuesById = { ...(firstPrimalSolution?.variableValuesById ?? {}) };
  const limit = enumLabel(termination?.limit, terminationLimitNames, 'LIMIT');
  return {
    terminationReason: enumLabel(termination?.reason, terminationReasonNames, 'TERMINATION_REASON'),
    terminationLimit: limit === 'LIMIT_UNSPECIFIED' ? null : limit,
    terminationDetail: termination?.detail ?? '', solveTimeSeconds,
    solveStats: { solveTimeSeconds, simplexIterations: BigInt(stats?.simplexIterations ?? 0),
      barrierIterations: BigInt(stats?.barrierIterations ?? 0), firstOrderIterations: BigInt(stats?.firstOrderIterations ?? 0), nodeCount: BigInt(stats?.nodeCount ?? 0) },
    gscipSpecificOutput: result.gscipOutput ?? null, osqpSpecificOutput: result.osqpOutput ?? null,
    pdlpSpecificOutput: result.pdlpOutput ?? null,
    primalBound: termination?.objectiveBounds?.primalBound ?? (termination?.objectiveBounds ? 0 : stats?.bestPrimalBound ?? null),
    dualBound: termination?.objectiveBounds?.dualBound ?? (termination?.objectiveBounds ? 0 : stats?.bestDualBound ?? null),
    primalStatus: problemStatus ? enumLabel(problemStatus.primalStatus, feasibilityStatusNames, 'FEASIBILITY_STATUS') : null,
    dualStatus: problemStatus ? enumLabel(problemStatus.dualStatus, feasibilityStatusNames, 'FEASIBILITY_STATUS') : null,
    primalOrDualInfeasible: problemStatus?.primalOrDualInfeasible ?? false,
    objectiveValue: firstPrimalSolution?.objectiveValue ?? null, hasSolution: firstPrimalSolution !== null,
    value(variable: MathOptVariable): number {
      if (!firstPrimalSolution) throw new Error('Solve result has no feasible solution.');
      if (variable.model !== model) throw new Error('Variable belongs to a different MathOpt model.');
      const value = answerValuesById[variable.id];
      if (value === undefined) throw new Error('Solve result has no value for this variable.');
      return value;
    },
    variableValuesById: firstPrimalSolution?.variableValuesById ?? {},
    solutions, primalRays: (result.primalRays ?? []).map(ray => decodePrimalRay(ray, names)),
    dualRays: (result.dualRays ?? []).map(ray => decodeDualRay(ray, names)), messages,
    rawResponse: new Uint8Array(bytes), toProtoBytes: () => new Uint8Array(resultBytes),
  };
}

function decodeSolution(solution: math_opt_SolutionProto, model: MathOptResultIds): MathOptSolutionResult {
  return { primalSolution: solution.primalSolution ? decodePrimalSolution(solution.primalSolution, model) : null,
    dualSolution: solution.dualSolution ? decodeDualSolution(solution.dualSolution, model) : null,
    basis: solution.basis ? decodeBasis(solution.basis, model) : null };
}

function decodePrimalSolution(primal: math_opt_PrimalSolutionProto, model: MathOptResultIds): MathOptPrimalSolutionResult {
  const values = resultVector(primal.variableValues, model.variables);
  const auxiliary = Object.entries(primal.auxiliaryObjectiveValues ?? {}).map(([id, value]) => {
    const key = toIndex(BigInt(id), 'MathOpt auxiliary objective ID');
    assertResultId(model.auxiliary, key);
    return [key, value];
  });
  return { objectiveValue: primal.objectiveValue ?? 0, variableValuesById: values,
    auxiliaryObjectiveValuesById: Object.fromEntries(auxiliary),
    feasibilityStatus: enumLabel(primal.feasibilityStatus, solutionStatusNames, 'SOLUTION_STATUS') };
}

function decodeDualSolution(dual: math_opt_DualSolutionProto, model: MathOptResultIds): MathOptDualSolutionResult {
  const values = resultVector(dual.dualValues, model.constraints);
  const reduced = resultVector(dual.reducedCosts, model.variables);
  const quadratic = resultVector(dual.quadraticDualValues, model.quadratic);
  return { objectiveValue: dual.objectiveValue ?? null, dualValuesById: values,
    quadraticDualValuesById: quadratic,
    reducedCostsById: reduced,
    feasibilityStatus: enumLabel(dual.feasibilityStatus, solutionStatusNames, 'SOLUTION_STATUS') };
}

function decodePrimalRay(ray: math_opt_PrimalRayProto, model: MathOptResultIds): MathOptPrimalRayResult {
  const values = resultVector(ray.variableValues, model.variables);
  return { variableValuesById: values };
}

function decodeDualRay(ray: math_opt_DualRayProto, model: MathOptResultIds): MathOptDualRayResult {
  const values = resultVector(ray.dualValues, model.constraints);
  const reduced = resultVector(ray.reducedCosts, model.variables);
  return { dualValuesById: values, reducedCostsById: reduced };
}

function decodeBasis(basis: math_opt_BasisProto, model: MathOptResultIds): MathOptBasisResult {
  const convert = (vector: math_opt_BasisProto['variableStatus']) => ({ ids: vector?.ids,
    values: vector?.values?.map(value => enumLabel(value, basisStatusNames, 'BASIS_STATUS')) });
  const variables = resultVector(convert(basis.variableStatus), model.variables);
  const constraints = resultVector(convert(basis.constraintStatus), model.constraints);
  return { variableStatusById: variables,
    constraintStatusById: constraints,
    basicDualFeasibility: enumLabel(basis.basicDualFeasibility, solutionStatusNames, 'SOLUTION_STATUS') };
}
