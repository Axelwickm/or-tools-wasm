import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMathOptAdmissionCases(api: typeof Api) {
  const results = [];
  const join = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap(part => [...part]));
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = api.MathOpt.Model('admission');
    const x = model.addVariable({ lowerBound: 0, upperBound: 4, integer: true, name: 'x' });
    model.maximize([{ variable: x, coefficient: 3 }]);
    const scenarios: Array<{ id: string; workers: number; options: Api.MathOptSolveOptions }> = [
      { id: 'cp_sat_default', workers: 1, options: { solverType: api.MathOptSolverType.CP_SAT, cpSat: { logSearchProgress: true } } },
      { id: 'cp_sat_modern', workers: 2, options: { solverType: api.MathOptSolverType.CP_SAT, threads: 1, cpSat: { numWorkers: 2, logSearchProgress: true } } },
      { id: 'cp_sat_legacy', workers: 2, options: { solverType: api.MathOptSolverType.CP_SAT, threads: 1, cpSat: { numWorkers: 0, numSearchWorkers: 2, logSearchProgress: true } } },
      { id: 'cp_sat_legacy_no_common', workers: 2, options: { solverType: api.MathOptSolverType.CP_SAT, cpSat: { numSearchWorkers: 2, logSearchProgress: true } } },
      { id: 'cp_sat_raw', workers: 2, options: { solverType: api.MathOptSolverType.CP_SAT, threads: 1, cpSat: new Uint8Array([0xf0, 0x0c, 1, 0xf0, 0x0c, 2]) } },
    ];
    for (const form of ['typed', 'class', 'raw', 'duplicate'] as const) {
      const glop = new api.GlopParameters({ numOmpThreads: 2 });
      const pdlp = new api.PdlpParameters({ numThreads: 2 });
      const gscip = new api.GScipParameters({ intParams: { 'parallel/maxnthreads': 2 } });
      scenarios.push(
        { id: `glop_${form}`, workers: 2, options: { solverType: api.MathOptSolverType.GLOP, threads: 1,
          glop: form === 'typed' ? glop.options : form === 'class' ? glop : form === 'raw' ? glop.toProtoBytes()
            : join(new api.GlopParameters({ numOmpThreads: 1 }).toProtoBytes(), glop.toProtoBytes()) } },
        { id: `pdlp_${form}`, workers: 2, options: { solverType: api.MathOptSolverType.PDLP, threads: 1,
          pdlp: form === 'typed' ? pdlp.options : form === 'class' ? pdlp : form === 'raw' ? pdlp.toProtoBytes()
            : join(new api.PdlpParameters({ numThreads: 1 }).toProtoBytes(), pdlp.toProtoBytes()) } },
        { id: `gscip_${form}`, workers: 2, options: { solverType: api.MathOptSolverType.GSCIP, threads: 1,
          gscip: form === 'typed' ? gscip.options : form === 'class' ? gscip : form === 'raw' ? gscip.toProtoBytes()
            : join(new api.GScipParameters({ intParams: { 'parallel/maxnthreads': 1 } }).toProtoBytes(), gscip.toProtoBytes()) } },
      );
    }
    for (const scenario of scenarios) {
      const check = (result: Api.MathOptSolveResult) => assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL'
        && Math.abs((result.objectiveValue ?? NaN) - 12) < 1e-4, `Wrong native objective (${mode}/${scenario.id}): ${result.terminationReason}/${result.objectiveValue}`);
      // PDLP is a continuous backend; the model copy uses the same optimum.
      x.integer = scenario.options.solverType !== api.MathOptSolverType.PDLP && scenario.options.solverType !== api.MathOptSolverType.GLOP;
      for (const incremental of [false, true]) {
        const allocated: number[] = [];
        const options: Api.MathOptSolveOptions = { ...scenario.options, executor, enableOutput: scenario.id.startsWith('cp_sat_'),
          onEvent: event => { if (event.type === 'status' && event.status.state === solverJobStates.RUNNING) allocated.push(event.status.allocatedThreads); } };
        const instance = incremental ? new api.MathOpt.IncrementalSolver(model, scenario.options.solverType!, { executor }) : null;
        try {
          const result = instance ? await instance.solve(options) : await api.MathOpt.solve(model, options);
          check(result);
          if (mode === 'server') assert(allocated.includes(scenario.workers), `Server admission disagrees with native workers (${scenario.id})`);
          if (scenario.id !== 'cp_sat_raw' && scenario.id.startsWith('cp_sat_')) assert(result.messages.some(line => line.includes(`with ${scenario.workers} workers`)),
            `CP-SAT did not receive its admitted worker budget (${mode}/${scenario.id}): ${result.messages.join('\n')}`);
        } finally { await instance?.close(); }
      }
      results.push({ id: `mathopt.admission.${scenario.id}`, solver: 'mathopt', mode, ok: true as const });
    }
    x.integer = false;
    const exact = await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.GLOP, iterationLimit: 9007199254740993n });
    assert(exact.objectiveValue === 12, 'Exact int64 iteration limits reach native GLOP');
    x.integer = true;
    const signed = await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.GSCIP,
      nodeLimit: 9007199254740993n, gscip: { longParams: { 'limits/nodes': -1n } } });
    assert(signed.objectiveValue === 12, 'Exact node limits and signed long-map values reach native GSCIP');
    results.push({ id: 'mathopt.admission.exact_limits', solver: 'mathopt', mode, ok: true as const });
    for (const options of [
      { solverType: api.MathOptSolverType.CP_SAT, cpSat: { numWorkers: 2147483647 } },
      { solverType: api.MathOptSolverType.PDLP, pdlp: { numThreads: 2147483647 } },
      { solverType: api.MathOptSolverType.GLOP, glop: { numOmpThreads: 2147483647 } },
      { solverType: api.MathOptSolverType.GSCIP, gscip: { intParams: { 'parallel/maxnthreads': 2147483647 } } },
    ]) {
      x.integer = options.solverType !== api.MathOptSolverType.PDLP && options.solverType !== api.MathOptSolverType.GLOP;
      for (const incremental of [false, true]) {
        const instance = incremental ? new api.MathOpt.IncrementalSolver(model, options.solverType, { executor }) : null;
        try {
          let rejected = false;
          try {
            if (instance) await instance.solve({ threads: 1, ...options });
            else await api.MathOpt.solve(model, { executor, threads: 1, ...options });
          } catch (error) { rejected = error instanceof Error && /capacity|thread/i.test(error.message); }
          assert(rejected, `Backend worker requests beyond capacity must fail before allocation (${mode}/${options.solverType}/${incremental})`);
        } finally { await instance?.close(); }
      }
    }
    for (const incremental of [false, true]) {
      const instance = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.CP_SAT, { executor }) : null;
      try {
        let rejected = false;
        const options: Api.MathOptSolveOptions = { executor, solverType: api.MathOptSolverType.CP_SAT, threads: 1, cpSat: { numSearchWorkers: 2 } };
        try { if (instance) await instance.solve(options); else await api.MathOpt.solve(model, options); }
        catch (error) { rejected = error instanceof Error && /Do not specify both num_search_workers and num_workers/.test(error.message); }
        assert(rejected, 'Conflicting common modern and legacy CP-SAT workers retain native validation');
      } finally { await instance?.close(); }
    }
    const recovered = await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.CP_SAT, threads: 1 });
    assert(recovered.objectiveValue === 12, 'Rejected admission must not poison later solves');
    results.push({ id: 'mathopt.admission.capacity_recovery', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
