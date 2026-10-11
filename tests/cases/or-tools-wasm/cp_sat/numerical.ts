import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => unknown) { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid input must reject'); }

export async function runCpSatNumericalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = new api.CpModel(), x = model.newIntVar(0, 2, 'x'); model.maximize(x);
    const bytes = await api.CpSat.createModel(model.modelProto);
    const pending = api.CpSat.solveProto(bytes, { executor, numWorkers: 1 }); bytes.fill(255);
    const solved = await pending;
    assert(solved.response?.status === 'OPTIMAL' && solved.response.objectiveValue === 2,
      'Raw CP-SAT solves capture binary models before dispatching');
    solved.bytes.fill(255);
    assert(BigInt(solved.response.solution![x.index]) === 2n, 'Decoded values remain independent of response bytes');
    const large = api.sum(Array.from({ length: 150_000 }, () => x));
    const combined = api.LinearExpr.from(large).plus(1);
    model.maximize(combined);
    assert(combined.terms.get(x.index) === 150_000n && combined.offset === 1n,
      'Large display sums flatten without JavaScript argument-count limits');
    const solver = new api.CpSolver();
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.objectiveValue === 300_001,
      'Large expressions retain the native linear model');
    results.push({ id: 'cp_sat.numerical.raw_ownership_large_sum', solver: 'cp-sat', mode,
      source: 'ortools/sat/cp_model.proto', tags: ['native-contract', 'ownership', 'large-model'], ok: true as const });

    const minimum = -(1n << 63n), maximum = (1n << 63n) - 1n;
    for (const [offset, complement] of [[minimum, [minimum + 1n, maximum]], [maximum, [minimum, maximum - 1n]]] as const) {
      const boundary = new api.CpModel(), variable = boundary.newIntVar(0, 1, 'x'), flag = boundary.newBoolVar('flag');
      boundary.addMapDomain(variable, [flag], offset);
      const rows = boundary.modelProto.constraints!;
      assert(rows.length === 2 && rows[0].linear!.domain!.map(BigInt).join(',') === [offset, offset].join(',') &&
        rows[1].linear!.domain!.map(BigInt).join(',') === complement.join(','), 'Mapping endpoints uses the existing exact domain complement');
      rejects(() => boundary.addMapDomain(variable, [flag, flag], maximum));
      const foreign = new api.CpModel().newBoolVar();
      rejects(() => boundary.addMapDomain(variable, [flag, foreign]));
      assert(boundary.modelProto.constraints!.length === 2, 'Invalid map batches add no partial constraints');
    }
    const exact = 9_007_199_254_740_993n, mapping = new api.CpModel();
    const choice = mapping.newIntVar(exact, exact + 1n, 'choice'), first = mapping.newBoolVar(), second = mapping.newBoolVar();
    mapping.addMapDomain(choice, [first, second], exact); mapping.add(second.eq(1));
    assert(await solver.solve(mapping, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(choice) === exact + 1n &&
      solver.value(first) === 0n && solver.value(second) === 1n, 'Exact mapping values reach native CP-SAT above the safe-number boundary');
    rejects(() => mapping.newIntVar(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1));
    results.push({ id: 'cp_sat.numerical.mapping_boundaries', solver: 'cp-sat', mode,
      source: 'ortools/sat/python/cp_model.py:add_map_domain', tags: ['native-contract', 'int64', 'atomicity'], ok: true as const });
  }
  return results;
}
