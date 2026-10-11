import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMpSolverParameterValidationCases(api: typeof Api) {
  const results = [];
  const cases = [
    ['GLOP', 'use_preprocessing: false', true],
    ['SAT', 'max_time_in_seconds: 1', true],
    ['PDLP', 'termination_criteria { iteration_limit: 10 }', true],
    ['SCIP', 'limits/time = 1', true],
    ['CBC', 'unsupported_parameter = 1', false],
    ['GLPK_LP', 'unsupported_parameter = 1', false],
  ] as const;
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const [backend, text, expected] of cases) {
      const solver = api.MPSolver.createSolver(backend);
      assert(solver, `${backend} is available`);
      const operation = solver.setSolverSpecificParametersAsString(text, { executor });
      assert(operation instanceof Promise && await operation === expected, `${backend} setter returns native acceptance before solving`);
      assert(solver.getSolverSpecificParametersAsString() === text, 'Native setter stores submitted text even when rejected');
      assert(await solver.setSolverSpecificParametersAsString('__unknown_parameter__: true', { executor }) === false,
        `${backend} rejects unknown parameters without solving`);
      assert(solver.getSolverSpecificParametersAsString() === '__unknown_parameter__: true', 'Rejected text remains available through the native-compatible getter');
      if (expected) assert(await solver.setSolverSpecificParametersAsString(text, { executor }), 'Validation recovers after rejection');
      results.push({ id: `mp_solver.correctness.parameter_validation.${backend.toLowerCase()}`, solver: 'mp-solver', mode, ok: true as const });
    }
    const solver = api.MPSolver.createSolver('GLOP');
    assert(solver, 'GLOP available');
    const x = solver.addNumVariable(0, 4, 'x'); solver.objective().setCoefficient(x, 3); solver.objective().setMaximization();
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL, 'Source model solves');
    assert(await solver.setSolverSpecificParametersAsString('use_preprocessing: false', { executor }), 'Valid settings accepted');
    assert(await solver.setSolverSpecificParametersAsString('unknown_field: true\0extra', { executor }) === false, 'Embedded NUL text reaches the native parser without truncation');
    assert(solver.getSolverSpecificParametersAsString() === 'unknown_field: true\0extra'
      && x.solutionValue() === 4 && solver.objective().value() === 12, 'Validation preserves model handles and the prior solution');
    assert(await solver.setSolverSpecificParametersAsString('', { executor }), 'Empty text clears supported backend parameters');
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL && x.solutionValue() === 4, 'Model solves again after clearing rejected settings');
    const controller = new AbortController(); controller.abort();
    let aborted = false;
    try { await solver.setSolverSpecificParametersAsString('use_preprocessing: false', { executor, signal: controller.signal }); }
    catch (error) { aborted = error instanceof Error && error.name === 'AbortError'; }
    assert(aborted && solver.getSolverSpecificParametersAsString() === '', 'Pre-aborted validation does not change stored settings');
    results.push({ id: 'mp_solver.correctness.parameter_validation_reuse', solver: 'mp-solver', mode, ok: true as const });
  }
  return results;
}
