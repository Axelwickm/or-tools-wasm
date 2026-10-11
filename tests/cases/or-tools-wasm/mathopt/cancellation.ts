import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function hardModel(api: typeof Api) {
  const model = api.MathOpt.Model('interruption');
  const variables = Array.from({ length: 180 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `v${i}` }));
  let random = 13579;
  for (let i = 0; i < variables.length; ++i) for (let j = i + 1; j < variables.length; ++j) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    if (random / 4294967296 < 0.15) model.addLinearConstraint({ upperBound: 1,
      terms: [{ variable: variables[i], coefficient: 1 }, { variable: variables[j], coefficient: 1 }] });
  }
  model.maximize(variables.map(variable => ({ variable, coefficient: 1 })));
  return { model, variables };
}
export async function runMathOptCancellationCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes.filter(mode => mode !== 'direct')) for (const incremental of [false, true]) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const { model, variables } = hardModel(api);
    const instance = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.CP_SAT, { executor }) : null;
    try {
      for (const nativeInterrupter of [false, true]) {
        const controller = new AbortController();
        const interrupter = new api.MathOpt.SolveInterrupter();
        let running = false, cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
        const began = Date.now();
        const options: Api.MathOptSolveOptions = { executor, threads: 1, solverType: api.MathOptSolverType.CP_SAT,
          timeLimitSeconds: 30, cpSat: { cpModelPresolve: false, randomSeed: 1 },
          ...(nativeInterrupter ? { interrupter } : { signal: controller.signal }),
          onEvent: event => {
            if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !running) {
              running = true; timer = setTimeout(() => nativeInterrupter ? interrupter.interrupt() : controller.abort(), 100);
            }
          } };
        try {
          const result = instance ? await instance.solve(options) : await api.MathOpt.solve(model, options);
          assert(nativeInterrupter, 'AbortSignal must reject instead of returning a stopped result');
          assert(result.terminationReason === 'TERMINATION_REASON_FEASIBLE' || result.terminationReason === 'TERMINATION_REASON_NO_SOLUTION_FOUND',
            `Native interruption must retain stopped termination: ${result.terminationReason}`);
          cancelled = true;
        } catch (error) {
          cancelled = !nativeInterrupter && error instanceof Error && error.name === 'AbortError';
          if (!cancelled) throw error;
        } finally { clearTimeout(timer); }
        assert(running && cancelled && Date.now() - began < 10000,
          `MathOpt normal/incremental native cancellation failed (${mode}/${incremental}/${nativeInterrupter})`);
      }
      for (const variable of variables) variable.upperBound = 0;
      const reused = instance ? await instance.solve({ threads: 1 }) : await api.MathOpt.solve(model,
        { executor, solverType: api.MathOptSolverType.CP_SAT, threads: 1 });
      assert(reused.terminationReason === 'TERMINATION_REASON_OPTIMAL' && reused.objectiveValue === 0,
        `Native cancellation lost incremental session or poisoned reuse (${mode}/${incremental}): ${reused.terminationReason}/${reused.terminationLimit}, objective=${reused.objectiveValue}, hasSolution=${reused.hasSolution}`);
      results.push({ id: 'mathopt.controls.native_cancellation', solver: 'mathopt', mode, incremental, ok: true as const });
    } finally { await instance?.close(); }
  }
  return results;
}
