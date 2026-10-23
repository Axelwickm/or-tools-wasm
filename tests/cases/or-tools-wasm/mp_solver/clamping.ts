import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid solution clamping to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const mpClampingCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mpsolver.clamping.bounds_and_ownership', name: 'Native clamping returns independent results without changing the model or loaded answer', solver: 'mp-solver',
  source: 'ortools/linear_solver/linear_solver.h:ClampSolutionWithinBounds', tags: ['native-contract', 'gap-regression'],
  async run({ mp: { MPSolver, MpModel } }, { mode }) {
    const options = execution(mode), solver = MPSolver.createSolver('GLOP'); assert(solver, 'GLOP available');
    const x = solver.addNumVariable(0, 4, 'x'); solver.objective().setCoefficient(x, 3); solver.objective().setMaximization();
    assert(await solver.solve(options) === MPSolver.OPTIMAL, 'Original model solves');
    const input = { status: MPSolver.FEASIBLE, variableValue: [8], objectiveValue: 123 };
    const output = await MPSolver.clampSolutionWithinBounds(solver, input, options);
    assert(output.value(x) === 4 && output.objectiveValue === 123 && output.status === MPSolver.FEASIBLE,
      'Native values are clamped while submitted objective and status are preserved');
    assert(input.variableValue[0] === 8 && x.solutionValue() === 4 && solver.objective().value() === 12,
      'Submitted point and the facade loaded answer remain unchanged');
    const copy = output.response; copy.variableValue![0] = 99;
    assert(output.value(x) === 4 && !output.nativeMetadata, 'Owned returned result cannot be changed through exported response and has no fabricated solve metadata');
    const foreign = new MpModel().addNumVariable(0, 4);
    await rejects(() => output.value(foreign));
    for (const value of [-2, 2, 8, -Infinity, Infinity]) {
      const result = await MPSolver.clampSolutionWithinBounds(solver, { status: MPSolver.FEASIBLE, variableValue: [value] }, options);
      assert(result.value(x) === (value < 0 ? 0 : value > 4 ? 4 : value), 'Bounds, unchanged interior values and infinities follow the native routine');
    }
    // Clamping is not constraint repair: x=0 remains invalid for x>=1.
    const check = MPSolver.createSolver('GLOP'); assert(check, 'GLOP verifier available');
    const y = check.addNumVariable(0, 4, 'y'); check.addConstraint(1, Infinity).setCoefficient(y, 1);
    const invalid = await MPSolver.clampSolutionWithinBounds(check, { status: MPSolver.FEASIBLE, variableValue: [-1], objectiveValue: 0 }, options);
    assert(invalid.value(y) === 0 && await check.loadSolutionFromProto(invalid.response, Infinity, options) &&
      !await check.verifySolution(1e-7, false, options), 'Independent native verification still rejects a violated row');
    return {};
  },
}, {
  id: 'mpsolver.clamping.native_proto', name: 'Raw clamping preserves native integer rounding, bytes and backend behavior', solver: 'mp-solver',
  source: 'ortools/linear_solver/linear_solver.cc:ClampSolutionWithinBounds', tags: ['native-contract', 'gap-regression'],
  async run({ mp: { MPSolver, OptimizationProblemType } }, { mode }) {
    const options = execution(mode);
    const model = { variable: [{ lowerBound: 0, upperBound: 4, objectiveCoefficient: 3 }], maximize: true };
    for (const solverType of [OptimizationProblemType.GLOP_LINEAR_PROGRAMMING, OptimizationProblemType.GLPK_LINEAR_PROGRAMMING,
      OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING]) {
      const input = { status: MPSolver.FEASIBLE, variableValue: [8], objectiveValue: 123 };
      const result = await MPSolver.clampSolutionWithinBoundsProto(model, input, { ...options, solverType });
      assert(result.response.variableValue![0] === 4 && result.response.objectiveValue === 123,
        'Available native LP and MIP interfaces clamp without solving or recalculating objective');
      const decoded = await MPSolver.decodeSolutionResponse(result.bytes, options);
      assert(decoded.variableValue![0] === 4 && input.variableValue[0] === 8, 'Raw bytes are a native MPSolutionResponse independent of input');
      result.bytes.fill(0);
      assert(result.response.variableValue![0] === 4, 'Decoded response is independently owned');
    }
    const integer = await MPSolver.clampSolutionWithinBoundsProto(
      { variable: [{ lowerBound: 0.5, upperBound: 2.5, isInteger: true }] },
      { status: MPSolver.FEASIBLE, variableValue: [3] }, { ...options, solverType: OptimizationProblemType.SCIP_MIXED_INTEGER_PROGRAMMING });
    assert(integer.response.variableValue![0] === 3,
      'Native clamping uses rounded integer accessors; exporting a fractional bound can round outside it, without wrapper repair');
    const empty = await MPSolver.clampSolutionWithinBoundsProto({}, { status: MPSolver.FEASIBLE }, options);
    assert((empty.response.variableValue ?? []).length === 0, 'Native empty model/solution is valid');
    const unlimited = await MPSolver.clampSolutionWithinBoundsProto({ variable: [{ lowerBound: -Infinity, upperBound: Infinity }] },
      { status: MPSolver.FEASIBLE, variableValue: [Infinity] }, options);
    assert(unlimited.response.variableValue![0] === Infinity, 'Native unbounded variable bounds do not invent a finite replacement');
    return {};
  },
}, {
  id: 'mpsolver.clamping.validation_and_snapshots', name: 'Native clamping rejects invalid inputs and captures model and response before yielding', solver: 'mp-solver',
  source: 'ortools/linear_solver/linear_solver.h:LoadSolutionFromProto/ClampSolutionWithinBounds', tags: ['native-contract', 'lifecycle'],
  async run({ mp: { MPSolver, MpModel, OptimizationProblemType } }, { mode }) {
    const options = execution(mode), model = new MpModel(), x = model.addNumVariable(0, 4);
    const input = { status: MPSolver.FEASIBLE, variableValue: [8] };
    const pending = MPSolver.clampSolutionWithinBounds(model, input, options);
    input.variableValue[0] = 2; x.setBounds(0, 10);
    assert((await pending).value(x) === 4 && input.variableValue[0] === 2, 'Both inputs are captured before schema loading yields');
    const raw = { variable: [{ lowerBound: 0, upperBound: 4 }] };
    const response = { status: MPSolver.FEASIBLE, variableValue: [8] };
    const bytes = await MPSolver.createSolutionResponse(response, options);
    const rawPending = MPSolver.clampSolutionWithinBoundsProto(raw, bytes, options);
    bytes.fill(0); raw.variable[0].upperBound = 10;
    assert((await rawPending).response.variableValue![0] === 4, 'Raw proto objects and byte inputs are copied eagerly');
    const invoke = (value: Parameters<typeof MPSolver.clampSolutionWithinBoundsProto>[1]) => MPSolver.clampSolutionWithinBoundsProto(raw, value, options);
    await rejects(() => invoke({ status: MPSolver.FEASIBLE, variableValue: [NaN] }));
    await rejects(() => invoke({ status: MPSolver.FEASIBLE, variableValue: [] }));
    await rejects(() => invoke({ status: MPSolver.NOT_SOLVED, variableValue: [0] }));
    await rejects(() => invoke({ status: MPSolver.FEASIBLE, variableValue: [0], dualValue: [1] }));
    await rejects(() => MPSolver.clampSolutionWithinBoundsProto(new Uint8Array([255]), response, options));
    await rejects(() => MPSolver.clampSolutionWithinBoundsProto(raw, new Uint8Array([255]), options));
    await rejects(() => MPSolver.clampSolutionWithinBoundsProto(raw, response,
      { ...options, solverType: OptimizationProblemType.HIGHS_LINEAR_PROGRAMMING }));
    const abort = new AbortController(); abort.abort();
    await rejects(() => MPSolver.clampSolutionWithinBounds(model, input, { ...options, signal: abort.signal }));
    const facade = MPSolver.createSolver('GLOP'); assert(facade, 'GLOP available'); facade.addNumVariable(0, 4, 'x');
    const cleared = MPSolver.clampSolutionWithinBounds(facade, response, options); facade.clear();
    await rejects(() => cleared);
    assert((await MPSolver.clampSolutionWithinBounds(model, input, options)).value(x) === 2, 'Later queries recover after invalid input and cancellation');
    return {};
  },
}];
