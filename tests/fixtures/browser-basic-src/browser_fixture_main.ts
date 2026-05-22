import { runCpSatHighLevelParityCasesForPackage } from './cpsat_high_level_runner.ts';
import { runCpSatCases } from './cpsat_runner.ts';
import { runKnapsackCases } from './knapsack_runner.ts';
import { runMathOptCases } from './mathopt_runner.ts';
import { runMPSolverCases } from './mp_solver_runner.ts';
import { runNetworkFlowCases } from './network_flow_runner.ts';
import { runPdlpCases } from './pdlp_runner.ts';
import { runRcpspCases } from './rcpsp_runner.ts';
import { runRoutingCases } from './routing_runner.ts';
import { runSetCoverCases } from './set_cover_runner.ts';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import * as RoutingApiModule from 'or-tools-wasm/routing';
import * as MPSolverApi from 'or-tools-wasm/mp-solver';
import * as KnapsackApi from 'or-tools-wasm/knapsack';
import * as NetworkFlowApi from 'or-tools-wasm/network-flow';
import * as SetCoverApi from 'or-tools-wasm/set-cover';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import * as MathOptApi from 'or-tools-wasm/mathopt';
import * as PdlpApi from 'or-tools-wasm/pdlp';

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
  bridge: number;
  bridgeTerminated: number;
  activeBridge: number;
  cpSatSolve: number;
  routingSolve: number;
  mpSolverSolve: number;
  mathOptSolve: number;
  knapsackSolve: number;
  graphSolve: number;
  setCoverSolve: number;
  pdlpSolve: number;
};

type CpSat = typeof import('or-tools-wasm/cp-sat')['CpSat'];
type RoutingApi = Pick<
  typeof import('or-tools-wasm/routing'),
  | 'BOOL_FALSE'
  | 'BOOL_UNSPECIFIED'
  | 'BoundCost'
  | 'DefaultRoutingModelParameters'
  | 'DefaultRoutingSearchParameters'
  | 'FindErrorInRoutingSearchParameters'
  | 'FirstSolutionStrategy'
  | 'initRouting'
  | 'isWorkerBridgeEnabled'
  | 'LocalSearchMetaheuristic'
  | 'RoutingIndexManager'
  | 'RoutingModel'
  | 'setWorkerBridgeEnabled'
>;

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installWorkerSpy() {
  const originalWorker = window.Worker;
  const creations: Array<{ id: number; url: string; name?: string; bridge: boolean }> = [];
  const terminations: Array<{ id: number; bridge: boolean }> = [];
  const messages: Array<{ type?: string }> = [];
  let nextWorkerId = 1;

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    const worker = new originalWorker(scriptURL, options);
    const name = options?.name;
    const bridge = !name?.startsWith('em-pthread-');
    const id = nextWorkerId++;
    creations.push({
      id,
      url: String(scriptURL),
      name,
      bridge,
    });
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = ((message: unknown, transferOrOptions?: StructuredSerializeOptions | Transferable[]) => {
      if (message && typeof message === 'object' && 'type' in message) {
        messages.push({ type: String((message as { type: unknown }).type) });
      }
      return originalPostMessage(message, transferOrOptions as StructuredSerializeOptions);
    }) as Worker['postMessage'];
    const originalTerminate = worker.terminate.bind(worker);
    worker.terminate = (() => {
      terminations.push({ id, bridge });
      return originalTerminate();
    }) as Worker['terminate'];
    return worker;
  } as unknown as typeof Worker;

  return {
    snapshot(): WorkerStats {
      return {
        total: creations.length,
        pthread: creations.filter((creation) => creation.name?.startsWith('em-pthread-')).length,
        bridge: creations.filter((creation) => creation.bridge).length,
        bridgeTerminated: terminations.filter((termination) => termination.bridge).length,
        activeBridge: creations.filter((creation) => creation.bridge).length
          - terminations.filter((termination) => termination.bridge).length,
        cpSatSolve: messages.filter((message) => message.type === 'solve').length,
        routingSolve: messages.filter((message) => message.type === 'routingSolve').length,
        mpSolverSolve: messages.filter((message) => message.type === 'mpSolverSolve').length,
        mathOptSolve: messages.filter((message) => message.type === 'mathOptSolve').length,
        knapsackSolve: messages.filter((message) => message.type === 'knapsackSolve').length,
        graphSolve: messages.filter((message) => message.type === 'graphSolve').length,
        setCoverSolve: messages.filter((message) => message.type === 'setCover').length,
        pdlpSolve: messages.filter((message) => message.type === 'pdlp').length,
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

async function runWithWorkerStats<T>(
  workerSpy: ReturnType<typeof installWorkerSpy>,
  run: () => Promise<T>,
) {
  const before = workerSpy.snapshot();
  const result = await run();
  const after = workerSpy.snapshot();
  return { before, result, after };
}

export async function runBrowserFixture() {
  setStatus({ ok: false, phase: 'running' });
  forceSmallHardwareConcurrency();
  const workerSpy = installWorkerSpy();
  const typedCpSat: CpSat = CpSatApi.CpSat;
  const routingApi: RoutingApi = {
    BOOL_FALSE: RoutingApiModule.BOOL_FALSE,
    BOOL_UNSPECIFIED: RoutingApiModule.BOOL_UNSPECIFIED,
    BoundCost: RoutingApiModule.BoundCost,
    DefaultRoutingModelParameters: RoutingApiModule.DefaultRoutingModelParameters,
    DefaultRoutingSearchParameters: RoutingApiModule.DefaultRoutingSearchParameters,
    FindErrorInRoutingSearchParameters: RoutingApiModule.FindErrorInRoutingSearchParameters,
    FirstSolutionStrategy: RoutingApiModule.FirstSolutionStrategy,
    initRouting: RoutingApiModule.initRouting,
    isWorkerBridgeEnabled: RoutingApiModule.isWorkerBridgeEnabled,
    LocalSearchMetaheuristic: RoutingApiModule.LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingApiModule.RoutingIndexManager,
    RoutingModel: RoutingApiModule.RoutingModel,
    setWorkerBridgeEnabled: RoutingApiModule.setWorkerBridgeEnabled,
  };
  setStatus({ ok: false, phase: 'cp-sat-high-level' });
  const highLevelCpSat = await runWithWorkerStats(workerSpy, () =>
    runCpSatHighLevelParityCasesForPackage(CpSatApi as never)
  );
  setStatus({ ok: false, phase: 'cp-sat' });
  const cpSat = await runWithWorkerStats(workerSpy, () =>
    runCpSatCases(typedCpSat as never, {
      getWorkerStats: workerSpy.snapshot,
    }) as Promise<RunResult[]>
  );
  setStatus({ ok: false, phase: 'routing' });
  const routing = await runWithWorkerStats(workerSpy, () => runRoutingCases(routingApi as never));
  setStatus({ ok: false, phase: 'mp-solver' });
  const mpSolver = await runWithWorkerStats(workerSpy, () => runMPSolverCases({
    initMPSolver: MPSolverApi.initMPSolver,
    MPSolver: MPSolverApi.MPSolver,
    MPSolverParameters: MPSolverApi.MPSolverParameters,
    setWorkerBridgeEnabled: MPSolverApi.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: MPSolverApi.isWorkerBridgeEnabled,
  }));
  setStatus({ ok: false, phase: 'knapsack' });
  const knapsack = await runWithWorkerStats(workerSpy, () => runKnapsackCases({
    initKnapsack: KnapsackApi.initKnapsack,
    KnapsackSolver: KnapsackApi.KnapsackSolver,
    KnapsackSolverType: KnapsackApi.KnapsackSolverType,
    setWorkerBridgeEnabled: KnapsackApi.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: KnapsackApi.isWorkerBridgeEnabled,
  }));
  setStatus({ ok: false, phase: 'network-flow' });
  const networkFlow = await runWithWorkerStats(workerSpy, () => runNetworkFlowCases({
    initNetworkFlow: NetworkFlowApi.initNetworkFlow,
    SimpleMaxFlow: NetworkFlowApi.SimpleMaxFlow,
    SimpleMinCostFlow: NetworkFlowApi.SimpleMinCostFlow,
    SimpleLinearSumAssignment: NetworkFlowApi.SimpleLinearSumAssignment,
    setWorkerBridgeEnabled: NetworkFlowApi.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: NetworkFlowApi.isWorkerBridgeEnabled,
  }));
  setStatus({ ok: false, phase: 'set-cover' });
  const setCover = await runWithWorkerStats(workerSpy, () => runSetCoverCases(SetCoverApi as never));
  setStatus({ ok: false, phase: 'rcpsp' });
  const rcpsp = await runWithWorkerStats(workerSpy, () => runRcpspCases(RcpspApi as never));
  setStatus({ ok: false, phase: 'mathopt' });
  const mathOpt = await runWithWorkerStats(workerSpy, () => runMathOptCases({
    initMathOpt: MathOptApi.initMathOpt,
    MathOpt: MathOptApi.MathOpt,
  }, {
    onProgress: (caseName, mode, threads) => setStatus({
      ok: false,
      phase: 'mathopt',
      caseName,
      mode,
      threads,
    }),
  }));
  setStatus({ ok: false, phase: 'pdlp' });
  const pdlp = await runWithWorkerStats(workerSpy, () => runPdlpCases({
    initPdlp: PdlpApi.initPdlp,
    Pdlp: PdlpApi.Pdlp,
    setWorkerBridgeEnabled: PdlpApi.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: PdlpApi.isWorkerBridgeEnabled,
  }));
  setStatus({
    ok: true,
    results: cpSat.result,
    cpSatWorkerStatsBefore: cpSat.before,
    cpSatWorkerStatsAfter: cpSat.after,
    highLevelCpSatResults: highLevelCpSat.result,
    highLevelCpSatWorkerStatsBefore: highLevelCpSat.before,
    highLevelCpSatWorkerStatsAfter: highLevelCpSat.after,
    routingResults: routing.result,
    mpSolverResults: mpSolver.result,
    knapsackResults: knapsack.result,
    networkFlowResults: networkFlow.result,
    setCoverResults: setCover.result,
    rcpspResults: rcpsp.result,
    mathOptResults: mathOpt.result,
    pdlpResults: pdlp.result,
    routingWorkerStatsBefore: routing.before,
    routingWorkerStatsAfter: routing.after,
    mpSolverWorkerStatsBefore: mpSolver.before,
    mpSolverWorkerStatsAfter: mpSolver.after,
    knapsackWorkerStatsBefore: knapsack.before,
    knapsackWorkerStatsAfter: knapsack.after,
    networkFlowWorkerStatsBefore: networkFlow.before,
    networkFlowWorkerStatsAfter: networkFlow.after,
    setCoverWorkerStatsBefore: setCover.before,
    setCoverWorkerStatsAfter: setCover.after,
    rcpspWorkerStatsBefore: rcpsp.before,
    rcpspWorkerStatsAfter: rcpsp.after,
    mathOptWorkerStatsBefore: mathOpt.before,
    mathOptWorkerStatsAfter: mathOpt.after,
    pdlpWorkerStatsBefore: pdlp.before,
    pdlpWorkerStatsAfter: pdlp.after,
  });
}
