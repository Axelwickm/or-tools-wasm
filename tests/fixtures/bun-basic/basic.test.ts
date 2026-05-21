import {
  CpSat,
  terminateLoadedRuntimeThreads,
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
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled as setKnapsackWorkerBridgeEnabled,
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  setWorkerBridgeEnabled as setNetworkFlowWorkerBridgeEnabled,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
} from 'or-tools-wasm/network-flow';
import * as SetCoverApi from 'or-tools-wasm/set-cover';
import { terminateLoadedRuntimeThreads as terminateSetCoverRuntimeThreads } from 'or-tools-wasm/set-cover';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import {
  initMathOpt,
  MathOpt,
} from 'or-tools-wasm/mathopt';
import {
  initPdlp,
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
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
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

function assertAllCases(runtime: string, results: NamedCaseResult[]) {
  const failed = results.find((result) => result.ok !== true);
  if (failed) {
    throw new Error(`${runtime} case failed: ${caseLabel(failed)} ${JSON.stringify(failed)}`);
  }
}

async function run(): Promise<string> {
const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);
assertAllCases('bun high-level CP-SAT', highLevelCpSatResults);

const results = await runCpSatCases(CpSat as never);

for (const result of results) {
  if (result.cases.length !== cpSatCases.length) {
    throw new Error(`bun ${result.workerProfile} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
  }

  assertAllCases(`bun CP-SAT ${result.mode}/${result.workerProfile}`, result.cases);
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
});
assertAllCases('bun routing', routingResults);

const mpSolverResults = await runMPSolverCases({
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setWorkerBridgeEnabled,
  isWorkerBridgeEnabled,
});
assertAllCases('bun MPSolver', mpSolverResults);

const knapsackResults = await runKnapsackCases({
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled: setKnapsackWorkerBridgeEnabled,
});
assertAllCases('bun Knapsack', knapsackResults);

const networkFlowResults = await runNetworkFlowCases({
  initNetworkFlow,
  SimpleMaxFlow,
  SimpleMinCostFlow,
  SimpleLinearSumAssignment,
  setWorkerBridgeEnabled: setNetworkFlowWorkerBridgeEnabled,
});
assertAllCases('bun Network Flow', networkFlowResults);

const setCoverResults = await runSetCoverCases(SetCoverApi as never);
assertAllCases('bun Set Cover', setCoverResults);

const rcpspResults = await runRcpspCases(RcpspApi as never);
assertAllCases('bun RCPSP', rcpspResults);

const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
assertAllCases('bun MathOpt', mathOptResults);

const pdlpResults = await runPdlpCases({
  initPdlp,
  Pdlp,
  setWorkerBridgeEnabled: setPdlpWorkerBridgeEnabled,
});
assertAllCases('bun PDLP', pdlpResults);

return `bun ran ${cpSatCases.length} CP-SAT cases, ${highLevelCpSatResults.length} high-level CP-SAT cases, ${routingResults.length} routing cases, ${mpSolverResults.length} MPSolver cases, ${knapsackResults.length} Knapsack cases, ${networkFlowResults.length} Network Flow cases, ${setCoverResults.length} Set Cover cases, ${rcpspResults.length} RCPSP cases, ${mathOptResults.length} MathOpt cases, and ${pdlpResults.length} PDLP cases across ${results.length} worker profiles`;
}

try {
  console.log(await run());
} finally {
  setWorkerBridgeEnabled(false);
  setKnapsackWorkerBridgeEnabled(false);
  setNetworkFlowWorkerBridgeEnabled(false);
  setPdlpWorkerBridgeEnabled(false);
  SetCoverApi.setWorkerBridgeEnabled(false);
  RcpspApi.setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
  await terminateSetCoverRuntimeThreads();
}
process.exit(0);
