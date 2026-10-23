import { expect, test } from '@playwright/test';

test.setTimeout(90_000);
for (const executor of ['worker', 'direct']) {
  for (const name of ['glop_simple_lp', 'clp_simple_lp', 'glpk_simple_lp']) {
    test(`${name}: default settings solve with ${executor}`, async ({ page }) => {
      await page.goto(`/${name}.html`);
      await page.locator('#solver-executor').selectOption(executor);
      await expect(page.locator('#workers')).toBeHidden();
      await page.locator('#run').click();
      await expect(page.locator('#solution-output')).toContainText('OPTIMAL', { timeout: 60_000 });
    });
  }
}

test('Steel Mill formulations agree in the browser', async ({ page }) => {
  await page.goto('/steel_mill_slab.html');
  for (const method of ['sat', 'sat_table', 'sat_column']) {
    await page.locator('#solver-method').selectOption(method);
    await page.locator('#run').click();
    await expect(page.locator('#summary')).toContainText('total loss 20.', { timeout: 60_000 });
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#slab-table tbody tr')).toHaveCount(4);
  }
});

test('MPSolver failure clears the previous result and recovers', async ({ page }) => {
  await page.goto('/mp_simple_lp.html');
  await page.locator('#solver').selectOption('SCIP');
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('OPTIMAL', { timeout: 60_000 });
  await page.locator('.advanced-settings > summary').click();
  await page.locator('#solver-parameters').fill('not_a_real_parameter = broken');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('rejected');
  await expect(page.locator('#solution-output')).not.toContainText('OPTIMAL');
  await page.locator('#solver-parameters').fill('');
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('OPTIMAL');
});

test('Network Design hover settles without replacing cards repeatedly', async ({ page }) => {
  await page.goto('/mpsolver_network_design.html');
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('OPTIMAL', { timeout: 60_000 });
  await page.locator('.demand-card').first().hover();
  await page.locator('.lane-card').first().hover();
  // Count replacements after the pointer settles; rendering the initial highlight is expected.
  await page.waitForTimeout(100);
  const mutations = await page.evaluate(async () => {
    let count = 0;
    const observer = new MutationObserver(records => count += records.length);
    observer.observe(document.body, { subtree: true, childList: true });
    await new Promise(resolve => setTimeout(resolve, 300));
    observer.disconnect();
    return count;
  });
  expect(mutations).toBe(0);
});

test('FIMI shows unit costs and clears results when switching models', async ({ page }) => {
  await page.goto('/set_cover_simple.html');
  await page.locator('.advanced-settings > summary').click();
  await page.locator('#model-format').selectOption('fimi');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Done. Cost 4', { timeout: 60_000 });
  for (const card of await page.locator('.legend-row').all()) await expect(card).toContainText('Cost 1');
  await page.locator('#model-format').selectOption('builder');
  await expect(page.locator('.legend-row').first()).toContainText('Cost 5');
  await expect(page.locator('#solution-output')).not.toContainText('Chosen regions:');
});

test('Assignment preview matches randomized matrix and executor', async ({ page }) => {
  await page.goto('/network_flow_assignment.html');
  await page.locator('#assignment-size').fill('3');
  await page.locator('#randomize').click();
  await page.locator('#solver-executor').selectOption('direct');
  const source = await page.locator('.code-samples code').textContent();
  expect(source).toContain('executor: "direct"');
  const matrix = JSON.parse(source!.match(/const costs = ([\s\S]*?);/)![1]);
  expect(matrix).toHaveLength(3);
  const titles = await page.locator('#assignment-graph title').allTextContents();
  expect(titles).toEqual(matrix.flatMap((row: number[], worker: number) => row.map((cost, task) => `Worker ${worker} -> Task ${task}: cost ${cost}`)));
});

test('Sports validation clears a prior optimum and Stop is not a failure', async ({ page }) => {
  await page.goto('/sports_scheduling.html');
  await page.locator('#teams').fill('4');
  await page.locator('#workers').fill('1');
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).toContainText('OPTIMAL', { timeout: 60_000 });
  await page.locator('#teams').fill('3');
  await page.locator('#run').click();
  await expect(page.locator('#solution-output')).not.toContainText('OPTIMAL');
  await page.locator('#teams').fill('8');
  await page.locator('#run').click();
  await page.locator('#stop').click();
  await expect(page.locator('#run')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('#status')).toContainText('cancelled');
  await expect(page.locator('#status')).not.toContainText('failed');
});

test('Sudoku early Stop and a subsequent generation', async ({ page }) => {
  await page.goto('/sudoku_generator.html');
  await page.locator('#generate').click();
  await page.locator('#stop').click();
  await expect(page.locator('#generate')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('#status')).not.toContainText('failed');
  await page.locator('#target-clues').fill('80');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('Generated puzzle has 80 clues', { timeout: 60_000 });
});
