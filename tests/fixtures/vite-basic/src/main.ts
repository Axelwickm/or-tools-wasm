import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import { runMPSolverCases } from '../../browser-basic-src/mp_solver_runner.ts';
import { runRoutingCases } from '../../browser-basic-src/routing_runner.ts';

const statusEl = document.getElementById('status');

type RunResult = {
  mode: 'direct' | 'worker';
  ok: boolean;
  solverStatus?: unknown;
  cases: Array<{
    name: string;
    ok: boolean;
    solverStatus: unknown;
  }>;
  workerStats: WorkerStats;
};

type WorkerStats = {
  total: number;
  pthread: number;
  routingSolve: number;
  mpSolverSolve: number;
};

type CpSatApi = typeof import('or-tools-wasm')['CpSat'];
type RoutingApi = Pick<
  typeof import('or-tools-wasm'),
  | 'BOOL_FALSE'
  | 'BOOL_UNSPECIFIED'
  | 'BoundCost'
  | 'DefaultRoutingModelParameters'
  | 'DefaultRoutingSearchParameters'
  | 'FindErrorInRoutingSearchParameters'
  | 'FirstSolutionStrategy'
  | 'initRouting'
  | 'LocalSearchMetaheuristic'
  | 'RoutingIndexManager'
  | 'RoutingModel'
>;

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installWorkerSpy() {
  const originalWorker = window.Worker;
  const creations: Array<{ url: string; name?: string }> = [];
  const messages: Array<{ type?: string }> = [];

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    const worker = new originalWorker(scriptURL, options);
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
    snapshot(): WorkerStats {
      return {
        total: creations.length,
        pthread: creations.filter((creation) => creation.name?.startsWith('em-pthread-')).length,
        routingSolve: messages.filter((message) => message.type === 'routingSolve').length,
        mpSolverSolve: messages.filter((message) => message.type === 'mpSolverSolve').length,
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
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    RoutingIndexManager,
    RoutingModel,
  } = await import('or-tools-wasm');
  const typedCpSat: CpSatApi = CpSat;
  const routingApi: RoutingApi = {
    BOOL_FALSE,
    BOOL_UNSPECIFIED,
    BoundCost,
    DefaultRoutingModelParameters,
    DefaultRoutingSearchParameters,
    FindErrorInRoutingSearchParameters,
    FirstSolutionStrategy,
    initRouting,
    LocalSearchMetaheuristic,
    RoutingIndexManager,
    RoutingModel,
  };
  const results = await runCpSatCases(typedCpSat, {
    getWorkerStats: workerSpy.snapshot,
  }) as RunResult[];
  const routingWorkerStatsBefore = workerSpy.snapshot();
  const routingResults = await runRoutingCases(routingApi as never);
  const routingWorkerStatsAfter = workerSpy.snapshot();
  const mpSolverWorkerStatsBefore = workerSpy.snapshot();
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: CpSat.isWorkerBridgeEnabled,
  });
  const mpSolverWorkerStatsAfter = workerSpy.snapshot();
  setStatus({
    ok: true,
    results,
    routingResults,
    mpSolverResults,
    routingWorkerStatsBefore,
    routingWorkerStatsAfter,
    mpSolverWorkerStatsBefore,
    mpSolverWorkerStatsAfter,
  });
}

void main();
