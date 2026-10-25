import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { build as buildConsumer } from 'vite';

const require = createRequire(import.meta.url);
const publicRuntimes: Record<string, string[]> = {
  index: [],
  'cp-sat': ['cp_sat'],
  rcpsp: ['cp_sat'],
  routing: ['routing'],
  mathopt: ['mathopt'],
  'mp-solver': ['mp_solver'],
  knapsack: ['mp_solver'],
  pdlp: ['pdlp'],
  'network-flow': ['graph'],
  'set-cover': ['mp_solver', 'set_cover'],
};

test('public solver entries and workers reference only their required WASM assets', async t => {
  const workers: Record<string, string[]> = {
    cp_sat: ['cp_sat'], routing: ['routing'], mathopt: ['mathopt'],
    mp_solver: ['mp_solver'], knapsack: ['mp_solver'], pdlp: ['pdlp'],
    network_flow: ['graph'], set_cover: ['mp_solver', 'set_cover'],
  };
  const entries = { ...publicRuntimes,
    ...Object.fromEntries(Object.entries(workers).map(([name, runtimes]) => [`${name}/worker`, runtimes])),
  };
  for (const [entry, runtimes] of Object.entries(entries)) {
    await t.test(entry, async () => {
      const result = await build({
        entryPoints: [fileURLToPath(new URL(`../lib/${entry}.ts`, import.meta.url))],
        bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2020',
        external: ['node:*'], alias: { long: require.resolve('long') },
      });
      const assets = [...new Set([...result.outputFiles[0].text.matchAll(/#internal-wasm\/([^?'"\s]+\.wasm)/g)]
        .map(match => match[1]))].sort();
      assert.deepEqual(assets, runtimes.flatMap(name => [
        `${name}_runtime.wasm`, `${name}_runtime_asyncify.wasm`,
      ]).sort());
    });
  }
});

test('a CP-SAT and RCPSP consumer emits only their shared runtime in both flavors', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.runtime-assets-', import.meta.url)));
  try {
    const assets = `${directory}/wasm`;
    await mkdir(assets);
    for (const name of new Set(Object.values(publicRuntimes).flat())) {
      for (const suffix of ['', '_asyncify']) {
        const base = `${name}_runtime${suffix}`;
        // Distinct stand-ins exercise asset emission without requiring a native build.
        await writeFile(`${assets}/${base}.wasm`, `WASM asset fixture: ${base}`);
        await writeFile(`${assets}/${base}.js`, `export default function ${base}() {}`);
      }
    }
    const cpSat = fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url));
    const rcpsp = fileURLToPath(new URL('../lib/rcpsp.ts', import.meta.url));
    await writeFile(`${directory}/entry.ts`, `
      import * as cpSat from ${JSON.stringify(cpSat)};
      import * as rcpsp from ${JSON.stringify(rcpsp)};
      globalThis.apis = { cpSat, rcpsp };
    `);
    const result = await buildConsumer({
      root: directory, configFile: false, logLevel: 'silent',
      resolve: { alias: { '#internal-wasm': assets } },
      worker: { format: 'es' },
      build: { write: false, assetsInlineLimit: 0, rollupOptions: { input: `${directory}/entry.ts` } },
    });
    assert.ok('output' in result);
    const wasm = result.output.filter(file => file.fileName.endsWith('.wasm'));
    assert.equal(wasm.length, 2);
    assert.ok(wasm.some(file => /\/cp_sat_runtime-[^/]+\.wasm$/.test(file.fileName)));
    assert.ok(wasm.some(file => /\/cp_sat_runtime_asyncify-[^/]+\.wasm$/.test(file.fileName)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
