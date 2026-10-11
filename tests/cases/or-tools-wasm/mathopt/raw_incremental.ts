import type * as Api from 'or-tools-wasm/mathopt';
import { assertCaseMatrix, executorFixtureModes, passedCase, serverExecutorConfiguration, type ExecutorFixtureMode, type SharedCase } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function model(id: number | bigint = 0, upper = 2): Api.MathOptModelProto {
  return { variables: { ids: [id], lowerBounds: [1], upperBounds: [upper], integers: [false] },
    objective: { maximize: true, linearCoefficients: { ids: [id], values: [1] } } };
}
function options(mode: ExecutorFixtureMode) { return { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 }; }
async function rejects(action: () => Promise<unknown>, pattern: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && pattern.test(error.message), `Unexpected error: ${String(error)}`); return; }
  throw new Error('Expected raw incremental rejection');
}
function optimal(result: Api.MathOptProtoSolveResult, value: number) {
  assert(result.response.termination?.reason === 'TERMINATION_REASON_OPTIMAL' &&
    Math.abs((result.response.solutions?.[0]?.primalSolution?.objectiveValue ?? NaN) - value) < 1e-6, `Expected native optimum ${value}`);
}

export const mathOptRawIncrementalCases: SharedCase<typeof Api, Record<string, never>, ExecutorFixtureMode>[] = [
  {
    id: 'mathopt.raw.incremental_update', name: 'raw solver.test_incremental_solver_update', solver: 'mathopt',
    source: 'ortools/math_opt/core/python/solver_test.py', upstream: 'PybindSolverTest.test_incremental_solver_update', tags: ['native-contract', 'raw-proto'],
    async run(api, { mode = 'direct' }) {
      // Mirrors the upstream update behavior using current termination bounds; upstream reads deprecated SolveStats fields.
      const solver = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
      try {
        const first = await solver.solve(); optimal(first, 2);
        assert(first.response.termination!.objectiveBounds!.primalBound === 2, 'Native primal bound starts at 2');
        assert(await solver.update({ variableUpdates: { upperBounds: { ids: [0], values: [2.5] } } }), 'Native GLOP applies the raw update');
        const second = await solver.solve(); optimal(second, 2.5);
        assert(second.response.termination!.objectiveBounds!.primalBound === 2.5, 'Native primal bound reflects the updated model');
        optimal(first, 2);
      } finally { await solver.close(); }
      await solver.close();
      await rejects(() => solver.solve(), /closed or closing/);
      await rejects(() => solver.update({}), /closed or closing/);
      return {};
    },
  },
  {
    id: 'mathopt.raw.incremental_snapshots', name: 'raw incremental binary snapshots and exact IDs', solver: 'mathopt',
    source: 'ortools/math_opt/model_update.proto; ortools/math_opt/result.proto', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const id = 9_007_199_254_740_993n, input = model(id);
      const solver = new api.MathOptProtoIncrementalSolver(input, api.MathOptSolverType.GLOP, options(mode));
      input.variables!.upperBounds![0] = 100;
      try {
        const first = await solver.solve(); optimal(first, 2);
        assert(BigInt(first.response.solutions![0].primalSolution!.variableValues!.ids![0]) === id, 'Native raw session retains exact int64 IDs');
        const update: Api.MathOptModelUpdateProto = { variableUpdates: { upperBounds: { ids: [id], values: [3] } } };
        const pending = solver.update(update); update.variableUpdates!.upperBounds!.values![0] = 100;
        assert(await pending, 'Object update is applied'); optimal(await solver.solve(), 3);
        assert(await solver.update({ deletedVariableIds: [id], newVariables: { ids: [id + 1n], lowerBounds: [4], upperBounds: [4], integers: [false] },
          objectiveUpdates: { linearCoefficients: { ids: [id + 1n], values: [2] } } }), 'Native deletion and insertion update the raw session');
        const final = await solver.solve(); optimal(final, 8);
        assert(BigInt(final.response.solutions![0].primalSolution!.variableValues!.ids![0]) === id + 1n, 'New native IDs are returned without a TypeScript model map');
      } finally { await solver.close(); }
      const editable = api.MathOpt.Model(), x = editable.addVariable({ lowerBound: 1, upperBound: 2 }); editable.maximize(x);
      const bytes = editable.encodeModelProto();
      const binary = new api.MathOptProtoIncrementalSolver(bytes, api.MathOptSolverType.GLOP, options(mode)); bytes.fill(255);
      try {
        optimal(await binary.solve(), 2);
        const tracker = editable.addUpdateTracker(); x.upperBound = 2.5;
        const update = tracker.exportUpdate()!; const pending = binary.update(update); update.fill(255);
        assert(await pending, 'Binary update is captured before awaiting'); optimal(await binary.solve(), 2.5);
      } finally { await binary.close(); }
      return {};
    },
  },
  {
    id: 'mathopt.raw.incremental_native_failures', name: 'raw updates preserve native false and error states', solver: 'mathopt',
    source: 'ortools/math_opt/core/solver.cc; ortools/math_opt/solvers/cp_sat_solver.cc; ortools/math_opt/solvers/pdlp_solver.cc', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      for (const backend of [api.MathOptSolverType.CP_SAT, api.MathOptSolverType.PDLP]) {
        const solver = new api.MathOpt.ProtoIncrementalSolver(model(), backend, options(mode));
        try {
          optimal(await solver.solve(), 2);
          assert(!await solver.update({ variableUpdates: { upperBounds: { ids: [0], values: [3] } } }), 'Unsupported update returns native false');
          await rejects(() => solver.solve(), /unusable/);
          await rejects(() => solver.update({}), /unusable/);
        } finally { await solver.close(); }
      }
      for (const bad of [{ variableUpdates: { upperBounds: { ids: [7], values: [3] } } }, Uint8Array.of(255)]) {
        const solver = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
        try {
          await rejects(() => solver.update(bad), /invalid variable id|not found|parse/i);
          await rejects(() => solver.solve(), /unusable/);
        } finally { await solver.close(); }
      }
      const fresh = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
      try { optimal(await fresh.solve(), 2); } finally { await fresh.close(); }
      if (mode === 'server') {
        const glpk = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLPK, options(mode));
        try { await rejects(() => glpk.solve(), /GLPK.*incremental|incremental.*GLPK/i); } finally { await glpk.close(); }
      }
      return {};
    },
  },
  {
    id: 'mathopt.raw.incremental_lifecycle', name: 'raw solver serializes operations and closes safely', solver: 'mathopt',
    source: 'javascript/lib/mathopt/api.ts; ortools/math_opt/core/solver.h', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const solver = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
      try {
        await solver.solve();
        let observed = false;
        const updating = solver.update({ variableUpdates: { upperBounds: { ids: [0], values: [3] } } }, { onEvent: async () => {
          if (observed) return; observed = true;
          await rejects(() => solver.close(), /callbacks/);
          await rejects(() => solver.solve(), /in progress/);
        } });
        await rejects(() => solver.update({}), /in progress/);
        assert(await updating && observed, 'Update observers cannot reenter the session');
        optimal(await solver.solve(), 3);
        const pending = solver.update({ variableUpdates: { upperBounds: { ids: [0], values: [4] } } });
        const closing = solver.close(); assert(await pending, 'Close waits for the running update'); await closing;
        await rejects(() => solver.solve(), /closed or closing/);
      } finally { await solver.close(); }
      return {};
    },
  },
  {
    id: 'mathopt.raw.incremental_controls', name: 'raw incremental callbacks, logs and native interruption', solver: 'mathopt',
    source: 'ortools/math_opt/core/python/solver_test.py; ortools/math_opt/callback.proto', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const solver = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GSCIP, options(mode));
      const registration = { requestRegistration: [api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION] };
      try {
        let calls = 0, closeRejected = false;
        optimal(await solver.solve({ callbackRegistration: registration, callback: () => {
          calls++; void solver.close().catch(error => { closeRejected = error instanceof Error && /callbacks/.test(error.message); }); return {};
        } }), 2);
        assert(calls > 0 && closeRejected, 'Native callback uses the shared incremental lifecycle');
        const marker = new Error('raw incremental callback failure'); let caught: unknown;
        try { await solver.solve({ callbackRegistration: registration, callback: () => { throw marker; } }); } catch (error) { caught = error; }
        assert(caught === marker, 'Native callback failures preserve the original exception');
        assert(await solver.update({ variableUpdates: { upperBounds: { ids: [0], values: [3] } } }), 'Committed callback failure preserves the native session');
        optimal(await solver.solve(), 3);
      } finally { await solver.close(); }
      const logged = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
      try {
        const batches: string[] = [];
        const result = await logged.solve({ enableOutput: true, messageCallback: lines => batches.push(...lines) }); optimal(result, 2);
        assert(batches.join('\n').includes('status:') && result.messages.join('\n').includes('status:'), 'Native logs stream and remain in the raw result');
        const interrupter = new api.MathOpt.SolveInterrupter(); interrupter.interrupt();
        const stopped = await logged.solve({ interrupter });
        assert(stopped.response.termination!.limit === 'LIMIT_INTERRUPTED', 'Native interruption reaches the retained solver');
        optimal(await logged.solve(), 2);
      } finally { await logged.close(); }
      return {};
    },
  },
  {
    id: 'mathopt.raw.incremental_runtime', name: 'raw incremental handles retain runtime ownership', solver: 'mathopt',
    source: 'javascript/lib/mathopt/api.ts; javascript/lib/runtime_loader_core.ts', tags: ['native-contract', 'gap-regression'],
    async run(api, { mode = 'direct' }) {
      const old = new api.MathOpt.ProtoIncrementalSolver(model(), api.MathOptSolverType.GLOP, options(mode));
      await old.solve();
      let fresh: Api.MathOptProtoIncrementalSolver | undefined;
      try {
        if (mode === 'direct') await api.terminateLoadedRuntimeThreads();
        if (mode === 'worker') {
          const controller = new AbortController();
          const active = api.modelProtoToMps(model(), { ...options(mode), signal: controller.signal });
          let busy = false;
          try { await api.modelProtoToMps(model(), options(mode)); }
          catch (error) { busy = error instanceof Error && error.name === 'SolverExecutorBusyError'; }
          assert(busy, 'Noninterruptible worker job is still active before cancellation');
          controller.abort();
          let aborted = false;
          try { await active; } catch (error) { aborted = error instanceof Error && error.name === 'AbortError'; }
          assert(aborted, 'Cancellation is reported without destroying other MathOpt sessions');
        }
        fresh = new api.MathOpt.ProtoIncrementalSolver(model(0, 9), api.MathOptSolverType.GLOP, options(mode));
        optimal(await fresh.solve(), 9);
        if (mode === 'direct') await rejects(() => old.update({}), /runtime was replaced/);
        else assert(await old.update({ variableUpdates: { upperBounds: { ids: [0], values: [3] } } }), 'Worker/server sessions remain independent after unrelated cancellation');
        await old.close();
        optimal(await fresh.solve(), 9);
      } finally { await old.close(); await fresh?.close(); }
      return {};
    },
  },
];

export async function runMathOptRawIncrementalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) for (const testCase of mathOptRawIncrementalCases) {
    const result = await testCase.run(api, { mode }); results.push(passedCase(testCase, { mode }, result));
  }
  assertCaseMatrix(results, mathOptRawIncrementalCases, executorFixtureModes);
  return results;
}
