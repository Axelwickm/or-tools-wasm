import {
  initMathOpt,
  MathOpt,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mathopt';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { fixtureModes } from '../browser-basic-src/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mathOptResults = await runMathOptCases({
    initMathOpt,
    MathOpt,
  }, { modes: fixtureModes });
  assertAllCases('bun MathOpt', mathOptResults);
  console.log(`bun ran ${mathOptResults.length} MathOpt cases`);
}, async () => {
  MathOpt.setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
