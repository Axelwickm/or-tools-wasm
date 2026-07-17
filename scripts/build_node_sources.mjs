import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(new URL('../package/package.json', import.meta.url));
const { build } = require('esbuild');
const sourceDir = path.join(rootDir, 'javascript/lib');
const outDir = path.join(rootDir, 'package/build/javascript/node');
const publicEntryNames = [
  'index',
  'cp-sat',
  'routing',
  'mathopt',
  'mp-solver',
  'pdlp',
  'knapsack',
  'network-flow',
  'set-cover',
  'rcpsp',
];

function externalSharedRuntimePlugin(name, sharedImportPrefix) {
  return {
    name,
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@bufbuild\/protobuf(?:\/.*)?$/ }, (args) => ({
        path: require.resolve(args.path),
      }));
      buildContext.onResolve({ filter: /^protobufjs$/ }, () => ({
        path: require.resolve('protobufjs'),
      }));
      buildContext.onResolve({ filter: /^(?:\.\.?\/)+(?:runtime_loader|worker_bridge)\.js$/ }, (args) => {
        const moduleName = path.basename(args.path);
        return {
          path: `${sharedImportPrefix}/${moduleName}`,
          external: true,
        };
      });
    },
  };
}

const rootExternalLoaderPlugin = externalSharedRuntimePlugin(
  'external-root-runtime-node-loader',
  '.',
);
const nestedExternalLoaderPlugin = externalSharedRuntimePlugin(
  'external-nested-runtime-node-loader',
  '..',
);

const commonNodeBuildOptions = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
};

async function patchBundledCpSatWorkerUrls() {
  for (const entryName of ['cp-sat', 'rcpsp']) {
    const entryPath = path.join(outDir, `${entryName}.js`);
    const source = await readFile(entryPath, 'utf8');
    const patchedSource = source
      .replaceAll(
        'new URL("./cp_sat_node_worker_bridge.js", import.meta.url)',
        'new URL("./cp_sat/cp_sat_node_worker_bridge.js", import.meta.url)',
      )
      .replaceAll(
        'new URL("./worker.js", import.meta.url)',
        'new URL("./cp_sat/worker.js", import.meta.url)',
      );
    if (patchedSource !== source) {
      await writeFile(entryPath, patchedSource);
    }
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entryName of publicEntryNames) {
  await build({
    ...commonNodeBuildOptions,
    entryPoints: [path.join(sourceDir, `${entryName}.ts`)],
    outfile: path.join(outDir, `${entryName}.js`),
    plugins: [rootExternalLoaderPlugin],
  });
}

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'ortools_worker.ts')],
  outfile: path.join(outDir, 'ortools_worker.js'),
  plugins: [rootExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'cp_sat/worker.ts')],
  outfile: path.join(outDir, 'cp_sat/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'worker_bridge.ts')],
  outfile: path.join(outDir, 'worker_bridge.js'),
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'runtime_loader_node.ts')],
  outfile: path.join(outDir, 'runtime_loader.js'),
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
  path.join(outDir, 'cp_sat/cp_sat_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('CP-SAT worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
const hasWorkerGlobalMessaging = typeof globalThis.postMessage === 'function' && 'onmessage' in globalThis;

Object.assign(globalThis, { self: globalThis });

if (!hasWorkerGlobalMessaging) {
  Object.assign(globalThis, {
    postMessage: (message, transfer) => postToParent(message, transfer),
  });

  parentPort.on('message', (message) => {
    globalThis.onmessage?.({ data: message });
  });
}

await import('./worker.js');
`,
);

await patchBundledCpSatWorkerUrls();
