import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import {
  isWorkerBridgeAvailable,
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
  isWorkerBridgeAvailable as isKnapsackWorkerBridgeAvailable,
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
import {
  consistency_level,
  ElementDegreeSolutionGenerator,
  GreedySolutionGenerator,
  GuidedLocalSearch,
  initSetCover,
  isWorkerBridgeEnabled as isSetCoverWorkerBridgeEnabled,
  RandomSolutionGenerator,
  SetCoverInvariant,
  SetCoverModel,
  setWorkerBridgeEnabled as setSetCoverWorkerBridgeEnabled,
  SteepestSearch,
  TrivialSolutionGenerator,
} from 'or-tools-wasm/set-cover';
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
import * as RcpspApi from 'or-tools-wasm/rcpsp';
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
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { runCpSatSolverStructureCases } from '../browser-basic-src/cpsat_solver_structure_runner.ts';
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

test('runs the shared proto CP-SAT cases in Node', async (t) => {
  const results = await runCpSatCases(CpSat);

  for (const result of results) {
    assert.equal(result.cases.length, cpSatCases.length, `node ${result.workerProfile} case count`);
    await assertCaseResults(t, `node CP-SAT ${result.mode}/${result.workerProfile}`, result.cases);
  }
});

test('runs the shared Routing cases in Node', async (t) => {
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
  await assertCaseResults(t, 'node routing', routingResults);
});

test('runs the shared MPSolver cases in Node', async (t) => {
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
    isWorkerBridgeAvailable,
  });
  await assertCaseResults(t, 'node MPSolver', mpSolverResults);
});

test('runs the shared Knapsack cases in Node', async (t) => {
  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setWorkerBridgeEnabled: setKnapsackWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isKnapsackWorkerBridgeEnabled,
    isWorkerBridgeAvailable: isKnapsackWorkerBridgeAvailable,
  });
  await assertCaseResults(t, 'node Knapsack', knapsackResults);
});

test('runs the shared Network Flow cases in Node', async (t) => {
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setWorkerBridgeEnabled: setNetworkFlowWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isNetworkFlowWorkerBridgeEnabled,
  });
  await assertCaseResults(t, 'node Network Flow', networkFlowResults);
});

test('runs the shared Set Cover cases in Node', async (t) => {
  const setCoverResults = await runSetCoverCases({
    initSetCover,
    SetCoverModel,
    SetCoverInvariant: SetCoverInvariant as never,
    TrivialSolutionGenerator: TrivialSolutionGenerator as never,
    RandomSolutionGenerator: RandomSolutionGenerator as never,
    GreedySolutionGenerator: GreedySolutionGenerator as never,
    ElementDegreeSolutionGenerator: ElementDegreeSolutionGenerator as never,
    SteepestSearch: SteepestSearch as never,
    GuidedLocalSearch: GuidedLocalSearch as never,
    consistency_level,
    setWorkerBridgeEnabled: setSetCoverWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isSetCoverWorkerBridgeEnabled,
  });
  await assertCaseResults(t, 'node Set Cover', setCoverResults);
});

test('runs the shared RCPSP cases in Node', async (t) => {
  const rcpspResults = await runRcpspCases(RcpspApi as never);
  await assertCaseResults(t, 'node RCPSP', rcpspResults);
});

test('runs the shared MathOpt cases in Node', async (t) => {
  const mathOptResults = await runMathOptCases({
    initMathOpt,
    MathOpt,
  });
  await assertCaseResults(t, 'node MathOpt', mathOptResults);
});

test('runs the shared PDLP cases in Node', async (t) => {
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled: setPdlpWorkerBridgeEnabled,
    isWorkerBridgeEnabled: isPdlpWorkerBridgeEnabled,
  });
  await assertCaseResults(t, 'node PDLP', pdlpResults);
});
