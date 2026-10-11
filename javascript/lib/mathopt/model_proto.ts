import * as protobuf from 'protobufjs';
import { mathOptModelDescriptor } from '../generated/mathopt_model_schemas.js';
import type { math_opt_ModelProto, math_opt_ModelUpdateProto, math_opt_ObjectiveProto, math_opt_SparseDoubleVectorProto, math_opt_SparseDoubleMatrixProto } from '../generated/mathopt_model_types.js';
import { decodeProtobufWithExactLongs, encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';
import { toIndex, toInt64 } from '../int64.js';

export type MathOptModelProto = math_opt_ModelProto;
export type MathOptModelUpdateProto = math_opt_ModelUpdateProto;
export type ImportedLinearTerm = { variableId: number; coefficient: number };
export type ImportedQuadraticTerm = { firstVariableId: number; secondVariableId: number; coefficient: number };
type ImportedBounds = { id: number; lowerBound: number; upperBound: number; name: string };
type ImportedObjective = { maximize: boolean; offset: number; name: string; priority: bigint;
  linearTerms: ImportedLinearTerm[]; quadraticTerms: ImportedQuadraticTerm[] };
export type ImportedMathOptModel = {
  name: string;
  variables: Array<ImportedBounds & { integer: boolean }>;
  linearConstraints: Array<ImportedBounds & { terms: ImportedLinearTerm[] }>;
  objective: ImportedObjective;
  auxiliaryObjectives: Array<ImportedObjective & { id: number }>;
  quadraticConstraints: Array<ImportedBounds & { linearTerms: ImportedLinearTerm[]; quadraticTerms: ImportedQuadraticTerm[] }>;
  indicatorConstraints: Array<ImportedBounds & { indicatorId?: number; activateOnZero: boolean; terms: ImportedLinearTerm[] }>;
};

let modelType: protobuf.Type | undefined;
let updateType: protobuf.Type | undefined;
function schema(): protobuf.Type {
  return modelType ??= protobuf.Root.fromJSON(mathOptModelDescriptor).resolveAll().lookupType('operations_research.math_opt.ModelProto');
}
export function encodeMathOptModelProto(input: Uint8Array | MathOptModelProto): Uint8Array {
  return encodeProto(input, schema(), 'model');
}
export function encodeMathOptModelUpdateProto(input: Uint8Array | MathOptModelUpdateProto): Uint8Array {
  updateType ??= protobuf.Root.fromJSON(mathOptModelDescriptor).resolveAll().lookupType('operations_research.math_opt.ModelUpdateProto');
  return encodeProto(input, updateType, 'model update');
}
function encodeProto(input: Uint8Array | object, type: protobuf.Type, label: string): Uint8Array {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  const value = encodeProtobufBigInts(normalizeProtobufInput(input, type), type) as Record<string, unknown>;
  const error = type.verify(value); if (error) throw new Error(`Invalid MathOpt ${label}: ${error}`);
  return type.encode(type.create(value)).finish();
}
export function decodeMathOptModelProto(bytes: Uint8Array): MathOptModelProto {
  return decodeProtobufWithExactLongs<MathOptModelProto>(schema(), bytes);
}
function modelId(value: number | bigint | string, label = 'MathOpt imported ID'): number {
  return toIndex(typeof value === 'string' ? BigInt(value) : value, label, Number.MAX_SAFE_INTEGER - 1);
}
function linearTerms(value: math_opt_SparseDoubleVectorProto | undefined, label: string): ImportedLinearTerm[] {
  const ids = (value?.ids ?? []).map(id => modelId(id, label)), coefficients = value?.values ?? [];
  return ids.map((variableId, index) => ({ variableId, coefficient: coefficients[index] }));
}
function matrix(value: math_opt_SparseDoubleMatrixProto | undefined) {
  const rowIds = (value?.rowIds ?? []).map(id => modelId(id)), columnIds = (value?.columnIds ?? []).map(id => modelId(id));
  const coefficients = value?.coefficients ?? [];
  return rowIds.map((rowId, index) => ({ rowId, columnId: columnIds[index], coefficient: coefficients[index] }));
}
function quadraticTerms(value: math_opt_SparseDoubleMatrixProto | undefined): ImportedQuadraticTerm[] {
  return matrix(value).map(({ rowId, columnId, coefficient }) =>
    ({ firstVariableId: rowId, secondVariableId: columnId, coefficient }));
}
function objectiveData(value: math_opt_ObjectiveProto = {}): ImportedObjective {
  const priority = value.priority ?? 0;
  return { maximize: value.maximize ?? false, offset: value.offset ?? 0, name: value.name ?? '',
    priority: toInt64(typeof priority === 'string' ? BigInt(priority) : priority, 'Objective priority'),
    linearTerms: linearTerms(value.linearCoefficients, 'Objective linear coefficients'),
    quadraticTerms: quadraticTerms(value.quadraticCoefficients) };
}
function constraintData<T extends { name?: string; lowerBound?: number; upperBound?: number }>(values: Record<string, T> = {}) {
  const entries = Object.entries(values).map(([key, data]) => ({ id: modelId(key), data, name: data.name ?? '',
    lowerBound: data.lowerBound ?? 0, upperBound: data.upperBound ?? 0 })).sort((a, b) => a.id - b.id);
  return entries;
}

/** Map a natively validated proto into editable model records. */
export function decodeMathOptModel(input: Uint8Array | MathOptModelProto): ImportedMathOptModel {
  const type = schema();
  const bytes = encodeMathOptModelProto(input);
  // Preserve optional indicator presence and exact IDs before range checking.
  const model = type.toObject(type.decode(bytes), { longs: String, arrays: true, objects: true }) as MathOptModelProto;
  for (const field of ['secondOrderConeConstraints', 'sos1Constraints', 'sos2Constraints'] as const) {
    if (Object.keys(model[field] ?? {}).length > 0) throw new Error(`MathOpt editable model import does not support ${field}.`);
  }
  const variableProto = model.variables ?? {}, rowProto = model.linearConstraints ?? {}, objectiveProto = model.objective ?? {};
  const variableIds = (variableProto.ids ?? []).map(id => modelId(id, 'Variable ID')), rowIds = (rowProto.ids ?? []).map(id => modelId(id, 'Linear constraint ID'));
  const variableLower = variableProto.lowerBounds ?? [], variableUpper = variableProto.upperBounds ?? [], integers = variableProto.integers ?? [];
  const rowLower = rowProto.lowerBounds ?? [], rowUpper = rowProto.upperBounds ?? [];
  const variables = variableIds.map((id, index) => ({ id, lowerBound: variableLower[index], upperBound: variableUpper[index], integer: integers[index], name: variableProto.names?.[index] ?? '' }));
  const termsByRow = new Map<number, ImportedLinearTerm[]>();
  for (const entry of matrix(model.linearConstraintMatrix)) {
    const terms = termsByRow.get(entry.rowId) ?? [];
    terms.push({ variableId: entry.columnId, coefficient: entry.coefficient }); termsByRow.set(entry.rowId, terms);
  }
  const linearConstraints = rowIds.map((id, index) => ({ id, lowerBound: rowLower[index], upperBound: rowUpper[index], name: rowProto.names?.[index] ?? '', terms: termsByRow.get(id) ?? [] }));
  const objective = objectiveData(objectiveProto);
  const auxiliaryObjectives = Object.entries(model.auxiliaryObjectives ?? {}).map(([id, value]) =>
    ({ id: modelId(id, 'Auxiliary objective ID'), ...objectiveData(value) })).sort((a, b) => a.id - b.id);
  const quadraticConstraints = constraintData(model.quadraticConstraints).map(({ data, ...bounds }) => ({ ...bounds,
    linearTerms: linearTerms(data.linearTerms, 'Quadratic linear terms'),
    quadraticTerms: quadraticTerms(data.quadraticTerms) }));
  const indicatorConstraints = constraintData(model.indicatorConstraints).map(({ data, ...bounds }) => {
    const indicatorId = data.indicatorId === undefined ? undefined : modelId(data.indicatorId);
    return { ...bounds, indicatorId, activateOnZero: data.activateOnZero ?? false, terms: linearTerms(data.expression, 'Indicator expression') };
  });
  return { name: model.name ?? '', variables, linearConstraints, objective, auxiliaryObjectives, quadraticConstraints, indicatorConstraints };
}
