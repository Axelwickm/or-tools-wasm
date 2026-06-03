import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const packageDir = path.join(repoRoot, 'package');
const releaseRef = process.argv[2]
  ?? (process.env.GITHUB_REF?.startsWith('refs/tags/v') ? process.env.GITHUB_REF_NAME : undefined);

const readmePath = path.join(repoRoot, 'README.md');

let readme = readFileSync(readmePath, 'utf8');

if (releaseRef) {
  const encodedReleaseRef = encodeURIComponent(releaseRef);
  const workflowUrl = `https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml?query=ref%3A${encodedReleaseRef}`;

  readme = readme.replace(
    'https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml/badge.svg',
    `https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml/badge.svg?branch=${encodedReleaseRef}`
  );

  readme = readme.replaceAll(
    'https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?',
    `https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/${encodedReleaseRef}?`
  );

  readme = readme.replaceAll(
    'https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)',
    `${workflowUrl})`
  );
}

mkdirSync(packageDir, { recursive: true });
writeFileSync(path.join(packageDir, 'README.md'), readme);
copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(packageDir, 'LICENSE'));
