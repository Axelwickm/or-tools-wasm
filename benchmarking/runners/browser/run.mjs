#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, normalize, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, firefox } from 'playwright-core';

const HEADER = [
  'git_sha',
  'ortools_version',
  'implementation',
  'environment',
  'suite',
  'solver',
  'problem',
  'requested_threads',
  'run',
  'status',
  'objective',
  'execution_ms',
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

const BROWSER_TYPES = { chromium, firefox };
const BROWSER_NAME = process.env.BENCH_BROWSER ?? 'chromium';
const IMPLEMENTATION = process.env.BENCH_IMPLEMENTATION ?? `web-${BROWSER_NAME}`;
const ENVIRONMENT = process.env.BENCH_ENVIRONMENT ?? `${BROWSER_NAME}-headless-main-thread`;

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index++) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    args.set(key.slice(2), argv[index + 1]);
    index++;
  }
  return args;
}

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);

function gitSha() {
  if (process.env.BENCH_GIT_SHA) return process.env.BENCH_GIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function ortoolsVersion() {
  const text = await readFile(resolve(repoRoot, 'Version.txt'), 'utf8');
  const major = text.match(/^OR_TOOLS_MAJOR=(\d+)/m)?.[1] ?? 'unknown';
  const minor = text.match(/^OR_TOOLS_MINOR=(\d+)/m)?.[1] ?? 'unknown';
  return `${major}.${minor}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function startStaticServer(rootDir) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(url.pathname === '/' ? '/benchmarking/runners/browser/index.html' : url.pathname);
    const filePath = normalize(resolve(rootDir, `.${decodedPath}`));
    if (!filePath.startsWith(`${rootDir}${sep}`) && filePath !== rootDir) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream');

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) response.writeHead(404);
      response.end('Not found');
    });
    stream.pipe(response);
  });

  return new Promise((resolveServer, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Static server did not bind a TCP port.'));
        return;
      }
      resolveServer({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const configPath = resolve(args.get('config') ?? resolve(repoRoot, 'benchmarking/suites.json'));
  const outPath = args.get('out');
  if (!outPath) throw new Error('--out is required');

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const runs = Number(args.get('runs') ?? config.runs ?? 1);
  const warmupRuns = Number(args.get('warmup-runs') ?? config.warmupRuns ?? 1);
  const sha = gitSha();
  const version = await ortoolsVersion();
  const { server, baseUrl } = await startStaticServer(repoRoot);
  const browserType = BROWSER_TYPES[BROWSER_NAME];
  if (!browserType) {
    throw new Error(`Unsupported BENCH_BROWSER "${BROWSER_NAME}". Expected one of: ${Object.keys(BROWSER_TYPES).join(', ')}`);
  }
  const browser = await browserType.launch({
    headless: true,
    executablePath: process.env.BENCH_BROWSER_EXECUTABLE || undefined,
    args: BROWSER_NAME === 'chromium' ? ['--no-sandbox'] : [],
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => {
      console.error(`[browser pageerror] ${error.stack || error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (!text.includes('Blocking on the main thread is very dangerous')) {
          console.error(`[browser console] ${text}`);
        }
      }
    });
    await page.goto(`${baseUrl}/benchmarking/runners/browser/index.html`);
    const rows = await page.evaluate(async (options) => {
      const runner = await import('/benchmarking/runners/browser/page_runner.mjs');
      return await runner.runBenchmarks(options);
    }, { config, runs, warmupRuns, sha, version, implementation: IMPLEMENTATION, environment: ENVIRONMENT });

    const lines = [
      HEADER.join(','),
      ...rows.map((row) => HEADER.map((key) => csvEscape(row[key])).join(',')),
    ];
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${lines.join('\n')}\n`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

await main();
