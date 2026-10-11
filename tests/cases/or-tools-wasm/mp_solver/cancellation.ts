import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function runMpSolverCancellationCases(api: typeof Api) {
  let random = 13579;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
  const variable = Array.from({ length: 180 }, () => ({ lowerBound: 0, upperBound: 1, isInteger: true, objectiveCoefficient: 1 }));
  const constraint = [];
  for (let i = 0; i < variable.length; ++i) for (let j = i + 1; j < variable.length; ++j)
    if (next() < 0.15) constraint.push({ lowerBound: -Infinity, upperBound: 1, varIndex: [i, j], coefficient: [1, 1] });
  const request = { solverType: 'SAT_INTEGER_PROGRAMMING', solverTimeLimitSeconds: 30,
    solverSpecificParameters: 'num_workers: 1 cp_model_presolve: false mip_presolve_level: 0 random_seed: 1',
    model: { maximize: true, variable, constraint } } satisfies Api.MPSolverModelRequest;
  const results = [];
  for (const mode of executorFixtureModes.filter(mode => mode !== 'direct')) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false, cancelled = false;
    const began = Date.now();
    try {
      await api.MPSolver.solveModelRequest(request, { executor, numThreads: 1, signal: controller.signal,
        onEvent: event => {
          if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !running) {
            running = true; timer = setTimeout(() => controller.abort(), 100);
          }
        } });
    } catch (error) { cancelled = error instanceof Error && error.name === 'AbortError'; if (!cancelled) throw error; }
    finally { clearTimeout(timer); }
    assert(running && cancelled && Date.now() - began < 10000, `MPSolver native timer cancellation failed (${mode})`);
    const reused = await api.MPSolver.solveModelRequest({ solverType: 'GLOP_LINEAR_PROGRAMMING',
      model: { variable: [{ lowerBound: 3, upperBound: 3, objectiveCoefficient: 1 }] } }, { executor });
    assert(reused.response.status === 'MPSOLVER_OPTIMAL' && reused.response.objectiveValue === 3,
      `MPSolver interruption poisoned runtime reuse (${mode})`);
    results.push({ id: 'mp_solver.controls.native_cancellation', solver: 'mp-solver', mode, ok: true as const });
  }
  return results;
}
