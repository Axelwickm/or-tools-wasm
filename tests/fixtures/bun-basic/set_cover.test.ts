import * as SetCoverApi from 'or-tools-wasm/set-cover';
import { terminateLoadedRuntimeThreads } from 'or-tools-wasm/set-cover';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const setCoverResults = await runSetCoverCases(SetCoverApi as never);
  assertAllCases('bun Set Cover', setCoverResults);
  console.log(`bun ran ${setCoverResults.length} Set Cover cases`);
}, async () => {
  SetCoverApi.setExecutor({ type: 'auto' });
  await terminateLoadedRuntimeThreads();
});
