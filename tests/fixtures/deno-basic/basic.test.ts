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
  initRouting,
  LocalSearchMetaheuristic,
  MathOpt,
  MPSolver,
  MPSolverParameters,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';

Deno.test('runs the shared CP-SAT cases in Deno', async () => {
  if (CpSat.isWorkerBridgeEnabled()) {
    throw new Error('Deno should use the direct runtime by default');
  }
  const results = await runCpSatCases(CpSat);
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
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: CpSat.isWorkerBridgeEnabled,
  });
  if (!mpSolverResults.every((result) => result.ok)) {
    throw new Error(`deno MPSolver case failed: ${JSON.stringify(mpSolverResults)}`);
  }

  const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt });
  if (!mathOptResults.every((result) => result.ok)) {
    throw new Error(`deno MathOpt case failed: ${JSON.stringify(mathOptResults)}`);
  }
});
