import {
  CpSat,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import { packageName, version } from 'or-tools-wasm';
import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';
import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  assertAllCases('bun cloud executor', [
    await runCloudExecutorCase(CpSatApi as never, { packageName, version }),
  ]);

  const subsolverResults = await runCpSatSubsolverCases(CpSat as never);
  assertAllCases('bun CP-SAT execution semantics', subsolverResults);
  assertAllCases('bun CP-SAT worker lifecycle', [
    await runCpSatWorkerLifecycleCase(CpSat as never),
  ]);

  const structureResults = await runCpSatSolverStructureCases(CpSatApi as never);
  assertAllCases('bun CP-SAT solver structure', structureResults);

  const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);
  assertAllCases('bun high-level CP-SAT', highLevelCpSatResults);

  const results = await runCpSatCases(CpSat as never);

  for (const result of results) {
    if (result.cases.length !== cpSatCases.length) {
      throw new Error(`bun ${result.workerProfile} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
    }

    assertAllCases(`bun CP-SAT ${result.mode}/${result.workerProfile}`, result.cases);
  }

  console.log(`bun ran ${cpSatCases.length} CP-SAT cases and ${highLevelCpSatResults.length} high-level CP-SAT cases across ${results.length} worker profiles`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
