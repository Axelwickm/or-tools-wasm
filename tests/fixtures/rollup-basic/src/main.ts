import { runCpSatHighLevelParityCasesForPackage } from '../../browser-basic-src/cpsat_high_level_runner.ts';
import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import { runKnapsackCases } from '../../browser-basic-src/knapsack_runner.ts';
import { runMathOptCases } from '../../browser-basic-src/mathopt_runner.ts';
import { runMPSolverCases } from '../../browser-basic-src/mp_solver_runner.ts';
import { runNetworkFlowCases } from '../../browser-basic-src/network_flow_runner.ts';
import { runPdlpCases } from '../../browser-basic-src/pdlp_runner.ts';
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
  initMathOpt as initMathOptValue,
  initKnapsack as initKnapsackValue,
  initNetworkFlow as initNetworkFlowValue,
  initMPSolver as initMPSolverValue,
  initPdlp as initPdlpValue,
  initRouting as initRoutingValue,
  LocalSearchMetaheuristic as LocalSearchMetaheuristicValue,
  MathOpt as MathOptValue,
  KnapsackSolver as KnapsackSolverValue,
  KnapsackSolverType as KnapsackSolverTypeValue,
  SimpleLinearSumAssignment as SimpleLinearSumAssignmentValue,
  SimpleMaxFlow as SimpleMaxFlowValue,
  SimpleMinCostFlow as SimpleMinCostFlowValue,
  MPSolver as MPSolverValue,
  MPSolverParameters as MPSolverParametersValue,
  Pdlp as PdlpValue,
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
        mpSolverSolve: messages.filter((message) => message.type === 'mpSolverSolve').length,
        mathOptSolve: messages.filter((message) => message.type === 'mathOptSolve').length,
        knapsackSolve: messages.filter((message) => message.type === 'knapsackSolve').length,
        graphSolve: messages.filter((message) => message.type === 'graphSolve').length,
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
    initMathOpt,
    initKnapsack,
    initNetworkFlow,
    initMPSolver,
    initPdlp,
    initRouting,
    LocalSearchMetaheuristic,
    MathOpt,
    KnapsackSolver,
    KnapsackSolverType,
    SimpleLinearSumAssignment,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    MPSolver,
    MPSolverParameters,
    Pdlp,
    RoutingIndexManager,
    RoutingModel,
    isWorkerBridgeEnabled,
    setWorkerBridgeEnabled,
  } = ortools;
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
  const highLevelCpSatResults = await runCpSatHighLevelParityCasesForPackage(ortools as never);
  const results = await runCpSatCases(typedCpSat as never, {
    getWorkerStats: workerSpy.snapshot,
  });
  const routingWorkerStatsBefore = workerSpy.snapshot();
  const routingResults = await runRoutingCases(routingApi as never);
  const routingWorkerStatsAfter = workerSpy.snapshot();
  const mpSolverWorkerStatsBefore = workerSpy.snapshot();
  const mpSolverResults = await runMPSolverCases({
    initMPSolver: initMPSolver as typeof initMPSolverValue,
    MPSolver: MPSolver as typeof MPSolverValue,
    MPSolverParameters: MPSolverParameters as typeof MPSolverParametersValue,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
  });
  const mpSolverWorkerStatsAfter = workerSpy.snapshot();
  const knapsackWorkerStatsBefore = workerSpy.snapshot();
  const knapsackResults = await runKnapsackCases({
    initKnapsack: initKnapsack as typeof initKnapsackValue,
    KnapsackSolver: KnapsackSolver as typeof KnapsackSolverValue,
    KnapsackSolverType: KnapsackSolverType as typeof KnapsackSolverTypeValue,
    setWorkerBridgeEnabled,
  });
  const knapsackWorkerStatsAfter = workerSpy.snapshot();
  const networkFlowWorkerStatsBefore = workerSpy.snapshot();
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow: initNetworkFlow as typeof initNetworkFlowValue,
    SimpleMaxFlow: SimpleMaxFlow as typeof SimpleMaxFlowValue,
    SimpleMinCostFlow: SimpleMinCostFlow as typeof SimpleMinCostFlowValue,
    SimpleLinearSumAssignment: SimpleLinearSumAssignment as typeof SimpleLinearSumAssignmentValue,
    setWorkerBridgeEnabled,
  });
  const networkFlowWorkerStatsAfter = workerSpy.snapshot();
  const mathOptWorkerStatsBefore = workerSpy.snapshot();
  const mathOptResults = await runMathOptCases({
    initMathOpt: initMathOpt as typeof initMathOptValue,
    MathOpt: MathOpt as typeof MathOptValue,
  });
  const mathOptWorkerStatsAfter = workerSpy.snapshot();
  const pdlpResults = await runPdlpCases({
    initPdlp: initPdlp as typeof initPdlpValue,
    Pdlp: Pdlp as typeof PdlpValue,
    setWorkerBridgeEnabled,
  });
  setStatus({
    ok: true,
    results,
    highLevelCpSatResults,
    routingResults,
    mpSolverResults,
    knapsackResults,
    networkFlowResults,
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
    mathOptWorkerStatsBefore,
    mathOptWorkerStatsAfter,
  });
}

void main();
