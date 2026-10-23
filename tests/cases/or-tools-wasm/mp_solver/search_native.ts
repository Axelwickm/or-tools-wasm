import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
import type { MPSolverCallbackData } from 'or-tools-wasm/mp-solver';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown | Promise<unknown>) { try { await run(); } catch (error) { assert(error instanceof Error, String(error)); return error; } throw new Error('Expected rejection'); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const mpSearchNativeCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mp_solver.search.starting_basis', name: 'Explicit GLOP basis warm starts preserve native statuses, rows and validation', solver: 'mp-solver',
  source: 'ortools/linear_solver/glop_interface.cc:GLOPInterface::SetStartingLpBasis', tags: ['gap-regression', 'native-contract'],
  async run({ mp: api }, { mode }) {
    const options = { ...execution(mode), parameters: { presolve: api.PresolveValues.PRESOLVE_OFF } };
    const model = new api.MpModel('basis'), x = model.addNumVariable(0,10,'x'), y = model.addNumVariable(0,10,'y');
    const rows = [model.addConstraint(-Infinity,14),model.addConstraint(-Infinity,18)];
    rows[0].setCoefficient(x,1); rows[0].setCoefficient(y,2); rows[1].setCoefficient(x,3); rows[1].setCoefficient(y,1);
    model.objective().setCoefficient(x,3); model.objective().setCoefficient(y,4); model.objective().setMaximization();
    const cold = await api.MPSolver.solve(model, options);
    const basis = { variableStatuses: [cold.basisStatus(x), cold.basisStatus(y)], constraintStatuses: rows.map(row => cold.basisStatus(row)) };
    const promise = api.MPSolver.solve(model, { ...options, startingBasis: basis }); basis.variableStatuses.length = 0;
    const warm = await promise;
    assert(warm.status === api.MPSolver.OPTIMAL && Math.abs(warm.objectiveValue! - 32.4) < 1e-8 && warm.iterations === 0n, 'Native optimal basis reaches GLOP unchanged before Solve');
    assert(cold.iterations !== null && cold.iterations > 0n && cold.objectiveValue === warm.objectiveValue, 'Explicit basis eliminates the cold simplex iterations without changing the objective');
    const correct = { variableStatuses: [warm.basisStatus(x),warm.basisStatus(y)], constraintStatuses: rows.map(row => warm.basisStatus(row)) };
    const instance = model.incremental(options);
    try { assert((await instance.solve({ startingBasis: correct })).iterations === 0n, 'Retained solves accept an explicit native starting basis too'); }
    finally { await instance.close(); }
    await rejects(() => api.MPSolver.solve(model,{ ...options,startingBasis:basis }));
    await rejects(() => api.MPSolver.solve(model,{ ...options,solverType:api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING,startingBasis:correct }));
    const raw = await api.MPSolver.solveModelRequest({solverType:api.MPSolver.GLOP_LINEAR_PROGRAMMING,
      model:{maximize:true,variable:[{lowerBound:0,upperBound:4,objectiveCoefficient:3}]}}, {
      ...execution(mode),startingBasis:{variableStatuses:[api.MPSolver.AT_UPPER_BOUND],constraintStatuses:[]} });
    assert(raw.response.objectiveValue === 12, 'Raw model requests accept the same explicit native basis input');
    assert((await api.MPSolver.solve(model,options)).hasSolution, 'Rejected bases do not poison ordinary solves');
    return {};
  },
}, {
  id: 'mp_solver.callbacks.lazy_constraints', name: 'Native SCIP callbacks forward lazy constraints, filtered values and large replies with safe lifetimes', solver: 'mp-solver',
  source: 'ortools/linear_solver/scip_interface.cc:ScipMPCallbackContext', tags: ['gap-regression','native-callback','lifecycle'],
  async run({ mp: api }, { mode }) {
    const options = { ...execution(mode), solverType: api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING };
    const model = new api.MpModel('lazy'), x = model.addIntVariable(0,4,'x');
    model.objective().setCoefficient(x,3); model.objective().setMaximization();
    const snapshots: MPSolverCallbackData[] = [];
    const callback = (data: MPSolverCallbackData) => {
      assert(data.event === 'mipNode' || data.event === 'mipSolution', 'Native event is forwarded');
      assert(typeof data.numExploredNodes === 'bigint', 'Native node counters retain int64 precision');
      snapshots.push(data);
      if (data.canQueryVariableValues) {
        assert(Object.keys(data.variableValues).join() === String(x.index()), 'Native value queries use the configured filter');
        if (data.variableValues[x.index()] > 1) return { lazyConstraints: [{ upperBound:1,
          variableIndices: Array(16384).fill(x.index()), coefficients: Array(16384).fill(1 / 16384) }] };
      }
    };
    const configuration = { callback, callbackRegistration: { mightAddLazyConstraints: true, variableIndices: [x.index()] } };
    assert(/one solver thread/.test(String(await rejects(() => api.MPSolver.solve(model,{...options,...configuration,threads:4})))),
      'Concurrent native SCIP callbacks reject before dispatch rather than returning an invalid solution');
    const constrained = await api.MPSolver.solve(model,{ ...options,...configuration });
    assert(snapshots.length > 0 && constrained.objectiveValue === 3, 'Native lazy constraints determine the checked optimum');
    const raw = await api.MPSolver.solveModelRequest({solverType:api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING,
      model:{maximize:true,variable:[{lowerBound:0,upperBound:4,isInteger:true,objectiveCoefficient:3}]}}, { ...execution(mode),...configuration });
    assert(raw.response.objectiveValue === 3, 'Raw proto solves use the same native callback transport');
    const kept = structuredClone(snapshots[0]);
    const session = model.incremental(options); let closeRejected = false;
    try {
      await rejects(() => session.solve({...configuration,threads:4}));
      assert((await session.solve({ ...configuration, callback: data => {
        void session.close().catch(error => { closeRejected = /callbacks/.test(String(error)); });
        return callback(data);
      } })).objectiveValue === 3 && closeRejected, 'Callbacks are scoped to the retained solve and prevent reentrant close');
      const error = new Error('MPSolver callback regression'); let calls = 0;
      assert(await rejects(() => session.solve({ callback: () => { calls++; throw error; } })) === error && calls === 1,
        'Original user callback errors are preserved and callbacks stop after failure');
      assert((await session.solve()).objectiveValue === 12, 'A subsequent native solve removes callback pointers and transient lazy rows');
    } finally { await session.close(); }
    assert(JSON.stringify(snapshots[0], (_, value) => typeof value === 'bigint' ? String(value) : value) === JSON.stringify(kept, (_, value) => typeof value === 'bigint' ? String(value) : value), 'Callback data owns its snapshot');
    assert((await api.MPSolver.solve(model,options)).objectiveValue === 12 && constrained.objectiveValue === 3, 'Ordinary solves and retained result objects remain independent');
    await rejects(() => api.MPSolver.solve(model,{ ...options, callback: () => ({lazyConstraints:[{upperBound:1,variableIndices:[0],coefficients:[1]}]}) }));
    await rejects(() => api.MPSolver.solve(model,{ ...options, callbackRegistration: {} }));
    await rejects(() => api.MPSolver.solve(model,{ ...options, solverType:api.MPSolver.GLOP_LINEAR_PROGRAMMING, callback: () => {} }));
    await rejects(() => api.MPSolver.solve(model,{ ...options, callback: () => {}, callbackRegistration: {variableIndices:[9]} }));
    return {};
  },
}, {
  id: 'mp_solver.callbacks.cuts', name: 'Native node callbacks accept registered user cuts and empty value filters', solver: 'mp-solver',
  source: 'ortools/linear_solver/scip_interface.cc:ScipMPCallbackContext::AddCut', tags: ['gap-regression','native-callback'],
  async run({ mp: api }, { mode }) {
    const model = new api.MpModel('clique'), variables = Array.from({length:5},(_,i) => model.addBoolVariable(`v${i}`));
    for (let i=0;i<variables.length;i++) { model.objective().setCoefficient(variables[i],1); for(let j=i+1;j<variables.length;j++) {
      const row = model.addConstraint(-Infinity,1); row.setCoefficient(variables[i],1); row.setCoefficient(variables[j],1);
    } }
    model.objective().setMaximization(); let cuts = 0;
    const result = await api.MPSolver.solve(model,{ ...execution(mode),solverType:api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING,
      solverSpecificParameters:'presolving/maxrounds = 0\nseparating/maxrounds = 0',
      callbackRegistration:{mightAddCuts:true,variableIndices:[]}, callback:data => {
        assert(Object.keys(data.variableValues).length === 0, 'Empty variable filter stays empty');
        if(data.event === 'mipNode') { cuts++; return { cuts:[{upperBound:1,variableIndices:variables.map(v=>v.index()),coefficients:variables.map(()=>1)}] }; }
      } });
    assert(cuts > 0 && result.status === api.MPSolver.OPTIMAL && result.objectiveValue === 1, `Native callback applies the valid clique cut: cuts=${cuts}, status=${result.status}, objective=${result.objectiveValue}`);
    return {};
  },
}];
