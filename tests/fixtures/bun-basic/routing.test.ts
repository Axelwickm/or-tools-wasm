import {
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  DefaultRoutingModelParameters,
  DefaultRoutingSearchParameters,
  FindErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  isWorkerBridgeEnabled,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  setWorkerBridgeEnabled,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/routing';
import { runRoutingCases } from '../browser-basic-src/routing_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const routingResults = await runRoutingCases({
    BOOL_FALSE,
    BOOL_UNSPECIFIED,
    BoundCost,
    DefaultRoutingModelParameters,
    DefaultRoutingSearchParameters,
    FindErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    initRouting,
    LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingIndexManager as never,
    RoutingModel: RoutingModel as never,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  assertAllCases('bun routing', routingResults);
  console.log(`bun ran ${routingResults.length} routing cases`);
}, async () => {
  setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
});
