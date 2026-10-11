import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';

// One real worker solve per example. Keep page-specific expectations explicit:
// a returned button or a lifecycle event alone does not prove a solution exists.
const examples: Record<string, [string, RegExp]> = {
  bop_project_selection: ['#solution-output', /OPTIMAL/],
  cbc_simple_mip: ['#solution-output', /OPTIMAL/],
  clp_simple_lp: ['#solution-output', /OPTIMAL/],
  clp_transportation: ['#status', /Objective: [\d.]+/],
  glop_simple_lp: ['#solution-output', /OPTIMAL/],
  glop_stigler_diet: ['#status', /Annual cost:|Objective:/],
  glpk_simple_lp: ['#solution-output', /OPTIMAL/],
  glpk_simple_mip: ['#solution-output', /OPTIMAL/],
  gscip_simple_mip: ['#status', /Termination:.*OPTIMAL/],
  knapsack_simple: ['#status', /Done\. Total value \d+/],
  magic_square: ['#solution-grid', /^\s*\d/],
  mathopt_basic: ['#status', /Termination:.*OPTIMAL/],
  pdlp_import: ['#status', /Termination:.*OPTIMAL/],
  mathopt_factory_floor: ['#metrics', /[1-9]\d*\/\d+\s*jobs in progress/],
  model_playground: ['#status', /Solve finished\./],
  mp_simple_lp: ['#solution-output', /OPTIMAL/],
  mpsolver_network_design: ['#solution-output', /OPTIMAL/],
  network_flow_assignment: ['#solution-output', /Optimal cost:\s*\d+/],
  network_flow_max_flow: ['#solution-output', /Optimal flow:\s*\d+/],
  network_flow_min_cost_flow: ['#solution-output', /Optimal cost:\s*\d+/],
  project_calendar: ['#status', /all constraints satisfied/],
  rcpsp_project: ['#status', /Done\. OPTIMAL makespan \d+/],
  routing_dispatch: ['#status', /Objective: \d+/],
  routing_simple: ['#status', /Objective: \d+/],
  routing_vrp: ['#status', /Objective: \d+/],
  sat_simple_mip: ['#solution-output', /OPTIMAL/],
  scip_assignment: ['#solution-output', /OPTIMAL/],
  scip_simple_mip: ['#solution-output', /OPTIMAL/],
  set_cover_simple: ['#status', /Done\. Cost \d+/],
  sports_scheduling: ['#status', /Objective: \d+/],
  steel_mill_slab: ['#summary', /used \d+ slabs with total loss \d+/],
  sudoku_generator: ['#status', /Solved, status=/],
};

for (const executor of ['direct', 'worker', 'server']) for (const variant of ['investment', 'consumer']) {
  test(`rcpsp_project: ${variant} with ${executor}`, async ({ page }) => {
    test.skip(executor === 'server' && process.env.ORTOOLS_TEST_SERVER !== '1', 'Local server fixture not requested');
    await page.goto('/rcpsp_project.html');
    await page.locator('#solver-executor').selectOption(executor);
    await page.locator('#workers').fill('1');
    await page.locator('#variant').selectOption(variant);
    await page.locator('#run-variant').click();
    const result = page.locator('#variant-result');
    await expect(result).toContainText('Status: OPTIMAL', { timeout: 60_000 });
    await expect(result).toContainText('Makespan: 2');
    await expect(result).toContainText(variant === 'investment' ? 'Objective (capacity cost): 20' : 'Objective (makespan): 2');
    await expect(result).toContainText(variant === 'investment' ? 'Purchased crew capacity: 5' : 'consume: 2-2, demand -4');
    await page.locator('#variant').selectOption(variant === 'investment' ? 'consumer' : 'investment');
    await expect(result).toHaveText('Run the solver to view the solution.');
  });
}

test('every solve page has a successful-solve check', () => {
  const site = new URL('../../site/', import.meta.url);
  const solvePages = readdirSync(site).filter((file) => file.endsWith('.html')
    && !['index.html', 'schema_viewer.html'].includes(file));
  expect(Object.keys(examples).sort()).toEqual(solvePages.map((file) => file.replace('.html', '')).sort());
});

const variations: Array<{ page: string; label: string; inputs?: Record<string, string>; selects?: Record<string, string>; checks?: string[] }> = [
  { page: 'magic_square', label: 'size 3', inputs: { '#size': '3' } },
  { page: 'sports_scheduling', label: 'four teams', inputs: { '#teams': '4' } },
  { page: 'routing_simple', label: 'six destinations', inputs: { '#node-count': '6' } },
  { page: 'routing_vrp', label: 'twelve destinations, two vehicles', inputs: { '#destination-count': '12', '#vehicle-count': '2' } },
  { page: 'routing_dispatch', label: 'smaller fleet problem', inputs: { '#delivery-count': '10', '#vehicle-count': '2', '#vehicle-capacity': '200', '#distance-cap': '3000' } },
  { page: 'routing_dispatch', label: 'resource slots', inputs: { '#delivery-count': '2', '#vehicle-count': '2', '#resource-slots': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#use-resources'] },
  { page: 'routing_dispatch', label: 'required delivery choice', inputs: { '#delivery-count': '2', '#vehicle-count': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#delivery-choice'] },
  { page: 'routing_dispatch', label: 'conditional delivery order', inputs: { '#delivery-count': '2', '#vehicle-count': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#delivery-order'] },
  { page: 'network_flow_assignment', label: 'size 3', inputs: { '#assignment-size': '3' } },
  { page: 'network_flow_max_flow', label: 'three transit nodes', inputs: { '#middle-count': '3' } },
  { page: 'network_flow_min_cost_flow', label: 'smaller network', inputs: { '#supply-count': '1', '#transit-count': '3', '#demand-count': '2' } },
  { page: 'mp_simple_lp', label: 'SCIP backend', selects: { '#solver': 'SCIP' } },
  { page: 'mp_simple_lp', label: 'native incremental bound update', selects: { '#solver': 'GLOP' }, checks: ['#incremental'] },
  { page: 'mp_simple_lp', label: 'native parameter validation', inputs: { '#solver-parameters': 'use_preprocessing: false' } },
  { page: 'mp_simple_lp', label: 'SAT parameters with two solver threads', inputs: { '#solver-parameters': 'random_seed: 123', '#workers': '2' }, selects: { '#solver': 'SAT' } },
  { page: 'mathopt_basic', label: 'GLOP backend', selects: { '#solver': 'GLOP' } },
  { page: 'mathopt_basic', label: 'CP-SAT incumbent callbacks', selects: { '#solver': 'CP_SAT' } },
  { page: 'mathopt_basic', label: 'SCIP lazy capacity constraint', selects: { '#solver': 'GSCIP' }, checks: ['#lazy-constraint'] },
  { page: 'mathopt_basic', label: 'live solver logs', selects: { '#solver': 'GLOP' }, checks: ['#live-logs'] },
  { page: 'mathopt_basic', label: 'serialized model with callbacks', selects: { '#solver': 'CP_SAT' }, checks: ['#raw-proto'] },
  { page: 'mathopt_basic', label: 'native incremental bound update', selects: { '#solver': 'GLOP' }, checks: ['#raw-proto', '#raw-incremental'] },
  { page: 'project_calendar', label: 'Thursday deadline', selects: { '#deadline': '32' } },
  { page: 'steel_mill_slab', label: 'table formulation', selects: { '#solver-method': 'sat_table' } },
  { page: 'knapsack_simple', label: 'zero volume capacity', inputs: { '[data-kind="capacity"][data-dimension="1"]': '0' } },
  { page: 'knapsack_simple', label: 'CP-SAT with four workers', selects: { '#backend': '10' }, inputs: { '#num-workers': '4' } },
];

const scenarios: typeof variations = [
  ...Object.keys(examples).map((page) => ({ page, label: 'default problem' })),
  ...variations,
];
for (const scenario of scenarios) {
  test(`${scenario.page}: solve ${scenario.label}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${scenario.page}.html`);
    await page.locator('select').filter({ has: page.locator('option[value="worker"]') }).selectOption('worker');
    // Keep CI resource use bounded without changing the displayed problem.
    for (const input of await page.locator('#workers, #worker-count, #worker-threads').all()) await input.fill('1');
    for (const [selector, value] of Object.entries(scenario.selects ?? {})) await page.locator(selector).selectOption(value);
    for (const [selector, value] of Object.entries(scenario.inputs ?? {})) {
      await page.locator(selector).fill(value);
      await page.locator(selector).dispatchEvent('change');
    }
    for (const selector of scenario.checks ?? []) await page.locator(selector).check();
    const run = page.locator(scenario.page === 'mathopt_factory_floor' ? '#toggle-running'
      : ['sudoku_generator', 'model_playground'].includes(scenario.page) ? '#solve' : '#run');
    await run.click();
    const [selector, success] = examples[scenario.page];
    await expect(page.locator(selector)).toContainText(success, { timeout: 60_000 });
    if (scenario.page === 'magic_square') {
      const size = Number(await page.locator('#size').inputValue());
      const values = (await page.locator('#solution-grid .cell').allTextContents()).map(Number);
      expect(values).toHaveLength(size * size);
      expect(new Set(values).size).toBe(size * size);
      const total = size * (size * size + 1) / 2;
      for (let i = 0; i < size; i++) {
        expect(values.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0)).toBe(total);
        expect(values.filter((_, index) => index % size === i).reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
    if (scenario.page === 'pdlp_import') {
      await expect(page.locator('#solution-output')).toContainText(/Objective: 17(?:\.0+)?(?:\n|$)/);
      await expect(page.locator('#solution-output')).toContainText(/x: 4(?:\.0+)?(?:\n|$)/);
    }
    if (scenario.page === 'mp_simple_lp' && (!scenario.selects?.['#solver'] || scenario.selects['#solver'] === 'GLOP')) {
      await expect(page.locator('#status')).toContainText('Initial problem:');
    }
    if (scenario.page === 'mp_simple_lp' && scenario.checks?.includes('#incremental')) {
      await expect(page.getByRole('row', { name: /^Objective / }).getByRole('cell')).toHaveText('1');
      await expect(page.getByRole('row', { name: /^Native session/ }).getByRole('cell')).toContainText('Retained solver');
    }
    if (scenario.page === 'mathopt_basic' && scenario.checks?.includes('#lazy-constraint')) {
      await expect(page.locator('#status')).toContainText('Adding lazy capacity constraint');
      await expect(page.getByRole('row', { name: /^Lazy constraints added/ }).getByRole('cell')).toHaveText(/^[1-9]\d*$/);
      await expect(page.locator('#status')).toContainText('Objective: 2');
    }
    if (scenario.page === 'mathopt_basic' && scenario.checks?.includes('#live-logs')) {
      await expect(page.getByRole('row', { name: /^Native log batches/ }).getByRole('cell')).toHaveText(/^[1-9]\d*$/);
    }
    if (scenario.page === 'mathopt_basic' && scenario.checks?.includes('#raw-proto')) {
      await expect(page.getByRole('row', { name: /^Input/ }).getByRole('cell')).toHaveText('Serialized ModelProto');
      if (scenario.checks.includes('#raw-incremental')) {
        await expect(page.locator('#status')).toContainText('Objective: 1');
        await expect(page.getByRole('row', { name: /^Native update applied/ }).getByRole('cell')).toHaveText('true');
      } else {
        await expect(page.locator('#status')).toContainText('Objective: 2');
        await expect(page.getByRole('row', { name: /^Incumbent solutions/ }).getByRole('cell')).toHaveText(/^[1-9]\d*$/);
      }
    }
    if (scenario.page === 'network_flow_assignment') {
      await expect(page.locator('#solution-output tbody tr')).toHaveCount(Number(await page.locator('#assignment-size').inputValue()));
    }
    if (scenario.page === 'routing_dispatch') {
      const statusText = await page.locator('#status').innerText();
      const longest = statusText.match(/Longest route: (\d+)m/);
      expect(longest).not.toBeNull();
      const distances = (await page.locator('#route-output .route-card p').allTextContents())
        .flatMap(text => { const match = text.match(/pallets, (\d+)m/); return match ? [Number(match[1])] : []; });
      expect(BigInt(longest![1])).toBe(BigInt(Math.max(0, ...distances)));
    }
    if (scenario.label === 'resource slots') {
      await expect(page.locator('#status')).toContainText(/Resource slots:.*slot 1/);
      await expect(page.locator('#status')).toContainText('Native resource classes: 1');
    }
    if (scenario.label === 'required delivery choice') {
      await expect(page.locator('#status')).toContainText('Required delivery choice: satisfied.');
      await expect(page.locator('#route-output .route-card')).toContainText(/Delivery [12] \(\d+\)/);
    }
    if (scenario.label === 'conditional delivery order') {
      const manifest = await page.locator('#route-output .route-card').innerText();
      // Deliveries are optional; the first native solution may drop either stop.
      if (/Delivery 1 \(\d+\)/.test(manifest) && /Delivery 2 \(\d+\)/.test(manifest)) {
        expect(manifest.indexOf('Delivery 1 (')).toBeLessThan(manifest.indexOf('Delivery 2 ('));
      }
    }
    if (scenario.label === 'zero volume capacity') await expect(page.locator('#status')).toContainText('Total value 0.');
    if (scenario.page === 'model_playground') await expect(page.locator('#result-output')).toContainText('OPTIMAL');
    if (scenario.page === 'mathopt_factory_floor') await run.click(); // Stop the simulation after the first production plan.
    await expect(run).toBeEnabled();
    for (const output of await page.locator('#status, #metrics').all()) {
      await expect(output).not.toContainText(/Solve failed|Schedule failed|Error/);
    }
    expect(errors).toEqual([]);
  });
}

test('sudoku: generate with target clues and seed, then solve', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/sudoku_generator.html');
  await page.locator('#target-clues').fill('80');
  await page.locator('#seed').fill('7');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('Done. Generated puzzle has 80 clues.', { timeout: 60_000 });
  const clues = await page.locator('.sudoku-cell').evaluateAll((cells) => cells.filter((cell) => (cell as HTMLInputElement).value !== '').length);
  expect(clues).toBe(80);
  await page.locator('#solve').click();
  await expect(page.locator('#status')).toContainText('Solved, status=', { timeout: 60_000 });
  const values = await page.locator('.sudoku-cell').evaluateAll((cells) => cells.map((cell) => Number((cell as HTMLInputElement).value)));
  for (let i = 0; i < 9; i++) {
    expect(new Set(values.slice(i * 9, (i + 1) * 9)).size).toBe(9);
    expect(new Set(values.filter((_, index) => index % 9 === i)).size).toBe(9);
  }
  expect(errors).toEqual([]);
});

test('mp_simple_lp: reject solver-specific settings and recover', async ({ page }) => {
  await page.goto('/mp_simple_lp.html');
  await page.locator('#solver-executor').selectOption('worker');
  await page.locator('#solver-parameters').fill('__unknown_parameter__: true');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('rejected the solver-specific parameters');
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#solver-parameters').fill('use_preprocessing: false');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Objective: 2');
  await expect(page.getByRole('row', { name: /Native verification/ }).getByRole('cell')).toHaveText('passed');
});

for (const executor of ['direct', 'worker', 'server']) {
  test(`mp_simple_lp: native SCIP conflict through ${executor}`, async ({ page }) => {
    if (executor === 'server') test.skip(process.env.ORTOOLS_TEST_SERVER !== '1', 'Requires local test server');
    await page.goto('/mp_simple_lp.html');
    await page.locator('#solver-executor').selectOption(executor);
    await page.locator('#diagnose').click();
    await expect(page.locator('#solution-output')).toHaveText('SCIP conflict: x at least 2; x at most 1.');
    await expect(page.locator('#status')).toContainText('SCIP IIS: infeasible=true');
    await expect(page.locator('#diagnose')).toBeEnabled();
    await page.locator('#run').click();
    await expect(page.locator('#status')).toContainText('Objective: 2');
  });
}

test('set_cover_simple: guided tabu tuning preserves full coverage', async ({ page }) => {
  await page.goto('/set_cover_simple.html');
  await page.locator('#solver-executor').selectOption('worker');
  await expect(page.locator('#penalty-factor')).toBeDisabled();
  await page.locator('#guided-tabu').check();
  await page.locator('#penalty-factor').fill('0.5');
  await page.locator('#epsilon').fill('0');
  await page.locator('#tabu-size').fill('9');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Guided tabu search finished after five continued passes.');
  await expect(page.locator('#solution-output')).toContainText('Uncovered count: 0');
});


test('pdlp_import: imports a file and recovers from malformed text', async ({ page }) => {
  await page.goto('/pdlp_import.html');
  await page.locator('#solver-executor').selectOption('worker');
  await page.locator('#format').selectOption('textproto');
  const model = 'name: "file model" maximize: true objective_offset: 5 variable { name: "x" lower_bound: 0 upper_bound: 4 objective_coefficient: 3 }';
  await page.locator('#model-file').setInputFiles({ name: 'model.textproto', mimeType: 'text/plain', buffer: Buffer.from(model) });
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('OPTIMAL');
  await expect(page.locator('#solution-output')).toContainText('Objective: 17');
  await page.locator('#model-text').fill('invalid model');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Error:');
  await page.locator('#model-text').fill(model);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('OPTIMAL');
  await expect(page.locator('#solution-output')).toContainText('x: 4');
});


test('pdlp_import: changing formats loads a matching model that solves', async ({ page }) => {
  await page.goto('/pdlp_import.html');
  await page.locator('#solver-executor').selectOption('worker');
  const source = page.locator('#model-text');
  for (const [format, expected] of [['textproto', 'objective_offset: 5'], ['json', '"objectiveOffset": 5'], ['mps', 'OBJSENSE']]) {
    await source.fill('previous model');
    await page.locator('#format').selectOption(format);
    expect(await source.inputValue()).toContain(expected);
    await page.locator('#run').click();
    await expect(page.locator('#status')).toContainText('OPTIMAL');
    await expect(page.locator('#solution-output')).toContainText('Objective: 17');
    await expect(page.locator('#solution-output')).toContainText('x: 4');
  }
  await page.locator('#format').selectOption('proto');
  await expect(source).toBeDisabled();
  await expect(source).toHaveValue('');
  await expect(page.locator('#run')).toBeDisabled();
  await page.locator('#format').selectOption('textproto');
  await expect(source).toBeEnabled();
  expect(await source.inputValue()).toContain('objective_offset: 5');
  await expect(page.locator('#run')).toBeEnabled();
});
