import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
import type { CpModelProto, IntValue } from 'or-tools-wasm/cp-sat';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid solution-check input to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
const expression = (index: number) => ({ vars: [index], coeffs: [1] });

export const cpSatSolutionCheckCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'cp_sat.feasibility.model_and_proto', name: 'Native checker preserves explicit point semantics, exact integers and existing solve results', solver: 'cp-sat',
  source: 'ortools/sat/cp_model_checker.h:SolutionIsFeasible', tags: ['native-contract', 'gap-regression'],
  async run({ cpSat: { CpSat, CpModel, CpSolver, sum } }, { mode }) {
    const options = execution(mode), model = new CpModel();
    const x = model.newIntVar(0, 4, 'x'), y = model.newIntVar(0, 4, 'y');
    model.addLinearConstraint(sum([x, y]), 4, 8); model.maximize(sum([x, y]));
    assert(await CpSat.solutionIsFeasible(model, [1n, 3], options), 'Nonoptimal point is feasible without solving');
    assert(!await model.solutionIsFeasible([1, 1], options), 'Linear violation returns false');
    assert(!await model.solutionIsFeasible([5, 0], options), 'Domain violation returns false');
    assert(!await model.solutionIsFeasible([4], options) && !await model.solutionIsFeasible([4, 4, 0], options), 'Native incomplete/extra vector returns false');
    const solver = new CpSolver();
    await solver.solve(model, { ...options, numWorkers: 1 });
    const before = solver.response;
    assert(before && await model.solutionIsFeasible(before.solution ?? [], options), 'Native answer can be checked explicitly');
    assert(!await model.solutionIsFeasible([0, 0], options) && solver.value(x) === 4n && solver.value(y) === 4n,
      'Checking a different point preserves the facade solve result');
    const point: CpModelProto = { variables: [{ domain: [-9007199254740993n, 9007199254740993n] }],
      constraints: [{ linear: { vars: [0], coeffs: [1], domain: [9007199254740993n, 9007199254740993n] } }] };
    assert(await CpSat.solutionIsFeasibleProto(point, [9007199254740993n], options), 'Large exact value passes');
    assert(!await CpSat.solutionIsFeasibleProto(point, [9007199254740992n], options), 'Adjacent exact large value fails');
    const raw = await CpSat.createModel(point);
    assert(await CpSat.solutionIsFeasibleProto(raw, new BigInt64Array([9007199254740993n]), options), 'Byte model and typed integer vector are supported');
    const objective: CpModelProto = { variables: [{ domain: [0, 3] }], objective: { vars: [0], coeffs: [1], domain: [2, 3] } };
    assert(await CpSat.solutionIsFeasibleProto(objective, [2], options) && !await CpSat.solutionIsFeasibleProto(objective, [1], options), 'Native objective domain is checked');
    const assumptions: CpModelProto = { variables: [{ domain: [0, 1] }], assumptions: [0], solutionHint: { vars: [0], values: [1] } };
    assert(await CpSat.solutionIsFeasibleProto(assumptions, [0], options), 'Native checker does not enforce assumptions or hints');
    assert(await CpSat.solutionIsFeasibleProto({}, [], options), 'Empty model and point are natively feasible');
    return {};
  },
}, {
  id: 'cp_sat.feasibility.global_constraints', name: 'Global, nonlinear, Boolean and scheduling constraints are evaluated by the native checker', solver: 'cp-sat',
  source: 'ortools/sat/cp_model_checker.cc:ConstraintChecker', tags: ['native-contract', 'global-constraints'],
  async run({ cpSat: { CpSat } }, { mode }) {
    const options = execution(mode);
    const check = async (model: CpModelProto, feasible: IntValue[], infeasible: IntValue[]) => {
      assert(await CpSat.solutionIsFeasibleProto(model, feasible, options), 'Native feasible global point passes');
      assert(!await CpSat.solutionIsFeasibleProto(model, infeasible, options), 'Native violated global point fails');
    };
    const variables = Array.from({ length: 3 }, () => ({ domain: [0, 6] }));
    await check({ variables, constraints: [{ allDiff: { exprs: [expression(0), expression(1), expression(2)] } }] }, [1, 2, 3], [1, 1, 3]);
    await check({ variables, constraints: [{ intProd: { target: expression(2), exprs: [expression(0), expression(1)] } }] }, [2, 3, 6], [2, 3, 5]);
    await check({ variables, constraints: [{ intDiv: { target: expression(2), exprs: [expression(0), { offset: 2 }] } }] }, [5, 0, 2], [5, 0, 3]);
    await check({ variables, constraints: [{ intMod: { target: expression(2), exprs: [expression(0), { offset: 2 }] } }] }, [5, 0, 1], [5, 0, 0]);
    await check({ variables, constraints: [{ linMax: { target: expression(2), exprs: [expression(0), expression(1)] } }] }, [2, 3, 3], [2, 3, 4]);
    await check({ variables, constraints: [{ element: { linearIndex: expression(0), linearTarget: expression(2), exprs: [{ offset: 2 }, { offset: 3 }] } }] }, [1, 0, 3], [1, 0, 2]);
    await check({ variables, constraints: [{ table: { exprs: [expression(0), expression(1)], values: [1, 2, 3, 4] } }] }, [1, 2, 0], [1, 3, 0]);
    const bools = Array.from({ length: 3 }, () => ({ domain: [0, 1] }));
    await check({ variables: bools, constraints: [{ enforcementLiteral: [0], boolOr: { literals: [1, -3] } }] }, [1, 0, 0], [1, 0, 1]);
    await check({ variables: bools, constraints: [{ exactlyOne: { literals: [0, 1, 2] } }] }, [0, 1, 0], [1, 1, 0]);
    await check({ variables: bools, constraints: [{ circuit: { tails: [0, 1, 0], heads: [1, 0, 0], literals: [0, 1, 2] } }] }, [1, 1, 0], [1, 0, 0]);
    const scheduling: CpModelProto = { variables: [{ domain: [0, 6] }, { domain: [0, 6] }], constraints: [
      { interval: { start: expression(0), size: { offset: 2 }, end: { vars: [0], coeffs: [1], offset: 2 } } },
      { interval: { start: expression(1), size: { offset: 2 }, end: { vars: [1], coeffs: [1], offset: 2 } } },
      { noOverlap: { intervals: [0, 1] } },
    ] };
    await check(scheduling, [0, 2], [0, 1]);
    scheduling.constraints![2] = { interval: { start: { offset: 0 }, size: { offset: 2 }, end: { offset: 2 } } };
    scheduling.constraints!.push({ noOverlap2d: { xIntervals: [0, 1], yIntervals: [2, 2] } });
    await check(scheduling, [0, 2], [0, 1]);
    await check({ variables: bools.slice(0, 2), constraints: [{ automaton: {
      exprs: [expression(0), expression(1)], startingState: 0, finalStates: [2],
      transitionTail: [0, 1], transitionHead: [1, 2], transitionLabel: [0, 1],
    } }] }, [0, 1], [1, 1]);
    await check({ variables: [...bools, { domain: [0, 1] }], constraints: [{ inverse: { fDirect: [0, 1], fInverse: [2, 3] } }] }, [0, 1, 0, 1], [1, 0, 0, 1]);
    scheduling.constraints!.length = 3;
    scheduling.constraints![2] = { cumulative: { capacity: { offset: 2 }, intervals: [0, 1], demands: [{ offset: 2 }, { offset: 1 }] } };
    await check(scheduling, [0, 2], [0, 1]);
    await check({ variables, constraints: [{ reservoir: { minLevel: 0, maxLevel: 1,
      timeExprs: [expression(0), expression(1)], levelChanges: [{ offset: 1 }, { offset: -1 }] } }] }, [0, 1, 0], [1, 0, 0]);
    return {};
  },
}, {
  id: 'cp_sat.feasibility.validation_and_snapshots', name: 'Checks snapshot input data and reject malformed models and values with recovery', solver: 'cp-sat',
  source: 'ortools/sat/cp_model_checker.h:ValidateCpModel/SolutionIsFeasible', tags: ['native-contract', 'lifecycle'],
  async run({ cpSat: { CpSat, CpModel, Domain } }, { mode }) {
    const options = execution(mode), model = new CpModel(), x = model.newIntVar(0, 1);
    const values = [1];
    const pending = CpSat.solutionIsFeasible(model, values, options);
    x.domain = Domain.fromIntervals([[0, 0]]); values[0] = 2;
    assert(await pending, 'Model and values are captured before awaiting');
    assert(!await model.solutionIsFeasible([1], options), 'Later calls use current model');
    const proto: CpModelProto = { variables: [{ domain: [0, 1] }] };
    const objectPending = CpSat.solutionIsFeasibleProto(proto, [1], options);
    proto.variables![0].domain = [0, 0];
    assert(await objectPending, 'Object model is serialized eagerly');
    const bytes = await CpSat.createModel({ variables: [{ domain: [0, 1] }] });
    const vector = new BigInt64Array([1n]);
    const bytePending = CpSat.solutionIsFeasibleProto(bytes, vector, options);
    bytes.fill(255); vector[0] = 2n;
    assert(await bytePending, 'Model bytes and typed values are copied before yielding');
    for (const value of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, 1n << 63n, -(1n << 63n) - 1n]) {
      await rejects(() => CpSat.solutionIsFeasibleProto({}, [value], options));
    }
    await rejects(() => CpSat.solutionIsFeasibleProto(new Uint8Array([255]), [], options));
    await rejects(() => CpSat.solutionIsFeasibleProto({ variables: [{ domain: [0] }] }, [0], options));
    await rejects(() => CpSat.solutionIsFeasibleProto({ constraints: [{ boolOr: { literals: [12] } }] }, [], options));
    const abort = new AbortController(); abort.abort();
    await rejects(() => CpSat.solutionIsFeasibleProto({}, [], { ...options, signal: abort.signal }));
    const large: CpModelProto = { variables: Array.from({ length: 9000 }, () => ({ domain: [0, 1] })) };
    assert(await CpSat.solutionIsFeasibleProto(large, Array(9000).fill(0), options), 'Large point survives binary request transport and memory growth');
    assert(await CpSat.solutionIsFeasibleProto({}, [], options), 'Checker remains usable after all failures');
    return {};
  },
}];
