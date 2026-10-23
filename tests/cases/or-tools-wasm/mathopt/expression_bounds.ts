import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected expression bounds to reject');
}
export const mathOptExpressionBoundsCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.expression_bounds.domains', name: 'Native expression bounds use variable domains, signs and offsets without solving', solver: 'mathopt',
  source: 'ortools/math_opt/labs/linear_expr_util.cc:LowerBound/UpperBound', tags: ['native-contract'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model();
    const x = model.addVariable({ lowerBound: -1, upperBound: 2 }), y = model.addVariable({ lowerBound: 3, upperBound: 5 });
    const expression = new MathOpt.LinearExpression([{ variable: x, coefficient: 2 }, { variable: y, coefficient: -3 }], 4);
    model.addLinearConstraint({ lowerBound: 0, upperBound: 0, terms: [{ variable: x, coefficient: 1 }] });
    const before = model.encodeModelProto();
    const bounds = await MathOpt.linearExpressionBounds(model, expression, options);
    assert(bounds.lowerBound === -13 && bounds.upperBound === -1, 'Native sign-aware variable-domain bounds ignore tighter rows');
    assert(String(before) === String(model.encodeModelProto()), 'Query does not mutate model');
    const constant = await MathOpt.linearExpressionBounds(model, -7, options);
    assert(constant.lowerBound === -7 && constant.upperBound === -7, 'Constant expression');
    const free = model.addVariable({ lowerBound: -Infinity, upperBound: Infinity });
    const infinite = await MathOpt.linearExpressionBounds(model, free, options);
    assert(infinite.lowerBound === -Infinity && infinite.upperBound === Infinity, 'Unbounded domains preserve infinities');
    const integer = model.addVariable({ lowerBound: 0.2, upperBound: 2.8, integer: true });
    const fractional = await MathOpt.linearExpressionBounds(model, integer, options);
    assert(fractional.lowerBound === 0.2 && fractional.upperBound === 2.8, 'Native utility does not round integer domains');
    const overflow = await MathOpt.linearExpressionBounds(model, new MathOpt.LinearExpression([{ variable: x, coefficient: 1e308 }]), options);
    assert(overflow.upperBound === Infinity, 'Native overflow is forwarded, not repaired');
    const inconsistent = model.addVariable({ lowerBound: 3, upperBound: 1 });
    const reversed = await MathOpt.linearExpressionBounds(model, inconsistent, options);
    assert(reversed.lowerBound === 3 && reversed.upperBound === 1, 'Native utility preserves inconsistent domains without a feasibility check');
    const empty = await MathOpt.linearExpressionBounds(MathOpt.Model(), 0, options);
    assert(empty.lowerBound === 0 && empty.upperBound === 0, 'Empty model and zero bounds');
    return {};
  },
}, {
  id: 'mathopt.expression_bounds.snapshots', name: 'Expression queries capture bounds, reject foreign and deleted handles, and recover', solver: 'mathopt',
  source: 'ortools/math_opt/labs/linear_expr_util.h', tags: ['native-contract', 'lifecycle'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model(), x = model.addVariable({ lowerBound: -2, upperBound: 3 });
    const pending = MathOpt.linearExpressionBounds(model, x, options);
    x.upperBound = 9;
    const old = await pending;
    assert(old.upperBound === 3 && (await MathOpt.linearExpressionBounds(model, x, options)).upperBound === 9, 'Snapshot retains submitted bounds');
    old.upperBound = 100;
    assert((await MathOpt.linearExpressionBounds(model, x, options)).upperBound === 9, 'Result has no mutable cached state');
    const other = MathOpt.Model(), foreign = other.addVariable();
    await rejects(() => MathOpt.linearExpressionBounds(model, foreign, options));
    for (const coefficient of [NaN, Infinity, -Infinity])
      await rejects(() => MathOpt.linearExpressionBounds(model, new MathOpt.LinearExpression([{ variable: x, coefficient }]), options));
    await rejects(() => MathOpt.linearExpressionBounds(model, NaN, options));
    model.deleteVariable(x);
    await rejects(() => MathOpt.linearExpressionBounds(model, x, options));
    const abort = new AbortController(); abort.abort();
    await rejects(() => MathOpt.linearExpressionBounds(model, 1, { ...options, signal: abort.signal }));
    assert((await MathOpt.linearExpressionBounds(model, 1, options)).lowerBound === 1, 'Recovery after invalid input and cancellation');
    return {};
  },
}, {
  id: 'mathopt.expression_bounds.proto', name: 'Raw expression bounds preserve exact IDs and native sparse-expression validation', solver: 'mathopt',
  source: 'ortools/math_opt/validators/linear_expression_validator.cc', tags: ['native-contract'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), id = 9007199254740993n;
    const model = { variables: { ids: [id], lowerBounds: [-2], upperBounds: [4], integers: [false] } };
    const expression = { ids: [id], coefficients: [-3], offset: 1 };
    const pending = MathOpt.linearExpressionBoundsProto(model, expression, options);
    model.variables.upperBounds[0] = 5; expression.coefficients[0] = 1;
    const bounds = await pending;
    assert(bounds.lowerBound === -11 && bounds.upperBound === 7, 'Exact native ID and independent snapshots');
    for (const bad of [{ ids: [id + 1n], coefficients: [1] }, { ids: [id], coefficients: [] },
      { ids: [id, id], coefficients: [1, 2] }, { ids: [id], coefficients: [Infinity] }, { offset: NaN }])
      await rejects(() => MathOpt.linearExpressionBoundsProto(model, bad, options));
    await rejects(() => MathOpt.linearExpressionBoundsProto(new Uint8Array([255]), {}, options));
    const valid = await MathOpt.linearExpressionBoundsProto(model, expression, options);
    assert(valid.lowerBound === -1 && valid.upperBound === 6, 'Raw query recovers after native validation errors');
    return {};
  },
}];
