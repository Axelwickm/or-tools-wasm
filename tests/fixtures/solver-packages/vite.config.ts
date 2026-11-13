import { defineConfig } from 'vite';
export default defineConfig({
  worker: { format: 'es' },
  preview: { headers: {
    // WebKit can reject cached worker reloads after startup cancellation.
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  } },
});
