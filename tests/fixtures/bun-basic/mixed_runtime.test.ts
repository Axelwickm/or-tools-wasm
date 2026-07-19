import {
  CpSat,
  CpModel,
  CpSolver,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/cp-sat';
import {
  initMPSolver,
  MPSolver,
  setExecutor as setMPSolverExecutor,
} from 'or-tools-wasm/mp-solver';
import {
  initNetworkFlow,
  setExecutor as setNetworkFlowExecutor,
  SimpleMaxFlow,
} from 'or-tools-wasm/network-flow';
import {
  initMathOpt,
  MathOpt,
  setExecutor as setMathOptExecutor,
} from 'or-tools-wasm/mathopt';
import { runBunFixture } from './shared.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCpSatSmoke() {
  CpSat.setExecutor({ type: 'worker' });
  const model = new CpModel();
  const x = model.newIntVar(0, 5, 'x');
  model.add(x.ge(3));
  model.minimize(x);
  const solver = new CpSolver();
  const status = await solver.solve(model, { numWorkers: 1 });
  assert(String(status) === 'OPTIMAL', `CP-SAT expected OPTIMAL, got ${status}`);
  assert(solver.value(x) === 3, `CP-SAT expected x=3, got ${solver.value(x)}`);
}

async function runMPSolverSmoke() {
  setMPSolverExecutor({ type: 'worker' });
  await initMPSolver();
  const solver = new MPSolver('bun_mixed_runtime_mp', MPSolver.GLOP_LINEAR_PROGRAMMING);
  const x = solver.NumVar(0, solver.infinity(), 'x');
  const y = solver.NumVar(0, solver.infinity(), 'y');
  const capacity = solver.Constraint(0, 14);
  capacity.SetCoefficient(x, 1);
  capacity.SetCoefficient(y, 2);
  solver.Objective().SetCoefficient(x, 3);
  solver.Objective().SetCoefficient(y, 4);
  solver.Objective().SetMaximization();
  const status = await solver.Solve();
  assert(status === MPSolver.OPTIMAL, `MPSolver expected OPTIMAL, got ${status}`);
  assert(Math.abs(solver.Objective().Value() - 42) < 1e-7, `MPSolver objective mismatch: ${solver.Objective().Value()}`);
  solver.delete();
}

async function runNetworkFlowSmoke() {
  setNetworkFlowExecutor({ type: 'direct' });
  await initNetworkFlow();
  const maxFlow = new SimpleMaxFlow();
  maxFlow.add_arcs_with_capacity([0, 0, 1, 2], [1, 2, 3, 3], [5, 3, 4, 4]);
  const status = await maxFlow.solve(0, 3);
  assert(status === SimpleMaxFlow.OPTIMAL, `SimpleMaxFlow expected OPTIMAL, got ${status}`);
  assert(maxFlow.optimal_flow() === 7, `SimpleMaxFlow expected flow 7, got ${maxFlow.optimal_flow()}`);
}

async function runMathOptSmoke() {
  setMathOptExecutor({ type: 'worker' });
  await initMathOpt();
  const model = MathOpt.Model('bun_mixed_runtime_mathopt');
  const x = model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x' });
  model.objective.setLinearCoefficient(x, 1);
  model.objective.isMaximize = true;
  const result = await MathOpt.solve(model, { solverType: MathOpt.SolverType.GLOP, threads: 1 });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `MathOpt expected OPTIMAL, got ${result.terminationReason}`);
  assert(result.objectiveValue === 1, `MathOpt expected objective 1, got ${result.objectiveValue}`);
}

await runBunFixture(async () => {
  await runCpSatSmoke();
  await terminateLoadedRuntimeThreads();
  await runMPSolverSmoke();
  await terminateLoadedRuntimeThreads();
  await runNetworkFlowSmoke();
  await terminateLoadedRuntimeThreads();
  await runMathOptSmoke();
  await terminateLoadedRuntimeThreads();
  console.log('bun mixed runtime smoke passed');
}, async () => {
  CpSat.setExecutor({ type: 'auto' });
  setMPSolverExecutor({ type: 'direct' });
  setNetworkFlowExecutor({ type: 'auto' });
  setMathOptExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
