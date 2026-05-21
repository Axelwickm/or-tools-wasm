import { runCpSatHighLevelParityCasesForPackage } from '../../browser-basic-src/cpsat_high_level_runner.ts';
import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import { runKnapsackCases } from '../../browser-basic-src/knapsack_runner.ts';
import { runMathOptCases } from '../../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../../browser-basic-src/mp_solver_runner.ts';
import { runNetworkFlowCases } from '../../browser-basic-src/network_flow_runner.ts';
import { runPdlpCases } from '../../browser-basic-src/pdlp_runner.ts';
import { runRcpspCases } from '../../browser-basic-src/rcpsp_runner.ts';
import { runRoutingCases } from '../../browser-basic-src/routing_runner.ts';
import { runSetCoverCases } from '../../browser-basic-src/set_cover_runner.ts';
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
  routingSolve: number;
  mpSolverSolve: number;
  mathOptSolve: number;
  knapsackSolve: number;
  graphSolve: number;
  setCoverSolve: number;
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
        knapsackSolve: messages.filter((message) => message.type === 'knapsackSolve').length,
        graphSolve: messages.filter((message) => message.type === 'graphSolve').length,
        setCoverSolve: messages.filter((message) => message.type === 'setCover').length,
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
    LocalSearchMetaheuristic: RoutingApiModule.LocalSearchMetaheuristic,
    RoutingIndexManager: RoutingApiModule.RoutingIndexManager,
    RoutingModel: RoutingApiModule.RoutingModel,
  };
  setStatus({ ok: false, phase: 'cp-sat-high-level' });
  const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(CpSatApi as never);
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
    initMPSolver: MPSolverApi.initMPSolver,
    MPSolver: MPSolverApi.MPSolver,
    MPSolverParameters: MPSolverApi.MPSolverParameters,
    setWorkerBridgeEnabled: MPSolverApi.setWorkerBridgeEnabled,
    isWorkerBridgeEnabled: MPSolverApi.isWorkerBridgeEnabled,
  });
  const mpSolverWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'knapsack' });
  const knapsackWorkerStatsBefore = workerSpy.snapshot();
  const knapsackResults = await runKnapsackCases({
    initKnapsack: KnapsackApi.initKnapsack,
    KnapsackSolver: KnapsackApi.KnapsackSolver,
    KnapsackSolverType: KnapsackApi.KnapsackSolverType,
    setWorkerBridgeEnabled: KnapsackApi.setWorkerBridgeEnabled,
  });
  const knapsackWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'network-flow' });
  const networkFlowWorkerStatsBefore = workerSpy.snapshot();
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow: NetworkFlowApi.initNetworkFlow,
    SimpleMaxFlow: NetworkFlowApi.SimpleMaxFlow,
    SimpleMinCostFlow: NetworkFlowApi.SimpleMinCostFlow,
    SimpleLinearSumAssignment: NetworkFlowApi.SimpleLinearSumAssignment,
    setWorkerBridgeEnabled: NetworkFlowApi.setWorkerBridgeEnabled,
  });
  const networkFlowWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'set-cover' });
  const setCoverWorkerStatsBefore = workerSpy.snapshot();
  const setCoverResults = await runSetCoverCases(SetCoverApi as never);
  const setCoverWorkerStatsAfter = workerSpy.snapshot();
  setStatus({ ok: false, phase: 'rcpsp' });
  const rcpspResults = await runRcpspCases(RcpspApi as never);
  setStatus({ ok: false, phase: 'mathopt' });
  const mathOptWorkerStatsBefore = workerSpy.snapshot();
  const mathOptResults = await runMathOptCases({ initMathOpt: MathOptApi.initMathOpt, MathOpt: MathOptApi.MathOpt }, {
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
    initPdlp: PdlpApi.initPdlp,
    Pdlp: PdlpApi.Pdlp,
    setWorkerBridgeEnabled: PdlpApi.setWorkerBridgeEnabled,
  });
  setStatus({
    ok: true,
    results,
    highLevelCpSatResults,
    routingResults,
    mpSolverResults,
    knapsackResults,
    networkFlowResults,
    setCoverResults,
    rcpspResults,
    mathOptResults,
    pdlpResults,
    routingWorkerStatsBefore,
    routingWorkerStatsAfter,
    mpSolverWorkerStatsBefore,
    mpSolverWorkerStatsAfter,
    knapsackWorkerStatsBefore,
    knapsackWorkerStatsAfter,
    networkFlowWorkerStatsBefore,
    networkFlowWorkerStatsAfter,
    setCoverWorkerStatsBefore,
    setCoverWorkerStatsAfter,
    mathOptWorkerStatsBefore,
    mathOptWorkerStatsAfter,
  });
}

void main();
