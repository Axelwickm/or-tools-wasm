import {
  CpSat,
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
} from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
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

console.log(`bun ran ${cpSatCases.length} CP-SAT cases and ${routingResults.length} routing cases across ${results.length} worker profiles`);
