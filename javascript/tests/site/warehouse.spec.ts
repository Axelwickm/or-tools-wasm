import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { slots, pallets } from '../../site/warehouse/model/layout.ts';

// Software WebGL can make rendering and screenshots slow on shared CI workers.

test('warehouse: timed oil spills affect optimization and clear after 20 seconds of playback', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/warehouse_storage.html');
  await expect(page.locator('#warehouse-canvas')).toHaveAttribute('data-ready', 'true');
  await page.clock.runFor(100);
  await expect(page.locator('#spill-status')).toBeHidden();
  await page.clock.fastForward(61_000);
  await expect(page.locator('#spill-status')).toBeVisible();
  await expect(page.locator('#spill-status')).toContainText('blocked');
  await expect(page.locator('#efficiency-chart')).toContainText('Oil spill');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const countdown = await page.locator('#spill-status').textContent();
  await page.clock.fastForward(30_000);
  await expect(page.locator('#spill-status')).toHaveText(countdown!);
  await page.locator('#optimize-placement').click();
  await expect(page.locator('#placement-status')).toContainText('Placement updated', { timeout: 15_000 });
  await page.clock.fastForward(1_100);
  await page.screenshot({ path: '/tmp/warehouse-oil-spill.png' });
  await expect(page.locator('#spill-status')).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.runFor(100);
  await page.clock.fastForward(21_000);
  await expect(page.locator('#spill-status')).toBeHidden();
  await expect(page.locator('#efficiency-chart')).toContainText('Oil spill cleared');
  await expect(page.locator('#scene-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('warehouse: renders, changes camera and survives resizing', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/GL_INVALID|Framebuffer is incomplete|THREE.*Error/.test(message.text())) errors.push(message.text());
  });
  await page.goto('/warehouse_storage.html');
  const canvas = page.locator('#warehouse-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#solver-code')).toContainText('export async function optimizePlacement');
  await expect(page.locator('#problem-code')).toContainText('export const slots');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#scene-error')).toBeHidden();
  await expect(page.locator('.pallet-inspector, .simulation-toolbar')).toHaveCount(0);
  const panel = (await page.locator('#warehouse-workbench').boundingBox())!;
  expect(panel.y + panel.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.locator('.warehouse-dashboard').evaluate((dashboard) =>
    Boolean(dashboard.compareDocumentPosition(document.querySelector('.warehouse-viewer')!) & Node.DOCUMENT_POSITION_FOLLOWING),
  )).toBe(true);
  const overview = await canvas.screenshot();
  // Catch blank WebGL output, which compresses to a very small image.
  expect(overview.byteLength).toBeGreaterThan(15_000);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Warehouse canvas is missing.');
  await page.mouse.move(bounds.x + 35, bounds.y + bounds.height - 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 135, bounds.y + bounds.height - 70, { steps: 8 });
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(overview)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const mobilePanel = await page.locator('#warehouse-workbench').evaluate((panel) => panel.getBoundingClientRect().bottom + window.scrollY);
  expect(mobilePanel).toBeLessThanOrEqual(844);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(15_000);
  expect(errors).toEqual([]);
});

test('warehouse: current-state graph, demand and CP-SAT placement work together', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/warehouse_storage.html');
  await expect(page.locator('#warehouse-canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#shelf-stability')).toContainText('top-heavy');
  await page.screenshot({ path: '/tmp/warehouse-top-heavy.png' });
  await expect(page.locator('#efficiency-average')).toHaveText(/\d+\.\d s/);
  await expect(page.locator('#efficiency-detail')).toContainText('200 jobs', { timeout: 15_000 });
  // Keep the forklift paused but exercise button-driven pallet flights and the solve replay.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#randomize-placement').click();
  await expect(page.locator('#placement-status')).toHaveText('Placement randomized');
  await expect(page.locator('#efficiency-chart')).toContainText('Placement randomized');
  for (let product = 0; product < 5; product++) {
    await page.locator(`#demand-${product}`).evaluate((input: HTMLInputElement) => {
      input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await expect(page.locator('#efficiency-detail')).toContainText('No demand');
  await expect(page.locator('#optimize-placement')).toBeDisabled();
  await page.locator('#demand-0').evaluate((input: HTMLInputElement) => {
    input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#efficiency-detail')).toContainText('200 jobs', { timeout: 15_000 });
  const before = Number.parseFloat(await page.locator('#efficiency-average').innerText());
  await page.locator('#optimize-placement').click();
  await expect(page.locator('#placement-status')).toContainText('Placement updated', { timeout: 45_000 });
  await expect(page.locator('#shelf-stability')).toHaveAttribute('data-unstable', /^(0|1)$/);
  if (await page.locator('#shelf-stability').getAttribute('data-unstable') === '1')
    await expect(page.locator('#shelf-stability')).toContainText('Active job reserved');
  await expect(page.locator('#efficiency-chart')).toContainText('Placement optimized');
  await page.waitForTimeout(4_000);
  const after = Number.parseFloat(await page.locator('#efficiency-average').innerText());
  expect(after).toBeLessThan(before);
  await expect(page.locator('#optimize-placement')).toBeEnabled();
  await page.screenshot({ path: '/tmp/warehouse-dashboard.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('warehouse: dragging a pallet snaps to a shelf slot and updates the estimate', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/warehouse_storage.html');
  const canvas = page.locator('#warehouse-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const aspect = bounds.width / bounds.height, halfHeight = Math.max(12, 15 / aspect);
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .1, 100);
  camera.position.set(14, 13, 17); camera.lookAt(0, 1.6, 0); camera.updateMatrixWorld();
  const screen = (slot: number, height: number, depth: number) => {
    const s = slots[slot], point = new THREE.Vector3(s.x, s.y + height, s.z + depth).project(camera);
    return { x: bounds.x + (point.x + 1) / 2 * bounds.width, y: bounds.y + (1 - point.y) / 2 * bounds.height };
  };
  const source = slots.find((slot) => slot.rack === 2 && slot.level === 2 && slot.bay === 2)!;
  const destination = slots.find((slot) => slot.rack === 2 && slot.level === 2 && slot.bay === 3)!;
  expect(pallets.some((pallet) => pallet.slot === source.id)).toBe(true);
  const from = screen(source.id, .65, .5), to = screen(destination.id, .575, 0);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#move-status')).toContainText('moved to C4, level 3');
  await expect(page.locator('#efficiency-chart')).toContainText('Pallet moved');
});

test('warehouse: compact playback control pauses and resumes the forklift', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/warehouse_storage.html');
  await expect(page.locator('#warehouse-canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#pause-forklift')).toHaveAttribute('data-paused', 'true');
  await page.waitForTimeout(150);
  const paused = await page.locator('#warehouse-canvas').screenshot();
  await page.waitForTimeout(300);
  expect((await page.locator('#warehouse-canvas').screenshot()).equals(paused)).toBe(true);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('#pause-forklift')).toHaveAttribute('data-paused', 'false');
  await expect.poll(async () => (await page.locator('#warehouse-canvas').screenshot()).equals(paused), { timeout: 20_000 }).toBe(false);
  await expect(page.locator('#scene-error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('warehouse: real solve replay animates while paused and disappears after one second', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/GL_INVALID|Framebuffer is incomplete|THREE.*Error/.test(message.text())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/warehouse_storage.html');
  await expect(page.locator('#warehouse-canvas')).toHaveAttribute('data-ready', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const replay = page.locator('.solve-replay');
  await expect(replay).toBeHidden();
  await page.locator('#optimize-placement').click();
  await expect(replay).toBeVisible({ timeout: 15_000 });
  await expect(replay).toContainText('branches');
  await expect(replay).toContainText('SOLVER REPLAY');
  await expect(page.locator('#pause-forklift')).toHaveAttribute('data-paused', 'true');
  await page.screenshot({ path: '/tmp/warehouse-solve-replay.png' });
  await expect(replay).toBeHidden({ timeout: 2_000 });
  await expect(page.locator('#scene-error')).toBeHidden();
  expect(errors).toEqual([]);
});
