import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid robust constraint to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const mathOptRobustCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.transform.robust_lp', name: 'Native robust constraints enforce coupled LP uncertainty and preserve input models', solver: 'mathopt',
  source: 'ortools/math_opt/labs/dualizer.h:AddRobustConstraint', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), uncertainty = MathOpt.Model('uncertainty');
    const w = uncertainty.addVariable({ lowerBound: 0, upperBound: 1, name: 'w' });
    const v = uncertainty.addVariable({ lowerBound: -Infinity, upperBound: Infinity, name: 'v' });
    uncertainty.addLinearConstraint({ lowerBound: 0, upperBound: 1, expression: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }, { variable: v, coefficient: 1 }]) });
    uncertainty.addLinearConstraint({ lowerBound: 0, upperBound: 1, expression: v });
    // The uncertainty model objective is irrelevant: W is its feasible region.
    uncertainty.minimize(w);
    const model = MathOpt.Model('robust'), x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' }),
      y = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'y' }), rhs = model.addVariable({ lowerBound: 4, upperBound: 4, name: 'capacity' });
    model.maximize(new MathOpt.LinearExpression([{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }]));
    const mainBytes = model.encodeModelProto(), uncertaintyBytes = uncertainty.encodeModelProto();
    // max_{0<=w,v<=1,w+v<=1} (1+w)x + (1+v)y <= 4.
    const transformed = await MathOpt.addRobustConstraint(model, uncertainty, rhs,
      [{ variable: x, coefficient: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }], 1) }, { variable: y, coefficient: new MathOpt.LinearExpression([{ variable: v, coefficient: 1 }], 1) }], options);
    assert(transformed !== model && transformed.variables().length > model.variables().length && transformed.linearConstraints().length > 0,
      'Native dualizer returns an independent extended formulation');
    assert(String(mainBytes) === String(model.encodeModelProto()) && String(uncertaintyBytes) === String(uncertainty.encodeModelProto()),
      'Both input models and their objective metadata remain unchanged');
    const solved = await MathOpt.solve(transformed, { ...options, solverType: 'GLOP', threads: 1 });
    assert(Math.abs(solved.objectiveValue! - 8 / 3) < 1e-7 && Math.abs(solved.value(transformed.getVariable(x.id)!) - 4 / 3) < 1e-7,
      'Coupled uncertainty gives x=y=4/3, rather than the rectangular-uncertainty optimum of 2');
    assert((await MathOpt.checkPrimalSolutionFeasibility(transformed, solved.variableValuesById, options)).feasible,
      'Returned native solution satisfies all extended-formulation rows');
    // An integer main model is valid: only the uncertainty model must be an LP.
    x.integer = true;
    const integerModel = await MathOpt.addRobustConstraint(model, uncertainty, rhs,
      [{ variable: x, coefficient: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }], 1) }, { variable: y, coefficient: new MathOpt.LinearExpression([{ variable: v, coefficient: 1 }], 1) }], options);
    const mip = await MathOpt.solve(integerModel, { ...options, solverType: 'GSCIP', threads: 1 });
    assert(Math.abs(mip.objectiveValue! - 2.5) < 1e-7 && integerModel.getVariable(x.id)!.integer,
      'Native reformulation preserves main-model integrality');
    for (const [lowerBound, upperBound, coefficient, expected] of [
      [2, 2, 1, 2], [-Infinity, 2, 1, 2], [2, Infinity, -1, 10], [0, Infinity, 1, 0],
    ]) {
      const region = MathOpt.Model(), u = region.addVariable({ lowerBound, upperBound });
      const base = MathOpt.Model(), value = base.addVariable({ lowerBound: 0, upperBound: 10 }),
        bound = base.addVariable({ lowerBound: 4, upperBound: 4 });
      base.maximize(value);
      const robust = await MathOpt.addRobustConstraint(base, region, bound,
        [{ variable: value, coefficient: { variable: u, coefficient } }], options);
      const answer = await MathOpt.solve(robust, { ...options, solverType: 'GLOP', threads: 1 });
      assert(Math.abs(answer.objectiveValue! - expected) < 1e-7,
        'Native duality handles fixed, one-sided and unbounded uncertainty and negative coefficients');
    }
    return {};
  },
}, {
  id: 'mathopt.transform.robust_errors', name: 'Robust constraint inputs validate ownership, LP preconditions and snapshot lifetimes', solver: 'mathopt',
  source: 'ortools/math_opt/labs/dualizer.h:AddRobustConstraint', tags: ['native-contract', 'lifecycle'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model(), uncertainty = MathOpt.Model();
    const x = model.addVariable({ lowerBound: 0, upperBound: 10 }), rhs = model.addVariable({ lowerBound: 4, upperBound: 4 }),
      w = uncertainty.addVariable({ lowerBound: 0, upperBound: 1 });
    model.maximize(x);
    const input = [{ variable: x, coefficient: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }], 1) }];
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, w, input, options));
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, [{ variable: w, coefficient: w }], options));
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, [{ variable: x, coefficient: x }], options));
    w.integer = true;
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, input, options));
    w.integer = false;
    const cone = uncertainty.addSecondOrderConeConstraint([w], 1);
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, input, options));
    uncertainty.deleteSecondOrderConeConstraint(cone);
    const pending = MathOpt.addRobustConstraint(model, uncertainty, rhs, input, options);
    rhs.lowerBound = 6; rhs.upperBound = 6; w.upperBound = 2; uncertainty.deleteVariable(w);
    const snapshot = await pending;
    assert((await MathOpt.solve(snapshot, { ...options, solverType: 'GLOP', threads: 1 })).objectiveValue === 2,
      'Both models and coefficient expressions are captured before awaiting');
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, input, options));
    const aborted = new AbortController(); aborted.abort();
    await rejects(() => MathOpt.addRobustConstraint(model, uncertainty, rhs, [], { ...options, signal: aborted.signal }));
    // With no terms, the native operation still adds 0 <= rhs.
    const empty = await MathOpt.addRobustConstraint(model, MathOpt.Model(), rhs, [], options);
    assert(empty.linearConstraints().length === 1, 'Empty uncertainty and coefficient lists follow the native operation');
    return {};
  },
}, {
  id: 'mathopt.transform.robust_proto', name: 'Robust proto transformations retain exact IDs and reject malformed expressions without poisoning executors', solver: 'mathopt',
  source: 'ortools/math_opt/labs/dualizer.h:AddRobustConstraint', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), x = 9007199254740993n, rhs = x + 1n, w = x + 20n;
    const model = { name: 'exact robust', variables: { ids: [x, rhs], lowerBounds: [0, 4], upperBounds: [10, 4], integers: [false, false], names: ['x', 'rhs'] },
      objective: { maximize: true, linearCoefficients: { ids: [x], values: [1] } } };
    const uncertainty = { variables: { ids: [w], lowerBounds: [0], upperBounds: [1], integers: [false] } };
    const coefficients = [{ variableId: x, coefficient: { ids: [w], coefficients: [1], offset: 1 } }];
    const pending = MathOpt.addRobustConstraintProto(model, uncertainty, rhs, coefficients, options);
    coefficients[0].coefficient.offset = 2; uncertainty.variables.upperBounds[0] = 2;
    const transformed = await pending;
    assert(transformed.proto.variables!.ids!.some(id => BigInt(id) === x) && transformed.proto.name === model.name,
      'Native transformation preserves exact IDs and model metadata');
    const solved = await MathOpt.solveProto(transformed.bytes, { ...options, solverType: 'GLOP', threads: 1 });
    assert(Math.abs(solved.response.solutions![0].primalSolution!.objectiveValue! - 2) < 1e-7,
      'Serialized inputs are independent of caller edits');
    const invoke = (coefficient: { ids?: bigint[]; coefficients?: number[]; offset?: number }) =>
      MathOpt.addRobustConstraintProto(model, uncertainty, rhs, [{ variableId: x, coefficient }], options);
    await rejects(() => invoke({ ids: [w], coefficients: [] }));
    await rejects(() => invoke({ ids: [w, w], coefficients: [1, 1] }));
    await rejects(() => invoke({ ids: [w + 1n], coefficients: [1] }));
    await rejects(() => invoke({ ids: [w], coefficients: [Infinity] }));
    await rejects(() => invoke({ offset: NaN }));
    await rejects(() => MathOpt.addRobustConstraintProto(model, uncertainty, rhs + 1n, [], options));
    await rejects(() => MathOpt.addRobustConstraintProto(new Uint8Array([255]), uncertainty, rhs, [], options));
    const constant = await invoke({ offset: 2 });
    assert(constant.bytes.length > 0, 'Constant coefficients and recovery after native validation failures work');
    const unbounded = await MathOpt.addRobustConstraintProto(model,
      { variables: { ids: [w], lowerBounds: [-Infinity], upperBounds: [Infinity], integers: [false] } }, rhs,
      [{ variableId: x, coefficient: { ids: [w], coefficients: [1] } }], options);
    const answer = await MathOpt.solveProto(unbounded.bytes, { ...options, solverType: 'GLOP', threads: 1 });
    assert(answer.response.solutions![0].primalSolution!.objectiveValue === 0,
      'Native duality enforces x=0 for uncertainty unbounded in both directions');
    return {};
  },
}];
