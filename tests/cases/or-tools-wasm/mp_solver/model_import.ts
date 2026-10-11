import { runMpSolverModelQueryCases } from './model_queries.ts';
import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => void) { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Replaced model handles must be invalid'); }
export async function runMpSolverModelImportCases(api: typeof Api) {
  const results = [...await runMpSolverModelQueryCases(api)];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const source = new api.MPSolver('source', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = source.addNumVariable(0, 10, 'x'), y = source.addNumVariable(2, 2, 'y'); x.setBranchingPriority(7);
    const row = source.addConstraint(3, Infinity, 'lower'); row.setCoefficient(x, 1); row.setIsLazy(true);
    source.addConstraint(-Infinity, Infinity, 'unbounded').setCoefficient(y, 1);
    source.objective().setCoefficient(x, 2); source.objective().setCoefficient(y, -1); source.objective().setOffset(5);
    source.setHint([x, y], [4, 2]);
    const bytes = await source.exportModelProto({ executor });
    const snapshotInputs: Uint8Array[] = [new Uint8Array(bytes)];
    const nodeBuffer = (globalThis as typeof globalThis & { Buffer?: { from(input: Uint8Array): Uint8Array } }).Buffer;
    if (nodeBuffer) snapshotInputs.push(nodeBuffer.from(bytes));
    for (const input of snapshotInputs) {
      const snapshot = new api.MPSolver('snapshot', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
      const pending = snapshot.loadModelFromProtoKeepNames(input, { executor });
      input.fill(255);
      assert(await pending === '' && snapshot.lookupVariable('x')?.upperBound() === 10,
        'Model imports snapshot Uint8Array and Node Buffer inputs before asynchronous execution');
    }
    const target = new api.MPSolver('target', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const stale = target.addNumVariable(0, 1, 'old'), oldRow = target.addConstraint(0, 1, 'old');
    target.setTimeLimit(1000);
    assert(await target.loadModelFromProtoKeepNames(bytes, { executor }) === '', 'Native model import returns empty error on success');
    rejects(() => stale.lowerBound()); rejects(() => oldRow.setCoefficient(stale, 1));
    const importedX = target.lookupVariable('x'), importedY = target.lookupVariable('y'), importedRow = target.lookupConstraint('lower');
    assert(importedX && importedY && importedRow && target.name() === 'target' && target.timeLimit() === 1000
      && target.numVariables() === 2 && target.numConstraints() === 1 && importedX.branchingPriority() === 7
      && importedRow.isLazy() && target.objective().offset() === 5, 'Import retains destination settings and native normalized names/rows/metadata');
    assert(await target.solve({ executor }) === api.MPSolver.OPTIMAL && target.objective().value() === 9 && await target.verifySolution(1e-7, false, { executor }), 'Imported LP solves with objective offset');
    importedRow.setLowerBound(5);
    assert(await target.solve({ executor }) === api.MPSolver.OPTIMAL && importedX.solutionValue() === 5 && target.objective().value() === 13, 'Imported model remains editable');
    const request = await target.exportModelRequestProto({ executor });
    assert((await api.MPSolver.solveModelRequest(request, { executor })).response.objectiveValue === 13, 'Re-exported edited model solves natively');
    results.push({ id: 'mp_solver.correctness.model_import_roundtrip', solver: 'mp-solver', mode, ok: true as const });

    const duplicate = { variable: [{ name: 'dup', lowerBound: 0, upperBound: 1 }, { name: 'dup', lowerBound: 0, upperBound: 1 }] };
    assert(await target.loadModelFromProto(duplicate, { executor }) === '' && target.variables().every(variable => variable.name().startsWith('auto_v_')),
      'Default import discards duplicate names and generates unique native names');
    const discarded = target.variable(0);
    assert((await target.loadModelFromProtoKeepNames(duplicate, { executor })).length > 0 && target.numVariables() === 0,
      'Keep-names rejects duplicate names and leaves a cleared model');
    rejects(() => discarded.upperBound());
    for (const malformed of [new Uint8Array([0xff]),
      { variable: [{ lowerBound: 2, upperBound: 1 }] },
      { variable: [{}], constraint: [{ varIndex: [1], coefficient: [1] }] },
      { variable: [{}], constraint: [{ varIndex: [0], coefficient: [] }] },
      { variable: [{}], solutionHint: { varIndex: [1], varValue: [0] } },
      { variable: [{ objectiveCoefficient: NaN }] },
      { variable: [{}], quadraticObjective: { qvar1Index: [0], qvar2Index: [0], coefficient: [1] } },
      { generalConstraint: [{ indicatorConstraint: { varIndex: 0, varValue: 1 } }] }]) {
      assert((await target.loadModelFromProtoKeepNames(malformed, { executor })).length > 0 && target.numVariables() === 0,
        'Malformed and unsupported imports return errors without partial state');
    }
    assert(await target.loadModelFromProtoKeepNames({}, { executor }) === '' && target.numVariables() === 0, 'Empty model imports successfully');
    let changed = false, rejected = false;
    try {
      await target.loadModelFromProtoKeepNames(bytes, { executor, onEvent: event => {
        if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !changed) {
          changed = true; target.addNumVariable(7, 7, 'concurrent');
        }
      } });
    } catch (error) { rejected = /modified while loading a model/.test(String(error)); if (!rejected) throw error; }
    assert(changed && rejected && target.lookupVariable('concurrent'), 'Concurrent mutation discards stale import and preserves current state');
    results.push({ id: 'mp_solver.contract.model_import_validation', solver: 'mp-solver', mode, ok: true as const });

    for (const backend of [api.MPSolver.GLOP_LINEAR_PROGRAMMING, api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING]) {
      const solver = new api.MPSolver('solution', backend);
      // @ts-expect-error Exercise runtime clearing of a deliberately non-proto field.
      const response: Api.MPSolverSolutionResponse = { variableValue: [99], objectiveValue: 99, unrelated: true };
      solver.fillSolutionResponseProto(response);
      assert(Number(response.status) === api.MPSolver.NOT_SOLVED && !('variableValue' in response) && !('objectiveValue' in response) && !('unrelated' in response), 'Unsolved fill clears old solution fields');
      assert(await solver.loadModelFromProtoKeepNames({ maximize: true, objectiveOffset: 1,
        variable: [{ name: 'integer', lowerBound: 0, upperBound: 4, isInteger: backend === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING, objectiveCoefficient: 3 }] }, { executor }) === '', 'Import backend-compatible model');
      assert(await solver.solve({ executor }) === api.MPSolver.OPTIMAL, 'Solve imported LP/MIP');
      solver.fillSolutionResponseProto(response);
      assert(Number(response.status) === api.MPSolver.OPTIMAL && response.objectiveValue === 13 && JSON.stringify(response.variableValue) === '[4]', 'Fill returns current solved coordinates/objective');
      const mip = backend === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING;
      assert(('bestObjectiveBound' in response) === mip && ('dualValue' in response) === !mip && ('reducedCost' in response) === !mip,
        'MIP exports bound; LP exports duals/reduced costs');
      const solution = await solver.exportSolutionProto({ executor });
      const decoded = await api.MPSolver.decodeSolutionResponse(solution, { executor });
      assert(decoded.objectiveValue === 13 && JSON.stringify(decoded.variableValue) === '[4]', 'Solution bytes preserve native objective/coordinates');
      const recipient = new api.MPSolver('recipient', backend);
      assert(await recipient.loadModelFromProtoKeepNames(await solver.exportModelProto({ executor }), { executor }) === ''
        && await recipient.loadSolutionFromProto(solution, 1e-7, { executor }) && await recipient.verifySolution(1e-7, false, { executor }), 'Exported solution loads into matching imported model');
      solver.variable(0).setUpperBound(2); solver.fillSolutionResponseProto(response);
      assert(Number(response.status) === api.MPSolver.NOT_SOLVED && !('objectiveValue' in response), 'Editing invalidates solution export status');
      assert(decoded.objectiveValue === 13 && (await api.MPSolver.decodeSolutionResponse(solution, { executor })).objectiveValue === 13,
        'Earlier exported solutions remain independent');
      const infeasible = solver.addConstraint(3, Infinity, 'infeasible'); infeasible.setCoefficient(solver.variable(0), 1);
      assert(await solver.solve({ executor }) === api.MPSolver.INFEASIBLE, 'Native model is infeasible');
      solver.fillSolutionResponseProto(response);
      assert(Number(response.status) === api.MPSolver.INFEASIBLE && !('variableValue' in response) && !('objectiveValue' in response), 'Infeasible response retains status without fabricated values');
      const protoResult = await solver.solveWithProto({ executor }); solver.fillSolutionResponseProto(response);
      assert(!protoResult.loaded && Number(response.status) === api.MPSolver.INFEASIBLE && !('objectiveValue' in response), 'solveWithProto retains failed status for current-solution export');
    }
    results.push({ id: 'mp_solver.correctness.solution_export_roundtrip', solver: 'mp-solver', mode, ok: true as const });
  }
  return results;
}
