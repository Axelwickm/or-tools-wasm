import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Native proto inspection/editing workflow; snapshots deliberately replace
// Python's mutable protobuf references and helper-class identity.
export async function runCpSatProtoInspectionCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const original = new api.CpModel();
    const x = original.newIntVar(0, 10, 'x'), flag = original.newBoolVar('present');
    const row = original.add(x.ge(3)).withName('lower');
    const interval = original.newOptionalFixedSizeIntervalVar(x, 1, flag, 'task');
    original.addEquality(flag, 1); original.maximize(x);
    const variableProto: Api.IntegerVariableProto = x.proto;
    const constraintProto: Api.ConstraintProto = row.proto;
    const intervalProto: Api.IntervalConstraintProto = interval.proto;
    assert(variableProto.name === 'x' && constraintProto.name === 'lower' &&
      BigInt(intervalProto.size!.offset ?? 0) === 1n, 'Handles expose the corresponding typed native proto messages');
    assert(row.modelProto.constraints?.[row.index].name === 'lower', 'Constraint modelProto matches other handle snapshots');
    variableProto.name = 'detached'; variableProto.domain = [0, 1];
    constraintProto.linear!.domain = [0, 1]; intervalProto.start!.offset = 100;
    assert(x.name === 'x' && BigInt(x.proto.domain![1]) === 10n &&
      BigInt(row.proto.linear!.domain![0]) === 3n && BigInt(interval.proto.start!.offset ?? 0) === 0n,
      'Mutating inspection snapshots does not change the builder');
    x.withName('renamed'); row.withName('renamed-row'); interval.withName('renamed-task');
    assert(x.proto.name === 'renamed' && row.proto.name === 'renamed-row' &&
      interval.modelProto.constraints?.[interval.index].name === 'renamed-task', 'New snapshots reflect current builder edits');
    const solver = new api.CpSolver();
    assert(await solver.solve(original, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(x) === 10n,
      'Detached proto edits leave the original native model unchanged');
    results.push({ id: 'cp_sat.proto.detached_handle_inspection', solver: 'cp-sat', mode,
      source: 'ortools/sat/python/cp_model_helper.cc', tags: ['native-contract', 'proto'], ok: true as const });

    const snapshot = original.modelProto;
    snapshot.variables![x.index].domain = [4, 8];
    snapshot.constraints![row.index].linear!.domain = [6, 7];
    snapshot.constraints![interval.index].interval!.size!.offset = 2;
    snapshot.constraints![interval.index].interval!.end!.offset = 2;
    const edited = new api.CpModel(snapshot);
    snapshot.variables![x.index].domain = [0, 0]; // Constructor captures its input.
    const editedX = edited.getIntVarFromProtoIndex(x.index);
    const editedFlag = edited.getBoolVarFromProtoIndex(flag.index);
    const editedInterval = edited.getIntervalVarFromProtoIndex(interval.index);
    const importedSolver = new api.CpSolver();
    assert(await importedSolver.solve(edited, { executor, numWorkers: 1 }) === 'OPTIMAL' &&
      importedSolver.value(editedX) === 7n && importedSolver.value(editedFlag) === 1n &&
      importedSolver.value(editedInterval.endExpr()) === 9n,
      'Copy/edit/rebuild forwards domain, row and interval changes to the native solver');
    const bytes = await edited.exportModelProto();
    // createModel may return a Buffer in Node/Bun; Buffer.slice() is a view.
    const validationInputs = [new Uint8Array(bytes), await api.CpSat.createModel(edited.modelProto)];
    for (const validationBytes of validationInputs) {
      const validation = api.CpSat.validate(validationBytes, { executor });
      validationBytes.fill(255);
      const checked = await validation;
      assert(checked.ok, `Validation captures raw model bytes before asynchronous dispatch: ${checked.message}`);
    }
    results.push({ id: 'cp_sat.proto.validation_input_snapshot', solver: 'cp-sat', mode,
      source: 'javascript/lib/cp_sat/api.ts', tags: ['binding-contract', 'proto'], ok: true as const });
    const raw = await api.CpSat.solveProto(bytes, { executor, numWorkers: 1 });
    assert(raw.response && raw.response.solution?.[x.index] !== undefined && BigInt(raw.response.solution[x.index]) === 7n && solver.value(x) === 10n,
      'Rebuilt high-level models and raw native model bytes agree while prior results remain independent');
    const constants = new api.CpModel({ variables: [{ domain: [5, 5] }] });
    assert(constants.newConstant(5).index === 0, 'Rebuilding restores constant indexes without exposing cache helpers');
    assert(editedFlag.not().index === -editedFlag.index - 1, 'Negated Boolean literals use native protobuf index encoding');
    results.push({ id: 'cp_sat.proto.copy_edit_rebuild', solver: 'cp-sat', mode,
      source: 'ortools/sat/cp_model.proto', tags: ['native-contract', 'proto', 'lifecycle'], ok: true as const });

    const floating = editedX.times(0.5).plus(editedFlag, 1.5).plus(2.25);
    const terms = Array.from(floating.terms);
    assert(!floating.isInteger() && Number(floating.offset) === 2.25 &&
      Number(floating.terms.get(editedX.index)) === 0.5 && Number(floating.terms.get(editedFlag.index)) === 1.5,
      'Canonical linear terms and offsets inspect floating expressions without flat wrapper classes');
    terms[0][1] = 99;
    assert(Number(floating.terms.get(editedX.index)) === 0.5, 'Copied term entries remain detached');
    edited.maximize(floating);
    assert(await importedSolver.solve(edited, { executor, numWorkers: 1 }) === 'OPTIMAL' &&
      Math.abs(importedSolver.objectiveValue - 7.25) < 1e-9, 'Inspected floating expression reaches native CP-SAT objective conversion');
    results.push({ id: 'cp_sat.proto.flat_expression_adaptation', solver: 'cp-sat', mode,
      source: 'ortools/sat/python/linear_expr.cc', tags: ['native-contract', 'expression'], ok: true as const });
  }
  return results;
}
