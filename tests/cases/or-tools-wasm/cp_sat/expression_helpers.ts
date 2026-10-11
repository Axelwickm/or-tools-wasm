import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid expression must throw'); }

export async function runCpSatExpressionHelperCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = new api.CpModel(), x = model.newIntVar(0, 10, 'x'), y = model.newBoolVar('y');
    const bounded = new api.BoundedLinearExpr(x.plus(y, 2).plus(3), api.Domain.fromValues([5, 10, 20]));
    assert(bounded.ok && bounded.vars[0] === x && bounded.vars[1] === y && bounded.coeffs.map(String).join(',') === '1,2' && BigInt(bounded.offset) === 3n, 'Bounded expressions expose canonical variable handles, coefficients and offset');
    const detached = bounded.coeffs; detached[0] = 99;
    assert(bounded.coeffs.map(String).join(',') === '1,2' && bounded.bounds.contains(20), 'Inspection snapshots are detached');
    model.add(bounded); model.maximize(bounded.expression);
    const solver = new api.CpSolver(); assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(bounded.expression) === 10n, 'Sparse Domain bounds and offset reach native solving');
    const constants = new api.CpModel(); constants.add(new api.BoundedLinearExpr(3, new api.Domain(3, 3)));
    assert(await new api.CpSolver().solve(constants, { executor, numWorkers: 1 }) === 'OPTIMAL', 'Constant bounded expressions support Domain construction');
    const impossible = new api.CpModel(), z = impossible.newIntVar(0, 3, 'z'); impossible.add(new api.BoundedLinearExpr(z, new api.Domain()));
    assert(await new api.CpSolver().solve(impossible, { executor, numWorkers: 1 }) === 'INFEASIBLE', 'Empty constraint domains are infeasible, not malformed models');
    const invalid = new api.BoundedLinearExpr(x.times(0.5), new api.Domain(0, 10));
    assert(!invalid.ok, 'Fractional coefficients are not valid integer constraints'); throws(() => model.add(invalid));
    results.push({ id: 'cp_sat.contract.bounded_expression_domain_inspection', solver: 'cp-sat', mode, ok: true as const });

    const imported = new api.CpModel(), a = imported.newIntVar(0, 10, 'a'), b = imported.newBoolVar('b');
    const source = { vars: [b.index, a.index, a.index], coeffs: [2, 3, -2], offset: 4 };
    const rebuilt = api.rebuildFromLinearExpressionProto(source, imported); source.coeffs.fill(0); source.offset = 99;
    const inspection = new api.BoundedLinearExpr(rebuilt, new api.Domain(0, 100));
    assert(inspection.vars[0] === a && inspection.vars[1] === b && inspection.coeffs.map(String).join(',') === '1,2' && BigInt(inspection.offset) === 4n, 'Reconstruction merges duplicate references and snapshots input');
    imported.addEquality(rebuilt, 9); imported.maximize(a);
    const importedSolver = new api.CpSolver(); assert(await importedSolver.solve(imported, { executor, numWorkers: 1 }) === 'OPTIMAL' && importedSolver.value(a) === 5n && importedSolver.value(rebuilt) === 9n, 'Rebuilt expression participates in native constraints and objectives');
    const exact = 9007199254740993n, exactModel = new api.CpModel(), exactVar = exactModel.newIntVar(0, 1, 'exact');
    const exactExpression = exactModel.rebuildFromLinearExpressionProto({ vars: [exactVar.index], coeffs: [1], offset: exact }); exactModel.addEquality(exactExpression, exact + 1n);
    const exactSolver = new api.CpSolver(); assert(await exactSolver.solve(exactModel, { executor, numWorkers: 1 }) === 'OPTIMAL' && exactSolver.value(exactExpression) === exact + 1n, 'Rebuilding preserves exact int64 offsets');
    const negated = api.rebuildFromLinearExpressionProto(b.not().expr().toProto(), imported);
    assert(BigInt(new api.BoundedLinearExpr(negated, new api.Domain(0, 1)).offset) === 1n, 'Boolean negation round trips through coefficients and offset');
    for (const malformed of [{ vars: [a.index], coeffs: [] }, { vars: [-1], coeffs: [1] }, { vars: [99], coeffs: [1] }, { vars: [a.index], coeffs: [0.5] }]) throws(() => imported.rebuildFromLinearExpressionProto(malformed));
    throws(() => exactModel.add(new api.BoundedLinearExpr(rebuilt, new api.Domain(0, 100))));
    assert(importedSolver.value(rebuilt) === 9n, 'Invalid reconstruction does not change earlier results');
    results.push({ id: 'cp_sat.correctness.rebuild_linear_expression_proto', solver: 'cp-sat', mode, ok: true as const });
  }
  return results;
}
