import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMathOptIndicatorCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) for (const solverType of [api.MathOptSolverType.GSCIP]) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = api.MathOpt.Model('indicator_lifecycle');
    const x = model.addVariable({ lowerBound: 0, upperBound: 4, integer: true, name: 'x' });
    const z = model.addVariable({ lowerBound: 1, upperBound: 1, integer: true, name: 'z' });
    model.maximize(x);
    model.ensureNextIndicatorConstraintIdAtLeast(1_000_000_000);
    const constraint = model.addIndicatorConstraint({ indicator: z, upperBound: 6, expression: api.MathOpt.asFlatLinearExpression(x).multiply(2).add(2), name: 'bound' });
    assert(constraint.getCoefficient(x) === 2 && constraint.getImpliedConstraint().upperBound === 4
      && constraint.equals(model.indicatorConstraints()[0]), 'Indicator inspection must match normalized model data');
    const implied = constraint.getImpliedConstraint();
    constraint.terms()[0].coefficient = 100;
    assert(constraint.getCoefficient(x) === 2, 'Term inspection must not mutate native coefficients');
    const instance = new api.MathOpt.IncrementalSolver(model, solverType, { executor, threads: 1 });
    const check = (result: Api.MathOptSolveResult, expected: number) => assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL'
      && result.objectiveValue === expected, `Wrong indicator optimum (${mode}/${solverType}): ${result.terminationReason}/${result.objectiveValue}, expected ${expected}`);
    const solve = async (expected: number) => {
      check(await instance.solve(), expected);
      check(await api.MathOpt.solve(model, { executor, solverType, threads: 1 }), expected);
    };
    try {
      await solve(2);
      model.deleteIndicatorConstraint(model.getIndicatorConstraint(constraint.id)!);
      assert(!model.hasIndicatorConstraint(constraint.id) && model.getNumIndicatorConstraints() === 0, 'Deleted constraints leave model listings');
      await solve(4);
      const replacement = model.addIndicatorConstraint({ indicator: z, impliedConstraint: new api.MathOpt.UpperBoundedExpression(api.MathOpt.asFlatLinearExpression(x), 1), name: 'replacement' });
      assert(replacement.id === constraint.id + 1 && !replacement.equals(constraint), 'Deleted IDs are not reused');
      await solve(1);
      model.deleteVariable(z);
      assert(replacement.indicator === undefined, 'Deleting an indicator variable disables its implied constraint');
      await solve(4);
      assert(implied.expression.evaluate(new Map([[x, 2]])) === 4, 'Prior implied expressions remain independent snapshots');
      model.deleteIndicatorConstraint(replacement);
      const transient = model.addIndicatorConstraint({ impliedConstraint: new api.MathOpt.UpperBoundedExpression(api.MathOpt.asFlatLinearExpression(x), 0) }); model.deleteIndicatorConstraint(transient);
      await solve(4);
      const zero = model.addVariable({ lowerBound: 0, upperBound: 0, integer: true, name: 'zero' });
      model.addIndicatorConstraint({ indicator: zero, activateOnZero: true, impliedConstraint: new api.MathOpt.UpperBoundedExpression(api.MathOpt.asFlatLinearExpression(x), 3) });
      await solve(3);
    } finally { await instance.close(); }
    results.push({ id: 'mathopt.correctness.indicator_lifecycle', solver: 'mathopt', mode, solverType, ok: true as const });
  }
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = api.MathOpt.Model('unsupported_cp_sat_indicator');
    const x = model.addVariable({ lowerBound: 0, upperBound: 4, integer: true });
    const z = model.addVariable({ lowerBound: 1, upperBound: 1, integer: true });
    model.maximize(x); model.addIndicatorConstraint({ indicator: z, terms: [{ variable: x, coefficient: 1 }], upperBound: 2 });
    for (const incremental of [false, true]) {
      const instance = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.CP_SAT, { executor }) : null;
      try {
        let rejected = false;
        try {
          if (instance) await instance.solve();
          else await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.CP_SAT });
        } catch (error) { rejected = error instanceof Error && /CP-SAT.*indicator constraints/.test(error.message); }
        assert(rejected, 'Unsupported indicator backends must retain native diagnostics');
      } finally { await instance?.close(); }
    }
    results.push({ id: 'mathopt.correctness.indicator_unsupported_backend', solver: 'mathopt', mode,
      solverType: api.MathOptSolverType.CP_SAT, ok: true as const });
  }
  return results;
}
