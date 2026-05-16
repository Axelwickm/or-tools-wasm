import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import { runRoutingCases } from '../../browser-basic-src/routing_runner.ts';
import type { CpSat as CpSatValue } from 'or-tools-wasm';
import type {
  BOOL_FALSE as BoolFalseValue,
  BOOL_UNSPECIFIED as BoolUnspecifiedValue,
  BoundCost as BoundCostValue,
  DefaultRoutingSearchParameters as DefaultRoutingSearchParametersValue,
  DefaultRoutingModelParameters as DefaultRoutingModelParametersValue,
  FindErrorInRoutingSearchParameters as FindErrorInRoutingSearchParametersValue,
  FirstSolutionStrategy as FirstSolutionStrategyValue,
  initRouting as initRoutingValue,
  LocalSearchMetaheuristic as LocalSearchMetaheuristicValue,
  RoutingIndexManager as RoutingIndexManagerValue,
  RoutingModel as RoutingModelValue,
} from 'or-tools-wasm';

const statusEl = document.getElementById('status');

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installWorkerSpy() {
  const OriginalWorker = window.Worker;
  const creations: Array<{ url: string; name?: string }> = [];
  const messages: Array<{ type?: string }> = [];

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    const worker = new OriginalWorker(scriptURL, options);
    creations.push({
      url: String(scriptURL),
      name: options?.name,
    });
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = ((message: unknown, transferOrOptions?: StructuredSerializeOptions | Transferable[]) => {
      if (message && typeof message === 'object' && 'type' in message) {
        messages.push({ type: String((message as { type: unknown }).type) });
      }
      return originalPostMessage(message, transferOrOptions as StructuredSerializeOptions);
    }) as Worker['postMessage'];
    return worker;
  } as unknown as typeof Worker;

  return {
    snapshot() {
      return {
        total: creations.length,
        pthread: creations.filter((creation) => creation.name?.startsWith('em-pthread-')).length,
        routingSolve: messages.filter((message) => message.type === 'routingSolve').length,
      };
    },
  };
}

function forceSmallHardwareConcurrency() {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 4,
  });
}

async function main() {
  setStatus({ ok: false, phase: 'running' });
  forceSmallHardwareConcurrency();
  const workerSpy = installWorkerSpy();
  const {
    CpSat,
    BOOL_FALSE,
    BOOL_UNSPECIFIED,
    BoundCost,
    DefaultRoutingSearchParameters,
    DefaultRoutingModelParameters,
    FindErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    initRouting,
    LocalSearchMetaheuristic,
    RoutingIndexManager,
    RoutingModel,
  } = await import('or-tools-wasm');
  const typedCpSat: typeof CpSatValue = CpSat;
  const routingApi = {
    BOOL_FALSE: BOOL_FALSE as typeof BoolFalseValue,
    BOOL_UNSPECIFIED: BOOL_UNSPECIFIED as typeof BoolUnspecifiedValue,
    BoundCost: BoundCost as typeof BoundCostValue,
    DefaultRoutingModelParameters: DefaultRoutingModelParameters as typeof DefaultRoutingModelParametersValue,
    DefaultRoutingSearchParameters: DefaultRoutingSearchParameters as typeof DefaultRoutingSearchParametersValue,
    FindErrorInRoutingSearchParameters: FindErrorInRoutingSearchParameters as typeof FindErrorInRoutingSearchParametersValue,
    FirstSolutionStrategy: FirstSolutionStrategy as typeof FirstSolutionStrategyValue,
    initRouting: initRouting as typeof initRoutingValue,
    LocalSearchMetaheuristic: LocalSearchMetaheuristic as typeof LocalSearchMetaheuristicValue,
    RoutingIndexManager: RoutingIndexManager as typeof RoutingIndexManagerValue,
    RoutingModel: RoutingModel as typeof RoutingModelValue,
  };
  const results = await runCpSatCases(typedCpSat, {
    getWorkerStats: workerSpy.snapshot,
  });
  const routingWorkerStatsBefore = workerSpy.snapshot();
  const routingResults = await runRoutingCases(routingApi as never);
  const routingWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: true, results, routingResults, routingWorkerStatsBefore, routingWorkerStatsAfter });
}

void main();
