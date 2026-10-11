import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown, pattern: RegExp) {
  try { await run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
  throw new Error(`Expected native rejection matching ${pattern}`);
}

export async function runMathOptObjectiveCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode, options = { executor, threads: 1 };
    // TEMP: parity — ModelAuxObjTest's three expression constructors.
    for (const kind of ['expr', 'maximize', 'minimize'] as const) {
      const mod = api.MathOpt.Model(), variable = mod.addVariable();
      const expr = api.MathOpt.asFlatLinearExpression(variable).multiply(3).add(4);
      const objective = kind === 'expr' ? mod.addAuxiliaryObjective({ priority: 10, expression: expr, name: 'aux' })
        : kind === 'maximize' ? mod.addMaximizationObjective(expr, { priority: 10, name: 'aux' })
        : mod.addMinimizationObjective(expr, { priority: 10, name: 'aux' });
      const terms = objective.linearTerms();
      assert(objective.offset === 4 && terms.length === 1 && terms[0].variable.equals(variable)
        && terms[0].coefficient === 3 && objective.isMaximize === (kind === 'maximize')
        && objective.priority === 10n && objective.name === 'aux', 'Upstream auxiliary expression constructor assertions');
      results.push({ id: `mathopt.python.ModelAuxObjTest.test_add_aux_obj_with_${kind}`, solver: 'mathopt', mode,
        source: 'ortools/math_opt/python/model_objective_test.py', tags: ['python-parity'], ok: true as const });
    }
    // TEMP: parity — AuxiliaryObjectiveTest's general expression errors.
    for (const [method, name] of [['add', 'test_add_is_error_if_quad'], ['setToExpression', 'test_set_to_expression_error_when_quadratic']] as const) {
      const mod = api.MathOpt.Model(), objective = mod.addAuxiliaryObjective({ priority: 1 }), variable = mod.addVariable();
      const quadratic = new api.MathOpt.QuadraticExpression([], [{ firstVariable: variable, secondVariable: variable, coefficient: 1 }]);
      await rejects(() => objective[method](quadratic), /Quadratic/);
      results.push({ id: `mathopt.python.AuxiliaryObjectiveTest.${name}`, solver: 'mathopt', mode,
        source: 'ortools/math_opt/python/objectives_test.py', tags: ['python-parity'], ok: true as const });
    }
    const source = api.MathOpt.Model('objectives', { primaryObjectiveName: 'profit' });
    const x = source.addVariable({ lowerBound: 0, upperBound: 4, name: 'x' });
    source.objective.isMaximize = true; source.objective.setLinearCoefficient(x, 2);
    source.ensureNextAuxiliaryObjectiveIdAtLeast(3_000_000_000);
    const aux = source.addMinimizationObjective(api.MathOpt.asFlatLinearExpression(x).add(7),
      { priority: 9223372036854775807n, name: 'cost' });
    const input = source.encodeModelProto(), importing = api.MathOptModel.fromModelProto(input, options);
    input.fill(0); aux.offset = 99;
    const model = await importing, importedAux = model.getAuxiliaryObjective(aux.id)!;
    assert(importedAux.offset === 7 && importedAux.priority === 9223372036854775807n && importedAux.name === 'cost'
      && importedAux.getLinearCoefficient(model.getVariable(x.id)!) === 1, 'Native validation/import preserves captured objective data and exact priority');
    assert(model.objective.name === 'profit' && model.objective.isMaximize && model.objective.priority === 0n,
      'Primary objective metadata survives native validated import');
    const nameless = await api.MathOptModel.fromModelProto(model.encodeModelProto({ removeNames: true }), options);
    assert(nameless.objective.name === '' && nameless.getAuxiliaryObjective(aux.id)?.name === '', 'Name removal covers all objectives');
    const tracker = model.addUpdateTracker(); assert(tracker.exportUpdate() === null, 'Unchanged objective model has no update');
    importedAux.clear();
    const clearedAux = model.getAuxiliaryObjective(aux.id)!;
    assert(clearedAux.offset === 0 && !clearedAux.isMaximize && clearedAux.priority === 9223372036854775807n,
      'Auxiliary clear preserves direction and priority');
    assert(tracker.exportUpdate(), 'Objective coefficients and offsets are tracked');
    tracker.advanceCheckpoint(); model.deleteAuxiliaryObjective(importedAux);
    const next = model.addAuxiliaryObjective({ priority: 1 });
    assert(next.id === aux.id + 1 && tracker.exportUpdate(), 'Auxiliary deletion/addition retains monotonically increasing IDs');
    results.push({ id: 'mathopt.objectives.model_transport', solver: 'mathopt', mode, ok: true as const });

    const lp = api.MathOpt.Model('objective updates');
    const first = lp.addVariable({ lowerBound: 0, upperBound: 3, name: 'first' }), second = lp.addVariable({ lowerBound: 0, upperBound: 3, name: 'second' });
    lp.addLinearConstraint({ upperBound: 3, expression: first, name: 'first' });
    lp.objective.isMaximize = true; lp.objective.setLinearCoefficient(first, 2); lp.objective.setLinearCoefficient(second, 1);
    const retained = new api.MathOpt.IncrementalSolver(lp, api.MathOptSolverType.GLOP, options);
    const check = async (expected: number) => {
      const incremental = await retained.solve(), normal = await api.MathOpt.solve(lp, options);
      assert(incremental.objectiveValue === expected && normal.objectiveValue === expected,
        'Normal and native incremental objective mutations agree');
    };
    try {
      await check(9);
      const aborted = new AbortController(); aborted.abort();
      await rejects(() => retained.solve({ signal: aborted.signal }), /AbortError/);
      await check(9);
      lp.objective.setLinearCoefficient(first, 0); await check(3);
      lp.objective.clear(); assert(lp.objective.isMaximize, 'Primary clear preserves native direction'); await check(0);
      lp.objective.priority = 9223372036854775807n;
      lp.objective.setToLinearExpression(api.MathOpt.asFlatLinearExpression(second).multiply(-1)); await check(0);
      lp.addAuxiliaryObjective({ priority: 1, expression: first });
      await rejects(() => retained.solve(), /multiple objective/i);
    } finally { await retained.close(); }
    results.push({ id: 'mathopt.objectives.native_updates', solver: 'mathopt', mode, ok: true as const });

    const primaryOnly = api.MathOpt.Model('parameters'); primaryOnly.addVariable({ lowerBound: 0, upperBound: 1 });
    const parameters = new api.MathOptModelSolveParameters({ objectiveParameters: new Map([
      [primaryOnly.objective, new api.MathOptObjectiveParameters({ objectiveDegradationAbsoluteTolerance: 0.1, timeLimitSeconds: 1.25 })],
    ]) });
    for (const solverType of [api.MathOptSolverType.GLOP, api.MathOptSolverType.GLPK, api.MathOptSolverType.GSCIP,
      api.MathOptSolverType.CP_SAT, api.MathOptSolverType.PDLP]) {
      await rejects(() => api.MathOpt.solve(source, { ...options, solverType }), /multiple objective/i);
      const instance = new api.MathOpt.IncrementalSolver(source, solverType, options);
      try { await rejects(() => instance.solve(), mode === 'server' && solverType === api.MathOptSolverType.GLPK
        ? /GLPK.*same execution thread.*not supported/ : /multiple objective/i); } finally { await instance.close(); }
      await rejects(() => api.MathOpt.solve(primaryOnly, { ...options, solverType, modelParameters: parameters }), /primary_objective_parameters/);
    }
    results.push({ id: 'mathopt.objectives.backend_support', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
