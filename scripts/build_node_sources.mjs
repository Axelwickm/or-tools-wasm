import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(rootDir, 'javascript/lib');
const outDir = path.join(rootDir, 'build/javascript/node');

const externalLoaderPlugin = {
  name: 'external-cp-sat-node-loader',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^\.\/cp_sat_module_loader\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(sourceDir, 'index.ts')],
  outfile: path.join(outDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  plugins: [externalLoaderPlugin],
});

await writeFile(
  path.join(outDir, 'cp_sat_module_loader.js'),
  `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import createNodeModule from '../node-wasm/cp_sat_runtime_node.js';
import createWebAsyncifyModule from '../browser/cp_sat_runtime_asyncify.js';
import createWebModule from '../browser/cp_sat_runtime.js';

let modulePromise = null;

function locateCpSatNodeRuntimeFile(fileName) {
  return fileURLToPath(new URL(\`../node-wasm/\${fileName}\`, import.meta.url));
}

function isWebWorkerRuntimeHost() {
  const isDeno = typeof globalThis.Deno !== 'undefined';
  const isBun = typeof globalThis.Bun !== 'undefined';
  return isDeno || isBun;
}

function locateCpSatWebRuntimeFile(fileName) {
  if (fileName === 'cp_sat_runtime.wasm') {
    return new URL('../lib/assets/cp_sat_runtime.wasm', import.meta.url).href;
  }
  if (fileName === 'cp_sat_runtime_asyncify.wasm') {
    return new URL('../lib/assets/cp_sat_runtime_asyncify.wasm', import.meta.url).href;
  }
  return new URL(\`../browser/\${fileName}\`, import.meta.url).href;
}

async function loadWebWorkerRuntime() {
  const isBun = typeof globalThis.Bun !== 'undefined';
  const wasmFile = isBun
    ? '../lib/assets/cp_sat_runtime_asyncify.wasm'
    : '../lib/assets/cp_sat_runtime.wasm';
  const wasmBinary = await readFile(new URL(wasmFile, import.meta.url));
  const createModule = isBun ? createWebAsyncifyModule : createWebModule;
  return createModule({
    locateFile: locateCpSatWebRuntimeFile,
    wasmBinary,
  });
}

export async function loadCpSat() {
  if (!modulePromise) {
    modulePromise = isWebWorkerRuntimeHost()
      ? loadWebWorkerRuntime()
      : createNodeModule({ locateFile: locateCpSatNodeRuntimeFile });
  }
  return modulePromise;
}
`,
);
