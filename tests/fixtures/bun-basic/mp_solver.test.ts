import {
  initMPSolver,
  MPSolver,
  MPSolverParameters,
  setExecutor,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mp-solver';
import { runMPSolverCases } from '../browser-basic-src/mp_solver_runner.ts';
import { fixtureModes } from '../browser-basic-src/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setExecutor,
  }, { modes: fixtureModes });
  assertAllCases('bun MPSolver', mpSolverResults);
  console.log(`bun ran ${mpSolverResults.length} MPSolver cases`);
}, async () => {
  setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
