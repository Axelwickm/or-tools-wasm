import { copyFile, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const fixtureName = process.argv[2];

if (!fixtureName) {
  console.error('Usage: node tests/fixtures/install-packed-package.mjs <fixture-name>');
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(repoRoot, 'tests/fixtures', fixtureName);
const packageRoot = path.join(repoRoot, 'package');
const packageDir = path.join(packageRoot, 'build/javascript/lib');
const stableTarballPath = path.join(packageDir, 'or-tools-wasm-local.tgz');
const npmCacheDir = path.join(repoRoot, '.npm-cache');
const nodeModulesDir = path.join(fixtureDir, 'node_modules');
const installedPackageDir = path.join(nodeModulesDir, 'or-tools-wasm');

function packCurrentPackage() {
  console.log('Packing current JS build.');
  const pack = spawnSync('npm', ['run', 'pack:js'], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? npmCacheDir,
    },
  });
  if (pack.status !== 0) {
    process.exit(pack.status ?? 1);
  }
}

async function findPackedTarballs() {
  const entries = await readdir(packageDir).catch(() => {
    console.error(`No package directory found at ${packageDir}. Run npm run pack:lib first.`);
    process.exit(1);
  });

  const tarballs = await Promise.all(
    entries
      .filter((entry) => /^or-tools-wasm-\d.*\.tgz$/.test(entry))
      .map(async (entry) => {
        const tarballPath = path.join(packageDir, entry);
        return {
          path: tarballPath,
          mtimeMs: (await stat(tarballPath)).mtimeMs,
        };
      }),
  );

  return tarballs.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function installTarball(tarballPath) {
  await mkdir(nodeModulesDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(nodeModulesDir, '.or-tools-wasm-'));
  const extract = spawnSync('tar', ['-xzf', tarballPath, '-C', tempDir], {
    cwd: fixtureDir,
    stdio: 'inherit',
  });
  if (extract.status !== 0) {
    await rm(tempDir, { recursive: true, force: true });
    process.exit(extract.status ?? 1);
  }

  await rm(installedPackageDir, { recursive: true, force: true });
  await rename(path.join(tempDir, 'package'), installedPackageDir);
  await rm(tempDir, { recursive: true, force: true });
}

packCurrentPackage();

let tarballs = await findPackedTarballs();

if (!tarballs.length) {
  console.log(`No packed package found in ${packageDir}. Packing current build.`);
  const pack = spawnSync('npm', ['pack', '--pack-destination', packageDir], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? npmCacheDir,
    },
  });
  if (pack.status !== 0) {
    process.exit(pack.status ?? 1);
  }
  tarballs = await findPackedTarballs();
}

const tarball = tarballs[0];
const tarballPath = tarball.path;
await copyFile(tarballPath, stableTarballPath);
console.log(`Installing ${stableTarballPath} into ${installedPackageDir}`);
await installTarball(stableTarballPath);
