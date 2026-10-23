import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid solution improvement to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const mathOptImprovementCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.improvement.order_and_selection', name: 'Native solution improvement preserves variable order and returns independent values', solver: 'mathopt',
  source: 'ortools/math_opt/labs/solution_improvement.h:MoveVariablesToTheirBestFeasibleValue', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model();
    const x = model.addVariable({ lowerBound: 0, upperBound: 1 }), y = model.addVariable({ lowerBound: 0, upperBound: 1 }),
      unchanged = model.addVariable({ lowerBound: 0, upperBound: 10 });
    model.addLinearConstraint({ upperBound: 1, terms: [{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }] });
    model.maximize([{ variable: x, coefficient: 2 }, { variable: y, coefficient: 1 }]);
    const input = new Map([[x, 0], [y, 0], [unchanged, 3]]), before = model.encodeModelProto();
    const xy = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x, y, unchanged], options);
    const yx = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [y, x], options);
    assert(xy.get(x) === 1 && xy.get(y) === 0 && yx.get(x) === 0 && yx.get(y) === 1,
      'Native processing follows the selected order rather than sorting by objective coefficient');
    assert(xy.get(unchanged) === 3 && xy.size === 3 && !('set' in xy), 'All values are returned in a read-only map; zero-objective variables stay unchanged');
    assert(input.get(x) === 0 && input.get(y) === 0 && String(before) === String(model.encodeModelProto()),
      'Input point and model remain unchanged');
    assert((await MathOpt.checkPrimalSolutionFeasibility(model, xy, options)).feasible, 'Independent native checker accepts the improved feasible point');
    const subset = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [y], options);
    assert(subset.get(x) === 0 && subset.get(y) === 1, 'Only selected variables are moved');
    const empty = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [], options);
    assert(empty.get(x) === 0 && empty.get(y) === 0, 'Empty selection returns a complete unchanged point');
    model.minimize([{ variable: x, coefficient: -2 }, { variable: y, coefficient: -1 }]);
    const minimum = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, { [x.id]: 0, [y.id]: 0, [unchanged.id]: 3 }, [x, y], options);
    assert(minimum.get(x) === 1 && minimum.get(y) === 0, 'Native objective direction and negative coefficients are preserved');
    const infeasible = await MathOpt.moveVariablesToTheirBestFeasibleValue(model,
      new Map([[x, 0.8], [y, 0.8], [unchanged, 3]]), [x, y], options);
    assert(!(await MathOpt.checkPrimalSolutionFeasibility(model, infeasible, options)).feasible,
      'Native improvement does not certify or repair an infeasible starting point');
    return {};
  },
}, {
  id: 'mathopt.improvement.validation_and_snapshots', name: 'Native improvement validates complete finite points, supported models and tolerance', solver: 'mathopt',
  source: 'ortools/math_opt/labs/solution_improvement.cc:MoveVariablesToTheirBestFeasibleValue', tags: ['native-contract', 'lifecycle'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model(), x = model.addVariable({ lowerBound: 0, upperBound: 2.9999999, integer: true });
    model.maximize(x);
    const input = new Map([[x, 0]]);
    assert((await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], options)).get(x) === 2,
      'Default native integrality tolerance is zero');
    assert((await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], { ...options, integralityTolerance: 1e-6 })).get(x) === 3,
      'Explicit integrality tolerance rounds the almost-integer bound natively');
    for (const integralityTolerance of [-1, 0.25001, NaN, Infinity])
      await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], { ...options, integralityTolerance }));
    assert((await MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], { ...options, integralityTolerance: 0.25 })).get(x) === 3,
      'Native maximum tolerance is accepted');
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, new Map(), [x], options));
    for (const value of [Infinity, -Infinity, NaN])
      await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, new Map([[x, value]]), [x], options));
    const other = MathOpt.Model(), foreign = other.addVariable();
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, new Map([[foreign, 0]]), [x], options));
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [foreign], options));
    const cone = model.addSecondOrderConeConstraint([x], 1);
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], options));
    model.deleteSecondOrderConeConstraint(cone);
    x.upperBound = Infinity;
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], options));
    x.upperBound = 2;
    const selected = [x], pending = MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, selected, options);
    input.set(x, 1); selected.length = 0; model.deleteVariable(x);
    const result = await pending;
    assert(result.get(x) === 2, 'Result retains submitted handles even if variables are deleted while awaiting');
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, input, [x], options));
    const abort = new AbortController(); abort.abort();
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValue(model, {}, [], { ...options, signal: abort.signal }));
    assert((await MathOpt.moveVariablesToTheirBestFeasibleValue(model, {}, [], options)).size === 0, 'Empty models and recovery after errors work');
    return {};
  },
}, {
  id: 'mathopt.improvement.exact_proto', name: 'Raw improvement preserves exact IDs, input ownership and native errors', solver: 'mathopt',
  source: 'ortools/math_opt/labs/solution_improvement.h', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), id = 9007199254740993n;
    const model = { variables: { ids: [id], lowerBounds: [0], upperBounds: [4], integers: [false] },
      objective: { maximize: true, linearCoefficients: { ids: [id], values: [1] } } };
    const values = { ids: [id], values: [1] }, selected = [id];
    const pending = MathOpt.moveVariablesToTheirBestFeasibleValueProto(model, values, selected, options);
    model.variables.upperBounds[0] = 8; values.values[0] = 2; selected.length = 0;
    const result = await pending;
    assert(result.proto.ids?.[0] === id && result.proto.values?.[0] === 4 && result.bytes.length > 0,
      'Native sparse-vector output preserves exact IDs and captured inputs');
    result.bytes.fill(0);
    assert(result.proto.values[0] === 4 && values.values[0] === 2, 'Bytes, decoded result and caller input are independent');
    const invoke = (ids: bigint[], variableValues: number[], variables: bigint[]) =>
      MathOpt.moveVariablesToTheirBestFeasibleValueProto(model, { ids, values: variableValues }, variables, options);
    await rejects(() => invoke([id], [], [id]));
    await rejects(() => invoke([id, id], [0, 0], [id]));
    await rejects(() => invoke([id + 1n], [0], [id]));
    await rejects(() => invoke([id], [0], [id + 1n]));
    await rejects(() => MathOpt.moveVariablesToTheirBestFeasibleValueProto(new Uint8Array([255]), values, [id], options));
    const recovery = await invoke([id], [0], [id, id]);
    assert(recovery.proto.values?.[0] === 8, 'Duplicate selections retain native repeated-visit semantics and errors do not poison execution');
    return {};
  },
}];
