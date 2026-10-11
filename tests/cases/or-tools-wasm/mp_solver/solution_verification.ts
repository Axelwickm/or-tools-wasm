import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, type SharedCaseMetadata, type ExecutorFixtureMode } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Native contract extensions beyond lp_test.py's valid-solution assertion.
// Reference: MPSolver::LoadSolutionFromProto / VerifySolution in linear_solver.cc.
export async function runMpSolverSolutionVerificationCases(api: typeof Api) {
  const results: Array<SharedCaseMetadata & { mode: ExecutorFixtureMode; ok: true }> = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const options = { executor };
    const record = (id: string) => results.push({ id: `mp_solver.correctness.verification.${id}`, name: `Native solution verification: ${id}`, solver: 'mp-solver', mode,
      source: 'ortools/linear_solver/linear_solver.cc', tags: ['native-contract'], ok: true as const });
    for (const backend of ['GLOP', 'CLP', 'GLPK_LP', 'PDLP', 'SCIP', 'CBC', 'GLPK', 'SAT', 'BOP', 'KNAPSACK']) {
      const solver = api.MPSolver.createSolver(backend);
      assert(solver, `${backend} is available`);
      const x = solver.isMip() ? solver.addIntVariable(0, 1, 'x') : solver.addNumVariable(0, 1, 'x');
      solver.objective().setCoefficient(x, 3);
      assert(!await solver.verifySolution(0, false, options), 'Unsolved models have no solution to verify');
      assert(await solver.loadSolutionFromProto({ status: api.MPSolver.OPTIMAL, variableValue: [1], objectiveValue: 3 }, Infinity, options), 'Load valid snapshot');
      const verification = solver.verifySolution(0, true, options);
      assert(verification instanceof Promise && await verification, `${backend} verifies without solving`);
      assert(await solver.loadSolutionFromProto({ status: api.MPSolver.FEASIBLE, variableValue: [1], objectiveValue: 4 }, Infinity, options), 'Load inaccurate objective');
      assert(!await solver.verifySolution(0, false, options), `${backend} returns native false for objective mismatch`);
      assert(await solver.verifySolution(-1, false, options), 'Negative tolerance follows native unlimited-tolerance semantics');
      assert(x.solutionValue() === 1 && solver.objective().value() === 4, 'Verification preserves the loaded snapshot');
      record(backend.toLowerCase());
    }
    const solver = new api.MPSolver('bounds and rows', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addNumVariable(0, 1, 'x');
    const row = solver.addConstraint(0, 0.5, 'row'); row.setCoefficient(x, 1);
    solver.addConstraint('free row');
    for (const value of [2, 0.75]) {
      assert(await solver.loadSolutionFromProto({ status: api.MPSolver.FEASIBLE, variableValue: [value], objectiveValue: 0 }, Infinity, options), 'Load invalid candidate');
      assert(!await solver.verifySolution(0, false, options), 'Native verification detects bound/row violations');
      assert(await solver.verifySolution(2, false, options), 'Native verification receives the requested tolerance');
    }
    assert(await solver.loadSolutionFromProto({ status: api.MPSolver.OPTIMAL, variableValue: [0.25], objectiveValue: 0 }, Infinity, options), 'Load valid candidate');
    const pending = solver.verifySolution(0, false, options);
    row.setUpperBound(0);
    assert(await pending, 'Verification snapshots model and solution before awaiting');
    assert(!await solver.verifySolution(0, false, options), 'Mutation invalidates the current solution');
    row.setUpperBound(0.5);
    assert(await solver.solve(options) === api.MPSolver.OPTIMAL, 'Model solves after verification');
    const basis = x.basisStatus();
    const controller = new AbortController(); controller.abort();
    let aborted = false;
    try { await solver.verifySolution(0, false, { ...options, signal: controller.signal }); }
    catch (error) { aborted = error instanceof Error && error.name === 'AbortError'; if (!aborted) throw error; }
    assert(aborted && await solver.verifySolution(1e-7, false, options) && x.basisStatus() === basis, 'Cancellation/recovery preserves solved metadata and basis');
    record('bounds_snapshot');

    const accurate = new api.MPSolver('accurate sums', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const values = [1e16, 1, 1, 1, 1];
    const expected = 1e16 + 4;
    const total = accurate.addConstraint(expected, expected, 'accurate row');
    for (let index = 0; index < values.length; index++) {
      const variable = accurate.addNumVariable(-Infinity, Infinity, `x${index}`);
      accurate.objective().setCoefficient(variable, 1); total.setCoefficient(variable, 1);
    }
    assert(await accurate.loadSolutionFromProto({ status: api.MPSolver.FEASIBLE, variableValue: values, objectiveValue: expected }, Infinity, options), 'Load mixed-scale candidate');
    assert(await accurate.verifySolution(0, false, options), 'Native accurate sums preserve the small terms lost by ordinary JavaScript summation');
    const relaxed = new api.MPSolver('LP relaxation', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    relaxed.addIntVariable(0, 1, 'integer in continuous backend');
    assert(await relaxed.loadSolutionFromProto({ status: api.MPSolver.FEASIBLE, variableValue: [0.5], objectiveValue: 0 }, Infinity, options), 'Load fractional LP relaxation');
    assert(await relaxed.verifySolution(0, false, options), 'Native continuous backends skip integrality checks');
    record('native_numerics');
  }
  return results;
}
