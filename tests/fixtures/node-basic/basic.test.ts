import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import {
  MPSolver,
  MPSolverParameters,
} from 'or-tools-wasm/mp-solver';
import * as MPSolverApi from 'or-tools-wasm/mp-solver';
import {
  KnapsackSolver,
  KnapsackSolverType,
} from 'or-tools-wasm/knapsack';
import {
  SimpleLinearSumAssignment,
  SimpleLinearSumAssignmentStatus,
  SimpleMaxFlow,
  SimpleMaxFlowStatus,
  SimpleMinCostFlow,
  SimpleMinCostFlowStatus,
} from 'or-tools-wasm/network-flow';
import {
  ConsistencyLevel,
  ElementDegreeSolutionGenerator,
  GreedySolutionGenerator,
  GuidedLocalSearch,
  RandomSolutionGenerator,
  SetCoverInvariant,
  SetCoverModel,
  SteepestSearch,
  TrivialSolutionGenerator,
} from 'or-tools-wasm/set-cover';
import { MathOpt } from 'or-tools-wasm/mathopt';
import * as PdlpApi from 'or-tools-wasm/pdlp';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import {
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  defaultRoutingSearchParameters,
  defaultRoutingModelParameters,
  findErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm/routing';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { cpSatCases, runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runCpSatHighLevelContractCases } from '../../cases/or-tools-wasm/cp_sat/high_level_contract.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runCpSatThreadReuseCase } from '../../cases/or-tools-wasm/cp_sat/thread_reuse.ts';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { runKnapsackConcurrencyCase } from '../../cases/or-tools-wasm/knapsack/concurrency.ts';
import { runKnapsackEventHandlerCase } from '../../cases/or-tools-wasm/knapsack/event_handler.ts';
import { runKnapsackWorkerLifecycleCase } from '../../cases/or-tools-wasm/knapsack/worker_lifecycle.ts';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { runNetworkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { runNetworkFlowConcurrencyCase } from '../../cases/or-tools-wasm/network_flow/concurrency.ts';
import { runNetworkFlowEventHandlerCase } from '../../cases/or-tools-wasm/network_flow/event_handler.ts';
import { runNetworkFlowWorkerLifecycleCase } from '../../cases/or-tools-wasm/network_flow/worker_lifecycle.ts';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { runRcpspConcurrencyCase } from '../../cases/or-tools-wasm/rcpsp/concurrency.ts';
import { runRcpspEventHandlerCase } from '../../cases/or-tools-wasm/rcpsp/event_handler.ts';
import { runRcpspWorkerLifecycleCase } from '../../cases/or-tools-wasm/rcpsp/worker_lifecycle.ts';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runRoutingConcurrencyCase } from '../../cases/or-tools-wasm/routing/concurrency.ts';
import { runRoutingWorkerLifecycleCase } from '../../cases/or-tools-wasm/routing/worker_lifecycle.ts';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';
import { runSetCoverConcurrencyCase } from '../../cases/or-tools-wasm/set_cover/concurrency.ts';
import { runSetCoverEventHandlerCase } from '../../cases/or-tools-wasm/set_cover/event_handler.ts';
import { runSetCoverWorkerLifecycleCase } from '../../cases/or-tools-wasm/set_cover/worker_lifecycle.ts';
import { runSolverConcurrencyCase } from '../../cases/or-tools-wasm/solver_concurrency.ts';
import { runSolverPeakConcurrencyCase, runSolverRestartCase, runSolverReuseCase } from '../../cases/or-tools-wasm/solver_reuse.ts';
import { runMpSolverConcurrencyCase } from '../../cases/or-tools-wasm/mp_solver/concurrency.ts';

type NamedCaseResult = {
  id?: string;
  name?: string;
  ok?: boolean;
};

function caseLabel(result: NamedCaseResult) {
  return result.id ?? result.name ?? '<unnamed case>';
}

async function assertCaseResults(t: TestContext, runtime: string, results: NamedCaseResult[]) {
  for (const result of results) {
    await t.test(`${runtime}: ${caseLabel(result)}`, () => {
      assert.equal(result.ok, true, `${runtime} case failed: ${JSON.stringify(result)}`);
    });
  }
}

test('runs the shared high-level CP-SAT Python parity cases in Node', async (t) => {
  const structureResults = await runCpSatSolverStructureCases(CpSatApi as never);
  await assertCaseResults(t, 'node CP-SAT solver structure', structureResults);

  const results = await runCpSatHighLevelParityCasesForPackage(CpSatApi);
  await assertCaseResults(t, 'node high-level CP-SAT', results);
});

test('runs the first-party high-level CP-SAT contract cases in Node', async (t) => {
  const results = await runCpSatHighLevelContractCases(CpSatApi as never);
  await assertCaseResults(t, 'node high-level CP-SAT contract', results);
});

test('runs the shared proto CP-SAT cases in Node', async (t) => {
  const results = await runCpSatCases(CpSat);

  for (const result of results) {
    assert.equal(result.cases.length, cpSatCases.length, `node ${result.workerProfile} case count`);
    await assertCaseResults(t, `node CP-SAT ${result.mode}/${result.workerProfile}`, result.cases);
  }
});

test('enforces the CP-SAT worker job lifecycle in Node', async () => {
  await runCpSatWorkerLifecycleCase(CpSat as never);
});

test('enforces CP-SAT local solve concurrency in Node', async () => {
  await runCpSatConcurrencyCase(CpSatApi as never);
});

test('reuses CP-SAT threads across repeated solves in Node', async () => {
  await runCpSatThreadReuseCase(CpSat as never);
});

test('runs the shared Routing cases in Node', async (t) => {
  const routingResults = await runRoutingCases({
    BOOL_FALSE,
    BOOL_UNSPECIFIED,
    BoundCost,
    defaultRoutingModelParameters,
    defaultRoutingSearchParameters,
    findErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingIndexManager as never,
    RoutingModel: RoutingModel as never,
  }, { modes: executorFixtureModes });
  await assertCaseResults(t, 'node routing', routingResults);
});

test('enforces the Routing worker job lifecycle in Node', async () => {
  await runRoutingWorkerLifecycleCase({ RoutingIndexManager, RoutingModel } as never);
});

test('enforces Routing local solve concurrency in Node', async () => {
  await runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never);
});

test('runs the shared MPSolver cases in Node', async (t) => {
  const mpSolverResults = await runMPSolverCases({
    MPSolver,
    MPSolverParameters,
  }, { modes: executorFixtureModes });
  await assertCaseResults(t, 'node MPSolver', mpSolverResults);
});

test('runs the shared Knapsack cases in Node', async (t) => {
  const knapsackResults = await runKnapsackCases({
    KnapsackSolver,
    KnapsackSolverType,
  });
  await assertCaseResults(t, 'node Knapsack', knapsackResults);
});

test('cancels and recovers the Knapsack worker in Node', async () => {
  await runKnapsackWorkerLifecycleCase({ KnapsackSolver, KnapsackSolverType });
});

test('enforces Knapsack local solve concurrency in Node', async () => {
  await runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType });
});

test('isolates Knapsack event-handler errors in Node', async () => {
  await runKnapsackEventHandlerCase({ KnapsackSolver, KnapsackSolverType });
});

test('runs the shared Network Flow cases in Node', async (t) => {
  const networkFlowResults = await runNetworkFlowCases({
    SimpleMaxFlow,
    SimpleMaxFlowStatus,
    SimpleMinCostFlow,
    SimpleMinCostFlowStatus,
    SimpleLinearSumAssignment,
    SimpleLinearSumAssignmentStatus,
  });
  await assertCaseResults(t, 'node Network Flow', networkFlowResults);
});

test('enforces Network Flow solve concurrency in Node', async () => {
  await runNetworkFlowConcurrencyCase({ SimpleMaxFlow });
});

test('cancels and recovers the Network Flow worker in Node', async () => {
  await runNetworkFlowWorkerLifecycleCase({ SimpleMaxFlow });
});

test('isolates Network Flow event-handler errors in Node', async () => {
  await runNetworkFlowEventHandlerCase({ SimpleMaxFlow });
});

test('preserves exact int64 values across direct and worker WASM boundaries', async () => {
  const exact = 9_007_199_254_740_993n;

  for (const executor of ['direct', 'worker'] as const) {
    const knapsack = new KnapsackSolver(
      KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
      `exact-${executor}`,
    );
    knapsack.init([exact], [[1]], [1]);
    assert.equal(await knapsack.solve({ executor }), exact, `Knapsack ${executor}`);

    const flow = new SimpleMaxFlow();
    flow.addArcWithCapacity(0, 1, exact);
    assert.equal(await flow.solve(0, 1, { executor }), SimpleMaxFlowStatus.OPTIMAL);
    assert.equal(flow.optimalFlow(), exact, `Network Flow ${executor}`);

    const manager = new RoutingIndexManager(2, 1, 0);
    const routing = new RoutingModel(manager);
    const transit = routing.registerTransitMatrix([[0n, exact], [0n, 0n]]);
    routing.setArcCostEvaluatorOfAllVehicles(transit);
    const assignment = await routing.solve({ executor });
    assert.equal(assignment?.objectiveValue(), exact, `Routing ${executor}`);
  }
});

test('runs the shared Set Cover cases in Node', async (t) => {
  const setCoverResults = await runSetCoverCases({
    SetCoverModel,
    SetCoverInvariant,
    TrivialSolutionGenerator,
    RandomSolutionGenerator,
    GreedySolutionGenerator,
    ElementDegreeSolutionGenerator,
    SteepestSearch,
    GuidedLocalSearch,
    ConsistencyLevel,
  });
  await assertCaseResults(t, 'node Set Cover', setCoverResults);
});

test('enforces Set Cover solve concurrency in Node', async () => {
  await runSetCoverConcurrencyCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator });
});

test('cancels and recovers the Set Cover worker in Node', async () => {
  await runSetCoverWorkerLifecycleCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator });
});

test('isolates Set Cover event-handler errors in Node', async () => {
  await runSetCoverEventHandlerCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator });
});

test('runs the shared RCPSP cases in Node', async (t) => {
  const rcpspResults = await runRcpspCases(RcpspApi);
  await assertCaseResults(t, 'node RCPSP', rcpspResults);
});

test('enforces RCPSP solve concurrency in Node', async () => {
  await runRcpspConcurrencyCase(RcpspApi);
});

test('cancels and recovers the RCPSP worker in Node', async () => {
  await runRcpspWorkerLifecycleCase(RcpspApi);
});

test('isolates RCPSP event-handler errors in Node', async () => {
  await runRcpspEventHandlerCase(RcpspApi);
});

test('runs the shared MathOpt cases in Node', async (t) => {
  const mathOptResults = await runMathOptCases({
    MathOpt,
  }, { modes: executorFixtureModes });
  await assertCaseResults(t, 'node MathOpt', mathOptResults);
});

test('runs the shared PDLP cases in Node', async (t) => {
  const pdlpResults = await runPdlpCases(PdlpApi);
  await assertCaseResults(t, 'node PDLP', pdlpResults);
});

test('reuses every solver runtime across repeated operations in Node', async () => {
  await runSolverReuseCase([
    { solver: 'cp-sat', run: () => runCpSatConcurrencyCase(CpSatApi as never) },
    { solver: 'mathopt-pdlp', run: () => runSolverConcurrencyCase({ MathOpt } as never, PdlpApi as never) },
    { solver: 'mp-solver', run: () => runMpSolverConcurrencyCase(MPSolverApi as never) },
    { solver: 'routing', run: () => runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never) },
    { solver: 'knapsack', run: () => runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType }) },
    { solver: 'network-flow', run: () => runNetworkFlowConcurrencyCase({ SimpleMaxFlow }) },
    { solver: 'set-cover', run: () => runSetCoverConcurrencyCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator }) },
    { solver: 'rcpsp', run: () => runRcpspConcurrencyCase(RcpspApi) },
  ]);
});

test('restarts every solver runtime after thread teardown in Node', async () => {
  await runSolverRestartCase([
    { solver: 'cp-sat', run: () => runCpSatConcurrencyCase(CpSatApi as never) },
    { solver: 'mathopt-pdlp', run: () => runSolverConcurrencyCase({ MathOpt } as never, PdlpApi as never) },
    { solver: 'mp-solver', run: () => runMpSolverConcurrencyCase(MPSolverApi as never) },
    { solver: 'routing', run: () => runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never) },
    { solver: 'knapsack', run: () => runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType }) },
    { solver: 'network-flow', run: () => runNetworkFlowConcurrencyCase({ SimpleMaxFlow }) },
    { solver: 'set-cover', run: () => runSetCoverConcurrencyCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator }) },
    { solver: 'rcpsp', run: () => runRcpspConcurrencyCase(RcpspApi) },
  ], CpSatApi.terminateLoadedRuntimeThreads);
});

test('runs every solver runtime concurrently in Node', async () => {
  await runSolverPeakConcurrencyCase([
    { solver: 'cp-sat', run: () => runCpSatConcurrencyCase(CpSatApi as never) },
    { solver: 'mathopt-pdlp', run: () => runSolverConcurrencyCase({ MathOpt } as never, PdlpApi as never) },
    { solver: 'mp-solver', run: () => runMpSolverConcurrencyCase(MPSolverApi as never) },
    { solver: 'routing', run: () => runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never) },
    { solver: 'knapsack', run: () => runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType }) },
    { solver: 'network-flow', run: () => runNetworkFlowConcurrencyCase({ SimpleMaxFlow }) },
    { solver: 'set-cover', run: () => runSetCoverConcurrencyCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator }) },
    { solver: 'rcpsp', run: () => runRcpspConcurrencyCase(RcpspApi) },
  ]);
});
