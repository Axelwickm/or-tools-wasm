// Solver-independent JSPI/pthread stress reproduction. See webkit-jspi-pthreads.txt.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const browserName = process.env.REPRO_BROWSER ?? 'webkit';
const flavor = process.env.REPRO_FLAVOR ?? 'jspi';
assert.ok(['jspi', 'asyncify'].includes(flavor));
const { [browserName]: browserType } = await import(pathToFileURL(path.join(root, 'javascript/node_modules/playwright-core/index.mjs')).href);
assert.ok(browserType, `Unknown browser: ${browserName}`);
const directory = await mkdtemp(path.join(tmpdir(), 'ortools-pthread-repro-'));
let server, browser;
try {
  execFileSync(path.join(root, 'emsdk/upstream/emscripten/em++'), [
    fileURLToPath(new URL('./webkit-jspi-pthreads.cpp', import.meta.url)),
    '-O2', '-pthread', '--no-entry',
    ...(process.env.REPRO_ASSERTIONS === '1' ? ['-sASSERTIONS=1'] : []),
    ...(flavor === 'jspi' ? ['-sJSPI=1', '-sJSPI_EXPORTS=work'] : ['-sASYNCIFY=1']),
    '-sEXPORTED_FUNCTIONS=_work', '-sEXPORTED_RUNTIME_METHODS=ccall,PThread',
    '-sPTHREAD_POOL_SIZE=8', '-sPTHREAD_POOL_SIZE_STRICT=2',
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker',
    '-o', path.join(directory, 'repro.js'),
  ], { stdio: 'inherit', env: { ...process.env, EM_CACHE: process.env.EM_CACHE ?? path.join(directory, 'cache') } });
  if (process.env.REPRO_KEEPALIVE === '1' || process.env.REPRO_FORCE_MAILBOX === '1') {
    assert.equal(flavor, 'jspi');
    const filename = path.join(directory, 'repro.js');
    let source = await readFile(filename, 'utf8');
    const entry = 'var result=WebAssembly.promising(getWasmTableEntry(ptr))(arg);';
    assert.ok(source.includes(entry), 'Pthread entry implementation changed');
    const prefix = (process.env.REPRO_FORCE_MAILBOX === '1' ? 'queueMicrotask(checkMailbox);' : '')
      + (process.env.REPRO_KEEPALIVE === '1' ? 'runtimeKeepalivePush();' : '');
    source = source.replace(entry, prefix + entry);
    if (process.env.REPRO_KEEPALIVE === '1') {
      assert.ok(source.includes('result=await result;finish(result)'));
      source = source.replace('result=await result;finish(result)',
        'try{result=await result}finally{runtimeKeepalivePop()}finish(result)');
    }
    await writeFile(filename, source);
  }
  if (process.env.REPRO_PRODUCTION_PATCH === '1') {
    const { patchJspiPthreadEntry } = await import('../patch_jspi_pthread_entry.ts');
    const filename = path.join(directory, 'repro.js');
    await writeFile(filename, patchJspiPthreadEntry(await readFile(filename, 'utf8')));
  }
  // Diagnostic control only: retain JSPI, use Emscripten's mailbox fallback.
  if (process.env.REPRO_NO_WAITASYNC === '1') {
    const filename = path.join(directory, 'repro.js');
    const source = await readFile(filename, 'utf8');
    assert.ok(source.includes('var waitAsyncPolyfilled='), 'Mailbox implementation changed');
    await writeFile(filename, source.replace('var waitAsyncPolyfilled=', 'var waitAsyncPolyfilled=true||'));
  }
  server = createServer((request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cache-Control', 'no-store');
    const filename = new URL(request.url, 'http://localhost').pathname;
    if (filename === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<html></html>'); return; }
    if (!['/repro.js', '/repro.wasm'].includes(filename)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', filename.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    createReadStream(path.join(directory, filename.slice(1))).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await browserType.launch({ headless: true });
  console.log({ browser: browserName, version: browser.version(), flavor });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('console', message => {
    console.log(message.text());
    // This diagnostic deliberately joins on the page thread; debug builds warn.
    const expectedJoinWarning = message.text().startsWith('Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html');
    if (message.type() === 'error' && !expectedJoinWarning) browserErrors.push(message.text());
  });
  page.on('pageerror', error => { browserErrors.push(String(error)); console.error(error); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { default: createModule } = await import('/repro.js');
    const module = await createModule();
    try {
      for (let iteration = 0; iteration < 1000; iteration++) {
        console.log('pthread', iteration);
        if (await module.ccall('work', 'number', [], [], { async: true }) !== 4) throw new Error('Incorrect thread count');
      }
    } finally { module.PThread.terminateAllThreads(); }
  });
  // Let asynchronous worker error events arrive before declaring success.
  await page.waitForTimeout(100);
  assert.equal(browserErrors.length, 0, `Browser errors: ${browserErrors.slice(0, 3).join('\n')}`);
  console.log('PASS: 1000 iterations');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
