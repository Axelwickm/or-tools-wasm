import {
  initMPSolver,
  isWorkerBridgeAvailable,
  isWorkerBridgeEnabled,
  MPSolver,
  MPSolverParameters,
  setWorkerBridgeEnabled,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mp-solver';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
    isWorkerBridgeAvailable,
  });
  assertAllCases('bun MPSolver', mpSolverResults);
  console.log(`bun ran ${mpSolverResults.length} MPSolver cases`);
}, async () => {
  setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
});
