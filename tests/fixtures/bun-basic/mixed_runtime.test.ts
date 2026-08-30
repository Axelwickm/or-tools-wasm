import {
  CpModel,
  CpSolver,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/cp-sat';
import {
  MPSolver,
} from 'or-tools-wasm/mp-solver';
import {
  initNetworkFlow,
  setExecutor as setNetworkFlowExecutor,
  SimpleMaxFlow,
} from 'or-tools-wasm/network-flow';
import { MathOpt } from 'or-tools-wasm/mathopt';
import { runBunFixture } from './shared.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCpSatSmoke() {
  const model = new CpModel();
  const x = model.newIntVar(0, 5, 'x');
  model.add(x.ge(3));
  model.minimize(x);
  const solver = new CpSolver();
  const status = await solver.solve(model, {
    executor: 'worker',
    numWorkers: 1,
  });
  assert(String(status) === 'OPTIMAL', `CP-SAT expected OPTIMAL, got ${status}`);
  assert(solver.value(x) === 3, `CP-SAT expected x=3, got ${solver.value(x)}`);
}

async function runMPSolverSmoke() {
  const solver = new MPSolver('bun_mixed_runtime_mp', MPSolver.GLOP_LINEAR_PROGRAMMING);
  const x = solver.addNumVariable(0, solver.infinity(), 'x');
  const y = solver.addNumVariable(0, solver.infinity(), 'y');
  const capacity = solver.addConstraint(0, 14);
  capacity.setCoefficient(x, 1);
  capacity.setCoefficient(y, 2);
  solver.objective().setCoefficient(x, 3);
  solver.objective().setCoefficient(y, 4);
  solver.objective().setMaximization();
  const status = await solver.solve({ executor: 'worker' });
  assert(status === MPSolver.OPTIMAL, `MPSolver expected OPTIMAL, got ${status}`);
  assert(Math.abs(solver.objective().value() - 42) < 1e-7, `MPSolver objective mismatch: ${solver.objective().value()}`);
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
  const model = MathOpt.Model('bun_mixed_runtime_mathopt');
  const x = model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x' });
  model.objective.setLinearCoefficient(x, 1);
  model.objective.isMaximize = true;
  const result = await MathOpt.solve(model, {
    executor: 'worker',
    solverType: MathOpt.SolverType.GLOP,
    threads: 1,
  });
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
  setNetworkFlowExecutor({ type: 'auto' });
  await terminateLoadedRuntimeThreads();
});
