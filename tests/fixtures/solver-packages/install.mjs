import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Repacked tarballs keep their version and filename during development. Do not
// let npm reuse a previous installation when testing newly assembled artifacts.
await rm(path.join(import.meta.dirname, 'node_modules/@or-tools-wasm'), { recursive: true, force: true });
await rm(path.join(import.meta.dirname, 'node_modules/.package-lock.json'), { force: true });
const result = spawnSync('npm', ['install', '--package-lock=false'], { cwd: import.meta.dirname, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
