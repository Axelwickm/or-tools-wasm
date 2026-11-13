// Run after build_node_sources.mjs and package_solvers.mjs; uses real WASM.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const temporary = await mkdtemp(path.join(tmpdir(), 'ortools-node-eval-'));
try {
  for (const flavor of ['jspi', 'asyncify']) {
    for (const solver of ['cp-sat', 'routing']) {
      const entry = pathToFileURL(path.join(root, `javascript/build/solver-packages/${solver}/build/javascript/node/${solver}.js`)).href;
      const solve = solver === 'cp-sat' ? `
        const model = new api.CpModel();
        const x = model.newIntVar(7, 7, 'x');
        const result = await api.CpSat.solve(model, { executor: 'direct' });
        assert.equal(result.value(x), 7n);
      ` : `
        const manager = new api.RoutingIndexManager(3, 1, 0);
        const model = new api.RoutingModel(manager);
        const transit = model.registerTransitCallback((from, to) => from === to ? 0 : 1);
        model.setArcCostEvaluatorOfAllVehicles(transit);
        const result = await model.solve({ executor: 'direct' });
        assert.equal(result.hasSolution, true);
      `;
      const setup = `
        import assert from 'node:assert/strict';
        if (${JSON.stringify(flavor)} === 'asyncify') WebAssembly.promising = undefined;
        Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 2 }, configurable: true });
        const api = await import(${JSON.stringify(entry)});
        async function solve() { ${solve} }
      `;
      const normal = `${setup} try { await solve(); await solve(); } finally { await api.terminateLoadedRuntimeThreads(); } console.log('PASS');`;
      const filename = path.join(temporary, `${solver}.mjs`);
      await writeFile(filename, normal);
      const cases = [
        ['eval', ['--input-type=module', '-e', normal]],
        ['split flag', ['--input-type', 'module', '-e', normal]],
        ['stdin', ['--input-type=module'], normal],
        ['file', [filename]],
      ];
      const failure = `${setup}
        const { createRequire, syncBuiltinESMExports } = await import('node:module');
        const threads = createRequire(import.meta.url)('node:worker_threads');
        const Original = threads.Worker;
        threads.Worker = class extends Original {
          constructor(url, options) { super(new URL('file:///missing-ortools-pthread.mjs'), options); }
        };
        syncBuiltinESMExports();
        try { await assert.rejects(solve(), /Cannot find module/); }
        finally { threads.Worker = Original; syncBuiltinESMExports(); }
        try { await solve(); } finally { await api.terminateLoadedRuntimeThreads(); }
        console.log('PASS');
      `;
      cases.push(['startup failure and retry', ['--input-type=module', '-e', failure]]);
      cases.push(['premature exit and retry', ['--input-type=module', '-e', failure
        .replace('file:///missing-ortools-pthread.mjs', 'data:text/javascript,process.exit(0)')
        .replace('/Cannot find module/', '/exited during startup/')]]);
      for (const [label, args, input] of cases) {
        const result = spawnSync(process.execPath, args, { input, encoding: 'utf8', timeout: 60000 });
        assert.ifError(result.error);
        assert.equal(result.status, 0, `${solver} ${flavor} ${label}: ${result.error ?? ''}\n${result.stderr}\n${result.stdout}`);
        assert.match(result.stdout, /PASS/);
        console.log(`${solver} ${flavor}: ${label} passed`);
      }
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
