import {
  initPdlp,
  isWorkerBridgeEnabled,
  Pdlp,
  setWorkerBridgeEnabled,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/pdlp';
import { runPdlpCases } from '../browser-basic-src/pdlp_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  assertAllCases('bun PDLP', pdlpResults);
  console.log(`bun ran ${pdlpResults.length} PDLP cases`);
}, async () => {
  setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
});
