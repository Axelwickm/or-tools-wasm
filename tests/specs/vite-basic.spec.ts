import { expect, test } from '@playwright/test';

test('runs the shared solver fixture cases with and without the worker bridge', async ({ page }) => {
  const browserErrors: string[] = [];
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
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`bad response: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/');

  const status = page.locator('#status');
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
    const statusText = await page
      .locator('#status')
      .evaluate((element) => element.textContent)
      .catch(() => '<missing #status>');
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `Current #status: ${statusText}`,
        ...browserErrors,
      ].join('\n\n'),
    );
  }

  const parsedStatus = JSON.parse(await status.textContent() ?? '{}') as {
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
      workerStats?: {
        total?: number;
        pthread?: number;
        cpSatSolve?: number;
      };
    }>;
    highLevelCpSatResults?: Array<{
      id?: string;
      name?: string;
      ok?: boolean;
    }>;
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
    routingWorkerStatsBefore?: {
      routingSolve?: number;
    };
    routingWorkerStatsAfter?: {
      routingSolve?: number;
    };
    mpSolverWorkerStatsBefore?: {
      mpSolverSolve?: number;
    };
    mpSolverWorkerStatsAfter?: {
      mpSolverSolve?: number;
    };
    knapsackWorkerStatsBefore?: {
      knapsackSolve?: number;
    };
    knapsackWorkerStatsAfter?: {
      knapsackSolve?: number;
    };
    networkFlowWorkerStatsBefore?: {
      graphSolve?: number;
    };
    networkFlowWorkerStatsAfter?: {
      graphSolve?: number;
    };
    setCoverWorkerStatsBefore?: {
      setCoverSolve?: number;
    };
    setCoverWorkerStatsAfter?: {
      setCoverSolve?: number;
    };
    rcpspWorkerStatsBefore?: {
      cpSatSolve?: number;
    };
    rcpspWorkerStatsAfter?: {
      cpSatSolve?: number;
    };
    mathOptWorkerStatsBefore?: {
      mathOptSolve?: number;
    };
    mathOptWorkerStatsAfter?: {
      mathOptSolve?: number;
    };
    pdlpWorkerStatsBefore?: {
      pdlpSolve?: number;
    };
    pdlpWorkerStatsAfter?: {
      pdlpSolve?: number;
    };
  };
  const expectStableCaseIds = (results: Array<{ id?: string; ok?: boolean }> | undefined, label: string) => {
    expect(results?.length, `${label} result count`).toBeGreaterThan(0);
    expect(results?.every((result) => typeof result.id === 'string' && result.id.length > 0), `${label} stable case IDs`).toBe(true);
    expect(results?.every((result) => result.ok === true), `${label} ok results`).toBe(true);
  };
  expect(parsedStatus.results).toHaveLength(4);
  expect(parsedStatus.results).toEqual([
    expect.objectContaining({ mode: 'direct', workerProfile: '1 worker', params: { numSearchWorkers: 1 }, ok: true }),
    expect.objectContaining({ mode: 'direct', workerProfile: '4 workers', params: { numSearchWorkers: 4 }, ok: true }),
    expect.objectContaining({ mode: 'worker', workerProfile: '1 worker', params: { numSearchWorkers: 1 }, ok: true }),
    expect.objectContaining({ mode: 'worker', workerProfile: '4 workers', params: { numSearchWorkers: 4 }, ok: true }),
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
  expect(parsedStatus.results?.[0].workerStats?.cpSatSolve).toBe(0);
  expect(parsedStatus.results?.[2].workerStats?.cpSatSolve).toBeGreaterThan(0);
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
  expect(parsedStatus.routingWorkerStatsBefore?.routingSolve).toBe(0);
  expect(parsedStatus.routingWorkerStatsAfter?.routingSolve).toBeGreaterThan(1);
  expect(parsedStatus.mpSolverWorkerStatsBefore?.mpSolverSolve).toBe(0);
  expect(parsedStatus.mpSolverWorkerStatsAfter?.mpSolverSolve).toBeGreaterThanOrEqual(2);
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
      name: 'MPSolver: simple_lp_program.py',
      ok: true,
      objective: 25,
      values: expect.objectContaining({ x: 0, y: 2.5 }),
    }),
    expect.objectContaining({
      name: 'MPSolver: simple_mip_program.py',
      ok: true,
      objective: 23,
      values: expect.objectContaining({ x: 3, y: 2 }),
    }),
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
    expect.objectContaining({
      name: 'MPSolver: lp_test.py testBopInfeasible',
      ok: true,
      status: 0,
    }),
  ]));
  expectStableCaseIds(parsedStatus.mpSolverResults, 'MPSolver');
  expect(parsedStatus.knapsackWorkerStatsBefore?.knapsackSolve).toBe(0);
  expect(parsedStatus.knapsackWorkerStatsAfter?.knapsackSolve).toBeGreaterThanOrEqual(3);
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
  ]));
  expectStableCaseIds(parsedStatus.knapsackResults, 'Knapsack');
  expect(parsedStatus.networkFlowWorkerStatsBefore?.graphSolve).toBe(0);
  expect(parsedStatus.networkFlowWorkerStatsAfter?.graphSolve).toBeGreaterThanOrEqual(3);
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
  ]));
  expectStableCaseIds(parsedStatus.networkFlowResults, 'Network Flow');
  expect(parsedStatus.setCoverWorkerStatsBefore?.setCoverSolve).toBe(0);
  expect(parsedStatus.setCoverWorkerStatsAfter?.setCoverSolve).toBeGreaterThanOrEqual(1);
  expectStableCaseIds(parsedStatus.setCoverResults, 'Set Cover');
  expect(parsedStatus.rcpspWorkerStatsAfter?.cpSatSolve).toBeGreaterThan(parsedStatus.rcpspWorkerStatsBefore?.cpSatSolve ?? 0);
  expect(parsedStatus.rcpspResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'RcpspTest.testParseAndAccess (direct)',
      ok: true,
      makespan: null,
    }),
    expect.objectContaining({
      name: 'RcpspTest.testParseAndAccess (worker)',
      ok: true,
      makespan: null,
    }),
    expect.objectContaining({
      name: 'RcpspCpSatSample.house_project (direct, 1 worker)',
      ok: true,
      makespan: 8,
      statusName: 'OPTIMAL',
    }),
    expect.objectContaining({
      name: 'RcpspCpSatSample.house_project (worker, 4 workers)',
      ok: true,
      makespan: 8,
      statusName: 'OPTIMAL',
    }),
  ]));
  expectStableCaseIds(parsedStatus.rcpspResults, 'RCPSP');
  expect(parsedStatus.mathOptWorkerStatsBefore?.mathOptSolve).toBe(0);
  expect(parsedStatus.mathOptWorkerStatsAfter?.mathOptSolve).toBeGreaterThanOrEqual(1);
  expectStableCaseIds(parsedStatus.mathOptResults, 'MathOpt');
  expect(parsedStatus.pdlpWorkerStatsAfter?.pdlpSolve).toBeGreaterThan(parsedStatus.pdlpWorkerStatsBefore?.pdlpSolve ?? 0);
  expectStableCaseIds(parsedStatus.pdlpResults, 'PDLP');
});
