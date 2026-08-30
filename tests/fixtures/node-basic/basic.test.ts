import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import {
  MPSolver,
  MPSolverParameters,
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
import {
  consistency_level,
  ElementDegreeSolutionGenerator,
  GreedySolutionGenerator,
  GuidedLocalSearch,
  initSetCover,
  RandomSolutionGenerator,
  SetCoverInvariant,
  SetCoverModel,
  setExecutor as setSetCoverExecutor,
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
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { runNetworkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runRoutingConcurrencyCase } from '../../cases/or-tools-wasm/routing/concurrency.ts';
import { runRoutingWorkerLifecycleCase } from '../../cases/or-tools-wasm/routing/worker_lifecycle.ts';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';

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

test('enforces the CP-SAT worker job lifecycle in Node', async () => {
  await runCpSatWorkerLifecycleCase(CpSat as never);
});

test('enforces CP-SAT local solve concurrency in Node', async () => {
  await runCpSatConcurrencyCase(CpSatApi as never);
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
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setExecutor: setKnapsackExecutor,
  });
  await assertCaseResults(t, 'node Knapsack', knapsackResults);
});

test('runs the shared Network Flow cases in Node', async (t) => {
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setExecutor: setNetworkFlowExecutor,
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
    setExecutor: setSetCoverExecutor,
  });
  await assertCaseResults(t, 'node Set Cover', setCoverResults);
});

test('runs the shared RCPSP cases in Node', async (t) => {
  const rcpspResults = await runRcpspCases(RcpspApi as never);
  await assertCaseResults(t, 'node RCPSP', rcpspResults);
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
