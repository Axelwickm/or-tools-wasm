import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(rootDir, 'javascript/lib');
const outDir = path.join(rootDir, 'build/javascript/node');

const externalLoaderPlugin = {
  name: 'external-runtime-node-loader',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^\.\/(?:cp_sat_module_loader|runtime_loader)\.js$/ }, (args) => ({
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
  path.join(outDir, 'runtime_loader.js'),
  `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import createNodeModule from '../node-wasm/ortools_runtime_node.js';
import createWebAsyncifyModule from '../wasm/ortools_runtime_asyncify.js';

let modulePromise = null;

function locateNodeRuntimeFile(fileName) {
  return fileURLToPath(new URL(\`../node-wasm/\${fileName}\`, import.meta.url));
}

function isWebWorkerRuntimeHost() {
  const isDeno = typeof globalThis.Deno !== 'undefined';
  const isBun = typeof globalThis.Bun !== 'undefined';
  return isDeno || isBun;
}

function locateWebRuntimeFile(fileName) {
  if (fileName === 'ortools_runtime_asyncify.wasm') {
    return new URL('../wasm/ortools_runtime_asyncify.wasm', import.meta.url).href;
  }
  return new URL(\`../browser/\${fileName}\`, import.meta.url).href;
}

async function loadWebWorkerRuntime() {
  const wasmFile = '../wasm/ortools_runtime_asyncify.wasm';
  const wasmBinary = await readFile(new URL(wasmFile, import.meta.url));
  const createModule = createWebAsyncifyModule;
  return createModule({
    locateFile: locateWebRuntimeFile,
    wasmBinary,
  });
}

export async function loadRuntime() {
  if (!modulePromise) {
    modulePromise = isWebWorkerRuntimeHost()
      ? loadWebWorkerRuntime()
      : createNodeModule({ locateFile: locateNodeRuntimeFile });
  }
  return modulePromise;
}

export async function loadRuntimeAsyncify() {
  return loadRuntime();
}

export async function loadRoutingRuntimeAsyncify() {
  return loadRuntime();
}

export async function loadMPSolverRuntime() {
  return loadRuntime();
}

export async function loadMathOptRuntime() {
  return loadRuntime();
}

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
`,
);

await writeFile(
  path.join(outDir, 'cp_sat_module_loader.js'),
  `export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify } from './runtime_loader.js';\n`,
);
