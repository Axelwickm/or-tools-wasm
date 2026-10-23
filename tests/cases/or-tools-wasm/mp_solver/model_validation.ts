import { runMpSolverParameterValidationCases } from './parameter_validation.ts';
import { runMpSolverSolutionVerificationCases } from './solution_verification.ts';
import { runMpSolverNumericalCases } from './numerical.ts';
import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMpSolverModelValidationCases(api: typeof Api) {
  const results = [...await runMpSolverParameterValidationCases(api), ...await runMpSolverSolutionVerificationCases(api),
    ...await runMpSolverNumericalCases(api)];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const model of [{}, new Uint8Array(),
      { variable: [{ name: 'duplicate' }, { name: 'duplicate' }] },
      { variable: [{}], quadraticObjective: { qvar1Index: [0], qvar2Index: [0], coefficient: [1] } },
      { variable: [{ lower_bound: 0, upper_bound: 1, is_integer: true }], general_constraint: [
        { indicator_constraint: { var_index: 0, var_value: 1, constraint: { var_index: [0], coefficient: [1], upper_bound: 1 } } }] }]) {
      assert(await api.findErrorInModelProto(model as Api.MPSolverModelProto | Uint8Array, { executor }) === '', 'Valid models return an empty native diagnostic, independently of import/backend support');
    }
    const solver = new api.MPSolver('unchanged', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addNumVariable(0, 4, 'x'); solver.objective().setCoefficient(x, 3); solver.objective().setMaximization();
    assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL, 'Source model solves');
    const bytes = await solver.exportModelProto({ executor });
    assert(await api.MPSolver.findErrorInModelProto(bytes, { executor }) === '', 'Exported model bytes validate through static convenience');
    const object = { variable: [{ lowerBound: 0, upperBound: 1 }] };
    const objectValidation = api.findErrorInModelProto(object, { executor });
    object.variable[0].lowerBound = 2;
    assert(await objectValidation === '', 'Validation snapshots caller objects before awaiting');
    const copiedBytes = await solver.exportModelProto({ executor });
    const byteValidation = api.findErrorInModelProto(copiedBytes, { executor });
    copiedBytes.fill(0xff);
    assert(await byteValidation === '', 'Validation snapshots caller bytes before awaiting');
    results.push({ id: 'mp_solver.contract.standalone_model_validation', solver: 'mp-solver', mode, ok: true as const });

    for (const model of [new Uint8Array([0xff]),
      { variable: [{ lowerBound: 2, upperBound: 1 }] },
      { variable: [{ lowerBound: 0.1, upperBound: 0.9, isInteger: true }] },
      { variable: [{ objectiveCoefficient: NaN }] },
      { variable: [{ objectiveCoefficient: Infinity }] },
      { variable: [{}], constraint: [{ varIndex: [1], coefficient: [1] }] },
      { variable: [{}], constraint: [{ varIndex: [-1], coefficient: [1] }] },
      { variable: [{}], constraint: [{ varIndex: [0, 0], coefficient: [1, 2] }] },
      { variable: [{}], constraint: [{ varIndex: [0], coefficient: [] }] },
      { variable: [{}], constraint: [{ varIndex: [0], coefficient: [NaN] }] },
      { variable: [{}], solutionHint: { varIndex: [1], varValue: [0] } },
      { variable: [{}], solutionHint: { varIndex: [0, 0], varValue: [0, 0] } },
      { variable: [{}], solutionHint: { varIndex: [0], varValue: [] } },
      { variable: [{}], solutionHint: { varIndex: [0], varValue: [NaN] } },
      { variable: [{}], quadraticObjective: { qvar1Index: [0], qvar2Index: [1], coefficient: [1] } },
      { variable: [{}], generalConstraint: [{ indicatorConstraint: { varIndex: 1, varValue: 1 } }] }]) {
      assert((await api.findErrorInModelProto(model, { executor })).length > 0, 'Malformed or trivially infeasible models return a diagnostic');
    }
    assert(await api.findErrorInModelProto(bytes, { executor }) === '' && x.solutionValue() === 4
      && solver.objective().value() === 12 && await solver.verifySolution(1e-7, false, { executor }), 'Validation recovers after errors and preserves existing handles/solutions');
    results.push({ id: 'mp_solver.correctness.model_validation_diagnostics', solver: 'mp-solver', mode, ok: true as const });
  }
  return results;
}
