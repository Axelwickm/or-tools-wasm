import {
  CpSat,
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  DefaultRoutingSearchParameters,
  DefaultRoutingModelParameters,
  FindErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  initMPSolver,
  initRouting,
  LocalSearchMetaheuristic,
  MPSolver,
  MPSolverParameters,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

const results = await runCpSatCases(CpSat, { modes: ['direct'] });

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

const mpSolverResults = await runMPSolverCases({ initMPSolver, MPSolver, MPSolverParameters });
if (!mpSolverResults.every((result) => result.ok)) {
  throw new Error(`bun MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
}

console.log(`bun ran ${cpSatCases.length} CP-SAT cases, ${routingResults.length} routing cases, and ${mpSolverResults.length} MPSolver cases across ${results.length} worker profiles`);
