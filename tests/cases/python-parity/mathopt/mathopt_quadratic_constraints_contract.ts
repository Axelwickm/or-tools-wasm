import type * as Api from 'or-tools-wasm/mathopt';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function near(actual: number | null, expected: number) {
  assert(actual !== null && Math.abs(actual - expected) < 1e-4, `Expected ${expected}, got ${actual}`);
}
export const mathoptQuadraticConstraintCases = [{
  name: 'QuadraticConstraintTest/native_qcqp_miqcp_and_incremental_lifecycle',
  source: 'ortools/math_opt/python/quadratic_constraints_test.py; ortools/math_opt/python/solve_test.py',
  async run(api: typeof Api): Promise<string> {
    const { MathOpt } = api;
    const model = MathOpt.Model('native_qcqp');
    const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
    const constraint = model.addQuadraticConstraint({ upperBound: 14,
      expression: MathOpt.quadraticExpression([{ variable: x, coefficient: 1 }],
        [{ firstVariable: x, secondVariable: x, coefficient: 1 }], 2), name: 'qc',
    });
    model.maximize([{ variable: x, coefficient: 1 }]);
    assert(constraint.upperBound === 12 && constraint.getLinearCoefficient(x) === 1,
      'Quadratic constraint offset/linear terms are preserved');
    assert(constraint.getQuadraticCoefficient(x, x) === 1, 'Quadratic coefficients are preserved');
    assert(model.getQuadraticConstraint(constraint.id)?.equals(constraint), 'Constraint identity is model-relative');
    const solved = await MathOpt.solve(model, { solverType: 'GSCIP' });
    near(solved.objectiveValue, 3);
    let unsupported = false;
    try { await MathOpt.solve(model, { solverType: 'GLOP' }); }
    catch (error) { unsupported = /quadratic/i.test(String(error)); if (!unsupported) throw error; }
    assert(unsupported, 'Unsupported backend must reject quadratic constraints');
    const foreign = MathOpt.Model('foreign').addVariable();
    let rejected = false;
    try { model.addQuadraticConstraint({ terms: [{ variable: foreign, coefficient: 1 }] }); }
    catch { rejected = true; }
    assert(rejected && model.getNumQuadraticConstraints() === 1, 'Foreign variables cannot silently change a constraint');

    for (const invalid of [
      () => model.addLinearConstraint({ upperBound: 1, terms: [{ variable: foreign, coefficient: 1 }] }),
      () => model.addIndicatorConstraint({ terms: [{ variable: foreign, coefficient: 1 }], upperBound: 1 }),
      () => model.maximize([{ variable: foreign, coefficient: 100 }]),
      () => model.setObjective(MathOpt.quadraticTerm(foreign, foreign), false),
    ]) {
      let rejected = false;
      try { invalid(); } catch (error) { rejected = /different MathOpt model/.test(String(error)); }
      assert(rejected, 'Foreign expression must not alias a local variable with the same native ID');
    }
    near((await MathOpt.solve(model, { solverType: 'GSCIP' })).objectiveValue, 3);

    const mip = MathOpt.Model('native_miqcp');
    const integer = mip.addVariable({ lowerBound: 0, upperBound: 10, integer: true });
    mip.addQuadraticConstraint(MathOpt.le(MathOpt.quadraticTerm(integer, integer), 5));
    mip.maximize([{ variable: integer, coefficient: 1 }]);
    near((await MathOpt.solve(mip, { solverType: 'GSCIP' })).objectiveValue, 2);

    const changing = MathOpt.Model('incremental_qcqp');
    const z = changing.addVariable({ lowerBound: 0, upperBound: 10, name: 'z' });
    changing.maximize([{ variable: z, coefficient: 1 }]);
    const solver = new MathOpt.IncrementalSolver(changing, 'GSCIP');
    try {
      near((await solver.solve()).objectiveValue, 10);
      const bounded = changing.addQuadraticConstraint({ upperBound: 9,
        quadraticTerms: [{ firstVariable: z, secondVariable: z, coefficient: 1 }], name: 'bounded' });
      const limited = await solver.solve();
      near(limited.objectiveValue, 3);
      changing.deleteQuadraticConstraint(bounded);
      assert(!changing.hasQuadraticConstraint(bounded.id), 'Deleted constraint remains absent');
      near((await solver.solve()).objectiveValue, 10);
      near(limited.objectiveValue, 3);
      changing.ensureNextQuadraticConstraintIdAtLeast(7);
      const replacement = changing.addQuadraticConstraint({ upperBound: 4,
        quadraticTerms: [{ firstVariable: z, secondVariable: z, coefficient: 1 }], name: 'replacement' });
      assert(replacement.id === 7, 'Constraint IDs advance without reuse');
      near((await solver.solve()).objectiveValue, 2);
      assert(changing.addUpdateTracker().exportUpdate() === null, 'Unchanged model produces no spurious update');
    } finally { await solver.close(); }

    const deletion = MathOpt.Model('quadratic_variable_deletion');
    const a = deletion.addVariable({ lowerBound: 0, upperBound: 10, name: 'a' });
    const b = deletion.addVariable({ lowerBound: 1, upperBound: 1, name: 'b' });
    const circle = deletion.addQuadraticConstraint({ upperBound: 9,
      quadraticTerms: [{ firstVariable: a, secondVariable: a, coefficient: 1 },
        { firstVariable: b, secondVariable: b, coefficient: 1 }] });
    deletion.maximize([{ variable: a, coefficient: 1 }]);
    const deleting = new MathOpt.IncrementalSolver(deletion, 'GSCIP');
    try {
      near((await deleting.solve()).objectiveValue, Math.sqrt(8));
      deletion.deleteVariable(b);
      assert(circle.quadraticTerms().length === 1, 'Deleted variables are treated as zero in quadratic constraints');
      near((await deleting.solve()).objectiveValue, 3);
    } finally { await deleting.close(); }
    return 'QuadraticConstraintTest/native_qcqp_miqcp_and_incremental_lifecycle PASS';
  },
}];
