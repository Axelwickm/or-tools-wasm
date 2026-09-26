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

test('every solve page has a successful-solve check', () => {
  const site = new URL('../../site/', import.meta.url);
  const solvePages = readdirSync(site).filter((file) => file.endsWith('.html')
    && !['index.html', 'schema_viewer.html'].includes(file));
  expect(Object.keys(examples).sort()).toEqual(solvePages.map((file) => file.replace('.html', '')).sort());
});

const variations: Array<{ page: string; label: string; inputs?: Record<string, string>; selects?: Record<string, string> }> = [
  { page: 'magic_square', label: 'size 3', inputs: { '#size': '3' } },
  { page: 'sports_scheduling', label: 'four teams', inputs: { '#teams': '4' } },
  { page: 'routing_simple', label: 'six destinations', inputs: { '#node-count': '6' } },
  { page: 'routing_vrp', label: 'twelve destinations, two vehicles', inputs: { '#destination-count': '12', '#vehicle-count': '2' } },
  { page: 'routing_dispatch', label: 'smaller fleet problem', inputs: { '#delivery-count': '10', '#vehicle-count': '2', '#vehicle-capacity': '200', '#distance-cap': '3000' } },
  { page: 'network_flow_assignment', label: 'size 3', inputs: { '#assignment-size': '3' } },
  { page: 'network_flow_max_flow', label: 'three transit nodes', inputs: { '#middle-count': '3' } },
  { page: 'network_flow_min_cost_flow', label: 'smaller network', inputs: { '#supply-count': '1', '#transit-count': '3', '#demand-count': '2' } },
  { page: 'mp_simple_lp', label: 'SCIP backend', selects: { '#solver': 'SCIP' } },
  { page: 'mathopt_basic', label: 'GLOP backend', selects: { '#solver': 'GLOP' } },
  { page: 'project_calendar', label: 'Thursday deadline', selects: { '#deadline': '32' } },
  { page: 'steel_mill_slab', label: 'table formulation', selects: { '#solver-method': 'sat_table' } },
  { page: 'knapsack_simple', label: 'zero volume capacity', inputs: { '[data-kind="capacity"][data-dimension="1"]': '0' } },
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
    for (const [selector, value] of Object.entries(scenario.inputs ?? {})) {
      await page.locator(selector).fill(value);
      await page.locator(selector).dispatchEvent('change');
    }
    for (const [selector, value] of Object.entries(scenario.selects ?? {})) await page.locator(selector).selectOption(value);
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
    if (scenario.page === 'network_flow_assignment') {
      await expect(page.locator('#solution-output tbody tr')).toHaveCount(Number(await page.locator('#assignment-size').inputValue()));
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
