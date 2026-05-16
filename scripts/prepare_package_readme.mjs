import { readFileSync, writeFileSync } from 'node:fs';

const releaseRef = process.argv[2];

if (!releaseRef) {
  throw new Error('Usage: node scripts/prepare_package_readme.mjs <release-ref>');
}

const encodedReleaseRef = encodeURIComponent(releaseRef);
const workflowUrl = `https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml?query=ref%3A${encodedReleaseRef}`;
const readmePath = 'README.md';

let readme = readFileSync(readmePath, 'utf8');

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

writeFileSync(readmePath, readme);
