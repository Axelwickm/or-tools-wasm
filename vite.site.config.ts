import { defineConfig, searchForWorkspaceRoot } from 'vite';
import path from 'node:path';

const siteRoot = path.resolve(__dirname, 'javascript/site');
const distDir = path.resolve(__dirname, 'build/javascript/site');

export default defineConfig({
  root: siteRoot,
  base: './',
  publicDir: false,
  worker: {
    format: 'es',
  },
  server: {
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
  build: {
    outDir: distDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: path.resolve(siteRoot, 'index.html'),
        magic_square: path.resolve(siteRoot, 'magic_square.html'),
        mathopt_basic: path.resolve(siteRoot, 'mathopt_basic.html'),
        mathopt_integer: path.resolve(siteRoot, 'mathopt_integer.html'),
        mathopt_scheduling: path.resolve(siteRoot, 'mathopt_scheduling.html'),
        mathopt_simple: path.resolve(siteRoot, 'mathopt_simple.html'),
        model_playground: path.resolve(siteRoot, 'model_playground.html'),
        mp_simple_lp: path.resolve(siteRoot, 'mp_simple_lp.html'),
        mp_simple_mip: path.resolve(siteRoot, 'mp_simple_mip.html'),
        routing_dispatch: path.resolve(siteRoot, 'routing_dispatch.html'),
        routing_simple: path.resolve(siteRoot, 'routing_simple.html'),
        routing_vrp: path.resolve(siteRoot, 'routing_vrp.html'),
        schema_viewer: path.resolve(siteRoot, 'schema_viewer.html'),
        sports_scheduling: path.resolve(siteRoot, 'sports_scheduling.html'),
        steel_mill_slab: path.resolve(siteRoot, 'steel_mill_slab.html'),
        sudoku_generator: path.resolve(siteRoot, 'sudoku_generator.html'),
      },
    },
  },
});
