import type * as Api from 'or-tools-wasm/mathopt';
import { assertCaseMatrix, executorFixtureModes, passedCase, serverExecutorConfiguration, type ExecutorFixtureMode, type SharedCase } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function simpleModel(id: number | bigint = 0): Api.MathOptModelProto {
  return { variables: { ids: [id], lowerBounds: [1], upperBounds: [2], integers: [false], names: ['x'] },
    objective: { maximize: true, linearCoefficients: { ids: [id], values: [1] } } };
}
function options(mode: ExecutorFixtureMode) {
  return { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
}
function checkOptimal(result: Api.MathOptProtoSolveResult, objective = 2) {
  assert(result.response.termination?.reason === 'TERMINATION_REASON_OPTIMAL', 'Native raw result is optimal');
  assert(result.response.solutions?.[0]?.primalSolution?.objectiveValue === objective, 'Native raw objective matches');
}
async function rejects(action: () => Promise<unknown>, pattern?: RegExp) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && (!pattern || pattern.test(error.message)), `Unexpected error: ${String(error)}`);
    return;
  }
  throw new Error('Expected raw solve rejection');
}

export const mathOptRawSolveCases: SharedCase<typeof Api, Record<string, never>, ExecutorFixtureMode>[] = [
  {
    id: 'mathopt.raw.valid_solve', name: 'raw solver.test_valid_solve', solver: 'mathopt',
    source: 'ortools/math_opt/core/python/solver_test.py', upstream: 'PybindSolverTest.test_valid_solve (without_solver)', tags: ['python-parity', 'raw-proto'],
    async run(api, { mode = 'direct' }) {
      // TEMP: parity - one-shot test_valid_solve native reason, nonempty solutions and objective assertions.
      const result = await api.MathOpt.solveProto(simpleModel(), options(mode));
      checkOptimal(result); assert(result.response.solutions!.length > 0, 'Raw solve has a solution');
      const model = api.MathOpt.Model(); const x = model.addVariable({ lowerBound: 1, upperBound: 2, name: 'x' }); model.maximize(x);
      const binary = await api.MathOpt.solveProto(model.encodeModelProto(), options(mode));
      checkOptimal(binary);
      const native = await api.MathOpt.parseSolveResult(binary.bytes, model, options(mode));
      assert(native.objectiveValue === 2 && native.value(x) === 2, 'Raw result bytes import through the existing native result validator');
      return {};
    },
  },
  {
    id: 'mathopt.raw.validation', name: 'raw solver.test_invalid_input_throws_error', solver: 'mathopt',
    source: 'ortools/math_opt/core/python/solver_test.py; ortools/math_opt/validators/model_validator.cc',
    upstream: 'PybindSolverTest.test_invalid_input_throws_error (without_solver)', tags: ['python-parity', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      // TEMP: parity - unknown objective variable ID fails native model validation.
      const bad = simpleModel(); bad.objective!.linearCoefficients!.ids!.push(7); bad.objective!.linearCoefficients!.values!.push(2);
      await rejects(() => api.MathOpt.solveProto(bad, options(mode)), /id 7 not found/);
      await rejects(() => api.MathOpt.solveProto(Uint8Array.of(255), options(mode)));
      const dimensions = simpleModel(); dimensions.variables!.upperBounds = [];
      await rejects(() => api.MathOpt.solveProto(dimensions, options(mode)));
      await rejects(() => api.MathOpt.solveProto(simpleModel(), { ...options(mode), modelParameters: { variableValuesFilter: { ids: [7], filterByIds: true } } }));
      checkOptimal(await api.MathOpt.solveProto(simpleModel(), options(mode)));
      return {};
    },
  },
  {
    id: 'mathopt.raw.snapshots_and_exact_ids', name: 'raw solve snapshots and exact int64 IDs', solver: 'mathopt',
    source: 'ortools/math_opt/model.proto; ortools/math_opt/result.proto', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const id = 9_007_199_254_740_993n, proto = simpleModel(id);
      const pending = api.MathOpt.solveProto(proto, options(mode));
      proto.variables!.upperBounds![0] = 100; proto.objective!.linearCoefficients!.values![0] = 9;
      const captured = await pending; checkOptimal(captured);
      const vector = captured.response.solutions![0].primalSolution!.variableValues!;
      assert(BigInt(vector.ids![0]) === id && vector.values![0] === 2, 'Full int64 IDs survive native solve and typed decoding without number conversion');
      const model = api.MathOpt.Model(); const x = model.addVariable({ lowerBound: 1, upperBound: 2 }); model.maximize(x);
      const input = model.encodeModelProto(); const binary = api.MathOpt.solveProto(input, options(mode)); input.fill(255);
      const result = await binary; checkOptimal(result);
      result.bytes.fill(255);
      assert(result.response.solutions![0].primalSolution!.objectiveValue === 2, 'Decoded results are independent of result bytes');
      vector.values![0] = 100;
      const again = await api.MathOpt.solveProto(simpleModel(id), options(mode)); checkOptimal(again);
      assert(again.response.solutions![0].primalSolution!.variableValues!.values![0] === 2, 'Each result owns its decoded vectors');
      const filtered = await api.MathOpt.solveProto(simpleModel(id), { ...options(mode), modelParameters: { variableValuesFilter: { ids: [], filterByIds: true } } });
      checkOptimal(filtered);
      assert(filtered.response.solutions![0].primalSolution!.variableValues!.ids!.length === 0, 'Raw solves use native solution filters');
      return {};
    },
  },
  {
    id: 'mathopt.raw.native_constraint_families', name: 'raw solve forwards native SOS constraints', solver: 'mathopt',
    source: 'ortools/math_opt/model.proto; ortools/math_opt/solvers/gscip_solver.cc', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const proto: Api.MathOptModelProto = { variables: { ids: [4, 9], lowerBounds: [0, 0], upperBounds: [1, 1], integers: [false, false] },
        objective: { maximize: true, linearCoefficients: { ids: [4, 9], values: [2, 1] } },
        sos1Constraints: { '20': { expressions: [{ ids: [4], coefficients: [1] }, { ids: [9], coefficients: [1] }], weights: [1, 2] } } };
      const result = await api.MathOpt.solveProto(proto, { ...options(mode), solverType: api.MathOptSolverType.GSCIP });
      checkOptimal(result);
      const vector = result.response.solutions![0].primalSolution!.variableValues!;
      assert(vector.ids!.map(String).join(',') === '4,9' && vector.values![0] === 1 && vector.values![1] === 0, 'Native SOS1 constrains the original sparse-ID model');
      assert(result.response.gscipOutput, 'Full typed native backend output is retained');
      await rejects(() => api.MathOpt.solveProto(proto, { ...options(mode), solverType: api.MathOptSolverType.GLOP }));
      return {};
    },
  },
  {
    id: 'mathopt.raw.callbacks_and_interruption', name: 'raw solve native controls', solver: 'mathopt',
    source: 'ortools/math_opt/core/python/solver_test.py; ortools/math_opt/callback.proto',
    upstream: 'PybindSolverTest.test_user_callback_is_invoked, test_message_callback_is_invoked, test_solve_interrupter_interrupts_solve (without_solver)', tags: ['native-contract', 'raw-proto'],
    async run(api, { mode = 'direct' }) {
      const backend = { ...options(mode), solverType: api.MathOptSolverType.CP_SAT };
      let calls = 0;
      const result = await api.MathOpt.solveProto(simpleModel(), { ...backend,
        callbackRegistration: { requestRegistration: [api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION] },
        callback: data => { calls++; assert(data.primalSolutionVector?.values?.includes(2), 'Raw callback contains native model values'); return {}; } });
      checkOptimal(result); assert(calls > 0, 'Raw solve invokes registered callbacks');
      const marker = new Error('raw callback failure'); let caught: unknown;
      try { await api.MathOpt.solveProto(simpleModel(), { ...backend,
        callbackRegistration: { requestRegistration: [api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION] }, callback: () => { throw marker; } }); }
      catch (error) { caught = error; }
      assert(caught === marker, 'Callback failures retain the original user error');
      const logBatches: string[] = [];
      const logged = await api.MathOpt.solveProto(simpleModel(), { ...options(mode), enableOutput: true, messageCallback: lines => logBatches.push(...lines) });
      checkOptimal(logged); assert(logBatches.join('\n').includes('status:') && logged.messages.join('\n').includes('status:'), 'Raw solves retain and stream native messages');
      const interrupter = new api.MathOpt.SolveInterrupter(); interrupter.interrupt();
      const stopped = await api.MathOpt.solveProto(simpleModel(), { ...options(mode), interrupter });
      assert(stopped.response.termination?.reason === 'TERMINATION_REASON_NO_SOLUTION_FOUND' && stopped.response.termination.limit === 'LIMIT_INTERRUPTED', 'Pre-interruption reaches the native solver');
      const controller = new AbortController(); controller.abort();
      let aborted: unknown; try { await api.MathOpt.solveProto(simpleModel(), { ...options(mode), signal: controller.signal }); } catch (error) { aborted = error; }
      assert(aborted instanceof Error && aborted.name === 'AbortError', 'AbortSignal uses the existing cancellation path');
      checkOptimal(await api.MathOpt.solveProto(simpleModel(), options(mode)));
      return {};
    },
  },
];

export async function runMathOptRawSolveCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) for (const testCase of mathOptRawSolveCases) {
    const result = await testCase.run(api, { mode });
    results.push(passedCase(testCase, { mode }, result));
  }
  assertCaseMatrix(results, mathOptRawSolveCases, executorFixtureModes);
  return results;
}
