import { MathOpt, terminateLoadedRuntimeThreads } from 'or-tools-wasm/mathopt';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mathOptResults = await runMathOptCases({
    MathOpt,
  }, { modes: executorFixtureModes });
  assertAllCases('bun MathOpt', mathOptResults);
  console.log(`bun ran ${mathOptResults.length} MathOpt cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
