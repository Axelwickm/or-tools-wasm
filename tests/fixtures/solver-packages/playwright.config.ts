import { defineConfig } from '@playwright/test';
export default defineConfig({
  testMatch: 'browser.test.ts',
  workers: 1,
  timeout: 300_000,
  use: { baseURL: 'http://127.0.0.1:4187', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } }],
  webServer: { command: 'npm exec vite preview -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187', reuseExistingServer: false },
});
