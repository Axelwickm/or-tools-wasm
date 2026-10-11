import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try { await action(); } catch (error) { caught = error; }
  assert(caught instanceof Error && pattern.test(caught.message), `Expected ${pattern}, received ${String(caught)}`);
}

// Native SCIP contracts; the upstream Python MPSolver SWIG entry has no implementation.
export async function runMpSolverIISCases(api: typeof Api) {
  const results: Array<{ id: string; solver: string; mode: typeof executorFixtureModes[number];
    source: string; tags: string[]; ok: true }> = [];
  const nativeSettings = 'iis/irreducible = TRUE\niis/removebounds = TRUE\niis/silent = TRUE';
  const conflict = () => ({
    variable: [{ lowerBound: 0, upperBound: 10, name: 'duplicate' },
      { lowerBound: 0, upperBound: 10, name: 'duplicate' }],
    constraint: [{ lowerBound: 2, varIndex: [0], coefficient: [1], name: 'duplicate' },
      { upperBound: 1, varIndex: [0], coefficient: [1], name: 'duplicate' },
      { upperBound: 8, varIndex: [1], coefficient: [1], name: 'duplicate' }],
  });
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const options = { executor, solverSpecificParameters: nativeSettings };
    const passed = (id: string, tags: string[]) => results.push({ id: `mp_solver.iis.${id}`,
      solver: 'mp-solver', mode, source: 'ortools/linear_solver/scip_interface.cc',
      tags: ['native-contract', ...tags], ok: true as const });

    const source = conflict();
    const capturedOptions = { ...options, timeLimitSeconds: 5, nodeLimit: -1n };
    const pending = api.MPSolver.computeIrreducibleInfeasibleSubset(source, capturedOptions);
    source.constraint[1].upperBound = 3;
    capturedOptions.timeLimitSeconds = -1;
    capturedOptions.nodeLimit = -2n;
    const found = await pending;
    assert(found.isInfeasible && found.isIrreducible && String(found.constraintIndices) === '0,1',
      'Native finder returns source indices despite duplicate names, with eager input/options capture');
    assert(found.variableBounds.length === 1 && found.variableBounds[0].variableIndex === 0 &&
      found.timeSeconds >= 0 && typeof found.nodes === 'bigint' && found.nodes >= 0n,
      'Removed variables are excluded and native counters retain exact types');
    const feasible = await api.MPSolver.computeIrreducibleInfeasibleSubset(source, options);
    assert(!feasible.isInfeasible && !feasible.isIrreducible && String(found.constraintIndices) === '0,1',
      'Feasible queries do not certify a conflict or mutate earlier results');
    const builder = new api.MPSolver('bytes', api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING);
    const byteX = builder.addNumVariable(0, 10, 'x');
    builder.addConstraint(2, Infinity).setCoefficient(byteX, 1);
    builder.addConstraint(-Infinity, 1).setCoefficient(byteX, 1);
    const bytes = await builder.exportModelProto({ executor });
    const byteQuery = api.MPSolver.computeIrreducibleInfeasibleSubset(bytes, options);
    bytes.fill(0xff);
    assert((await byteQuery).isInfeasible, 'Raw MPModelProto bytes are captured before awaiting');
    const empty = await api.MPSolver.computeIrreducibleInfeasibleSubset({}, options);
    assert(!empty.isInfeasible && empty.constraintIndices.length === 0, 'Empty models have no fabricated conflict');
    passed('source_mapping_and_snapshots', ['proto', 'ownership']);

    const model = new api.MpModel('bound conflict');
    const x = model.addNumVariable(0, 1, 'x');
    const row = model.addConstraint(2, Infinity, 'too high'); row.setCoefficient(x, 1);
    const bound = await model.computeIrreducibleInfeasibleSubset(options);
    assert(bound.isInfeasible && String(bound.constraintIndices) === '0' &&
      bound.variableBounds.length === 1 && bound.variableBounds[0].upperBoundIncluded,
      'MpModel defaults to SCIP and exposes native bound membership');
    row.setLowerBound(0);
    const answer = await api.MPSolver.solve(model, { executor, solverType: api.MPSolver.GLOP_LINEAR_PROGRAMMING });
    assert(answer.hasSolution && answer.value(x) >= 0 && answer.value(x) <= 1,
      'IIS queries leave stateless models reusable for optimization');
    const integral = { variable: [{ lowerBound: -Infinity, upperBound: Infinity, isInteger: true }],
      constraint: [{ lowerBound: 0.5, upperBound: 0.5, varIndex: [0], coefficient: [1] }] };
    const domain = await api.MPSolver.computeIrreducibleInfeasibleSubset(integral, options);
    assert(domain.isInfeasible && String(domain.constraintIndices) === '0' && domain.variableBounds.length === 1 &&
      !domain.variableBounds[0].lowerBoundIncluded && !domain.variableBounds[0].upperBoundIncluded,
      'Native cleanup retains infeasibility due to an unbounded integer domain');
    const domainSolve = await api.MPSolver.solveModelRequest({ model: integral,
      solverType: api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING }, { executor });
    assert(domainSolve.response.status === 'MPSOLVER_INFEASIBLE',
      'Returned integer subsystem is independently infeasible');
    passed('bounds_and_integer_domains', ['domain', 'native-regression']);

    const solver = new api.MPSolver('unchanged solution', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const saved = solver.addNumVariable(0, 4, 'saved');
    solver.objective().setCoefficient(saved, 3); solver.objective().setMaximization();
    const session = new api.MPSolver.IncrementalSolver(solver, { executor });
    try {
      assert(await session.solve() === api.MPSolver.OPTIMAL && saved.solutionValue() === 4, 'Source solution exists');
      await rejects(() => solver.computeIrreducibleInfeasibleSubset({ executor }), /IIS is not supported/);
      assert(!(await solver.computeIrreducibleInfeasibleSubset({ ...options,
        solverType: api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING })).isInfeasible &&
        saved.solutionValue() === 4 && solver.objective().value() === 12,
        'Instance defaults to its backend; overriding it queries a fresh snapshot and preserves cached results');
      saved.setUpperBound(2);
      assert(await session.solve() === api.MPSolver.OPTIMAL && solver.objective().value() === 6,
        'Snapshot queries leave retained native sessions and pending edits intact');
    } finally { await session.close(); }
    passed('retained_state_preservation', ['session', 'lifecycle']);

    for (const [input, settings, pattern] of [
      [new Uint8Array([0xff]), {}, /parse MPModelProto/],
      [{ variable: [{ lowerBound: 2, upperBound: 1 }] }, {}, /bound/],
      [{ unexpectedField: 1 } as never, {}, /unexpectedField/],
      [{ generalConstraint: [{}] }, {}, /linear models/],
      [{ quadraticObjective: {} }, {}, /linear models/],
      [conflict(), { solverSpecificParameters: 'iis/not_a_parameter = TRUE' }, /parameters/],
      [conflict(), { timeLimitSeconds: -1 }, /finite and nonnegative/],
      [conflict(), { timeLimitSeconds: Infinity }, /finite and nonnegative/],
      [conflict(), { nodeLimit: -2n }, /SCIP|parameter|invalid/i],
      [conflict(), { nodeLimit: 9223372036854775808n }, /int64|range/i],
      [conflict(), { solverType: 4294967299 }, /32-bit/],
      [conflict(), { solverType: 2147483647 }, /unavailable/],
    ] as const) await rejects(() => api.MPSolver.computeIrreducibleInfeasibleSubset(input,
      { ...options, ...settings } as Api.MPSolverIISOptions), pattern);
    const limited = await api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(),
      { ...options, timeLimitSeconds: 0, nodeLimit: 0n });
    assert(typeof limited.isInfeasible === 'boolean' && typeof limited.isIrreducible === 'boolean',
      'Native limit outcomes are returned without wrapper certification');
    assert((await api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(),
      { ...options, nodeLimit: 9223372036854775807n })).isInfeasible,
      'Exact int64 limits and recovery reach the native finder');
    passed('limits_validation_and_recovery', ['limits', 'recovery']);

    const abort = new AbortController(); abort.abort();
    await rejects(() => api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(),
      { ...options, signal: abort.signal }), /abort|cancel/i);
    const observerError = new Error('IIS observer failed');
    let caught: unknown;
    try { await api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(),
      { ...options, onEvent: () => { throw observerError; } }); } catch (error) { caught = error; }
    assert(caught === observerError, 'Observer failure preserves the originating error');
    if (mode !== 'direct') {
      const activeAbort = new AbortController();
      await rejects(() => api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(), {
        ...options, signal: activeAbort.signal, onEvent: event => {
          if (event.type === 'status' && event.status.state === solverJobStates.RUNNING) activeAbort.abort();
        },
      }), /abort|cancel/i);
    }
    assert((await api.MPSolver.computeIrreducibleInfeasibleSubset(conflict(), options)).isInfeasible,
      'Executors recover after cancellation and observer failure');
    passed('cancellation_and_observer_recovery', ['cancellation', 'lifecycle']);
  }
  return results;
}
