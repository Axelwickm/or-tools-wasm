import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch { return; }
  throw new Error('Expected SOS operation to reject');
}

export const mathOptSosCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.sos.lifecycle', name: 'SOS1/SOS2 affine models preserve lifecycle, native incremental updates and import', solver: 'mathopt',
  async run({ mathopt: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
    const options = { ...execution, solverType: api.MathOptSolverType.GSCIP };
    for (const kind of ['sos1', 'sos2'] as const) {
      const model = api.MathOpt.Model(kind), variables = [3, 2, 1].map((_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, name: `x${i}` }));
      // The two largest rewards are nonadjacent: an arbitrary "at most two"
      // constraint would return 5, while native SOS2 must return 4.
      model.maximize(variables.map((variable, i) => ({ variable, coefficient: [3, 1, 2][i] })));
      const session = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GSCIP, execution);
      const add = kind === 'sos1' ? model.addSos1Constraint.bind(model) : model.addSos2Constraint.bind(model);
      try {
        assert((await session.solve()).objectiveValue === 6, 'Unconstrained native optimum');
        const inputs = [...variables], weights = [1, 2, 3];
        const constraint = add(inputs, { weights, name: 'choices' });
        inputs.length = 0; weights[0] = 99;
        assert(constraint.expressions().length === 3 && constraint.weights()[0] === 1, 'SOS owns submitted arrays');
        const expected = kind === 'sos1' ? 3 : 4;
        const first = await session.solve();
        assert(first.objectiveValue === expected && (await api.MathOpt.solve(model, options)).objectiveValue === expected, 'Native SOS optimum agrees for fresh/incremental solves');
        const imported = await api.MathOptModel.fromModelProto(model.encodeModelProto(), execution);
        const copy = kind === 'sos1' ? imported.getSos1Constraint(constraint.id) : imported.getSos2Constraint(constraint.id);
        assert(copy?.kind === kind && copy.name === 'choices' && copy.expressions().length === 3, 'Native validated import restores SOS');
        assert((await api.MathOpt.solve(imported, options)).objectiveValue === expected, 'Imported SOS model solves identically');
        const foreign = api.MathOpt.Model().addVariable();
        const nextId = kind === 'sos1' ? model.getNextSos1ConstraintId() : model.getNextSos2ConstraintId();
        await rejects(() => add([foreign]));
        assert((kind === 'sos1' ? model.getNextSos1ConstraintId() : model.getNextSos2ConstraintId()) === nextId, 'Rejected foreign input does not consume IDs');
        model.deleteVariable(variables[0]);
        assert(constraint.expressions()[0].terms.size === 0, 'Deleted SOS variables are treated as zero');
        assert((await session.solve()).objectiveValue === (kind === 'sos1' ? 2 : 3), 'Native variable deletion updates SOS');
        assert(first.value(variables[0]) === 1 && first.objectiveValue === expected, 'Earlier SOS result survives deletion');
        model.deleteSosConstraint(constraint);
        await rejects(() => constraint.expressions());
        assert((await session.solve()).objectiveValue === 3, 'Native SOS deletion releases restriction');
        const replacement = add([variables[1], variables[2]]);
        assert(replacement.id === nextId, 'SOS IDs remain monotonic');
        assert((await session.solve()).objectiveValue === (kind === 'sos1' ? 2 : 3), 'Native SOS re-addition works');
      } finally { await session.close(); }
    }
    const affine = api.MathOpt.Model(), x = affine.addVariable({ lowerBound: -1, upperBound: 0 }), y = affine.addVariable({ lowerBound: 0, upperBound: 2 });
    affine.addSos1Constraint([api.MathOpt.asFlatLinearExpression(x).add(1), y]); affine.maximize(y);
    const result = await api.MathOpt.solve(affine, options);
    assert(result.objectiveValue === 2 && result.value(x) === -1, 'SOS accepts affine expressions with offsets');
    for (const weights of [[1, 1], [1], [NaN, 2], [Infinity, 2]]) {
      const invalid = affine.addSos2Constraint([x, y], { weights });
      await rejects(() => api.MathOpt.solve(affine, options));
      affine.deleteSosConstraint(invalid);
    }
    assert((await api.MathOpt.solve(affine, options)).objectiveValue === 2, 'Recovery after native weight validation');
    await rejects(() => api.MathOpt.solve(affine, { ...execution, solverType: api.MathOptSolverType.GLOP }));
    const constants = api.MathOpt.Model();
    const empty = constants.addSos1Constraint([]);
    await rejects(() => api.MathOpt.solve(constants, options));
    constants.deleteSosConstraint(empty);
    constants.addSos1Constraint([1, 1]);
    assert((await api.MathOpt.solve(constants, options)).terminationReason === 'TERMINATION_REASON_INFEASIBLE', 'Two nonzero constant expressions violate native SOS1');
    return {};
  },
}];
