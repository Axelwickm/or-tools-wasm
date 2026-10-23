// Plain model snapshots, change detection and schema serialization.
// This module does not read handles, mutable model storage or executors.
import type * as ModelProto from '../generated/mathopt_model_types.js';
import {
  type ImportedLinearTerm, type MathOptModelUpdateProto, encodeMathOptModelUpdateProto, type MathOptModelProto,
  encodeMathOptModelProto, type ImportedQuadraticTerm,
} from './model_proto.js';

type MathOptVariableSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  integer: boolean;
  name: string;
  deleted: boolean;
};

type MathOptLinearConstraintSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  terms: Array<{ variableId: number; coefficient: number }>;
  name: string;
  deleted: boolean;
};

type MathOptQuadraticConstraintSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  linearTerms: MathOptObjectiveSnapshot['linearTerms'];
  quadraticTerms: MathOptObjectiveSnapshot['quadraticTerms'];
  name: string;
  deleted: boolean;
};

type MathOptIndicatorConstraintSnapshot = {
  id: number;
  indicatorId?: number;
  activateOnZero: boolean;
  lowerBound: number;
  upperBound: number;
  terms: Array<{ variableId: number; coefficient: number }>;
  name: string;
  deleted: boolean;
};

export type MathOptObjectiveSnapshot = {
  name: string;
  priority: bigint;
  maximize: boolean;
  offset: number;
  linearTerms: Array<{ variableId: number; coefficient: number }>;
  quadraticTerms: Array<{ firstVariableId: number; secondVariableId: number; coefficient: number }>;
};

export type MathOptModelSnapshot = {
  variables: MathOptVariableSnapshot[];
  linearConstraints: MathOptLinearConstraintSnapshot[];
  indicatorConstraints: MathOptIndicatorConstraintSnapshot[];
  quadraticConstraints: MathOptQuadraticConstraintSnapshot[];
  sos1Constraints: MathOptSosConstraintSnapshot[];
  sos2Constraints: MathOptSosConstraintSnapshot[];
  secondOrderConeConstraints: MathOptSecondOrderConeConstraintSnapshot[];
  objective: MathOptObjectiveSnapshot;
  auxiliaryObjectives: Array<MathOptObjectiveSnapshot & { id: number; deleted: boolean }>;
};

export type MathOptLinearExpressionSnapshot = { terms: ImportedLinearTerm[]; offset: number };

type MathOptSecondOrderConeConstraintSnapshot = {
  id: number;
  argumentsToNorm: MathOptLinearExpressionSnapshot[];
  upperBound: MathOptLinearExpressionSnapshot;
  name: string;
  deleted: boolean;
};

export type MathOptSosConstraintSnapshot = {
  id: number;
  expressions: MathOptLinearExpressionSnapshot[];
  weights: number[];
  name: string;
  deleted: boolean;
};

export function encodeModelUpdate(
  previous: MathOptModelSnapshot,
  current: MathOptModelSnapshot,
  options: { removeNames?: boolean } = {},
): Uint8Array | null {
  const previousVariables = new Map(previous.variables.map((variable) => [variable.id, variable]));
  const currentVariables = new Map(current.variables.map((variable) => [variable.id, variable]));
  const previousConstraints = new Map(previous.linearConstraints.map((constraint) => [constraint.id, constraint]));
  const currentConstraints = new Map(current.linearConstraints.map((constraint) => [constraint.id, constraint]));
  const previousIndicators = new Map(previous.indicatorConstraints.map((constraint) => [constraint.id, constraint]));
  const currentIndicators = new Map(current.indicatorConstraints.map((constraint) => [constraint.id, constraint]));

  const deletedVariableIds = previous.variables
    .filter((variable) => !variable.deleted && currentVariables.get(variable.id)?.deleted)
    .map((variable) => variable.id);
  const deletedLinearConstraintIds = previous.linearConstraints
    .filter((constraint) => !constraint.deleted && currentConstraints.get(constraint.id)?.deleted)
    .map((constraint) => constraint.id);
  const deletedIndicatorConstraintIds = previous.indicatorConstraints
    .filter((constraint) => !constraint.deleted && currentIndicators.get(constraint.id)?.deleted)
    .map((constraint) => constraint.id);

  const newVariables = current.variables.filter((variable) => {
    const previous = previousVariables.get(variable.id);
    return !variable.deleted && (!previous || previous.deleted);
  });
  const newLinearConstraints = current.linearConstraints.filter((constraint) => {
    const previous = previousConstraints.get(constraint.id);
    return !constraint.deleted && (!previous || previous.deleted);
  });
  const newIndicatorConstraints = current.indicatorConstraints.filter((constraint) => {
    const previous = previousIndicators.get(constraint.id);
    return !constraint.deleted && (!previous || previous.deleted);
  });

  const previousQuadratics = new Map(previous.quadraticConstraints.map(data => [data.id, data]));
  const currentQuadratics = new Map(current.quadraticConstraints.map(data => [data.id, data]));
  const deletedQuadratics = previous.quadraticConstraints
    .filter(data => !data.deleted && currentQuadratics.get(data.id)?.deleted).map(data => data.id).sort((a, b) => a - b);
  const newQuadratics = constraintMap(current.quadraticConstraints.filter(data => !previousQuadratics.has(data.id)),
    data => quadraticConstraintProto(data, options));
  const quadraticUpdate = deletedQuadratics.length || Object.keys(newQuadratics).length
    ? { deletedConstraintIds: deletedQuadratics, newConstraints: newQuadratics } : undefined;
  const variableLowerUpdates = changedValues(previous.variables, current.variables, (item) => item.lowerBound);
  const variableUpperUpdates = changedValues(previous.variables, current.variables, (item) => item.upperBound);
  const variableIntegerUpdates = changedValues(previous.variables, current.variables, (item) => item.integer);
  const linearLowerUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.lowerBound);
  const linearUpperUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.upperBound);
  const liveVariableIds = new Set(current.variables.filter(variable => !variable.deleted).map(variable => variable.id));
  const matrixUpdates = changedMatrixEntries(previous.linearConstraints, current.linearConstraints)
    .filter(entry => liveVariableIds.has(entry.columnId));
  // Native variable deletion already removes its coefficients. Updates must
  // not refer to IDs removed in the same ModelUpdateProto.
  const survivingObjective = (objective: MathOptObjectiveSnapshot): MathOptObjectiveSnapshot => ({ ...objective,
    linearTerms: objective.linearTerms.filter(term => liveVariableIds.has(term.variableId)),
    quadraticTerms: objective.quadraticTerms.filter(term =>
      liveVariableIds.has(term.firstVariableId) && liveVariableIds.has(term.secondVariableId)),
  });
  const objectiveUpdate = objectiveUpdateProto(survivingObjective(previous.objective), current.objective);
  const previousAuxiliary = new Map(previous.auxiliaryObjectives.map(data => [data.id, data]));
  const currentAuxiliary = new Map(current.auxiliaryObjectives.map(data => [data.id, data]));
  const deletedAuxiliaryIds = previous.auxiliaryObjectives.filter(data =>
    !data.deleted && currentAuxiliary.get(data.id)?.deleted).map(data => data.id).sort((a, b) => a - b);
  const objectiveUpdates = Object.fromEntries(current.auxiliaryObjectives.flatMap(data => {
    const previous = previousAuxiliary.get(data.id);
    if (data.deleted || !previous || previous.deleted) return [];
    const update = objectiveUpdateProto(survivingObjective(previous), data);
    return update ? [[data.id, update]] : [];
  }));
  const newObjectives = constraintMap(current.auxiliaryObjectives.filter(data => !previousAuxiliary.has(data.id)),
    data => objectiveProto(data, options));
  const auxiliaryUpdate = deletedAuxiliaryIds.length || Object.keys(newObjectives).length || Object.keys(objectiveUpdates).length
    ? { deletedObjectiveIds: deletedAuxiliaryIds, newObjectives, objectiveUpdates } : undefined;
  const newIndicators = constraintMap(newIndicatorConstraints, data => indicatorConstraintProto(data, options));
  const variableUpdates = definedMessage({ lowerBounds: vectorUpdateProto(variableLowerUpdates),
    upperBounds: vectorUpdateProto(variableUpperUpdates), integers: vectorUpdateProto(variableIntegerUpdates) });
  const linearConstraintUpdates = definedMessage({ lowerBounds: vectorUpdateProto(linearLowerUpdates),
    upperBounds: vectorUpdateProto(linearUpperUpdates) });
  const proto: MathOptModelUpdateProto = {
    deletedVariableIds: deletedVariableIds.sort((a, b) => a - b),
    deletedLinearConstraintIds: deletedLinearConstraintIds.sort((a, b) => a - b),
    variableUpdates, linearConstraintUpdates,
    newVariables: variablesProto(newVariables, options),
    newLinearConstraints: linearConstraintsProto(newLinearConstraints, options),
    objectiveUpdates: objectiveUpdate,
    linearConstraintMatrixUpdates: matrixUpdates.length ? sparseMatrixProto(matrixUpdates) : undefined,
    quadraticConstraintUpdates: quadraticUpdate,
    sos1ConstraintUpdates: constraintUpdatesProto(previous.sos1Constraints, current.sos1Constraints, data => sosConstraintProto(data, options)),
    sos2ConstraintUpdates: constraintUpdatesProto(previous.sos2Constraints, current.sos2Constraints, data => sosConstraintProto(data, options)),
    indicatorConstraintUpdates: deletedIndicatorConstraintIds.length || Object.keys(newIndicators).length
      ? { deletedConstraintIds: deletedIndicatorConstraintIds.sort((a, b) => a - b), newConstraints: newIndicators } : undefined,
    auxiliaryObjectivesUpdates: auxiliaryUpdate,
    secondOrderConeConstraintUpdates: constraintUpdatesProto(previous.secondOrderConeConstraints, current.secondOrderConeConstraints,
      data => coneConstraintProto(data, options)),
  };
  const encoded = new Uint8Array(encodeMathOptModelUpdateProto(proto));
  return encoded.length ? encoded : null;
}

// An absent update is different from an explicitly present empty message.
function definedMessage<T extends object>(value: T): T | undefined {
  return Object.values(value).some(field => field !== undefined) ? value : undefined;
}

export function vectorUpdateProto<T extends number | boolean>(updates: Array<{ id: number; value: T }>): { ids: number[]; values: T[] } | undefined {
  const sorted = [...updates].sort((a, b) => a.id - b.id);
  return sorted.length ? { ids: sorted.map(update => update.id), values: sorted.map(update => update.value) } : undefined;
}

function constraintUpdatesProto<T extends { id: number; deleted: boolean }, P>(previous: T[], current: T[], encode: (data: T) => P) {
  const previousLiveIds = new Set(previous.filter(data => !data.deleted).map(data => data.id));
  const deletedConstraintIds = current.filter(data => data.deleted && previousLiveIds.has(data.id)).map(data => data.id).sort((a, b) => a - b);
  const newConstraints = constraintMap(current.filter(data => !previousLiveIds.has(data.id)), encode);
  return deletedConstraintIds.length || Object.keys(newConstraints).length ? { deletedConstraintIds, newConstraints } : undefined;
}

export function encodeModelSnapshot(name: string, snapshot: MathOptModelSnapshot,
  options: { removeNames?: boolean } = {}): Uint8Array {
  const entries = snapshot.linearConstraints.filter(row => !row.deleted).flatMap(row =>
    row.terms.filter(term => term.coefficient !== 0).map(term => ({
      rowId: row.id, columnId: term.variableId, coefficient: term.coefficient,
    })));
  const proto: MathOptModelProto = {
    name: options.removeNames ? undefined : name,
    variables: variablesProto(snapshot.variables, options) ?? {},
    objective: objectiveProto(snapshot.objective, options),
    linearConstraints: linearConstraintsProto(snapshot.linearConstraints, options) ?? {},
    linearConstraintMatrix: sparseMatrixProto(entries),
    indicatorConstraints: constraintMap(snapshot.indicatorConstraints, data => indicatorConstraintProto(data, options)),
    quadraticConstraints: constraintMap(snapshot.quadraticConstraints, data => quadraticConstraintProto(data, options)),
    sos1Constraints: constraintMap(snapshot.sos1Constraints, data => sosConstraintProto(data, options)),
    sos2Constraints: constraintMap(snapshot.sos2Constraints, data => sosConstraintProto(data, options)),
    auxiliaryObjectives: constraintMap(snapshot.auxiliaryObjectives, data => objectiveProto(data, options)),
    secondOrderConeConstraints: constraintMap(snapshot.secondOrderConeConstraints, data => coneConstraintProto(data, options)),
  };
  return new Uint8Array(encodeMathOptModelProto(proto));
}

function constraintMap<T extends { id: number; deleted: boolean }, P>(values: T[], convert: (value: T) => P): Record<string, P> {
  return Object.fromEntries(values.filter(value => !value.deleted).map(value => [value.id, convert(value)]));
}

function variablesProto(values: MathOptVariableSnapshot[], options: { removeNames?: boolean }): ModelProto.math_opt_VariablesProto | undefined {
  const active = values.filter(value => !value.deleted).sort((a, b) => a.id - b.id);
  return active.length ? { ids: active.map(value => value.id), lowerBounds: active.map(value => value.lowerBound),
    upperBounds: active.map(value => value.upperBound), integers: active.map(value => value.integer),
    names: options.removeNames ? undefined : active.map(value => value.name) } : undefined;
}

function linearConstraintsProto(values: MathOptLinearConstraintSnapshot[], options: { removeNames?: boolean }): ModelProto.math_opt_LinearConstraintsProto | undefined {
  const active = values.filter(value => !value.deleted).sort((a, b) => a.id - b.id);
  return active.length ? { ids: active.map(value => value.id), lowerBounds: active.map(value => value.lowerBound),
    upperBounds: active.map(value => value.upperBound), names: options.removeNames ? undefined : active.map(value => value.name) } : undefined;
}

export function sparseVectorProto(terms: ImportedLinearTerm[]): ModelProto.math_opt_SparseDoubleVectorProto {
  const sorted = [...terms].sort((a, b) => a.variableId - b.variableId);
  return { ids: sorted.map(term => term.variableId), values: sorted.map(term => term.coefficient) };
}

function sparseMatrixProto(terms: Array<{ rowId: number; columnId: number; coefficient: number }>): ModelProto.math_opt_SparseDoubleMatrixProto {
  const sorted = [...terms].sort((a, b) => a.rowId - b.rowId || a.columnId - b.columnId);
  return { rowIds: sorted.map(term => term.rowId), columnIds: sorted.map(term => term.columnId), coefficients: sorted.map(term => term.coefficient) };
}

function quadraticMatrixProto(terms: ImportedQuadraticTerm[]): ModelProto.math_opt_SparseDoubleMatrixProto {
  return sparseMatrixProto(terms.map(term => ({ rowId: term.firstVariableId, columnId: term.secondVariableId, coefficient: term.coefficient })));
}

function objectiveProto(data: MathOptObjectiveSnapshot, options: { removeNames?: boolean }): ModelProto.math_opt_ObjectiveProto {
  return { name: options.removeNames || !data.name ? undefined : data.name,
    priority: data.priority === 0n ? undefined : data.priority, maximize: data.maximize, offset: data.offset,
    linearCoefficients: sparseVectorProto(data.linearTerms), quadraticCoefficients: quadraticMatrixProto(data.quadraticTerms) };
}

function quadraticConstraintProto(data: MathOptQuadraticConstraintSnapshot, options: { removeNames?: boolean }): ModelProto.math_opt_QuadraticConstraintProto {
  return { linearTerms: sparseVectorProto(data.linearTerms), quadraticTerms: quadraticMatrixProto(data.quadraticTerms),
    lowerBound: data.lowerBound, upperBound: data.upperBound, name: options.removeNames ? undefined : data.name };
}

function linearExpressionProto(expression: MathOptLinearExpressionSnapshot): ModelProto.math_opt_LinearExpressionProto {
  const sorted = [...expression.terms].sort((a, b) => a.variableId - b.variableId);
  return { ids: sorted.map(term => term.variableId), coefficients: sorted.map(term => term.coefficient), offset: expression.offset };
}

function sosConstraintProto(data: MathOptSosConstraintSnapshot, options: { removeNames?: boolean }): ModelProto.math_opt_SosConstraintProto {
  return { expressions: data.expressions.map(linearExpressionProto), weights: [...data.weights], name: options.removeNames ? undefined : data.name };
}

function coneConstraintProto(data: MathOptSecondOrderConeConstraintSnapshot, options: { removeNames?: boolean }): ModelProto.math_opt_SecondOrderConeConstraintProto {
  return { upperBound: linearExpressionProto(data.upperBound), argumentsToNorm: data.argumentsToNorm.map(linearExpressionProto), name: options.removeNames ? undefined : data.name };
}

function indicatorConstraintProto(data: MathOptIndicatorConstraintSnapshot, options: { removeNames?: boolean }): ModelProto.math_opt_IndicatorConstraintProto {
  return { indicatorId: data.indicatorId, activateOnZero: data.activateOnZero || undefined,
    expression: sparseVectorProto(data.terms), lowerBound: data.lowerBound, upperBound: data.upperBound, name: options.removeNames ? undefined : data.name };
}

function changedValues<T extends { id: number; deleted: boolean }, TValue extends number | boolean>(
  previous: T[],
  current: T[],
  value: (item: T) => TValue,
): Array<{ id: number; value: TValue }> {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return previous.flatMap((oldItem) => {
    if (oldItem.deleted) return [];
    const newItem = currentById.get(oldItem.id);
    if (!newItem || newItem.deleted) return [];
    return Object.is(value(oldItem), value(newItem)) ? [] : [{ id: oldItem.id, value: value(newItem) }];
  });
}

function changedMatrixEntries(
  previous: MathOptLinearConstraintSnapshot[],
  current: MathOptLinearConstraintSnapshot[],
): Array<{ rowId: number; columnId: number; coefficient: number }> {
  const previousById = new Map(previous.map((constraint) => [constraint.id, constraint]));
  const updates: Array<{ rowId: number; columnId: number; coefficient: number }> = [];
  for (const constraint of current) {
    if (constraint.deleted) continue;
    const previousConstraint = previousById.get(constraint.id);
    const previousTerms = termsByVariableId(previousConstraint && !previousConstraint.deleted ? previousConstraint.terms : []);
    const currentTerms = termsByVariableId(constraint.terms);
    const variableIds = new Set([...previousTerms.keys(), ...currentTerms.keys()]);
    for (const variableId of variableIds) {
      const oldCoefficient = previousTerms.get(variableId) ?? 0;
      const newCoefficient = currentTerms.get(variableId) ?? 0;
      if (!Object.is(oldCoefficient, newCoefficient)) {
        updates.push({ rowId: constraint.id, columnId: variableId, coefficient: newCoefficient });
      }
    }
  }
  return updates;
}

function termsByVariableId(terms: Array<{ variableId: number; coefficient: number }>): Map<number, number> {
  const result = new Map<number, number>();
  for (const term of terms) {
    result.set(term.variableId, (result.get(term.variableId) ?? 0) + term.coefficient);
  }
  return result;
}

function objectiveUpdateProto(previous: MathOptObjectiveSnapshot, current: MathOptObjectiveSnapshot): ModelProto.math_opt_ObjectiveUpdatesProto | undefined {
  const linearUpdates = changedTermMap(
    previous.linearTerms.map((term) => [term.variableId, term.coefficient] as const),
    current.linearTerms.map((term) => [term.variableId, term.coefficient] as const),
  );
  const quadraticUpdates = changedQuadraticTermMap(previous.quadraticTerms, current.quadraticTerms);
  return definedMessage({
    directionUpdate: previous.maximize === current.maximize ? undefined : current.maximize,
    priorityUpdate: previous.priority === current.priority ? undefined : current.priority,
    offsetUpdate: Object.is(previous.offset, current.offset) ? undefined : current.offset,
    linearCoefficients: linearUpdates.length ? sparseVectorProto(linearUpdates.map(term => ({ variableId: term.id, coefficient: term.coefficient }))) : undefined,
    quadraticCoefficients: quadraticUpdates.length ? quadraticMatrixProto(quadraticUpdates) : undefined,
  });
}

function changedTermMap(
  previousEntries: Array<readonly [number, number]>,
  currentEntries: Array<readonly [number, number]>,
): Array<{ id: number; coefficient: number }> {
  const previous = new Map(previousEntries);
  const current = new Map(currentEntries);
  const ids = new Set([...previous.keys(), ...current.keys()]);
  const updates: Array<{ id: number; coefficient: number }> = [];
  for (const id of ids) {
    const oldCoefficient = previous.get(id) ?? 0;
    const newCoefficient = current.get(id) ?? 0;
    if (!Object.is(oldCoefficient, newCoefficient)) updates.push({ id, coefficient: newCoefficient });
  }
  return updates;
}

function changedQuadraticTermMap(
  previousTerms: MathOptObjectiveSnapshot['quadraticTerms'],
  currentTerms: MathOptObjectiveSnapshot['quadraticTerms'],
): MathOptObjectiveSnapshot['quadraticTerms'] {
  const key = (term: { firstVariableId: number; secondVariableId: number }) => `${term.firstVariableId}:${term.secondVariableId}`;
  const previous = new Map(previousTerms.map((term) => [key(term), term]));
  const current = new Map(currentTerms.map((term) => [key(term), term]));
  const keys = new Set([...previous.keys(), ...current.keys()]);
  const updates: MathOptObjectiveSnapshot['quadraticTerms'] = [];
  for (const termKey of keys) {
    const oldTerm = previous.get(termKey);
    const newTerm = current.get(termKey);
    const coefficient = newTerm?.coefficient ?? 0;
    if (!Object.is(oldTerm?.coefficient ?? 0, coefficient)) {
      const [firstVariableId, secondVariableId] = termKey.split(':').map(Number);
      updates.push({ firstVariableId, secondVariableId, coefficient });
    }
  }
  return updates;
}
