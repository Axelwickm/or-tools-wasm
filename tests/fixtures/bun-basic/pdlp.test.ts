import {
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/pdlp';
import * as PdlpApi from 'or-tools-wasm/pdlp';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const pdlpResults = await runPdlpCases(PdlpApi);
  assertAllCases('bun PDLP', pdlpResults);
  console.log(`bun ran ${pdlpResults.length} PDLP cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
