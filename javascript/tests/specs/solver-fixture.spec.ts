import { expect, test } from '@playwright/test';
import browserFixtureGroups from '../../../tests/harness/browser_groups.ts';

type WorkerStats = {
  total?: number;
  pthread?: number;
  executorWorkers?: Record<string, number>;
  activeExecutorWorkers?: Record<string, number>;
  executorWorkerRequests?: Record<string, number>;
};

test('runs the shared solver fixture cases across executor modes', async ({ page }) => {
  const includeServer = process.env.ORTOOLS_TEST_SERVER === '1';
  const requestedGroup = process.env.FIXTURE_CASE_GROUP;
  const groups = requestedGroup
    ? browserFixtureGroups.filter((group) => group === requestedGroup)
    : browserFixtureGroups;
  if (groups.length === 0) throw new Error(`Unknown fixture case group: ${requestedGroup}`);
  const browserErrors: string[] = [];
  let serverStreamRequests = 0;
  let failOnPageError: (error: Error) => void = () => {};
  const pageErrorPromise = new Promise<never>((_, reject) => {
    failOnPageError = reject;
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(`console error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(`page error: ${error.message}`);
    failOnPageError(error);
  });
  page.on('requestfailed', (request) => {
    browserErrors.push(`request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on('request', (request) => {
    if (includeServer && new URL(request.url()).pathname.endsWith('/stream')) {
      serverStreamRequests += 1;
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`bad response: ${response.status()} ${response.url()}`);
    }
  });

  const status = page.locator('#status');
  const groupStatuses: unknown[] = [];
  for (const group of groups) {
    const search = new URLSearchParams({ group });
    if (includeServer) search.set('server', '1');
    await page.goto(`/?${search}`);

    try {
      await Promise.race([
        page.waitForFunction(() => {
          const text = document.getElementById('status')?.textContent;
          if (!text || text === 'pending') return false;
          const status = JSON.parse(text) as { ok?: boolean };
          return status.ok === true;
        }),
        pageErrorPromise,
      ]);
    } catch (error) {
      const statusText = await status
        .evaluate((element) => element.textContent)
        .catch(() => '<missing #status>');
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `Fixture group: ${group}`,
          `Current #status: ${statusText}`,
          ...browserErrors,
        ].join('\n\n'),
      );
    }
    groupStatuses.push(JSON.parse(await status.textContent() ?? '{}'));
  }

  const parsedStatus = Object.assign({}, ...groupStatuses) as {
    cloudExecutorResult?: {
      id?: string;
      ok?: boolean;
    };
    cpSatConcurrencyResult?: {
      id?: string;
      ok?: boolean;
    };
    mpSolverConcurrencyResult?: {
      id?: string;
      ok?: boolean;
    };
    mpSolverWorkerLifecycleResult?: {
      id?: string;
      ok?: boolean;
    };
    routingConcurrencyResult?: {
      id?: string;
      ok?: boolean;
    };
    routingWorkerLifecycleResult?: {
      id?: string;
      ok?: boolean;
    };
    knapsackConcurrencyResult?: {
      id?: string;
      ok?: boolean;
    };
    knapsackWorkerLifecycleResult?: {
      id?: string;
      ok?: boolean;
    };
    knapsackEventHandlerResult?: {
      id?: string;
      ok?: boolean;
    };
    solverConcurrencyResult?: {
      id?: string;
      ok?: boolean;
    };
    results?: Array<{
      mode?: string;
      workerProfile?: string;
      ok?: boolean;
      solverStatus?: string;
      params?: Record<string, unknown>;
      cases?: Array<{
        id?: string;
        name?: string;
        ok?: boolean;
        solverStatus?: string;
      }>;
      workerStats?: WorkerStats;
    }>;
    cpSatSolverStructureResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      executor?: string;
      publicMethods?: string[];
      statusStates?: number[];
      responseBytesLength?: number;
    }>;
    cpSatWorkerLifecycleResult?: {
      id?: string;
      ok?: boolean;
    };
    cpSatWorkerLifecycleStatsBefore?: WorkerStats;
    cpSatWorkerLifecycleStatsAfter?: WorkerStats;
    cpSatSolverStructureWorkerStatsBefore?: WorkerStats;
    cpSatSolverStructureWorkerStatsAfter?: WorkerStats;
    cpSatSubsolverResults?: Array<{
      id?: string;
      mode?: string;
      searchWorkers?: number;
      selectedSubsolvers?: string[];
      numLpIterations?: number;
      ok?: boolean;
    }>;
    highLevelCpSatResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      mode?: string;
      workerProfile?: string;
      params?: Record<string, unknown>;
    }>;
    highLevelCpSatWorkerStatsBefore?: WorkerStats;
    highLevelCpSatWorkerStatsAfter?: WorkerStats;
    cpSatWorkerStatsBefore?: WorkerStats;
    cpSatWorkerStatsAfter?: WorkerStats;
    routingResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      objective?: number;
      routeDistance?: number;
      route?: number[];
    }>;
    mpSolverResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      status?: number;
      objective?: number;
      values?: Record<string, number>;
    }>;
    knapsackResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      profit?: number;
      optimal?: boolean;
    }>;
    networkFlowResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      status?: number;
      objectiveValue?: number;
    }>;
    networkFlowConcurrencyResult?: { ok?: boolean };
    networkFlowWorkerLifecycleResult?: { ok?: boolean };
    networkFlowEventHandlerResult?: { ok?: boolean };
    rcpspResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
      makespan?: number | null;
      statusName?: string;
    }>;
    setCoverResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
    }>;
    setCoverConcurrencyResult?: { ok?: boolean };
    setCoverWorkerLifecycleResult?: { ok?: boolean };
    setCoverEventHandlerResult?: { ok?: boolean };
    mathOptResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
    }>;
    pdlpResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
    }>;
    routingWorkerStatsBefore?: WorkerStats;
    routingWorkerStatsAfter?: WorkerStats;
    mpSolverWorkerStatsBefore?: WorkerStats;
    mpSolverWorkerStatsAfter?: WorkerStats;
    knapsackWorkerStatsBefore?: WorkerStats;
    knapsackWorkerStatsAfter?: WorkerStats;
    networkFlowWorkerStatsBefore?: WorkerStats;
    networkFlowWorkerStatsAfter?: WorkerStats;
    setCoverWorkerStatsBefore?: WorkerStats;
    setCoverWorkerStatsAfter?: WorkerStats;
    rcpspWorkerStatsBefore?: WorkerStats;
    rcpspWorkerStatsAfter?: WorkerStats;
    mathOptWorkerStatsBefore?: WorkerStats;
    mathOptWorkerStatsAfter?: WorkerStats;
    pdlpWorkerStatsBefore?: WorkerStats;
    pdlpWorkerStatsAfter?: WorkerStats;
  };
  const expectStableCaseIds = (results: Array<{ id?: string; ok?: boolean }> | undefined, label: string) => {
    expect(results?.length, `${label} result count`).toBeGreaterThan(0);
    expect(results?.every((result) => typeof result.id === 'string' && result.id.length > 0), `${label} stable case IDs`).toBe(true);
    expect(results?.every((result) => result.ok === true), `${label} ok results`).toBe(true);
  };
  if (requestedGroup) {
    if (requestedGroup === 'cp-sat-worker-lifecycle') {
      expect(parsedStatus.cpSatWorkerLifecycleResult).toEqual(expect.objectContaining({
        id: 'cp_sat.worker.lifecycle',
        ok: true,
      }));
      expect(parsedStatus.cpSatWorkerLifecycleStatsAfter?.executorWorkers?.['cp-sat']).toBeGreaterThan(
        parsedStatus.cpSatWorkerLifecycleStatsBefore?.executorWorkers?.['cp-sat'] ?? 0,
      );
      expect(parsedStatus.cpSatWorkerLifecycleStatsAfter?.activeExecutorWorkers?.['cp-sat']).toBe(
        (parsedStatus.cpSatWorkerLifecycleStatsBefore?.activeExecutorWorkers?.['cp-sat'] ?? 0) + 1,
      );
    }
    return;
  }
  expect(parsedStatus.cloudExecutorResult).toEqual(expect.objectContaining({
    id: 'cloud/status',
    ok: true,
  }));
  expect(parsedStatus.cpSatConcurrencyResult).toEqual(expect.objectContaining({
    id: 'cp_sat.executor.concurrency',
    ok: true,
  }));
  expect(parsedStatus.mpSolverConcurrencyResult).toEqual(expect.objectContaining({
    id: 'mp_solver.executor.concurrency',
    ok: true,
  }));
  expect(parsedStatus.mpSolverWorkerLifecycleResult).toEqual(expect.objectContaining({
    id: 'mp_solver.worker.lifecycle',
    ok: true,
  }));
  expect(parsedStatus.routingConcurrencyResult).toEqual(expect.objectContaining({
    id: 'routing.executor.concurrency',
    ok: true,
  }));
  expect(parsedStatus.routingWorkerLifecycleResult).toEqual(expect.objectContaining({
    id: 'routing.worker.lifecycle',
    ok: true,
  }));
  expect(parsedStatus.knapsackConcurrencyResult).toEqual(expect.objectContaining({
    id: 'knapsack.executor.concurrency',
    ok: true,
  }));
  expect(parsedStatus.knapsackWorkerLifecycleResult).toEqual(expect.objectContaining({
    id: 'knapsack.worker.lifecycle',
    ok: true,
  }));
  expect(parsedStatus.knapsackEventHandlerResult).toEqual(expect.objectContaining({
    id: 'knapsack.event-handler.recovery',
    ok: true,
  }));
  expect(parsedStatus.solverConcurrencyResult).toEqual(expect.objectContaining({
    id: 'mathopt_pdlp.executor.concurrency',
    ok: true,
  }));
  if (includeServer) expect(serverStreamRequests, 'native server SSE requests').toBeGreaterThan(0);
  const expectedHighLevelCpSatProfiles = [
    'direct/1 worker/1',
    'direct/4 workers/4',
    'worker/1 worker/1',
    'worker/4 workers/4',
    ...(includeServer ? ['server/1 worker/1', 'server/4 workers/4'] : []),
  ].sort();
  const highLevelCpSatProfileKey = (result: {
    mode?: string;
    workerProfile?: string;
    params?: Record<string, unknown>;
  }) => `${result.mode}/${result.workerProfile}/${String(result.params?.numWorkers)}`;
  expectStableCaseIds(parsedStatus.cpSatSolverStructureResults, 'CP-SAT solver structure');
  expect(parsedStatus.cpSatWorkerLifecycleResult).toEqual(expect.objectContaining({
    id: 'cp_sat.worker.lifecycle',
    ok: true,
  }));
  expect(parsedStatus.cpSatWorkerLifecycleStatsAfter?.executorWorkers?.['cp-sat']).toBeGreaterThan(
    parsedStatus.cpSatWorkerLifecycleStatsBefore?.executorWorkers?.['cp-sat'] ?? 0,
  );
  expect(parsedStatus.cpSatWorkerLifecycleStatsAfter?.activeExecutorWorkers?.['cp-sat']).toBe(
    (parsedStatus.cpSatWorkerLifecycleStatsBefore?.activeExecutorWorkers?.['cp-sat'] ?? 0) + 1,
  );
  expectStableCaseIds(parsedStatus.cpSatSubsolverResults, 'CP-SAT subsolver selection');
  expect(parsedStatus.cpSatSubsolverResults).toHaveLength(includeServer ? 6 : 4);
  expect(parsedStatus.cpSatSubsolverResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      mode: 'direct',
      searchWorkers: 1,
      selectedSubsolvers: ['no_lp'],
      numLpIterations: 0,
      ok: true,
    }),
    expect.objectContaining({
      mode: 'worker',
      searchWorkers: 1,
      selectedSubsolvers: ['no_lp'],
      numLpIterations: 0,
      ok: true,
    }),
    expect.objectContaining({
      mode: 'direct',
      searchWorkers: 4,
      ok: true,
    }),
    expect.objectContaining({
      mode: 'worker',
      searchWorkers: 4,
      ok: true,
    }),
    ...(includeServer ? [
      expect.objectContaining({
        mode: 'server',
        searchWorkers: 1,
        selectedSubsolvers: ['no_lp'],
        numLpIterations: 0,
        ok: true,
      }),
      expect.objectContaining({
        mode: 'server',
        searchWorkers: 4,
        ok: true,
      }),
    ] : []),
  ]));
  for (const result of parsedStatus.cpSatSubsolverResults ?? []) {
    if (result.searchWorkers === 4) {
      expect(result.selectedSubsolvers?.length).toBeGreaterThan(1);
    }
  }
  expect(parsedStatus.cpSatSolverStructureResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'cp_sat.solver_structure.package_contract',
      publicMethods: expect.arrayContaining([
        'createModel',
        'getSchemas',
        'modelStats',
        'solve',
        'validate',
      ]),
      ok: true,
    }),
    expect.objectContaining({
      id: 'cp_sat.solver_structure.solve_auto',
      executor: 'auto',
      responseBytesLength: expect.any(Number),
      statusStates: expect.arrayContaining([2, 3, 6]),
      ok: true,
    }),
    expect.objectContaining({
      id: 'cp_sat.solver_structure.solve_direct',
      executor: 'direct',
      responseBytesLength: expect.any(Number),
      statusStates: expect.arrayContaining([2, 3, 6]),
      ok: true,
    }),
    expect.objectContaining({
      id: 'cp_sat.solver_structure.solve_worker',
      executor: 'worker',
      responseBytesLength: expect.any(Number),
      statusStates: expect.arrayContaining([2, 3, 6]),
      ok: true,
    }),
    ...(includeServer ? [expect.objectContaining({
      id: 'cp_sat.solver_structure.solve_server',
      executor: 'server',
      responseBytesLength: expect.any(Number),
      statusStates: expect.arrayContaining([2, 3, 6]),
      ok: true,
    })] : []),
  ]));
  for (const result of parsedStatus.cpSatSolverStructureResults ?? []) {
    if (result.responseBytesLength !== undefined) {
      expect(result.responseBytesLength).toBeGreaterThan(0);
    }
  }
  expect(parsedStatus.cpSatSolverStructureWorkerStatsAfter?.executorWorkerRequests?.['cp-sat']).toBeGreaterThan(
    parsedStatus.cpSatSolverStructureWorkerStatsBefore?.executorWorkerRequests?.['cp-sat'] ?? -1,
  );
  expect(parsedStatus.cpSatSolverStructureWorkerStatsAfter?.activeExecutorWorkers?.['cp-sat']).toBe(
    parsedStatus.cpSatSolverStructureWorkerStatsBefore?.activeExecutorWorkers?.['cp-sat'],
  );
  expect(parsedStatus.results).toHaveLength(includeServer ? 6 : 4);
  expect(parsedStatus.results).toEqual([
    expect.objectContaining({ mode: 'direct', workerProfile: '1 worker', params: { numWorkers: 1 }, ok: true }),
    expect.objectContaining({ mode: 'direct', workerProfile: '4 workers', params: { numWorkers: 4 }, ok: true }),
    expect.objectContaining({ mode: 'worker', workerProfile: '1 worker', params: { numWorkers: 1 }, ok: true }),
    expect.objectContaining({ mode: 'worker', workerProfile: '4 workers', params: { numWorkers: 4 }, ok: true }),
    ...(includeServer ? [
      expect.objectContaining({ mode: 'server', workerProfile: '1 worker', params: { numWorkers: 1 }, ok: true }),
      expect.objectContaining({ mode: 'server', workerProfile: '4 workers', params: { numWorkers: 4 }, ok: true }),
    ] : []),
  ]);
  const [directResult] = parsedStatus.results ?? [];
  expect(directResult?.cases?.length).toBeGreaterThan(0);
  expectStableCaseIds(parsedStatus.highLevelCpSatResults, 'high-level CP-SAT');
  for (const result of parsedStatus.results ?? []) {
    expectStableCaseIds(result.cases, `CP-SAT ${result.mode}/${result.workerProfile}`);
    expect(result.cases).toEqual(
      directResult?.cases?.map((testCase) =>
        expect.objectContaining({
          name: testCase.name,
          ok: true,
        }),
      ),
    );
  }
  expect(parsedStatus.results?.[0].workerStats).toEqual(
    expect.objectContaining({
      pthread: 4,
    }),
  );
  expect(parsedStatus.results?.[0].workerStats?.total).toBeGreaterThanOrEqual(4);
  expect(parsedStatus.results?.[2].workerStats?.total).toBeGreaterThanOrEqual(5);
  expect(parsedStatus.highLevelCpSatWorkerStatsBefore?.executorWorkerRequests?.['cp-sat']).toBeUndefined();
  const highLevelCpSatProfilesByCase = new Map<string, Set<string>>();
  for (const result of parsedStatus.highLevelCpSatResults ?? []) {
    if (!result.id) continue;
    const profiles = highLevelCpSatProfilesByCase.get(result.id) ?? new Set<string>();
    profiles.add(highLevelCpSatProfileKey(result));
    highLevelCpSatProfilesByCase.set(result.id, profiles);
  }
  for (const [caseId, profiles] of highLevelCpSatProfilesByCase) {
    expect([...profiles].sort(), `high-level CP-SAT executor matrix for ${caseId}`).toEqual(expectedHighLevelCpSatProfiles);
  }
  expect(parsedStatus.highLevelCpSatWorkerStatsAfter?.executorWorkerRequests?.['cp-sat']).toBeGreaterThan(0);
  expect(parsedStatus.highLevelCpSatWorkerStatsAfter?.activeExecutorWorkers?.['cp-sat']).toBeGreaterThan(
    parsedStatus.highLevelCpSatWorkerStatsBefore?.activeExecutorWorkers?.['cp-sat'] ?? 0,
  );
  expect(parsedStatus.cpSatWorkerStatsAfter?.activeExecutorWorkers?.['cp-sat']).toBe(
    parsedStatus.cpSatWorkerStatsBefore?.activeExecutorWorkers?.['cp-sat'],
  );
  expect(parsedStatus.results?.[0].workerStats?.executorWorkerRequests?.['cp-sat']).toBe(
    parsedStatus.highLevelCpSatWorkerStatsAfter?.executorWorkerRequests?.['cp-sat'],
  );
  expect(parsedStatus.results?.[2].workerStats?.executorWorkerRequests?.['cp-sat']).toBeGreaterThan(
    parsedStatus.results?.[0].workerStats?.executorWorkerRequests?.['cp-sat'] ?? 0,
  );
  expect(parsedStatus.routingResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'TestPyWrapRoutingModel.testRoutingSearchParameters (direct)',
      ok: true,
    }),
    expect.objectContaining({
      name: 'TestPyWrapRoutingModel.testRoutingSearchParameters (worker)',
      ok: true,
    }),
  ]));
  expectStableCaseIds(parsedStatus.routingResults, 'routing');
  expect(parsedStatus.routingWorkerStatsAfter?.executorWorkerRequests?.routing).toBeGreaterThan(
    parsedStatus.routingWorkerStatsBefore?.executorWorkerRequests?.routing ?? 0,
  );
  expect(parsedStatus.mpSolverWorkerStatsAfter?.executorWorkerRequests?.['mp-solver']).toBeGreaterThan(
    parsedStatus.mpSolverWorkerStatsBefore?.executorWorkerRequests?.['mp-solver'] ?? 0,
  );
  expect(parsedStatus.mpSolverResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'MPSolver: MPModelRequest solve (direct, 1 worker)',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: MPModelRequest solve (worker, 4 workers)',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: simple_lp_program.py (direct)',
      ok: true,
      objective: 25,
      values: expect.objectContaining({ x: 0, y: 2.5 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: simple_lp_program.py (worker)',
      ok: true,
      objective: 25,
      values: expect.objectContaining({ x: 0, y: 2.5 }),
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'MPSolver: simple_lp_program.py (server)',
      ok: true,
      objective: 25,
      values: expect.objectContaining({ x: 0, y: 2.5 }),
    })] : []),
    expect.objectContaining({
      name: 'MPSolver: simple_mip_program.py (direct)',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: simple_mip_program.py (worker)',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'MPSolver: simple_mip_program.py (server)',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    })] : []),
    expect.objectContaining({
      name: 'MPSolver: BOP binary project selection (direct)',
      ok: true,
      objective: 13,
      values: expect.objectContaining({ analytics: 1, dashboard: 0, alerts: 1 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: BOP binary project selection (worker)',
      ok: true,
      objective: 13,
      values: expect.objectContaining({ analytics: 1, dashboard: 0, alerts: 1 }),
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'MPSolver: BOP binary project selection (server)',
      ok: true,
      objective: 13,
      values: expect.objectContaining({ analytics: 1, dashboard: 0, alerts: 1 }),
    })] : []),
    expect.objectContaining({
      name: 'MPSolver: BOP integer production (direct)',
      ok: true,
      objective: 19,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: BOP integer production (worker)',
      ok: true,
      objective: 19,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'MPSolver: BOP integer production (server)',
      ok: true,
      objective: 19,
      values: expect.objectContaining({ x: 3, y: 2 }),
    })] : []),
    expect.objectContaining({
      name: 'MPSolver: lp_test.py testBopInfeasible',
      ok: true,
      status: 0,
    }),
  ]));
  expectStableCaseIds(parsedStatus.mpSolverResults, 'MPSolver');
  expect(parsedStatus.knapsackWorkerStatsAfter?.executorWorkerRequests?.knapsack).toBeGreaterThan(
    parsedStatus.knapsackWorkerStatsBefore?.executorWorkerRequests?.knapsack ?? 0,
  );
  expect(parsedStatus.knapsackWorkerStatsAfter?.activeExecutorWorkers?.knapsack).toBeGreaterThan(
    parsedStatus.knapsackWorkerStatsBefore?.activeExecutorWorkers?.knapsack ?? 0,
  );
  expect(parsedStatus.knapsackResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveOneDimension (direct)',
      ok: true,
      profit: 34,
      optimal: true,
    }),
    expect.objectContaining({
      name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveTwoDimensions (worker)',
      ok: true,
      profit: 30,
      optimal: true,
    }),
    expect.objectContaining({
      name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveBigOneDimension (worker)',
      ok: true,
      profit: 7534,
      optimal: true,
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveOneDimension (server)',
      ok: true,
      profit: 34,
      optimal: true,
    })] : []),
  ]));
  expectStableCaseIds(parsedStatus.knapsackResults, 'Knapsack');
  expect(parsedStatus.networkFlowWorkerStatsAfter?.executorWorkerRequests?.['network-flow']).toBeGreaterThan(
    parsedStatus.networkFlowWorkerStatsBefore?.executorWorkerRequests?.['network-flow'] ?? 0,
  );
  expect(parsedStatus.networkFlowResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'simple_max_flow_program.py (direct)',
      ok: true,
      objectiveValue: 60,
    }),
    expect.objectContaining({
      name: 'simple_min_cost_flow_program.py (worker)',
      ok: true,
      objectiveValue: 150,
    }),
    expect.objectContaining({
      name: 'assignment_linear_sum_assignment.py (worker)',
      ok: true,
      objectiveValue: 265,
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'simple_max_flow_program.py (server)',
      ok: true,
      objectiveValue: 60,
    })] : []),
  ]));
  expectStableCaseIds(parsedStatus.networkFlowResults, 'Network Flow');
  expect(parsedStatus.networkFlowConcurrencyResult?.ok).toBe(true);
  expect(parsedStatus.networkFlowWorkerLifecycleResult?.ok).toBe(true);
  expect(parsedStatus.networkFlowEventHandlerResult?.ok).toBe(true);
  expect(parsedStatus.setCoverWorkerStatsAfter?.executorWorkerRequests?.['set-cover']).toBeGreaterThan(
    parsedStatus.setCoverWorkerStatsBefore?.executorWorkerRequests?.['set-cover'] ?? 0,
  );
  expectStableCaseIds(parsedStatus.setCoverResults, 'Set Cover');
  expect(parsedStatus.setCoverConcurrencyResult?.ok).toBe(true);
  expect(parsedStatus.setCoverWorkerLifecycleResult?.ok).toBe(true);
  expect(parsedStatus.setCoverEventHandlerResult?.ok).toBe(true);
  expect(parsedStatus.rcpspWorkerStatsAfter?.executorWorkerRequests?.['cp-sat']).toBeGreaterThan(
    parsedStatus.rcpspWorkerStatsBefore?.executorWorkerRequests?.['cp-sat'] ?? 0,
  );
  expect(parsedStatus.rcpspResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'RcpspTest.testParseAndAccess',
      ok: true,
      makespan: null,
    }),
    expect.objectContaining({
      name: 'RcpspCpSatSample.house_project (direct)',
      ok: true,
      makespan: 8,
      statusName: 'OPTIMAL',
    }),
    expect.objectContaining({
      name: 'RcpspCpSatSample.house_project (worker)',
      ok: true,
      makespan: 8,
      statusName: 'OPTIMAL',
    }),
    ...(includeServer ? [expect.objectContaining({
      name: 'RcpspCpSatSample.house_project (server)',
      ok: true,
      makespan: 8,
      statusName: 'OPTIMAL',
    })] : []),
  ]));
  expectStableCaseIds(parsedStatus.rcpspResults, 'RCPSP');
  expect(parsedStatus.mathOptWorkerStatsAfter?.executorWorkerRequests?.mathopt).toBeGreaterThan(
    parsedStatus.mathOptWorkerStatsBefore?.executorWorkerRequests?.mathopt ?? 0,
  );
  expectStableCaseIds(parsedStatus.mathOptResults, 'MathOpt');
  expect(parsedStatus.pdlpWorkerStatsAfter?.executorWorkerRequests?.pdlp).toBeGreaterThan(
    parsedStatus.pdlpWorkerStatsBefore?.executorWorkerRequests?.pdlp ?? 0,
  );
  expectStableCaseIds(parsedStatus.pdlpResults, 'PDLP');
});
