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
    && !file.endsWith('_workflows.html') && !['index.html', 'schema_viewer.html'].includes(file));
  expect(Object.keys(examples).sort()).toEqual(solvePages.map((file) => file.replace('.html', '')).sort());
});

const variations: Array<{ page: string; label: string; inputs?: Record<string, string>; selects?: Record<string, string>; checks?: string[] }> = [
  { page: 'magic_square', label: 'size 3', inputs: { '#size': '3' } },
  { page: 'sports_scheduling', label: 'four teams', inputs: { '#teams': '4' } },
  { page: 'routing_simple', label: 'iterated local search', inputs: { '#node-count': '6' }, checks: ['#iterated-local-search'] },
  { page: 'routing_simple', label: 'secondary insertion optimization', inputs: { '#node-count': '6' }, checks: ['#secondary-model'] },
  { page: 'routing_simple', label: 'secondary cost insertion optimization', inputs: { '#node-count': '6' }, selects: { '#first-solution-strategy': '16' }, checks: ['#secondary-model'] },
  { page: 'routing_simple', label: 'packing', inputs: { '#node-count': '6' }, checks: ['#pack-schedule'] },
  { page: 'routing_simple', label: 'cross-model route transfer', inputs: { '#node-count': '6' }, checks: ['#transfer-route'] },
  { page: 'routing_simple', label: 'native sweep', inputs: { '#node-count': '6' }, selects: { '#first-solution-strategy': '11' } },
  { page: 'routing_simple', label: 'precedence with required earlier stop', inputs: { '#node-count': '6' }, checks: ['#precedence-stops'] },
  { page: 'routing_simple', label: 'ordered optional stops', inputs: { '#node-count': '6' }, checks: ['#ordered-stops'] },
  { page: 'routing_simple', label: 'explicitly excluded stops', inputs: { '#node-count': '6' }, checks: ['#excluded-stops'] },
  { page: 'routing_simple', label: 'evaluator first solution', inputs: { '#node-count': '6' }, selects: { '#first-solution-strategy': '5' } },
  { page: 'routing_simple', label: 'primary constrained dimension', inputs: { '#node-count': '6' }, selects: { '#first-solution-strategy': '4' }, checks: ['#driver-break'] },
  { page: 'set_cover_simple', label: 'CFT comparison', checks: ['#cft-comparison'] },
  { page: 'set_cover_simple', label: 'MIP and LP comparison', checks: ['#mip-comparison'] },
  { page: 'set_cover_simple', label: 'lazy redundancy removal', checks: ['#lazy-steepest'] },
  { page: 'routing_simple', label: 'tiered lateness', inputs: { '#node-count': '6' }, checks: ['#tiered-lateness'] },
  { page: 'routing_simple', label: 'whole-route costs', inputs: { '#node-count': '6' }, checks: ['#route-cost'] },
  { page: 'set_cover_simple', label: 'SCP native text', selects: { '#model-format': 'orlibScp' } },
  { page: 'set_cover_simple', label: 'rail native text', selects: { '#model-format': 'orlibRail' } },
  { page: 'set_cover_simple', label: 'FIMI native text', selects: { '#model-format': 'fimi' } },
  { page: 'routing_simple', label: 'six destinations', inputs: { '#node-count': '6' } },
  { page: 'routing_simple', label: 'driver break', inputs: { '#node-count': '6' }, checks: ['#driver-break'] },
  { page: 'routing_simple', label: 'peak traffic', inputs: { '#node-count': '6' }, checks: ['#peak-traffic'] },
  { page: 'routing_simple', label: 'load costs and grouped stops', inputs: { '#node-count': '6' }, checks: ['#energy-cost', '#grouped-stops'] },
  { page: 'routing_simple', label: 'committed visits with breaks', inputs: { '#node-count': '6' }, checks: ['#replan', '#driver-break'] },
  { page: 'routing_simple', label: 'alternative pickup with ride limit', inputs: { '#node-count': '6' }, checks: ['#alternative-pickup'] },
  { page: 'routing_vrp', label: 'twelve destinations, two vehicles', inputs: { '#destination-count': '12', '#vehicle-count': '2' } },
  { page: 'routing_dispatch', label: 'smaller fleet problem', inputs: { '#delivery-count': '10', '#vehicle-count': '2', '#vehicle-capacity': '200', '#distance-cap': '3000' } },
  { page: 'routing_dispatch', label: 'resource slots', inputs: { '#delivery-count': '2', '#vehicle-count': '2', '#resource-slots': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#use-resources'] },
  { page: 'routing_dispatch', label: 'required delivery choice', inputs: { '#delivery-count': '2', '#vehicle-count': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#delivery-choice'] },
  { page: 'routing_dispatch', label: 'conditional delivery order', inputs: { '#delivery-count': '2', '#vehicle-count': '1', '#vehicle-capacity': '200', '#distance-cap': '10000' }, checks: ['#delivery-order'] },
  { page: 'network_flow_assignment', label: 'size 3', inputs: { '#assignment-size': '3' } },
  { page: 'network_flow_max_flow', label: 'three transit nodes', inputs: { '#middle-count': '3' } },
  { page: 'network_flow_min_cost_flow', label: 'smaller network', inputs: { '#supply-count': '1', '#transit-count': '3', '#demand-count': '2' } },
  { page: 'routing_simple', label: 'generic tabu successor selection', checks: ['#generic-tabu'] },
  { page: 'routing_simple', label: 'native cost and dimension inspection', checks: ['#native-inspection', '#energy-cost'] },
  { page: 'mp_simple_lp', label: 'native GLOP bound clamping', checks: ['#clamp-sample'] },
  { page: 'mp_simple_lp', label: 'native SCIP bound clamping', selects: { '#solver': 'SCIP' }, checks: ['#clamp-sample'] },
  { page: 'mp_simple_lp', label: 'SCIP backend', selects: { '#solver': 'SCIP' } },
  { page: 'mp_simple_lp', label: 'native incremental bound update', selects: { '#solver': 'GLOP' }, checks: ['#incremental'] },
  { page: 'mp_simple_lp', label: 'native parameter validation', inputs: { '#solver-parameters': 'use_preprocessing: false' } },
  { page: 'mp_simple_lp', label: 'SAT parameters with two solver threads', inputs: { '#solver-parameters': 'random_seed: 123', '#workers': '2' }, selects: { '#solver': 'SAT' } },
  { page: 'mathopt_basic', label: 'GLOP backend', selects: { '#solver': 'GLOP' } },
  { page: 'mathopt_basic', label: 'CP-SAT incumbent callbacks', selects: { '#solver': 'CP_SAT' } },
  { page: 'mathopt_basic', label: 'SCIP lazy capacity constraint', selects: { '#solver': 'GSCIP' }, checks: ['#lazy-constraint'] },
  { page: 'mathopt_basic', label: 'SCIP SOS1 exclusive choices', selects: { '#solver': 'GSCIP', '#choice-constraint': 'sos1' } },
  { page: 'mathopt_basic', label: 'SCIP SOS2 adjacent choices', selects: { '#solver': 'GSCIP', '#choice-constraint': 'sos2' } },
  { page: 'mathopt_basic', label: 'native point improvement', selects: { '#solver': 'GSCIP' }, checks: ['#improve-point'] },
  { page: 'mathopt_basic', label: 'serialized native point improvement', selects: { '#solver': 'GSCIP' }, checks: ['#raw-proto', '#improve-point'] },
  { page: 'mathopt_basic', label: 'native robust constraint', selects: { '#solver': 'GSCIP', '#choice-constraint': 'robust' } },
  { page: 'mathopt_basic', label: 'serialized native robust constraint', selects: { '#solver': 'GSCIP', '#choice-constraint': 'robust' }, checks: ['#raw-proto'] },
  { page: 'mathopt_basic', label: 'native indicator MIP conversion', selects: { '#solver': 'GSCIP', '#choice-constraint': 'indicatorMip' } },
  { page: 'mathopt_basic', label: 'serialized native indicator MIP conversion', selects: { '#solver': 'GSCIP', '#choice-constraint': 'indicatorMip' }, checks: ['#raw-proto'] },
  { page: 'mathopt_basic', label: 'live solver logs', selects: { '#solver': 'GLOP' }, checks: ['#live-logs'] },
  { page: 'mathopt_basic', label: 'serialized model with callbacks', selects: { '#solver': 'CP_SAT' }, checks: ['#raw-proto'] },
  { page: 'mathopt_basic', label: 'native incremental bound update', selects: { '#solver': 'GLOP' }, checks: ['#raw-proto', '#raw-incremental'] },
  { page: 'project_calendar', label: 'Thursday deadline', selects: { '#deadline': '32' } },
  { page: 'steel_mill_slab', label: 'table formulation', selects: { '#solver-method': 'sat_table' } },
  { page: 'steel_mill_slab', label: 'column formulation', selects: { '#solver-method': 'sat_column' } },
  { page: 'knapsack_simple', label: 'zero volume capacity', inputs: { '[data-kind="capacity"][data-dimension="1"]': '0' } },
  { page: 'knapsack_simple', label: 'CP-SAT with four workers', selects: { '#backend': '10' }, inputs: { '#num-workers': '4' } },
];

for (const scenario of variations) {
  if (scenario.checks?.includes('#secondary-model') && !scenario.selects?.['#first-solution-strategy'])
    scenario.selects = { ...scenario.selects, '#first-solution-strategy': '9' };
}
for (const scenario of ['breaks', 'traffic', 'pickup', 'grouped', 'load', 'replan'])
  variations.push({ page: 'routing_simple', label: `${scenario} preset`, selects: { '#scenario': scenario }, inputs: { '#node-count': '6' } });

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
    for (const summary of await page.locator('details.advanced-settings > summary').all()) await summary.click();
    await page.locator('select').filter({ has: page.locator('option[value="worker"]') }).selectOption('worker');
    // Keep CI resource use bounded without changing the displayed problem.
    for (const input of await page.locator('#workers, #worker-count, #worker-threads').all()) if (await input.isVisible()) await input.fill('1');
    for (const [selector, value] of Object.entries(scenario.selects ?? {})) await page.locator(selector).selectOption(value);
    for (const [selector, value] of Object.entries(scenario.inputs ?? {})) {
      if (selector === '#resource-slots') continue;
      await page.locator(selector).fill(value);
      await page.locator(selector).dispatchEvent('change');
    }
    for (const selector of scenario.checks ?? []) {
      const method = ({ '#guided-tabu': 'guided', '#lazy-steepest': 'lazy', '#restart-cover': 'restart' } as Record<string, string>)[selector];
      if (scenario.page === 'set_cover_simple' && method) await page.locator('#search-method').selectOption(method);
      else await page.locator(selector).check();
    }
    if (scenario.inputs?.['#resource-slots']) await page.locator('#resource-slots').fill(scenario.inputs['#resource-slots']);
    const run = page.locator(scenario.page === 'mathopt_factory_floor' ? '#toggle-running'
      : ['sudoku_generator', 'model_playground'].includes(scenario.page) ? '#solve' : '#run');
    await run.click();
    const [selector, success] = examples[scenario.page];
    await expect(page.locator(selector)).toContainText(success, { timeout: 60_000 });
    if (scenario.page === 'set_cover_simple') await expect(page.locator('#status')).toContainText('Native Lagrangian lower bound:');
    if (scenario.checks?.includes('#cft-comparison')) {
      await expect(page.locator('#status')).toContainText(/Native CFT: cover [0-9.]+; lower bound/);
      await expect(page.locator('#status')).toContainText('Seeded from the current cover.');
    }
    if (scenario.checks?.includes('#mip-comparison')) {
      await expect(page.locator('#status')).toContainText('Native MIP subproblem: OPTIMAL; cover');
      await expect(page.locator('#status')).toContainText('Native LP subproblem: OPTIMAL; objective');
    }
    if (scenario.page === 'magic_square') {
      await expect(page.locator('#status')).toContainText('Native solution check: feasible');
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
    if (scenario.page === 'mp_simple_lp' && scenario.checks?.includes('#clamp-sample')) {
      await expect(page.locator('#status')).toContainText('Native bound clamping: sample=1 (input=2)');
    }
    if (scenario.page === 'mp_simple_lp') {
      await expect(page.locator('#status')).toContainText('Native callback support: search=');
    }
    if (scenario.page === 'mp_simple_lp' && (!scenario.selects?.['#solver'] || scenario.selects['#solver'] === 'GLOP')) {
      await expect(page.locator('#status')).toContainText('Initial problem:');
    }
    if (scenario.page === 'mp_simple_lp' && scenario.checks?.includes('#incremental')) {
      await expect(page.getByRole('row', { name: /^Objective / }).getByRole('cell')).toHaveText('1');
      await expect(page.getByRole('row', { name: /^Native session/ }).getByRole('cell')).toContainText('Retained solver');
    }
    if (scenario.page === 'mathopt_basic' && scenario.checks?.includes('#improve-point')) {
      await expect(page.locator('#status')).toContainText('Native starting-point improvement: x=1, y=0');
    }
    if (scenario.page === 'mathopt_basic' && scenario.selects?.['#choice-constraint'] === 'robust') {
      await expect(page.locator('#status')).toContainText('Native robust constraint:');
    }
    if (scenario.page === 'mathopt_basic' && scenario.selects?.['#choice-constraint'] === 'indicatorMip') {
      await expect(page.locator('#status')).toContainText('Native indicator-to-MIP conversion: 0 indicators, 1 linear rows.');
    }
    if (scenario.page === 'mathopt_basic' && scenario.selects?.['#choice-constraint']) {
      await expect(page.locator('#status')).toContainText(`Objective: ${scenario.selects['#choice-constraint'] === 'sos2' ? 3 : scenario.selects['#choice-constraint'] === 'robust' ? 1 : 2}`);
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#driver-break')) {
      await expect(page.locator('#status')).toContainText('Driver break: 1–3 minutes');
    }
    if (scenario.page === 'routing_simple') await expect(page.locator('#status')).toContainText('Native assignment feasibility: true.');
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#secondary-model'))
      await expect(page.locator('#status')).toContainText('Native secondary model enabled (period 1).');
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#excluded-stops'))
      await expect(page.locator('#status')).toContainText('Stops 1 and 2 excluded; their disjunction penalty is ignored.');
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#generic-tabu')) {
      await expect(page.locator('#status')).toContainText('Native generic tabu search tracks successor variables.');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#precedence-stops')) {
      await expect(page.locator('#status')).toContainText('Native node-precedence layers: [[[1],[2]]]');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#route-cost')) {
      await expect(page.locator('#status')).toContainText(/Native custom-route cost: \d+/);
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#native-inspection')) {
      await expect(page.locator('#status')).toContainText('Native inspection: cost class');
      await expect(page.locator('#status')).toContainText('Native arc preference, stop 1 before stop 2:');
      await expect(page.locator('#status')).toContainText('Native model classification: matching');
      await expect(page.locator('#status')).toContainText('Native classification:');
      await expect(page.locator('#status')).toContainText('First-solution decisions:');
      await expect(page.locator('#status')).toContainText('Vehicle equivalence: class');
      await expect(page.locator('#status')).toContainText('Visit-type components:');
      await expect(page.locator('#status')).toContainText('Same-vehicle nodes for stop 1:');
      await expect(page.locator('#status')).toContainText('Native node-precedence layers:');
      await expect(page.locator('#status')).toContainText('Unary dimensions: Load.');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#peak-traffic')) {
      await expect(page.locator('#status')).toContainText('Return time with peak traffic:');
      await expect(page.locator('#status')).toContainText('Shortest transition slack at departure:');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#replan')) {
      await expect(page.locator('#status')).toContainText('Replanned with committed visits:');
      const committed = (await page.locator('#status').textContent())!.match(/Replanned with committed visits: (\d+) → (\d+)\./);
      expect(committed).not.toBeNull();
      await expect(page.locator('#route-output')).toContainText(`Vehicle 0: 0 -> ${committed![1]} -> ${committed![2]} ->`);
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#transfer-route')) {
      await expect(page.locator('#status')).toContainText(/Transferred route seed; repriced model objective: \d+\./);
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#precedence-stops')) {
      await expect(page.locator('#status')).toContainText('Precedence: serving stop 2 requires stop 1 earlier in the route.');
      await expect(page.locator('#status')).toContainText('Native precedence records: 1; vehicle 0 transit sign: POSITIVE_OR_ZERO.');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#alternative-pickup')) {
      await expect(page.locator('#status')).toContainText('Native pickup-to-delivery limit for the first alternatives: 1000.');
      await expect(page.locator('#status')).toContainText('Pickup visit type 0 belongs to pairs: 0.');
      await expect(page.locator('#status')).toContainText('Matching pickup for stop 3: 2.');
      const ride = (await page.locator('#status').textContent())!.match(/Pickup: stop [12], delivery: stop 3; ride distance: (\d+)m \(limit 1000m\)/);
      expect(ride).not.toBeNull();
      expect(Number(ride![1])).toBeLessThanOrEqual(1000);
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#energy-cost')) {
      await expect(page.locator('#status')).toContainText('Objective includes native load × distance costs.');
    }
    if (scenario.page === 'routing_simple' && scenario.checks?.includes('#grouped-stops')) {
      await expect(page.locator('#status')).toContainText('together.');
    }
    if (scenario.page === 'mathopt_basic') {
      await expect(page.locator('#status')).toContainText('Variable-domain bounds for x + y: [0, 2] (ignoring other constraints).');
      await expect(page.getByRole('row', { name: /^Native feasibility/ }).getByRole('cell')).toHaveText('feasible');
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
        await expect(page.locator('#status')).toContainText(`Objective: ${scenario.selects?.['#choice-constraint'] === 'robust' ? 1 : 2}`);
        await expect(page.getByRole('row', { name: /^Incumbent solutions/ }).getByRole('cell')).toHaveText(/^[1-9]\d*$/);
      }
    }
    if (scenario.page === 'network_flow_assignment') {
      await expect(page.locator('#solution-output tbody tr')).toHaveCount(Number(await page.locator('#assignment-size').inputValue()));
    }
    if (scenario.page === 'routing_dispatch') {
      const statusText = await page.locator('#status').textContent() ?? '';
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
  for (const summary of await page.locator('details.advanced-settings > summary').all()) await summary.click();
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

test('network_flow_min_cost_flow: unscaled native costs retain their numerical contract', async ({ page }) => {
  await page.goto('/network_flow_min_cost_flow.html');
  await page.locator('#price-scaling').uncheck();
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('Cost (native perturbed-cost optimum):');
  await expect(page.locator('#status')).toContainText('Done. Status 1.');
});

test('routing_simple: scenario changes replace incompatible settings', async ({ page }) => {
  await page.goto('/routing_simple.html');
  await page.locator('#node-count').fill('6');
  await page.locator('#scenario').selectOption('traffic');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Return time with peak traffic:');
  await page.locator('#scenario').selectOption('breaks');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Driver break:');
  await expect(page.locator('#status')).not.toContainText('Return time with peak traffic:');
});

test('set_cover_simple: guided tabu tuning preserves full coverage', async ({ page }) => {
  await page.goto('/set_cover_simple.html');
  for (const summary of await page.locator('details.advanced-settings > summary').all()) await summary.click();
  await page.locator('#solver-executor').selectOption('worker');
  await expect(page.locator('#penalty-factor')).not.toBeVisible();
  await page.locator('#search-method').selectOption('guided');
  await page.locator('#penalty-factor').fill('0.5');
  await page.locator('#epsilon').fill('0');
  await page.locator('#tabu-size').fill('9');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Guided tabu search finished after five continued passes.');
  await expect(page.locator('#solution-output')).toContainText('Uncovered count: 0');
});

test('set_cover_simple: native removability and perturbation rebuild a full cover', async ({ page }) => {
  await page.goto('/set_cover_simple.html');
  for (const summary of await page.locator('details.advanced-settings > summary').all()) await summary.click();
  await page.locator('#solver-executor').selectOption('worker');
  await page.locator('#search-method').selectOption('restart');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Newly removable regions:');
  await expect(page.locator('#status')).toContainText('Native perturbation cleared 1 overcovered region.');
  await expect(page.locator('#status')).toContainText('Greedy reconstruction completed after perturbation.');
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

test('mp_simple_lp: native GLOP basis and SCIP lazy callbacks', async ({page}) => {
  await page.goto('/mp_simple_lp.html');
  for (const summary of await page.locator('details.advanced-settings > summary').all()) await summary.click();
  await page.locator('#solver-executor').selectOption('worker');
  await page.locator('#warm-start').check(); await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('Native GLOP basis supplied');
  await page.locator('#solver').selectOption('SCIP');
  await expect(page.locator('#warm-start')).not.toBeChecked();
  await page.locator('#lazy-limit').check(); await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Objective: 1');
  await expect(page.locator('#solution-output')).toContainText('Native MIP callbacks');
});


test('mathopt_factory_floor: a traffic time limit without an incumbent leaves dispatches unchanged', async ({ page }) => {
  // Force a real native no-incumbent result without changing the example's UI
  // or depending on machine speed. Only the traffic solve's 0.45s budget changes.
  let patched = false;
  await page.route('**/assets/mathopt_factory_floor-*.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const budget = /(timeLimitSeconds|maxTimeInSeconds):\s*(?:0)?\.45\b/g;
    expect([...body.matchAll(budget)]).toHaveLength(2);
    patched = true;
    await route.fulfill({ response, body: body.replace(budget, '$1:0') });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/mathopt_factory_floor.html');
  const noIncumbent = page.waitForEvent('console', { predicate: message => message.text().includes('traffic plan has no incumbent'), timeout: 30_000 });
  await page.locator('#toggle-running').click();
  await noIncumbent;
  await page.locator('#toggle-running').click();
  await expect(page.locator('#factory-planning-status')).toHaveText('Ready');
  await expect(page.locator('#metrics')).not.toContainText('Error');
  const state = await page.evaluate(() => window.__factoryDebug?.()) as { tokens: unknown[]; lastError: string };
  expect(state.tokens).toHaveLength(0);
  expect(state.lastError).toBe('');
  expect(patched).toBe(true);
  expect(errors).toEqual([]);
});
