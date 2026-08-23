import {
  initPdlp,
  Pdlp,
  setExecutor,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/pdlp';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setExecutor,
  });
  assertAllCases('bun PDLP', pdlpResults);
  console.log(`bun ran ${pdlpResults.length} PDLP cases`);
}, async () => {
  setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
