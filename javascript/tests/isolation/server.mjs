import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../build/javascript');
for (const [port, isolated] of [[4186, false], [4187, true]]) {
  http.createServer(async (req, res) => {
    if (isolated) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    const url = new URL(req.url, 'http://localhost');
    const asyncify = url.pathname.startsWith('/asyncify/');
    const file = url.pathname.replace(/^\/(asyncify|jspi)\//, '');
    if (file === '' || file === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Browser isolation tests</title>'); return;
    }
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      let bytes = await readFile(resolved);
      res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      if (asyncify && (file.endsWith('runtime_loader_core.js') || file.endsWith('/worker.js'))) {
        bytes = Buffer.concat([Buffer.from('Object.defineProperty(WebAssembly,"promising",{value:undefined,configurable:true});\n'), bytes]);
      }
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  }).listen(port, '127.0.0.1');
}
