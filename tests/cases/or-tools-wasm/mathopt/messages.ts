import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function equal(actual: string[], expected: string[], message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

export async function runMathOptMessageCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const backend of [api.MathOptSolverType.GLOP, api.MathOptSolverType.GLPK,
      api.MathOptSolverType.GSCIP, api.MathOptSolverType.CP_SAT, api.MathOptSolverType.PDLP]) {
      for (const incremental of [false, true]) {
        const model = api.MathOpt.Model('live messages');
        const integer = backend === api.MathOptSolverType.CP_SAT || backend === api.MathOptSolverType.GSCIP;
        const x = model.addVariable({ lowerBound: 0, upperBound: integer ? 1 : 4, integer, name: 'x' });
        model.maximize([{ variable: x, coefficient: 3 }]);
        if (mode === 'server' && incremental && backend === api.MathOptSolverType.GLPK) {
          const unsupported = new api.MathOpt.IncrementalSolver(model, backend, { executor, threads: 1 });
          let error: unknown;
          try { await unsupported.solve(); } catch (caught) { error = caught; }
          finally { await unsupported.close(); }
          assert(error instanceof Error && /GLPK.*same execution thread.*not supported/.test(error.message),
            'Server rejects GLPK state whose native environment would die with the creation thread');
          results.push({ id: 'mathopt.controls.glpk_server_incremental_unsupported', solver: 'mathopt',
            source: 'ortools/third_party_solvers/glpk/glpk_env_deleter.h', tags: ['contract', 'lifecycle'],
            mode, backend, incremental, ok: true as const });
          continue;
        }
        const session = incremental ? new api.MathOpt.IncrementalSolver(model, backend, { executor, threads: 1 }) : null;
        const live: string[] = [], events: string[] = [];
        let terminal = false, batches = 0;
        try {
          const options: Api.MathOptSolveOptions = { executor, solverType: backend, threads: 1,
            messageCallback: messages => {
              assert(!terminal, 'Native message batches arrive before terminal job status');
              assert(messages.length > 0, 'Native log batches are nonempty');
              ++batches; live.push(...messages);
            },
            onEvent: async event => {
              if (event.type === 'log') { await Promise.resolve(); events.push(...event.messages); }
              if (event.type === 'status' && event.status.state === 6) terminal = true;
            },
          };
          const solved = session ? await session.solve(options) : await api.MathOpt.solve(model, options);
          assert(batches > 0 && solved.hasSolution, 'Native log streaming retains a usable solve result');
          equal(live, solved.messages, 'Live batches preserve native ordering and are not replayed after completion');
          equal(events, solved.messages, 'Asynchronous event observers finish before the solve settles');
          let quietCalls = 0;
          const quietOptions = { executor, solverType: backend, threads: 1, enableOutput: false,
            messageCallback: () => { ++quietCalls; } };
          const quiet = session ? await session.solve(quietOptions) : await api.MathOpt.solve(model, quietOptions);
          assert(quietCalls === 0 && quiet.messages.length === 0 && quiet.hasSolution, 'Explicitly disabled native output suppresses live and retained messages');
          results.push({ id: 'mathopt.controls.live_messages', solver: 'mathopt', source: 'ortools/math_opt/core/solver.h',
            tags: ['contract', 'native-log'], mode, backend, incremental, ok: true as const });
        } finally { await session?.close(); }
      }
    }

    for (const incremental of [false, true]) for (const failureKind of ['throw', 'promise'] as const) {
      const model = api.MathOpt.Model('message callback failure');
      const x = model.addVariable({ lowerBound: 0, upperBound: 4 });
      model.maximize([{ variable: x, coefficient: 3 }]);
      const session = incremental ? new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, { executor, threads: 1 }) : null;
      const failure = new Error('live message handler failed');
      let calls = 0, observed: unknown;
      try {
        const options: Api.MathOptSolveOptions = { executor, solverType: api.MathOptSolverType.GLOP, threads: 1,
          messageCallback: () => {
            ++calls;
            if (failureKind === 'throw') throw failure;
            return Promise.reject(failure);
          },
        };
        try { if (session) await session.solve(options); else await api.MathOpt.solve(model, options); }
        catch (error) { observed = error; }
        assert(calls === 1, 'Failed message callbacks suppress later live batches');
        if (failureKind === 'throw') assert(observed === failure, 'Message handler exceptions retain their identity');
        else assert(observed instanceof TypeError && /synchronously/.test(observed.message), 'Promise-returning message handlers reject without an unhandled rejection');
        x.upperBound = 0;
        const reused = session ? await session.solve() : await api.MathOpt.solve(model, { executor });
        assert(reused.hasSolution && reused.objectiveValue === 0, 'Message failures preserve incremental model-update state and permit executor reuse');
        results.push({ id: `mathopt.controls.message_${failureKind}_failure`, solver: 'mathopt', source: 'javascript/lib/solver_job.ts',
          tags: ['contract', 'native-log', 'lifecycle'], mode, incremental, ok: true as const });
      } finally { await session?.close(); }
    }

    const model = api.MathOpt.Model('reentrant message callback');
    model.addVariable({ lowerBound: 0, upperBound: 1 });
    const session = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, { executor });
    let attempted = false;
    let closing: Promise<void> | undefined;
    try {
      await session.solve({ messageCallback: () => {
        if (attempted) return;
        attempted = true;
        closing = session.close().then(() => { throw new Error('Close must reject inside the live callback'); },
          error => { assert(/callbacks/.test(error.message), 'Reentrant close rejects during live log delivery'); });
      } });
      assert(attempted, 'Native message callback was delivered');
      await closing;
      assert((await session.solve()).hasSolution, 'Rejected callback close leaves the session reusable');
      results.push({ id: 'mathopt.controls.message_reentrant_close', solver: 'mathopt', source: 'javascript/lib/mathopt/api.ts',
        tags: ['contract', 'native-log', 'lifecycle'], mode, ok: true as const });
    } finally { await session.close(); }
  }
  return results;
}
