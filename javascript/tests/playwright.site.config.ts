import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './site',
  fullyParallel: true,
  workers: 2,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', testMatch: ['**/ergonomics.spec.ts', '**/live_code.spec.ts'], use: { browserName: 'firefox' } },
  ],
  use: { baseURL: 'http://127.0.0.1:4191', browserName: 'chromium' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4191 --strictPort',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    url: 'http://127.0.0.1:4191',
    reuseExistingServer: false,
  },
});
