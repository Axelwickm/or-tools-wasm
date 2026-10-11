import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Mirrors GscipCallbackTest's ReachEventNode() and DisableAllCutsExceptUserDefined().
// Disabling separating globally would also suppress the user-cut callback.
const nodeParameters: Api.MathOptIncrementalSolveOptions = {
  presolve: 'OFF', heuristics: 'OFF',
  gscip: { intParams: Object.fromEntries([
    'cgmip', 'clique', 'closecuts', 'flowcover', 'cmir', 'aggregation', 'convexproj',
    'disjunctive', 'eccuts', 'gauge', 'gomory', 'impliedbounds', 'intobj', 'mcf',
    'oddcycle', 'rapidlearning', 'strongcg', 'zerohalf',
  ].map(name => [`separating/${name}/freq`, -1])) },
};

function lazyModel(api: typeof Api) {
  const model = api.MathOpt.Model('callback lazy constraint');
  const variables = ['x', 'y'].map(name => model.addBinaryVariable({ name }));
  model.maximize(variables.map((variable, index) => ({ variable, coefficient: index + 1 })));
  return { model, variables };
}

// Native CallbackTest.EventNodeCuts: every triple sums to at most two, so the
// integer optimum is two while the initial LP relaxation exceeds two.
function cutModel(api: typeof Api) {
  const model = api.MathOpt.Model('callback user cut');
  const variables = Array.from({ length: 10 }, (_, index) => model.addBinaryVariable({ name: `x${index}` }));
  for (let i = 0; i < variables.length; ++i) for (let j = i + 1; j < variables.length; ++j) {
    for (let k = j + 1; k < variables.length; ++k) model.addLinearConstraint({ upperBound: 2,
      terms: [variables[i], variables[j], variables[k]].map(variable => ({ variable, coefficient: 1 })) });
  }
  model.maximize(variables.map(variable => ({ variable, coefficient: 1 })));
  return { model, variables };
}

export async function runMathOptCallbackResultCases(api: typeof Api) {
  const results = [];
  const source = 'ortools/math_opt/solver_tests/callback_tests.cc';
  const solutionEvent = api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION;
  const nodeEvent = api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_NODE;
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const incremental of [false, true]) {
      for (const kind of ['solution_lazy', 'node_cut', 'node_lazy'] as const) {
        const atSolution = kind === 'solution_lazy';
        const { model, variables } = atSolution ? lazyModel(api) : cutModel(api);
        const upperBound = atSolution ? 1 : 2;
        const session = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GSCIP, { executor, threads: 1 }) : null;
        let generated = 0;
        let cutNode: number | bigint | undefined;
        let strengthenedAtSameNode = false;
        try {
          const options: Api.MathOptSolveOptions = {
            executor, solverType: api.MathOptSolverType.GSCIP, threads: 1, timeLimitSeconds: 10,
            ...(atSolution ? { presolve: 'OFF' as const } : nodeParameters),
            callbackRegistration: { requestRegistration: [atSolution ? solutionEvent : nodeEvent],
              addCuts: kind === 'node_cut', addLazyConstraints: kind !== 'node_cut' },
            callback: data => {
              assert(data.event === (atSolution ? solutionEvent : nodeEvent), 'Registered native callback event');
              const vector = data.primalSolutionVector;
              assert(vector?.ids?.length === variables.length && vector.values?.length === variables.length,
                'Native callback includes the complete model solution');
              assert(vector.ids.every((id, index) => Number(id) === variables[index].id), 'Callback IDs match model IDs');
              const sum = vector.values.reduce((total, value) => total + value, 0);
              if (generated > 0 && !atSolution && sum <= upperBound + 1e-5 && data.mipStats?.exploredNodes === cutNode) {
                strengthenedAtSameNode = true;
              }
              if (sum <= upperBound + 1e-5) return;
              ++generated;
              cutNode = data.mipStats?.exploredNodes;
              return { cuts: [{
                linearExpression: { ids: variables.map(variable => variable.id), values: variables.map(() => 1) },
                lowerBound: -Infinity, upperBound, isLazy: kind !== 'node_cut',
              }] } satisfies Api.MathOptCallbackResult;
            },
          };
          const result = session ? await session.solve(options) : await api.MathOpt.solve(model, options);
          assert(generated > 0, 'Native search requests and receives generated constraints');
          assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL' && Math.abs(result.objectiveValue! - 2) < 1e-5,
            'SCIP solves with generated constraints to the expected native optimum');
          assert(variables.reduce((sum, variable) => sum + result.value(variable), 0) <= upperBound + 1e-5,
            'Native solution respects the callback constraint');
          if (!atSolution) assert(strengthenedAtSameNode, 'Callback constraint strengthens the LP before branching');
          if (session) {
            const reused = await session.solve({ threads: 1 });
            assert(Math.abs(reused.objectiveValue! - (atSolution ? 3 : 2)) < 1e-5,
              'Generated constraints belong to the solve; the original incremental model remains reusable');
          }
          results.push({ id: `mathopt.controls.${kind}`, solver: 'mathopt', source,
            tags: ['contract', 'native-callback'], mode, incremental, ok: true as const });
        } finally { await session?.close(); }
      }

      // These rejections must come from native validation/backend support,
      // rather than TypeScript rewriting callback replies or emulating support.
      for (const invalid of ['undeclared_lazy', 'vector_lengths', 'invalid_bound', 'suggested_solution'] as const) {
        const suggestion = invalid === 'suggested_solution';
        const { model, variables } = suggestion ? cutModel(api) : lazyModel(api);
        const session = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GSCIP, { executor, threads: 1 }) : null;
        let calls = 0;
        let error: unknown;
        try {
          const options: Api.MathOptSolveOptions = {
            executor, solverType: api.MathOptSolverType.GSCIP, threads: 1, timeLimitSeconds: 10,
            ...(suggestion ? nodeParameters : { presolve: 'OFF' as const }),
            callbackRegistration: { requestRegistration: [suggestion ? nodeEvent : solutionEvent],
              addLazyConstraints: !suggestion && invalid !== 'undeclared_lazy' },
            callback: () => {
              ++calls;
              if (suggestion) return { suggestedSolutions: [{ ids: variables.map(variable => variable.id),
                values: variables.map((_, index) => index < 2 ? 1 : 0) }] };
              return { cuts: [{ linearExpression: { ids: variables.map(variable => variable.id),
                values: invalid === 'vector_lengths' ? [1] : variables.map(() => 1) },
                lowerBound: -Infinity, upperBound: invalid === 'invalid_bound' ? -Infinity : 1, isLazy: true }] };
            },
          };
          try { if (session) await session.solve(options); else await api.MathOpt.solve(model, options); }
          catch (caught) { error = caught; }
          assert(calls > 0 && error instanceof Error, 'Native callback result validation rejects the submitted reply');
          const pattern = invalid === 'undeclared_lazy' ? /add_lazy_constraints/i
            : invalid === 'vector_lengths' ? /size|length/i
            : invalid === 'invalid_bound' ? /infinite|upper_bound/i
            : /suggested solution.*not.*implemented.*SCIP/i;
          assert(pattern.test(error.message), `Native ${invalid} diagnostic: ${error.message}`);
          results.push({ id: `mathopt.controls.callback_result_${invalid}`, solver: 'mathopt', source,
            tags: ['contract', 'native-callback', 'validation'], mode, incremental, ok: true as const });
        } finally { await session?.close(); }
      }
    }
    for (const request of [{ requestRegistration: [solutionEvent], addLazyConstraints: true },
      { requestRegistration: [nodeEvent], addCuts: true }]) {
      const { model } = lazyModel(api);
      let error: unknown;
      try { await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.CP_SAT,
        threads: 1, callbackRegistration: request, callback: () => { throw new Error('Unsupported registration must not invoke callbacks'); } }); }
      catch (caught) { error = caught; }
      assert(error instanceof Error && /not supported|unsupported/i.test(error.message), 'CP-SAT rejects unsupported registration natively');
    }
    results.push({ id: 'mathopt.controls.callback_result_backend_support', solver: 'mathopt', source: 'ortools/math_opt/solvers/cp_sat_solver.cc',
      tags: ['contract', 'native-callback', 'validation'], mode, ok: true as const });
  }
  return results;
}
