import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const fixtureName = process.argv[2];

if (!fixtureName) {
  console.error('Usage: node tests/fixtures/install-packed-package.mjs <fixture-name>');
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(repoRoot, 'tests/fixtures', fixtureName);
const packageRoot = path.join(repoRoot, 'javascript');
const packageDir = path.join(packageRoot, 'build/javascript/lib');
const stableTarballPath = path.join(packageDir, 'or-tools-wasm-local.tgz');
const npmCacheDir = path.join(repoRoot, '.npm-cache');

function packCurrentPackage() {
  if (process.env.ORTOOLS_WASM_SKIP_PACKAGE_BUILD === '1') {
    console.log('Using the existing packed JS build.');
    return;
  }
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
    throw new Error(`Package packing failed with exit code ${pack.status ?? 1}.`);
  }
}

async function findPackedTarballs() {
  const entries = await readdir(packageDir).catch(() => {
    console.error(`No package directory found at ${packageDir}. Run npm run pack:lib first.`);
    throw new Error('Packed package directory is missing.');
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

async function installTarball(tarballPath, directory, fingerprint) {
  const marker = path.join(directory, 'node_modules/or-tools-wasm/.fixture-artifact-sha256');
  if (await readFile(marker, 'utf8').catch(() => '') === fingerprint) {
    console.log(`Already installed this packed artifact in ${directory}`);
    return;
  }
  await rm(path.join(directory, 'node_modules/or-tools-wasm'), {
    force: true,
    recursive: true,
  });
  const install = spawnSync(
    'npm',
    [
      'install',
      tarballPath,
      '--force',
      '--no-save',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--install-strategy=nested',
    ],
    {
      cwd: directory,
      stdio: 'inherit',
      env: {
        ...process.env,
        NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? npmCacheDir,
      },
    },
  );
  if (install.status !== 0) {
    throw new Error(`Fixture installation failed with exit code ${install.status ?? 1}.`);
  }
  await writeFile(marker, fingerprint);
}

// Packing and the shared tests installation must finish before another fixture
// changes the same artifact or node_modules tree.
const lockPath = path.join(repoRoot, 'tests/.fixture-package-install.lock');
let ownsLock = false;
function releaseLock() {
  if (!ownsLock) return;
  ownsLock = false;
  rmSync(lockPath, { recursive: true, force: true });
}
process.once('exit', releaseLock);
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));
const deadline = Date.now() + 10 * 60_000;
while (true) {
  try {
    await mkdir(lockPath);
    ownsLock = true;
    break;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for fixture installation lock: ${lockPath}. Remove it if its installer was interrupted.`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

try {
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
      throw new Error(`Package packing failed with exit code ${pack.status ?? 1}.`);
    }
    tarballs = await findPackedTarballs();
  }

  const tarball = tarballs[0];
  const tarballPath = tarball.path;
  await copyFile(tarballPath, stableTarballPath);
  console.log(`Installing ${tarballPath} into ${fixtureDir}`);
  const fingerprint = createHash('sha256').update(await readFile(tarballPath)).digest('hex');
  await installTarball(tarballPath, fixtureDir, fingerprint);
  // Shared cases resolve public types from the same artifact, not repository sources.
  await installTarball(tarballPath, path.join(repoRoot, 'tests'), fingerprint);

} finally {
  releaseLock();
}
