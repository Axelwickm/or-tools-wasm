import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageRoot = path.join(root, 'javascript');
const buildRoot = path.join(packageRoot, 'build/javascript');
const outputRoot = path.join(packageRoot, 'build/solver-packages');
const parent = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const solvers = [
  { entry: 'cp-sat', directory: 'cp_sat', runtime: 'cp_sat_runtime', label: 'CP-SAT' },
  { entry: 'routing', directory: 'routing', runtime: 'routing_runtime', label: 'Routing' },
];

for (const { entry, directory, runtime, label } of solvers) {
  const destination = path.join(outputRoot, entry);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  async function copy(relative) {
    const target = path.join(destination, 'build/javascript', relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(buildRoot, relative), target);
  }
  const files = [
    `browser/${entry}.js`, `browser/${directory}/worker.js`,
    `browser/runtime/${directory}.js`, 'browser/runtime_loader.js', 'browser/runtime_loader_core.js',
    `node/${entry}.js`, `node/${directory}/worker.js`, `node/${directory}/worker_runtime.js`,
    'node/runtime_loader.js',
  ];
  for (const flavor of ['', '_asyncify']) {
    files.push(`wasm/${runtime}${flavor}.js`, `wasm/${runtime}${flavor}.wasm`,
      `wasm/${runtime}${flavor}.wasm.map`, `node-wasm/${runtime}_node${flavor}.js`);
  }
  for (const file of files) await copy(file);

  // Ask TypeScript for the declaration dependency graph rather than copying
  // every solver's types or rewriting generated imports.
  const declarations = spawnSync(path.join(packageRoot, 'node_modules/.bin/tsc'), [
    '--ignoreConfig', '--listFilesOnly', '--noEmit', '--skipLibCheck', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--target', 'ES2022',
    path.join(buildRoot, 'lib', `${entry}.d.ts`),
  ], { cwd: destination, encoding: 'utf8' });
  if (declarations.status !== 0) throw new Error(declarations.stderr || declarations.stdout);
  for (const file of declarations.stdout.trim().split('\n')) {
    const relative = path.relative(buildRoot, file.trim());
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!relative.endsWith('.d.ts')) throw new Error(`Unexpected declaration dependency: ${file}`);
    await copy(relative);
  }

  const exports = parent.exports[`./${entry}`];
  const manifest = {
    name: `${entry}-wasm`, version: parent.version,
    description: `Google OR-Tools ${label} for JavaScript and TypeScript, with browser and Node WASM runtimes.`,
    license: parent.license, repository: parent.repository, homepage: parent.homepage, bugs: parent.bugs,
    type: 'module', main: exports.node, types: exports.types,
    exports: { '.': exports },
    files: ['build/javascript'], dependencies: parent.dependencies,
  };
  await writeFile(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await copyFile(path.join(root, 'LICENSE'), path.join(destination, 'LICENSE'));
  const readme = await readFile(path.join(root, 'docs/solvers', entry, 'README.md'), 'utf8');
  await writeFile(path.join(destination, 'README.md'), readme.replaceAll(
    '(api.md)', `(https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/solvers/${entry}/api.md)`,
  ).replaceAll(
    'src="../../media/', 'src="https://raw.githubusercontent.com/Axelwickm/or-tools-wasm/stable/docs/media/',
  ));
  const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', outputRoot], {
    cwd: destination, encoding: 'utf8',
  });
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);
  const [result] = JSON.parse(packed.stdout);
  console.log(`${manifest.name}@${manifest.version}: ${result.size} bytes packed, ${result.unpackedSize} unpacked (${result.files.length} files)`);
  const tarball = path.join(outputRoot, `${entry}.tgz`);
  await rename(path.join(outputRoot, result.filename), tarball);
  console.log(tarball);
}
