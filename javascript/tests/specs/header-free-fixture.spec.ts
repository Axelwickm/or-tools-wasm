import { expect, test } from '@playwright/test';
import { browserFixtureGroups } from '../../../tests/harness/browser_groups.ts';

for (const group of browserFixtureGroups) {
  test(`header-free full parity: ${group}`, async ({ context, page }, testInfo) => {
    // Only the document controls cross-origin isolation. Use the same bundler
    // servers and built artifacts as the isolated suite, without its COOP/COEP.
    await context.route('**/*', async route => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['cross-origin-opener-policy'];
      delete headers['cross-origin-embedder-policy'];
      await route.fulfill({ response, headers });
    });
    let rejectPageError!: (error: Error) => void;
    const pageError = new Promise<never>((_, reject) => { rejectPageError = reject; });
    page.on('pageerror', rejectPageError);
    await page.goto(`/?noHeaders=1&group=${group}`);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    try {
      await Promise.race([
        page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('"complete":true'), undefined, { timeout: 590_000 }),
        pageError,
      ]);
    } catch (error) {
      throw new Error(`${error}\nCurrent case: ${await page.locator('#status').textContent()}`);
    }
    const result = JSON.parse(await page.locator('#status').textContent() ?? '{}');
    await testInfo.attach('header-free-results', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.results.filter((r: any) => r.outcome === 'failed')).toEqual([]);
    expect(result.isolated).toBe(false);
    for (const mode of group === 'cp-sat-worker-lifecycle' ? ['worker'] : ['direct', 'worker']) {
      expect(result.results.filter((r: any) => r.mode === mode && r.outcome === 'passed').length).toBeGreaterThan(0);
    }
  });
}
