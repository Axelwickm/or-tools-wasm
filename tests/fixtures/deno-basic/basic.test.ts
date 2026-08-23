import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import { packageName, version } from 'or-tools-wasm';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import {
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setExecutor as setMPSolverExecutor,
} from 'or-tools-wasm/mp-solver';
import {
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setExecutor as setKnapsackExecutor,
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  setExecutor as setNetworkFlowExecutor,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
} from 'or-tools-wasm/network-flow';
import * as SetCoverApi from 'or-tools-wasm/set-cover';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import {
  initMathOpt,
  MathOpt,
} from 'or-tools-wasm/mathopt';
import {
  initPdlp,
  Pdlp,
  setExecutor as setPdlpExecutor,
} from 'or-tools-wasm/pdlp';
import {
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  DefaultRoutingSearchParameters,
  DefaultRoutingModelParameters,
  FindErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  setExecutor as setRoutingExecutor,
} from 'or-tools-wasm/routing';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { runNetworkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';

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
    DefaultRoutingModelParameters,
    DefaultRoutingSearchParameters,
    FindErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    initRouting,
    LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingIndexManager as never,
    RoutingModel: RoutingModel as never,
    setExecutor: setRoutingExecutor,
  }, { modes: executorFixtureModes });
  await assertCaseSteps(t, 'deno routing', routingResults);

  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setExecutor: setMPSolverExecutor,
  }, { modes: executorFixtureModes });
  await assertCaseSteps(t, 'deno MPSolver', mpSolverResults);

  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setExecutor: setKnapsackExecutor,
  });
  await assertCaseSteps(t, 'deno Knapsack', knapsackResults);

  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setExecutor: setNetworkFlowExecutor,
  });
  await assertCaseSteps(t, 'deno Network Flow', networkFlowResults);

  const setCoverResults = await runSetCoverCases(SetCoverApi as never);
  await assertCaseSteps(t, 'deno Set Cover', setCoverResults);

  const rcpspResults = await runRcpspCases(RcpspApi as never);
  await assertCaseSteps(t, 'deno RCPSP', rcpspResults);

  const mathOptResults = await runMathOptCases({
    initMathOpt,
    MathOpt,
  }, { modes: executorFixtureModes });
  await assertCaseSteps(t, 'deno MathOpt', mathOptResults);

  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setExecutor: setPdlpExecutor,
  });
  await assertCaseSteps(t, 'deno PDLP', pdlpResults);
});
