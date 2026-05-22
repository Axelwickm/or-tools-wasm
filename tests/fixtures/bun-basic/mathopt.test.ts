import {
  initMathOpt,
  MathOpt,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/mathopt';
import { runMathOptCases } from '../browser-basic-src/mathopt_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const mathOptResults = await runMathOptCases({
    initMathOpt,
    MathOpt,
  });
  assertAllCases('bun MathOpt', mathOptResults);
  console.log(`bun ran ${mathOptResults.length} MathOpt cases`);
}, async () => {
  MathOpt.setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
});
