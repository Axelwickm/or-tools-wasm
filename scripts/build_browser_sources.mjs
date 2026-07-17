import { mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(new URL('../package/package.json', import.meta.url));
const { build, transform } = require('esbuild');
const sourceDir = path.join(rootDir, 'javascript/lib');
const packageBuildDir = path.join(rootDir, 'package/build/javascript');
const outDir = path.join(packageBuildDir, 'browser');
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

async function* listTypeScriptFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* listTypeScriptFiles(entryPath);
    } else if (
      entry.isFile()
      && entry.name.endsWith('.ts')
      && !entry.name.endsWith('.d.ts')
      && entry.name !== 'runtime_loader_node.ts'
      && entry.name !== 'server.ts'
    ) {
      yield entryPath;
    }
  }
}

async function* listDeclarationFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* listDeclarationFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      yield entryPath;
    }
  }
}

async function transpileSource(sourcePath) {
  const relativePath = path.relative(sourceDir, sourcePath);
  const outputPath = path.join(outDir, relativePath.replace(/\.ts$/, '.js'));
  const source = await readFile(sourcePath, 'utf8');
  const result = await transform(source, {
    loader: 'ts',
    format: 'esm',
    target: 'es2020',
    define: {
      __ORTOOLS_WASM_BROWSER_BUILD__: 'true',
    },
    minifySyntax: true,
    sourcemap: false,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  const code = relativePath === 'runtime_loader.ts'
    ? result.code.replaceAll('#internal-wasm/', '../wasm/')
      .replaceAll('?no-inline', '')
    : result.code;

  await writeFile(outputPath, code);
}

const externalRuntimeLoaderPlugin = {
  name: 'external-runtime-loader',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^node:/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    buildContext.onResolve({ filter: /^@bufbuild\/protobuf(?:\/.*)?$/ }, (args) => ({
      path: require.resolve(args.path),
    }));
    buildContext.onResolve({ filter: /^protobufjs$/ }, () => ({
      path: require.resolve('protobufjs'),
    }));
    buildContext.onResolve({ filter: /^\.\/(?:runtime_loader|worker_bridge)\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

const externalWorkerRuntimeLoaderPlugin = {
  name: 'external-worker-runtime-loader',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^node:/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    buildContext.onResolve({ filter: /^@bufbuild\/protobuf(?:\/.*)?$/ }, (args) => ({
      path: require.resolve(args.path),
    }));
    buildContext.onResolve({ filter: /^protobufjs$/ }, () => ({
      path: require.resolve('protobufjs'),
    }));
    buildContext.onResolve({ filter: /^(?:\.\.?\/)+(?:runtime_loader|worker_bridge)\.js$/ }, (args) => ({
      path: `../${path.basename(args.path)}`,
      external: true,
    }));
  },
};

async function bundleBrowserEntry() {
  for (const entryName of publicEntryNames) {
    await build({
      entryPoints: [path.join(sourceDir, `${entryName}.ts`)],
      outfile: path.join(outDir, `${entryName}.js`),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      define: {
        __ORTOOLS_WASM_BROWSER_BUILD__: 'true',
      },
      minifySyntax: true,
      sourcemap: false,
      plugins: [externalRuntimeLoaderPlugin],
    });
  }
}

async function bundleSolverWorkers() {
  for (const solver of ['cp_sat', 'knapsack']) {
    await build({
      entryPoints: [path.join(sourceDir, `${solver}/worker.ts`)],
      outfile: path.join(outDir, `${solver}/worker.js`),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      define: {
        __ORTOOLS_WASM_BROWSER_BUILD__: 'true',
      },
      minifySyntax: true,
      sourcemap: false,
      plugins: [externalWorkerRuntimeLoaderPlugin],
    });
  }
}

async function patchBundledSolverWorkerUrls() {
  for (const entryName of ['cp-sat', 'rcpsp']) {
    const entryPath = path.join(outDir, `${entryName}.js`);
    const source = await readFile(entryPath, 'utf8');
    const patchedSource = source
      .replaceAll(
        'new URL("./worker.js", import.meta.url)',
        'new URL("./cp_sat/worker.js", import.meta.url)',
      )
      .replaceAll('#internal-wasm/', '../wasm/')
      .replaceAll('?no-inline', '');
    if (patchedSource !== source) {
      await writeFile(entryPath, patchedSource);
    }
  }
  const knapsackPath = path.join(outDir, 'knapsack.js');
  const knapsackSource = await readFile(knapsackPath, 'utf8');
  await writeFile(knapsackPath, knapsackSource
    .replaceAll('new URL("./worker.js", import.meta.url)', 'new URL("./knapsack/worker.js", import.meta.url)')
    .replaceAll('#internal-wasm/', '../wasm/')
    .replaceAll('?no-inline', ''));
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for await (const sourcePath of listTypeScriptFiles(sourceDir)) {
  await transpileSource(sourcePath);
}

await bundleBrowserEntry();
await bundleSolverWorkers();
await patchBundledSolverWorkerUrls();

try {
  for await (const declarationPath of listDeclarationFiles(path.join(packageBuildDir, 'lib'))) {
    const declaration = await readFile(declarationPath, 'utf8');
    const patchedDeclaration = declaration
      .replaceAll('../../build/javascript/wasm/', '../wasm/')
      .replaceAll('../../../../package/node_modules/@bufbuild/protobuf/dist/esm/index.js', '@bufbuild/protobuf')
      .replaceAll('../../../../package/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js', '@bufbuild/protobuf/codegenv2');
    if (patchedDeclaration !== declaration) {
      await writeFile(declarationPath, patchedDeclaration);
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
