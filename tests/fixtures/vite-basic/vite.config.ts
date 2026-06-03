import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  optimizeDeps: {
    include: ['protobufjs'],
    exclude: ['or-tools-wasm'],
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      allow: [
        fixtureDir,
        resolve(fixtureDir, '../../../package/build/javascript/browser'),
        resolve(fixtureDir, '../../../package/build/javascript/wasm'),
      ],
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
