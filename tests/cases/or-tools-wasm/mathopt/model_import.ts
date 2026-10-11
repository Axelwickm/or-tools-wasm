import { runMathOptRawIncrementalCases } from './raw_incremental.ts';
import { runMathOptRawSolveCases } from './raw_solve.ts';
import { runMathOptResultImportCases } from './result_import.ts';
import { runMathOptResultConversionCases } from './result_conversion.ts';
import { runMathOptObjectiveCases } from './objectives.ts';
import { runMathOptSessionOptionsCases } from './session_options.ts';
import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function runMathOptModelImportCases(api: typeof Api) {
  const results = [...await runMathOptSessionOptionsCases(api), ...await runMathOptObjectiveCases(api), ...await runMathOptResultConversionCases(api), ...await runMathOptResultImportCases(api), ...await runMathOptRawSolveCases(api), ...await runMathOptRawIncrementalCases(api)];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const source = api.MathOpt.Model('imported LP'); source.ensureNextVariableIdAtLeast(3_000_000_000);
    const x = source.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' }), y = source.addVariable({ lowerBound: 2, upperBound: 2, name: 'y' });
    const transient = source.addVariable({ name: 'deleted' }); source.deleteVariable(transient);
    source.ensureNextLinearConstraintIdAtLeast(1_000_000_000);
    const row = source.addLinearConstraint({ lowerBound: 3, upperBound: Infinity, name: 'lower', terms: [{ variable: x, coefficient: 1 }] });
    source.objective.setLinearCoefficient(x, 2); source.objective.setLinearCoefficient(y, -1); source.objective.offset = 5;
    const model = await api.MathOptModel.fromModelProto(source.encodeModelProto(), { executor });
    const importedX = model.getVariable(x.id)!, importedY = model.getVariable(y.id)!, importedRow = model.getLinearConstraint(row.id)!;
    assert(model.name === source.name && model.getNumVariables() === 2 && model.getNextVariableId() === y.id + 1
      && model.getNextLinearConstraintId() === row.id + 1 && !model.hasVariable(transient.id),
      'Import preserves sparse active IDs and reconstructs native counters from exported live elements');
    const first = model.addUpdateTracker(), second = model.addUpdateTracker();
    assert(first.exportUpdate() === null && first !== second, 'Trackers begin at independent checkpoints');
    const instance = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, { executor, threads: 1 });
    const check = async (expected: number) => {
      const incremental = await instance.solve();
      const normal = await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.GLOP, threads: 1 });
      assert(incremental.terminationReason === 'TERMINATION_REASON_OPTIMAL' && normal.terminationReason === 'TERMINATION_REASON_OPTIMAL'
        && incremental.objectiveValue === expected && normal.objectiveValue === expected, 'Imported model updates solve consistently in normal and native incremental paths');
    };
    try {
      await check(9);
      importedRow.lowerBound = 5; const update = first.exportUpdate(); assert(update && second.exportUpdate(), 'Each tracker sees bound edits');
      await check(13); first.advanceCheckpoint(); assert(first.exportUpdate() === null && second.exportUpdate(), 'Advancing one tracker leaves the other checkpoint intact');
      model.deleteVariable(importedY); assert(first.exportUpdate(), 'Dependent objective deletion is tracked'); await check(15);
      first.advanceCheckpoint(); importedRow.lowerBound = 0; model.deleteVariable(importedX);
      await check(5); model.deleteLinearConstraint(importedRow);
      assert(first.exportUpdate(), 'Variable and row deletion is tracked without referencing deleted coefficients'); await check(5);
      model.ensureNextVariableIdAtLeast(4_000_000_000);
      const added = model.addVariable({ lowerBound: 4, upperBound: 4, name: 'new' }); model.objective.setLinearCoefficient(added, 2);
      await check(13);
      const saved = first.exportUpdate()!; saved.fill(0); assert(first.exportUpdate()!.some(byte => byte !== 0), 'Exported updates are independent byte snapshots');
      model.removeUpdateTracker(first); let rejected = false; try { first.exportUpdate(); } catch { rejected = true; }
      assert(rejected, 'Removed tracker cannot be reused'); second.advanceCheckpoint(); assert(second.exportUpdate() === null, 'Live tracker remains usable after removal of another');
    } finally { await instance.close(); }
    results.push({ id: 'mathopt.correctness.model_import_trackers', solver: 'mathopt', mode, ok: true as const });

    const nonlinear = api.MathOpt.Model('imported quadratic and indicator'); nonlinear.ensureNextVariableIdAtLeast(1_000_000_000);
    const nx = nonlinear.addVariable({ lowerBound: 0, upperBound: 4, name: 'x' }), nz = nonlinear.addVariable({ lowerBound: 1, upperBound: 1, integer: true, name: 'z' });
    nonlinear.objective.isMaximize = true; nonlinear.objective.offset = 7;
    nonlinear.objective.setLinearCoefficient(nx, 1); nonlinear.objective.setQuadraticCoefficient(nz, nz, 0.25);
    nonlinear.ensureNextQuadraticConstraintIdAtLeast(2_000_000_000);
    const quadratic = nonlinear.addQuadraticConstraint({ lowerBound: -Infinity, upperBound: 9, name: 'quadratic', quadraticTerms: [{ firstVariable: nx, secondVariable: nx, coefficient: 1 }] });
    nonlinear.ensureNextIndicatorConstraintIdAtLeast(3_000_000_000);
    const indicator = nonlinear.addIndicatorConstraint({ indicator: nz, lowerBound: -Infinity, upperBound: 2, name: 'indicator', terms: [{ variable: nx, coefficient: 1 }] });
    const copy = await api.MathOptModel.fromModelProto(nonlinear.encodeModelProto(), { executor });
    assert(copy.getQuadraticConstraint(quadratic.id)?.getQuadraticCoefficient(copy.getVariable(nx.id)!, copy.getVariable(nx.id)!) === 1
      && copy.getIndicatorConstraint(indicator.id)?.indicator?.id === nz.id, 'Import restores all supported constraint families and their variable references');
    const trackers = [copy.addUpdateTracker(), copy.addUpdateTracker()];
    const nonlinearInstance = new api.MathOpt.IncrementalSolver(copy, api.MathOptSolverType.GSCIP, { executor, threads: 1 });
    try {
      const before = await nonlinearInstance.solve();
      assert(before.terminationReason === 'TERMINATION_REASON_OPTIMAL' && Math.abs(before.objectiveValue! - 9.25) < 1e-6, 'Imported quadratic/indicator model solves natively');
      copy.deleteIndicatorConstraint(copy.getIndicatorConstraint(indicator.id)!); assert(trackers[0].exportUpdate(), 'Indicator deletion appears in public updates');
      trackers[0].advanceCheckpoint(); copy.deleteQuadraticConstraint(copy.getQuadraticConstraint(quadratic.id)!);
      assert(trackers[0].exportUpdate() && trackers[1].exportUpdate(), 'Constraint-family deletions are visible from independent checkpoints');
      const after = await nonlinearInstance.solve();
      assert(after.terminationReason === 'TERMINATION_REASON_OPTIMAL' && Math.abs(after.objectiveValue! - 11.25) < 1e-6, 'Native incremental solving applies imported constraint deletions');
      const restored = await api.MathOptModel.fromModelProto(copy.encodeModelProto({ removeNames: true }), { executor });
      const result = await api.MathOpt.solve(restored, { executor, solverType: api.MathOptSolverType.GSCIP, threads: 1 });
      assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL' && Math.abs(result.objectiveValue! - 11.25) < 1e-6 && restored.name === '', 'Nameless re-export/import retains mathematical behavior');
    } finally { await nonlinearInstance.close(); }
    results.push({ id: 'mathopt.correctness.nonlinear_model_import', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
