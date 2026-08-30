import {
  BOOL_FALSE,
  BOOL_UNSPECIFIED,
  BoundCost,
  defaultRoutingModelParameters,
  defaultRoutingSearchParameters,
  findErrorInRoutingSearchParameters,
  FirstSolutionStrategy,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/routing';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runRoutingConcurrencyCase } from '../../cases/or-tools-wasm/routing/concurrency.ts';
import { runRoutingWorkerLifecycleCase } from '../../cases/or-tools-wasm/routing/worker_lifecycle.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  await runRoutingWorkerLifecycleCase({ RoutingIndexManager, RoutingModel } as never);
  await runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never);
  const routingResults = await runRoutingCases({
    BOOL_FALSE,
    BOOL_UNSPECIFIED,
    BoundCost,
    defaultRoutingModelParameters,
    defaultRoutingSearchParameters,
    findErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingIndexManager as never,
    RoutingModel: RoutingModel as never,
  }, { modes: executorFixtureModes });
  assertAllCases('bun routing', routingResults);
  console.log(`bun ran ${routingResults.length} routing cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
