import * as SetCoverApi from 'or-tools-wasm/set-cover';
import { terminateLoadedRuntimeThreads } from 'or-tools-wasm/set-cover';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';
import { runSetCoverConcurrencyCase } from '../../cases/or-tools-wasm/set_cover/concurrency.ts';
import { runSetCoverEventHandlerCase } from '../../cases/or-tools-wasm/set_cover/event_handler.ts';
import { runSetCoverWorkerLifecycleCase } from '../../cases/or-tools-wasm/set_cover/worker_lifecycle.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const setCoverResults = await runSetCoverCases(SetCoverApi);
  await runSetCoverConcurrencyCase(SetCoverApi);
  await runSetCoverWorkerLifecycleCase(SetCoverApi);
  await runSetCoverEventHandlerCase(SetCoverApi);
  assertAllCases('bun Set Cover', setCoverResults);
  console.log(`bun ran ${setCoverResults.length} Set Cover cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
