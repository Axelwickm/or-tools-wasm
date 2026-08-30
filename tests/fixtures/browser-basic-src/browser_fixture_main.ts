import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { cpSatCases } from '../../cases/python-parity/cp_sat/cases.ts';
import { runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runSolverConcurrencyCase } from '../../cases/or-tools-wasm/solver_concurrency.ts';
import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';
import { withCpSatExecutor } from '../../harness/cpsat_types.ts';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { runMathOptCases } from '../../cases/python-parity/mathopt/runner.ts';
import { runMPSolverCases } from '../../cases/python-parity/linear_solver/runner.ts';
import { runNetworkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { runPdlpCases } from '../../cases/python-parity/pdlp/index.ts';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { executorFixtureModes, serverExecutorUrl } from '../../harness/shared_case.ts';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runSetCoverCases } from '../../cases/python-parity/set_cover/index.ts';
import type { BrowserFixtureGroup } from '../../harness/browser_groups.ts';

type PackageModule = Record<string, any>;

export type BrowserFixtureApis = {
  PackageApi: PackageModule;
  CpSatApi: PackageModule;
  RoutingApiModule: PackageModule;
  MPSolverApi: PackageModule;
  KnapsackApi: PackageModule;
  NetworkFlowApi: PackageModule;
  SetCoverApi: PackageModule;
  RcpspApi: PackageModule;
  MathOptApi: PackageModule;
  PdlpApi: PackageModule;
};

const statusEl = document.getElementById('status');

type ManualExecutorMode = 'direct' | 'worker' | 'server';

type RunResult = {
  mode: 'direct' | 'worker' | 'server';
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
  executorWorkers: Record<string, number>;
  activeExecutorWorkers: Record<string, number>;
  executorWorkerRequests: Record<string, number>;
};

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installCpSatExecutorSwitcher(CpSat: PackageModule) {
  const url = document.createElement('input');
  url.id = 'cp-sat-server-url';
  url.type = 'url';
  url.value = serverExecutorUrl;
  url.placeholder = 'Server URL';

  const authToken = document.createElement('input');
  authToken.id = 'cp-sat-server-auth-token';
  authToken.type = 'password';
  authToken.placeholder = 'Bearer token';

  const executor = document.createElement('select');
  executor.id = 'cp-sat-executor';
  for (const mode of ['direct', 'worker', 'server'] as const) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    executor.append(option);
  }

  const run = document.createElement('button');
  run.id = 'cp-sat-run-selected-executor';
  run.type = 'submit';
  run.textContent = 'Run CP-SAT';

  const result = document.createElement('pre');
  result.id = 'cp-sat-executor-result';
  result.textContent = 'manual cp-sat run pending';

  const controls = document.createElement('form');
  controls.id = 'cp-sat-executor-controls';
  controls.style.display = 'flex';
  controls.style.flexWrap = 'wrap';
  controls.style.gap = '8px';
  controls.style.alignItems = 'center';
  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    void runManualCpSatSolve(CpSat, executor.value as ManualExecutorMode, url.value, authToken.value, result, run);
  });
  controls.append(executor, url, authToken, run);

  statusEl?.before(controls, result);
}

async function runManualCpSatSolve(
  CpSat: PackageModule,
  mode: ManualExecutorMode,
  url: string,
  authToken: string,
  output: HTMLElement,
  button: HTMLButtonElement,
) {
  button.disabled = true;
  const startedAt = performance.now();
  output.textContent = JSON.stringify({ ok: false, phase: 'manual-cp-sat', executor: mode }, null, 2);

  try {
    let executorSelection: Parameters<typeof withCpSatExecutor>[1];
    if (mode === 'server') {
      await assertManualServerHealth(url, authToken);
      executorSelection = {
        type: 'server',
        url,
        authToken: authToken || undefined,
        statusIntervalMs: 20,
      };
    } else {
      executorSelection = mode;
    }

    const solverStatus = await cpSatCases[0].run(
      withCpSatExecutor(CpSat as never, executorSelection),
      { numWorkers: 1 },
    );
    output.textContent = JSON.stringify({
      ok: true,
      executor: mode,
      solverStatus,
      elapsedMs: Math.round(performance.now() - startedAt),
    }, null, 2);
  } catch (error) {
    output.textContent = JSON.stringify({
      ok: false,
      executor: mode,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2);
  } finally {
    button.disabled = false;
  }
}

async function assertManualServerHealth(url: string, authToken: string) {
  const response = await fetch(new URL('healthz', url), {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Server health check failed (${response.status} ${response.statusText})`);
  }
}

function installWorkerSpy() {
  const originalWorker = window.Worker;
  const creations: Array<{
    id: number;
    url: string;
    name?: string;
    executor?: string;
  }> = [];
  const terminations: Array<{ id: number; executor?: string }> = [];
  const executorRequests: string[] = [];
  let nextWorkerId = 1;

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    const worker = new originalWorker(scriptURL, options);
    const name = options?.name;
    const executor = name?.startsWith('ortools-executor-')
      ? name.slice('ortools-executor-'.length)
      : undefined;
    const id = nextWorkerId++;
    creations.push({
      id,
      url: String(scriptURL),
      name,
      executor,
    });
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = ((message: unknown, transferOrOptions?: StructuredSerializeOptions | Transferable[]) => {
      if (executor && message instanceof Uint8Array) {
        executorRequests.push(executor);
      }
      return originalPostMessage(message, transferOrOptions as StructuredSerializeOptions);
    }) as Worker['postMessage'];
    const originalTerminate = worker.terminate.bind(worker);
    worker.terminate = (() => {
      terminations.push({ id, executor });
      return originalTerminate();
    }) as Worker['terminate'];
    return worker;
  } as unknown as typeof Worker;

  return {
    snapshot(): WorkerStats {
      const executorNames = new Set(
        creations.flatMap((creation) => creation.executor ? [creation.executor] : []),
      );
      const executorWorkers = Object.fromEntries([...executorNames].map((executor) => [
        executor,
        creations.filter((creation) => creation.executor === executor).length,
      ]));
      const activeExecutorWorkers = Object.fromEntries([...executorNames].map((executor) => [
        executor,
        creations.filter((creation) => creation.executor === executor).length
          - terminations.filter((termination) => termination.executor === executor).length,
      ]));
      const executorWorkerRequests = Object.fromEntries([...executorNames].map((executor) => [
        executor,
        executorRequests.filter((requestExecutor) => requestExecutor === executor).length,
      ]));
      return {
        total: creations.length,
        pthread: creations.filter((creation) => creation.name?.startsWith('em-pthread-')).length,
        executorWorkers,
        activeExecutorWorkers,
        executorWorkerRequests,
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

async function runSelectedGroup<T>(
  selectedGroup: string | null,
  group: BrowserFixtureGroup,
  phase: string,
  run: () => Promise<T>,
): Promise<T | undefined> {
  if (selectedGroup && selectedGroup !== group) return undefined;
  setStatus({ ok: false, phase });
  return run();
}

export async function runBrowserFixture(apis: BrowserFixtureApis) {
  const {
    PackageApi,
    CpSatApi,
    RoutingApiModule,
    MPSolverApi,
    KnapsackApi,
    NetworkFlowApi,
    SetCoverApi,
    RcpspApi,
    MathOptApi,
    PdlpApi,
  } = apis;
  installCpSatExecutorSwitcher(CpSatApi.CpSat);
  setStatus({ ok: false, phase: 'running' });
  forceSmallHardwareConcurrency();
  const workerSpy = installWorkerSpy();
  const selectedGroup = new URLSearchParams(globalThis.location.search).get('group');
  const typedCpSat = CpSatApi.CpSat;
  const routingApi = {
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
    setExecutor: RoutingApiModule.setExecutor,
  };
  const highLevelCpSat = await runSelectedGroup(selectedGroup, 'cp-sat', 'cp-sat-high-level', () =>
    runWithWorkerStats(workerSpy, () => runCpSatHighLevelParityCasesForPackage(CpSatApi as never))
  );
  const cpSat = await runSelectedGroup(selectedGroup, 'cp-sat', 'cp-sat', () =>
    runWithWorkerStats(workerSpy, () =>
      runCpSatCases(typedCpSat as never, {
        getWorkerStats: workerSpy.snapshot,
      }) as Promise<RunResult[]>
    )
  );
  const cpSatSubsolverResults = await runSelectedGroup(
    selectedGroup,
    'cp-sat',
    'cp-sat-subsolvers',
    () => runCpSatSubsolverCases(typedCpSat as never),
  );
  const routing = await runSelectedGroup(selectedGroup, 'routing', 'routing', () =>
    runWithWorkerStats(workerSpy, () => runRoutingCases(routingApi as never, {
      modes: executorFixtureModes,
      onProgress: (caseName, mode) => setStatus({ ok: false, phase: 'routing', caseName, mode }),
    }))
  );
  const mpSolver = await runSelectedGroup(selectedGroup, 'mp-solver', 'mp-solver', () =>
    runWithWorkerStats(workerSpy, () => runMPSolverCases({
      initMPSolver: MPSolverApi.initMPSolver,
      MPSolver: MPSolverApi.MPSolver,
      MPSolverParameters: MPSolverApi.MPSolverParameters,
      setExecutor: MPSolverApi.setExecutor,
    }, {
      modes: executorFixtureModes,
      onProgress: (caseName, context) => setStatus({ ok: false, phase: 'mp-solver', caseName, ...context }),
    }))
  );
  const knapsack = await runSelectedGroup(selectedGroup, 'knapsack', 'knapsack', () =>
    runWithWorkerStats(workerSpy, () => runKnapsackCases({
      initKnapsack: KnapsackApi.initKnapsack,
      KnapsackSolver: KnapsackApi.KnapsackSolver,
      KnapsackSolverType: KnapsackApi.KnapsackSolverType,
      setExecutor: KnapsackApi.setExecutor,
    }, { modes: executorFixtureModes }))
  );
  const networkFlow = await runSelectedGroup(selectedGroup, 'network-flow', 'network-flow', () =>
    runWithWorkerStats(workerSpy, () => runNetworkFlowCases({
      initNetworkFlow: NetworkFlowApi.initNetworkFlow,
      SimpleMaxFlow: NetworkFlowApi.SimpleMaxFlow,
      SimpleMinCostFlow: NetworkFlowApi.SimpleMinCostFlow,
      SimpleLinearSumAssignment: NetworkFlowApi.SimpleLinearSumAssignment,
      setExecutor: NetworkFlowApi.setExecutor,
    }, { modes: executorFixtureModes }))
  );
  const setCover = await runSelectedGroup(selectedGroup, 'set-cover', 'set-cover', () =>
    runWithWorkerStats(workerSpy, () => runSetCoverCases(SetCoverApi as never, { modes: executorFixtureModes }))
  );
  const rcpsp = await runSelectedGroup(selectedGroup, 'rcpsp', 'rcpsp', () =>
    runWithWorkerStats(workerSpy, () => runRcpspCases(RcpspApi as never, { modes: executorFixtureModes }))
  );
  const mathOpt = await runSelectedGroup(selectedGroup, 'mathopt', 'mathopt', () =>
    runWithWorkerStats(workerSpy, () => runMathOptCases({
      MathOpt: MathOptApi.MathOpt,
    }, {
      modes: executorFixtureModes,
      onProgress: (caseName, mode, threads) =>
        setStatus({ ok: false, phase: 'mathopt', caseName, mode, threads }),
    }))
  );
  const pdlp = await runSelectedGroup(selectedGroup, 'pdlp', 'pdlp', () =>
    runWithWorkerStats(workerSpy, () => runPdlpCases(PdlpApi as never, { modes: executorFixtureModes }))
  );
  const cpSatSolverStructure = await runSelectedGroup(
    selectedGroup,
    'cp-sat',
    'cp-sat-solver-structure',
    () => runWithWorkerStats(workerSpy, () => runCpSatSolverStructureCases(CpSatApi as never)),
  );
  const cpSatWorkerLifecycle = await runSelectedGroup(
    selectedGroup,
    'cp-sat-worker-lifecycle',
    'cp-sat-worker-lifecycle',
    () => runWithWorkerStats(workerSpy, () => runCpSatWorkerLifecycleCase(typedCpSat as never)),
  );
  const cpSatConcurrencyResult = await runSelectedGroup(
    selectedGroup,
    'cp-sat',
    'cp-sat-concurrency',
    () => runCpSatConcurrencyCase(CpSatApi as never),
  );
  const solverConcurrencyResult = await runSelectedGroup(
    selectedGroup,
    'mathopt',
    'mathopt-pdlp-concurrency',
    () => runSolverConcurrencyCase(MathOptApi as never, PdlpApi as never),
  );
  const cloudExecutorResult = await runSelectedGroup(selectedGroup, 'cp-sat', 'cloud', () =>
    runCloudExecutorCase(CpSatApi as never, {
      packageName: PackageApi.packageName,
      version: PackageApi.version,
    })
  );
  setStatus({
    ok: true,
    cloudExecutorResult,
    cpSatConcurrencyResult,
    solverConcurrencyResult,
    cpSatSolverStructureResults: cpSatSolverStructure?.result,
    cpSatWorkerLifecycleResult: cpSatWorkerLifecycle?.result,
    cpSatWorkerLifecycleStatsBefore: cpSatWorkerLifecycle?.before,
    cpSatWorkerLifecycleStatsAfter: cpSatWorkerLifecycle?.after,
    cpSatSolverStructureWorkerStatsBefore: cpSatSolverStructure?.before,
    cpSatSolverStructureWorkerStatsAfter: cpSatSolverStructure?.after,
    results: cpSat?.result,
    cpSatSubsolverResults,
    cpSatWorkerStatsBefore: cpSat?.before,
    cpSatWorkerStatsAfter: cpSat?.after,
    highLevelCpSatResults: highLevelCpSat?.result,
    highLevelCpSatWorkerStatsBefore: highLevelCpSat?.before,
    highLevelCpSatWorkerStatsAfter: highLevelCpSat?.after,
    routingResults: routing?.result,
    mpSolverResults: mpSolver?.result,
    knapsackResults: knapsack?.result,
    networkFlowResults: networkFlow?.result,
    setCoverResults: setCover?.result,
    rcpspResults: rcpsp?.result,
    mathOptResults: mathOpt?.result,
    pdlpResults: pdlp?.result,
    routingWorkerStatsBefore: routing?.before,
    routingWorkerStatsAfter: routing?.after,
    mpSolverWorkerStatsBefore: mpSolver?.before,
    mpSolverWorkerStatsAfter: mpSolver?.after,
    knapsackWorkerStatsBefore: knapsack?.before,
    knapsackWorkerStatsAfter: knapsack?.after,
    networkFlowWorkerStatsBefore: networkFlow?.before,
    networkFlowWorkerStatsAfter: networkFlow?.after,
    setCoverWorkerStatsBefore: setCover?.before,
    setCoverWorkerStatsAfter: setCover?.after,
    rcpspWorkerStatsBefore: rcpsp?.before,
    rcpspWorkerStatsAfter: rcpsp?.after,
    mathOptWorkerStatsBefore: mathOpt?.before,
    mathOptWorkerStatsAfter: mathOpt?.after,
    pdlpWorkerStatsBefore: pdlp?.before,
    pdlpWorkerStatsAfter: pdlp?.after,
  });
}
