import { runMathOptCallbackCases } from '../../cases/or-tools-wasm/mathopt/callbacks.ts';
import { runMathOptModelImportCases } from '../../cases/or-tools-wasm/mathopt/model_import.ts';
import { runMathOptMpsCases } from '../../cases/or-tools-wasm/mathopt/mps.ts';
import { runMathOptIndicatorCases } from '../../cases/or-tools-wasm/mathopt/indicators.ts';
import { runMathOptAdmissionCases } from '../../cases/or-tools-wasm/mathopt/admission.ts';
import * as MathOptControlApi from 'or-tools-wasm/mathopt';
import { runMathOptCancellationCases } from '../../cases/or-tools-wasm/mathopt/cancellation.ts';
import { MathOpt, terminateLoadedRuntimeThreads } from 'or-tools-wasm/mathopt';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  await runMathOptIndicatorCases(MathOptControlApi as never);
  await runMathOptCallbackCases(MathOptControlApi as never);
  await runMathOptModelImportCases(MathOptControlApi as never);
  await runMathOptMpsCases(MathOptControlApi as never);
  await runMathOptAdmissionCases(MathOptControlApi as never);
  await runMathOptCancellationCases(MathOptControlApi as never);
  const mathOptResults = await runMathOptCases({
    MathOpt,
  } as never, { modes: executorFixtureModes });
  assertAllCases('bun MathOpt', mathOptResults);
  console.log(`bun ran ${mathOptResults.length} MathOpt cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
