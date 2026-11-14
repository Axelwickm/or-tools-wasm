import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';

// Badges are decorative third-party assets. Keep site tests independent of
// their availability while still waiting for the application's full load.
export const test = base.extend<{ badges: void }>({
  badges: [async ({ context }, use) => {
    await context.route('https://img.shields.io/**', route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" role="img" aria-label="Package badge"/>',
    }));
    await use();
  }, { auto: true }],
});
