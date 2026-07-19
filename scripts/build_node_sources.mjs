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
      buildContext.onResolve({ filter: /^(?:\.\.?\/)+runtime_loader\.js$/ }, (args) => {
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

async function patchBundledSolverWorkerUrls() {
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
  const knapsackPath = path.join(outDir, 'knapsack.js');
  const knapsackSource = await readFile(knapsackPath, 'utf8');
  await writeFile(knapsackPath, knapsackSource
    .replaceAll(
      'new URL("./knapsack_node_worker_bridge.js", import.meta.url)',
      'new URL("./knapsack/knapsack_node_worker_bridge.js", import.meta.url)',
    )
    .replaceAll(
      'new URL("./worker.js", import.meta.url)',
      'new URL("./knapsack/worker.js", import.meta.url)',
    ));
  const networkFlowPath = path.join(outDir, 'network-flow.js');
  const networkFlowSource = await readFile(networkFlowPath, 'utf8');
  await writeFile(networkFlowPath, networkFlowSource
    .replaceAll(
      'new URL("./network_flow_node_worker_bridge.js", import.meta.url)',
      'new URL("./network_flow/network_flow_node_worker_bridge.js", import.meta.url)',
    )
    .replaceAll(
      'new URL("./worker.js", import.meta.url)',
      'new URL("./network_flow/worker.js", import.meta.url)',
    ));
  const mpSolverPath = path.join(outDir, 'mp-solver.js');
  const mpSolverSource = await readFile(mpSolverPath, 'utf8');
  await writeFile(mpSolverPath, mpSolverSource
    .replaceAll('new URL("./mp_solver_node_worker_bridge.js", import.meta.url)', 'new URL("./mp_solver/mp_solver_node_worker_bridge.js", import.meta.url)')
    .replaceAll('new URL("./worker.js", import.meta.url)', 'new URL("./mp_solver/worker.js", import.meta.url)'));
  const mathOptPath = path.join(outDir, 'mathopt.js');
  const mathOptSource = await readFile(mathOptPath, 'utf8');
  await writeFile(mathOptPath, mathOptSource
    .replaceAll('new URL("./mathopt_node_worker_bridge.js", import.meta.url)', 'new URL("./mathopt/mathopt_node_worker_bridge.js", import.meta.url)')
    .replaceAll('new URL("./worker.js", import.meta.url)', 'new URL("./mathopt/worker.js", import.meta.url)'));
  const setCoverPath = path.join(outDir, 'set-cover.js');
  const setCoverSource = await readFile(setCoverPath, 'utf8');
  await writeFile(setCoverPath, setCoverSource
    .replaceAll(
      'new URL("./set_cover_node_worker_bridge.js", import.meta.url)',
      'new URL("./set_cover/set_cover_node_worker_bridge.js", import.meta.url)',
    )
    .replaceAll(
      'new URL("./worker.js", import.meta.url)',
      'new URL("./set_cover/worker.js", import.meta.url)',
    ));
  const pdlpPath = path.join(outDir, 'pdlp.js');
  const pdlpSource = await readFile(pdlpPath, 'utf8');
  await writeFile(pdlpPath, pdlpSource
    .replaceAll(
      'new URL("./pdlp_node_worker_bridge.js", import.meta.url)',
      'new URL("./pdlp/pdlp_node_worker_bridge.js", import.meta.url)',
    )
    .replaceAll(
      'new URL("./worker.js", import.meta.url)',
      'new URL("./pdlp/worker.js", import.meta.url)',
    ));
  const routingPath = path.join(outDir, 'routing.js');
  const routingSource = await readFile(routingPath, 'utf8');
  await writeFile(routingPath, routingSource
    .replaceAll('new URL("./routing_node_worker_bridge.js", import.meta.url)', 'new URL("./routing/routing_node_worker_bridge.js", import.meta.url)')
    .replaceAll('new URL("./worker.js", import.meta.url)', 'new URL("./routing/worker.js", import.meta.url)'));
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
  entryPoints: [path.join(sourceDir, 'knapsack/worker.ts')],
  outfile: path.join(outDir, 'knapsack/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'mathopt/worker.ts')],
  outfile: path.join(outDir, 'mathopt/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'mp_solver/worker.ts')],
  outfile: path.join(outDir, 'mp_solver/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'network_flow/worker.ts')],
  outfile: path.join(outDir, 'network_flow/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'set_cover/worker.ts')],
  outfile: path.join(outDir, 'set_cover/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'pdlp/worker.ts')],
  outfile: path.join(outDir, 'pdlp/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'routing/worker.ts')],
  outfile: path.join(outDir, 'routing/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'cp_sat/worker.ts')],
  outfile: path.join(outDir, 'cp_sat/worker.js'),
  plugins: [nestedExternalLoaderPlugin],
});

await build({
  ...commonNodeBuildOptions,
  entryPoints: [path.join(sourceDir, 'runtime_loader_node.ts')],
  outfile: path.join(outDir, 'runtime_loader.js'),
});

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

await writeFile(
  path.join(outDir, 'knapsack/knapsack_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('Knapsack worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, {
  self: globalThis,
  postMessage: (message, transfer) => postToParent(message, transfer),
});
parentPort.on('message', (message) => {
  globalThis.onmessage?.({ data: message });
});

await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'network_flow/network_flow_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('Network Flow worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, {
  self: globalThis,
  postMessage: (message, transfer) => postToParent(message, transfer),
});
parentPort.on('message', (message) => {
  globalThis.onmessage?.({ data: message });
});

await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'mathopt/mathopt_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('MathOpt worker bridge must run inside a Node worker thread.');
const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, { self: globalThis, postMessage: (message, transfer) => postToParent(message, transfer) });
parentPort.on('message', (message) => { globalThis.onmessage?.({ data: message }); });
await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'mp_solver/mp_solver_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('MP Solver worker bridge must run inside a Node worker thread.');
const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, { self: globalThis, postMessage: (message, transfer) => postToParent(message, transfer) });
parentPort.on('message', (message) => { globalThis.onmessage?.({ data: message }); });
await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'set_cover/set_cover_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('Set Cover worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, {
  self: globalThis,
  postMessage: (message, transfer) => postToParent(message, transfer),
});
parentPort.on('message', (message) => {
  globalThis.onmessage?.({ data: message });
});

await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'pdlp/pdlp_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('PDLP worker bridge must run inside a Node worker thread.');
}

const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, {
  self: globalThis,
  postMessage: (message, transfer) => postToParent(message, transfer),
});
parentPort.on('message', (message) => {
  globalThis.onmessage?.({ data: message });
});

await import('./worker.js');
`,
);

await writeFile(
  path.join(outDir, 'routing/routing_node_worker_bridge.js'),
  `import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('Routing worker bridge must run inside a Node worker thread.');
const postToParent = parentPort.postMessage.bind(parentPort);
Object.assign(globalThis, { self: globalThis, postMessage: (message, transfer) => postToParent(message, transfer) });
parentPort.on('message', (message) => { globalThis.onmessage?.({ data: message }); });
await import('./worker.js');
`,
);

await patchBundledSolverWorkerUrls();
