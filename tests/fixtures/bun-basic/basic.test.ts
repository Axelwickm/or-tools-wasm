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
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
} from 'or-tools-wasm/network-flow';
import {
  initMathOpt,
  MathOpt,
} from 'or-tools-wasm/mathopt';
import {
  initPdlp,
  Pdlp,
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
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

async function run(): Promise<string> {
const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);

const results = await runCpSatCases(CpSat as never);

for (const result of results) {
  if (result.cases.length !== cpSatCases.length) {
    throw new Error(`bun ${result.workerProfile} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
  }

  for (const testCase of result.cases) {
    if (!testCase.ok) {
      throw new Error(`bun ${result.workerProfile} case failed: ${testCase.name}`);
    }
  }
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
if (!routingResults.some((result) => result.name === 'TestPyWrapRoutingModel.testRoutingSearchParameters' && result.ok)) {
  throw new Error(`bun routing case failed: ${JSON.stringify(routingResults)}`);
}

const mpSolverResults = await runMPSolverCases({
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setWorkerBridgeEnabled,
  isWorkerBridgeEnabled,
});
if (!mpSolverResults.every((result) => result.ok)) {
  throw new Error(`bun MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
}

const knapsackResults = await runKnapsackCases({
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled,
});
if (!knapsackResults.every((result) => result.ok)) {
  throw new Error(`bun Knapsack case failed: ${JSON.stringify(knapsackResults)}`);
}

const networkFlowResults = await runNetworkFlowCases({
  initNetworkFlow,
  SimpleMaxFlow,
  SimpleMinCostFlow,
  SimpleLinearSumAssignment,
  setWorkerBridgeEnabled,
});
if (!networkFlowResults.every((result) => result.ok)) {
  throw new Error(`bun Network Flow case failed: ${JSON.stringify(networkFlowResults)}`);
}

const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
if (!mathOptResults.every((result) => result.ok)) {
  throw new Error(`bun MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
}

const pdlpResults = await runPdlpCases({
  initPdlp,
  Pdlp,
  setWorkerBridgeEnabled,
});
if (!pdlpResults.every((result) => result.ok)) {
  throw new Error(`bun PDLP case failed: ${JSON.stringify(pdlpResults)}`);
}

return `bun ran ${cpSatCases.length} CP-SAT cases, ${highLevelCpSatResults.length} high-level CP-SAT cases, ${routingResults.length} routing cases, ${mpSolverResults.length} MPSolver cases, ${knapsackResults.length} Knapsack cases, ${networkFlowResults.length} Network Flow cases, ${mathOptResults.length} MathOpt cases, and ${pdlpResults.length} PDLP cases across ${results.length} worker profiles`;
}

try {
  console.log(await run());
} finally {
  setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
}
process.exit(0);
