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
  KnapsackSolver,
  KnapsackSolverType,
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
} from 'or-tools-wasm/network-flow';
import * as SetCoverApi from 'or-tools-wasm/set-cover';
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
import { runSetCoverCases } from '../browser-basic-src/set_cover_runner.ts';

Deno.test('runs the shared CP-SAT cases in Deno', async () => {
  if (isWorkerBridgeEnabled()) {
    throw new Error('Deno should use the direct runtime by default');
  }
  await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);

  const results = await runCpSatCases(CpSat as never);
  for (const result of results) {
    if (result.cases.length !== cpSatCases.length) {
      throw new Error(`${result.mode} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
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
    throw new Error(`deno routing case failed: ${JSON.stringify(routingResults)}`);
  }

  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  if (!mpSolverResults.every((result) => result.ok)) {
    throw new Error(`deno MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
  }

  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setWorkerBridgeEnabled,
  });
  if (!knapsackResults.every((result) => result.ok)) {
    throw new Error(`deno Knapsack case failed: ${JSON.stringify(knapsackResults)}`);
  }

  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setWorkerBridgeEnabled,
  });
  if (!networkFlowResults.every((result) => result.ok)) {
    throw new Error(`deno Network Flow case failed: ${JSON.stringify(networkFlowResults)}`);
  }

  const setCoverResults = await runSetCoverCases(SetCoverApi as never);
  if (!setCoverResults.every((result) => result.ok)) {
    throw new Error(`deno Set Cover case failed: ${JSON.stringify(setCoverResults)}`);
  }

  const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
  if (!mathOptResults.every((result) => result.ok)) {
    throw new Error(`deno MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
  }

  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled,
  });
  if (!pdlpResults.every((result) => result.ok)) {
    throw new Error(`deno PDLP case failed: ${JSON.stringify(pdlpResults)}`);
  }
});
