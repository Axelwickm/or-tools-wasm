import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './isolation', testMatch: '*.spec.ts', timeout: 120_000, workers: 2,
  webServer: { command: 'node isolation/server.mjs', url: 'http://127.0.0.1:4186', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
});
