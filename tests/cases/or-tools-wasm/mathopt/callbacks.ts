import type * as Api from 'or-tools-wasm/mathopt';
import { runMathOptCallbackResultCases } from './callback_results.ts';
import { runMathOptMessageCases } from './messages.ts';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function callbackModel(api: typeof Api) {
  const model = api.MathOpt.Model('callbacks');
  const variables = Array.from({ length: 80 }, (_, i) => model.addBinaryVariable({ name: `v${i}` }));
  let random = 13579;
  for (let i = 0; i < variables.length; i++) for (let j = i + 1; j < variables.length; j++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    if (random / 4294967296 < 0.2) model.addLinearConstraint({ upperBound: 1,
      terms: [{ variable: variables[i], coefficient: 1 }, { variable: variables[j], coefficient: 1 }] });
  }
  model.maximize(variables.map(variable => ({ variable, coefficient: 1 })));
  return { model, variables };
}
export async function runMathOptCallbackCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const backend of [api.MathOptSolverType.CP_SAT, api.MathOptSolverType.GSCIP]) {
      for (const incremental of [false, true]) for (const threads of backend === api.MathOptSolverType.CP_SAT ? [1, 4] : [1]) {
        const { model, variables } = callbackModel(api);
        const instance = incremental ? new api.MathOpt.IncrementalSolver(model, backend, { executor }) : null;
        const options: Api.MathOptSolveOptions = { executor, solverType: backend, threads, timeLimitSeconds: 10,
          cpSat: backend === api.MathOptSolverType.CP_SAT ? { cpModelPresolve: false, randomSeed: 1 } : undefined,
          callbackRegistration: { requestRegistration: [api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION],
            mipSolutionFilter: { filterByIds: true, filteredIds: variables.slice(0, 3).map(variable => variable.id) } } };
        try {
          let calls = 0, completed = false;
          let closeRejected = false;
          const snapshots: Api.MathOptCallbackData[] = [];
          options.callback = data => {
            assert(!completed, 'Callback arrives before solve completion');
            assert(data.event === api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION, 'Native registered callback event');
            const values = data.primalSolutionVector;
            assert(values && values.ids?.length === 3 && values.values?.length === 3, 'Native solution filter is applied');
            assert(values.ids.every((id, index) => Number(id) === variables[index].id), 'Callback IDs match the submitted model');
            assert(values.values.every(value => value === 0 || value === 1), 'Native callback solution respects integrality');
            assert(data.mipStats, 'Native callback statistics are retained');
            if (instance && calls === 0) void instance.close().catch(error => {
              closeRejected = error instanceof Error && /callbacks/.test(error.message);
            });
            snapshots.push(data); calls++;
            return { terminate: true };
          };
          const stopped = instance ? await instance.solve(options) : await api.MathOpt.solve(model, options);
          completed = true;
          assert(calls > 0 && stopped.hasSolution, 'Native callback termination retains an incumbent');
          assert(!instance || closeRejected, 'Reentrant close rejects without ending the incremental session');
          assert(stopped.terminationReason === 'TERMINATION_REASON_FEASIBLE', `Callback stops before optimality: ${stopped.terminationReason}`);
          assert(stopped.terminationLimit === 'LIMIT_INTERRUPTED', 'Native termination records callback interruption');
          const firstSnapshot = JSON.stringify(snapshots[0], (_, value) => typeof value === 'bigint' ? String(value) : value);
          const failure = new Error('Callback regression failure');
          let failedCalls = 0;
          options.callback = () => { ++failedCalls; throw failure; };
          let observed: unknown;
          try { if (instance) await instance.solve(options); else await api.MathOpt.solve(model, options); } catch (error) { observed = error; }
          assert(observed === failure, 'Callback exceptions preserve the original user error');
          assert(failedCalls === 1, 'A failed callback is not invoked again');
          for (const variable of variables) variable.upperBound = 0;
          const reused = instance ? await instance.solve({ threads }) : await api.MathOpt.solve(model, { executor, solverType: backend, threads });
          assert(reused.terminationReason === 'TERMINATION_REASON_OPTIMAL' && reused.objectiveValue === 0,
            'Callback termination/failure leaves solver state reusable');
          assert(JSON.stringify(snapshots[0], (_, value) => typeof value === 'bigint' ? String(value) : value) === firstSnapshot,
            'Callback data is a detached snapshot');
          results.push({ id: 'mathopt.controls.native_callbacks', solver: 'mathopt', source: 'ortools/math_opt/callback.proto',
            tags: ['contract', 'native-callback'], mode, backend, incremental, threads, ok: true as const });
        } finally { await instance?.close(); }
      }
    }
    const model = api.MathOpt.Model('invalid callback'); model.addVariable({ lowerBound: 0, upperBound: 1 });
    for (const callbackRegistration of [{}, new Uint8Array()]) {
      const empty = await api.MathOpt.solve(model, { executor, callbackRegistration,
        callback: () => { throw new Error('Empty registration must not invoke callbacks'); } });
      assert(empty.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'Empty native callback registrations are valid');
    }
    for (const options of [
      { callbackRegistration: { requestRegistration: [4] }, callback: () => ({}) },
      { callbackRegistration: { requestRegistration: [4] } },
      { callback: () => ({}) },
    ]) {
      let rejected = false;
      try { await api.MathOpt.solve(model, { executor, solverType: api.MathOptSolverType.GLOP, ...options }); } catch { rejected = true; }
      assert(rejected, 'Unsupported events and incomplete callback options reject');
    }
    const session = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, { executor });
    try {
      let rejected = false;
      try { await session.solve({ callback: () => ({}) }); } catch { rejected = true; }
      assert(rejected && (await session.solve()).terminationReason === 'TERMINATION_REASON_OPTIMAL',
        'Invalid callback options reject before changing incremental state');
    } finally { await session.close(); }
    results.push({ id: 'mathopt.controls.callback_validation', solver: 'mathopt', source: 'ortools/math_opt/callback.proto',
      tags: ['contract'], mode, ok: true as const });
    if (mode === 'server') {
      const stopped = await Promise.all(Array.from({length:6}, async () => {
        const {model} = callbackModel(api);
        let calls = 0;
        const result = await api.MathOpt.solve(model, {executor,solverType:api.MathOptSolverType.CP_SAT,
          threads:1,timeLimitSeconds:10,cpSat:{cpModelPresolve:false,randomSeed:1},
          callbackRegistration:{requestRegistration:[api.MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION]},
          callback:()=>{++calls;return {terminate:true};}});
        assert(calls > 0 && result.hasSolution && result.terminationLimit === 'LIMIT_INTERRUPTED',
          'Six concurrent server solves deliver callback replies and retain stopped incumbents');
        return true;
      }));
      assert(stopped.length === 6, 'All concurrent callback solves complete');
      results.push({id:'mathopt.controls.concurrent_server_callbacks',solver:'mathopt',source:'ortools/math_opt/callback.proto',
        tags:['contract','native-callback','concurrency'],mode,ok:true as const});
    }
  }
  results.push(...await runMathOptCallbackResultCases(api));
  results.push(...await runMathOptMessageCases(api));
  return results;
}
