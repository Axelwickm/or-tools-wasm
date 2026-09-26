import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

const site = new URL('../../site/', import.meta.url);
const pages = readdirSync(site).filter((file) => file.endsWith('.html'));

for (const file of pages) {
  test(`${file}: readable mobile viewport`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await page.goto(`http://127.0.0.1:4190/${file}`);
      // Expanding code and server settings must not widen the whole page.
      const code = page.locator('.code-toggle summary').first();
      if (await code.count()) await code.click();
      const selector = page.locator('select').filter({ has: page.locator('option[value="server"]') });
      if (await selector.count()) await selector.selectOption('server');
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      expect(dimensions.viewport).toBe(390);
      expect(dimensions.content).toBeLessThanOrEqual(391);
      const columns = await page.locator('.route-visual-layout, .solution-visuals, .coverage-layout, .network-layout, .factory-stage, .diet-layout')
        .evaluateAll((layouts) => layouts.map((layout) => getComputedStyle(layout).gridTemplateColumns.split(' ').length));
      for (const count of columns) expect(count).toBe(1);
    } finally { await page.close(); }
  });

  if (!readFileSync(new URL(file, site), 'utf8').includes('value="server"')) continue;
  test(`${file}: unavailable server is visible and handled`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://127.0.0.1:17829/**', (route) => route.abort('connectionrefused'));
    await page.goto(`/${file}`);
    await page.locator('select').filter({ has: page.locator('option[value="server"]') }).selectOption('server');
    await page.locator('.server-endpoint-input').fill('http://127.0.0.1:17829');
    await page.locator('.server-endpoint-input').dispatchEvent('change');
    const run = page.locator(file === 'mathopt_factory_floor.html' ? '#toggle-running'
      : ['sudoku_generator.html', 'model_playground.html'].includes(file) ? '#solve' : '#run');
    await run.click();
    await expect(page.locator('.server-error')).toContainText('Cannot reach the server');
    await expect(page.locator('.server-error')).toBeVisible();
    await expect(run).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test(`${file}: optional server authentication`, async ({ page }) => {
    await page.route('http://127.0.0.1:17829/**', (route) => route.fulfill({ status: 401, body: 'Unauthorized' }));
    await page.goto(`/${file}`);
    await page.locator('select').filter({ has: page.locator('option[value="server"]') }).selectOption('server');
    await page.locator('.server-endpoint-input').fill('http://127.0.0.1:17829');
    const token = page.getByLabel('Bearer token (optional)');
    await expect(token).toHaveAttribute('type', 'password');
    await token.fill('  site-test-token  ');
    const run = page.locator(file === 'mathopt_factory_floor.html' ? '#toggle-running'
      : ['sudoku_generator.html', 'model_playground.html'].includes(file) ? '#solve' : '#run');
    const request = page.waitForRequest('http://127.0.0.1:17829/jobs');
    await run.click();
    expect((await request).headers().authorization).toBe('Bearer site-test-token');
    await expect(page.locator('.server-error')).toContainText('HTTP 401');
    await expect(run).toBeEnabled();
    // Secrets are not saved alongside the persistent endpoint.
    await page.reload();
    await page.locator('select').filter({ has: page.locator('option[value="server"]') }).selectOption('server');
    await expect(token).toHaveValue('');
  });
}

test('server authentication can be cleared before retrying', async ({ page }) => {
  await page.route('http://127.0.0.1:17829/**', (route) => route.fulfill({ status: 401, body: 'Unauthorized' }));
  await page.goto('/knapsack_simple.html');
  await page.locator('#solver-executor').selectOption('server');
  await page.locator('.server-endpoint-input').fill('http://127.0.0.1:17829');
  for (const token of ['site-test-token', '']) {
    await page.getByLabel('Bearer token (optional)').fill(token);
    const request = page.waitForRequest('http://127.0.0.1:17829/jobs');
    await page.locator('#run').click();
    expect((await request).headers().authorization).toBe(token ? `Bearer ${token}` : undefined);
    await expect(page.locator('.server-error')).toBeVisible();
    await expect(page.locator('#run')).toBeEnabled();
  }
});

test('calendar: preferences, lock toggle, failure, recovery and reset', async ({ page }) => {
  await page.goto('/project_calendar.html');
  await expect(page.locator('.task.conflict')).toHaveCount(1);
  await expect(page.locator('#task-conflicts')).toContainText('Bo away');
  await expect(page.locator('.task.pinned')).toHaveCount(0);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('all constraints satisfied');
  await expect(page.locator('.task.conflict')).toHaveCount(0);
  await page.locator('#task').selectOption('0');
  await page.locator('#hour').selectOption('3');
  await expect(page.locator('#task-conflicts')).toContainText('Lunch');
  await expect(page.locator('#pin')).toHaveText('Lock time');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('all constraints satisfied');
  await page.locator('#hour').selectOption('3');
  await page.locator('#pin').click();
  await expect(page.locator('#pin')).toHaveText('Unlock time');
  await expect(page.locator('.task.pinned')).toHaveCount(1);
  await expect(page.locator('#status')).toContainText('Draft schedule');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('No feasible schedule');
  await page.locator('#pin').click();
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('all constraints satisfied');
  await page.locator('#reset').click();
  await expect(page.locator('.task.pinned')).toHaveCount(0);
  await expect(page.locator('.task.conflict')).toHaveCount(1);
  await expect(page.locator('#task-conflicts')).toContainText('Bo away');
  await page.locator('#task').selectOption('0');
  const block = page.locator('[data-task="0"]');
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 20, box!.y + 260, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#hour')).toHaveValue('3');
  await expect(page.locator('.task.pinned')).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('Draft schedule');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('all constraints satisfied');
});
