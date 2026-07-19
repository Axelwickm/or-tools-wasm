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
const solverBuilds = [
  { directory: 'cp_sat', publicEntries: ['cp-sat', 'rcpsp'], label: 'CP-SAT', preserveGlobalMessaging: true },
  { directory: 'knapsack', publicEntries: ['knapsack'], label: 'Knapsack' },
  { directory: 'mathopt', publicEntries: ['mathopt'], label: 'MathOpt' },
  { directory: 'mp_solver', publicEntries: ['mp-solver'], label: 'MP Solver' },
  { directory: 'network_flow', publicEntries: ['network-flow'], label: 'Network Flow' },
  { directory: 'pdlp', publicEntries: ['pdlp'], label: 'PDLP' },
  { directory: 'routing', publicEntries: ['routing'], label: 'Routing' },
  { directory: 'set_cover', publicEntries: ['set-cover'], label: 'Set Cover' },
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
      buildContext.onResolve({ filter: /^(?:\.\.?\/)+runtime_loader\.js$/ }, (args) => {
        const moduleName = path.basename(args.path);
        return {
          path: `${sharedImportPrefix}/${moduleName}`,
          external: true,
        };
      });
      buildContext.onLoad(
        { filter: /worker_executor\.ts$/ },
        async (args) => {
          const source = await readFile(args.path, 'utf8');
          const nodeSource = source
            .replaceAll('new Worker(', 'new NodeWorker(')
            .replaceAll("{ type: 'module', name:", '{ execArgv: [], name:');
          if (nodeSource === source) {
            throw new Error(`Expected a browser Worker constructor in ${args.path}`);
          }
          return {
            loader: 'ts',
            contents: `import { Worker as NodeWorker } from 'node:worker_threads';
${nodeSource}
`,
          };
        },
      );
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

async function patchBundledSolverWorkerUrls() {
  for (const { directory, publicEntries } of solverBuilds) {
    for (const entryName of publicEntries) {
      const entryPath = path.join(outDir, `${entryName}.js`);
      const source = await readFile(entryPath, 'utf8');
      const patchedSource = source
        .replaceAll(
          'new URL("./worker.js", import.meta.url)',
          `new URL("./${directory}/worker.js", import.meta.url)`,
        );
      if (patchedSource !== source) {
        await writeFile(entryPath, patchedSource);
      }
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

for (const { directory } of solverBuilds) {
  await build({
    ...commonNodeBuildOptions,
    entryPoints: [path.join(sourceDir, directory, 'worker.ts')],
    outfile: path.join(outDir, directory, 'worker_runtime.js'),
    plugins: [nestedExternalLoaderPlugin],
  });
}

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'runtime_loader_node.ts')],
  outfile: path.join(outDir, 'runtime_loader.js'),
});

function nodeWorkerBridgeSource(label, preserveGlobalMessaging) {
  if (preserveGlobalMessaging) {
    return `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('${label} worker bridge must run inside a Node worker thread.');
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

await import('./worker_runtime.js');
`;
  }
  return `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('${label} worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, {
  self: globalThis,
  postMessage: (message, transfer) => postToParent(message, transfer),
});
parentPort.on('message', (message) => {
  globalThis.onmessage?.({ data: message });
});

await import('./worker_runtime.js');
`;
}

for (const { directory, label, preserveGlobalMessaging } of solverBuilds) {
  await writeFile(
    path.join(outDir, directory, 'worker.js'),
    nodeWorkerBridgeSource(label, preserveGlobalMessaging),
  );
}

await patchBundledSolverWorkerUrls();
