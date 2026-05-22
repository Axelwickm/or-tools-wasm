import {
  CpSat,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/cp-sat';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import { runCpSatHighLevelParityCasesForPackage } from '../browser-basic-src/cpsat_high_level_runner.ts';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
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
