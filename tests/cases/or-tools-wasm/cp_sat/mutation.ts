import { runCpSatProtoInspectionCases } from './proto_inspection.ts';
import { runCpSatNumericalCases } from './numerical.ts';
import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid mutation must throw'); }

export async function runCpSatMutationCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = new api.CpModel(), solver = new api.CpSolver();
    const x = model.newIntVar(0, 10, 'old-x'), bool = model.newBoolVar('old-b'), not = bool.not();
    const row = model.add(x.ge(2)).withName('old-row'); model.maximize(x);
    assert(x.withName('x-日本') === x && row.withName('row') === row, 'Fluent names return the same handle');
    bool.name = 'flag'; assert(String(not.name) === 'not(flag)', 'Negated names follow live variable names');
    x.domain = api.Domain.fromValues([3, 5, 7]); row.name = 'lower';
    const proto = model.modelProto;
    assert(proto.variables?.[x.index].name === 'x-日本' && proto.constraints?.[row.index].name === 'lower', 'Names update the model protobuf');
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(x) === 7n, 'Native solve uses replacement domain with holes');
    assert(x.withDomain(new api.Domain(1, 4)) === x && await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(x) === 4n, 'Replacement can both narrow and widen a domain');
    x.withDomain(new api.Domain(0, 9));
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(x) === 9n, 'Wider replacement loosens earlier bounds');
    const clone = model.clone(); clone.getIntVarFromProtoIndex(x.index).withName('clone').withDomain(new api.Domain(2, 2));
    const cloneSolver = new api.CpSolver();
    assert(await cloneSolver.solve(clone, { executor, numWorkers: 1 }) === 'OPTIMAL' && cloneSolver.value(clone.getIntVarFromProtoIndex(x.index)) === 2n && x.domain.max() === 9n, 'Clones and original domains remain independent');
    const detached = x.domain.flatIntervals; detached[1] = 0; assert(x.domain.max() === 9n, 'Domain getters return detached bounds');
    throws(() => { x.domain = [] as unknown as Api.Domain; }); throws(() => x.withName(42 as unknown as string));
    assert(String(x.name) === 'x-日本' && x.domain.max() === 9n, 'Rejected mutations leave model state intact');
    x.domain = new api.Domain();
    assert((await api.CpSat.validate(await api.CpSat.createModel(model.modelProto), { executor })).ok === false
      && await solver.solve(model, { executor, numWorkers: 1 }) === 'MODEL_INVALID', 'Empty domains reach native model validation without invented feasibility');
    x.domain = new api.Domain(2, 3);
    assert(await solver.solve(model, { executor, numWorkers: 1 }) === 'OPTIMAL' && solver.value(x) === 3n, 'Domain mutation recovers from invalid models');
    model.removeAllNames(); assert(String(x.name) === '' && String(not.name) === '' && String(row.name) === '', 'Name removal updates every handle');
    results.push({ id: 'cp_sat.correctness.variable_name_domain_mutation', solver: 'cp-sat', mode, ok: true as const });

    const intervals = new api.CpModel(), start = intervals.newIntVar(0, 5, 'start');
    const interval = intervals.newFixedSizeIntervalVar(start, 2, 'old-interval');
    const alias = intervals.getIntervalVarFromProtoIndex(interval.index), constraint = new api.Constraint(intervals, interval.index);
    interval.name = 'native-interval'; assert(String(alias.name) === 'native-interval' && String(constraint.name) === 'native-interval', 'Interval assignment updates restored and constraint handles');
    assert(alias.withName('renamed-interval') === alias && String(interval.name) === 'renamed-interval', 'Interval fluent rename updates original handle');
    constraint.name = 'shared-name'; assert(intervals.modelProto.constraints?.[interval.index].name === 'shared-name' && String(interval.name) === 'shared-name', 'Constraint setters share native interval metadata');
    intervals.addNoOverlap([interval]); intervals.maximize(start);
    const intervalSolver = new api.CpSolver(); assert(await intervalSolver.solve(intervals, { executor, numWorkers: 1 }) === 'OPTIMAL' && intervalSolver.value(start) === 5n, 'Renamed interval remains valid in native scheduling');
    const invalid = new api.CpModel(), flag = invalid.newBoolVar('flag');
    const invalidRow = invalid.addBoolOr([flag]).withName('before'); invalidRow.name = 'native-renamed-row'; flag.domain = new api.Domain(2, 3);
    const validation = await api.CpSat.validate(await api.CpSat.createModel(invalid.modelProto), { executor });
    assert(!validation.ok && validation.message.includes('native-renamed-row'), 'Native diagnostic sees renamed constraint and changed Boolean domain');
    throws(() => invalid.addBoolOr([flag])); flag.withDomain(new api.Domain(0, 1));
    assert((await api.CpSat.validate(await api.CpSat.createModel(invalid.modelProto), { executor })).ok, 'Boolean checks use the current domain and recover after edits');
    intervals.removeAllNames(); assert(String(interval.name) === '' && String(alias.name) === '' && String(constraint.name) === '', 'Interval name getters stay live after removeAllNames');
    results.push({ id: 'cp_sat.contract.interval_constraint_name_mutation', solver: 'cp-sat', mode, ok: true as const });

    const constants = new api.CpModel(), old = constants.newConstant(5); old.domain = new api.Domain(7);
    const fresh = constants.newConstant(5), out = constants.newIntVar(0, 10, 'out'); constants.addEquality(out, fresh);
    assert(fresh.index !== old.index, 'Constant cache discards an index whose domain changed');
    const constantSolver = new api.CpSolver(); assert(await constantSolver.solve(constants, { executor, numWorkers: 1 }) === 'OPTIMAL' && constantSolver.value(old) === 7n && constantSolver.value(out) === 5n, 'Native constraints use a fresh correct constant after cache invalidation');
    const exactModel = new api.CpModel(), exact = 9007199254740993n, exactVar = exactModel.newIntVar(0, 1, 'exact');
    exactVar.withDomain(api.Domain.fromValues([exact, exact + 2n])); exactModel.addEquality(exactVar, exact + 2n);
    const exactSolver = new api.CpSolver(); assert(await exactSolver.solve(exactModel, { executor, numWorkers: 1 }) === 'OPTIMAL' && exactSolver.value(exactVar) === exact + 2n, 'Domain replacement preserves exact int64 values through native execution');
    results.push({ id: 'cp_sat.correctness.domain_mutation_constants_exactness', solver: 'cp-sat', mode, ok: true as const });
  }
  results.push(...await runCpSatProtoInspectionCases(api));
  results.push(...await runCpSatNumericalCases(api));
  return results;
}
