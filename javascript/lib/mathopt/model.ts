// Editable storage and handles. Native import/export conveniences load their
// execution adapter only when called; edits and snapshots need no executor.
import type {
  MathOptLinearTerm, MathOptQuadraticTerm, MathOptSosConstraintKind, MathOptModelOptions,
  MathOptConversionOptions, MathOptAuxiliaryObjectiveOptions, MathOptLinearExpressionInput,
  MathOptVariableOptions, MathOptLinearConstraintOptions, MathOptQuadraticConstraintOptions,
  MathOptQuadraticExpressionInput, MathOptSecondOrderConeConstraintOptions,
  MathOptSosConstraintOptions, MathOptIndicatorConstraintOptions,
  MathOptLinearConstraintMatrixEntry, MathOptMpsExportOptions,
} from './types.js';
import {
  MathOptLinearExpression, MathOptBoundedExpression, MathOptLowerBoundedExpression,
  MathOptUpperBoundedExpression, asFlatLinearExpression, linearTermEntries, asFlatQuadraticExpression,
  MathOptQuadraticExpression, linearTermEntriesFromMap, quadraticTermEntries, mathOptOperandType,
  boundedExpression, MathOptQuadraticTermKey,
} from './expressions.js';
import {
  type MathOptVariable, type VariableData, createMathOptVariable, variableRecord, modelHandleFactory,
} from './variable.js';
import { type IntValue, toIndex, toInt64 } from '../int64.js';
import {
  type MathOptModelSnapshot, type MathOptLinearExpressionSnapshot, encodeModelUpdate,
  type MathOptSosConstraintSnapshot, encodeModelSnapshot, type MathOptObjectiveSnapshot,
} from './model_snapshot.js';
import {
  type MathOptModelProto, encodeMathOptModelProto, decodeMathOptModel, type ImportedLinearTerm,
  type ImportedQuadraticTerm,
} from './model_proto.js';

type MathOptObjectiveData = {
  maximize: boolean;
  linearTerms: MathOptLinearTerm[];
  quadraticTerms: MathOptQuadraticTerm[];
  offset: number;
};

type AuxiliaryObjectiveData = {
  id: number;
  name: string;
  priority: bigint;
  deleted: boolean;
  objective: MathOptObjectiveData;
};

type SecondOrderConeConstraintData = {
  id: number;
  argumentsToNorm: MathOptLinearExpression[];
  upperBound: MathOptLinearExpression;
  name: string;
  deleted: boolean;
};

type SosConstraintData = {
  id: number;
  kind: MathOptSosConstraintKind;
  expressions: MathOptLinearExpression[];
  weights: number[];
  name: string;
  deleted: boolean;
};

type LinearConstraintData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  terms: MathOptLinearTerm[];
  name: string;
  deleted: boolean;
};

type QuadraticConstraintData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  linearTerms: MathOptLinearTerm[];
  quadraticTerms: MathOptQuadraticTerm[];
  name: string;
  deleted: boolean;
};

type IndicatorConstraintData = {
  id: number;
  indicator?: MathOptVariable;
  activateOnZero: boolean;
  lowerBound: number;
  upperBound: number;
  terms: MathOptLinearTerm[];
  name: string;
  deleted: boolean;
};

// Objective handles share model storage without exposing mutable records as API.
type ObjectiveAccess = {
  getData(id?: number): MathOptObjectiveData;
  setData(id: number | undefined, data: MathOptObjectiveData): void;
  name(id?: number): string;
  priority(id?: number): bigint;
  setPriority(id: number | undefined, value: IntValue): void;
};

const objectiveAccess = new WeakMap<MathOptModel, ObjectiveAccess>();

function objectiveStorage(model: MathOptModel): ObjectiveAccess {
  const access = objectiveAccess.get(model);
  if (!access) throw new TypeError('Objective requires a MathOpt model.');
  return access;
}

function copyObjectiveData(data: MathOptObjectiveData): MathOptObjectiveData {
  return { ...data, linearTerms: data.linearTerms.map(term => ({ ...term })),
    quadraticTerms: data.quadraticTerms.map(term => ({ ...term })) };
}

let captureModelSnapshot: (model: MathOptModel) => MathOptModelSnapshot;

export class MathOptModel {
  readonly name: string;
  private readonly variableData = new Map<number, VariableData>();
  private nextVariableId = 0;
  private readonly constraints = new Map<number, LinearConstraintData>();
  private nextLinearConstraintId = 0;
  private readonly indicatorConstraintData = new Map<number, IndicatorConstraintData>();
  private nextIndicatorConstraintId = 0;
  private readonly quadraticConstraintData = new Map<number, QuadraticConstraintData>();
  private nextQuadraticConstraintId = 0;
  private readonly sosConstraintData = { sos1: new Map<number, SosConstraintData>(), sos2: new Map<number, SosConstraintData>() };
  private readonly nextSosConstraintId = { sos1: 0, sos2: 0 };
  private readonly secondOrderConeConstraintData = new Map<number, SecondOrderConeConstraintData>();
  private nextSecondOrderConeConstraintId = 0;
  private objectiveDataValue: MathOptObjectiveData = {
    maximize: false,
    linearTerms: [],
    quadraticTerms: [],
    offset: 0,
  };
  private primaryObjectiveNameValue = '';
  private primaryObjectivePriority = 0n;
  private readonly auxiliaryObjectiveData = new Map<number, AuxiliaryObjectiveData>();
  private nextAuxiliaryObjectiveId = 0;
  private readonly updateTrackers = new Set<MathOptUpdateTracker>();
  readonly objective: MathOptObjective;

  static { captureModelSnapshot = model => model.snapshot(); }

  constructor(name = '', options: MathOptModelOptions = {}) {
    this.name = name;
    this.primaryObjectiveNameValue = options.primaryObjectiveName ?? '';
    objectiveAccess.set(this, {
      getData: id => this.getObjectiveData(id), setData: (id, data) => this.setObjectiveData(id, data),
      name: id => this.objectiveName(id), priority: id => this.objectivePriority(id),
      setPriority: (id, value) => this.setObjectivePriority(id, value),
    });
    this.objective = createMathOptObjective(this);
  }

  static async fromModelProto(input: Uint8Array | MathOptModelProto, options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    const bytes = encodeMathOptModelProto(input);
    options = { ...options };
    const { validateModelProto } = await import('./execution.js');
    await validateModelProto(bytes, options);
    const data = decodeMathOptModel(bytes);
    const model = new MathOptModel(data.name);
    const variables = new Map<number, MathOptVariable>();
    for (const variable of data.variables) {
      model.ensureNextVariableIdAtLeast(variable.id);
      variables.set(variable.id, model.addVariable(variable));
    }
    const variableForId = (id: number): MathOptVariable => {
      const variable = variables.get(id);
      if (!variable) throw new Error(`Imported MathOpt model references missing variable ${id}.`);
      return variable;
    };
    const linearTerms = (terms: ImportedLinearTerm[]): MathOptLinearTerm[] => terms.map(term =>
      ({ variable: variableForId(term.variableId), coefficient: term.coefficient }));
    const quadraticTerms = (terms: ImportedQuadraticTerm[]): MathOptQuadraticTerm[] => terms.map(term =>
      ({ firstVariable: variableForId(term.firstVariableId), secondVariable: variableForId(term.secondVariableId), coefficient: term.coefficient }));
    for (const row of data.linearConstraints) {
      model.ensureNextLinearConstraintIdAtLeast(row.id);
      model.addLinearConstraint({ ...row, terms: linearTerms(row.terms) });
    }
    model.setObjectiveData(undefined, { maximize: data.objective.maximize, offset: data.objective.offset,
      linearTerms: linearTerms(data.objective.linearTerms), quadraticTerms: quadraticTerms(data.objective.quadraticTerms) });
    model.primaryObjectiveNameValue = data.objective.name;
    model.primaryObjectivePriority = data.objective.priority;
    for (const objective of data.auxiliaryObjectives) {
      if (objective.quadraticTerms.length) throw new Error('Quadratic auxiliary objectives are not supported by the editable model; use solveProto.');
      model.ensureNextAuxiliaryObjectiveIdAtLeast(objective.id);
      model.addAuxiliaryObjective({ priority: objective.priority, name: objective.name,
        isMaximize: objective.maximize, expression: new MathOptLinearExpression(linearTerms(objective.linearTerms), objective.offset) });
    }
    for (const constraint of data.quadraticConstraints) {
      model.ensureNextQuadraticConstraintIdAtLeast(constraint.id);
      model.addQuadraticConstraint({ ...constraint,
        terms: linearTerms(constraint.linearTerms), quadraticTerms: quadraticTerms(constraint.quadraticTerms) });
    }
    for (const constraint of data.indicatorConstraints) {
      model.ensureNextIndicatorConstraintIdAtLeast(constraint.id);
      model.addIndicatorConstraint({ ...constraint, terms: linearTerms(constraint.terms),
        indicator: constraint.indicatorId === undefined ? undefined : variableForId(constraint.indicatorId) });
    }
    const affineExpression = (expression: MathOptLinearExpressionSnapshot) =>
      new MathOptLinearExpression(linearTerms(expression.terms), expression.offset);
    for (const constraint of data.secondOrderConeConstraints) {
      model.ensureNextSecondOrderConeConstraintIdAtLeast(constraint.id);
      model.addSecondOrderConeConstraint(constraint.argumentsToNorm.map(affineExpression), affineExpression(constraint.upperBound), constraint);
    }
    for (const kind of ['sos1', 'sos2'] as const) {
      for (const constraint of data[`${kind}Constraints`]) {
        model.ensureNextSosConstraintIdAtLeast(kind, constraint.id);
        model.addSosConstraint(kind, constraint.expressions.map(affineExpression), constraint);
      }
    }
    return model;
  }

  addAuxiliaryObjective(options: MathOptAuxiliaryObjectiveOptions): MathOptAuxiliaryObjective {
    if (this.nextAuxiliaryObjectiveId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Auxiliary objective ID exceeds the safe integer API range.');
    const priority = objectivePriority(options.priority);
    const objective = linearObjectiveData(options.isMaximize ?? false, options.expression ?? 0, 0);
    this.validateObjectiveData(objective);
    const id = this.nextAuxiliaryObjectiveId++;
    this.auxiliaryObjectiveData.set(id, { id, name: options.name ?? '', priority, deleted: false, objective });
    return createMathOptAuxiliaryObjective(this, id);
  }

  addMaximizationObjective(expr: MathOptLinearExpressionInput, options: Pick<MathOptAuxiliaryObjectiveOptions, 'priority' | 'name'>): MathOptAuxiliaryObjective {
    return this.addAuxiliaryObjective({ ...options, expression: expr, isMaximize: true });
  }

  addMinimizationObjective(expr: MathOptLinearExpressionInput, options: Pick<MathOptAuxiliaryObjectiveOptions, 'priority' | 'name'>): MathOptAuxiliaryObjective {
    return this.addAuxiliaryObjective({ ...options, expression: expr, isMaximize: false });
  }

  auxiliaryObjectives(): MathOptAuxiliaryObjective[] {
    return [...this.auxiliaryObjectiveData.values()].filter(data => !data.deleted)
      .map(data => createMathOptAuxiliaryObjective(this, data.id));
  }

  getAuxiliaryObjective(id: number): MathOptAuxiliaryObjective | undefined {
    return this.hasAuxiliaryObjective(id) ? createMathOptAuxiliaryObjective(this, id) : undefined;
  }

  hasAuxiliaryObjective(id: number): boolean {
    const data = this.auxiliaryObjectiveData.get(id);
    return data !== undefined && !data.deleted;
  }

  getNumAuxiliaryObjectives(): number { return this.auxiliaryObjectives().length; }
  getNextAuxiliaryObjectiveId(): number { return this.nextAuxiliaryObjectiveId; }
  ensureNextAuxiliaryObjectiveIdAtLeast(id: number): void {
    this.nextAuxiliaryObjectiveId = Math.max(this.nextAuxiliaryObjectiveId, toIndex(id, 'MathOpt next auxiliary objective ID'));
  }

  deleteAuxiliaryObjective(objective: MathOptAuxiliaryObjective): void {
    this.assertOwnsObjective(objective);
    this.auxiliaryObjectiveData.get(objective.id)!.deleted = true;
  }

  assertOwnsObjective(objective: MathOptObjective): void {
    if (!objectiveIds.has(objective) || objective.model !== this) throw new Error('Objective belongs to a different MathOpt model or is not registered.');
    objective.assertLive();
  }

  private auxiliaryData(id: number): AuxiliaryObjectiveData {
    const data = this.auxiliaryObjectiveData.get(id);
    if (!data || data.deleted) throw new Error(`Auxiliary objective ${id} has been deleted or does not exist.`);
    return data;
  }

  private getObjectiveData(id?: number): MathOptObjectiveData {
    return id === undefined ? this.objectiveDataValue : this.auxiliaryData(id).objective;
  }

  private setObjectiveData(id: number | undefined, value: MathOptObjectiveData): void {
    this.validateObjectiveData(value);
    if (id === undefined) this.objectiveDataValue = copyObjectiveData(value);
    else {
      const data = this.auxiliaryData(id);
      if (value.quadraticTerms.length) throw new Error('Quadratic auxiliary objectives are not supported.');
      data.objective = copyObjectiveData(value);
    }
  }

  private objectiveName(id?: number): string {
    return id === undefined ? this.primaryObjectiveNameValue : this.auxiliaryData(id).name;
  }

  private objectivePriority(id?: number): bigint {
    return id === undefined ? this.primaryObjectivePriority : this.auxiliaryData(id).priority;
  }

  private setObjectivePriority(id: number | undefined, value: IntValue): void {
    const priority = objectivePriority(value);
    if (id === undefined) this.primaryObjectivePriority = priority;
    else this.auxiliaryData(id).priority = priority;
  }

  addUpdateTracker(): MathOptUpdateTracker {
    let checkpoint = this.snapshot();
    const assertActive = () => {
      if (!this.updateTrackers.has(tracker)) throw new Error('MathOpt update tracker has been removed.');
    };
    const tracker = createUpdateTracker(options => {
      assertActive();
      return encodeModelUpdate(checkpoint, this.snapshot(), options);
    }, () => { assertActive(); checkpoint = this.snapshot(); });
    this.updateTrackers.add(tracker);
    return tracker;
  }

  removeUpdateTracker(tracker: MathOptUpdateTracker): void {
    if (!this.updateTrackers.delete(tracker))
      throw new Error('MathOpt update tracker belongs to another model or has been removed.');
  }

  addVariable(options: MathOptVariableOptions = {}): MathOptVariable {
    if (this.nextVariableId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Variable ID exceeds the safe integer API range.');
    const id = this.nextVariableId;
    const variable: VariableData = {
      id,
      lowerBound: options.lowerBound ?? Number.NEGATIVE_INFINITY,
      upperBound: options.upperBound ?? Number.POSITIVE_INFINITY,
      integer: options.integer ?? false,
      name: options.name ?? '',
      deleted: false,
    };
    this.variableData.set(id, variable);
    ++this.nextVariableId;
    return createMathOptVariable(this, variable);
  }

  addIntegerVariable(options: Omit<MathOptVariableOptions, 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, integer: true });
  }

  addBinaryVariable(options: Omit<MathOptVariableOptions, 'lowerBound' | 'upperBound' | 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, lowerBound: 0, upperBound: 1, integer: true });
  }

  addLinearConstraint(
    options: Partial<MathOptLinearConstraintOptions> | MathOptBoundedExpression<MathOptLinearExpression> | MathOptLowerBoundedExpression<MathOptLinearExpression> | MathOptUpperBoundedExpression<MathOptLinearExpression> = {},
  ): MathOptLinearConstraint {
    if (this.nextLinearConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Linear constraint ID exceeds the safe integer API range.');
    const id = this.nextLinearConstraintId;
    const normalizedOptions = this.normalizeLinearConstraintOptions(options);
    const expression = normalizedOptions.expression === undefined
      ? new MathOptLinearExpression(normalizedOptions.terms ?? [])
      : asFlatLinearExpression(normalizedOptions.expression).add(new MathOptLinearExpression(normalizedOptions.terms ?? []));
    if (!Number.isFinite(expression.offset)) {
      throw new Error('linear constraint expression has an infinite offset.');
    }
    const constraint: LinearConstraintData = {
      id,
      lowerBound: (normalizedOptions.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (normalizedOptions.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: normalizedOptions.name ?? '',
      deleted: false,
    };
    for (const term of constraint.terms) this.assertOwnsVariable(term.variable);
    this.constraints.set(id, constraint);
    ++this.nextLinearConstraintId;
    return createMathOptLinearConstraint(this, constraint);
  }

  addQuadraticConstraint(
    options: MathOptQuadraticConstraintOptions
      | MathOptBoundedExpression<MathOptQuadraticExpressionInput>
      | MathOptLowerBoundedExpression<MathOptQuadraticExpressionInput>
      | MathOptUpperBoundedExpression<MathOptQuadraticExpressionInput> = {},
  ): MathOptQuadraticConstraint {
    let normalized: MathOptQuadraticConstraintOptions;
    if (options instanceof MathOptBoundedExpression) normalized = {
      lowerBound: options.lowerBound, upperBound: options.upperBound, expression: options.expression,
    };
    else if (options instanceof MathOptLowerBoundedExpression) normalized = {
      lowerBound: options.lowerBound, expression: options.expression,
    };
    else if (options instanceof MathOptUpperBoundedExpression) normalized = {
      upperBound: options.upperBound, expression: options.expression,
    };
    else {
      if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Quadratic constraint requires bounds and an expression.');
      }
      normalized = options;
    }
    const expression = asFlatQuadraticExpression(normalized.expression ?? 0)
      .add(new MathOptQuadraticExpression(normalized.terms ?? [], normalized.quadraticTerms ?? []));
    if (!Number.isFinite(expression.offset)) throw new Error('Quadratic constraint has a non-finite offset.');
    const linearTerms = linearTermEntriesFromMap(expression.linearTerms);
    const quadraticTerms = quadraticTermEntries(expression);
    for (const term of linearTerms) this.assertOwnsVariable(term.variable);
    for (const term of quadraticTerms) {
      this.assertOwnsVariable(term.firstVariable);
      this.assertOwnsVariable(term.secondVariable);
    }
    if (this.nextQuadraticConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError(
      'Quadratic constraint ID exceeds the safe integer API range.');
    const id = this.nextQuadraticConstraintId++;
    const data: QuadraticConstraintData = {
      id, lowerBound: (normalized.lowerBound ?? -Infinity) - expression.offset,
      upperBound: (normalized.upperBound ?? Infinity) - expression.offset,
      linearTerms, quadraticTerms, name: normalized.name ?? '', deleted: false,
    };
    this.quadraticConstraintData.set(id, data);
    return createMathOptQuadraticConstraint(this, data);
  }

  quadraticConstraints(): MathOptQuadraticConstraint[] {
    return [...this.quadraticConstraintData.values()].filter(data => !data.deleted)
      .map(data => createMathOptQuadraticConstraint(this, data));
  }
  getNumQuadraticConstraints(): number { return this.quadraticConstraints().length; }
  getNextQuadraticConstraintId(): number { return this.nextQuadraticConstraintId; }
  ensureNextQuadraticConstraintIdAtLeast(id: number): void {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError('Quadratic constraint ID must be a nonnegative safe integer.');
    this.nextQuadraticConstraintId = Math.max(this.nextQuadraticConstraintId, id);
  }
  hasQuadraticConstraint(id: number): boolean { return !!this.getQuadraticConstraint(id); }
  getQuadraticConstraint(id: number): MathOptQuadraticConstraint | undefined {
    const data = this.quadraticConstraintData.get(id);
    return data && !data.deleted ? createMathOptQuadraticConstraint(this, data) : undefined;
  }
  deleteQuadraticConstraint(constraint: MathOptQuadraticConstraint): void {
    const record = quadraticConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.quadraticConstraintData.get(constraint.id) !== record)
      throw new Error('Quadratic constraint belongs to a different MathOpt model or is not registered.');
    constraint.assertLive();
    record.deleted = true;
  }

  private captureLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    const expression = asFlatLinearExpression(input), terms = linearTermEntries(expression);
    for (const term of terms) this.assertOwnsVariable(term.variable);
    return new MathOptLinearExpression(terms, expression.offset);
  }
  addSecondOrderConeConstraint(argumentsToNorm: Iterable<MathOptLinearExpressionInput>, upperBound: MathOptLinearExpressionInput,
      options: MathOptSecondOrderConeConstraintOptions = {}): MathOptSecondOrderConeConstraint {
    const argumentsData = Array.from(argumentsToNorm, input => this.captureLinearExpression(input));
    const upper = this.captureLinearExpression(upperBound);
    const id = this.nextSecondOrderConeConstraintId;
    if (id >= Number.MAX_SAFE_INTEGER) throw new RangeError('Second-order cone constraint ID exceeds the safe integer API range.');
    const data: SecondOrderConeConstraintData = { id, argumentsToNorm: argumentsData, upperBound: upper, name: options.name ?? '', deleted: false };
    this.secondOrderConeConstraintData.set(id, data);
    ++this.nextSecondOrderConeConstraintId;
    return createMathOptSecondOrderConeConstraint(this, data);
  }
  secondOrderConeConstraints(): MathOptSecondOrderConeConstraint[] {
    return [...this.secondOrderConeConstraintData.values()].filter(data => !data.deleted).map(data => createMathOptSecondOrderConeConstraint(this, data));
  }
  getNumSecondOrderConeConstraints(): number { return this.secondOrderConeConstraints().length; }
  getNextSecondOrderConeConstraintId(): number { return this.nextSecondOrderConeConstraintId; }
  ensureNextSecondOrderConeConstraintIdAtLeast(id: number): void {
    this.nextSecondOrderConeConstraintId = Math.max(this.nextSecondOrderConeConstraintId, toIndex(id, 'MathOpt next second-order cone constraint ID'));
  }
  getSecondOrderConeConstraint(id: number): MathOptSecondOrderConeConstraint | undefined {
    const data = this.secondOrderConeConstraintData.get(id);
    return data && !data.deleted ? createMathOptSecondOrderConeConstraint(this, data) : undefined;
  }
  hasSecondOrderConeConstraint(id: number): boolean { return !!this.getSecondOrderConeConstraint(id); }
  deleteSecondOrderConeConstraint(constraint: MathOptSecondOrderConeConstraint): void {
    const data = secondOrderConeConstraintRecords.get(constraint);
    if (!data || constraint.model !== this || this.secondOrderConeConstraintData.get(constraint.id) !== data)
      throw new Error('Second-order cone constraint belongs to a different MathOpt model or is not registered.');
    constraint.assertLive();
    data.deleted = true;
  }
  addSos1Constraint(expressions: Iterable<MathOptLinearExpressionInput>, options: MathOptSosConstraintOptions = {}): MathOptSosConstraint {
    return this.addSosConstraint('sos1', expressions, options);
  }
  addSos2Constraint(expressions: Iterable<MathOptLinearExpressionInput>, options: MathOptSosConstraintOptions = {}): MathOptSosConstraint {
    return this.addSosConstraint('sos2', expressions, options);
  }
  private addSosConstraint(kind: MathOptSosConstraintKind, inputs: Iterable<MathOptLinearExpressionInput>, options: MathOptSosConstraintOptions): MathOptSosConstraint {
    const expressions = Array.from(inputs, input => this.captureLinearExpression(input));
    const id = this.nextSosConstraintId[kind];
    if (id >= Number.MAX_SAFE_INTEGER) throw new RangeError('SOS constraint ID exceeds the safe integer API range.');
    const data: SosConstraintData = { id, kind, expressions, weights: Array.from(options.weights ?? []), name: options.name ?? '', deleted: false };
    this.sosConstraintData[kind].set(id, data);
    ++this.nextSosConstraintId[kind];
    return createMathOptSosConstraint(this, data);
  }
  sos1Constraints(): MathOptSosConstraint[] { return this.sosConstraints('sos1'); }
  sos2Constraints(): MathOptSosConstraint[] { return this.sosConstraints('sos2'); }
  private sosConstraints(kind: MathOptSosConstraintKind): MathOptSosConstraint[] {
    return [...this.sosConstraintData[kind].values()].filter(data => !data.deleted).map(data => createMathOptSosConstraint(this, data));
  }
  getNumSos1Constraints(): number { return this.sos1Constraints().length; }
  getNumSos2Constraints(): number { return this.sos2Constraints().length; }
  getNextSos1ConstraintId(): number { return this.nextSosConstraintId.sos1; }
  getNextSos2ConstraintId(): number { return this.nextSosConstraintId.sos2; }
  ensureNextSos1ConstraintIdAtLeast(id: number): void { this.ensureNextSosConstraintIdAtLeast('sos1', id); }
  ensureNextSos2ConstraintIdAtLeast(id: number): void { this.ensureNextSosConstraintIdAtLeast('sos2', id); }
  private ensureNextSosConstraintIdAtLeast(kind: MathOptSosConstraintKind, id: number): void {
    this.nextSosConstraintId[kind] = Math.max(this.nextSosConstraintId[kind], toIndex(id, 'MathOpt next SOS constraint ID'));
  }
  getSos1Constraint(id: number): MathOptSosConstraint | undefined { return this.getSosConstraint('sos1', id); }
  getSos2Constraint(id: number): MathOptSosConstraint | undefined { return this.getSosConstraint('sos2', id); }
  private getSosConstraint(kind: MathOptSosConstraintKind, id: number): MathOptSosConstraint | undefined {
    const data = this.sosConstraintData[kind].get(id);
    return data && !data.deleted ? createMathOptSosConstraint(this, data) : undefined;
  }
  hasSos1Constraint(id: number): boolean { return !!this.getSos1Constraint(id); }
  hasSos2Constraint(id: number): boolean { return !!this.getSos2Constraint(id); }
  deleteSosConstraint(constraint: MathOptSosConstraint): void {
    const data = sosConstraintRecords.get(constraint);
    if (!data || constraint.model !== this || this.sosConstraintData[data.kind].get(data.id) !== data)
      throw new Error('SOS constraint belongs to a different MathOpt model or is not registered.');
    constraint.assertLive();
    data.deleted = true;
  }

  addIndicatorConstraint(options: MathOptIndicatorConstraintOptions = {}): MathOptIndicatorConstraint {
    const normalizedOptions = this.normalizeIndicatorConstraintOptions(options);
    if (normalizedOptions.indicator) {
      this.assertOwnsVariable(normalizedOptions.indicator);
    }
    const expression = normalizedOptions.expression === undefined
      ? new MathOptLinearExpression(normalizedOptions.terms ?? [])
      : asFlatLinearExpression(normalizedOptions.expression).add(new MathOptLinearExpression(normalizedOptions.terms ?? []));
    if (!Number.isFinite(expression.offset)) {
      throw new Error('indicator constraint expression has an infinite offset.');
    }
    const constraint: IndicatorConstraintData = {
      id: this.nextIndicatorConstraintId,
      indicator: normalizedOptions.indicator,
      activateOnZero: normalizedOptions.activateOnZero ?? false,
      lowerBound: (normalizedOptions.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (normalizedOptions.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: normalizedOptions.name ?? '',
      deleted: false,
    };
    for (const term of constraint.terms) this.assertOwnsVariable(term.variable);
    if (this.nextIndicatorConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError(
      'Indicator constraint ID exceeds the safe integer API range.');
    this.indicatorConstraintData.set(constraint.id, constraint);
    this.nextIndicatorConstraintId++;
    return createMathOptIndicatorConstraint(this, constraint);
  }

  indicatorConstraints(): MathOptIndicatorConstraint[] {
    return [...this.indicatorConstraintData.values()].filter(data => !data.deleted)
      .map(data => createMathOptIndicatorConstraint(this, data));
  }

  getNumIndicatorConstraints(): number { return this.indicatorConstraints().length; }
  getNextIndicatorConstraintId(): number { return this.nextIndicatorConstraintId; }

  ensureNextIndicatorConstraintIdAtLeast(id: number): void {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError('Indicator constraint ID must be a nonnegative safe integer.');
    this.nextIndicatorConstraintId = Math.max(this.nextIndicatorConstraintId, id);
  }

  hasIndicatorConstraint(id: number): boolean { return !!this.getIndicatorConstraint(id); }

  getIndicatorConstraint(id: number): MathOptIndicatorConstraint | undefined {
    const index = toIndex(id, 'Indicator constraint ID');
    const data = this.indicatorConstraintData.get(index);
    if (data && !data.deleted) return createMathOptIndicatorConstraint(this, data);
    return undefined;
  }

  deleteIndicatorConstraint(constraint: MathOptIndicatorConstraint): void {
    const record = indicatorConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.indicatorConstraintData.get(constraint.id) !== record)
      throw new Error('Indicator constraint does not belong to this MathOpt model.');
    constraint.assertLive();
    record.deleted = true;
  }

  private normalizeLinearConstraintOptions(
    options: Partial<MathOptLinearConstraintOptions> | MathOptBoundedExpression<MathOptLinearExpression> | MathOptLowerBoundedExpression<MathOptLinearExpression> | MathOptUpperBoundedExpression<MathOptLinearExpression>,
  ): Partial<MathOptLinearConstraintOptions> {
    if (options instanceof MathOptBoundedExpression) {
      return { lowerBound: options.lowerBound, upperBound: options.upperBound, expression: options.expression };
    }
    if (options instanceof MathOptLowerBoundedExpression) {
      return { lowerBound: options.lowerBound, upperBound: Number.POSITIVE_INFINITY, expression: options.expression };
    }
    if (options instanceof MathOptUpperBoundedExpression) {
      return { lowerBound: Number.NEGATIVE_INFINITY, upperBound: options.upperBound, expression: options.expression };
    }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`Unsupported type for bounded_expr argument: ${mathOptOperandType(options)}`);
    }
    return {
      ...options,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      expression: options.expression,
    };
  }

  private normalizeIndicatorConstraintOptions(options: MathOptIndicatorConstraintOptions): {
    indicator?: MathOptVariable;
    activateOnZero?: boolean;
    lowerBound?: number;
    upperBound?: number;
    terms?: MathOptLinearTerm[];
    expression?: MathOptLinearExpressionInput;
    name?: string;
  } {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`Unsupported type for indicator constraint options: ${mathOptOperandType(options)}`);
    }
    const implied = options.impliedConstraint;
    if (implied instanceof MathOptBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: implied.lowerBound,
        upperBound: implied.upperBound,
        expression: implied.expression,
        name: options.name,
      };
    }
    if (implied instanceof MathOptLowerBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: implied.lowerBound,
        upperBound: Number.POSITIVE_INFINITY,
        expression: implied.expression,
        name: options.name,
      };
    }
    if (implied instanceof MathOptUpperBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: implied.upperBound,
        expression: implied.expression,
        name: options.name,
      };
    }
    return {
      indicator: options.indicator,
      activateOnZero: options.activateOnZero,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      expression: options.expression,
      terms: options.terms,
      name: options.name,
    };
  }

  deleteVariable(variable: MathOptVariable): void {
    this.assertOwnsVariable(variable);
    if (variableRecord(variable)!.deleted) {
      throw new Error(`Variable ${variable.id} has already been deleted.`);
    }
    variableRecord(variable)!.deleted = true;
    const substituteZero = (expression: MathOptLinearExpression) =>
      new MathOptLinearExpression(linearTermEntries(expression).filter(term => term.variable.id !== variable.id), expression.offset);
    for (const constraint of this.constraints.values()) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
    }
    for (const constraint of this.indicatorConstraintData.values()) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
      if (constraint.indicator?.id === variable.id) {
        constraint.indicator = undefined;
      }
    }
    for (const constraint of this.quadraticConstraintData.values()) {
      constraint.linearTerms = constraint.linearTerms.filter(term => term.variable.id !== variable.id);
      constraint.quadraticTerms = constraint.quadraticTerms.filter(term =>
        term.firstVariable.id !== variable.id && term.secondVariable.id !== variable.id);
    }
    for (const constraints of Object.values(this.sosConstraintData)) {
      for (const constraint of constraints.values()) constraint.expressions = constraint.expressions.map(substituteZero);
    }
    for (const constraint of this.secondOrderConeConstraintData.values()) {
      constraint.argumentsToNorm = constraint.argumentsToNorm.map(substituteZero);
      constraint.upperBound = substituteZero(constraint.upperBound);
    }
    this.objectiveDataValue.linearTerms = this.objectiveDataValue.linearTerms.filter((term) => term.variable.id !== variable.id);
    this.objectiveDataValue.quadraticTerms = this.objectiveDataValue.quadraticTerms.filter((term) => {
      return term.firstVariable.id !== variable.id && term.secondVariable.id !== variable.id;
    });
    for (const data of this.auxiliaryObjectiveData.values()) {
      data.objective.linearTerms = data.objective.linearTerms.filter(term => term.variable.id !== variable.id);
    }
  }

  deleteLinearConstraint(constraint: MathOptLinearConstraint): void {
    this.assertOwnsConstraint(constraint);
    if (linearConstraintRecords.get(constraint)!.deleted) {
      throw new Error(`Linear constraint ${constraint.id} has already been deleted.`);
    }
    linearConstraintRecords.get(constraint)!.deleted = true;
  }

  variables(): MathOptVariable[] {
    return [...this.variableData.values()]
      .filter((variable) => !variable.deleted)
      .map((variable) => createMathOptVariable(this, variable));
  }

  getNumVariables(): number {
    return this.variables().length;
  }

  getNextVariableId(): number {
    return this.nextVariableId;
  }

  ensureNextVariableIdAtLeast(id: number): void {
    this.nextVariableId = Math.max(this.nextVariableId, toIndex(id, 'MathOpt next variable ID'));
  }

  hasVariable(id: number): boolean {
    return !!this.getVariable(id);
  }

  getVariable(id: number): MathOptVariable | undefined {
    const variable = this.variableData.get(id);
    if (variable && !variable.deleted) return createMathOptVariable(this, variable);
    return undefined;
  }

  linearConstraints(): MathOptLinearConstraint[] {
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted)
      .map((constraint) => createMathOptLinearConstraint(this, constraint));
  }

  getNumLinearConstraints(): number {
    return this.linearConstraints().length;
  }

  getNextLinearConstraintId(): number {
    return this.nextLinearConstraintId;
  }

  ensureNextLinearConstraintIdAtLeast(id: number): void {
    this.nextLinearConstraintId = Math.max(this.nextLinearConstraintId, toIndex(id, 'MathOpt next linear constraint ID'));
  }

  hasLinearConstraint(id: number): boolean {
    return !!this.getLinearConstraint(id);
  }

  getLinearConstraint(id: number): MathOptLinearConstraint | undefined {
    const constraint = this.constraints.get(id);
    if (constraint && !constraint.deleted) return createMathOptLinearConstraint(this, constraint);
    return undefined;
  }

  maximize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(true, terms, offset));
  }

  minimize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(false, terms, offset));
  }

  maximizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, true, offset);
  }

  minimizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, false, offset);
  }

  setObjective(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(isMaximize, terms, offset));
  }

  setLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.setObjectiveData(undefined, linearObjectiveData(isMaximize, terms, offset));
  }

  columnNonzeros(variable: MathOptVariable): MathOptLinearConstraint[] {
    this.assertOwnsVariable(variable);
    variable.assertLive();
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted && constraint.terms.some((term) => term.variable.id === variable.id && term.coefficient !== 0))
      .map((constraint) => createMathOptLinearConstraint(this, constraint));
  }

  rowNonzeros(constraint: MathOptLinearConstraint): MathOptVariable[] {
    this.assertOwnsConstraint(constraint);
    constraint.assertLive();
    return constraint.terms().map((term) => term.variable);
  }

  linearConstraintMatrixEntries(): MathOptLinearConstraintMatrixEntry[] {
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted)
      .flatMap((constraint) => {
        const linearConstraint = createMathOptLinearConstraint(this, constraint);
        return constraint.terms
          .filter((term) => term.coefficient !== 0)
          .map((term) => ({
            linearConstraint,
            variable: term.variable,
            coefficient: term.coefficient,
          }));
      });
  }

  private validateObjectiveData(value: MathOptObjectiveData): void {
    for (const term of value.linearTerms) this.assertOwnsVariable(term.variable);
    for (const term of value.quadraticTerms) {
      this.assertOwnsVariable(term.firstVariable);
      this.assertOwnsVariable(term.secondVariable);
    }
  }

  private snapshot(): MathOptModelSnapshot {
    const sosSnapshot = (kind: MathOptSosConstraintKind): MathOptSosConstraintSnapshot[] =>
      [...this.sosConstraintData[kind].values()].map(data => ({ id: data.id, name: data.name, deleted: data.deleted,
        weights: [...data.weights], expressions: data.expressions.map(linearExpressionSnapshot) }));
    return {
      sos1Constraints: sosSnapshot('sos1'), sos2Constraints: sosSnapshot('sos2'),
      secondOrderConeConstraints: [...this.secondOrderConeConstraintData.values()].map(data => ({
        id: data.id, name: data.name, deleted: data.deleted, upperBound: linearExpressionSnapshot(data.upperBound),
        argumentsToNorm: data.argumentsToNorm.map(linearExpressionSnapshot),
      })),
      variables: [...this.variableData.values()].map((variable) => ({ ...variable })),
      linearConstraints: [...this.constraints.values()].map((constraint) => ({
        id: constraint.id,
        lowerBound: constraint.lowerBound,
        upperBound: constraint.upperBound,
        terms: constraint.terms.map((term) => ({
          variableId: term.variable.id,
          coefficient: term.coefficient,
        })),
        name: constraint.name,
        deleted: constraint.deleted,
      })),
      quadraticConstraints: [...this.quadraticConstraintData.values()].map(data => ({
        id: data.id, lowerBound: data.lowerBound, upperBound: data.upperBound,
        name: data.name, deleted: data.deleted,
        linearTerms: data.linearTerms.map(term => ({ variableId: term.variable.id, coefficient: term.coefficient })),
        quadraticTerms: data.quadraticTerms.map(term => ({
          firstVariableId: Math.min(term.firstVariable.id, term.secondVariable.id),
          secondVariableId: Math.max(term.firstVariable.id, term.secondVariable.id), coefficient: term.coefficient,
        })),
      })),
      indicatorConstraints: [...this.indicatorConstraintData.values()].map((constraint) => ({
        id: constraint.id,
        indicatorId: constraint.indicator?.id,
        activateOnZero: constraint.activateOnZero,
        lowerBound: constraint.lowerBound,
        upperBound: constraint.upperBound,
        terms: constraint.terms.map((term) => ({
          variableId: term.variable.id,
          coefficient: term.coefficient,
        })),
        name: constraint.name,
        deleted: constraint.deleted,
      })),
      objective: objectiveSnapshot(this.objectiveDataValue, this.primaryObjectiveNameValue, this.primaryObjectivePriority),
      auxiliaryObjectives: [...this.auxiliaryObjectiveData.values()].map(data =>
        ({ id: data.id, deleted: data.deleted, ...objectiveSnapshot(data.objective, data.name, data.priority) })),
    };
  }

  assertOwnsVariable(variable: MathOptVariable): void {
    const record = variableRecord(variable);
    if (!record || variable.model !== this || this.variableData.get(variable.id) !== record) {
      throw new Error('Variable belongs to a different MathOpt model or is not registered.');
    }
    variable.assertLive();
  }

  assertOwnsConstraint(constraint: MathOptLinearConstraint): void {
    const record = linearConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.constraints.get(constraint.id) !== record) {
      throw new Error('Linear constraint belongs to a different MathOpt model or is not registered.');
    }
    constraint.assertLive();
  }

  async exportMps(options: MathOptMpsExportOptions = {}): Promise<string> {
    const { removeNames, ...execution } = options;
    const bytes = this.encodeModelProto({ removeNames });
    const { modelProtoToMps } = await import('./execution.js');
    return modelProtoToMps(bytes, execution);
  }

  static async fromMps(mps: string, options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    options = { ...options };
    const { mpsToModelProto } = await import('./execution.js');
    return MathOptModel.fromModelProto(await mpsToModelProto(mps, options), options);
  }

  encodeModelProto(options: { removeNames?: boolean } = {}): Uint8Array {
    return encodeModelSnapshot(this.name, this.snapshot(), options);
  }

}

let createUpdateTracker: (exportUpdate: MathOptUpdateTracker['exportUpdate'], advanceCheckpoint: () => void) => MathOptUpdateTracker;

export class MathOptUpdateTracker {
  private constructor(
    readonly exportUpdate: (options?: { removeNames?: boolean }) => Uint8Array | null,
    readonly advanceCheckpoint: () => void,
  ) {}

  static { createUpdateTracker = (exportUpdate, advanceCheckpoint) => new MathOptUpdateTracker(exportUpdate, advanceCheckpoint); }
}

const linearConstraintRecords = new WeakMap<MathOptLinearConstraint, LinearConstraintData>();

const quadraticConstraintRecords = new WeakMap<MathOptQuadraticConstraint, QuadraticConstraintData>();

const indicatorConstraintRecords = new WeakMap<MathOptIndicatorConstraint, IndicatorConstraintData>();

let createMathOptLinearConstraint: (model: MathOptModel, data: LinearConstraintData) => MathOptLinearConstraint;

export class MathOptLinearConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: LinearConstraintData) { linearConstraintRecords.set(this, data); }
  static { createMathOptLinearConstraint = modelHandleFactory((model, data: LinearConstraintData) => new MathOptLinearConstraint(model, data)); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  set lowerBound(value: number) {
    this.assertLive();
    this.data.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  setCoefficient(variable: MathOptVariable, coefficient: number): void {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    const existingIndex = this.data.terms.findIndex((term) => term.variable.id === variable.id);
    if (coefficient === 0) {
      if (existingIndex >= 0) this.data.terms.splice(existingIndex, 1);
      return;
    }
    const term = { variable, coefficient };
    if (existingIndex >= 0) {
      this.data.terms[existingIndex] = term;
    } else {
      this.data.terms.push(term);
    }
  }

  getCoefficient(variable: MathOptVariable): number {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    return this.data.terms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  terms(): MathOptLinearTerm[] {
    this.assertLive();
    return this.data.terms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  asBoundedLinearExpression(): MathOptBoundedExpression<MathOptLinearExpression> {
    this.assertLive();
    return new MathOptBoundedExpression(
      this.lowerBound,
      new MathOptLinearExpression(this.terms()),
      this.upperBound,
    );
  }

  equals(other: MathOptLinearConstraint): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `linear_constraint_${this.id}`;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Linear constraint ${this.id} has been deleted.`);
    }
  }
}

let createMathOptQuadraticConstraint: (model: MathOptModel, data: QuadraticConstraintData) => MathOptQuadraticConstraint;

export class MathOptQuadraticConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: QuadraticConstraintData) { quadraticConstraintRecords.set(this, data); }
  static { createMathOptQuadraticConstraint = modelHandleFactory((model, data: QuadraticConstraintData) => new MathOptQuadraticConstraint(model, data)); }
  get id(): number { return this.data.id; }
  get name(): string { this.assertLive(); return this.data.name; }
  get lowerBound(): number { this.assertLive(); return this.data.lowerBound; }
  get upperBound(): number { this.assertLive(); return this.data.upperBound; }
  linearTerms(): MathOptLinearTerm[] { this.assertLive(); return this.data.linearTerms.map(term => ({ ...term })); }
  quadraticTerms(): MathOptQuadraticTerm[] { this.assertLive(); return this.data.quadraticTerms.map(term => ({ ...term })); }
  getLinearCoefficient(variable: MathOptVariable): number {
    this.assertLive(); this.model.assertOwnsVariable(variable);
    return this.data.linearTerms.find(term => term.variable.id === variable.id)?.coefficient ?? 0;
  }
  getQuadraticCoefficient(first: MathOptVariable, second: MathOptVariable): number {
    this.assertLive(); this.model.assertOwnsVariable(first); this.model.assertOwnsVariable(second);
    return this.data.quadraticTerms.find(term =>
      (term.firstVariable.id === first.id && term.secondVariable.id === second.id)
      || (term.firstVariable.id === second.id && term.secondVariable.id === first.id))?.coefficient ?? 0;
  }
  assertLive(): void {
    if (this.data.deleted) throw new Error(`Quadratic constraint ${this.id} has been deleted.`);
  }
  equals(other: unknown): boolean {
    return other instanceof MathOptQuadraticConstraint && other.model === this.model && other.id === this.id;
  }
}

const sosConstraintRecords = new WeakMap<MathOptSosConstraint, SosConstraintData>();

let createMathOptSosConstraint: (model: MathOptModel, data: SosConstraintData) => MathOptSosConstraint;

export class MathOptSosConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: SosConstraintData) { sosConstraintRecords.set(this, data); }
  static { createMathOptSosConstraint = modelHandleFactory((model, data: SosConstraintData) => new MathOptSosConstraint(model, data)); }
  get id(): number { return this.data.id; }
  get kind(): MathOptSosConstraintKind { return this.data.kind; }
  get name(): string { this.assertLive(); return this.data.name; }
  expressions(): MathOptLinearExpression[] {
    this.assertLive();
    return this.data.expressions.map(expression => new MathOptLinearExpression(linearTermEntries(expression), expression.offset));
  }
  weights(): number[] { this.assertLive(); return [...this.data.weights]; }
  assertLive(): void { if (this.data.deleted) throw new Error(`SOS constraint ${this.id} has been deleted.`); }
  equals(other: unknown): boolean {
    return other instanceof MathOptSosConstraint && other.model === this.model && other.kind === this.kind && other.id === this.id;
  }
}

const secondOrderConeConstraintRecords = new WeakMap<MathOptSecondOrderConeConstraint, SecondOrderConeConstraintData>();

let createMathOptSecondOrderConeConstraint: (model: MathOptModel, data: SecondOrderConeConstraintData) => MathOptSecondOrderConeConstraint;

export class MathOptSecondOrderConeConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: SecondOrderConeConstraintData) { secondOrderConeConstraintRecords.set(this, data); }
  static { createMathOptSecondOrderConeConstraint = modelHandleFactory((model, data: SecondOrderConeConstraintData) => new MathOptSecondOrderConeConstraint(model, data)); }
  get id(): number { return this.data.id; }
  get name(): string { this.assertLive(); return this.data.name; }
  get upperBound(): MathOptLinearExpression {
    this.assertLive(); return new MathOptLinearExpression(linearTermEntries(this.data.upperBound), this.data.upperBound.offset);
  }
  argumentsToNorm(): MathOptLinearExpression[] {
    this.assertLive(); return this.data.argumentsToNorm.map(expression => new MathOptLinearExpression(linearTermEntries(expression), expression.offset));
  }
  assertLive(): void { if (this.data.deleted) throw new Error(`Second-order cone constraint ${this.id} has been deleted.`); }
  equals(other: unknown): boolean {
    return other instanceof MathOptSecondOrderConeConstraint && other.model === this.model && other.id === this.id;
  }
}

let createMathOptIndicatorConstraint: (model: MathOptModel, data: IndicatorConstraintData) => MathOptIndicatorConstraint;

export class MathOptIndicatorConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: IndicatorConstraintData) { indicatorConstraintRecords.set(this, data); }
  static { createMathOptIndicatorConstraint = modelHandleFactory((model, data: IndicatorConstraintData) => new MathOptIndicatorConstraint(model, data)); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get indicator(): MathOptVariable | undefined {
    this.assertLive();
    return this.data.indicator;
  }

  get activateOnZero(): boolean {
    this.assertLive();
    return this.data.activateOnZero;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  terms(): MathOptLinearTerm[] {
    this.assertLive();
    return this.data.terms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  getCoefficient(variable: MathOptVariable): number {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    return this.data.terms.find(term => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  getImpliedConstraint(): MathOptBoundedExpression<MathOptLinearExpression> {
    this.assertLive();
    return boundedExpression(this.lowerBound, new MathOptLinearExpression(this.terms()), this.upperBound);
  }

  equals(other: unknown): boolean {
    return other instanceof MathOptIndicatorConstraint && other.model === this.model && other.id === this.id;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Indicator constraint ${this.id} has been deleted.`);
    }
  }
}

const objectiveIds = new WeakMap<MathOptObjective, number | undefined>();

let createMathOptObjective: (model: MathOptModel) => MathOptObjective;

let createMathOptAuxiliaryObjective: (model: MathOptModel, id: number) => MathOptAuxiliaryObjective;

export class MathOptObjective {
  protected constructor(readonly model: MathOptModel, private readonly auxiliaryId?: number) {
    objectiveIds.set(this, auxiliaryId);
  }
  static { createMathOptObjective = model => new MathOptObjective(model); }

  private get data(): MathOptObjectiveData { return objectiveStorage(this.model).getData(this.auxiliaryId); }
  private set data(value: MathOptObjectiveData) { objectiveStorage(this.model).setData(this.auxiliaryId, value); }

  assertLive(): void {
    if (!objectiveIds.has(this)) throw new Error('Objective is not registered.');
    objectiveStorage(this.model).getData(this.auxiliaryId);
  }

  get priority(): bigint { return objectiveStorage(this.model).priority(this.auxiliaryId); }
  set priority(value: IntValue) { objectiveStorage(this.model).setPriority(this.auxiliaryId, value); }

  get isMaximize(): boolean {
    return this.data.maximize;
  }

  set isMaximize(value: boolean) {
    this.data.maximize = value;
  }

  get offset(): number {
    return this.data.offset;
  }

  set offset(value: number) {
    this.data.offset = value;
  }

  get name(): string {
    return objectiveStorage(this.model).name(this.auxiliaryId);
  }

  clear(): void {
    this.data = { maximize: this.isMaximize, linearTerms: [], quadraticTerms: [], offset: 0 };
  }

  setLinearCoefficient(variable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(variable);
    const terms = this.data.linearTerms;
    const index = terms.findIndex(term => term.variable.id === variable.id);
    if (coefficient === 0) {
      if (index >= 0) terms.splice(index, 1);
    } else if (index >= 0) terms[index] = { variable, coefficient };
    else terms.push({ variable, coefficient });
  }

  getLinearCoefficient(variable: MathOptVariable): number {
    this.model.assertOwnsVariable(variable);
    return this.data.linearTerms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  linearTerms(): MathOptLinearTerm[] {
    return this.data.linearTerms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  setQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const terms = this.data.quadraticTerms;
    if (this.auxiliaryId !== undefined && coefficient !== 0) throw new Error('Quadratic auxiliary objectives are not supported.');
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    const index = terms.findIndex(term =>
      Math.min(term.firstVariable.id, term.secondVariable.id) === key.firstVariable.id &&
      Math.max(term.firstVariable.id, term.secondVariable.id) === key.secondVariable.id);
    if (coefficient === 0) {
      if (index >= 0) terms.splice(index, 1);
    } else {
      const term = { firstVariable: key.firstVariable, secondVariable: key.secondVariable, coefficient };
      if (index >= 0) terms[index] = term;
      else terms.push(term);
    }
  }

  getQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable): number {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    return this.data.quadraticTerms.find(term =>
      Math.min(term.firstVariable.id, term.secondVariable.id) === key.firstVariable.id &&
      Math.max(term.firstVariable.id, term.secondVariable.id) === key.secondVariable.id)?.coefficient ?? 0;
  }

  quadraticTerms(): MathOptQuadraticTerm[] {
    return this.data.quadraticTerms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  asLinearExpression(): MathOptLinearExpression {
    if (!this.isLinear()) throw new TypeError('Cannot get a quadratic objective as a linear expression.');
    return new MathOptLinearExpression(this.linearTerms(), this.offset);
  }

  asQuadraticExpression(): MathOptQuadraticExpression {
    return new MathOptQuadraticExpression(this.linearTerms(), this.quadraticTerms(), this.offset);
  }

  isLinear(): boolean { return this.quadraticTerms().length === 0; }

  setToLinearExpression(expr: MathOptLinearExpressionInput): void {
    this.data = linearObjectiveData(this.isMaximize, expr, 0);
  }

  setToExpression(expr: MathOptQuadraticExpressionInput): void {
    this.data = objectiveData(this.isMaximize, expr, 0);
  }

  add(expr: MathOptQuadraticExpressionInput): void {
    this.setToExpression(this.asQuadraticExpression().add(expr));
  }

  addLinear(expr: MathOptLinearExpressionInput): void {
    this.add(asFlatLinearExpression(expr));
  }

  equals(other: unknown): boolean {
    return other instanceof MathOptObjective && this.model === other.model && this.auxiliaryId === other.auxiliaryId;
  }
}

export class MathOptAuxiliaryObjective extends MathOptObjective {
  private constructor(model: MathOptModel, readonly id: number) { super(model, id); }
  static { createMathOptAuxiliaryObjective = (model, id) => new MathOptAuxiliaryObjective(model, id); }

  override setQuadraticCoefficient(_first: MathOptVariable, _second: MathOptVariable, _coefficient: number): never {
    throw new Error('Quadratic auxiliary objectives are not supported.');
  }
}

function objectivePriority(value: IntValue): bigint {
  const priority = toInt64(value, 'MathOpt objective priority');
  if (priority < 0n) throw new RangeError('MathOpt objective priority must be nonnegative.');
  return priority;
}

function objectiveSnapshot(data: MathOptObjectiveData, name: string, priority: bigint): MathOptObjectiveSnapshot {
  return { name, priority, maximize: data.maximize, offset: data.offset,
    linearTerms: data.linearTerms.map(term => ({ variableId: term.variable.id, coefficient: term.coefficient })),
    quadraticTerms: data.quadraticTerms.map(term => ({
      firstVariableId: Math.min(term.firstVariable.id, term.secondVariable.id),
      secondVariableId: Math.max(term.firstVariable.id, term.secondVariable.id), coefficient: term.coefficient,
    })) };
}

function objectiveData(
  maximize: boolean,
  terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[],
  offset: number,
): MathOptObjectiveData {
  const expression = Array.isArray(terms)
    ? new MathOptLinearExpression(terms, offset)
    : asFlatQuadraticExpression(terms).add(offset);
  if (expression instanceof MathOptLinearExpression) {
    return {
      maximize,
      linearTerms: linearTermEntries(expression),
      quadraticTerms: [],
      offset: expression.offset,
    };
  }
  return {
    maximize,
    linearTerms: linearTermEntriesFromMap(expression.linearTerms),
    quadraticTerms: quadraticTermEntries(expression),
    offset: expression.offset,
  };
}

function linearObjectiveData(
  maximize: boolean,
  terms: MathOptLinearExpressionInput | MathOptLinearTerm[],
  offset: number,
): MathOptObjectiveData {
  const expression = Array.isArray(terms)
    ? new MathOptLinearExpression(terms, offset)
    : asFlatLinearExpression(terms).add(offset);
  return {
    maximize,
    linearTerms: linearTermEntries(expression),
    quadraticTerms: [],
    offset: expression.offset,
  };
}

function linearExpressionSnapshot(expression: MathOptLinearExpression): MathOptLinearExpressionSnapshot {
  return { offset: expression.offset, terms: linearTermEntries(expression).map(term => ({ variableId: term.variable.id, coefficient: term.coefficient })) };
}

export function objectiveId(objective: MathOptObjective): number | undefined { return objectiveIds.get(objective); }

export function snapshotModel(model: MathOptModel): MathOptModelSnapshot { return captureModelSnapshot(model); }
