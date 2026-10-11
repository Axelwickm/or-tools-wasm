import { runMpSolverMessageCases } from './messages.ts';
import { runMpSolverIncrementalCases } from './incremental.ts';
import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(run: () => unknown) { let rejected = false; try { run(); } catch (error) { rejected = /deleted by clear|native basis is unavailable/.test(String(error)); if (!rejected) throw error; } assert(rejected, 'Deleted handles must not alias replacement model IDs'); }
export async function runMpSolverModelReuseCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const solver = new api.MPSolver('reuse', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addNumVariable(0, 10, 'x');
    const row = solver.addConstraint(3, Infinity, 'row');
    row.setCoefficient(x, 1);
    solver.objective().setCoefficient(x, 1);
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL && x.solutionValue() === 3, 'Initial native optimum must be three');
    assert(await solver.verifySolution(1e-7, false, { executor }), 'Initial solution must be valid');
    row.setLowerBound(5);
    assert(x.solutionValue() === 0 && solver.objective().value() === 0 && !await solver.verifySolution(1e-7, false, { executor }),
      'Model changes must invalidate old solution values');
    rejects(() => x.basisStatus());
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL && x.solutionValue() === 5, 'Updated native optimum must be five');
    solver.objective().setOffset(2);
    assert(x.solutionValue() === 0 && !await solver.verifySolution(1e-7, false, { executor }), 'Objective mutation must invalidate solved state');
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL && solver.objective().value() === 7, 'Objective offset must reach next native solve');

    solver.objective().setMaximization();
    solver.objective().clear();
    assert(solver.objective().isMinimization(), 'Objective.clear must restore native minimization');
    solver.objective().setMaximization();
    solver.clear();
    assert(solver.objective().isMinimization(), 'Solver.clear must restore native minimization');
    const replacement = solver.addNumVariable(3, 3, 'replacement');
    solver.objective().setCoefficient(replacement, 1);
    for (const action of [() => x.solutionValue(), () => x.setBounds(0, 100), () => row.lowerBound(),
      () => solver.objective().setCoefficient(x, 5), () => solver.setHint([x], [1])]) rejects(action);
    let changed = false, rejected = false;
    try {
      await solver.solve({ executor, onEvent: event => {
        if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !changed) {
          changed = true;
          const added = solver.addNumVariable(4, 4, 'added_during_solve');
          solver.objective().setCoefficient(added, 1);
        }
      } });
    } catch (error) { rejected = /modified during solve/.test(String(error)); if (!rejected) throw error; }
    assert(changed && rejected && replacement.solutionValue() === 0 && !await solver.verifySolution(1e-7, false, { executor }),
      'Asynchronous model changes must discard stale responses instead of inventing zero coordinates');
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL && solver.objective().value() === 7,
      'Concurrent model mutations must be preserved for the next solve');
    const model = new api.MpModel('snapshot');
    const snapshotX = model.addNumVariable(3, 3, 'x');
    model.objective().setCoefficient(snapshotX, 1);
    const original = await api.MPSolver.solve(model, { executor });
    snapshotX.setBounds(5, 5);
    const updated = await api.MPSolver.solve(model, { executor });
    assert(original.value(snapshotX) === 3 && original.objectiveValue === 3 && updated.value(snapshotX) === 5,
      'Independent result snapshots must survive subsequent model changes');
    results.push({ id: 'mp_solver.correctness.model_reuse', solver: 'mp-solver', mode, ok: true as const });
  }
  results.push(...await runMpSolverIncrementalCases(api));
  results.push(...await runMpSolverMessageCases(api));
  return results;
}
