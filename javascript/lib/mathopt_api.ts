import type { MainModule } from '#internal-wasm/cp_sat_runtime.js';
import { loadRuntime } from './runtime_loader.js';
import type { WorkerResponse } from './worker_protocol.js';
import {
  setWorkerBridgeEnabled,
  nextWorkerBridgeRequestId,
  postWorkerRequest,
  shouldUseWorkerBridge,
} from './worker_bridge.js';

type WireValue = Uint8Array;

export type MathOptLinearTerm = {
  variable: MathOptVariable;
  coefficient: number;
};

export type MathOptQuadraticTerm = {
  firstVariable: MathOptVariable;
  secondVariable: MathOptVariable;
  coefficient: number;
};

export type MathOptLinearExpressionInput =
  | number
  | MathOptVariable
  | MathOptLinearTerm
  | MathOptLinearExpression;

export type MathOptQuadraticExpressionInput =
  | MathOptLinearExpressionInput
  | MathOptQuadraticTerm
  | MathOptQuadraticExpression;

export type MathOptLinearConstraintOptions = {
  lowerBound?: number;
  upperBound?: number;
  terms?: MathOptLinearTerm[];
  expression?: MathOptLinearExpressionInput;
  name?: string;
};

export type MathOptVariableOptions = {
  lowerBound?: number;
  upperBound?: number;
  integer?: boolean;
  name?: string;
};

export type MathOptSolveOptions = {
  solverType?: MathOptSolverType | keyof typeof MathOptSolverType;
  threads?: number;
};

export type MathOptSolveResult = {
  terminationReason: string;
  objectiveValue: number | null;
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
  rawResponse: Uint8Array;
};

export class MathOptVarEqVar {
  readonly firstVariable: MathOptVariable;
  readonly secondVariable: MathOptVariable;

  constructor(firstVariable: MathOptVariable, secondVariable: MathOptVariable) {
    if (firstVariable.model !== secondVariable.model) {
      throw new Error('Variables belong to different MathOpt models.');
    }
    this.firstVariable = firstVariable;
    this.secondVariable = secondVariable;
  }

  get first_variable(): MathOptVariable {
    return this.firstVariable;
  }

  get second_variable(): MathOptVariable {
    return this.secondVariable;
  }

  assertNotBoolean(): never {
    throw new TypeError('Cannot convert MathOpt variable equality expression to boolean.');
  }
}

type VariableData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  integer: boolean;
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

export enum MathOptSolverType {
  GSCIP = 1,
  GUROBI = 2,
  GLOP = 3,
  CP_SAT = 4,
  PDLP = 5,
  GLPK = 6,
  OSQP = 7,
  ECOS = 8,
  SCS = 9,
  HIGHS = 10,
  SANTORINI = 11,
  XPRESS = 13,
}

export class MathOptQuadraticTermKey {
  readonly firstVariable: MathOptVariable;
  readonly secondVariable: MathOptVariable;

  constructor(firstVariable: MathOptVariable, secondVariable: MathOptVariable) {
    if (firstVariable.model !== secondVariable.model) {
      throw new Error('Quadratic term variables belong to different MathOpt models.');
    }
    if (firstVariable.id <= secondVariable.id) {
      this.firstVariable = firstVariable;
      this.secondVariable = secondVariable;
    } else {
      this.firstVariable = secondVariable;
      this.secondVariable = firstVariable;
    }
  }

  equals(other: MathOptQuadraticTermKey): boolean {
    return this.firstVariable.equals(other.firstVariable)
      && this.secondVariable.equals(other.secondVariable);
  }

  toString(): string {
    return `${this.firstVariable.toString()} * ${this.secondVariable.toString()}`;
  }
}

export class MathOptLinearExpression {
  readonly offset: number;
  readonly terms: ReadonlyMap<MathOptVariable, number>;

  constructor(terms: Iterable<MathOptLinearTerm> | MathOptLinearExpressionInput = [], offset = 0) {
    if (typeof terms === 'number') {
      this.terms = readonlyMap(new Map());
      this.offset = terms;
      return;
    }
    if (terms instanceof MathOptLinearExpression || terms instanceof MathOptVariable || isLinearTerm(terms)) {
      const expression = asFlatLinearExpression(terms);
      this.terms = expression.terms;
      this.offset = expression.offset + offset;
      return;
    }
    const merged = new Map<MathOptVariable, number>();
    for (const term of terms) {
      if (!isLinearTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const existing = findVariableKey(merged, term.variable);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(term.variable, next);
    }
    this.terms = readonlyMap(merged);
    this.offset = offset;
  }

  add(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    const rhs = asFlatLinearExpression(input);
    return new MathOptLinearExpression([
      ...linearTermEntries(this),
      ...linearTermEntries(rhs),
    ], this.offset + rhs.offset);
  }

  subtract(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    return this.add(asFlatLinearExpression(input).multiply(-1));
  }

  multiply(coefficient: number): MathOptLinearExpression {
    return new MathOptLinearExpression(
      linearTermEntries(this).map((term) => ({
        variable: term.variable,
        coefficient: term.coefficient * coefficient,
      })),
      this.offset * coefficient,
    );
  }

  toString(): string {
    return formatExpression(this.offset, linearTermEntries(this), []);
  }

  evaluate(variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>): number {
    return evaluateExpression(this, variableValues);
  }
}

export class MathOptQuadraticExpression {
  readonly offset: number;
  readonly linearTerms: ReadonlyMap<MathOptVariable, number>;
  readonly quadraticTerms: ReadonlyMap<MathOptQuadraticTermKey, number>;

  constructor(
    linearTerms: Iterable<MathOptLinearTerm> | MathOptQuadraticExpressionInput = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ) {
    if (
      typeof linearTerms === 'number'
      || linearTerms instanceof MathOptVariable
      || linearTerms instanceof MathOptLinearExpression
      || linearTerms instanceof MathOptQuadraticExpression
      || isLinearTerm(linearTerms)
      || isQuadraticTerm(linearTerms)
    ) {
      const expression = asFlatQuadraticExpression(linearTerms);
      this.linearTerms = expression.linearTerms;
      this.quadraticTerms = expression.quadraticTerms;
      this.offset = expression.offset + offset;
      return;
    }
    this.linearTerms = new MathOptLinearExpression(linearTerms).terms;
    const merged = new Map<MathOptQuadraticTermKey, number>();
    for (const term of quadraticTerms) {
      if (!isQuadraticTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const key = new MathOptQuadraticTermKey(term.firstVariable, term.secondVariable);
      const existing = findQuadraticKey(merged, key);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(key, next);
    }
    this.quadraticTerms = readonlyMap(merged);
    this.offset = offset;
  }

  add(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    const rhs = asFlatQuadraticExpression(input);
    return new MathOptQuadraticExpression(
      [...linearTermEntriesFromMap(this.linearTerms), ...linearTermEntriesFromMap(rhs.linearTerms)],
      [...quadraticTermEntries(this), ...quadraticTermEntries(rhs)],
      this.offset + rhs.offset,
    );
  }

  subtract(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    return this.add(asFlatQuadraticExpression(input).multiply(-1));
  }

  multiply(coefficient: number): MathOptQuadraticExpression {
    return new MathOptQuadraticExpression(
      linearTermEntriesFromMap(this.linearTerms).map((term) => ({
        variable: term.variable,
        coefficient: term.coefficient * coefficient,
      })),
      quadraticTermEntries(this).map((term) => ({
        firstVariable: term.firstVariable,
        secondVariable: term.secondVariable,
        coefficient: term.coefficient * coefficient,
      })),
      this.offset * coefficient,
    );
  }

  evaluate(variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>): number {
    return evaluateExpression(this, variableValues);
  }

  toString(): string {
    return formatExpression(this.offset, linearTermEntriesFromMap(this.linearTerms), quadraticTermEntries(this));
  }
}

export class MathOptBoundedExpression<TExpression = unknown> {
  constructor(
    readonly lowerBound: number,
    readonly expression: TExpression,
    readonly upperBound: number,
  ) {}

  get lower_bound(): number {
    return this.lowerBound;
  }

  get upper_bound(): number {
    return this.upperBound;
  }

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
  }

  toString(): string {
    return `${formatBound(this.lowerBound)} <= ${String(this.expression)} <= ${formatBound(this.upperBound)}`;
  }
}

export class MathOptLowerBoundedExpression<TExpression = unknown> {
  readonly upperBound = Number.POSITIVE_INFINITY;

  constructor(
    readonly lowerBound: number,
    readonly expression: TExpression,
  ) {}

  get lower_bound(): number {
    return this.lowerBound;
  }

  get upper_bound(): number {
    return this.upperBound;
  }

  toBoundedExpression(upperBound: number): MathOptBoundedExpression<TExpression> {
    return new MathOptBoundedExpression(this.lowerBound, this.expression, upperBound);
  }

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
  }

  toString(): string {
    return `${String(this.expression)} >= ${formatBound(this.lowerBound)}`;
  }
}

export class MathOptUpperBoundedExpression<TExpression = unknown> {
  readonly lowerBound = Number.NEGATIVE_INFINITY;

  constructor(
    readonly expression: TExpression,
    readonly upperBound: number,
  ) {}

  get lower_bound(): number {
    return this.lowerBound;
  }

  get upper_bound(): number {
    return this.upperBound;
  }

  toBoundedExpression(lowerBound: number): MathOptBoundedExpression<TExpression> {
    return new MathOptBoundedExpression(lowerBound, this.expression, this.upperBound);
  }

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
  }

  toString(): string {
    return `${String(this.expression)} <= ${formatBound(this.upperBound)}`;
  }
}

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

let mathOptModulePromise: Promise<MainModule> | null = null;

function loadMathOptModule(): Promise<MainModule> {
  mathOptModulePromise ??= loadRuntime();
  return mathOptModulePromise;
}

export class MathOptModel {
  readonly name: string;
  private readonly variableData: VariableData[] = [];
  private readonly constraints: LinearConstraintData[] = [];
  private objective: { maximize: boolean; terms: MathOptLinearTerm[]; offset: number } = {
    maximize: false,
    terms: [],
    offset: 0,
  };

  constructor(name = '') {
    this.name = name;
  }

  addVariable(options: MathOptVariableOptions = {}): MathOptVariable {
    const id = this.variableData.length;
    const variable: VariableData = {
      id,
      lowerBound: options.lowerBound ?? Number.NEGATIVE_INFINITY,
      upperBound: options.upperBound ?? Number.POSITIVE_INFINITY,
      integer: options.integer ?? false,
      name: options.name ?? '',
      deleted: false,
    };
    this.variableData.push(variable);
    return new MathOptVariable(this, variable);
  }

  add_variable(options: MathOptVariableOptions = {}): MathOptVariable {
    return this.addVariable(options);
  }

  addIntegerVariable(options: Omit<MathOptVariableOptions, 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, integer: true });
  }

  add_integer_variable(options: Omit<MathOptVariableOptions, 'integer'> = {}): MathOptVariable {
    return this.addIntegerVariable(options);
  }

  addBinaryVariable(options: Omit<MathOptVariableOptions, 'lowerBound' | 'upperBound' | 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, lowerBound: 0, upperBound: 1, integer: true });
  }

  add_binary_variable(options: Omit<MathOptVariableOptions, 'lowerBound' | 'upperBound' | 'integer'> = {}): MathOptVariable {
    return this.addBinaryVariable(options);
  }

  addLinearConstraint(options: Partial<MathOptLinearConstraintOptions> = {}): MathOptLinearConstraint {
    const id = this.constraints.length;
    const expression = options.expression === undefined
      ? new MathOptLinearExpression(options.terms ?? [])
      : asFlatLinearExpression(options.expression).add(new MathOptLinearExpression(options.terms ?? []));
    const constraint: LinearConstraintData = {
      id,
      lowerBound: (options.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (options.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: options.name ?? '',
      deleted: false,
    };
    this.constraints.push(constraint);
    return new MathOptLinearConstraint(this, constraint);
  }

  add_linear_constraint(options: Partial<MathOptLinearConstraintOptions> = {}): MathOptLinearConstraint {
    return this.addLinearConstraint(options);
  }

  deleteVariable(variable: MathOptVariable): void {
    this.assertOwnsVariable(variable);
    if (variable.data.deleted) {
      throw new Error(`Variable ${variable.id} has already been deleted.`);
    }
    variable.data.deleted = true;
    for (const constraint of this.constraints) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
    }
    this.objective.terms = this.objective.terms.filter((term) => term.variable.id !== variable.id);
  }

  delete_variable(variable: MathOptVariable): void {
    this.deleteVariable(variable);
  }

  deleteLinearConstraint(constraint: MathOptLinearConstraint): void {
    this.assertOwnsConstraint(constraint);
    if (constraint.data.deleted) {
      throw new Error(`Linear constraint ${constraint.id} has already been deleted.`);
    }
    constraint.data.deleted = true;
  }

  delete_linear_constraint(constraint: MathOptLinearConstraint): void {
    this.deleteLinearConstraint(constraint);
  }

  variablesList(): MathOptVariable[] {
    return this.variableData
      .filter((variable) => !variable.deleted)
      .map((variable) => new MathOptVariable(this, variable));
  }

  variables(): MathOptVariable[] {
    return this.variablesList();
  }

  getNumVariables(): number {
    return this.variablesList().length;
  }

  get_num_variables(): number {
    return this.getNumVariables();
  }

  getNextVariableId(): number {
    return this.variableData.length;
  }

  get_next_variable_id(): number {
    return this.getNextVariableId();
  }

  ensureNextVariableIdAtLeast(id: number): void {
    while (this.variableData.length < id) {
      const placeholderId = this.variableData.length;
      this.variableData.push({
        id: placeholderId,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        integer: false,
        name: '',
        deleted: true,
      });
    }
  }

  ensure_next_variable_id_at_least(id: number): void {
    this.ensureNextVariableIdAtLeast(id);
  }

  hasVariable(id: number): boolean {
    return !!this.getVariable(id);
  }

  has_variable(id: number): boolean {
    return this.hasVariable(id);
  }

  getVariable(id: number): MathOptVariable | undefined {
    const variable = this.variableData[id];
    return variable && !variable.deleted ? new MathOptVariable(this, variable) : undefined;
  }

  get_variable(id: number): MathOptVariable {
    const variable = this.getVariable(id);
    if (!variable) throw new Error(`Variable ${id} does not exist.`);
    return variable;
  }

  linearConstraints(): MathOptLinearConstraint[] {
    return this.constraints
      .filter((constraint) => !constraint.deleted)
      .map((constraint) => new MathOptLinearConstraint(this, constraint));
  }

  linear_constraints(): MathOptLinearConstraint[] {
    return this.linearConstraints();
  }

  getNumLinearConstraints(): number {
    return this.linearConstraints().length;
  }

  get_num_linear_constraints(): number {
    return this.getNumLinearConstraints();
  }

  getNextLinearConstraintId(): number {
    return this.constraints.length;
  }

  get_next_linear_constraint_id(): number {
    return this.getNextLinearConstraintId();
  }

  ensureNextLinearConstraintIdAtLeast(id: number): void {
    while (this.constraints.length < id) {
      const placeholderId = this.constraints.length;
      this.constraints.push({
        id: placeholderId,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        terms: [],
        name: '',
        deleted: true,
      });
    }
  }

  ensure_next_linear_constraint_id_at_least(id: number): void {
    this.ensureNextLinearConstraintIdAtLeast(id);
  }

  hasLinearConstraint(id: number): boolean {
    return !!this.getLinearConstraint(id);
  }

  has_linear_constraint(id: number): boolean {
    return this.hasLinearConstraint(id);
  }

  getLinearConstraint(id: number): MathOptLinearConstraint | undefined {
    const constraint = this.constraints[id];
    return constraint && !constraint.deleted ? new MathOptLinearConstraint(this, constraint) : undefined;
  }

  get_linear_constraint(id: number): MathOptLinearConstraint {
    const constraint = this.getLinearConstraint(id);
    if (!constraint) throw new Error(`Linear constraint ${id} does not exist.`);
    return constraint;
  }

  maximize(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    const expression = Array.isArray(terms)
      ? new MathOptLinearExpression(terms, offset)
      : asFlatLinearExpression(terms).add(offset);
    this.objective = { maximize: true, terms: linearTermEntries(expression), offset: expression.offset };
  }

  minimize(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    const expression = Array.isArray(terms)
      ? new MathOptLinearExpression(terms, offset)
      : asFlatLinearExpression(terms).add(offset);
    this.objective = { maximize: false, terms: linearTermEntries(expression), offset: expression.offset };
  }

  variableName(id: number): string {
    return this.variableData[id]?.name ?? String(id);
  }

  assertOwnsVariable(variable: MathOptVariable): void {
    if (variable.model !== this) {
      throw new Error('Variable belongs to a different MathOpt model.');
    }
  }

  assertOwnsConstraint(constraint: MathOptLinearConstraint): void {
    if (constraint.model !== this) {
      throw new Error('Linear constraint belongs to a different MathOpt model.');
    }
  }

  encodeModelProto(): Uint8Array {
    return message([
      fieldString(1, this.name),
      fieldMessage(2, this.encodeVariables()),
      fieldMessage(3, this.encodeObjective()),
      fieldMessage(4, this.encodeLinearConstraints()),
      fieldMessage(5, this.encodeLinearConstraintMatrix()),
    ]);
  }

  private encodeVariables(): Uint8Array {
    const activeVariables = this.variableData.filter((variable) => !variable.deleted);
    return message([
      fieldPackedVarints(1, activeVariables.map((variable) => variable.id)),
      fieldPackedDoubles(2, activeVariables.map((variable) => variable.lowerBound)),
      fieldPackedDoubles(3, activeVariables.map((variable) => variable.upperBound)),
      fieldPackedBools(4, activeVariables.map((variable) => variable.integer)),
      ...activeVariables.map((variable) => fieldString(5, variable.name)),
    ]);
  }

  private encodeObjective(): Uint8Array {
    return message([
      fieldBool(1, this.objective.maximize),
      fieldDouble(2, this.objective.offset),
      fieldMessage(3, encodeSparseDoubleVector(this.objective.terms)),
    ]);
  }

  private encodeLinearConstraints(): Uint8Array {
    const activeConstraints = this.constraints.filter((constraint) => !constraint.deleted);
    return message([
      fieldPackedVarints(1, activeConstraints.map((constraint) => constraint.id)),
      fieldPackedDoubles(2, activeConstraints.map((constraint) => constraint.lowerBound)),
      fieldPackedDoubles(3, activeConstraints.map((constraint) => constraint.upperBound)),
      ...activeConstraints.map((constraint) => fieldString(4, constraint.name)),
    ]);
  }

  private encodeLinearConstraintMatrix(): Uint8Array {
    const entries = this.constraints.filter((constraint) => !constraint.deleted).flatMap((constraint) => {
      return [...constraint.terms]
        .filter((term) => term.coefficient !== 0)
        .sort((a, b) => a.variable.id - b.variable.id)
        .map((term) => ({
          rowId: constraint.id,
          columnId: term.variable.id,
          coefficient: term.coefficient,
        }));
    });
    return message([
      fieldPackedVarints(1, entries.map((entry) => entry.rowId)),
      fieldPackedVarints(2, entries.map((entry) => entry.columnId)),
      fieldPackedDoubles(3, entries.map((entry) => entry.coefficient)),
    ]);
  }
}

export class MathOptVariable {
  constructor(readonly model: MathOptModel, readonly data: VariableData) {}

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

  get lower_bound(): number {
    return this.lowerBound;
  }

  set lower_bound(value: number) {
    this.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  get upper_bound(): number {
    return this.upperBound;
  }

  set upper_bound(value: number) {
    this.upperBound = value;
  }

  get integer(): boolean {
    this.assertLive();
    return this.data.integer;
  }

  set integer(value: boolean) {
    this.assertLive();
    this.data.integer = value;
  }

  get is_integer(): boolean {
    return this.integer;
  }

  set is_integer(value: boolean) {
    this.integer = value;
  }

  equals(other: MathOptVariable): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `variable_${this.id}`;
  }

  private assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Variable ${this.id} has been deleted.`);
    }
  }
}

export class MathOptLinearConstraint {
  constructor(readonly model: MathOptModel, readonly data: LinearConstraintData) {}

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

  get lower_bound(): number {
    return this.lowerBound;
  }

  set lower_bound(value: number) {
    this.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  get upper_bound(): number {
    return this.upperBound;
  }

  set upper_bound(value: number) {
    this.upperBound = value;
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

  set_coefficient(variable: MathOptVariable, coefficient: number): void {
    this.setCoefficient(variable, coefficient);
  }

  getCoefficient(variable: MathOptVariable): number {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    return this.data.terms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  get_coefficient(variable: MathOptVariable): number {
    return this.getCoefficient(variable);
  }

  terms(): MathOptLinearTerm[] {
    this.assertLive();
    return [...this.data.terms].filter((term) => term.coefficient !== 0);
  }

  equals(other: MathOptLinearConstraint): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `linear_constraint_${this.id}`;
  }

  private assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Linear constraint ${this.id} has been deleted.`);
    }
  }
}

function findVariableKey(map: ReadonlyMap<MathOptVariable, number>, variable: MathOptVariable): MathOptVariable | undefined {
  for (const key of map.keys()) {
    if (key.equals(variable)) return key;
  }
  return undefined;
}

function formatBound(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return 'inf';
  if (value === Number.NEGATIVE_INFINITY) return '-inf';
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function formatExpressionNumber(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function formatSignedTerm(coefficient: number, body: string): string {
  const sign = coefficient < 0 ? '-' : '+';
  return ` ${sign} ${formatExpressionNumber(Math.abs(coefficient))} * ${body}`;
}

function compareVariables(lhs: MathOptVariable, rhs: MathOptVariable): number {
  return lhs.toString().localeCompare(rhs.toString()) || lhs.id - rhs.id;
}

function formatExpression(
  offset: number,
  linearTerms: MathOptLinearTerm[],
  quadraticTerms: MathOptQuadraticTerm[],
): string {
  let result = formatExpressionNumber(offset);
  for (const term of [...linearTerms].filter((term) => term.coefficient !== 0).sort((lhs, rhs) => compareVariables(lhs.variable, rhs.variable))) {
    result += formatSignedTerm(term.coefficient, term.variable.toString());
  }
  for (const term of [...quadraticTerms]
    .filter((term) => term.coefficient !== 0)
    .sort((lhs, rhs) => compareVariables(lhs.firstVariable, rhs.firstVariable) || compareVariables(lhs.secondVariable, rhs.secondVariable))) {
    result += formatSignedTerm(term.coefficient, `${term.firstVariable.toString()} * ${term.secondVariable.toString()}`);
  }
  return result;
}

function findQuadraticKey(
  map: ReadonlyMap<MathOptQuadraticTermKey, number>,
  key: MathOptQuadraticTermKey,
): MathOptQuadraticTermKey | undefined {
  for (const existing of map.keys()) {
    if (existing.equals(key)) return existing;
  }
  return undefined;
}

function linearTermEntries(expression: MathOptLinearExpression): MathOptLinearTerm[] {
  return linearTermEntriesFromMap(expression.terms);
}

function linearTermEntriesFromMap(map: ReadonlyMap<MathOptVariable, number>): MathOptLinearTerm[] {
  return [...map.entries()].map(([variable, coefficient]) => ({ variable, coefficient }));
}

function readonlyMap<TKey, TValue>(map: Map<TKey, TValue>): ReadonlyMap<TKey, TValue> {
  return new Proxy(map, {
    get(target, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new TypeError('ReadonlyMap does not support item assignment');
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function quadraticTermEntries(expression: MathOptQuadraticExpression): MathOptQuadraticTerm[] {
  return [...expression.quadraticTerms.entries()].map(([key, coefficient]) => ({
    firstVariable: key.firstVariable,
    secondVariable: key.secondVariable,
    coefficient,
  }));
}

function isLinearTerm(input: unknown): input is MathOptLinearTerm {
  return typeof input === 'object'
    && input !== null
    && 'variable' in input
    && 'coefficient' in input;
}

function isQuadraticTerm(input: unknown): input is MathOptQuadraticTerm {
  return typeof input === 'object'
    && input !== null
    && 'firstVariable' in input
    && 'secondVariable' in input
    && 'coefficient' in input;
}

export function linearTerm(variable: MathOptVariable, coefficient = 1): MathOptLinearTerm {
  return { variable, coefficient };
}

export function quadraticTerm(
  firstVariable: MathOptVariable,
  secondVariable: MathOptVariable,
  coefficient = 1,
): MathOptQuadraticTerm {
  return { firstVariable, secondVariable, coefficient };
}

export function linearExpression(
  terms: Iterable<MathOptLinearTerm> = [],
  offset = 0,
): MathOptLinearExpression {
  return new MathOptLinearExpression(terms, offset);
}

export function quadraticExpression(
  linearTerms: Iterable<MathOptLinearTerm> = [],
  quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
  offset = 0,
): MathOptQuadraticExpression {
  return new MathOptQuadraticExpression(linearTerms, quadraticTerms, offset);
}

export function asFlatLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
  if (typeof input === 'number') return new MathOptLinearExpression([], input);
  if (input instanceof MathOptLinearExpression) return input;
  if (input instanceof MathOptVariable) return new MathOptLinearExpression([{ variable: input, coefficient: 1 }]);
  if (isLinearTerm(input)) return new MathOptLinearExpression([input]);
  throw new TypeError('Unsupported MathOpt linear expression input.');
}

export function asFlatQuadraticExpression(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
  if (input instanceof MathOptQuadraticExpression) return input;
  if (isQuadraticTerm(input)) return new MathOptQuadraticExpression([], [input]);
  const linear = asFlatLinearExpression(input);
  return new MathOptQuadraticExpression(linearTermEntries(linear), [], linear.offset);
}

export function fastSum(inputs: Iterable<MathOptQuadraticExpressionInput>): MathOptLinearExpression | MathOptQuadraticExpression {
  let linear = new MathOptLinearExpression();
  let quadratic = new MathOptQuadraticExpression();
  let hasQuadratic = false;
  for (const input of inputs) {
    if (input instanceof MathOptQuadraticExpression || isQuadraticTerm(input)) {
      hasQuadratic = true;
      quadratic = quadratic.add(input);
      continue;
    }
    if (hasQuadratic) {
      quadratic = quadratic.add(input);
    } else {
      linear = linear.add(input);
    }
  }
  return hasQuadratic ? quadratic.add(linear) : linear;
}

export function multiplyLinearExpressions(
  lhs: MathOptLinearExpressionInput,
  rhs: MathOptLinearExpressionInput,
): MathOptQuadraticExpression {
  const lhsFlat = asFlatLinearExpression(lhs);
  const rhsFlat = asFlatLinearExpression(rhs);
  const linearTerms: MathOptLinearTerm[] = [];
  const quadraticTerms: MathOptQuadraticTerm[] = [];

  for (const term of linearTermEntries(lhsFlat)) {
    if (rhsFlat.offset !== 0) {
      linearTerms.push({
        variable: term.variable,
        coefficient: term.coefficient * rhsFlat.offset,
      });
    }
    for (const rhsTerm of linearTermEntries(rhsFlat)) {
      quadraticTerms.push({
        firstVariable: term.variable,
        secondVariable: rhsTerm.variable,
        coefficient: term.coefficient * rhsTerm.coefficient,
      });
    }
  }
  if (lhsFlat.offset !== 0) {
    for (const term of linearTermEntries(rhsFlat)) {
      linearTerms.push({
        variable: term.variable,
        coefficient: lhsFlat.offset * term.coefficient,
      });
    }
  }

  return new MathOptQuadraticExpression(linearTerms, quadraticTerms, lhsFlat.offset * rhsFlat.offset);
}

export function evaluateExpression(
  expression: MathOptQuadraticExpressionInput,
  variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>,
): number {
  const values = (variable: MathOptVariable) => {
    if (variableValues instanceof Map) {
      const typedValues = variableValues as ReadonlyMap<MathOptVariable, number>;
      const matchingVariable = findVariableKey(typedValues, variable);
      return typedValues.get(variable) ?? (matchingVariable ? typedValues.get(matchingVariable) : undefined) ?? 0;
    }
    const record = variableValues as Record<number | string, number>;
    return record[variable.id] ?? record[variable.name] ?? 0;
  };
  const flat = asFlatQuadraticExpression(expression);
  let result = flat.offset;
  for (const [variable, coefficient] of flat.linearTerms) {
    result += coefficient * values(variable);
  }
  for (const [key, coefficient] of flat.quadraticTerms) {
    result += coefficient * values(key.firstVariable) * values(key.secondVariable);
  }
  return result;
}

export function boundedExpression<TExpression>(
  lowerBound: number,
  expression: TExpression,
  upperBound: number,
): MathOptBoundedExpression<TExpression> {
  return new MathOptBoundedExpression(lowerBound, expression, upperBound);
}

export function lowerBoundedExpression<TExpression>(
  lowerBound: number,
  expression: TExpression,
): MathOptLowerBoundedExpression<TExpression> {
  return new MathOptLowerBoundedExpression(lowerBound, expression);
}

export function upperBoundedExpression<TExpression>(
  expression: TExpression,
  upperBound: number,
): MathOptUpperBoundedExpression<TExpression> {
  return new MathOptUpperBoundedExpression(expression, upperBound);
}

export function eq(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for ==: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return boundedExpression(
      lhs,
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
      lhs,
    );
  }
  if (typeof rhs === 'number') {
    return boundedExpression(
      rhs,
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
      rhs,
    );
  }
  const expression = isQuadraticOnlyInput(lhs) || isQuadraticOnlyInput(rhs)
    ? (
      isQuadraticOnlyInput(lhs)
        ? asFlatQuadraticExpression(lhs).subtract(rhs)
        : asFlatQuadraticExpression(rhs).subtract(lhs)
    )
    : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput);
  return boundedExpression(0, expression, 0);
}

export function ne(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): never {
  void lhs;
  void rhs;
  throw new TypeError('!= constraints are not supported');
}

export function variableEq(
  lhs: MathOptVariable,
  rhs: MathOptVariable,
): boolean | MathOptVarEqVar {
  if (lhs === rhs) return true;
  if (lhs.model !== rhs.model) return false;
  if (lhs.id === rhs.id) return true;
  return new MathOptVarEqVar(lhs, rhs);
}

export function variableNe(lhs: MathOptVariable, rhs: MathOptVariable): boolean {
  return variableEq(lhs, rhs) !== true;
}

function isLinearExpressionInput(input: unknown): input is MathOptLinearExpressionInput {
  return typeof input === 'number'
    || input instanceof MathOptVariable
    || input instanceof MathOptLinearExpression
    || isLinearTerm(input);
}

function isQuadraticExpressionInput(input: unknown): input is MathOptQuadraticExpressionInput {
  return isLinearExpressionInput(input)
    || input instanceof MathOptQuadraticExpression
    || isQuadraticTerm(input);
}

function isQuadraticOnlyInput(...inputs: MathOptQuadraticExpressionInput[]): boolean {
  return inputs.some((input) => input instanceof MathOptQuadraticExpression || isQuadraticTerm(input));
}

function mathOptOperandType(input: unknown): string {
  if (input instanceof MathOptVariable) return 'Variable';
  if (input instanceof MathOptLinearExpression) return 'LinearExpression';
  if (input instanceof MathOptQuadraticExpression) return 'QuadraticExpression';
  if (input instanceof MathOptBoundedExpression) return 'BoundedExpression';
  if (input instanceof MathOptLowerBoundedExpression) return 'LowerBoundedExpression';
  if (input instanceof MathOptUpperBoundedExpression) return 'UpperBoundedExpression';
  if (isLinearTerm(input)) return 'LinearTerm';
  if (isQuadraticTerm(input)) return 'QuadraticTerm';
  if (typeof input === 'string') return 'str';
  return typeof input;
}

export function le(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptUpperBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
  | MathOptLowerBoundedExpression<MathOptQuadraticExpression>
  | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (lhs instanceof MathOptBoundedExpression || rhs instanceof MathOptBoundedExpression) {
    throw new TypeError('Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.');
  }
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for <=: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return lowerBoundedExpression(
      lhs,
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
    );
  }
  if (typeof rhs === 'number') {
    return upperBoundedExpression(
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
      rhs,
    );
  }
  if (isQuadraticOnlyInput(lhs) && !isQuadraticOnlyInput(rhs)) {
    return boundedExpression(Number.NEGATIVE_INFINITY, asFlatQuadraticExpression(lhs).subtract(rhs), 0);
  }
  if (!isQuadraticOnlyInput(lhs) && isQuadraticOnlyInput(rhs)) {
    return boundedExpression(0, asFlatQuadraticExpression(rhs).subtract(lhs), Number.POSITIVE_INFINITY);
  }
  return boundedExpression(
    Number.NEGATIVE_INFINITY,
    isQuadraticOnlyInput(lhs, rhs)
      ? asFlatQuadraticExpression(lhs).subtract(rhs)
      : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput),
    0,
  );
}

export function ge(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptLowerBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
  | MathOptUpperBoundedExpression<MathOptQuadraticExpression>
  | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (lhs instanceof MathOptBoundedExpression || rhs instanceof MathOptBoundedExpression) {
    throw new TypeError('Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.');
  }
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for >=: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return upperBoundedExpression(
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
      lhs,
    );
  }
  if (typeof rhs === 'number') {
    return lowerBoundedExpression(
      rhs,
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
    );
  }
  if (isQuadraticOnlyInput(lhs) && !isQuadraticOnlyInput(rhs)) {
    return boundedExpression(0, asFlatQuadraticExpression(lhs).subtract(rhs), Number.POSITIVE_INFINITY);
  }
  if (!isQuadraticOnlyInput(lhs) && isQuadraticOnlyInput(rhs)) {
    return boundedExpression(Number.NEGATIVE_INFINITY, asFlatQuadraticExpression(rhs).subtract(lhs), 0);
  }
  return boundedExpression(
    0,
    isQuadraticOnlyInput(lhs, rhs)
      ? asFlatQuadraticExpression(lhs).subtract(rhs)
      : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput),
    Number.POSITIVE_INFINITY,
  );
}

export function completeUpperBound<TExpression>(
  lowerBounded: MathOptLowerBoundedExpression<TExpression>,
  upperBound: number,
): MathOptBoundedExpression<TExpression> {
  if (!(lowerBounded instanceof MathOptLowerBoundedExpression)) {
    throw new TypeError(`unsupported operand type(s) for <=: '${mathOptOperandType(lowerBounded)}' and 'float'`);
  }
  return lowerBounded.toBoundedExpression(upperBound);
}

export function completeLowerBound<TExpression>(
  lowerBound: number,
  upperBounded: MathOptUpperBoundedExpression<TExpression>,
): MathOptBoundedExpression<TExpression> {
  if (!(upperBounded instanceof MathOptUpperBoundedExpression)) {
    throw new TypeError(`unsupported operand type(s) for >=: '${mathOptOperandType(upperBounded)}' and 'float'`);
  }
  return upperBounded.toBoundedExpression(lowerBound);
}

export async function initMathOpt(): Promise<void> {
  await loadMathOptModule();
}

export class MathOpt {
  static readonly SolverType = MathOptSolverType;
  static readonly LinearExpression = MathOptLinearExpression;
  static readonly QuadraticExpression = MathOptQuadraticExpression;
  static readonly QuadraticTermKey = MathOptQuadraticTermKey;
  static readonly VarEqVar = MathOptVarEqVar;
  static readonly BoundedExpression = MathOptBoundedExpression;
  static readonly LowerBoundedExpression = MathOptLowerBoundedExpression;
  static readonly UpperBoundedExpression = MathOptUpperBoundedExpression;

  static setWorkerBridgeEnabled(enabled: boolean): void {
    setWorkerBridgeEnabled(enabled);
  }

  static Model(name = ''): MathOptModel {
    return new MathOptModel(name);
  }

  static async solve(model: MathOptModel, options: MathOptSolveOptions = {}): Promise<MathOptSolveResult> {
    const requestBytes = encodeSolveRequest(model, options);
    const responseBytes = shouldUseWorkerBridge()
      ? await solveViaWorker(requestBytes)
      : await solveDirect(requestBytes);
    return decodeSolveResponse(responseBytes, model);
  }

  static linearTerm(variable: MathOptVariable, coefficient = 1): MathOptLinearTerm {
    return linearTerm(variable, coefficient);
  }

  static quadraticTerm(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient = 1): MathOptQuadraticTerm {
    return quadraticTerm(firstVariable, secondVariable, coefficient);
  }

  static linearExpression(terms: Iterable<MathOptLinearTerm> = [], offset = 0): MathOptLinearExpression {
    return linearExpression(terms, offset);
  }

  static quadraticExpression(
    linearTerms: Iterable<MathOptLinearTerm> = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ): MathOptQuadraticExpression {
    return quadraticExpression(linearTerms, quadraticTerms, offset);
  }

  static asFlatLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    return asFlatLinearExpression(input);
  }

  static asFlatQuadraticExpression(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    return asFlatQuadraticExpression(input);
  }

  static fastSum(inputs: Iterable<MathOptQuadraticExpressionInput>): MathOptLinearExpression | MathOptQuadraticExpression {
    return fastSum(inputs);
  }

  static multiplyLinearExpressions(
    lhs: MathOptLinearExpressionInput,
    rhs: MathOptLinearExpressionInput,
  ): MathOptQuadraticExpression {
    return multiplyLinearExpressions(lhs, rhs);
  }

  static evaluateExpression(
    expression: MathOptQuadraticExpressionInput,
    variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>,
  ): number {
    return evaluateExpression(expression, variableValues);
  }

  static boundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return boundedExpression(lowerBound, expression, upperBound);
  }

  static lowerBoundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
  ): MathOptLowerBoundedExpression<TExpression> {
    return lowerBoundedExpression(lowerBound, expression);
  }

  static upperBoundedExpression<TExpression>(
    expression: TExpression,
    upperBound: number,
  ): MathOptUpperBoundedExpression<TExpression> {
    return upperBoundedExpression(expression, upperBound);
  }

  static eq(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return eq(lhs, rhs);
  }

  static ne(lhs: MathOptQuadraticExpressionInput, rhs: MathOptQuadraticExpressionInput): never {
    return ne(lhs, rhs);
  }

  static variableEq(lhs: MathOptVariable, rhs: MathOptVariable): boolean | MathOptVarEqVar {
    return variableEq(lhs, rhs);
  }

  static variableNe(lhs: MathOptVariable, rhs: MathOptVariable): boolean {
    return variableNe(lhs, rhs);
  }

  static le(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptUpperBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptLowerBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return le(lhs, rhs);
  }

  static ge(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptLowerBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptUpperBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return ge(lhs, rhs);
  }

  static completeUpperBound<TExpression>(
    lowerBounded: MathOptLowerBoundedExpression<TExpression>,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return completeUpperBound(lowerBounded, upperBound);
  }

  static completeLowerBound<TExpression>(
    lowerBound: number,
    upperBounded: MathOptUpperBoundedExpression<TExpression>,
  ): MathOptBoundedExpression<TExpression> {
    return completeLowerBound(lowerBound, upperBounded);
  }
}

async function solveViaWorker(requestBytes: Uint8Array): Promise<Uint8Array> {
  const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'mathOptSolveResult' }>>({
    type: 'mathOptSolve',
    id: nextWorkerBridgeRequestId(),
    requestBytes,
  });
  return new Uint8Array(response.bytes);
}

async function solveDirect(requestBytes: Uint8Array): Promise<Uint8Array> {
  const module = await loadMathOptModule();
  const requestPtr = copyBytesToHeap(module, requestBytes);
  const lenPtr = module._malloc(4);
  try {
    const ptr = module.ccall(
      'mathopt_solve_request',
      'number',
      ['number', 'number', 'number'],
      [requestPtr, requestBytes.length, lenPtr],
    ) as number;
    const length = new DataView(module.HEAPU8.buffer, lenPtr, 4).getUint32(0, true);
    const bytes = ptr && length > 0 ? new Uint8Array(module.HEAPU8.subarray(ptr, ptr + length)) : new Uint8Array();
    if (ptr) module._free(ptr);
    return bytes;
  } finally {
    if (requestPtr) module._free(requestPtr);
    module._free(lenPtr);
  }
}

function copyBytesToHeap(module: MainModule, bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const ptr = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, ptr);
  return ptr;
}

function encodeSolveRequest(model: MathOptModel, options: MathOptSolveOptions): Uint8Array {
  const solverType = typeof options.solverType === 'string'
    ? MathOptSolverType[options.solverType]
    : options.solverType ?? MathOptSolverType.GLOP;
  return message([
    fieldVarint(1, solverType),
    fieldMessage(2, model.encodeModelProto()),
    options.threads ? fieldMessage(4, message([fieldVarint(4, options.threads)])) : empty(),
  ]);
}

function encodeSparseDoubleVector(terms: MathOptLinearTerm[]): Uint8Array {
  const sortedTerms = [...terms].sort((a, b) => a.variable.id - b.variable.id);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.variable.id)),
    fieldPackedDoubles(2, sortedTerms.map((term) => term.coefficient)),
  ]);
}

function decodeSolveResponse(bytes: Uint8Array, model: MathOptModel): MathOptSolveResult {
  const response = readMessage(bytes);
  const statusBytes = response.messages.get(3)?.[0];
  if (statusBytes) {
    const status = readMessage(statusBytes);
    const messageText = status.strings.get(2)?.[0] ?? 'MathOpt solve failed.';
    throw new Error(messageText);
  }

  const resultBytes = response.messages.get(1)?.[0];
  if (!resultBytes) {
    throw new Error('MathOpt solve returned no result.');
  }

  const result = readMessage(resultBytes);
  const termination = result.messages.get(2)?.[0];
  const terminationReasonNumber = termination ? Number(readMessage(termination).varints.get(1)?.[0] ?? 0n) : 0;
  const firstSolution = result.messages.get(3)?.[0];
  const primal = firstSolution ? readMessage(firstSolution).messages.get(1)?.[0] : undefined;
  const primalMessage = primal ? readMessage(primal) : undefined;
  const objectiveValue = primalMessage?.doubles.get(2)?.[0] ?? null;
  const sparseValues = primalMessage?.messages.get(1)?.[0];
  const variableValuesById: Record<number, number> = {};
  const variableValues: Record<string, number> = {};
  if (sparseValues) {
    const sparse = readMessage(sparseValues);
    const ids = sparse.packedVarints.get(1) ?? [];
    const values = sparse.packedDoubles.get(2) ?? [];
    ids.forEach((id, index) => {
      const numericId = Number(id);
      const value = values[index] ?? 0;
      variableValuesById[numericId] = value;
      variableValues[model.variableName(numericId)] = value;
    });
  }

  return {
    terminationReason: terminationReasonNames[terminationReasonNumber] ?? `TERMINATION_REASON_${terminationReasonNumber}`,
    objectiveValue,
    variableValues,
    variableValuesById,
    rawResponse: bytes,
  };
}

type DecodedMessage = {
  varints: Map<number, bigint[]>;
  strings: Map<number, string[]>;
  doubles: Map<number, number[]>;
  messages: Map<number, Uint8Array[]>;
  packedVarints: Map<number, bigint[]>;
  packedDoubles: Map<number, number[]>;
};

function readMessage(bytes: Uint8Array): DecodedMessage {
  const decoded: DecodedMessage = {
    varints: new Map(),
    strings: new Map(),
    doubles: new Map(),
    messages: new Map(),
    packedVarints: new Map(),
    packedDoubles: new Map(),
  };
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      offset = value.offset;
      pushMap(decoded.varints, field, value.value);
    } else if (wire === 1) {
      const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
      offset += 8;
      pushMap(decoded.doubles, field, value);
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + Number(length.value);
      const payload = bytes.slice(offset, end);
      offset = end;
      pushMap(decoded.messages, field, payload);
      const text = new TextDecoder().decode(payload);
      if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)) {
        pushMap(decoded.strings, field, text);
      }
      try {
        pushMapValues(decoded.packedVarints, field, readPackedVarints(payload));
      } catch {
        // Length-delimited fields can also be nested messages or strings.
      }
      if (payload.length % 8 === 0) {
        try {
          pushMapValues(decoded.packedDoubles, field, readPackedDoubles(payload));
        } catch {
          // Treat invalid packed doubles as another length-delimited shape.
        }
      }
    } else if (wire === 5) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}.`);
    }
  }
  return decoded;
}

function pushMap<T>(map: Map<number, T[]>, key: number, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function pushMapValues<T>(map: Map<number, T[]>, key: number, values: T[]): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(...values);
  } else {
    map.set(key, [...values]);
  }
}

function readPackedVarints(bytes: Uint8Array): bigint[] {
  const values: bigint[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const value = readVarint(bytes, offset);
    values.push(value.value);
    offset = value.offset;
  }
  return values;
}

function readPackedDoubles(bytes: Uint8Array): number[] {
  const values: number[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length; offset += 8) {
    values.push(view.getFloat64(offset, true));
  }
  return values;
}

function readVarint(bytes: Uint8Array, start: number): { value: bigint; offset: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error('Unexpected end of varint.');
}

function message(fields: WireValue[]): Uint8Array {
  return concat(fields.filter((field) => field.length > 0));
}

function empty(): Uint8Array {
  return new Uint8Array();
}

function fieldVarint(field: number, value: number | bigint): Uint8Array {
  return concat([writeVarint(BigInt(field << 3)), writeVarint(BigInt(value))]);
}

function fieldBool(field: number, value: boolean): Uint8Array {
  return fieldVarint(field, value ? 1 : 0);
}

function fieldDouble(field: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return concat([writeVarint(BigInt((field << 3) | 1)), bytes]);
}

function fieldString(field: number, value: string): Uint8Array {
  return fieldLengthDelimited(field, new TextEncoder().encode(value));
}

function fieldMessage(field: number, value: Uint8Array): Uint8Array {
  return fieldLengthDelimited(field, value);
}

function fieldPackedVarints(field: number, values: Array<number | bigint>): Uint8Array {
  return fieldLengthDelimited(field, concat(values.map((value) => writeVarint(BigInt(value)))));
}

function fieldPackedBools(field: number, values: boolean[]): Uint8Array {
  return fieldPackedVarints(field, values.map((value) => value ? 1 : 0));
}

function fieldPackedDoubles(field: number, values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return fieldLengthDelimited(field, bytes);
}

function fieldLengthDelimited(field: number, payload: Uint8Array): Uint8Array {
  return concat([
    writeVarint(BigInt((field << 3) | 2)),
    writeVarint(BigInt(payload.length)),
    payload,
  ]);
}

function writeVarint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let current = value;
  do {
    let byte = Number(current & 0x7fn);
    current >>= 7n;
    if (current !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (current !== 0n);
  return new Uint8Array(bytes);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
