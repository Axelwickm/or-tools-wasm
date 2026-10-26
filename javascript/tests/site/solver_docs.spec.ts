import { expect, test } from '@playwright/test';

test('every example section and example links to its API reference', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Standalone npm package coming soon')).toHaveCount(0);
  const sections = page.locator('h2');
  for (const section of await sections.all()) {
    await expect(section.locator('xpath=following-sibling::*[1]').getByRole('link', { name: /API reference/ })).toBeVisible();
  }
  for (const solver of ['cp-sat', 'routing']) {
    await expect(page.locator(`a[href="https://www.npmjs.com/package/@or-tools-wasm/${solver}"] img`)).toBeVisible();
  }
  const examples = await page.locator('li a[href$=".html"]').evaluateAll(links => links.map(a => a.getAttribute('href')!));
  for (const example of examples) {
    await page.goto(`/${example.replace('./', '')}`);
    const reference = page.locator('nav a').filter({ hasText: 'API reference' });
    await expect(reference).toHaveCount(1);
    await expect(reference).toHaveAttribute('href', /^https:\/\/github\.com\/Axelwickm\/or-tools-wasm\/blob\/main\/docs\/solvers\/[^/]+\/api\.md$/);
  }
});
