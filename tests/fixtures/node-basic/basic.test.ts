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
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runPdlpCases } from '../browser-basic-src/pdlp_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

const results = await runCpSatCases(CpSat);

for (const result of results) {
  if (result.cases.length !== cpSatCases.length) {
    throw new Error(`node ${result.workerProfile} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
  }

  for (const testCase of result.cases) {
    if (!testCase.ok) {
      throw new Error(`node ${result.workerProfile} case failed: ${testCase.name}`);
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
  throw new Error(`node routing case failed: ${JSON.stringify(routingResults)}`);
}

const mpSolverResults = await runMPSolverCases({
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
  isWorkerBridgeEnabled: CpSat.isWorkerBridgeEnabled,
});
if (!mpSolverResults.every((result) => result.ok)) {
  throw new Error(`node MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
}

const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
if (!mathOptResults.every((result) => result.ok)) {
  throw new Error(`node MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
}

const pdlpResults = await runPdlpCases({
  initPdlp,
  Pdlp,
  MPSolver,
  setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
});
if (!pdlpResults.every((result) => result.ok)) {
  throw new Error(`node PDLP case failed: ${JSON.stringify(pdlpResults)}`);
}

console.log(`node ran ${cpSatCases.length} CP-SAT cases, ${routingResults.length} routing cases, ${mpSolverResults.length} MPSolver cases, ${mathOptResults.length} MathOpt cases, and ${pdlpResults.length} PDLP cases across ${results.length} worker profiles`);
