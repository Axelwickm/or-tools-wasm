import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMpSolverModelQueryCases(api: typeof Api) {
  const results = [];
  let referenceLp: string | undefined, referenceMps: string | undefined;
  for (const mode of executorFixtureModes) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const solver = new api.MPSolver('native_export', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addIntVariable(-2, 4, 'x special'), y = solver.addNumVariable(0, Infinity, 'y');
    const duplicate = solver.addNumVariable(-Infinity, 0, 'y'); solver.addNumVariable(7, 7, 'unused');
    const range = solver.addConstraint(1, 7, 'range'); range.setCoefficient(x, 2); range.setCoefficient(y, 1);
    solver.addConstraint(-Infinity, 4, 'limit').setCoefficient(y, 1);
    solver.addConstraint(-3, Infinity, 'limit').setCoefficient(duplicate, 1);
    solver.objective().setCoefficient(x, 3); solver.objective().setCoefficient(y, 2);
    solver.objective().setCoefficient(duplicate, 1); solver.objective().setOffset(5); solver.objective().setMaximization();
    const exporting = solver.exportModelAsLpFormat(false, options);
    assert(exporting instanceof Promise, 'Native export follows the awaitable API convention');
    const lp = await exporting, mps = await solver.exportModelAsMpsFormat(false, false, options);
    assert(lp.includes('Maximize') && lp.includes('range') && mps.includes('native_export') && mps.includes('INTORG'), 'Native exports include objective, names and integrality');
    if (referenceLp === undefined) { referenceLp = lp; referenceMps = mps; }
    else assert(lp === referenceLp && mps === referenceMps, 'All executors return identical native formatting');
    assert(await solver.exportModelAsMpsFormat(true, false, options) === mps, 'Native MPS ignores the fixed-format setting');
    const obfuscatedLp = await solver.exportModelAsLpFormat(true, options);
    const obfuscatedMps = await solver.exportModelAsMpsFormat(false, true, options);
    assert(obfuscatedLp !== lp && obfuscatedMps !== mps && !obfuscatedLp.includes('range'), 'Native obfuscation reaches both exporters');
    const snapshot = solver.exportModelAsLpFormat(false, options); solver.clear();
    assert(await snapshot === lp, 'Export captures the submitted model before asynchronous schema/dispatch work');
    const empty = await solver.exportModelAsLpFormat(false, options);
    assert(empty !== lp, 'Later exports reflect the edited model');
    results.push({ id: 'mp_solver.native.model_text_export', solver: 'mp-solver', mode, ok: true as const });

    const activities = new api.MPSolver('activities', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const value = activities.addNumVariable(-10, 10, 'value');
    activities.addConstraint(-Infinity, Infinity, 'first').setCoefficient(value, 3);
    activities.addConstraint(-Infinity, Infinity, 'second').setCoefficient(value, -2);
    assert((await activities.computeConstraintActivities(options)).length === 0, 'Unsolved models have no native activities');
    assert(await activities.loadSolutionFromProto({ status: 0, variableValue: [2], objectiveValue: 0 }, Infinity, options), 'Candidate solution loads without optimization');
    const querying = activities.computeConstraintActivities(options); activities.clear();
    assert(JSON.stringify(await querying) === '[6,-4]', 'Native activities use captured model/solution and retain row order');
    assert((await activities.computeConstraintActivities(options)).length === 0, 'Activities do not install a stale result after model edits');
    const solved = new api.MPSolver('solved_activities', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const z = solved.addNumVariable(0, 10, 'z');
    solved.addConstraint(-Infinity, Infinity, 'free').setCoefficient(z, 3);
    const upper = solved.addConstraint(-Infinity, 4, 'upper'); upper.setCoefficient(z, 2);
    solved.objective().setCoefficient(z, 1); solved.objective().setMaximization();
    assert(await solved.solve(options) === api.MPSolver.OPTIMAL && JSON.stringify(await solved.computeConstraintActivities(options)) === '[6,4]',
      'Native activity query uses the solved snapshot without changing the answer');
    const basis = z.basisStatus();
    const constructed = await solved.solveWithProto(options);
    assert(Array.isArray(constructed.response.dualValue) && constructed.response.dualValue.length === 2 && constructed.metadata?.constraintBasisStatus.length === 2,
      'Editable solves retain free rows in native dual and basis results');
    assert(z.basisStatus() === basis && await solved.verifySolution(1e-7, false, options), 'Proto solves retain the same native metadata and verification preserves free rows');
    const imported = await api.MPSolver.solveModelRequest(await solved.exportModelRequestProto(options),
      { ...options, parameters: new api.MPSolverParameters() });
    assert(Array.isArray(imported.response.dualValue) && imported.response.dualValue.length === 1 && imported.metadata?.constraintBasisStatus.length === 1,
      'Explicit raw proto solves retain native import normalization');
    assert(z.solutionValue() === 2, 'Diagnostic queries preserve solution access');
    const importing = new api.MPSolver('solution_import', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const v = importing.addNumVariable(0, 1, 'v'); importing.addConstraint(-Infinity, Infinity, 'free').setCoefficient(v, 1);
    const valid = { status: 0, variableValue: [0.5], objectiveValue: 2 };
    assert(await importing.loadSolutionFromProto(valid, 1e-7, options), 'Native loader accepts a matching candidate');
    for (const invalid of [
      { ...valid, dualValue: [1, 2] }, { ...valid, reducedCost: [1, 2] },
      { ...valid, variableValue: [] }, { ...valid, variableValue: [2] }, { ...valid, variableValue: [NaN] }, { ...valid, status: 2 },
    ]) {
      assert(!await importing.loadSolutionFromProto(invalid, 1e-7, options) && v.solutionValue() === 0.5,
        'Native rejection cannot partially replace the previous answer');
    }
    assert(await importing.loadSolutionFromProto({ ...valid, variableValue: [2] }, Infinity, options), 'Native infinite tolerance permits relaxed candidates');
    assert(await importing.loadSolutionFromProto({ ...valid, dualValue: [3], reducedCost: [4] }, 1e-7, options)
      && importing.constraint(0).dualValue() === 3 && v.reducedCost() === 4, 'Free-row duals and reduced costs round-trip through native loading');
    const mip = new api.MPSolver('unrounded import', api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING);
    const integer = mip.addIntVariable(-2, 2, 'integer');
    const candidate = { status: 0, variableValue: [-0.5] };
    const loading = mip.loadSolutionFromProto(candidate, Infinity, options);
    candidate.variableValue[0] = 99;
    assert(await loading && integer.solutionValue() === -1 && integer.unroundedSolutionValue() === -0.5,
      'Native integer rounding and unrounded imported coordinates remain distinct owned values');
    results.push({ id: 'mp_solver.native.constraint_activities', solver: 'mp-solver', mode, ok: true as const });
    const editable = new api.MpModel('result_first');
    const answerVar = editable.addNumVariable(0, 4, 'answer');
    const cap = editable.addConstraint(0, 3, 'cap'); cap.setCoefficient(answerVar, 1);
    editable.objective().setCoefficient(answerVar, 2); editable.objective().setMaximization();
    const answer = await api.MPSolver.solve(editable, options);
    assert(answer.value(answerVar) === 3 && answer.objectiveValue === 6 && answer.solverVersion?.includes('Glop')
      && typeof answer.iterations === 'bigint' && answer.basisStatus(answerVar) === api.MPSolver.BASIC,
      'Result objects carry native values, exact counters and basis metadata');
    const metadata = answer.nativeMetadata!; metadata.variableBasisStatus.fill(0);
    const response = answer.response; (response.variableValue as number[]).fill(99);
    assert(answer.value(answerVar) === 3 && answer.basisStatus(answerVar) === api.MPSolver.BASIC, 'Returned data does not mutate the captured answer');
    const session = editable.incremental(options);
    try {
      const first = await session.solve();
      answerVar.setUpperBound(1);
      const second = await session.solve();
      assert(first.value(answerVar) === 3 && second.value(answerVar) === 1 && answer.value(answerVar) === 3,
        'Native incremental model updates return independent result objects');
      assert(answerVar.solutionValue() === 0, 'Result-first models do not accumulate a last-solution cache');
      const controller = new AbortController(); controller.abort();
      try { await session.solve({ signal: controller.signal }); throw new Error('Expected pre-aborted rejection'); }
      catch (error) { assert(error instanceof Error && error.name === 'AbortError', 'Pre-aborted requests preserve the cancellation contract'); }
      await session.reset();
      assert((await session.solve()).value(answerVar) === 1, 'Pre-abort and native reset preserve session reuse');
    } finally { await session.close(); }
    results.push({ id: 'mp_solver.native.result_snapshots', solver: 'mp-solver', mode, ok: true as const });
  }
  return results;
}
