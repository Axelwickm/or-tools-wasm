import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export const mpCapabilityCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mpsolver.inspection.callback_capabilities', name: 'MPSolver reports native search and message callback support independently', solver: 'mp-solver',
  source: 'ortools/linear_solver/linear_solver.h:SupportsCallbacks/SupportsMessageCallbacks', tags: ['native-contract', 'gap-regression'],
  async run({ mp: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    // Expectations follow each native interface's overrides; the library has no capability table.
    for (const [id, search, messages] of [['GLOP', false, true], ['SCIP', true, true], ['SAT', false, true],
      ['BOP', false, false], ['KNAPSACK', false, false], ['PDLP', false, true], ['GLPK_LP', false, true],
      ['GLPK', false, true], ['CLP', false, true], ['CBC', false, true]] as const) {
      const solver = api.MPSolver.createSolver(id);
      if (!solver) continue; // Query only backends compiled into this build.
      assert(await solver.supportsCallbacks(options) === search, `${id} native search capability`);
      assert(await solver.supportsMessageCallbacks(options) === messages, `${id} native message capability`);
      assert(solver.numVariables() === 0 && solver.numConstraints() === 0, 'Capability queries do not edit the model');
    }
    const solver = api.MPSolver.createSolver('SCIP');
    assert(solver, 'SCIP is available in the bundled runtime');
    solver.setNumThreads(1);
    const x = solver.addIntVariable(0, 1, 'x'); solver.objective().setCoefficient(x, 1); solver.objective().setMaximization();
    assert(await solver.solve(options) === api.MPSolver.OPTIMAL && x.solutionValue() === 1, 'Solver remains usable after inspection');
    const abort = new AbortController(); abort.abort();
    let cancelled = false;
    try { await solver.supportsCallbacks({ ...options, signal: abort.signal }); } catch (error) { cancelled = error instanceof Error; }
    assert(cancelled && await solver.supportsCallbacks(options), 'Cancellation rejects and a subsequent query recovers');
    assert(x.solutionValue() === 1 && solver.numVariables() === 1, 'Queries preserve the existing result and variables');
    return {};
  },
}];
