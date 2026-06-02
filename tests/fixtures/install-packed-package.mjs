import { copyFile, readdir, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const fixtureName = process.argv[2];

if (!fixtureName) {
  console.error('Usage: node tests/fixtures/install-packed-package.mjs <fixture-name>');
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(repoRoot, 'tests/fixtures', fixtureName);
const packageDir = path.join(repoRoot, 'build/javascript/lib');
const stableTarballPath = path.join(packageDir, 'or-tools-wasm-local.tgz');

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

let tarballs = await findPackedTarballs();

if (!tarballs.length) {
  console.log(`No packed package found in ${packageDir}. Packing current build.`);
  const pack = spawnSync('npm', ['pack', '--pack-destination', packageDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (pack.status !== 0) {
    process.exit(pack.status ?? 1);
  }
  tarballs = await findPackedTarballs();
}

const tarball = tarballs[0];
const tarballPath = tarball.path;
await copyFile(tarballPath, stableTarballPath);
console.log(`Installing ${stableTarballPath} into ${fixtureDir}`);

const install = spawn('npm', ['install', stableTarballPath, '--force', '--no-audit', '--no-fund', '--no-package-lock'], {
  cwd: fixtureDir,
  stdio: 'inherit',
});

install.on('exit', (code) => {
  process.exit(code ?? 1);
});
