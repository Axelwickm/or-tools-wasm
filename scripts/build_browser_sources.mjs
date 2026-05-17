import { mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, transform } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(rootDir, 'javascript/lib');
const outDir = path.join(rootDir, 'build/javascript/browser');

async function* listTypeScriptFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* listTypeScriptFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
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
    buildContext.onResolve({ filter: /^\.\/(?:cp_sat_module_loader|runtime_loader)\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

async function bundleBrowserEntry() {
  await build({
    entryPoints: [path.join(sourceDir, 'index.ts')],
    outfile: path.join(outDir, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    sourcemap: false,
    plugins: [externalRuntimeLoaderPlugin],
  });
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for await (const sourcePath of listTypeScriptFiles(sourceDir)) {
  await transpileSource(sourcePath);
}

await bundleBrowserEntry();

const declarationPath = path.join(rootDir, 'build/javascript/lib/index.d.ts');
try {
  const declaration = await readFile(declarationPath, 'utf8');
  await writeFile(
    declarationPath,
    declaration.replaceAll('../../build/javascript/wasm/', '../wasm/'),
  );
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
