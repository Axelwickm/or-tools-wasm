import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Native backend message contracts; upstream Python does not expose this hook.
export async function runMpSolverMessageCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const backend of [api.MPSolver.GLOP_LINEAR_PROGRAMMING, api.MPSolver.CLP_LINEAR_PROGRAMMING,
      api.MPSolver.GLPK_LINEAR_PROGRAMMING, api.MPSolver.GLPK_MIXED_INTEGER_PROGRAMMING,
      api.MPSolver.SAT_INTEGER_PROGRAMMING, api.MPSolver.PDLP_LINEAR_PROGRAMMING,
      api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING, api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING]) {
      for (const incremental of [false, true]) {
        if (mode === 'server' && incremental && (backend === api.MPSolver.GLPK_LINEAR_PROGRAMMING ||
          backend === api.MPSolver.GLPK_MIXED_INTEGER_PROGRAMMING)) continue; // Native creating-thread restriction.
        const model = new api.MPSolver('native messages', backend);
        const x = model.addIntVariable(0, 4, 'x'), y = model.addIntVariable(0, 4, 'y');
        const row = model.addConstraint(-Infinity, 5); row.setCoefficient(x, 1); row.setCoefficient(y, 1);
        model.objective().setCoefficient(x, 3); model.objective().setCoefficient(y, 1); model.objective().setMaximization();
        const session = incremental ? new api.MPSolver.IncrementalSolver(model, { executor }) : null;
        const live: string[] = [], observed: string[] = [];
        let terminal = false;
        try {
          const options = { executor, messageCallback: (messages: string[]) => {
            assert(!terminal && messages.length > 0, 'Native messages arrive in nonempty batches before terminal status');
            live.push(...messages);
          }, onEvent: async (event: Api.MPSolverEvent) => {
            if (event.type === 'log') { await Promise.resolve(); observed.push(...event.messages); }
            if (event.type === 'status' && event.status.state === solverJobStates.SUCCEEDED) terminal = true;
          } };
          const status = session ? await session.solve(options) : await model.solve(options);
          assert(status === api.MPSolver.OPTIMAL && Math.abs(model.objective().value() - 13) < 0.01,
            'Streaming preserves native optimization');
          assert(live.length > 0 && JSON.stringify(live) === JSON.stringify(observed),
            `Synchronous and asynchronous observers receive native ordering without replay (${mode}/${backend}/${incremental}: ${live.length}/${observed.length})`);
          let quiet = 0;
          const quietOptions = { executor, enableOutput: false, messageCallback: () => { ++quiet; } };
          assert((session ? await session.solve(quietOptions) : await model.solve(quietOptions)) === api.MPSolver.OPTIMAL && quiet === 0,
            'Explicitly disabled output suppresses native log events');
          x.setUpperBound(2);
          assert((session ? await session.solve() : await model.solve({ executor })) === api.MPSolver.OPTIMAL &&
            Math.abs(model.objective().value() - 9) < 0.01 && quiet === 0,
            'Completed jobs release their observers and preserve model edits');
          results.push({ id: 'mp_solver.messages.native_backend', solver: 'mp-solver', mode, backend, incremental,
            source: 'ortools/linear_solver/linear_solver.h', tags: ['native-contract', 'native-log', 'lifecycle'], ok: true as const });
        } finally { await session?.close(); }
      }
    }
    for (const incremental of [false, true]) for (const failureKind of ['throw', 'promise'] as const) {
      const model = new api.MPSolver('observer failure', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
      const x = model.addNumVariable(0, 4, 'x'); model.objective().setCoefficient(x, 3); model.objective().setMaximization();
      const session = incremental ? new api.MPSolver.IncrementalSolver(model, { executor }) : null;
      const failure = new Error('MPSolver message observer failed');
      let calls = 0, caught: unknown;
      try {
        const options = { executor, messageCallback: () => {
          ++calls;
          if (failureKind === 'throw') throw failure;
          return Promise.reject(failure);
        } };
        try { if (session) await session.solve(options); else await model.solve(options); }
        catch (error) { caught = error; }
        assert(calls === 1 && (failureKind === 'throw' ? caught === failure : caught instanceof TypeError),
          'Observer errors preserve identity and suppress further callbacks; async callbacks reject safely');
        x.setUpperBound(0);
        assert((session ? await session.solve() : await model.solve({ executor })) === api.MPSolver.OPTIMAL && model.objective().value() === 0,
          'Observer failure preserves acknowledged edits and executor/session reuse');
        results.push({ id: `mp_solver.messages.${failureKind}_recovery`, solver: 'mp-solver', mode, incremental,
          source: 'javascript/lib/solver_job.ts', tags: ['native-log', 'lifecycle'], ok: true as const });
      } finally { await session?.close(); }
    }
    const request = { solverType: api.MPSolver.GLOP_LINEAR_PROGRAMMING,
      model: { maximize: true, variable: [{ lowerBound: 0, upperBound: 4, objectiveCoefficient: 3 }] } };
    let protoMessages = 0;
    const converted = await api.MPSolver.solveModelRequest(request, { executor, messageCallback: messages => { protoMessages += messages.length; } });
    assert(protoMessages > 0 && converted.response.objectiveValue === 12,
      'Raw requests reach the same native log bridge');
    protoMessages = 0;
    await api.MPSolver.solveModelRequest({ ...request, enableInternalSolverOutput: false },
      { executor, messageCallback: messages => { protoMessages += messages.length; } });
    assert(protoMessages === 0, 'An explicit raw output flag overrides automatic message enablement');
    results.push({ id: 'mp_solver.messages.raw_proto', solver: 'mp-solver', mode,
      source: 'bridge-types/mp_solver.proto', tags: ['native-log', 'proto'], ok: true as const });

    const retained = new api.MPSolver('reentrant message observer', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    retained.addNumVariable(0, 1, 'x');
    const guarded = new api.MPSolver.IncrementalSolver(retained, { executor });
    let closeAttempt: Promise<void> | undefined;
    try {
      await guarded.solve({ messageCallback: () => {
        closeAttempt ??= guarded.close().then(() => { throw new Error('Reentrant close should reject'); },
          error => { assert(/callbacks/.test(error.message), 'Closing a session inside its native log callback rejects'); });
      } });
      assert(closeAttempt, 'Reentrant guard tested during actual native log delivery');
      await closeAttempt;
      assert(await guarded.solve() === api.MPSolver.OPTIMAL, 'Rejected close leaves retained native state usable');
      results.push({ id: 'mp_solver.messages.reentrant_close', solver: 'mp-solver', mode,
        source: 'javascript/lib/mp_solver/api.ts', tags: ['native-log', 'lifecycle'], ok: true as const });
    } finally { await guarded.close(); }

    const unsupported = new api.MPSolver('no native message hook', api.MPSolver.BOP_INTEGER_PROGRAMMING);
    const x = unsupported.addBoolVariable('x'); unsupported.objective().setCoefficient(x, 1);
    let rejected: unknown;
    try { await unsupported.solve({ executor, messageCallback: () => {} }); } catch (error) { rejected = error; }
    assert(rejected instanceof Error && /does not support native message callbacks/.test(rejected.message),
      'Explicit unsupported streaming rejects instead of intercepting process output');
    assert(await unsupported.solve({ executor, onEvent: () => {} }) === api.MPSolver.OPTIMAL,
      'Ordinary lifecycle observers remain available on unsupported log backends');
    results.push({ id: 'mp_solver.messages.unsupported_backend', solver: 'mp-solver', mode,
      source: 'ortools/linear_solver/bop_interface.cc', tags: ['native-log', 'recovery'], ok: true as const });
  }
  return results;
}
