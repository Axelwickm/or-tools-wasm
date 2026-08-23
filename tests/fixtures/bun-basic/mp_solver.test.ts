import {
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setExecutor,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mp-solver';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setExecutor,
  }, { modes: executorFixtureModes });
  assertAllCases('bun MPSolver', mpSolverResults);
  console.log(`bun ran ${mpSolverResults.length} MPSolver cases`);
}, async () => {
  setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
