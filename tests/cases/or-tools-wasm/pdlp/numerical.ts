import type * as Api from 'or-tools-wasm/pdlp';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => Promise<unknown>) {
  let rejected = false; try { await action(); } catch (error) { rejected = error instanceof Error; }
  assert(rejected, 'Malformed matrix indices must reject');
}
const lp = () => ({ objectiveVector: [-1], variableLowerBounds: [0], variableUpperBounds: [2],
  constraintLowerBounds: [-Infinity], constraintUpperBounds: [3], variableNames: ['x'], constraintNames: ['cap'],
  constraintMatrix: { numRows: 1, numColumns: 1, entries: [{ row: 0, column: 0, value: 1 }] },
});

export async function runPdlpNumericalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const parameters = { executor, numThreads: 1 };
    const source = lp(), initial = { primalSolution: [0], dualSolution: [0] };
    const pending = api.Pdlp.solve(source, { ...parameters, initialSolution: initial });
    source.variableUpperBounds[0] = 5; source.constraintUpperBounds[0] = 5;
    initial.primalSolution[0] = NaN; initial.dualSolution[0] = NaN;
    const found = await pending;
    assert(found.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL' &&
      Math.abs(found.primalSolution[0] - 2) < 1e-5,
      'Solve captures problem vectors and initial solution before native loading');
    const capturedValue = found.primalSolution[0];
    const exportInput = lp();
    const exporting = api.Pdlp.qpToMpModelProto(exportInput, { executor });
    exportInput.objectiveVector[0] = 9; exportInput.variableUpperBounds[0] = 9;
    exportInput.variableNames[0] = 'changed'; exportInput.constraintNames[0] = 'changed';
    exportInput.constraintUpperBounds[0] = 9; exportInput.constraintMatrix.entries[0].value = 9;
    const roundTrip = await api.Pdlp.qpFromMpModelProto(await exporting, { executor, includeNames: true });
    assert(roundTrip.objectiveVector[0] === -1 && roundTrip.variableUpperBounds[0] === 2 &&
      roundTrip.constraintUpperBounds[0] === 3 && roundTrip.variableNames[0] === 'x' &&
      roundTrip.constraintNames[0] === 'cap', 'Native conversion captures vectors and name arrays');
    assert(found.primalSolution[0] === capturedValue, 'Later conversion does not mutate an earlier solver result');
    results.push({ id: 'pdlp.numerical.input_and_result_ownership',
      name: 'PDLP captures all vectors before dispatch', solver: 'pdlp', mode,
      source: 'javascript/lib/pdlp/api.ts', tags: ['native-contract', 'ownership'], ok: true as const });

    for (const index of [-1, 1, 4294967296, NaN, 0.5]) for (const axis of ['row', 'column'] as const) {
      const entry = { row: 0, column: 0, value: 0 }; entry[axis] = index;
      await rejects(() => api.Pdlp.validateQuadraticProgramDimensions({ ...lp(),
        constraintMatrix: { numRows: 1, numColumns: 1, entries: [entry] } }, { executor }));
    }
    const duplicate = await api.Pdlp.solve({ ...lp(), objectiveVector: [1], variableUpperBounds: [10],
      constraintLowerBounds: [3], constraintUpperBounds: [Infinity],
      constraintMatrix: { numRows: 1, numColumns: 1, entries: [
        { row: 0, column: 0, value: 1 }, { row: 0, column: 0, value: 2 }, { row: 0, column: 0, value: 0 },
      ] },
    }, parameters);
    assert(duplicate.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL' &&
      Math.abs(duplicate.primalSolution[0] - 1) < 1e-5,
      'Native matrix assembly combines duplicate entries and handles explicit zeros');
    results.push({ id: 'pdlp.numerical.native_sparse_entries',
      name: 'Explicit zeros validate and duplicates reach native assembly', solver: 'pdlp', mode,
      source: 'ortools/pdlp/quadratic_program.cc', tags: ['native-contract', 'sparse-matrix'], ok: true as const });

    for (const input of [
      { ...lp(), objectiveVector: [NaN] }, { ...lp(), objectiveVector: [Infinity] },
      { ...lp(), objectiveOffset: NaN }, { ...lp(), objectiveScalingFactor: Infinity },
      { ...lp(), variableLowerBounds: [NaN] }, { ...lp(), constraintUpperBounds: [NaN] },
      { ...lp(), objectiveMatrixDiagonal: [-1] }, { ...lp(), objectiveMatrixDiagonal: [Infinity] },
      { ...lp(), constraintMatrix: { dense: [[NaN]] } },
      { ...lp(), constraintMatrix: { numRows: 1, numColumns: 1, entries: [
        { row: 0, column: 0, value: 1e308 }, { row: 0, column: 0, value: 1e308 },
      ] } },
    ]) {
      const invalid = await api.Pdlp.solve(input, parameters);
      assert(invalid.solveLog.terminationReason === 'TERMINATION_REASON_INVALID_PROBLEM',
        `Native numerical diagnostics remain authoritative (${invalid.solveLog.terminationReason})`);
    }
    for (const initialSolution of [{ primalSolution: [NaN], dualSolution: [0] },
      { primalSolution: [Infinity], dualSolution: [0] }, { primalSolution: [], dualSolution: [0] }]) {
      const invalid = await api.Pdlp.solve(lp(), { ...parameters, initialSolution });
      assert(invalid.solveLog.terminationReason === 'TERMINATION_REASON_INVALID_INITIAL_SOLUTION',
        'Native initial-solution validation is preserved');
    }
    const recovered = await api.Pdlp.solve(lp(), parameters);
    assert(recovered.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL' &&
      Math.abs(recovered.primalSolution[0] - 2) < 1e-5, 'Native numerical rejections leave all executors reusable');
    results.push({ id: 'pdlp.numerical.native_diagnostics_and_recovery',
      name: 'Native invalid numerical data and initial solutions', solver: 'pdlp', mode,
      source: 'ortools/pdlp/primal_dual_hybrid_gradient.cc', tags: ['native-contract', 'numerical', 'recovery'], ok: true as const });
  }
  return results;
}
