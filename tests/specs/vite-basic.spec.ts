import { expect, test } from '@playwright/test';

test('runs the shared CP-SAT cases with and without the worker bridge', async ({ page }) => {
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
        name?: string;
        ok?: boolean;
        solverStatus?: string;
      }>;
      workerStats?: {
        total?: number;
        pthread?: number;
      };
    }>;
    routingResults?: Array<{
      name?: string;
      ok?: boolean;
      objective?: number;
      routeDistance?: number;
      route?: number[];
    }>;
    mpSolverResults?: Array<{
      name?: string;
      ok?: boolean;
      status?: number;
      objective?: number;
      values?: Record<string, number>;
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
  for (const result of parsedStatus.results ?? []) {
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
      total: 4,
      pthread: 4,
    }),
  );
  expect(parsedStatus.results?.[2].workerStats?.total).toBeGreaterThanOrEqual(5);
  expect(parsedStatus.routingResults).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'TestPyWrapRoutingModel.testRoutingSearchParameters',
      ok: true,
    }),
  ]));
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
  ]));
});
