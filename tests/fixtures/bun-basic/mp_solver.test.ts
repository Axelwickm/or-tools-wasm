import * as MPSolverControlApi from 'or-tools-wasm/mp-solver';
import { runMpSolverCancellationCases } from '../../cases/or-tools-wasm/mp_solver/cancellation.ts';
import { runMpSolverModelImportCases } from '../../cases/or-tools-wasm/mp_solver/model_import.ts';
import { runMpSolverModelValidationCases } from '../../cases/or-tools-wasm/mp_solver/model_validation.ts';
import { runMpSolverModelReuseCases } from '../../cases/or-tools-wasm/mp_solver/model_reuse.ts';
import { runMpSolverProtoValidationCases } from '../../cases/or-tools-wasm/mp_solver/proto_validation.ts';
import {
  MPSolver,
  MPSolverParameters,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mp-solver';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mpSolverResults = await runMPSolverCases({
    MPSolver,
    MPSolverParameters,
  }, { modes: executorFixtureModes });
  assertAllCases('bun MPSolver', mpSolverResults);
  await runMpSolverProtoValidationCases({ MPSolver } as never);
  await runMpSolverCancellationCases(MPSolverControlApi as never);
  await runMpSolverModelReuseCases(MPSolverControlApi as never);
  await runMpSolverModelImportCases(MPSolverControlApi as never);
  await runMpSolverModelValidationCases(MPSolverControlApi as never);
  console.log(`bun ran ${mpSolverResults.length} MPSolver cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
