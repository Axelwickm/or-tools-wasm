import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) { let rejected = false; try { await action(); } catch { rejected = true; } assert(rejected, 'Invalid statistics input must throw'); }

export async function runCpSatStatisticsCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const source: Api.CpModelProto = { name: 'native-statistics', variables: [
      { name: 'flag', domain: [0, 1] }, { name: 'x', domain: [0, 4] }, { name: 'constant', domain: [3, 3] }],
      constraints: [{ boolOr: { literals: [0] } }, { enforcementLiteral: [0], linear: { vars: [1], coeffs: [1], domain: [2, 4] } }],
      objective: { vars: [1], coeffs: [1] } };
    const bytes = await api.CpSat.createModel(source);
    const stats = await api.CpSat.modelStats(bytes, { executor });
    assert(stats.includes("optimization model 'native-statistics'") && stats.includes('#Variables: 3')
      && stats.includes('Booleans in [0,1]') && stats.includes('constants in {3}')
      && stats.includes('#kBoolOr: 1') && stats.includes('#kLinear1: 1') && stats.includes('#enforced: 1'), 'Native model report includes domains, constants and constraint types/enforcement');
    const copied = new Uint8Array(bytes); const snapshot = api.CpSat.modelStats(copied, { executor }); copied.fill(0xff);
    assert(await snapshot === stats, 'Model statistics snapshot byte input');
    for (const malformed of [new Uint8Array([0xff]), await api.CpSat.createModel({ variables: [{ domain: [0] }] }),
      await api.CpSat.createModel({ variables: [{ domain: [0, 1] }], constraints: [{ boolOr: { literals: [1] } }] })]) {
      await rejects(() => api.CpSat.modelStats(malformed, { executor }));
    }
    assert(await api.CpSat.modelStats(bytes, { executor }) === stats, 'Model statistics recover after malformed inputs');
    results.push({ id: 'cp_sat.contract.native_model_statistics', solver: 'cp-sat', mode, ok: true as const });

    const result = await api.CpSat.solveProto(bytes, { executor, numWorkers: 1 });
    assert(result.response?.status === 'OPTIMAL' && result.statistics?.startsWith('CpSolverResponse summary:'), 'Solve returns native formatted response statistics');
    assert(result.statistics === await api.CpSat.responseStats(result.bytes, { executor }), 'Saved native statistics match formatting the exact response bytes');
    assert(result.statistics.includes('status: OPTIMAL') && result.statistics.includes('objective: 2')
      && result.statistics.includes('branches:') && result.statistics.includes('deterministic_time:')
      && result.statistics.includes('solution_fingerprint:'), 'Response report contains objective, search counters, time and fingerprint');
    const exact: Api.CpSolverResponse = { status: 'FEASIBLE', numBranches: 9007199254740993n };
    const exactPending = api.CpSat.responseStats(exact, { executor }); exact.numBranches = 0;
    assert((await exactPending).includes('branches: 9007199254740993'), 'Response formatting copies objects and preserves exact int64 counters');
    await rejects(() => api.CpSat.responseStats(new Uint8Array([0xff]), { executor }));
    assert((await api.CpSat.responseStats({}, { executor })).includes('status: UNKNOWN'), 'Default responses format and recover after malformed bytes');

    const failures: [Api.CpModelProto, string][] = [
      [{ variables: [{ domain: [0, 1] }], constraints: [{ linear: { vars: [0], coeffs: [1], domain: [2, 2] } }] }, 'INFEASIBLE'],
      [{ variables: [{ domain: [0] }] }, 'MODEL_INVALID'],
    ];
    for (const [proto, status] of failures) {
      const solved = await api.CpSat.solveProto(await api.CpSat.createModel(proto), { executor, numWorkers: 1 });
      assert(solved.response?.status === status && solved.statistics?.includes(status === 'INFEASIBLE' ? 'status: INFEASIBLE' : 'status: MODEL_INVALID'), 'Native reports retain infeasible and invalid statuses');
    }
    const floating = await api.CpSat.solveProto(await api.CpSat.createModel({ ...source, objective: undefined,
      floatingPointObjective: { vars: [1], coeffs: [0.25] } }), { executor, numWorkers: 1 });
    assert(floating.response?.objectiveValue === 0.5 && floating.statistics?.includes('objective: 0.5'), 'Native reports preserve fractional objectives');

    const model = new api.CpModel(), solver = new api.CpSolver();
    const x = model.newIntVar(0, 4, 'x'); model.maximize(x);
    const highLevelStats = await model.modelStats({ executor });
    assert(highLevelStats.startsWith('optimization model') && highLevelStats.includes('#Variables: 1'), 'High-level model statistics return the native report');
    assert(highLevelStats === await api.CpSat.modelStats(await api.CpSat.createModel(model.modelProto), { executor }), 'High-level and low-level model reports match exactly');
    const snapshotModel = new api.CpModel(); snapshotModel.newIntVar(0, 4, 'first');
    const snapshotReport = snapshotModel.modelStats({ executor }); snapshotModel.newIntVar(0, 4, 'second');
    assert((await snapshotReport).includes('#Variables: 1') && (await snapshotModel.modelStats({ executor })).includes('#Variables: 2'), 'High-level statistics snapshot the model before awaiting');
    await rejects(() => solver.responseStats());
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL', 'High-level model solves');
    const saved = solver.responseStats();
    assert(typeof saved === 'string' && saved.includes('status: OPTIMAL') && saved.includes('objective: 4'), 'High-level response statistics return native report synchronously');
    assert(saved === await api.CpSat.responseStats(solver.response!, { executor }), 'High-level cached report matches current native response');
    const controller = new AbortController(); controller.abort();
    await rejects(() => solver.solve(model, { executor, numWorkers: 1, signal: controller.signal }));
    await rejects(() => solver.responseStats());
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.responseStats().includes('objective: 4'), 'New solve recovers without stale cached reports');
    assert(saved.includes('objective: 4'), 'Earlier report strings remain independent');
    if (mode !== 'direct') {
      const stoppedModel = new api.CpModel(), stoppedSolver = new api.CpSolver(); stoppedModel.newIntVar(0, 100, 'enumerate');
      class Stop extends api.CpSolverSolutionCallback { override onSolutionCallback() { stoppedSolver.stopSearch(); } }
      const status = await stoppedSolver.solve(stoppedModel, { executor, numWorkers: 1, enumerateAllSolutions: true, solutionCallback: new Stop() });
      const statusName = stoppedSolver.statusName(status);
      assert((statusName === 'FEASIBLE' || statusName === 'OPTIMAL') && stoppedSolver.responseStats().includes(`status: ${statusName}`), 'Callback interruption preserves the native final status and its statistics');
    }
    results.push({ id: 'cp_sat.correctness.native_response_statistics', solver: 'cp-sat', mode, ok: true as const });
  }
  return results;
}
