import { toInt64, type IntValue } from '../int64.js';
import type { RoutingIntVar } from './api.js';

export type RoutingBooleanVariable = Extract<RoutingIntVar, { kind: 'routingBoolVar' | 'routingActiveVar' | 'routingActiveVehicleVar' | 'routingVehicleRouteConsideredVar' }>;
export type RoutingBooleanOperand = boolean | RoutingLinearConstraint | RoutingBoolExpr | RoutingBooleanVariable;
export type RoutingLinearOperand = IntValue | RoutingIntVar | RoutingLinearExpr;
export type RoutingComparison = 'eq' | 'ne' | 'le' | 'ge' | 'lt' | 'gt';
export type RoutingLinearConstraint = {
  readonly type: 'routingLinearConstraint';
  readonly left: RoutingLinearExpr;
  readonly right: RoutingLinearExpr;
  readonly comparison: RoutingComparison;
  readonly conditions?: readonly RoutingBooleanOperand[];
  asBool(): RoutingBoolExpr;
  onlyEnforceIf(...conditions: RoutingBooleanOperand[]): RoutingLinearConstraint;
};

function comparisonConstraint(left: RoutingLinearExpr, right: RoutingLinearExpr, comparison: RoutingComparison,
    conditions: readonly RoutingBooleanOperand[] = []): RoutingLinearConstraint {
  const models = new Set([left, right, ...conditions.flatMap(condition => RoutingBoolExpr.from(condition).variables().map(variable => RoutingLinearExpr.from(variable)))]
    .flatMap(expression => expression.terms.map(term => term.variable.model)));
  if (models.size > 1) throw new Error('Variables belong to different Routing models.');
  return Object.freeze({ type: 'routingLinearConstraint' as const, left, right, comparison,
    ...(conditions.length ? { conditions: Object.freeze([...conditions]) } : {}),
    asBool(): RoutingBoolExpr { return RoutingBoolExpr.from(this); },
    onlyEnforceIf(...additional: RoutingBooleanOperand[]): RoutingLinearConstraint {
      for (const condition of additional) RoutingBoolExpr.from(condition);
      return comparisonConstraint(left, right, comparison, [...conditions, ...additional]);
    },
  });
}

/** Immutable linear arithmetic over Routing variable handles. */
export class RoutingLinearExpr {
  readonly terms: readonly { readonly variable: RoutingIntVar; readonly coefficient: bigint }[];
  readonly offset: bigint;

  private constructor(terms: readonly { variable: RoutingIntVar; coefficient: bigint }[], offset: bigint) {
    this.terms = Object.freeze(terms.map(term => Object.freeze({ ...term })));
    this.offset = toInt64(offset, 'Routing expression offset');
    Object.freeze(this);
  }

  static from(value: RoutingLinearOperand): RoutingLinearExpr {
    if (value instanceof RoutingLinearExpr) return value;
    if (typeof value === 'number' || typeof value === 'bigint') return new RoutingLinearExpr([], toInt64(value));
    if (!value || typeof value !== 'object' || !value.model) throw new TypeError('Expected a Routing variable, linear expression or integer.');
    return new RoutingLinearExpr([{ variable: value, coefficient: 1n }], 0n);
  }

  add(value: RoutingLinearOperand): RoutingLinearExpr {
    const other = RoutingLinearExpr.from(value);
    const models = new Set([...this.terms, ...other.terms].map(term => term.variable.model));
    if (models.size > 1) throw new Error('Variables belong to different Routing models.');
    return new RoutingLinearExpr([...this.terms, ...other.terms], toInt64(this.offset + other.offset, 'Routing expression offset'));
  }

  sub(value: RoutingLinearOperand): RoutingLinearExpr { return this.add(RoutingLinearExpr.from(value).neg()); }
  mul(value: IntValue): RoutingLinearExpr {
    const coefficient = toInt64(value, 'Routing expression multiplier');
    return new RoutingLinearExpr(this.terms.map(term => ({ variable: term.variable,
      coefficient: toInt64(term.coefficient * coefficient, 'Routing expression coefficient') })),
      toInt64(this.offset * coefficient, 'Routing expression offset'));
  }
  neg(): RoutingLinearExpr { return this.mul(-1); }

  private compare(value: RoutingLinearOperand, comparison: RoutingComparison): RoutingLinearConstraint {
    const right = RoutingLinearExpr.from(value);
    return comparisonConstraint(this, right, comparison);
  }
  eq(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'eq'); }
  ne(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'ne'); }
  le(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'le'); }
  ge(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'ge'); }
  lt(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'lt'); }
  gt(value: RoutingLinearOperand): RoutingLinearConstraint { return this.compare(value, 'gt'); }
}

export type RoutingBooleanNode =
  | { readonly kind: 'constant'; readonly value: boolean }
  | { readonly kind: 'variable'; readonly variable: RoutingBooleanVariable }
  | { readonly kind: 'comparison'; readonly comparison: RoutingLinearConstraint }
  | { readonly kind: 'and' | 'or' | 'not'; readonly operands: readonly RoutingBoolExpr[] };

/** Boolean composition serialized for the native CP solver. */
export class RoutingBoolExpr {
  private constructor(readonly node: RoutingBooleanNode) { Object.freeze(node); Object.freeze(this); }
  static from(value: RoutingBooleanOperand): RoutingBoolExpr {
    if (value instanceof RoutingBoolExpr) return value;
    if (typeof value === 'boolean') return new RoutingBoolExpr({ kind: 'constant', value });
    if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'routingLinearConstraint') {
      if (!(value.left instanceof RoutingLinearExpr) || !(value.right instanceof RoutingLinearExpr) || value.conditions?.length) {
        throw new TypeError('Routing Boolean predicates and enforcement conditions must be unconditional linear comparisons.');
      }
      return new RoutingBoolExpr({ kind: 'comparison', comparison: comparisonConstraint(value.left, value.right, value.comparison) });
    }
    if (typeof value === 'object' && value !== null && 'kind' in value && ['routingBoolVar', 'routingActiveVar', 'routingActiveVehicleVar', 'routingVehicleRouteConsideredVar'].includes(value.kind)) {
      return new RoutingBoolExpr({ kind: 'variable', variable: value });
    }
    throw new TypeError('Routing Boolean predicates and enforcement conditions require Boolean values, variables or unconditional linear comparisons.');
  }
  private static combine(kind: 'and' | 'or', values: RoutingBooleanOperand[]): RoutingBoolExpr {
    if (!values.length) throw new RangeError('Routing Boolean AND/OR requires at least one operand.');
    const operands = values.map(value => RoutingBoolExpr.from(value));
    if (new Set(operands.flatMap(operand => operand.variables().map(variable => variable.model))).size > 1) throw new Error('Variables belong to different Routing models.');
    return new RoutingBoolExpr({ kind, operands: Object.freeze(operands) });
  }
  static and(...values: RoutingBooleanOperand[]): RoutingBoolExpr { return this.combine('and', values); }
  static or(...values: RoutingBooleanOperand[]): RoutingBoolExpr { return this.combine('or', values); }
  and(...values: RoutingBooleanOperand[]): RoutingBoolExpr { return RoutingBoolExpr.and(this, ...values); }
  or(...values: RoutingBooleanOperand[]): RoutingBoolExpr { return RoutingBoolExpr.or(this, ...values); }
  not(): RoutingBoolExpr { return new RoutingBoolExpr({ kind: 'not', operands: Object.freeze([this]) }); }
  variables(): RoutingIntVar[] {
    const node = this.node;
    if (node.kind === 'constant') return [];
    if (node.kind === 'variable') return [node.variable];
    if (node.kind === 'comparison') return [...node.comparison.left.terms, ...node.comparison.right.terms].map(term => term.variable);
    return node.operands.flatMap(operand => operand.variables());
  }
}
