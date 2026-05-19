import {
  CpSat,
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  DefaultRoutingSearchParameters,
  DefaultRoutingModelParameters,
  FindErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  initMathOpt,
  initMPSolver,
  initPdlp,
  initRouting,
  LocalSearchMetaheuristic,
  MathOpt,
  MPSolver,
  MPSolverParameters,
  Pdlp,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import * as OrTools from 'or-tools-wasm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runPdlpCases } from '../browser-basic-src/pdlp_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

test('runs the shared high-level CP-SAT Python parity cases in Node', async () => {
  await runCpSatHighLevelParityCasesForPackage(OrTools);
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
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: CpSat.isWorkerBridgeEnabled,
  });
  assert.equal(mpSolverResults.every((result) => result.ok), true, `node MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
});

test('runs the shared MathOpt cases in Node', async () => {
  const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
  assert.equal(mathOptResults.every((result) => result.ok), true, `node MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
});

test('runs the shared PDLP cases in Node', async () => {
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
  });
  assert.equal(pdlpResults.every((result) => result.ok), true, `node PDLP case failed: ${JSON.stringify(pdlpResults)}`);
});
