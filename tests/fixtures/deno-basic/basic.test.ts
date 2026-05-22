import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import {
  isWorkerBridgeEnabled,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/mp-solver';
import {
  initMPSolver,
  MPSolver,
  MPSolverParameters,
} from 'or-tools-wasm/mp-solver';
import {
  initKnapsack,
  isWorkerBridgeEnabled as isKnapsackWorkerBridgeEnabled,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled as setKnapsackWorkerBridgeEnabled,
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  isWorkerBridgeEnabled as isNetworkFlowWorkerBridgeEnabled,
  setWorkerBridgeEnabled as setNetworkFlowWorkerBridgeEnabled,
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
  isWorkerBridgeEnabled as isPdlpWorkerBridgeEnabled,
  Pdlp,
  setWorkerBridgeEnabled as setPdlpWorkerBridgeEnabled,
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
  isWorkerBridgeEnabled as isRoutingWorkerBridgeEnabled,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  setWorkerBridgeEnabled as setRoutingWorkerBridgeEnabled,
} from 'or-tools-wasm/routing';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runKnapsackCases } from '../browser-basic-src/knapsack_runner.ts';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runNetworkFlowCases } from '../browser-basic-src/network_flow_runner.ts';
import { runPdlpCases } from '../browser-basic-src/pdlp_runner.ts';
import { runRcpspCases } from '../browser-basic-src/rcpsp_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';
import { runSetCoverCases } from '../browser-basic-src/set_cover_runner.ts';

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

Deno.test('runs the shared solver fixture cases in Deno', async (t) => {
  if (isWorkerBridgeEnabled()) {
    throw new Error('Deno should use the direct runtime by default');
  }
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
    setWorkerBridgeEnabled: setRoutingWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isRoutingWorkerBridgeEnabled,
  });
  await assertCaseSteps(t, 'deno routing', routingResults);

  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  await assertCaseSteps(t, 'deno MPSolver', mpSolverResults);

  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setWorkerBridgeEnabled: setKnapsackWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isKnapsackWorkerBridgeEnabled,
  });
  await assertCaseSteps(t, 'deno Knapsack', knapsackResults);

  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setWorkerBridgeEnabled: setNetworkFlowWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isNetworkFlowWorkerBridgeEnabled,
  });
  await assertCaseSteps(t, 'deno Network Flow', networkFlowResults);

  const setCoverResults = await runSetCoverCases(SetCoverApi as never);
  await assertCaseSteps(t, 'deno Set Cover', setCoverResults);

  const rcpspResults = await runRcpspCases(RcpspApi as never);
  await assertCaseSteps(t, 'deno RCPSP', rcpspResults);

  const mathOptResults = await runMathOptCases({
    initMathOpt,
    MathOpt,
  });
  await assertCaseSteps(t, 'deno MathOpt', mathOptResults);

  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled: setPdlpWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isPdlpWorkerBridgeEnabled,
  });
  await assertCaseSteps(t, 'deno PDLP', pdlpResults);
});
