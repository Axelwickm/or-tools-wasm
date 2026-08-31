import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import { packageName, version } from 'or-tools-wasm';
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
import * as SetCoverApi from 'or-tools-wasm/set-cover';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import { MathOpt } from 'or-tools-wasm/mathopt';
import * as PdlpApi from 'or-tools-wasm/pdlp';
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
import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runCpSatThreadReuseCase } from '../../cases/or-tools-wasm/cp_sat/thread_reuse.ts';
import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';
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
import { runSolverReuseCase } from '../../cases/or-tools-wasm/solver_reuse.ts';
import { runMpSolverConcurrencyCase } from '../../cases/or-tools-wasm/mp_solver/concurrency.ts';

type NamedCaseResult = {
  id?: string;
  name?: string;
  ok?: boolean;
};

function caseLabel(result: NamedCaseResult) {
  return result.id ?? result.name ?? '<unnamed case>';
}

async function assertCaseSteps(t: Deno.TestContext, runtime: string, results: NamedCaseResult[]) {
  for (const result of results) {
    await t.step(`${runtime}: ${caseLabel(result)}`, () => {
      if (result.ok !== true) {
        throw new Error(`${runtime} case failed: ${JSON.stringify(result)}`);
      }
    });
  }
}

Deno.test('validates CP-SAT execution semantics in Deno', async (t) => {
  const results = await runCpSatSubsolverCases(CpSat as never);
  await assertCaseSteps(t, 'deno CP-SAT execution semantics', results);
});

Deno.test('enforces the CP-SAT worker job lifecycle in Deno', async () => {
  await runCpSatWorkerLifecycleCase(CpSat as never);
});

Deno.test('enforces CP-SAT local solve concurrency in Deno', async () => {
  await runCpSatConcurrencyCase(CpSatApi as never);
});

Deno.test('reuses CP-SAT threads across repeated solves in Deno', async () => {
  await runCpSatThreadReuseCase(CpSat as never);
});

Deno.test('reuses every solver runtime across repeated operations in Deno', async () => {
  await runSolverReuseCase([
    { solver: 'cp-sat', run: () => runCpSatConcurrencyCase(CpSatApi as never) },
    { solver: 'mathopt-pdlp', run: () => runSolverConcurrencyCase({ MathOpt } as never, PdlpApi as never) },
    { solver: 'mp-solver', run: () => runMpSolverConcurrencyCase(MPSolverApi as never) },
    { solver: 'routing', run: () => runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never) },
    { solver: 'knapsack', run: () => runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType }) },
    { solver: 'network-flow', run: () => runNetworkFlowConcurrencyCase({ SimpleMaxFlow }) },
    { solver: 'set-cover', run: () => runSetCoverConcurrencyCase(SetCoverApi) },
    { solver: 'rcpsp', run: () => runRcpspConcurrencyCase(RcpspApi) },
  ]);
});

Deno.test('enforces the Routing worker job lifecycle in Deno', async () => {
  await runRoutingWorkerLifecycleCase({ RoutingIndexManager, RoutingModel } as never);
});

Deno.test('enforces Routing local solve concurrency in Deno', async () => {
  await runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never);
});

Deno.test('cloud executor checks service status without sending the model', async () => {
  await runCloudExecutorCase(CpSatApi as never, { packageName, version });
});

Deno.test('runs the shared solver fixture cases in Deno', async (t) => {
  const structureResults = await runCpSatSolverStructureCases(CpSatApi as never);
  await assertCaseSteps(t, 'deno CP-SAT solver structure', structureResults);

  const highLevelResults = await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);
  await assertCaseSteps(t, 'deno high-level CP-SAT', highLevelResults);

  const results = await runCpSatCases(CpSat as never);
  for (const result of results) {
    if (result.cases.length !== cpSatCases.length) {
      throw new Error(`${result.mode} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
    }
    await assertCaseSteps(t, `deno CP-SAT ${result.mode}/${result.workerProfile}`, result.cases);
  }

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
  await assertCaseSteps(t, 'deno routing', routingResults);

  const mpSolverResults = await runMPSolverCases({
    MPSolver,
    MPSolverParameters,
  }, { modes: executorFixtureModes });
  await assertCaseSteps(t, 'deno MPSolver', mpSolverResults);

  const knapsackResults = await runKnapsackCases({
    KnapsackSolver,
    KnapsackSolverType,
  });
  await assertCaseSteps(t, 'deno Knapsack', knapsackResults);
  await runKnapsackWorkerLifecycleCase({ KnapsackSolver, KnapsackSolverType });
  await runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType });
  await runKnapsackEventHandlerCase({ KnapsackSolver, KnapsackSolverType });

  const networkFlowResults = await runNetworkFlowCases({
    SimpleMaxFlow,
    SimpleMaxFlowStatus,
    SimpleMinCostFlow,
    SimpleMinCostFlowStatus,
    SimpleLinearSumAssignment,
    SimpleLinearSumAssignmentStatus,
  });
  await assertCaseSteps(t, 'deno Network Flow', networkFlowResults);
  await runNetworkFlowConcurrencyCase({ SimpleMaxFlow });
  await runNetworkFlowWorkerLifecycleCase({ SimpleMaxFlow });
  await runNetworkFlowEventHandlerCase({ SimpleMaxFlow });

  const setCoverResults = await runSetCoverCases(SetCoverApi);
  await assertCaseSteps(t, 'deno Set Cover', setCoverResults);
  await runSetCoverConcurrencyCase(SetCoverApi);
  await runSetCoverWorkerLifecycleCase(SetCoverApi);
  await runSetCoverEventHandlerCase(SetCoverApi);

  const rcpspResults = await runRcpspCases(RcpspApi);
  await assertCaseSteps(t, 'deno RCPSP', rcpspResults);
  await runRcpspConcurrencyCase(RcpspApi);
  await runRcpspWorkerLifecycleCase(RcpspApi);
  await runRcpspEventHandlerCase(RcpspApi);

  const mathOptResults = await runMathOptCases({
    MathOpt,
  }, { modes: executorFixtureModes });
  await assertCaseSteps(t, 'deno MathOpt', mathOptResults);

  const pdlpResults = await runPdlpCases(PdlpApi);
  await assertCaseSteps(t, 'deno PDLP', pdlpResults);
});
