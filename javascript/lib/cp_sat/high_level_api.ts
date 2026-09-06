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
import type {
  CpSatEventHandler,
  CpSatEventMask,
  CpSatSolverParameters,
} from './api.js';
import type { ExecutorSelection } from '../executor_configuration.js';
import {
  INT64_MAX as INT64_MAX_BIGINT,
  INT64_MIN as INT64_MIN_BIGINT,
  toInt64,
  type IntValue,
} from '../int64.js';

const INT64_MIN: ProtoInt64 = INT64_MIN_BIGINT;
const INT64_MAX: ProtoInt64 = INT64_MAX_BIGINT;
export type { IntValue } from '../int64.js';
export type NumericValue = number | bigint;
export type LinearExprLike = IntValue | IntVar | NotBoolVar | LinearExpr;
export type LiteralLike = number | boolean | BoolVar | NotBoolVar;
export type CpSolverSolveOptions = CpSatSolverParameters & {
  executor?: ExecutorSelection;
  solutionCallback?: CpSolverSolutionCallback;
  onEvent?: CpSatEventHandler;
  eventMask?: CpSatEventMask;
  signal?: AbortSignal;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function rangeError(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new RangeError(message);
  }
}

function stateError(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asInt64(value: IntValue): ProtoInt64 {
  const exact = toInt64(value);
  return exact >= BigInt(Number.MIN_SAFE_INTEGER) && exact <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(exact)
    : exact;
}

function protoInt64ToBigInt(value: ProtoInt64) {
  if (typeof value === 'number' || typeof value === 'bigint') return toInt64(value);
  const exact = typeof value === 'string'
    ? BigInt(value)
    : BigInt(value.high) * 0x1_0000_0000n + BigInt(value.low >>> 0);
  return toInt64(exact);
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

function isInt64Min(value: ProtoInt64) {
  return protoInt64ToBigInt(value) === INT64_MIN_BIGINT;
}

function isInt64Max(value: ProtoInt64) {
  return protoInt64ToBigInt(value) === INT64_MAX_BIGINT;
}

function isProtoInt64Constant(value: unknown): value is IntValue {
  return typeof value === 'number' || typeof value === 'bigint';
}

function adjustedProtoInt64ToBigInt(value: ProtoInt64, offset: NumericValue) {
  rangeError(isExactInteger(offset), 'integer bounds require an integer expression offset');
  return protoInt64ToBigInt(value) - offset;
}

function adjustedProtoInt64ToString(value: ProtoInt64, offset: NumericValue) {
  if (isExactInteger(offset)) {
    return adjustedProtoInt64ToBigInt(value, offset).toString();
  }
  return String(protoInt64ToNumber(value) - offset);
}

function compareAdjustedProtoInt64(left: ProtoInt64, right: ProtoInt64, offset: NumericValue) {
  if (!isExactInteger(offset)) {
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

function adjustDomainEndpoint(value: ProtoInt64, offset: NumericValue): ProtoInt64 {
  if (isInt64Min(value) || isInt64Max(value)) {
    return value;
  }
  rangeError(isExactInteger(offset), 'integer constraints require an integer expression offset');
  return asInt64(protoInt64ToBigInt(value) - offset);
}

function protoInt64ToNumber(value: ProtoInt64 | undefined) {
  if (value === undefined) return 0;
  const exact = protoInt64ToBigInt(value);
  rangeError(
    exact >= BigInt(Number.MIN_SAFE_INTEGER) && exact <= BigInt(Number.MAX_SAFE_INTEGER),
    `integer cannot be represented exactly as a JavaScript number: ${exact}`,
  );
  return Number(exact);
}

function cloneProto<T>(value: T): T {
  return structuredClone(value);
}

const liveModelProtos = new WeakMap<CpModel, CpModelProto>();

function liveModelProto(model: CpModel) {
  const proto = liveModelProtos.get(model);
  assert(proto, 'CpModel has no internal proto');
  return proto;
}

type LinearExprDisplayNode =
  | { kind: 'const'; value: NumericValue }
  | { kind: 'var'; index: number }
  | { kind: 'not'; index: number }
  | { kind: 'sum'; values: LinearExprDisplayNode[] }
  | { kind: 'mul'; coeff: NumericValue; value: LinearExprDisplayNode }
  | { kind: 'weighted'; values: LinearExprDisplayNode[]; coeffs: NumericValue[] };

function normalizeNumeric(value: NumericValue): NumericValue {
  if (typeof value === 'bigint') return toInt64(value);
  if (!Number.isFinite(value)) throw new TypeError(`expected finite numeric value, got ${value}`);
  return Number.isInteger(value) ? toInt64(value) : value;
}

function isExactInteger(value: NumericValue): value is bigint {
  return typeof value === 'bigint';
}

function numericIsZero(value: NumericValue) {
  return value === 0 || value === 0n;
}

function numericIsOne(value: NumericValue) {
  return value === 1 || value === 1n;
}

function numericIsNegativeOne(value: NumericValue) {
  return value === -1 || value === -1n;
}

function numericAdd(left: NumericValue, right: NumericValue): NumericValue {
  if (isExactInteger(left) && isExactInteger(right)) return left + right;
  if (isExactInteger(left) || isExactInteger(right)) {
    const integer = isExactInteger(left) ? left : right as bigint;
    const floating = isExactInteger(left) ? right as number : left as number;
    rangeError(
      integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER),
      'cannot combine an out-of-safe-range integer with a floating-point value',
    );
    return Number(integer) + floating;
  }
  return left + right;
}

function numericMultiply(left: NumericValue, right: NumericValue): NumericValue {
  if (isExactInteger(left) && isExactInteger(right)) return left * right;
  if (isExactInteger(left) || isExactInteger(right)) {
    const integer = isExactInteger(left) ? left : right as bigint;
    const floating = isExactInteger(left) ? right as number : left as number;
    rangeError(
      integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER),
      'cannot combine an out-of-safe-range integer with a floating-point value',
    );
    return Number(integer) * floating;
  }
  return left * right;
}

function numericNegate(value: NumericValue): NumericValue {
  return typeof value === 'bigint' ? -value : -value;
}

function numericAbs(value: NumericValue): NumericValue {
  return typeof value === 'bigint' ? (value < 0n ? -value : value) : Math.abs(value);
}

function numericIsNegative(value: NumericValue) {
  return typeof value === 'bigint' ? value < 0n : value < 0;
}

function numericToNumber(value: NumericValue) {
  if (typeof value === 'number') return value;
  rangeError(
    value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER),
    `integer cannot be represented exactly as a JavaScript number: ${value}`,
  );
  return Number(value);
}

function evaluateLinearExpression(response: CpSolverResponse, expression: LinearExprLike) {
  const expr = LinearExpr.from(expression);
  let value = expr.offset;
  for (const [index, coeff] of expr.terms) {
    const variableValue = response.solution?.[index];
    assert(typeof variableValue === 'bigint', `missing exact integer solution value for variable ${index}`);
    value = numericAdd(value, numericMultiply(coeff, variableValue));
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
  assert(typeof value === 'bigint', `missing exact integer solution value for literal ${index}`);
  const truth = value !== 0n;
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

function literalReferences(model: CpModel, literals: Iterable<LiteralLike>) {
  return Array.from(literals, (literal) => {
    const index = literalIndex(literal);
    if (index === true) return model.newConstant(1).index;
    if (index === false) return model.newConstant(0).index;
    assert(literal instanceof BoolVar || literal instanceof NotBoolVar, 'literal must be a Boolean variable or its negation');
    requireSameModel(model, literal.model, 'literal');
    return index;
  });
}

function requireSameModel(model: CpModel, owner: CpModel, what: string) {
  if (model !== owner) {
    throw new Error(`${what} belongs to a different CpModel`);
  }
}

function mergeTerms(terms: Map<number, NumericValue>, index: number, coeff: NumericValue) {
  const next = numericAdd(terms.get(index) ?? 0n, coeff);
  if (numericIsZero(next)) {
    terms.delete(index);
  } else {
    terms.set(index, next);
  }
}

function variableDisplayName(model: CpModel | null, index: number) {
  return model === null ? `var${index}` : liveModelProto(model).variables?.[index]?.name || `var${index}`;
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
      if (numericIsOne(node.coeff)) {
        return value;
      }
      if (numericIsNegativeOne(node.coeff)) {
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
      return isExactInteger(node.value) ? `IntConstant(${node.value})` : `FloatConstant(${node.value})`;
    case 'var': {
      const variable = model?.getIntVarFromProtoIndex(node.index);
      return variable?.repr() ?? `var${node.index}`;
    }
    case 'not':
      return `NotBooleanVariable(var_index=${node.index})`;
    case 'mul': {
      const valueRepr = renderLinearExprDisplayRepr(node.value, model);
      const affineName = isExactInteger(node.coeff) ? 'IntAffine' : 'FloatAffine';
      return `${affineName}(expr=${valueRepr}, coeff=${node.coeff}, offset=0)`;
    }
    case 'sum': {
      const values: string[] = [];
      let integerOffset = 0n;
      let floatOffset = 0;
      let hasFloatOffset = false;
      for (const value of node.values) {
        if (value.kind === 'const') {
          if (isExactInteger(value.value) && !hasFloatOffset) {
            integerOffset += value.value;
          } else {
            hasFloatOffset = true;
            floatOffset += numericToNumber(value.value);
          }
        } else {
          values.push(renderLinearExprDisplayRepr(value, model));
        }
      }
      if (hasFloatOffset) {
        return `SumArray(${values.join(', ')}, float_offset=${floatOffset + Number(integerOffset)})`;
      }
      if (integerOffset !== 0n) {
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
  let constant: NumericValue = 0n;
  for (const value of values) {
    if (value.kind === 'const') {
      constant = numericAdd(constant, value.value);
    } else {
      nonConstantValues.push(value);
    }
  }
  if (!numericIsZero(constant) || nonConstantValues.length === 0) {
    nonConstantValues.push({ kind: 'const', value: constant });
  }
  if (nonConstantValues.length === 0) {
    return '0';
  }
  const [first, ...rest] = nonConstantValues;
  let text = renderLinearExprDisplay(first, model);
  for (const value of rest) {
    if (value.kind === 'const' && numericIsNegative(value.value)) {
      text += ` - ${numericAbs(value.value)}`;
    } else {
      text += ` + ${renderLinearExprDisplay(value, model)}`;
    }
  }
  return nonConstantValues.length > 1 ? `(${text})` : text;
}

function formatWeightedDisplaySum(values: LinearExprDisplayNode[], coeffs: NumericValue[], model: CpModel | null) {
  const pieces: Array<{ sign: 1 | -1; text: string }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const coeff = coeffs[index];
    if (numericIsZero(coeff)) {
      continue;
    }
    const value = values[index];
    if (value.kind === 'const') {
      const scaled = numericMultiply(value.value, coeff);
      if (!numericIsZero(scaled)) {
        pieces.push({ sign: numericIsNegative(scaled) ? -1 : 1, text: String(numericAbs(scaled)) });
      }
      continue;
    }
    const sign = numericIsNegative(coeff) ? -1 : 1;
    const absCoeff = numericAbs(coeff);
    const valueText = renderLinearExprDisplay(value, model);
    pieces.push({ sign, text: numericIsOne(absCoeff) ? valueText : `${absCoeff} * ${valueText}` });
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
  throw new TypeError('native JavaScript operators are not supported for CP-SAT expressions; use the explicit high-level API methods');
}

function expressionList(first: Iterable<LinearExprLike> | LinearExprLike, rest: LinearExprLike[]) {
  if (rest.length > 0) {
    return [first as LinearExprLike, ...rest];
  }
  if (typeof first === 'number' || typeof first === 'bigint' || first instanceof IntVar || first instanceof NotBoolVar || first instanceof LinearExpr) {
    return [first];
  }
  return Array.from(first);
}

function iterableValues(first: Iterable<LinearExprLike> | LinearExprLike, rest: LinearExprLike[]) {
  if (rest.length > 0) {
    return [first, ...rest] as LinearExprLike[];
  }
  if (typeof first === 'number' || typeof first === 'bigint' || first instanceof IntVar || first instanceof NotBoolVar || first instanceof LinearExpr) {
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
  readonly terms: ReadonlyMap<number, NumericValue>;
  readonly offset: NumericValue;
  private readonly display: LinearExprDisplayNode | null;

  constructor(
    model: CpModel | null,
    terms: ReadonlyMap<number, NumericValue> = new Map(),
    offset: NumericValue = 0n,
    display: LinearExprDisplayNode | null = null,
  ) {
    this.model = model;
    this.terms = new Map(terms);
    this.offset = offset;
    this.display = display;
  }

  static constant(value: IntValue) {
    const normalized = normalizeNumeric(value);
    return new LinearExpr(null, new Map(), normalized, { kind: 'const', value: normalized });
  }

  static sum(values: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return sum(values, ...rest);
  }

  static weightedSum(values: Iterable<LinearExprLike>, coeffs: Iterable<NumericValue>) {
    return weightedSum(values, coeffs);
  }

  static term(variable: IntVar | NotBoolVar, coeff: NumericValue) {
    return term(variable, coeff);
  }

  static affine(expression: LinearExprLike, coeff: NumericValue, offset: IntValue) {
    return LinearExpr.from(expression).times(coeff).plus(offset);
  }

  static from(value: LinearExprLike): LinearExpr {
    if (typeof value === 'number' || typeof value === 'bigint') {
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

  plus(value: LinearExprLike, coeff: NumericValue = 1n) {
    const normalizedCoeff = normalizeNumeric(coeff);
    const other = numericIsOne(normalizedCoeff) ? LinearExpr.from(value) : LinearExpr.from(value).times(normalizedCoeff);
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
    return new LinearExpr(model, terms, numericAdd(this.offset, other.offset), { kind: 'sum', values: displayValues });
  }

  minus(value: LinearExprLike) {
    return this.plus(value, -1n);
  }

  times(coeff: NumericValue) {
    const normalizedCoeff = normalizeNumeric(coeff);
    const terms = new Map<number, NumericValue>();
    for (const [index, termCoeff] of this.terms) {
      mergeTerms(terms, index, numericMultiply(termCoeff, normalizedCoeff));
    }
    let displayCoeff = normalizedCoeff;
    let displayValue = this.displayNodeForRendering();
    if (displayValue.kind === 'mul') {
      displayCoeff = numericMultiply(displayCoeff, displayValue.coeff);
      displayValue = displayValue.value;
    }
    return new LinearExpr(this.model, terms, numericMultiply(this.offset, normalizedCoeff), {
      kind: 'mul',
      coeff: displayCoeff,
      value: displayValue,
    });
  }

  neg() {
    return this.times(-1n);
  }

  eq(value: LinearExprLike) {
    return new BoundedLinearExpr(this.minus(value), 0, 0);
  }

  ne(value: LinearExprLike) {
    if (isProtoInt64Constant(value) && isInt64Min(value)) {
      return new BoundedLinearExpr(this, asInt64(-9223372036854775807n), INT64_MAX);
    }
    if (isProtoInt64Constant(value) && isInt64Max(value)) {
      return new BoundedLinearExpr(this, INT64_MIN, asInt64(9223372036854775806n));
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
      throw new RangeError('integer expressions cannot be less than INT_MIN');
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
      throw new RangeError('integer expressions cannot be greater than INT_MAX');
    }
    return new BoundedLinearExpr(this.minus(value), 1, INT64_MAX);
  }

  toProto(): LinearExpressionProto {
    const vars: number[] = [];
    const coeffs: ProtoInt64[] = [];
    for (const [index, coeff] of this.terms) {
      vars.push(index);
      rangeError(isExactInteger(coeff), 'integer constraints require integer coefficients');
      coeffs.push(asInt64(coeff));
    }
    const proto: LinearExpressionProto = { vars, coeffs };
    if (!numericIsZero(this.offset)) {
      rangeError(isExactInteger(this.offset), 'integer constraints require an integer offset');
      proto.offset = asInt64(this.offset);
    }
    return proto;
  }

  toString() {
    if (this.display) {
      return renderLinearExprDisplay(this.display, this.model);
    }
    if (this.terms.size === 1 && !numericIsZero(this.offset)) {
      const [[index, coeff]] = Array.from(this.terms);
      const variable = this.model?.getIntVarFromProtoIndex(index);
      if (variable instanceof BoolVar && coeff === numericNegate(this.offset)) {
        return `(${this.offset} * not(${variable}))`;
      }
    }
    const pieces: string[] = [];
    let singleTermNeedsParens = false;
    for (const [index, coeff] of this.terms) {
      const name = this.model === null ? `var${index}` : liveModelProto(this.model).variables?.[index]?.name || `var${index}`;
      if (numericIsOne(coeff)) {
        pieces.push(name);
      } else if (numericIsNegativeOne(coeff)) {
        pieces.push(`-${name}`);
        singleTermNeedsParens = true;
      } else {
        pieces.push(`${coeff} * ${name}`);
        singleTermNeedsParens = true;
      }
    }
    if (!numericIsZero(this.offset) || pieces.length === 0) {
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
      return numericIsOne(coeff) ? variable : { kind: 'mul', coeff, value: variable } as LinearExprDisplayNode;
    });
    if (!numericIsZero(this.offset)) {
      values.push({ kind: 'const', value: this.offset });
    }
    return values.length === 1 ? values[0] : { kind: 'sum', values };
  }

  hasFloatingPointTerms() {
    return !isExactInteger(this.offset)
      || Array.from(this.terms.values()).some((coeff) => !isExactInteger(coeff));
  }

  isInteger() {
    return !this.hasFloatingPointTerms();
  }

  repr() {
    if (this.terms.size === 0) {
      return isExactInteger(this.offset) ? `IntConstant(${this.offset})` : `FloatConstant(${this.offset})`;
    }
    if (this.terms.size === 1) {
      const [[index, coeff]] = Array.from(this.terms);
      if (numericIsOne(coeff) && numericIsZero(this.offset)) {
        const variable = this.model?.getIntVarFromProtoIndex(index);
        return variable?.repr() ?? String(this);
      }
      const variable = this.model?.getIntVarFromProtoIndex(index);
      const variableRepr = variable?.repr() ?? `var${index}`;
      if (isExactInteger(coeff) && isExactInteger(this.offset)) {
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
    if (numericIsZero(this.offset) && coeffs.every(numericIsOne)) {
      return `SumArray(${variables.join(', ')})`;
    }
    if (coeffs.every(isExactInteger) && isExactInteger(this.offset)) {
      return `IntWeightedSum([${variables.join(', ')}], [${coeffs.join(', ')}], ${this.offset})`;
    }
    return `FloatWeightedSum([${variables.join(', ')}], [${coeffs.join(', ')}], ${this.offset})`;
  }

  toFloatObjective(maximize = false) {
    return {
      vars: Array.from(this.terms.keys()),
      coeffs: Array.from(this.terms.values(), numericToNumber),
      offset: numericToNumber(this.offset),
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
        return `${expressionText} != ${numericNegate(this.expression.offset)}`;
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

export class IntVar {
  constructor(
    readonly model: CpModel,
    readonly index: number,
    _name = '',
  ) {}

  get name() {
    return liveModelProto(this.model).variables?.[this.index]?.name ?? '';
  }

  get modelProto() {
    return this.model.modelProto;
  }

  expr() {
    return new LinearExpr(this.model, new Map([[this.index, 1n]]), 0n, { kind: 'var', index: this.index });
  }

  plus(value: LinearExprLike, coeff: NumericValue = 1n) {
    return this.expr().plus(value, coeff);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: NumericValue) {
    return this.expr().times(coeff);
  }

  neg() {
    return this.expr().neg();
  }

  isInteger() {
    return true;
  }

  isBoolean() {
    const domain = liveModelProto(this.model).variables?.[this.index]?.domain ?? [];
    return isBooleanDomain(domain);
  }

  negated() {
    if (!this.isBoolean()) {
      throw new TypeError('negated() is only supported for Boolean variables.');
    }
    return new NotBoolVar(this);
  }

  toString() {
    const variable = liveModelProto(this.model).variables?.[this.index];
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
    const domain = liveModelProto(this.model).variables?.[this.index]?.domain ?? [];
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

  ge(value: LinearExprLike) {
    return this.expr().ge(value);
  }

  gt(value: LinearExprLike) {
    return this.expr().gt(value);
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

  get modelProto() {
    return this.model.modelProto;
  }

  not() {
    return this.variable;
  }

  negated() {
    return this.variable;
  }

  plus(value: LinearExprLike, coeff: NumericValue = 1n) {
    return this.expr().plus(value, coeff);
  }

  minus(value: LinearExprLike) {
    return this.expr().minus(value);
  }

  times(coeff: NumericValue) {
    return this.expr().times(coeff);
  }

  neg() {
    return this.expr().neg();
  }

  isInteger() {
    return true;
  }

  expr() {
    return new LinearExpr(this.model, new Map([[this.variable.index, -1n]]), 1n, {
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

  get modelProto() {
    return this.model.modelProto;
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
    return liveModelProto(this.model).constraints?.[this.index]?.name ?? '';
  }

  withName(name: string) {
    const constraint = liveModelProto(this.model).constraints?.[this.index];
    assert(constraint, 'constraint no longer exists in model');
    constraint.name = name;
    return this;
  }

  onlyEnforceIf(literals: LiteralLike | Iterable<LiteralLike>, ...rest: LiteralLike[]) {
    const values = literalList(literals, rest);
    const constraint = liveModelProto(this.model).constraints?.[this.index];
    assert(constraint, 'constraint no longer exists in model');
    constraint.enforcementLiteral = [
      ...(constraint.enforcementLiteral ?? []),
      ...literalReferences(this.model, values),
    ];
    return this;
  }
}

function simplifyLinearSum(values: LinearExprLike[]) {
  let constant: NumericValue = 0n;
  const nonConstantValues: LinearExprLike[] = [];
  for (const value of values) {
    if (typeof value === 'number' || typeof value === 'bigint') {
      constant = numericAdd(constant, normalizeNumeric(value));
    } else {
      nonConstantValues.push(value);
    }
  }
  if (nonConstantValues.length === 0) {
    return LinearExpr.constant(constant);
  }
  if (numericIsZero(constant) && nonConstantValues.length === 1) {
    return nonConstantValues[0];
  }
  return null;
}

function combineLinearExpressions(
  values: Iterable<LinearExprLike>,
  scaleByIndex?: (index: number) => NumericValue,
  display?: LinearExprDisplayNode | null,
) {
  let model: CpModel | null = null;
  const terms = new Map<number, NumericValue>();
  let offset: NumericValue = 0n;
  let index = 0;
  for (const value of values) {
    const scale = normalizeNumeric(scaleByIndex?.(index) ?? 1n);
    const expression = LinearExpr.from(value);
    if (model && expression.model) {
      requireSameModel(model, expression.model, 'linear expression');
    }
    model ??= expression.model;
    for (const [termIndex, termCoeff] of expression.terms) {
      mergeTerms(terms, termIndex, numericMultiply(termCoeff, scale));
    }
    offset = numericAdd(offset, numericMultiply(expression.offset, scale));
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

export function weightedSum(values: Iterable<LinearExprLike>, coeffs: Iterable<NumericValue>): LinearExprLike {
  const valueList = Array.from(values);
  const coeffList = Array.from(coeffs);
  rangeError(valueList.length === coeffList.length, 'weightedSum requires the same number of expressions and coefficients');
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

export function term(variable: IntVar | NotBoolVar, coeff: NumericValue) {
  return variable.times(coeff);
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

  constructor(lower: IntValue, upper?: IntValue);
  constructor(flatIntervals: Iterable<IntValue>);
  constructor(lowerOrIntervals: IntValue | Iterable<IntValue>, upper?: IntValue) {
    if (upper !== undefined) {
      this.flatIntervals = [asInt64(lowerOrIntervals as IntValue), asInt64(upper)];
      return;
    }
    if (
      typeof lowerOrIntervals === 'number'
      || typeof lowerOrIntervals === 'bigint'
    ) {
      const value = asInt64(lowerOrIntervals);
      this.flatIntervals = [value, value];
      return;
    }
    this.flatIntervals = Array.from(lowerOrIntervals, asInt64);
  }

  static fromFlatIntervals(intervals: Iterable<IntValue>) {
    return new Domain(Array.from(intervals, (value) => toInt64(value)));
  }

  static fromIntervals(intervals: Iterable<Iterable<IntValue>>) {
    const flatIntervals: ProtoInt64[] = [];
    for (const interval of intervals) {
      const values = Array.from(interval, asInt64);
      rangeError(values.length === 1 || values.length === 2, 'domain intervals must contain one or two bounds');
      flatIntervals.push(values[0], values[1] ?? values[0]);
    }
    return new Domain(flatIntervals.map(protoInt64ToBigInt));
  }

  static fromValues(values: Iterable<IntValue>) {
    const exactValues = Array.from(values, (value) => toInt64(value));
    const sortedValues = Array.from(new Set(exactValues)).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const flatIntervals: ProtoInt64[] = [];
    for (const value of sortedValues) {
      const lastUpper = flatIntervals[flatIntervals.length - 1];
      if (lastUpper !== undefined && protoInt64ToBigInt(lastUpper) + 1n === value) {
        flatIntervals[flatIntervals.length - 1] = asInt64(value);
      } else {
        const protoValue = asInt64(value);
        flatIntervals.push(protoValue, protoValue);
      }
    }
    return new Domain(flatIntervals.map(protoInt64ToBigInt));
  }

}

export class CpModel {
  private readonly model: CpModelProto;
  private readonly constantIndexes = new Map<bigint, number>();
  private readonly intVariables = new Map<number, IntVar>();

  constructor(model?: CpModelProto) {
    this.model = model === undefined ? { variables: [], constraints: [] } : cloneProto(model);
    liveModelProtos.set(this, this.model);
    for (const [index, variable] of (this.model.variables ?? []).entries()) {
      const domain = variable.domain ?? [];
      if (domain.length === 2 && compareProtoInt64(domain[0], domain[1]) === 0) {
        this.constantIndexes.set(protoInt64ToBigInt(domain[0]), index);
      }
    }
  }

  get name() {
    return this.model.name ?? '';
  }

  set name(name: string) {
    this.model.name = name;
  }

  get modelProto() {
    return cloneProto(this.model);
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

  newIntVar(lb: IntValue, ub: IntValue, name = '') {
    const index = this.model.variables?.length ?? 0;
    const domain = [asInt64(lb), asInt64(ub)];
    this.model.variables?.push(compareProtoInt64(domain[0], domain[1]) <= 0 ? { name, domain } : { name });
    const variable = new IntVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  newIntVarFromDomain(domain: Domain, name = '') {
    const index = this.model.variables?.length ?? 0;
    const flatDomain = [...domain.flatIntervals];
    this.model.variables?.push({ name, domain: flatDomain });
    const variable = new IntVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  newBoolVar(name = '') {
    const index = this.model.variables?.length ?? 0;
    this.model.variables?.push({ name, domain: [0, 1] });
    const variable = new BoolVar(this, index, name);
    this.intVariables.set(index, variable);
    return variable;
  }

  newConstant(value: IntValue, name = '') {
    if (name) {
      return this.newIntVar(value, value, name);
    }
    return this.getIntVarFromProtoIndex(this.constantIndex(value));
  }

  getIntVarFromProtoIndex(index: number) {
    rangeError(Number.isInteger(index), `variable index must be an integer, got ${index}`);
    const variables = this.model.variables ?? [];
    rangeError(index >= 0 && index < variables.length, `getIntVarFromProtoIndex: out of bound index ${index}`);
    const existing = this.intVariables.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const variable = new IntVar(this, index, variables[index]?.name ?? '');
    this.intVariables.set(index, variable);
    return variable;
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

  getIntervalVarFromProtoIndex(index: number) {
    rangeError(Number.isInteger(index), `interval index must be an integer, got ${index}`);
    const constraints = this.model.constraints ?? [];
    rangeError(index >= 0 && index < constraints.length, `getIntervalVarFromProtoIndex: out of bound index ${index}`);
    const constraint = constraints[index];
    if (constraint?.interval === undefined) {
      throw new TypeError(`getIntervalVarFromProtoIndex: index ${index} is not an interval`);
    }
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

  private constantIndex(value: IntValue) {
    const exact = toInt64(value);
    const existingIndex = this.constantIndexes.get(exact);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
    const index = this.model.variables?.length ?? 0;
    const protoValue = asInt64(exact);
    const domain: ProtoInt64[] = [protoValue, protoValue];
    this.model.variables?.push({ domain });
    this.constantIndexes.set(exact, index);
    return index;
  }

  add(bound: BoundedLinearExpr | boolean) {
    if (bound === true) {
      return this.addBoolOr([true]);
    }
    if (bound === false) {
      return this.addBoolOr([]);
    }
    return this.addLinearConstraint(
      bound.expression,
      protoInt64ToBigInt(bound.lowerBound),
      protoInt64ToBigInt(bound.upperBound),
      bound.domain,
    );
  }

  addLinearConstraint(expression: LinearExprLike, lb: IntValue, ub: IntValue, domain?: ProtoInt64[]) {
    const expr = LinearExpr.from(expression);
    this.checkExpressionModel(expr);
    rangeError(expr.isInteger(), 'linear constraints require integer expressions');
    const normalizedLb = asInt64(lb);
    const normalizedUb = asInt64(ub);
    if (expr.terms.size === 0 && domain === undefined) {
      const exactOffset = expr.offset as bigint;
      return exactOffset >= protoInt64ToBigInt(normalizedLb) && exactOffset <= protoInt64ToBigInt(normalizedUb)
        ? this.pushConstraint({ boolAnd: { literals: [] } })
        : this.pushConstraint({ boolOr: { literals: [] } });
    }
    const proto = expr.toProto();
    const adjustedDomain = (domain ?? [normalizedLb, normalizedUb]).map((value) => adjustDomainEndpoint(value, expr.offset));
    return this.pushConstraint({
      linear: {
        vars: proto.vars,
        coeffs: proto.coeffs,
        domain: adjustedDomain,
      },
    });
  }

  addEquality(left: LinearExprLike, right: LinearExprLike) {
    return this.add(LinearExpr.from(left).eq(right));
  }

  addAllDifferent(expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.pushConstraint({
      allDiff: { exprs: this.expressionProtos(expressionList(expressions, rest)) },
    });
  }

  addElement(index: LinearExprLike, expressions: Iterable<LinearExprLike>, target: LinearExprLike) {
    const exprs = Array.from(expressions);
    rangeError(exprs.length > 0, 'addElement requires at least one expression');
    if (typeof index === 'number' || typeof index === 'bigint') {
      const exactIndex = toInt64(index, 'element index');
      rangeError(exactIndex >= 0n && exactIndex < BigInt(exprs.length), `element index ${index} is out of range`);
      return this.add(LinearExpr.from(target).eq(exprs[Number(exactIndex)]));
    }
    return this.pushConstraint({
      element: {
        linearIndex: this.expressionProto(index),
        exprs: this.expressionProtos(exprs),
        linearTarget: this.expressionProto(target),
      },
    });
  }

  addAllowedAssignments(expressions: Iterable<LinearExprLike>, tuples: Iterable<Iterable<IntValue>>) {
    const exprs = this.expressionProtos(expressions);
    rangeError(exprs.length > 0, 'addAllowedAssignments requires at least one expression');
    const values = Array.from(tuples, (tupleValue) => Array.from(tupleValue));
    for (const tupleValue of values) {
      rangeError(tupleValue.length === exprs.length, 'tuple arity does not match expression count');
    }
    return this.pushConstraint({
      table: {
        exprs,
        values: values.flat().map(asInt64),
      },
    });
  }

  addForbiddenAssignments(expressions: Iterable<LinearExprLike>, tuples: Iterable<Iterable<IntValue>>) {
    const constraint = this.addAllowedAssignments(expressions, tuples);
    const proto = this.model.constraints?.[constraint.index];
    assert(proto?.table, 'table constraint was not created');
    proto.table.negated = true;
    return constraint;
  }

  addAutomaton(expressions: Iterable<LinearExprLike>, startingState: IntValue, finalStates: Iterable<IntValue>, transitions: Iterable<[IntValue, IntValue, IntValue]>) {
    const exprs = this.expressionProtos(expressions);
    const finalStateValues = Array.from(finalStates, asInt64);
    const transitionValues = Array.from(transitions);
    rangeError(exprs.length > 0, 'addAutomaton requires at least one expression');
    rangeError(finalStateValues.length > 0, 'addAutomaton requires at least one final state');
    rangeError(transitionValues.length > 0, 'addAutomaton requires at least one transition');
    const tails: ProtoInt64[] = [];
    const labels: ProtoInt64[] = [];
    const heads: ProtoInt64[] = [];
    for (const transition of transitionValues) {
      rangeError(transition.length === 3, 'automaton transitions must contain tail, label, and head');
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
    rangeError(arcValues.length > 0, 'addCircuit requires at least one arc');
    const tails: number[] = [];
    const heads: number[] = [];
    const literals: number[] = [];
    for (const [tail, head, literal] of arcValues) {
      const [literalRef] = literalReferences(this, [literal]);
      tails.push(tail);
      heads.push(head);
      literals.push(literalRef);
    }
    return this.pushConstraint({ circuit: { tails, heads, literals } });
  }

  addMultipleCircuit(arcs: Iterable<[number, number, LiteralLike]>) {
    const arcValues = Array.from(arcs);
    rangeError(arcValues.length > 0, 'addMultipleCircuit requires at least one arc');
    const tails: number[] = [];
    const heads: number[] = [];
    const literals: number[] = [];
    for (const [tail, head, literal] of arcValues) {
      const [literalRef] = literalReferences(this, [literal]);
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

  addMinEquality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    const values = expressionList(expressions, rest);
    return this.pushConstraint({
      linMax: {
        target: LinearExpr.from(target).neg().toProto(),
        exprs: values.map((expression) => LinearExpr.from(expression).neg().toProto()),
      },
    });
  }

  addAbsEquality(target: LinearExprLike, expression: LinearExprLike) {
    const expr = LinearExpr.from(expression);
    return this.addMaxEquality(target, [expr, expr.neg()]);
  }

  addDivisionEquality(target: LinearExprLike, numerator: LinearExprLike, denominator: LinearExprLike) {
    return this.pushConstraint({
      intDiv: {
        target: this.expressionProto(target),
        exprs: [this.expressionProto(numerator), this.expressionProto(denominator)],
      },
    });
  }

  addModuloEquality(target: LinearExprLike, expression: LinearExprLike, modulo: LinearExprLike) {
    return this.pushConstraint({
      intMod: {
        target: this.expressionProto(target),
        exprs: [this.expressionProto(expression), this.expressionProto(modulo)],
      },
    });
  }

  addMultiplicationEquality(target: LinearExprLike, expressions: Iterable<LinearExprLike> | LinearExprLike, ...rest: LinearExprLike[]) {
    return this.pushConstraint({
      intProd: {
        target: this.expressionProto(target),
        exprs: this.expressionProtos(expressionList(expressions, rest)),
      },
    });
  }

  addImplication(left: LiteralLike, right: LiteralLike) {
    return this.pushConstraint({
      enforcementLiteral: literalReferences(this, [left]),
      boolAnd: { literals: literalReferences(this, [right]) },
    });
  }

  addBoolOr(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.pushConstraint({ boolOr: { literals: literalReferences(this, literalList(literals, rest)) } });
  }

  addAtLeastOne(literals: Iterable<LiteralLike> | LiteralLike, ...rest: LiteralLike[]) {
    return this.addBoolOr(literals, ...rest);
  }

  addBoolAnd(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ boolAnd: { literals: literalReferences(this, literals) } });
  }

  addBoolXor(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ boolXor: { literals: literalReferences(this, literals) } });
  }

  addAtMostOne(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ atMostOne: { literals: literalReferences(this, literals) } });
  }

  addExactlyOne(literals: Iterable<LiteralLike>) {
    return this.pushConstraint({ exactlyOne: { literals: literalReferences(this, literals) } });
  }

  addMapDomain(variable: IntVar, booleanVariables: Iterable<BoolVar>, offset: IntValue = 0n) {
    requireSameModel(this, variable.model, 'map domain variable');
    const exactOffset = toInt64(offset);
    for (const [index, literal] of Array.from(booleanVariables).entries()) {
      requireSameModel(this, literal.model, 'map domain literal');
      const value = exactOffset + BigInt(index);
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
          domain: [INT64_MIN, asInt64(value - 1n), asInt64(value + 1n), INT64_MAX],
        },
      });
    }
  }

  newIntervalVar(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, name = '') {
    return this.pushInterval({ start, size, end, name });
  }

  newFixedSizeIntervalVar(start: LinearExprLike, size: IntValue, name = '') {
    return this.pushInterval({ start, size, end: LinearExpr.from(start).plus(size), name });
  }

  newOptionalFixedSizeIntervalVar(start: LinearExprLike, size: IntValue, isPresent: LiteralLike, name = '') {
    return this.newOptionalIntervalVar(start, size, LinearExpr.from(start).plus(size), isPresent, name);
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

  addNoOverlap(intervals: Iterable<IntervalVar>) {
    return this.pushConstraint({ noOverlap: { intervals: this.intervalIndexes(intervals) } });
  }

  addNoOverlap2D(xIntervals: Iterable<IntervalVar>, yIntervals: Iterable<IntervalVar>) {
    return this.pushConstraint({
      noOverlap2d: {
        xIntervals: this.intervalIndexes(xIntervals),
        yIntervals: this.intervalIndexes(yIntervals),
      },
    });
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

  addReservoirConstraint(times: Iterable<LinearExprLike>, levelChanges: Iterable<LinearExprLike>, minLevel: IntValue, maxLevel: IntValue, activeLiterals?: Iterable<LiteralLike>) {
    const exactMinLevel = toInt64(minLevel);
    const exactMaxLevel = toInt64(maxLevel);
    rangeError(exactMaxLevel >= exactMinLevel, 'reservoir max level must be greater than or equal to min level');
    rangeError(exactMaxLevel >= 0n, 'reservoir max level must be nonnegative');
    rangeError(exactMinLevel <= 0n, 'reservoir min level must be nonpositive');
    const timeValues = Array.from(times);
    const levelChangeValues = Array.from(levelChanges);
    const activeLiteralValues = activeLiterals === undefined ? undefined : Array.from(activeLiterals);
    rangeError(timeValues.length === levelChangeValues.length, 'reservoir times and level changes must have the same length');
    rangeError(
      activeLiteralValues === undefined || activeLiteralValues.length === timeValues.length,
      'reservoir active literals and times must have the same length',
    );
    return this.pushConstraint({
      reservoir: {
        timeExprs: this.expressionProtos(timeValues),
        levelChanges: this.expressionProtos(levelChangeValues),
        minLevel: asInt64(exactMinLevel),
        maxLevel: asInt64(exactMaxLevel),
        activeLiterals: activeLiteralValues === undefined ? undefined : literalReferences(this, activeLiteralValues),
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

  addHint(variable: IntVar | NotBoolVar, value: IntValue | boolean) {
    const hintedValue = typeof value === 'boolean' ? (value ? 1n : 0n) : toInt64(value);
    const hintVariable = variable instanceof NotBoolVar ? variable.variable : variable;
    const hintValue = variable instanceof NotBoolVar ? 1n - hintedValue : hintedValue;
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
      offset: proto.offset === undefined ? undefined : numericToNumber(protoInt64ToBigInt(proto.offset)),
    };
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
      offset: proto.offset === undefined ? undefined : numericToNumber(protoInt64ToBigInt(proto.offset)),
      scalingFactor: -1,
    };
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
    const modelBytes = await CpSat.createModel(this.model);
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
      constraint.enforcementLiteral = literalReferences(this, [input.isPresent]);
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
      return 0n;
    }
    const terms = new Map<number, NumericValue>();
    const vars = proto.vars ?? [];
    const coeffs = proto.coeffs ?? [];
    for (let index = 0; index < vars.length; index += 1) {
      mergeTerms(terms, vars[index], protoInt64ToBigInt(coeffs[index]));
    }
    return new LinearExpr(this, terms, protoInt64ToBigInt(proto.offset ?? 0));
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
    return Array.from(expr.terms.keys()).some((index) => {
      const domain = this.model.variables?.[index]?.domain ?? [];
      return isBooleanDomain(domain);
    });
  }
}

export class CpSolverSolutionCallback {
  private currentResponse: CpSolverResponse | null = null;

  onSolutionCallback() {}

  value(expression: IntVar | NotBoolVar): bigint;
  value(expression: LinearExprLike): NumericValue;
  value(expression: LinearExprLike): NumericValue {
    return evaluateLinearExpression(this.requireCurrentResponse(), expression);
  }

  booleanValue(literal: LiteralLike) {
    return evaluateBooleanLiteral(this.requireCurrentResponse(), literal);
  }

  get objectiveValue() {
    const response = this.requireCurrentResponse();
    stateError(typeof response.objectiveValue === 'number', 'missing objective value');
    return response.objectiveValue;
  }

  get bestObjectiveBound() {
    const response = this.requireCurrentResponse();
    stateError(typeof response.bestObjectiveBound === 'number', 'missing best objective bound');
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
      throw new Error('solve() has not started or the callback is not currently running');
    }
    return this.currentResponse;
  }
}

export class CpSolver {
  private lastResponse: CpSolverResponse | null = null;
  private solving = false;
  readonly parameters: CpSatSolverParameters = {};
  bestBoundCallback: ((bound: number) => void) | null = null;
  logCallback: ((message: string) => void) | null = null;

  async solve(model: CpModel, options: CpSolverSolveOptions = {}) {
    if (this.solving) {
      throw new Error('CpSolver.solve() is already in progress.');
    }
    this.solving = true;
    try {
      return await this.solveOnce(model, options);
    } finally {
      this.solving = false;
    }
  }

  private async solveOnce(model: CpModel, options: CpSolverSolveOptions) {
    const {
      executor,
      solutionCallback = null,
      onEvent,
      eventMask: requestedEventMask,
      signal,
      ...solverParameters
    } = options;
    const mergedParams = { ...this.parameters, ...solverParameters };
    const modelBytes = await CpSat.createModel(liveModelProto(model));
    const hasInternalEvents = Boolean(solutionCallback || this.bestBoundCallback || this.logCallback);
    let eventMask = requestedEventMask;
    if (hasInternalEvents && (eventMask || !onEvent)) {
      eventMask = {
        solution: Boolean(solutionCallback) || Boolean(eventMask?.solution),
        bestBound: Boolean(this.bestBoundCallback) || Boolean(eventMask?.bestBound),
        log: Boolean(this.logCallback) || Boolean(eventMask?.log),
      };
    }
    const result = await CpSat.solve(modelBytes, {
      ...mergedParams,
      executor,
      signal,
      eventMask,
      onEvent: hasInternalEvents || onEvent
        ? async (event) => {
            if (event.type === 'solution') {
              solutionCallback?._run(event.response);
            } else if (event.type === 'bestBound') {
              this.bestBoundCallback?.(event.bound);
            } else if (event.type === 'log') {
              this.logCallback?.(event.message);
            }
            await onEvent?.(event);
          }
        : undefined,
    });
    this.lastResponse = result.response;
    return result.response?.status;
  }

  get response() {
    return this.lastResponse;
  }

  responseStats() {
    return JSON.stringify(
      this.requireResponse(),
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    );
  }

  get deterministicTime() {
    const response = this.requireResponse();
    stateError(typeof response.deterministicTime === 'number', 'missing deterministic time');
    return response.deterministicTime;
  }

  get numBinaryPropagations() {
    return protoInt64ToNumber(this.requireResponse().numBinaryPropagations);
  }

  get numIntegerPropagations() {
    return protoInt64ToNumber(this.requireResponse().numIntegerPropagations);
  }

  get userTime() {
    const response = this.requireResponse();
    stateError(typeof response.userTime === 'number', 'missing user time');
    return response.userTime;
  }

  get solveLog() {
    return this.requireResponse().solveLog;
  }

  get numIntegers() {
    return protoInt64ToNumber(this.requireResponse().numIntegers);
  }

  get solutionInfo() {
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

  value(expression: IntVar | NotBoolVar): bigint;
  value(expression: LinearExprLike): NumericValue;
  value(expression: LinearExprLike): NumericValue {
    return evaluateLinearExpression(this.requireResponse(), expression);
  }

  booleanValue(literal: LiteralLike) {
    return evaluateBooleanLiteral(this.requireResponse(), literal);
  }

  get objectiveValue() {
    const response = this.requireResponse();
    stateError(typeof response.objectiveValue === 'number', 'missing objective value');
    return response.objectiveValue;
  }

  get bestObjectiveBound() {
    const response = this.requireResponse();
    stateError(typeof response.bestObjectiveBound === 'number', 'missing best objective bound');
    return response.bestObjectiveBound;
  }

  statusName(status = this.lastResponse?.status) {
    if (typeof status === 'string') {
      return status;
    }
    return CpSolverStatus[status as CpSolverStatus] ?? String(status);
  }

  private requireResponse() {
    stateError(this.lastResponse !== null, 'solve() has not completed with a solver response');
    return this.lastResponse;
  }
}
