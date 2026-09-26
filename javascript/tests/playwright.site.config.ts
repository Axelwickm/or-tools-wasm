import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './site',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4190', browserName: 'chromium' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4190 --strictPort',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    url: 'http://127.0.0.1:4190',
    reuseExistingServer: false,
  },
});
