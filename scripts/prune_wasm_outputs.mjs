import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const runtimes = [
  'cp_sat_runtime',
  'routing_runtime',
  'mp_solver_runtime',
  'mathopt_runtime',
  'pdlp_runtime',
  'graph_runtime',
  'set_cover_runtime',
];

function runtimeFiles(name) {
  return [
    `${name}.js`,
    `${name}.wasm`,
    `${name}.wasm.map`,
  ];
}

const expectedByDir = new Map([
  [
    path.join(repoRoot, 'build/javascript/wasm'),
    new Set([
      ...runtimes.flatMap((runtime) => [
        ...runtimeFiles(runtime),
        ...runtimeFiles(`${runtime}_asyncify`),
      ]),
      'cp_sat_runtime.d.ts',
    ]),
  ],
  [
    path.join(repoRoot, 'build/javascript/node-wasm'),
    new Set(runtimes.flatMap((runtime) => [
      ...runtimeFiles(`${runtime}_node`),
      ...runtimeFiles(`${runtime}_node_asyncify`),
    ])),
  ],
]);

for (const [directory, expectedFiles] of expectedByDir) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || expectedFiles.has(entry.name)) continue;
    await rm(path.join(directory, entry.name));
    console.log(`Removed stale wasm output ${path.relative(repoRoot, path.join(directory, entry.name))}`);
  }
}

