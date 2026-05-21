import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(rootDir, 'javascript/lib');
const outDir = path.join(rootDir, 'build/javascript/node');
const publicEntryNames = [
  'index',
  'cp-sat',
  'routing',
  'mathopt',
  'mp-solver',
  'pdlp',
  'knapsack',
  'network-flow',
];

const externalLoaderPlugin = {
  name: 'external-runtime-node-loader',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^\.\/(?:cp_sat_module_loader|runtime_loader|worker_bridge)\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entryName of publicEntryNames) {
  await build({
    entryPoints: [path.join(sourceDir, `${entryName}.ts`)],
    outfile: path.join(outDir, `${entryName}.js`),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    plugins: [externalLoaderPlugin],
  });
}

await build({
  entryPoints: [path.join(sourceDir, 'ortools_worker.ts')],
  outfile: path.join(outDir, 'ortools_worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  plugins: [externalLoaderPlugin],
});

await build({
  entryPoints: [path.join(sourceDir, 'worker_bridge.ts')],
  outfile: path.join(outDir, 'worker_bridge.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
});

await writeFile(
  path.join(outDir, 'node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('OR-Tools worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
const hasWorkerGlobalMessaging = typeof globalThis.postMessage === 'function' && 'onmessage' in globalThis;

Object.assign(globalThis, { self: globalThis });

if (!hasWorkerGlobalMessaging) {
  Object.assign(globalThis, {
    postMessage: (message) => postToParent(message),
  });

  parentPort.on('message', (message) => {
    globalThis.onmessage?.({ data: message });
  });
}

await import('./ortools_worker.js');
`,
);

await writeFile(
  path.join(outDir, 'runtime_loader.js'),
  `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const runtimeSpecs = {
  cp_sat_runtime: {
    jspi: {
      nodeJs: '../node-wasm/cp_sat_runtime_node.js',
      webJs: '../wasm/cp_sat_runtime.js',
      wasm: 'cp_sat_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/cp_sat_runtime_node_asyncify.js',
      webJs: '../wasm/cp_sat_runtime_asyncify.js',
      wasm: 'cp_sat_runtime_asyncify.wasm',
    },
  },
  routing_runtime: {
    jspi: {
      nodeJs: '../node-wasm/routing_runtime_node.js',
      webJs: '../wasm/routing_runtime.js',
      wasm: 'routing_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/routing_runtime_node_asyncify.js',
      webJs: '../wasm/routing_runtime_asyncify.js',
      wasm: 'routing_runtime_asyncify.wasm',
    },
  },
  mp_solver_runtime: {
    jspi: {
      nodeJs: '../node-wasm/mp_solver_runtime_node.js',
      webJs: '../wasm/mp_solver_runtime.js',
      wasm: 'mp_solver_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/mp_solver_runtime_node_asyncify.js',
      webJs: '../wasm/mp_solver_runtime_asyncify.js',
      wasm: 'mp_solver_runtime_asyncify.wasm',
    },
  },
  mathopt_runtime: {
    jspi: {
      nodeJs: '../node-wasm/mathopt_runtime_node.js',
      webJs: '../wasm/mathopt_runtime.js',
      wasm: 'mathopt_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/mathopt_runtime_node_asyncify.js',
      webJs: '../wasm/mathopt_runtime_asyncify.js',
      wasm: 'mathopt_runtime_asyncify.wasm',
    },
  },
  pdlp_runtime: {
    jspi: {
      nodeJs: '../node-wasm/pdlp_runtime_node.js',
      webJs: '../wasm/pdlp_runtime.js',
      wasm: 'pdlp_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/pdlp_runtime_node_asyncify.js',
      webJs: '../wasm/pdlp_runtime_asyncify.js',
      wasm: 'pdlp_runtime_asyncify.wasm',
    },
  },
  graph_runtime: {
    jspi: {
      nodeJs: '../node-wasm/graph_runtime_node.js',
      webJs: '../wasm/graph_runtime.js',
      wasm: 'graph_runtime.wasm',
    },
    asyncify: {
      nodeJs: '../node-wasm/graph_runtime_node_asyncify.js',
      webJs: '../wasm/graph_runtime_asyncify.js',
      wasm: 'graph_runtime_asyncify.wasm',
    },
  },
};

const modulePromises = new Map();
let selectedFlavor = null;

function locateNodeRuntimeFile(fileName) {
  return fileURLToPath(new URL(\`../node-wasm/\${fileName}\`, import.meta.url));
}

function isWebWorkerRuntimeHost() {
  const isDeno = typeof globalThis.Deno !== 'undefined';
  const isBun = typeof globalThis.Bun !== 'undefined';
  return isDeno || isBun;
}

function isDenoRuntime() {
  return typeof globalThis.Deno !== 'undefined';
}

function isBunRuntime() {
  return typeof globalThis.Bun !== 'undefined';
}

function isJspiSupported() {
  return typeof WebAssembly !== 'undefined' && typeof WebAssembly.promising === 'function';
}

function selectRuntimeFlavor(runtimeName) {
  if (isDenoRuntime() || isBunRuntime()) {
    return 'asyncify';
  }
  selectedFlavor ??= isJspiSupported() ? 'jspi' : 'asyncify';
  return selectedFlavor;
}

function locateWebRuntimeFile(fileName) {
  return new URL(\`../wasm/\${fileName}\`, import.meta.url).href;
}

async function createRuntime(runtimeName, flavor = selectRuntimeFlavor(runtimeName)) {
  const key = \`\${runtimeName}:\${flavor}\`;
  if (!modulePromises.has(key)) {
    modulePromises.set(key, (async () => {
      const spec = runtimeSpecs[runtimeName][flavor];
      if (isWebWorkerRuntimeHost()) {
        const { default: createModule } = await import(new URL(spec.webJs, import.meta.url).href);
        const wasmBinary = await readFile(new URL(\`../wasm/\${spec.wasm}\`, import.meta.url));
        return createModule({
          locateFile: locateWebRuntimeFile,
          wasmBinary,
        });
      }
      const { default: createModule } = await import(new URL(spec.nodeJs, import.meta.url).href);
      return createModule({ locateFile: locateNodeRuntimeFile });
    })());
  }
  return modulePromises.get(key);
}

export async function terminateLoadedRuntimeThreads() {
  const modules = await Promise.allSettled(modulePromises.values());
  for (const moduleResult of modules) {
    if (moduleResult.status !== 'fulfilled') continue;
    moduleResult.value.PThread?.terminateAllThreads?.();
  }
}

export async function loadRuntime() {
  return createRuntime('cp_sat_runtime');
}

export async function loadRuntimeAsyncify() {
  return createRuntime('cp_sat_runtime', 'asyncify');
}

export async function loadRoutingRuntime() {
  return createRuntime('routing_runtime');
}

export async function loadRoutingRuntimeAsyncify() {
  return createRuntime('routing_runtime', 'asyncify');
}

export async function loadMPSolverRuntime() {
  return createRuntime('mp_solver_runtime');
}

export async function loadMPSolverRuntimeAsyncify() {
  return createRuntime('mp_solver_runtime', 'asyncify');
}

export async function loadMathOptRuntime() {
  return createRuntime('mathopt_runtime');
}

export async function loadMathOptRuntimeAsyncify() {
  return createRuntime('mathopt_runtime', 'asyncify');
}

export async function loadPdlpRuntime() {
  return createRuntime('pdlp_runtime');
}

export async function loadPdlpRuntimeAsyncify() {
  return createRuntime('pdlp_runtime', 'asyncify');
}

export async function loadGraphRuntime() {
  return createRuntime('graph_runtime');
}

export async function loadGraphRuntimeAsyncify() {
  return createRuntime('graph_runtime', 'asyncify');
}

export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify };
`,
);

await writeFile(
  path.join(outDir, 'cp_sat_module_loader.js'),
  `export { loadRuntime as loadCpSat, loadRuntimeAsyncify as loadCpSatAsyncify } from './runtime_loader.js';\n`,
);
