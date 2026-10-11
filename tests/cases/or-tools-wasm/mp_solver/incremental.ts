import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates, type SharedCaseMetadata, type ExecutorFixtureMode } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown, pattern: RegExp) {
  try { await run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
  throw new Error(`Expected rejection matching ${pattern}`);
}

// Native session contracts: Python tests do not assert retained backend state.
// Reference: MPSolver::{Solve,Reset,NextSolution} and native model setters.
export async function runMpSolverIncrementalCases(api: typeof Api) {
  const results: Array<SharedCaseMetadata & { mode: ExecutorFixtureMode; ok: true }> = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const record = (id: string) => results.push({ id: `mp_solver.incremental.${id}`, name: `Native incremental MPSolver: ${id}`,
      solver: 'mp-solver', mode, source: 'ortools/linear_solver/linear_solver.cc', tags: ['native-contract'], ok: true });
    const model = new api.MPSolver('retained LP', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = model.addNumVariable(0, 10, 'x');
    const free = model.addConstraint(-Infinity, Infinity, 'free'); free.setCoefficient(x, 1);
    const row = model.addConstraint(3, Infinity, 'row'); row.setCoefficient(x, 1);
    model.objective().setCoefficient(x, 1);
    const parameters = new api.MPSolverParameters(); parameters.setIntegerParam(api.IntegerParam.INCREMENTALITY, api.IncrementalityValues.INCREMENTALITY_ON);
    const session = new api.MPSolver.IncrementalSolver(model, { executor, parameters });
    try {
      // Edits made while eager creation is pending must not be lost.
      row.setLowerBound(4);
      assert(await session.solve() === api.MPSolver.OPTIMAL && x.solutionValue() === 4, 'Native edits made during creation are applied');
      free.setBounds(4.5, Infinity);
      assert(await session.solve() === api.MPSolver.OPTIMAL && x.solutionValue() === 4.5,
        'Initial free rows preserve their indices for later bounds edits');
      free.setBounds(-Infinity, Infinity);
      row.setLowerBound(5); x.setUpperBound(7); model.objective().setOffset(2);
      const response = await session.solveWithProto();
      assert(response.response.objectiveValue === 7 && model.objective().value() === 7 && x.solutionValue() === 5, 'Bounds and objective edits reach retained solver');
      assert(response.metadata?.solverVersion.includes('Glop') && response.metadata.variableBasisStatus.length === 1, 'Native counters/basis returned');
      assert(await model.verifySolution(1e-7, false, { executor }), 'Retained native result passes native verification');
      model.setHint([x], [5]);
      assert(x.solutionValue() === 5, 'SetHint preserves the existing solution like native MPSolver');
      assert(!await session.nextSolution(), 'LP backend follows native false enumeration behavior');
      await session.reset(); assert(model.objective().value() === 0, 'Native Reset invalidates cached solution');
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 7, 'Native Reset preserves model');
      const y = model.addNumVariable(2, 2, 'y'); row.setCoefficient(y, 1); model.objective().setCoefficient(y, 3);
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 11, 'Appending variables and coefficients preserves index mapping');
      row.setCoefficient(x, 0); row.setBounds(2, 2); row.setIsLazy(false);
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 8, 'Coefficient removal and row bounds forwarded');
      row.clear(); row.setBounds(-Infinity, Infinity); x.setLowerBound(1); x.setInteger(true); x.setBranchingPriority(2);
      model.objective().clear(); model.objective().setCoefficient(x, 2); model.objective().addOffset(1); model.objective().setMaximization();
      model.setHint([x, y], [7, 2]);
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 15, 'Every native mutation family forwards');
      model.clear();
      const replacement = model.addNumVariable(3, 3, 'replacement'); model.objective().setCoefficient(replacement, 4);
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 12, 'Clear and ordered recreation use same native session');
      await rejects(() => x.solutionValue(), /deleted by clear/);
      record('ordered_edits');
      let changed = false;
      await rejects(() => session.solve({ onEvent: event => {
        if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !changed) {
          changed = true; replacement.setBounds(2, 2);
        }
      } }), /modified during solve/);
      assert(changed && await session.solve() === api.MPSolver.OPTIMAL && replacement.solutionValue() === 2, 'Stale response discarded while native edits stay acknowledged');
      const controller = new AbortController(); controller.abort();
      replacement.setBounds(1, 1);
      await rejects(() => session.solve({ signal: controller.signal }), /AbortError/);
      assert(await session.solve() === api.MPSolver.OPTIMAL && model.objective().value() === 4, 'Pre-abort retains queued edits');
      const failure = new Error('incremental observer failure'); let caught: unknown;
      try { await session.solve({ onEvent: () => { throw failure; } }); } catch (error) { caught = error; }
      assert(caught === failure, 'Original observer failure retained');
      // If native execution was cancelled before dispatch, failure safely retires
      // the session. If it produced a reply, it remains reusable.
      record('snapshot_abort');
    } finally { await session.close(); await session.close(); }
    await rejects(() => session.solve(), /closed/);

    const lifeModel = new api.MPSolver('lifecycle', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    lifeModel.addNumVariable(0, 1, 'x');
    const life = new api.MPSolverIncrementalSolver(lifeModel, { executor });
    try {
      await life.solve();
      const running = life.solve({ onEvent: async () => { await rejects(() => life.close(), /callbacks/); } });
      await rejects(() => life.solve(), /in progress/);
      await rejects(() => lifeModel.solve({ executor }), /in progress/);
      const closed = life.close(); await running; await closed;
      record('lifecycle');
    } finally { await life.close(); }

    // All built backends retain native objects, even if their native Solve
    // implementation chooses to rebuild its backend between calls.
    for (const backend of ['CLP', 'SCIP', 'CBC', 'SAT', 'BOP', 'PDLP', 'KNAPSACK', 'GLPK_LP', 'GLPK']) {
      const solver = api.MPSolver.createSolver(backend); assert(solver, `${backend} available`);
      const upper = backend === 'KNAPSACK' ? 1 : 4;
      const variable = solver.isMip() ? solver.addIntVariable(0, upper, 'x') : solver.addNumVariable(0, upper, 'x');
      solver.addConstraint(-Infinity, upper, 'capacity').setCoefficient(variable, 1);
      solver.objective().setCoefficient(variable, 3); solver.objective().setMaximization();
      const retained = new api.MPSolver.IncrementalSolver(solver, { executor });
      try {
        if (mode === 'server' && backend.startsWith('GLPK')) {
          await rejects(() => retained.solve(), /GLPK persistent server sessions/);
        } else {
          assert(await retained.solve() === api.MPSolver.OPTIMAL && solver.objective().value() === upper * 3, `${backend} retained initial optimum`);
          const updatedUpper = backend === 'KNAPSACK' ? 0 : 2;
          variable.setUpperBound(updatedUpper);
          assert(await retained.solve() === api.MPSolver.OPTIMAL && solver.objective().value() === updatedUpper * 3, `${backend} retained updated optimum`);
          await retained.reset();
          assert(await retained.solve() === api.MPSolver.OPTIMAL, `${backend} native Reset preserves model`);
        }
      } finally { await retained.close(); }
    }
    record('backends');

    // SCIP stores its actual solution pool. Compare availability/values with
    // repeated native calls rather than inventing a pool in TypeScript.
    const poolModel = api.MPSolver.createSolver('SCIP'); assert(poolModel, 'SCIP available');
    const p = poolModel.addIntVariable(0, 10, 'p'); poolModel.objective().setCoefficient(p, 1); poolModel.objective().setMaximization();
    const pool = new api.MPSolver.IncrementalSolver(poolModel, { executor });
    try {
      let poolMessages = 0;
      assert(await pool.solve({ messageCallback: messages => { poolMessages += messages.length; } }) === api.MPSolver.OPTIMAL &&
        p.solutionValue() === 10 && poolMessages > 0, 'SCIP streaming preserves retained optimum and solution pool');
      let count = 0;
      while (await pool.nextSolution()) {
        assert(p.solutionValue() >= 0 && p.solutionValue() <= 10, 'Native pool solution has valid coordinates');
        assert(++count < 100, 'Native solution pool terminates');
      }
      assert(count > 0, 'SCIP actual native solution pool is exposed');
      p.setBounds(5, 5);
      assert(!await pool.nextSolution(), 'Model edits invalidate native solution pool');
      assert(await pool.solve() === api.MPSolver.OPTIMAL && p.solutionValue() === 5, 'Solve after pool iteration uses edits');
      record('solution_pool');
    } finally { await pool.close(); }
  }
  return results;
}
