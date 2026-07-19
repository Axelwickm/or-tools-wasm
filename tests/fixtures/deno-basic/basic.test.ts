import {
  CpSat,
} from 'or-tools-wasm/cp-sat';
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
import { fixtureModes } from '../browser-basic-src/shared_case.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
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
  }, { modes: fixtureModes });
  await assertCaseSteps(t, 'deno routing', routingResults);

  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setExecutor: setMPSolverExecutor,
  }, { modes: fixtureModes });
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
  }, { modes: fixtureModes });
  await assertCaseSteps(t, 'deno MathOpt', mathOptResults);

  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setExecutor: setPdlpExecutor,
  });
  await assertCaseSteps(t, 'deno PDLP', pdlpResults);
});
