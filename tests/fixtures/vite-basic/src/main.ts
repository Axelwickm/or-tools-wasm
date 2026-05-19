import { runCpSatHighLevelParityCasesForPackage } from '../../browser-basic-src/cpsat_high_level_runner.ts';
import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import { runMathOptCases } from '../../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../../browser-basic-src/mp_solver_runner.ts';
import { runPdlpCases } from '../../browser-basic-src/pdlp_runner.ts';
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
  mathOptSolve: number;
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
        mathOptSolve: messages.filter((message) => message.type === 'mathOptSolve').length,
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
  const ortools = await import('or-tools-wasm');
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
    initMathOpt,
    initPdlp,
    MPSolver,
    MPSolverParameters,
    MathOpt,
    Pdlp,
    RoutingIndexManager,
    RoutingModel,
  } = ortools;
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
  setStatus({ ok: false, phase: 'cp-sat-high-level' });
  const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(ortools as never);
  setStatus({ ok: false, phase: 'cp-sat' });
  const results = await runCpSatCases(typedCpSat as never, {
    getWorkerStats: workerSpy.snapshot,
  }) as RunResult[];
  setStatus({ ok: false, phase: 'routing' });
  const routingWorkerStatsBefore = workerSpy.snapshot();
  const routingResults = await runRoutingCases(routingApi as never);
  const routingWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'mp-solver' });
  const mpSolverWorkerStatsBefore = workerSpy.snapshot();
  const mpSolverResults = await runMPSolverCases({
    initMPSolver,
    MPSolver,
    MPSolverParameters,
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: CpSat.isWorkerBridgeEnabled,
  });
  const mpSolverWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'mathopt' });
  const mathOptWorkerStatsBefore = workerSpy.snapshot();
  const mathOptResults = await runMathOptCases({ initMathOpt, MathOpt }, {
    onProgress: (caseName, mode, threads) => setStatus({
      ok: false,
      phase: 'mathopt',
      caseName,
      mode,
      threads,
    }),
  });
  const mathOptWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'pdlp' });
  const pdlpResults = await runPdlpCases({
    initPdlp,
    Pdlp,
    setWorkerBridgeEnabled: CpSat.setWorkerBridgeEnabled,
  });
  setStatus({
    ok: true,
    results,
    highLevelCpSatResults,
    routingResults,
    mpSolverResults,
    mathOptResults,
    pdlpResults,
    routingWorkerStatsBefore,
    routingWorkerStatsAfter,
    mpSolverWorkerStatsBefore,
    mpSolverWorkerStatsAfter,
    mathOptWorkerStatsBefore,
    mathOptWorkerStatsAfter,
  });
}

void main();
