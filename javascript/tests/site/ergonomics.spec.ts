import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';

const examplePages = readdirSync(new URL('../../site/', import.meta.url))
  .filter(name => name.endsWith('.html') && !name.endsWith('_workflows.html')
    && !['index.html', 'schema_viewer.html'].includes(name))
  .map(name => name.replace('.html', ''));

test.describe('example ergonomics', () => {
    for (const width of [390, 1280]) {
      for (const name of examplePages) {
        test(`${name} fits ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(`/${name}.html`);
          await expect(page.locator('h1')).toBeVisible();
          await expect(page.locator('body')).toHaveClass(/example-page/);
          await expect(page.locator('.controls > .control-actions').first()).toBeVisible();
          for (const log of await page.locator('.solve-log').all()) await expect(log).toHaveAttribute('open');
          expect(await page.locator('.code-samples').evaluate(element =>
            Boolean(document.querySelector('.controls')!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
          if (['routing_simple', 'mathopt_basic', 'mp_simple_lp', 'set_cover_simple'].includes(name)) {
            await expect(page.locator('.advanced-settings')).not.toHaveAttribute('open');
            for (const checkbox of await page.locator('.advanced-settings input[type="checkbox"]').all()) await expect(checkbox).not.toBeVisible();
            await expect(page.locator('.example-notes > li, .example-explanation li')).toHaveCount(name === 'routing_simple' ? 4 : 3);
            await expect(page.locator('.solve-log')).toHaveAttribute('open');
            expect(await page.locator('.code-samples').evaluate(element =>
              Boolean(document.querySelector('#solution-output, #route-output')!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
          }
          if (await page.locator('.advanced-settings').count()) {
            await page.locator('.advanced-settings > summary').click();
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
          expect(errors).toEqual([]);
        });
      }
    }
    test('backend changes hide and clear unavailable choices', async ({ page }) => {
      await page.goto('/mathopt_basic.html');
      await page.locator('summary').filter({ hasText: 'Advanced settings' }).click();
      await expect(page.locator('#lazy-constraint')).not.toBeVisible();
      await page.locator('#solver').selectOption('GSCIP');
      await page.locator('#lazy-constraint').check();
      await page.locator('#solver').selectOption('GLOP');
      await expect(page.locator('#lazy-constraint')).not.toBeChecked();
      await expect(page.locator('#lazy-constraint')).not.toBeVisible();
      await page.goto('/knapsack_simple.html');
      await expect(page.locator('#num-workers')).not.toBeVisible();
      await page.locator('#backend').selectOption('10');
      await expect(page.locator('#num-workers')).toBeVisible();
    });
    test('basic cover search methods retain full coverage', async ({ page }) => {
      await page.goto('/set_cover_simple.html');
      for (const method of ['greedy', 'guided', 'lazy', 'restart']) {
        await page.locator('#search-method').selectOption(method);
        await page.locator('#run').click();
        await expect(page.locator('#solution-output')).toContainText('Uncovered count: 0', { timeout: 60_000 });
        await expect(page.locator('#run')).toBeEnabled();
      }
    });
    test('basic solve shows its answer with the log expanded', async ({ page }) => {
      await page.goto('/mathopt_basic.html');
      await page.locator('#worker-count').fill('1');
      await page.locator('#run').click();
      await expect(page.locator('#status')).toContainText('OPTIMAL', { timeout: 60_000 });
      await expect(page.locator('#solution-output')).toContainText('Objective');
      await expect(page.locator('.solve-log')).toHaveAttribute('open');
    });
});

for (const [oldPage, currentPage] of Object.entries({
  mathopt_workflows: 'mathopt_basic', mp_solver_workflows: 'mp_simple_lp',
  routing_workflows: 'routing_simple', set_cover_workflows: 'set_cover_simple',
})) {
  test(`${oldPage} opens the merged advanced settings`, async ({ page }) => {
    await page.goto(`/${oldPage}.html`);
    await expect(page).toHaveURL(new RegExp(`${currentPage}\\.html#advanced-settings$`));
    await expect(page.locator('#advanced-settings')).toHaveAttribute('open');
  });
}

test('routing presets and custom controls stay in sync', async ({ page }) => {
  await page.goto('/routing_simple.html');
  await page.locator('#scenario').selectOption('traffic');
  await page.locator('#advanced-settings > summary').click();
  await expect(page.locator('#peak-traffic')).toBeChecked();
  await expect(page.locator('#driver-break')).not.toBeVisible();
  await page.locator('#route-cost').check();
  await expect(page.locator('#scenario')).toHaveValue('custom');
  await page.locator('#scenario').selectOption('breaks');
  await expect(page.locator('#driver-break')).toBeChecked();
  await expect(page.locator('#peak-traffic')).not.toBeChecked();
  await expect(page.locator('#route-cost')).not.toBeChecked();
});

test('routing checkbox positions stay fixed when choices become incompatible', async ({ page }) => {
  await page.goto('/routing_simple.html');
  await page.locator('#advanced-settings > summary').click();
  const pickup = page.locator('label').filter({ has: page.locator('#alternative-pickup') });
  const before = await pickup.boundingBox();
  await page.locator('#driver-break').check();
  await expect(page.locator('#peak-traffic')).not.toBeVisible();
  expect(await pickup.boundingBox()).toEqual(before);
  await page.locator('#driver-break').uncheck();
  expect(await pickup.boundingBox()).toEqual(before);
});

test('set cover format selection populates model text before solving', async ({ page }) => {
  await page.goto('/set_cover_simple.html');
  await page.locator('#advanced-settings > summary').click();
  await expect(page.locator('#model-text')).not.toBeVisible();
  for (const format of ['orlibRail', 'orlibScp', 'fimi']) {
    await page.locator('#model-format').selectOption(format);
    await expect(page.locator('#model-text')).toBeVisible();
    await expect(page.locator('#model-text')).not.toHaveValue('', { timeout: 60_000 });
  }
  await page.locator('#model-format').selectOption('orlibRail');
  await page.locator('#model-format').selectOption('builder');
  await expect(page.locator('#model-text')).not.toBeVisible();
  await expect(page.locator('#model-text')).toHaveValue('');
  await expect(page.locator('#solution-output')).toHaveText('Run the solver to view the solution.');
});
