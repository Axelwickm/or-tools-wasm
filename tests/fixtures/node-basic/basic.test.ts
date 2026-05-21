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
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { runKnapsackCases } from '../browser-basic-src/knapsack_runner.ts';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runNetworkFlowCases } from '../browser-basic-src/network_flow_runner.ts';
import { runPdlpCases } from '../browser-basic-src/pdlp_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

test('runs the shared high-level CP-SAT Python parity cases in Node', async () => {
  await runCpSatHighLevelParityCasesForPackage(CpSatApi);
});

test('runs the shared proto CP-SAT cases in Node', async () => {
  const results = await runCpSatCases(CpSat);

  for (const result of results) {
    assert.equal(result.cases.length, cpSatCases.length, `node ${result.workerProfile} case count`);
    for (const testCase of result.cases) {
      assert.equal(testCase.ok, true, `node ${result.workerProfile} case ${testCase.name}`);
    }
  }
});

test('runs the shared Routing cases in Node', async () => {
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
  assert.equal(
    routingResults.some((result) => result.name === 'TestPyWrapRoutingModel.testRoutingSearchParameters' && result.ok),
    true,
    `node routing case failed: ${JSON.stringify(routingResults)}`,
  );
});

test('runs the shared MPSolver cases in Node', async () => {
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  assert.equal(mpSolverResults.every((result) => result.ok), true, `node MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
});

test('runs the shared Knapsack cases in Node', async () => {
  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setWorkerBridgeEnabled,
  });
  assert.equal(knapsackResults.every((result) => result.ok), true, `node Knapsack case failed: ${JSON.stringify(knapsackResults)}`);
});

test('runs the shared Network Flow cases in Node', async () => {
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setWorkerBridgeEnabled,
  });
  assert.equal(networkFlowResults.every((result) => result.ok), true, `node Network Flow case failed: ${JSON.stringify(networkFlowResults)}`);
});

test('runs the shared MathOpt cases in Node', async () => {
  const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
  assert.equal(mathOptResults.every((result) => result.ok), true, `node MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
});

test('runs the shared PDLP cases in Node', async () => {
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled,
  });
  assert.equal(pdlpResults.every((result) => result.ok), true, `node PDLP case failed: ${JSON.stringify(pdlpResults)}`);
});
