import { CpSat } from './api.js';
import {
  CpSolverStatus,
  type ConstraintProto,
  type CpModelProto,
  type CpSolverResponse,
  type DecisionStrategyProto_DomainReductionStrategy,
  type DecisionStrategyProto_VariableSelectionStrategy,
  type LinearExpressionProto,
  type ProtoInt64,
} from '../generated/cp_model.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import type { CpSatSolveOptions } from './api.js';

const INT64_MIN: ProtoInt64 = { low: 0, high: -2147483648 };
const INT64_MAX: ProtoInt64 = { low: -1, high: 2147483647 };

export type LinearExprLike = number | IntVar | NotBoolVar | LinearExpr;
export type LiteralLike = number | boolean | BoolVar | NotBoolVar;
type CpSolverSolveOptions = Omit<CpSatSolveOptions, 'solverParameters'>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export class ArithmeticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArithmeticError';
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

function valueError(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new ValueError(message);
  }
}

function runtimeError(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RuntimeError(message);
  }
}

function asInt64(value: number): ProtoInt64 {
  assert(Number.isInteger(value), `expected integer value, got ${value}`);
  return value;
}

function normalizeInt64(value: ProtoInt64): ProtoInt64 {
  if (typeof value === 'number') {
    return asInt64(value);
  }
  return value;
}

function int64ObjectToBigInt(value: { low: number; high: number; unsigned?: boolean }) {
  return BigInt(value.high) * 0x100000000n + BigInt(value.low >>> 0);
}

function protoInt64ToBigInt(value: ProtoInt64) {
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  return int64ObjectToBigInt(value);
}

function protoInt64ToString(value: ProtoInt64) {
  return protoInt64ToBigInt(value).toString();
}

function compareProtoInt64(left: ProtoInt64, right: ProtoInt64) {
  const leftValue = protoInt64ToBigInt(left);
  const rightValue = protoInt64ToBigInt(right);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function bigintToProtoInt64(value: bigint): ProtoInt64 {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return {
    low: Number(BigInt.asIntN(32, value)),
    high: Number(BigInt.asIntN(32, value >> 32n)),
  };
}

function isInt64Min(value: ProtoInt64) {
  return (
    value === '-9223372036854775808' ||
    (typeof value === 'object' && value.low === 0 && value.high === -2147483648)
  );
}

function isInt64Max(value: ProtoInt64) {
  return (
    value === '9223372036854775807' ||
    (typeof value === 'object' && value.low === -1 && value.high === 2147483647)
  );
}

function isProtoInt64Object(value: unknown): value is { low: number; high: number; unsigned?: boolean } {
  return typeof value === 'object'
    && value !== null
    && 'low' in value
    && 'high' in value
    && typeof (value as { low: unknown }).low === 'number'
    && typeof (value as { high: unknown }).high === 'number';
}

function isProtoInt64String(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d+$/.test(value);
}

function isProtoInt64Constant(value: unknown): value is ProtoInt64 {
  return typeof value === 'number' || isProtoInt64String(value) || isProtoInt64Object(value);
}

function adjustedProtoInt64ToBigInt(value: ProtoInt64, offset: number) {
  return protoInt64ToBigInt(value) - BigInt(offset);
}

function adjustedProtoInt64ToString(value: ProtoInt64, offset: number) {
  if (Number.isInteger(offset)) {
    return adjustedProtoInt64ToBigInt(value, offset).toString();
  }
  return String(protoInt64ToNumber(value) - offset);
}

function compareAdjustedProtoInt64(left: ProtoInt64, right: ProtoInt64, offset: number) {
  if (!Number.isInteger(offset)) {
    const leftValue = protoInt64ToNumber(left) - offset;
    const rightValue = protoInt64ToNumber(right) - offset;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
    return 0;
  }
  const leftValue = adjustedProtoInt64ToBigInt(left, offset);
  const rightValue = adjustedProtoInt64ToBigInt(right, offset);
  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}

function adjustDomainEndpoint(value: ProtoInt64, offset: number): ProtoInt64 {
  if (isInt64Min(value) || isInt64Max(value)) {
    return value;
  }
  if (typeof value === 'number') {
    return asInt64(value - offset);
  }
  if (typeof value === 'string') {
    return bigintToProtoInt64(BigInt(value) - BigInt(offset));
  }
  return bigintToProtoInt64(int64ObjectToBigInt(value) - BigInt(offset));
}

function protoInt64ToNumber(value: ProtoInt64 | undefined) {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.high * 0x100000000 + (value.low >>> 0);
}

function cloneProto<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type LinearExpressionProtoLike = {
  vars?: number[];
  coeffs?: ProtoInt64[];
  offset?: ProtoInt64;
};

type LinearExprDisplayNode =
  | { kind: 'const'; value: number }
  | { kind: 'var'; index: number }
  | { kind: 'not'; index: number }
  | { kind: 'sum'; values: LinearExprDisplayNode[] }
  | { kind: 'mul'; coeff: number; value: LinearExprDisplayNode }
  | { kind: 'weighted'; values: LinearExprDisplayNode[]; coeffs: number[] };

export function rebuildFromLinearExpressionProto(
  proto: LinearExpressionProtoLike,
  _modelProto: unknown,
): number | LinearExpr {
  const vars = proto.vars ?? [];
  const coeffs = proto.coeffs ?? [];
  valueError(vars.length === coeffs.length, 'linear expression proto vars and coeffs must have the same length');
  if (vars.length === 0) {
    return protoInt64ToNumber(proto.offset);
  }

  const terms = new Map<number, number>();
  for (let index = 0; index < vars.length; index += 1) {
    terms.set(vars[index], Number(protoInt64ToNumber(coeffs[index])));
  }
  return new LinearExpr(null, terms, protoInt64ToNumber(proto.offset));
}

export function rebuild_from_linear_expression_proto(proto: LinearExpressionProtoLike, modelProto: unknown): number | LinearExpr {
  return rebuildFromLinearExpressionProto(proto, modelProto);
}

function evaluateLinearExpression(response: CpSolverResponse, expression: LinearExprLike) {
  const expr = LinearExpr.from(expression);
  let value = expr.offset;
  for (const [index, coeff] of expr.terms) {
    const variableValue = response.solution?.[index];
    assert(typeof variableValue === 'number', `missing numeric solution value for variable ${index}`);
    value += coeff * variableValue;
  }
  return value;
}

function evaluateBooleanLiteral(response: CpSolverResponse, literal: LiteralLike) {
  if (typeof literal === 'number') {
    return literal !== 0;
  }
  if (literal === true || literal === false) {
    return literal;
  }
  const index = literal instanceof NotBoolVar ? literal.variable.index : literal.index;
  const value = response.solution?.[index];
  assert(typeof value === 'number', `missing numeric solution value for literal ${index}`);
  const truth = value !== 0;
  return literal instanceof NotBoolVar ? !truth : truth;
}

function literalIndex(literal: LiteralLike) {
  if (typeof literal === 'number') {
    if (literal === 0) return false;
    if (literal === 1) return true;
    throw new TypeError('literal numeric constants must be 0 or 1');
  }
  if (literal === true) return true;
  if (literal === false) return false;
  if (!(literal instanceof BoolVar || literal instanceof NotBoolVar)) {
    throw new TypeError('literal must be a Boolean variable or its negation');
  }
  return literal.index;
}

export function objectIsATrueLiteral(literal: unknown) {
  if (literal instanceof IntVar) {
    const domain = literal.model.proto().variables?.[literal.index]?.domain ?? [];
    return domain.length === 2 && protoInt64ToNumber(domain[0]) === 1 && protoInt64ToNumber(domain[1]) === 1;
  }
  if (literal instanceof NotBoolVar) {
    const domain = literal.variable.model.proto().variables?.[literal.variable.index]?.domain ?? [];
    return domain.length === 2 && protoInt64ToNumber(domain[0]) === 0 && protoInt64ToNumber(domain[1]) === 0;
  }
  if (typeof literal === 'boolean') {
    return literal;
  }
  if (typeof literal === 'number' && Number.isInteger(literal)) {
    return literal === 1 || literal === ~0;
  }
  return false;
}

export function object_is_a_true_literal(literal: unknown) {
  return objectIsATrueLiteral(literal);
}

export function objectIsAFalseLiteral(literal: unknown) {
  if (literal instanceof IntVar) {
    const domain = literal.model.proto().variables?.[literal.index]?.domain ?? [];
    return domain.length === 2 && protoInt64ToNumber(domain[0]) === 0 && protoInt64ToNumber(domain[1]) === 0;
  }
  if (literal instanceof NotBoolVar) {
    const domain = literal.variable.model.proto().variables?.[literal.variable.index]?.domain ?? [];
    return domain.length === 2 && protoInt64ToNumber(domain[0]) === 1 && protoInt64ToNumber(domain[1]) === 1;
  }
  if (typeof literal === 'boolean') {
    return !literal;
  }
  if (typeof literal === 'number' && Number.isInteger(literal)) {
    return literal === 0 || literal === ~1;
  }
  return false;
}

export function object_is_a_false_literal(literal: unknown) {
  return objectIsAFalseLiteral(literal);
}

function requireSameModel(model: CpModel, owner: CpModel, what: string) {
  if (model !== owner) {
    throw new Error(`${what} belongs to a different CpModel`);
  }
}

function mergeTerms(terms: Map<number, number>, index: number, coeff: number) {
  const next = (terms.get(index) ?? 0) + coeff;
  if (next === 0) {
    terms.delete(index);
  } else {
    terms.set(index, next);
  }
}

function variableDisplayName(model: CpModel | null, index: number) {
  return model?.proto().variables?.[index]?.name || `var${index}`;
}

function renderLinearExprDisplay(node: LinearExprDisplayNode, model: CpModel | null): string {
  switch (node.kind) {
    case 'const':
      return String(node.value);
    case 'var':
      return variableDisplayName(model, node.index);
    case 'not':
      return `not(${variableDisplayName(model, node.index)})`;
    case 'mul': {
      const value = renderLinearExprDisplay(node.value, model);
      if (node.coeff === 1) {
        return value;
      }
      if (node.coeff === -1) {
        return `(-${value})`;
      }
      return `(${node.coeff} * ${value})`;
    }
    case 'sum':
      return formatDisplaySum(node.values, model);
    case 'weighted':
      return formatWeightedDisplaySum(node.values, node.coeffs, model);
  }
}

function renderLinearExprDisplayRepr(node: LinearExprDisplayNode, model: CpModel | null): string {
  switch (node.kind) {
    case 'const':
      return Number.isInteger(node.value) ? `IntConstant(${node.value})` : `FloatConstant(${node.value})`;
    case 'var': {
      const variable = model?.getIntVarFromProtoIndex(node.index);
      return variable?.repr() ?? `var${node.index}`;
    }
    case 'not':
      return `NotBooleanVariable(var_index=${node.index})`;
    case 'mul': {
      const valueRepr = renderLinearExprDisplayRepr(node.value, model);
      const affineName = Number.isInteger(node.coeff) ? 'IntAffine' : 'FloatAffine';
      return `${affineName}(expr=${valueRepr}, coeff=${node.coeff}, offset=0)`;
    }
    case 'sum': {
      const values: string[] = [];
      let integerOffset = 0;
      let floatOffset = 0;
      let hasFloatOffset = false;
      for (const value of node.values) {
        if (value.kind === 'const') {
          if (Number.isInteger(value.value) && !hasFloatOffset) {
            integerOffset += value.value;
          } else {
            hasFloatOffset = true;
            floatOffset += value.value;
          }
        } else {
          values.push(renderLinearExprDisplayRepr(value, model));
        }
      }
      if (hasFloatOffset) {
        return `SumArray(${values.join(', ')}, float_offset=${floatOffset + integerOffset})`;
      }
      if (integerOffset !== 0) {
        return `SumArray(${values.join(', ')}, int_offset=${integerOffset})`;
      }
      return `SumArray(${values.join(', ')})`;
    }
    case 'weighted': {
      const values = node.values.map((value) => renderLinearExprDisplayRepr(value, model));
      return `WeightedSum(${values.join(', ')}, coeffs=[${node.coeffs.join(', ')}])`;
    }
  }
}

function formatDisplaySum(values: LinearExprDisplayNode[], model: CpModel | null) {
  const nonConstantValues: LinearExprDisplayNode[] = [];
  let constant = 0;
  for (const value of values) {
    if (value.kind === 'const') {
      constant += value.value;
    } else {
      nonConstantValues.push(value);
    }
  }
  if (constant !== 0 || nonConstantValues.length === 0) {
    nonConstantValues.push({ kind: 'const', value: constant });
  }
  if (nonConstantValues.length === 0) {
    return '0';
  }
  const [first, ...rest] = nonConstantValues;
  let text = renderLinearExprDisplay(first, model);
  for (const value of rest) {
    if (value.kind === 'const' && value.value < 0) {
      text += ` - ${Math.abs(value.value)}`;
    } else {
      text += ` + ${renderLinearExprDisplay(value, model)}`;
    }
  }
  return nonConstantValues.length > 1 ? `(${text})` : text;
}

function formatWeightedDisplaySum(values: LinearExprDisplayNode[], coeffs: number[], model: CpModel | null) {
  const pieces: Array<{ sign: 1 | -1; text: string }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const coeff = coeffs[index];
    if (coeff === 0) {
      continue;
    }
    const value = values[index];
    if (value.kind === 'const') {
      const scaled = value.value * coeff;
      if (scaled !== 0) {
        pieces.push({ sign: scaled < 0 ? -1 : 1, text: String(Math.abs(scaled)) });
      }
      continue;
    }
    const sign = coeff < 0 ? -1 : 1;
    const absCoeff = Math.abs(coeff);
    const valueText = renderLinearExprDisplay(value, model);
    pieces.push({ sign, text: absCoeff === 1 ? valueText : `${absCoeff} * ${valueText}` });
  }
  if (pieces.length === 0) {
    return '0';
  }
  const [first, ...rest] = pieces;
  let text = first.sign < 0 ? `-${first.text}` : first.text;
  for (const piece of rest) {
    text += piece.sign < 0 ? ` - ${piece.text}` : ` + ${piece.text}`;
  }
  return pieces.length > 1 || pieces[0].sign < 0 ? `(${text})` : text;
}

function appendDisplaySumValues(values: LinearExprDisplayNode[], node: LinearExprDisplayNode) {
  if (node.kind === 'sum') {
    values.push(...node.values);
  } else {
    values.push(node);
  }
}

function unsupportedNativeOperatorCoercion(): never {
  throw new NotImplementedError('native JavaScript operators are not supported for CP-SAT expressions; use the explicit high-level API methods');
}

function expressionList(first: Iterable<LinearExprLike> | LinearExprLike, rest: LinearExprLike[]) {
  if (rest.length > 0) {
    return [first as LinearExprLike, ...rest];
  }
  if (typeof first === 'number' || first instanceof IntVar || first instanceof NotBoolVar || first instanceof LinearExpr) {
    return [first];
  }
  return Array.from(first);
}

function iterableValues(first: Iterable<LinearExprLike> | LinearExprLike, rest: LinearExprLike[]) {
  if (rest.length > 0) {
    return [first, ...rest] as LinearExprLike[];
  }
  if (typeof first === 'number' || first instanceof IntVar || first instanceof NotBoolVar || first instanceof LinearExpr) {
    return [first];
  }
  return Array.from(first);
}

function literalList(first: Iterable<LiteralLike> | LiteralLike, rest: LiteralLike[]) {
  if (rest.length > 0) {
    return [first as LiteralLike, ...rest];
  }
  if (typeof first === 'number' || typeof first === 'boolean' || first instanceof BoolVar || first instanceof NotBoolVar) {
    return [first];
  }
  return Array.from(first);
}

export class LinearExpr {
  readonly model: CpModel | null;
  readonly terms: ReadonlyMap<number, number>;
  readonly offset: number;
  private readonly display: LinearExprDisplayNode | null;

  constructor(
    model: CpModel | null,
    terms: ReadonlyMap<number, number> = new Map(),
    offset = 0,
    display: LinearExprDisplayNode | null = null,
  ) {
    this.model = model;
    this.terms = new Map(terms);
    this.offset = offset;
    this.display = display;
  }

  static constant(value: number) {
    return new LinearExpr(null, new Map(), value, { kind: 'const', value });
  }

  static sum(values: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return sum(values, ...rest);
  }

  static Sum(values: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return LinearExpr.sum(values, ...rest);
  }

  static weightedSum(values: Iterable<LinearExprLike>, coeffs: Iterable<number>) {
    return weightedSum(values, coeffs);
  }

  static weighted_sum(values: Iterable<LinearExprLike>, coeffs: Iterable<number>) {
    return LinearExpr.weightedSum(values, coeffs);
  }

  static WeightedSum(values: Iterable<LinearExprLike>, coeffs: Iterable<number>) {
    return LinearExpr.weightedSum(values, coeffs);
  }

  static term(variable: IntVar | NotBoolVar, coeff: number) {
    return term(variable, coeff);
  }

  static Term(variable: IntVar | NotBoolVar, coeff: number) {
    return LinearExpr.term(variable, coeff);
  }

  static affine(expression: LinearExprLike, coeff: number, offset: number) {
    return LinearExpr.from(expression).times(coeff).plus(offset);
  }

  static from(value: LinearExprLike): LinearExpr {
    if (typeof value === 'number') {
      return LinearExpr.constant(value);
    }
    if (value instanceof LinearExpr) {
      return value;
    }
    if (value instanceof NotBoolVar) {
      return value.expr();
    }
    if (!(value instanceof IntVar)) {
      throw new TypeError('expected integer variable or linear expression');
    }
    return value.expr();
  }

  plus(value: LinearExprLike, coeff = 1) {
    const other = coeff === 1 ? LinearExpr.from(value) : LinearExpr.from(value).times(coeff);
    const model = this.model ?? other.model;
    if (this.model && other.model) {
      requireSameModel(this.model, other.model, 'linear expression');
    }
    const terms = new Map(this.terms);
    for (const [index, termCoeff] of other.terms) {
      mergeTerms(terms, index, termCoeff);
    }
    const displayValues: LinearExprDisplayNode[] = [];
    appendDisplaySumValues(displayValues, this.displayNodeForRendering());
    appendDisplaySumValues(displayValues, other.displayNodeForRendering());
    return new LinearExpr(model, terms, this.offset + other.offset, { kind: 'sum', values: displayValues });
  }

  minus(value: LinearExprLike) {
    return this.plus(value, -1);
  }

  times(coeff: number) {
    if (typeof coeff !== 'number' || !Number.isFinite(coeff)) {
      throw new TypeError(`expected finite numeric coefficient, got ${coeff}`);
    }
    const terms = new Map<number, number>();
    for (const [index, termCoeff] of this.terms) {
      mergeTerms(terms, index, termCoeff * coeff);
    }
    let displayCoeff = coeff;
    let displayValue = this.displayNodeForRendering();
    if (displayValue.kind === 'mul') {
      displayCoeff *= displayValue.coeff;
      displayValue = displayValue.value;
    }
    return new LinearExpr(this.model, terms, this.offset * coeff, {
      kind: 'mul',
      coeff: displayCoeff,
      value: displayValue,
    });
  }

  neg() {
    return this.times(-1);
  }

  abs(): never {
    throw new NotImplementedError(
      'calling abs() on a linear expression is not supported, please use CpModel.add_abs_equality',
    );
  }

  __abs__(): never {
    return this.abs();
  }

  div(_value: LinearExprLike): never {
    throw new NotImplementedError(
      'calling // on a linear expression is not supported, please use CpModel.add_division_equality',
    );
  }

  __div__(value: LinearExprLike): never {
    return this.div(value);
  }

  truediv(_value: LinearExprLike): never {
    return this.div(_value);
  }

  __truediv__(value: LinearExprLike): never {
    return this.truediv(value);
  }

  mod(_value: LinearExprLike): never {
    throw new NotImplementedError(
      'calling %% on a linear expression is not supported, please use CpModel.add_modulo_equality',
    );
  }

  __mod__(value: LinearExprLike): never {
    return this.mod(value);
  }

  __pow__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling ** on a linear expression is not supported');
  }

  __lshift__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling << on a linear expression is not supported');
  }

  __rshift__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling >> on a linear expression is not supported');
  }

  __and__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling & on a linear expression is not supported');
  }

  __or__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling | on a linear expression is not supported');
  }

  __xor__(_value: LinearExprLike): never {
    throw new NotImplementedError('calling ^ on a linear expression is not supported');
  }

  eq(value: LinearExprLike) {
    return new BoundedLinearExpr(this.minus(value), 0, 0);
  }

  ne(value: LinearExprLike) {
    if (isProtoInt64Constant(value) && isInt64Min(value)) {
      return new BoundedLinearExpr(this, bigintToProtoInt64(-9223372036854775807n), INT64_MAX);
    }
    if (isProtoInt64Constant(value) && isInt64Max(value)) {
      return new BoundedLinearExpr(this, INT64_MIN, bigintToProtoInt64(9223372036854775806n));
    }
    return new BoundedLinearExpr(this.minus(value), INT64_MIN, -1, [INT64_MIN, -1, 1, INT64_MAX]);
  }

  le(value: LinearExprLike) {
    if (isProtoInt64Constant(value)) {
      return new BoundedLinearExpr(this, INT64_MIN, value);
    }
    return new BoundedLinearExpr(this.minus(value), INT64_MIN, 0);
  }

  lt(value: LinearExprLike) {
    if (isProtoInt64Constant(value) && isInt64Min(value)) {
      throw new ArithmeticError('integer expressions cannot be less than INT_MIN');
    }
    return new BoundedLinearExpr(this.minus(value), INT64_MIN, -1);
  }

  ge(value: LinearExprLike) {
    if (isProtoInt64Constant(value)) {
      return new BoundedLinearExpr(this, value, INT64_MAX);
    }
    return new BoundedLinearExpr(this.minus(value), 0, INT64_MAX);
  }

  gt(value: LinearExprLike) {
    if (isProtoInt64Constant(value) && isInt64Max(value)) {
      throw new ArithmeticError('integer expressions cannot be greater than INT_MAX');
    }
    return new BoundedLinearExpr(this.minus(value), 1, INT64_MAX);
  }

  toProto(): LinearExpressionProto {
    const vars: number[] = [];
    const coeffs: ProtoInt64[] = [];
    for (const [index, coeff] of this.terms) {
      vars.push(index);
      coeffs.push(asInt64(coeff));
    }
    const proto: LinearExpressionProto = { vars, coeffs };
    if (this.offset !== 0) {
      proto.offset = asInt64(this.offset);
    }
    return proto;
  }

  toString() {
    if (this.display) {
      return renderLinearExprDisplay(this.display, this.model);
    }
    if (this.terms.size === 1 && this.offset !== 0) {
      const [[index, coeff]] = Array.from(this.terms);
      const variable = this.model?.getIntVarFromProtoIndex(index);
      if (variable instanceof BoolVar && coeff === -this.offset) {
        return `(${this.offset} * not(${variable}))`;
      }
    }
    const pieces: string[] = [];
    let singleTermNeedsParens = false;
    for (const [index, coeff] of this.terms) {
      const name = this.model?.proto().variables?.[index]?.name || `var${index}`;
      if (coeff === 1) {
        pieces.push(name);
      } else if (coeff === -1) {
        pieces.push(`-${name}`);
        singleTermNeedsParens = true;
      } else {
        pieces.push(`${coeff} * ${name}`);
        singleTermNeedsParens = true;
      }
    }
    if (this.offset !== 0 || pieces.length === 0) {
      pieces.push(String(this.offset));
      singleTermNeedsParens = false;
    }
    const [first, ...rest] = pieces;
    const value = rest.reduce((text, piece) => {
      if (piece.startsWith('-')) {
        return `${text} - ${piece.slice(1)}`;
      }
      return `${text} + ${piece}`;
    }, first);
    return pieces.length > 1 || singleTermNeedsParens ? `(${value})` : value;
  }

  [Symbol.toPrimitive](hint: string) {
    if (hint === 'string') {
      return this.toString();
    }
    return unsupportedNativeOperatorCoercion();
  }

  displayNodeForRendering(): LinearExprDisplayNode {
    if (this.display) {
      return this.display;
    }
    if (this.terms.size === 0) {
      return { kind: 'const', value: this.offset };
    }
    const values = Array.from(this.terms, ([index, coeff]) => {
      const variable: LinearExprDisplayNode = { kind: 'var', index };
      return coeff === 1 ? variable : { kind: 'mul', coeff, value: variable } as LinearExprDisplayNode;
    });
    if (this.offset !== 0) {
      values.push({ kind: 'const', value: this.offset });
    }
    return values.length === 1 ? values[0] : { kind: 'sum', values };
  }

  hasFloatingPointTerms() {
    return this.offset !== 0 && !Number.isInteger(this.offset)
      || Array.from(this.terms.values()).some((coeff) => !Number.isInteger(coeff));
  }

  isInteger() {
    return !this.hasFloatingPointTerms();
  }

  is_integer() {
    return this.isInteger();
  }

  repr() {
    if (this.terms.size === 0) {
      return Number.isInteger(this.offset) ? `IntConstant(${this.offset})` : `FloatConstant(${this.offset})`;
    }
    if (this.terms.size === 1) {
      const [[index, coeff]] = Array.from(this.terms);
      if (coeff === 1 && this.offset === 0) {
        const variable = this.model?.getIntVarFromProtoIndex(index);
        return variable?.repr() ?? String(this);
      }
      const variable = this.model?.getIntVarFromProtoIndex(index);
      const variableRepr = variable?.repr() ?? `var${index}`;
      if (Number.isInteger(coeff) && Number.isInteger(this.offset)) {
        return `IntAffine(expr=${variableRepr}, coeff=${coeff}, offset=${this.offset})`;
      }
      return `FloatAffine(expr=${variableRepr}, coeff=${coeff}, offset=${this.offset})`;
    }
    if (this.display?.kind === 'sum') {
      return renderLinearExprDisplayRepr(this.display, this.model);
    }
    const variables = Array.from(this.terms, ([index]) => {
      const variable = this.model?.getIntVarFromProtoIndex(index);
      return variable?.repr() ?? `var${index}`;
    });
    const coeffs = Array.from(this.terms.values());
    if (this.offset === 0 && coeffs.every((coeff) => coeff === 1)) {
      return `SumArray(${variables.join(', ')})`;
    }
    if (coeffs.every((coeff) => Number.isInteger(coeff)) && Number.isInteger(this.offset)) {
      return `IntWeightedSum([${variables.join(', ')}], [${coeffs.join(', ')}], ${this.offset})`;
    }
    return `FloatWeightedSum([${variables.join(', ')}], [${coeffs.join(', ')}], ${this.offset})`;
  }

  toFloatObjective(maximize = false) {
    return {
      vars: Array.from(this.terms.keys()),
      coeffs: Array.from(this.terms.values()),
      offset: this.offset,
      maximize,
    };
  }
}

export class BoundedLinearExpr {
  constructor(
    readonly expression: LinearExpr,
    readonly lowerBound: ProtoInt64,
    readonly upperBound: ProtoInt64,
    readonly domain?: ProtoInt64[],
  ) {}

  toString() {
    const normalizedExpression = new LinearExpr(this.expression.model, this.expression.terms, 0);
    const expressionText = String(normalizedExpression);
    const lower = adjustedProtoInt64ToString(this.lowerBound, this.expression.offset);
    const upper = adjustedProtoInt64ToString(this.upperBound, this.expression.offset);
    if (this.domain !== undefined) {
      if (
        this.domain.length === 4
        && isInt64Min(this.domain[0])
        && protoInt64ToNumber(this.domain[1]) === -1
        && protoInt64ToNumber(this.domain[2]) === 1
        && isInt64Max(this.domain[3])
      ) {
        return `${expressionText} != ${-this.expression.offset}`;
      }
      const [firstLower, firstUpper, secondLower, secondUpper] = this.domain.map((value) =>
        adjustedProtoInt64ToString(value, this.expression.offset),
      );
      if (isInt64Min(this.domain[0]) && secondLower !== undefined && isInt64Max(this.domain[3])) {
        const firstUpperEnd = (BigInt(firstUpper) + 1n).toString();
        const secondLowerStart = (BigInt(secondLower) - 1n).toString();
        return `(${expressionText}) not in [${firstUpperEnd}, ${secondLowerStart}]`;
      }
      return `${expressionText} in [${[firstLower, firstUpper, secondLower, secondUpper].filter((value) => value !== undefined).join(', ')}]`;
    }
    if (isInt64Min(this.lowerBound) && isInt64Max(this.upperBound)) {
      return `True (unbounded expr ${expressionText})`;
    }
    if (isInt64Min(this.lowerBound)) {
      return `${expressionText} <= ${upper}`;
    }
    if (isInt64Max(this.upperBound)) {
      return `${expressionText} >= ${lower}`;
    }
    if (compareAdjustedProtoInt64(this.lowerBound, this.upperBound, this.expression.offset) === 0) {
      return `${expressionText} == ${lower}`;
    }
    return `${lower} <= ${expressionText} <= ${upper}`;
  }

  [Symbol.toPrimitive](hint: string) {
    if (hint === 'string') {
      return this.toString();
    }
    return unsupportedNativeOperatorCoercion();
  }
}

export class BoundedLinearExpression extends BoundedLinearExpr {
  constructor(expression: unknown, domain: unknown) {
    const linear = LinearExpr.from(expression as LinearExprLike);
    valueError(domain instanceof Domain, 'domain must be a Domain');
    const flatDomain = domain.flatIntervals;
    valueError(flatDomain.length >= 2 && flatDomain.length % 2 === 0, 'domain must contain complete intervals');
    if (flatDomain.length === 2) {
      super(linear, flatDomain[0], flatDomain[1]);
    } else {
      super(linear, flatDomain[0], flatDomain[flatDomain.length - 1], flatDomain);
    }
  }
}

export class IntVar {
  constructor(
    readonly model: CpModel,
    readonly index: number,
    _name = '',
  ) {}

  get name() {
    return this.model.proto().variables?.[this.index]?.name ?? '';
  }

  get model_proto() {
    return this.model.proto();
  }

  expr() {
    return new LinearExpr(this.model, new Map([[this.index, 1]]), 0, { kind: 'var', index: this.index });
  }

  plus(value: LinearExprLike, coeff = 1) {
    return this.expr().plus(value, coeff);
  }

  __add__(value: LinearExprLike) {
    return this.plus(value);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: number) {
    return this.expr().times(coeff);
  }

  __mul__(coeff: number) {
    return this.times(coeff);
  }

  neg() {
    return this.expr().neg();
  }

  abs(): never {
    return this.expr().abs();
  }

  __abs__(): never {
    return this.abs();
  }

  div(value: LinearExprLike): never {
    return this.expr().div(value);
  }

  __div__(value: LinearExprLike): never {
    return this.div(value);
  }

  truediv(value: LinearExprLike): never {
    return this.expr().truediv(value);
  }

  __truediv__(value: LinearExprLike): never {
    return this.truediv(value);
  }

  mod(value: LinearExprLike): never {
    return this.expr().mod(value);
  }

  __mod__(value: LinearExprLike): never {
    return this.mod(value);
  }

  __pow__(value: LinearExprLike): never {
    return this.expr().__pow__(value);
  }

  __lshift__(value: LinearExprLike): never {
    return this.expr().__lshift__(value);
  }

  __rshift__(value: LinearExprLike): never {
    return this.expr().__rshift__(value);
  }

  __and__(value: LinearExprLike): never {
    return this.expr().__and__(value);
  }

  __or__(value: LinearExprLike): never {
    return this.expr().__or__(value);
  }

  __xor__(value: LinearExprLike): never {
    return this.expr().__xor__(value);
  }

  isInteger() {
    return true;
  }

  is_integer() {
    return true;
  }

  isBoolean() {
    return this.model.isBooleanIndex(this.index);
  }

  get is_boolean() {
    return this.isBoolean();
  }

  negated() {
    if (!this.isBoolean()) {
      throw new TypeError('negated() is only supported for Boolean variables.');
    }
    return new NotBoolVar(this);
  }

  toString() {
    const variable = this.model.proto().variables?.[this.index];
    if (variable?.name) {
      return variable.name;
    }
    const domain = variable?.domain ?? [];
    if (domain.length >= 2 && protoInt64ToString(domain[0]) === protoInt64ToString(domain[1])) {
      return protoInt64ToString(domain[0]);
    }
    return this.isBoolean() ? `b${this.index}` : `x${this.index}`;
  }

  [Symbol.toPrimitive](hint: string) {
    if (hint === 'string') {
      return this.toString();
    }
    return unsupportedNativeOperatorCoercion();
  }

  debugString() {
    const name = String(this);
    const domain = this.model.proto().variables?.[this.index]?.domain ?? [];
    return `${name}(${formatDomain(domain)})`;
  }

  repr() {
    return this.debugString();
  }

  eq(value: LinearExprLike) {
    return this.expr().eq(value);
  }

  ne(value: LinearExprLike) {
    return this.expr().ne(value);
  }

  le(value: LinearExprLike) {
    return this.expr().le(value);
  }

  lt(value: LinearExprLike) {
    return this.expr().lt(value);
  }

  __lt__(value: LinearExprLike) {
    return this.lt(value);
  }

  ge(value: LinearExprLike) {
    return this.expr().ge(value);
  }

  gt(value: LinearExprLike) {
    return this.expr().gt(value);
  }

  __gt__(value: LinearExprLike) {
    return this.gt(value);
  }
}

export class BoolVar extends IntVar {
  get literalIndex() {
    return this.index;
  }

  not() {
    return this.negated();
  }
}

function isBoolExpression(value: LinearExprLike) {
  return value instanceof BoolVar || value instanceof NotBoolVar;
}

export class NotBoolVar {
  readonly model: CpModel;
  readonly index: number;
  readonly name: string;

  constructor(readonly variable: IntVar) {
    this.model = variable.model;
    this.index = -variable.index - 1;
    this.name = variable.name ? `not(${variable.name})` : '';
  }

  get model_proto() {
    return this.model.proto();
  }

  not() {
    return this.variable;
  }

  negated() {
    return this.variable;
  }

  plus(value: LinearExprLike, coeff = 1) {
    return this.expr().plus(value, coeff);
  }

  __add__(value: LinearExprLike) {
    return this.plus(value);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: number) {
    return this.expr().times(coeff);
  }

  __mul__(coeff: number) {
    return this.times(coeff);
  }

  neg() {
    return this.expr().neg();
  }

  abs(): never {
    return this.expr().abs();
  }

  __abs__(): never {
    return this.abs();
  }

  div(value: LinearExprLike): never {
    return this.expr().div(value);
  }

  __div__(value: LinearExprLike): never {
    return this.div(value);
  }

  truediv(value: LinearExprLike): never {
    return this.expr().truediv(value);
  }

  __truediv__(value: LinearExprLike): never {
    return this.truediv(value);
  }

  mod(value: LinearExprLike): never {
    return this.expr().mod(value);
  }

  __mod__(value: LinearExprLike): never {
    return this.mod(value);
  }

  __pow__(value: LinearExprLike): never {
    return this.expr().__pow__(value);
  }

  __lshift__(value: LinearExprLike): never {
    return this.expr().__lshift__(value);
  }

  __rshift__(value: LinearExprLike): never {
    return this.expr().__rshift__(value);
  }

  __and__(value: LinearExprLike): never {
    return this.expr().__and__(value);
  }

  __or__(value: LinearExprLike): never {
    return this.expr().__or__(value);
  }

  __xor__(value: LinearExprLike): never {
    return this.expr().__xor__(value);
  }

  isInteger() {
    return true;
  }

  is_integer() {
    return true;
  }

  expr() {
    return new LinearExpr(this.model, new Map([[this.variable.index, -1]]), 1, {
      kind: 'not',
      index: this.variable.index,
    });
  }

  toString() {
    return `not(${this.variable})`;
  }

  [Symbol.toPrimitive](hint: string) {
    if (hint === 'string') {
      return this.toString();
    }
    return unsupportedNativeOperatorCoercion();
  }

  repr() {
    return `NotBooleanVariable(var_index=${this.variable.index})`;
  }
}

export class FlatIntExpr {
  readonly vars: IntVar[];
  readonly coeffs: number[];
  readonly offset: number;

  constructor(expression: unknown) {
    if (expression instanceof FlatIntExpr || expression instanceof FlatFloatExpr) {
      valueError(expression.coeffs.every((coeff) => Number.isInteger(coeff)) && Number.isInteger(expression.offset), 'expression is not integer');
      this.vars = [...expression.vars];
      this.coeffs = [...expression.coeffs];
      this.offset = expression.offset;
      return;
    }
    const linear = LinearExpr.from(expression as LinearExprLike);
    valueError(linear.isInteger(), 'expression is not integer');
    const vars: IntVar[] = [];
    const coeffs: number[] = [];
    for (const [index, coeff] of linear.terms) {
      assert(linear.model, `missing model for variable ${index}`);
      vars.push(linear.model.getIntVarFromProtoIndex(index));
      coeffs.push(coeff);
    }
    this.vars = vars;
    this.coeffs = coeffs;
    this.offset = linear.offset;
  }

  expr() {
    const model = this.vars[0]?.model ?? null;
    const terms = new Map<number, number>();
    for (let index = 0; index < this.vars.length; index += 1) {
      terms.set(this.vars[index].index, this.coeffs[index]);
    }
    return new LinearExpr(model, terms, this.offset);
  }

  plus(value: LinearExprLike) {
    return this.expr().plus(value);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: number) {
    return this.expr().times(coeff);
  }

  toString() {
    return formatFlatExpression(this.vars, this.coeffs, this.offset);
  }

  repr() {
    return `FlatIntExpr([${this.vars.map((variable) => variable.repr()).join(', ')}], [${this.coeffs.join(', ')}], ${this.offset})`;
  }
}

export class FlatFloatExpr {
  readonly vars: IntVar[];
  readonly coeffs: number[];
  readonly offset: number;

  constructor(expression: unknown) {
    if (expression instanceof FlatIntExpr || expression instanceof FlatFloatExpr) {
      this.vars = [...expression.vars];
      this.coeffs = expression.coeffs.map((coeff) => Number(coeff));
      this.offset = Number(expression.offset);
      return;
    }
    const linear = LinearExpr.from(expression as LinearExprLike);
    const vars: IntVar[] = [];
    const coeffs: number[] = [];
    for (const [index, coeff] of linear.terms) {
      assert(linear.model, `missing model for variable ${index}`);
      vars.push(linear.model.getIntVarFromProtoIndex(index));
      coeffs.push(Number(coeff));
    }
    this.vars = vars;
    this.coeffs = coeffs;
    this.offset = Number(linear.offset);
  }

  expr() {
    const model = this.vars[0]?.model ?? null;
    const terms = new Map<number, number>();
    for (let index = 0; index < this.vars.length; index += 1) {
      terms.set(this.vars[index].index, this.coeffs[index]);
    }
    return new LinearExpr(model, terms, this.offset);
  }

  plus(value: LinearExprLike) {
    return this.expr().plus(value);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: number) {
    return this.expr().times(coeff);
  }

  toString() {
    return formatFlatExpression(this.vars, this.coeffs, this.offset);
  }

  repr() {
    return `FlatFloatExpr([${this.vars.map((variable) => variable.repr()).join(', ')}], [${this.coeffs.join(', ')}], ${this.offset})`;
  }
}

export class IntervalVar {
  constructor(
    readonly model: CpModel,
    readonly index: number,
    public name = '',
    private readonly start: LinearExprLike,
    private readonly size: LinearExprLike,
    private readonly end: LinearExprLike,
    private readonly isPresent?: LiteralLike,
  ) {}

  get model_proto() {
    return this.model.proto();
  }

  startExpr() {
    return this.start;
  }

  sizeExpr() {
    return this.size;
  }

  endExpr() {
    return this.end;
  }

  presenceLiterals() {
    return this.isPresent === undefined ? [] : [this.isPresent];
  }

  toString() {
    return this.name || `interval${this.index}`;
  }

  repr() {
    const pieces = [
      `start = ${this.start}`,
      `size = ${this.size}`,
      `end = ${this.end}`,
    ];
    if (this.isPresent !== undefined) {
      pieces.push(`is_present = ${this.isPresent}`);
    }
    return `${this}(${pieces.join(', ')})`;
  }
}

export class Constraint {
  constructor(
    readonly model: CpModel,
    readonly index: number,
  ) {}

  get name() {
    return this.model.proto().constraints?.[this.index]?.name ?? '';
  }

  withName(name: string) {
    const constraint = this.model.proto().constraints?.[this.index];
    assert(constraint, 'constraint no longer exists in model');
    constraint.name = name;
    return this;
  }

  with_name(name: string) {
    return this.withName(name);
  }

  onlyEnforceIf(literals: LiteralLike | Iterable<LiteralLike>, ...rest: LiteralLike[]) {
    const values = literalList(literals, rest);
    const constraint = this.model.proto().constraints?.[this.index];
    assert(constraint, 'constraint no longer exists in model');
    constraint.enforcementLiteral = [
      ...(constraint.enforcementLiteral ?? []),
      ...this.model.literalReferences(values),
    ];
    return this;
  }
}

function simplifyLinearSum(values: LinearExprLike[]) {
  let constant = 0;
  const nonConstantValues: LinearExprLike[] = [];
  for (const value of values) {
    if (typeof value === 'number') {
      constant += value;
    } else {
      nonConstantValues.push(value);
    }
  }
  if (nonConstantValues.length === 0) {
    return LinearExpr.constant(constant);
  }
  if (constant === 0 && nonConstantValues.length === 1) {
    return nonConstantValues[0];
  }
  return null;
}

function combineLinearExpressions(
  values: Iterable<LinearExprLike>,
  scaleByIndex?: (index: number) => number,
  display?: LinearExprDisplayNode | null,
) {
  let model: CpModel | null = null;
  const terms = new Map<number, number>();
  let offset = 0;
  let index = 0;
  for (const value of values) {
    const scale = scaleByIndex?.(index) ?? 1;
    assert(Number.isFinite(scale), `expected finite coefficient, got ${scale}`);
    const expression = LinearExpr.from(value);
    if (model && expression.model) {
      requireSameModel(model, expression.model, 'linear expression');
    }
    model ??= expression.model;
    for (const [termIndex, termCoeff] of expression.terms) {
      mergeTerms(terms, termIndex, termCoeff * scale);
    }
    offset += expression.offset * scale;
    index += 1;
  }
  return new LinearExpr(model, terms, offset, display ?? null);
}

export function sum(values: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]): LinearExprLike {
  const valueList = iterableValues(values, rest);
  const simplified = simplifyLinearSum(valueList);
  if (simplified !== null) {
    return simplified;
  }
  const displayValues = valueList.map((value) => LinearExpr.from(value).displayNodeForRendering());
  return combineLinearExpressions(valueList, undefined, { kind: 'sum', values: displayValues });
}

export function weightedSum(values: Iterable<LinearExprLike>, coeffs: Iterable<number>): LinearExprLike {
  const valueList = Array.from(values);
  const coeffList = Array.from(coeffs);
  valueError(valueList.length === coeffList.length, 'weightedSum requires the same number of expressions and coefficients');
  const displayValues = valueList.map((value) => LinearExpr.from(value).displayNodeForRendering());
  const result = combineLinearExpressions(valueList, (index) => coeffList[index], {
    kind: 'weighted',
    values: displayValues,
    coeffs: coeffList,
  });
  const simplified = simplifyLinearSum([result]);
  if (simplified !== null) {
    return simplified;
  }
  return result;
}

export function term(variable: IntVar | NotBoolVar, coeff: number) {
  return variable.times(coeff);
}

function formatFlatExpression(vars: IntVar[], coeffs: number[], offset: number) {
  const pieces: string[] = [];
  for (let index = 0; index < vars.length; index += 1) {
    const coeff = coeffs[index];
    const variable = String(vars[index]);
    if (coeff === 1) {
      pieces.push(variable);
    } else if (coeff === -1) {
      pieces.push(`-${variable}`);
    } else {
      pieces.push(`${coeff} * ${variable}`);
    }
  }
  if (offset !== 0 || pieces.length === 0) {
    pieces.push(String(offset));
  }
  const [first, ...rest] = pieces;
  const value = rest.reduce((text, piece) => {
    if (piece.startsWith('-')) {
      return `${text} - ${piece.slice(1)}`;
    }
    return `${text} + ${piece}`;
  }, first);
  return pieces.length > 1 ? `(${value})` : value;
}

function formatDomain(domain: ProtoInt64[]) {
  const pieces: string[] = [];
  for (let index = 0; index < domain.length; index += 2) {
    const lower = domain[index];
    const upper = domain[index + 1];
    if (upper === undefined) {
      break;
    }
    const lowerText = protoInt64ToString(lower);
    const upperText = protoInt64ToString(upper);
    pieces.push(lowerText === upperText ? lowerText : `${lowerText}..${upperText}`);
  }
  return pieces.join(', ');
}

function isBooleanDomain(domain: ProtoInt64[]) {
  return domain.length === 2 && compareProtoInt64(domain[0], 0) >= 0 && compareProtoInt64(domain[1], 1) <= 0;
}

export class Domain {
  readonly flatIntervals: ProtoInt64[];

  constructor(lower: unknown, upper?: unknown);
  constructor(flatIntervals: Iterable<unknown>);
  constructor(lowerOrIntervals: unknown, upper?: unknown) {
    if (upper !== undefined) {
      this.flatIntervals = [normalizeInt64(lowerOrIntervals as ProtoInt64), normalizeInt64(upper as ProtoInt64)];
      return;
    }
    if (
      typeof lowerOrIntervals === 'number'
      || typeof lowerOrIntervals === 'string'
      || isProtoInt64Object(lowerOrIntervals)
    ) {
      const value = normalizeInt64(lowerOrIntervals as ProtoInt64);
      this.flatIntervals = [value, value];
      return;
    }
    this.flatIntervals = Array.from(lowerOrIntervals as Iterable<ProtoInt64>, normalizeInt64);
  }

  static fromFlatIntervals(intervals: Iterable<ProtoInt64>) {
    return new Domain(Array.from(intervals, normalizeInt64));
  }

  static from_flat_intervals(intervals: Iterable<ProtoInt64>) {
    return Domain.fromFlatIntervals(intervals);
  }

  static fromIntervals(intervals: Iterable<Iterable<ProtoInt64>>) {
    const flatIntervals: ProtoInt64[] = [];
    for (const interval of intervals) {
      const values = Array.from(interval, normalizeInt64);
      valueError(values.length === 1 || values.length === 2, 'domain intervals must contain one or two bounds');
      flatIntervals.push(values[0], values[1] ?? values[0]);
    }
    return new Domain(flatIntervals);
  }

  static from_intervals(intervals: Iterable<Iterable<ProtoInt64>>) {
    return Domain.fromIntervals(intervals);
  }

  static fromValues(values: Iterable<number>) {
    const sortedValues = Array.from(new Set(values)).sort((left, right) => left - right);
    const flatIntervals: ProtoInt64[] = [];
    for (const value of sortedValues) {
      valueError(Number.isInteger(value), `domain value must be an integer, got ${value}`);
      const lastUpper = flatIntervals[flatIntervals.length - 1];
      if (typeof lastUpper === 'number' && lastUpper + 1 === value) {
        flatIntervals[flatIntervals.length - 1] = value;
      } else {
        flatIntervals.push(value, value);
      }
    }
    return new Domain(flatIntervals);
  }

  static from_values(values: Iterable<number>) {
    return Domain.fromValues(values);
  }
}

export class CpModel {
  private readonly model: CpModelProto;
  private readonly boolVariableIndexes = new Set<number>();
  private readonly constantIndexes = new Map<number, number>();
  private readonly intVariables = new Map<number, IntVar>();
  private trueConstant: BoolVar | null = null;
  private falseConstant: BoolVar | null = null;

  constructor(model?: CpModelProto) {
    this.model = model === undefined ? { variables: [], constraints: [] } : cloneProto(model);
    for (const [index, variable] of (this.model.variables ?? []).entries()) {
      const domain = variable.domain ?? [];
      if (isBooleanDomain(domain)) {
        this.boolVariableIndexes.add(index);
      }
      if (domain.length === 2 && compareProtoInt64(domain[0], domain[1]) === 0) {
        this.constantIndexes.set(protoInt64ToNumber(domain[0]), index);
      }
    }
  }

  get name() {
    return this.model.name ?? '';
  }

  set name(name: string) {
    this.model.name = name;
  }

  proto() {
    return this.model;
  }

  Proto() {
    return this.proto();
  }

  clone() {
    return new CpModel(this.model);
  }

  removeAllNames() {
    this.model.name = '';
    for (const variable of this.model.variables ?? []) {
      variable.name = '';
    }
    for (const constraint of this.model.constraints ?? []) {
      constraint.name = '';
    }
  }

  remove_all_names() {
    this.removeAllNames();
  }

  newIntVar(lb: ProtoInt64, ub: ProtoInt64, name = '') {
    const index = this.model.variables?.length ?? 0;
    const domain = [normalizeInt64(lb), normalizeInt64(ub)];
    this.model.variables?.push(compareProtoInt64(lb, ub) <= 0 ? { name, domain } : { name });
    if (isBooleanDomain(domain)) {
      this.boolVariableIndexes.add(index);
    }
    const variable = new IntVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  new_int_var(lb: ProtoInt64, ub: ProtoInt64, name = '') {
    return this.newIntVar(lb, ub, name);
  }

  NewIntVar(lb: ProtoInt64, ub: ProtoInt64, name = '') {
    return this.newIntVar(lb, ub, name);
  }

  newIntVarFromDomain(domain: Domain, name = '') {
    const index = this.model.variables?.length ?? 0;
    const flatDomain = [...domain.flatIntervals];
    this.model.variables?.push({ name, domain: flatDomain });
    if (isBooleanDomain(flatDomain)) {
      this.boolVariableIndexes.add(index);
    }
    const variable = new IntVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  new_int_var_from_domain(domain: Domain, name = '') {
    return this.newIntVarFromDomain(domain, name);
  }

  NewIntVarFromDomain(domain: Domain, name = '') {
    return this.newIntVarFromDomain(domain, name);
  }

  newBoolVar(name = '') {
    const index = this.model.variables?.length ?? 0;
    this.model.variables?.push({ name, domain: [0, 1] });
    this.boolVariableIndexes.add(index);
    const variable = new BoolVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  new_bool_var(name = '') {
    return this.newBoolVar(name);
  }

  NewBoolVar(name = '') {
    return this.newBoolVar(name);
  }

  newConstant(value: number, name = '') {
    if (name) {
      return this.newIntVar(value, value, name);
    }
    return this.getIntVarFromProtoIndex(this.getOrMakeIndexFromConstant(value));
  }

  new_constant(value: number, name = '') {
    return this.newConstant(value, name);
  }

  NewConstant(value: number, name = '') {
    return this.newConstant(value, name);
  }

  getIntVarFromProtoIndex(index: number) {
    valueError(Number.isInteger(index), `variable index must be an integer, got ${index}`);
    const variables = this.model.variables ?? [];
    valueError(index >= 0 && index < variables.length, `getIntVarFromProtoIndex: out of bound index ${index}`);
    const existing = this.intVariables.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const variable = new IntVar(this, index, variables[index]?.name ?? '');
    this.intVariables.set(index, variable);
    return variable;
  }

  get_int_var_from_proto_index(index: number) {
    return this.getIntVarFromProtoIndex(index);
  }

  getBoolVarFromProtoIndex(index: number) {
    const variable = this.getIntVarFromProtoIndex(index);
    if (!variable.isBoolean()) {
      throw new TypeError(`getBoolVarFromProtoIndex: index ${index} is not Boolean`);
    }
    if (variable instanceof BoolVar) {
      return variable;
    }
    const boolVariable = new BoolVar(this, index);
    this.intVariables.set(index, boolVariable);
    return boolVariable;
  }

  get_bool_var_from_proto_index(index: number) {
    return this.getBoolVarFromProtoIndex(index);
  }

  getIntervalVarFromProtoIndex(index: number) {
    valueError(Number.isInteger(index), `interval index must be an integer, got ${index}`);
    const constraints = this.model.constraints ?? [];
    valueError(index >= 0 && index < constraints.length, `getIntervalVarFromProtoIndex: out of bound index ${index}`);
    const constraint = constraints[index];
    valueError(constraint?.interval !== undefined, `getIntervalVarFromProtoIndex: index ${index} is not an interval`);
    const interval = constraint.interval;
    return new IntervalVar(
      this,
      index,
      constraint.name ?? '',
      this.expressionFromProto(interval.start),
      this.expressionFromProto(interval.size),
      this.expressionFromProto(interval.end),
      constraint.enforcementLiteral?.[0] === undefined ? undefined : this.literalFromProtoIndex(constraint.enforcementLiteral[0]),
    );
  }

  get_interval_var_from_proto_index(index: number) {
    return this.getIntervalVarFromProtoIndex(index);
  }

  getOrMakeIndexFromConstant(value: number) {
    valueError(Number.isInteger(value), `constant index requires an integer, got ${value}`);
    const existingIndex = this.constantIndexes.get(value);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
    const index = this.model.variables?.length ?? 0;
    const domain: ProtoInt64[] = [value, value];
    this.model.variables?.push({ domain });
    if (isBooleanDomain(domain)) {
      this.boolVariableIndexes.add(index);
    }
    this.constantIndexes.set(value, index);
    return index;
  }

  get_or_make_index_from_constant(value: number) {
    return this.getOrMakeIndexFromConstant(value);
  }

  getOrMakeVariableIndex(variable: unknown) {
    return this.get_or_make_variable_index(variable);
  }

  isBooleanValue(value: unknown) {
    return value === true || value === false;
  }

  is_boolean_value(value: unknown) {
    return this.isBooleanValue(value);
  }

  isBooleanIndex(index: number) {
    return this.boolVariableIndexes.has(index);
  }

  get_or_make_variable_index(variable: unknown) {
    if (typeof variable === 'number') {
      valueError(Number.isInteger(variable), `variable index requires an integer, got ${variable}`);
      return this.getOrMakeIndexFromConstant(variable);
    }
    if (variable instanceof IntVar) {
      requireSameModel(this, variable.model, 'variable');
      return variable.index;
    }
    if (variable instanceof NotBoolVar) {
      requireSameModel(this, variable.model, 'variable');
      return variable.index;
    }
    if (variable === true) {
      return this.constantBoolIndex(true);
    }
    if (variable === false) {
      return this.constantBoolIndex(false);
    }
    throw new TypeError('expected a variable-like object');
  }

  add(bound: BoundedLinearExpr | boolean) {
    if (bound === true) {
      return this.addBoolOr([true]);
    }
    if (bound === false) {
      return this.addBoolOr([]);
    }
    return this.addLinearConstraint(bound.expression, bound.lowerBound, bound.upperBound, bound.domain);
  }

  Add(bound: BoundedLinearExpr | boolean) {
    return this.add(bound);
  }

  addLinearConstraint(expression: LinearExprLike, lb: ProtoInt64, ub: ProtoInt64, domain?: ProtoInt64[]) {
    const expr = LinearExpr.from(expression);
    this.checkExpressionModel(expr);
    if (expr.terms.size === 0 && domain === undefined) {
      const numericLb = protoInt64ToNumber(lb);
      const numericUb = protoInt64ToNumber(ub);
      return expr.offset >= numericLb && expr.offset <= numericUb
        ? this.pushConstraint({ boolAnd: { literals: [] } })
        : this.pushConstraint({ boolOr: { literals: [] } });
    }
    const proto = expr.toProto();
    const adjustedDomain = (domain ?? [lb, ub]).map((value) => adjustDomainEndpoint(value, expr.offset));
    return this.pushConstraint({
      linear: {
        vars: proto.vars,
        coeffs: proto.coeffs,
        domain: adjustedDomain,
      },
    });
  }

  add_linear_constraint(expression: LinearExprLike, lb: number, ub: number) {
    return this.addLinearConstraint(expression, lb, ub);
  }

  AddLinearConstraint(expression: LinearExprLike, lb: ProtoInt64, ub: ProtoInt64) {
    return this.addLinearConstraint(expression, lb, ub);
  }

  addEquality(left: LinearExprLike, right: LinearExprLike) {
    return this.add(LinearExpr.from(left).eq(right));
  }

  addAllDifferent(expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.pushConstraint({
      allDiff: { exprs: this.expressionProtos(expressionList(expressions, rest)) },
    });
  }

  AddAllDifferent(expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.addAllDifferent(expressions, ...rest);
  }

  addElement(index: LinearExprLike, expressions: Iterable<LinearExprLike | number>, target: LinearExprLike) {
    const exprs = Array.from(expressions);
    valueError(exprs.length > 0, 'addElement requires at least one expression');
    if (typeof index === 'number') {
      valueError(Number.isInteger(index), `element index must be an integer, got ${index}`);
      valueError(index >= 0 && index < exprs.length, `element index ${index} is out of range`);
      return this.add(LinearExpr.from(target).eq(exprs[index]));
    }
    return this.pushConstraint({
      element: {
        linearIndex: this.expressionProto(index),
        exprs: this.expressionProtos(exprs),
        linearTarget: this.expressionProto(target),
      },
    });
  }

  addAllowedAssignments(expressions: Iterable<LinearExprLike>, tuples: Iterable<Iterable<number>>) {
    const exprs = this.expressionProtos(expressions);
    valueError(exprs.length > 0, 'addAllowedAssignments requires at least one expression');
    const values = Array.from(tuples, (tupleValue) => Array.from(tupleValue));
    for (const tupleValue of values) {
      valueError(tupleValue.length === exprs.length, 'tuple arity does not match expression count');
    }
    return this.pushConstraint({
      table: {
        exprs,
        values: values.flat().map(asInt64),
      },
    });
  }

  addForbiddenAssignments(expressions: Iterable<LinearExprLike>, tuples: Iterable<Iterable<number>>) {
    const constraint = this.addAllowedAssignments(expressions, tuples);
    const proto = this.model.constraints?.[constraint.index];
    assert(proto?.table, 'table constraint was not created');
    proto.table.negated = true;
    return constraint;
  }

  addAutomaton(expressions: Iterable<LinearExprLike>, startingState: number, finalStates: Iterable<number>, transitions: Iterable<[number, number, number]>) {
    const exprs = this.expressionProtos(expressions);
    const finalStateValues = Array.from(finalStates, asInt64);
    const transitionValues = Array.from(transitions);
    valueError(exprs.length > 0, 'addAutomaton requires at least one expression');
    valueError(finalStateValues.length > 0, 'addAutomaton requires at least one final state');
    valueError(transitionValues.length > 0, 'addAutomaton requires at least one transition');
    const tails: ProtoInt64[] = [];
    const labels: ProtoInt64[] = [];
    const heads: ProtoInt64[] = [];
    for (const transition of transitionValues) {
      valueError(transition.length === 3, 'automaton transitions must contain tail, label, and head');
      const [tail, label, head] = transition;
      tails.push(asInt64(tail));
      labels.push(asInt64(label));
      heads.push(asInt64(head));
    }
    return this.pushConstraint({
      automaton: {
        exprs,
        startingState: asInt64(startingState),
        finalStates: finalStateValues,
        transitionTail: tails,
        transitionLabel: labels,
        transitionHead: heads,
      },
    });
  }

  addCircuit(arcs: Iterable<[number, number, LiteralLike]>) {
    const arcValues = Array.from(arcs);
    valueError(arcValues.length > 0, 'addCircuit requires at least one arc');
    const tails: number[] = [];
    const heads: number[] = [];
    const literals: number[] = [];
    for (const [tail, head, literal] of arcValues) {
      const [literalRef] = this.literalReferences([literal]);
      tails.push(tail);
      heads.push(head);
      literals.push(literalRef);
    }
    return this.pushConstraint({ circuit: { tails, heads, literals } });
  }

  addMultipleCircuit(arcs: Iterable<[number, number, LiteralLike]>) {
    const arcValues = Array.from(arcs);
    valueError(arcValues.length > 0, 'addMultipleCircuit requires at least one arc');
    const tails: number[] = [];
    const heads: number[] = [];
    const literals: number[] = [];
    for (const [tail, head, literal] of arcValues) {
      const [literalRef] = this.literalReferences([literal]);
      tails.push(tail);
      heads.push(head);
      literals.push(literalRef);
    }
    return this.pushConstraint({ routes: { tails, heads, literals } });
  }

  addInverse(direct: Iterable<IntVar>, inverse: Iterable<IntVar>) {
    return this.pushConstraint({
      inverse: {
        fDirect: this.variableIndexes(direct),
        fInverse: this.variableIndexes(inverse),
      },
    });
  }

  addMaxEquality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.pushConstraint({
      linMax: {
        target: this.expressionProto(target),
        exprs: this.expressionProtos(expressionList(expressions, rest)),
      },
    });
  }

  add_max_equality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.addMaxEquality(target, expressions, ...rest);
  }

  addMinEquality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    const values = expressionList(expressions, rest);
    return this.pushConstraint({
      linMax: {
        target: LinearExpr.from(target).neg().toProto(),
        exprs: values.map((expression) => LinearExpr.from(expression).neg().toProto()),
      },
    });
  }

  add_min_equality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.addMinEquality(target, expressions, ...rest);
  }

  addAbsEquality(target: LinearExprLike, expression: LinearExprLike) {
    const expr = LinearExpr.from(expression);
    return this.addMaxEquality(target, [expr, expr.neg()]);
  }

  add_abs_equality(target: LinearExprLike, expression: LinearExprLike) {
    return this.addAbsEquality(target, expression);
  }

  addDivisionEquality(target: LinearExprLike, numerator: LinearExprLike, denominator: LinearExprLike) {
    return this.pushConstraint({
      intDiv: {
        target: this.expressionProto(target),
        exprs: [this.expressionProto(numerator), this.expressionProto(denominator)],
      },
    });
  }

  add_division_equality(target: LinearExprLike, numerator: LinearExprLike, denominator: LinearExprLike) {
    return this.addDivisionEquality(target, numerator, denominator);
  }

  addModuloEquality(target: LinearExprLike, expression: LinearExprLike, modulo: LinearExprLike) {
    return this.pushConstraint({
      intMod: {
        target: this.expressionProto(target),
        exprs: [this.expressionProto(expression), this.expressionProto(modulo)],
      },
    });
  }

  add_modulo_equality(target: LinearExprLike, expression: LinearExprLike, modulo: LinearExprLike) {
    return this.addModuloEquality(target, expression, modulo);
  }

  addMultiplicationEquality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.pushConstraint({
      intProd: {
        target: this.expressionProto(target),
        exprs: this.expressionProtos(expressionList(expressions, rest)),
      },
    });
  }

  add_multiplication_equality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.addMultiplicationEquality(target, expressions, ...rest);
  }

  addImplication(left: LiteralLike, right: LiteralLike) {
    return this.pushConstraint({
      enforcementLiteral: this.literalReferences([left]),
      boolAnd: { literals: this.literalReferences([right]) },
    });
  }

  add_implication(left: LiteralLike, right: LiteralLike) {
    return this.addImplication(left, right);
  }

  addBoolOr(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.pushConstraint({ boolOr: { literals: this.literalReferences(literalList(literals, rest)) } });
  }

  add_bool_or(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.addBoolOr(literals, ...rest);
  }

  AddBoolOr(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.addBoolOr(literals, ...rest);
  }

  addAtLeastOne(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.addBoolOr(literals, ...rest);
  }

  add_at_least_one(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.addAtLeastOne(literals, ...rest);
  }

  addBoolAnd(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ boolAnd: { literals: this.literalReferences(literals) } });
  }

  add_bool_and(literals: Iterable<LiteralLike>) {
    return this.addBoolAnd(literals);
  }

  AddBoolAnd(literals: Iterable<LiteralLike>) {
    return this.addBoolAnd(literals);
  }

  addBoolXor(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ boolXor: { literals: this.literalReferences(literals) } });
  }

  add_bool_xor(literals: Iterable<LiteralLike>) {
    return this.addBoolXor(literals);
  }

  AddBoolXOr(literals: Iterable<LiteralLike>) {
    return this.addBoolXor(literals);
  }

  addAtMostOne(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ atMostOne: { literals: this.literalReferences(literals) } });
  }

  add_at_most_one(literals: Iterable<LiteralLike>) {
    return this.addAtMostOne(literals);
  }

  addExactlyOne(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ exactlyOne: { literals: this.literalReferences(literals) } });
  }

  add_exactly_one(literals: Iterable<LiteralLike>) {
    return this.addExactlyOne(literals);
  }

  addMapDomain(variable: IntVar, booleanVariables: Iterable<BoolVar>, offset = 0) {
    requireSameModel(this, variable.model, 'map domain variable');
    for (const [index, literal] of Array.from(booleanVariables).entries()) {
      requireSameModel(this, literal.model, 'map domain literal');
      const value = offset + index;
      this.pushConstraint({
        enforcementLiteral: [literal.index],
        linear: {
          vars: [variable.index],
          coeffs: [1],
          domain: [asInt64(value), asInt64(value)],
        },
      });
      this.pushConstraint({
        enforcementLiteral: [literal.negated().index],
        linear: {
          vars: [variable.index],
          coeffs: [1],
          domain: [INT64_MIN, asInt64(value - 1), asInt64(value + 1), INT64_MAX],
        },
      });
    }
  }

  add_map_domain(variable: IntVar, booleanVariables: Iterable<BoolVar>, offset = 0) {
    return this.addMapDomain(variable, booleanVariables, offset);
  }

  newIntervalVar(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, name = '') {
    return this.pushInterval({ start, size, end, name });
  }

  new_interval_var(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, name = '') {
    return this.newIntervalVar(start, size, end, name);
  }

  newFixedSizeIntervalVar(start: LinearExprLike, size: number, name = '') {
    return this.pushInterval({ start, size, end: LinearExpr.from(start).plus(size), name });
  }

  new_fixed_size_interval_var(start: LinearExprLike, size: number, name = '') {
    return this.newFixedSizeIntervalVar(start, size, name);
  }

  newOptionalFixedSizeIntervalVar(start: LinearExprLike, size: number, isPresent: LiteralLike, name = '') {
    return this.newOptionalIntervalVar(start, size, LinearExpr.from(start).plus(size), isPresent, name);
  }

  new_optional_fixed_size_interval_var(start: LinearExprLike, size: number, isPresent: LiteralLike, name = '') {
    return this.newOptionalFixedSizeIntervalVar(start, size, isPresent, name);
  }

  newOptionalIntervalVar(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, isPresent: LiteralLike, name = '') {
    if (!(isPresent instanceof BoolVar || isPresent instanceof NotBoolVar || typeof isPresent === 'boolean' || isPresent === 0 || isPresent === 1)) {
      throw new TypeError('optional interval presence literal must be Boolean');
    }
    if (this.hasBooleanExpressionTerm(start) || this.hasBooleanExpressionTerm(size) || this.hasBooleanExpressionTerm(end)) {
      throw new TypeError('optional interval start, size, and end must be integer expressions');
    }
    return this.pushInterval({ start, size, end, isPresent, name });
  }

  new_optional_interval_var(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, isPresent: LiteralLike, name = '') {
    return this.newOptionalIntervalVar(start, size, end, isPresent, name);
  }

  addNoOverlap(intervals: Iterable<IntervalVar>) {
    return this.pushConstraint({ noOverlap: { intervals: this.intervalIndexes(intervals) } });
  }

  add_no_overlap(intervals: Iterable<IntervalVar>) {
    return this.addNoOverlap(intervals);
  }

  AddNoOverlap(intervals: Iterable<IntervalVar>) {
    return this.addNoOverlap(intervals);
  }

  addNoOverlap2D(xIntervals: Iterable<IntervalVar>, yIntervals: Iterable<IntervalVar>) {
    return this.pushConstraint({
      noOverlap2d: {
        xIntervals: this.intervalIndexes(xIntervals),
        yIntervals: this.intervalIndexes(yIntervals),
      },
    });
  }

  add_no_overlap_2d(xIntervals: Iterable<IntervalVar>, yIntervals: Iterable<IntervalVar>) {
    return this.addNoOverlap2D(xIntervals, yIntervals);
  }

  AddNoOverlap2D(xIntervals: Iterable<IntervalVar>, yIntervals: Iterable<IntervalVar>) {
    return this.addNoOverlap2D(xIntervals, yIntervals);
  }

  addCumulative(intervals: Iterable<IntervalVar>, demands: Iterable<LinearExprLike>, capacity: LinearExprLike) {
    return this.pushConstraint({
      cumulative: {
        intervals: this.intervalIndexes(intervals),
        demands: this.expressionProtos(demands),
        capacity: this.expressionProto(capacity),
      },
    });
  }

  add_cumulative(intervals: Iterable<IntervalVar>, demands: Iterable<LinearExprLike>, capacity: LinearExprLike) {
    return this.addCumulative(intervals, demands, capacity);
  }

  addReservoirConstraint(times: Iterable<LinearExprLike>, levelChanges: Iterable<LinearExprLike>, minLevel: number, maxLevel: number, activeLiterals?: Iterable<LiteralLike>) {
    return this.pushConstraint({
      reservoir: {
        timeExprs: this.expressionProtos(times),
        levelChanges: this.expressionProtos(levelChanges),
        minLevel: asInt64(minLevel),
        maxLevel: asInt64(maxLevel),
        activeLiterals: activeLiterals ? this.literalReferences(activeLiterals) : undefined,
      },
    });
  }

  addDecisionStrategy(
    expressions: Iterable<LinearExprLike>,
    variableSelectionStrategy: DecisionStrategyProto_VariableSelectionStrategy,
    domainReductionStrategy: DecisionStrategyProto_DomainReductionStrategy,
  ) {
    this.model.searchStrategy ??= [];
    this.model.searchStrategy.push({
      exprs: this.expressionProtos(expressions),
      variableSelectionStrategy,
      domainReductionStrategy,
    });
  }

  addHint(variable: IntVar | NotBoolVar, value: number | boolean) {
    const hintedValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    const hintVariable = variable instanceof NotBoolVar ? variable.variable : variable;
    const hintValue = variable instanceof NotBoolVar ? 1 - hintedValue : hintedValue;
    requireSameModel(this, hintVariable.model, 'hint variable');
    this.model.solutionHint ??= { vars: [], values: [] };
    this.model.solutionHint.vars?.push(hintVariable.index);
    this.model.solutionHint.values?.push(asInt64(hintValue));
  }

  addAssumption(literal: LiteralLike) {
    this.model.assumptions ??= [];
    const index = literalIndex(literal);
    assert(typeof index === 'number', 'assumptions require variable literals');
    this.model.assumptions.push(index);
  }

  addAssumptions(literals: Iterable<LiteralLike>) {
    for (const literal of literals) {
      this.addAssumption(literal);
    }
  }

  clearAssumptions() {
    this.model.assumptions = [];
  }

  minimize(expression: LinearExprLike) {
    const expr = LinearExpr.from(expression);
    this.checkExpressionModel(expr);
    if (expr.hasFloatingPointTerms()) {
      this.model.objective = undefined;
      this.model.floatingPointObjective = expr.toFloatObjective(false);
      return;
    }
    const proto = expr.toProto();
    this.model.floatingPointObjective = undefined;
    this.model.objective = {
      vars: proto.vars,
      coeffs: proto.coeffs,
      offset: typeof proto.offset === 'number' ? proto.offset : undefined,
    };
  }

  Minimize(expression: LinearExprLike) {
    return this.minimize(expression);
  }

  maximize(expression: LinearExprLike) {
    const originalExpr = LinearExpr.from(expression);
    this.checkExpressionModel(originalExpr);
    if (originalExpr.hasFloatingPointTerms()) {
      this.model.objective = undefined;
      this.model.floatingPointObjective = originalExpr.toFloatObjective(true);
      return;
    }
    const expr = originalExpr.neg();
    this.checkExpressionModel(expr);
    const proto = expr.toProto();
    this.model.floatingPointObjective = undefined;
    this.model.objective = {
      vars: proto.vars,
      coeffs: proto.coeffs,
      offset: typeof proto.offset === 'number' ? proto.offset : undefined,
      scalingFactor: -1,
    };
  }

  Maximize(expression: LinearExprLike) {
    return this.maximize(expression);
  }

  hasObjective() {
    return this.model.objective !== undefined || this.model.floatingPointObjective !== undefined;
  }

  modelStats() {
    return JSON.stringify({
      variables: this.model.variables?.length ?? 0,
      constraints: this.model.constraints?.length ?? 0,
      hasObjective: this.hasObjective(),
    });
  }

  async validate() {
    const modelBytes = await CpSat.createModel(this.proto());
    const validation = await CpSat.validate(modelBytes);
    return validation.ok ? '' : validation.message;
  }

  private pushInterval(input: { start: LinearExprLike; size: LinearExprLike; end: LinearExprLike; isPresent?: LiteralLike; name?: string }) {
    const constraint: ConstraintProto = {
      name: input.name,
      interval: {
        start: this.expressionProto(input.start),
        size: this.expressionProto(input.size),
        end: this.expressionProto(input.end),
      },
    };
    if (input.isPresent !== undefined) {
      constraint.enforcementLiteral = this.literalReferences([input.isPresent]);
    }
    const index = this.model.constraints?.length ?? 0;
    this.model.constraints?.push(constraint);
    return new IntervalVar(this, index, input.name, input.start, input.size, input.end, input.isPresent);
  }

  private pushConstraint(constraint: ConstraintProto) {
    const index = this.model.constraints?.length ?? 0;
    this.model.constraints?.push(constraint);
    return new Constraint(this, index);
  }

  private checkExpressionModel(expression: LinearExpr) {
    if (expression.model) {
      requireSameModel(this, expression.model, 'linear expression');
    }
  }

  private expressionProto(expression: LinearExprLike) {
    const expr = LinearExpr.from(expression);
    this.checkExpressionModel(expr);
    return expr.toProto();
  }

  private expressionFromProto(proto: LinearExpressionProto | undefined): LinearExprLike {
    if (proto === undefined) {
      return 0;
    }
    const terms = new Map<number, number>();
    const vars = proto.vars ?? [];
    const coeffs = proto.coeffs ?? [];
    for (let index = 0; index < vars.length; index += 1) {
      mergeTerms(terms, vars[index], protoInt64ToNumber(coeffs[index]));
    }
    return new LinearExpr(this, terms, protoInt64ToNumber(proto.offset));
  }

  private literalFromProtoIndex(index: number): LiteralLike {
    if (index >= 0) {
      return this.getBoolVarFromProtoIndex(index);
    }
    return this.getBoolVarFromProtoIndex(-index - 1).negated();
  }

  private expressionProtos(expressions: Iterable<LinearExprLike>) {
    return Array.from(expressions, (expression) => this.expressionProto(expression));
  }

  private variableIndexes(variables: Iterable<IntVar>) {
    return Array.from(variables, (variable) => {
      requireSameModel(this, variable.model, 'variable');
      return variable.index;
    });
  }

  private intervalIndexes(intervals: Iterable<IntervalVar>) {
    return Array.from(intervals, (interval) => {
      if (!(interval instanceof IntervalVar)) {
        throw new TypeError('expected interval variable');
      }
      requireSameModel(this, interval.model, 'interval');
      return interval.index;
    });
  }

  private hasBooleanExpressionTerm(expression: LinearExprLike) {
    if (isBoolExpression(expression)) {
      return true;
    }
    const expr = LinearExpr.from(expression);
    this.checkExpressionModel(expr);
    return Array.from(expr.terms.keys()).some((index) => this.boolVariableIndexes.has(index));
  }

  literalReferences(literals: Iterable<LiteralLike>) {
    return Array.from(literals, (literal) => {
      const index = literalIndex(literal);
      if (index === true) {
        return this.constantBoolIndex(true);
      }
      if (index === false) {
        return this.constantBoolIndex(false);
      }
      assert(literal instanceof BoolVar || literal instanceof NotBoolVar, 'literal must be a Boolean variable or its negation');
      requireSameModel(this, literal.model, 'literal');
      return index;
    });
  }

  private constantBoolIndex(value: boolean) {
    if (value) {
      this.trueConstant ??= this.getBoolVarFromProtoIndex(this.getOrMakeIndexFromConstant(1));
      return this.trueConstant.index;
    }
    this.falseConstant ??= this.getBoolVarFromProtoIndex(this.getOrMakeIndexFromConstant(0));
    return this.falseConstant.index;
  }
}

export class CpSolverSolutionCallback {
  private currentResponse: CpSolverResponse | null = null;

  onSolutionCallback() {}

  value(expression: LinearExprLike) {
    return evaluateLinearExpression(this.requireCurrentResponse(), expression);
  }

  floatValue(expression: LinearExprLike) {
    return evaluateLinearExpression(this.requireCurrentResponse(), expression);
  }

  booleanValue(literal: LiteralLike) {
    return evaluateBooleanLiteral(this.requireCurrentResponse(), literal);
  }

  get objectiveValue() {
    const response = this.requireCurrentResponse();
    runtimeError(typeof response.objectiveValue === 'number', 'missing objective value');
    return response.objectiveValue;
  }

  get bestObjectiveBound() {
    const response = this.requireCurrentResponse();
    runtimeError(typeof response.bestObjectiveBound === 'number', 'missing best objective bound');
    return response.bestObjectiveBound;
  }

  get wallTime() {
    return this.requireCurrentResponse().wallTime ?? 0;
  }

  _run(response: CpSolverResponse) {
    this.currentResponse = response;
    try {
      this.onSolutionCallback();
    } finally {
      this.currentResponse = null;
    }
  }

  private requireCurrentResponse() {
    if (!this.currentResponse) {
      throw new RuntimeError('solve() has not started or the callback is not currently running');
    }
    return this.currentResponse;
  }
}

export class CpSolver {
  private lastResponse: CpSolverResponse | null = null;
  readonly parameters: SatParameters = {};
  bestBoundCallback: ((bound: number) => void) | null = null;
  logCallback: ((message: string) => void) | null = null;

  async solve(model: CpModel, params: SatParameters | Uint8Array | CpSolverSolutionCallback | null = null, options: CpSolverSolveOptions = {}) {
    const solutionCallback = params instanceof CpSolverSolutionCallback ? params : null;
    const solveParams = solutionCallback ? this.parameters : params;
    const mergedParams = solveParams instanceof Uint8Array ? solveParams : { ...this.parameters, ...(solveParams ?? {}) };
    const modelBytes = await CpSat.createModel(model.proto());
    const hasInternalEvents = Boolean(solutionCallback || this.bestBoundCallback || this.logCallback);
    let eventMask = options.eventMask;
    if (hasInternalEvents && (eventMask || !options.onEvent)) {
      eventMask = {
        solution: Boolean(solutionCallback) || Boolean(eventMask?.solution),
        bestBound: Boolean(this.bestBoundCallback) || Boolean(eventMask?.bestBound),
        log: Boolean(this.logCallback) || Boolean(eventMask?.log),
      };
    }
    const result = await CpSat.solve(modelBytes, {
      solverParameters: mergedParams,
      signal: options.signal,
      eventMask,
      onEvent: hasInternalEvents || options.onEvent
        ? async (event) => {
            if (event.type === 'solution') {
              solutionCallback?._run(event.response);
            } else if (event.type === 'bestBound') {
              this.bestBoundCallback?.(event.bound);
            } else if (event.type === 'log') {
              this.logCallback?.(event.message);
            }
            await options.onEvent?.(event);
          }
        : undefined,
    });
    this.lastResponse = result.response;
    return result.response?.status;
  }

  response() {
    return this.lastResponse;
  }

  responseStats() {
    return JSON.stringify(this.requireResponse());
  }

  get best_objective_bound() {
    return this.bestObjectiveBound();
  }

  get deterministic_time() {
    const response = this.requireResponse();
    runtimeError(typeof response.deterministicTime === 'number', 'missing deterministic time');
    return response.deterministicTime;
  }

  get num_binary_propagations() {
    return protoInt64ToNumber(this.requireResponse().numBinaryPropagations);
  }

  get num_integer_propagations() {
    return protoInt64ToNumber(this.requireResponse().numIntegerPropagations);
  }

  get user_time() {
    const response = this.requireResponse();
    runtimeError(typeof response.userTime === 'number', 'missing user time');
    return response.userTime;
  }

  get response_proto() {
    return this.requireResponse();
  }

  get solve_log() {
    return this.requireResponse().solveLog;
  }

  get num_booleans() {
    return this.numBooleans;
  }

  get num_conflicts() {
    return this.numConflicts;
  }

  get num_branches() {
    return this.numBranches;
  }

  get num_integers() {
    return protoInt64ToNumber(this.requireResponse().numIntegers);
  }

  get wall_time() {
    return this.wallTime;
  }

  get objective_value() {
    return this.objectiveValue();
  }

  set best_bound_callback(callback: ((bound: number) => void) | null) {
    this.bestBoundCallback = callback;
  }

  set log_callback(callback: ((message: string) => void) | null) {
    this.logCallback = callback;
  }

  solutionInfo() {
    return this.requireResponse().solutionInfo ?? '';
  }

  get numBooleans() {
    return protoInt64ToNumber(this.requireResponse().numBooleans);
  }

  get numConflicts() {
    return protoInt64ToNumber(this.requireResponse().numConflicts);
  }

  get numBranches() {
    return protoInt64ToNumber(this.requireResponse().numBranches);
  }

  get wallTime() {
    return this.requireResponse().wallTime ?? 0;
  }

  value(expression: LinearExprLike) {
    return evaluateLinearExpression(this.requireResponse(), expression);
  }

  floatValue(expression: LinearExprLike) {
    return this.value(expression);
  }

  booleanValue(literal: LiteralLike) {
    return evaluateBooleanLiteral(this.requireResponse(), literal);
  }

  objectiveValue() {
    const response = this.requireResponse();
    runtimeError(typeof response.objectiveValue === 'number', 'missing objective value');
    return response.objectiveValue;
  }

  bestObjectiveBound() {
    const response = this.requireResponse();
    runtimeError(typeof response.bestObjectiveBound === 'number', 'missing best objective bound');
    return response.bestObjectiveBound;
  }

  statusName(status = this.lastResponse?.status) {
    if (typeof status === 'string') {
      return status;
    }
    return CpSolverStatus[status as CpSolverStatus] ?? String(status);
  }

  private requireResponse() {
    runtimeError(this.lastResponse !== null, 'solve() has not completed with a solver response');
    return this.lastResponse;
  }

  get best_bound_callback() {
    return this.bestBoundCallback;
  }

  get log_callback() {
    return this.logCallback;
  }
}
