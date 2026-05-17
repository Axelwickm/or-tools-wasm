import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const runtimeNames = [
  'cp_sat_runtime',
  'cp_sat_runtime_asyncify',
  'routing_runtime',
  'routing_runtime_asyncify',
  'mp_solver_runtime',
  'mp_solver_runtime_asyncify',
  'mathopt_runtime',
  'mathopt_runtime_asyncify',
];
const nodeRuntimePaths = [
  path.join(repoRoot, 'build/javascript/node-wasm/cp_sat_runtime_node.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/cp_sat_runtime_node_asyncify.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/routing_runtime_node.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/routing_runtime_node_asyncify.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/mp_solver_runtime_node.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/mp_solver_runtime_node_asyncify.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/mathopt_runtime_node.js'),
  path.join(repoRoot, 'build/javascript/node-wasm/mathopt_runtime_node_asyncify.js'),
];
const webRuntimePaths = runtimeNames.map((runtimeName) =>
  path.join(repoRoot, `build/javascript/wasm/${runtimeName}.js`)
);

const replacements = [
  ['import("module")', 'import("node:module")'],
  ['import("worker_threads")', 'import("node:worker_threads")'],
  ['require("worker_threads")', 'require("node:worker_threads")'],
  ['require("fs")', 'require("node:fs")'],
  ['require("path")', 'require("node:path")'],
  ['require("url")', 'require("node:url")'],
  ['require("util")', 'require("node:util")'],
  [
    'postMessage:msg=>parentPort["postMessage"](msg)',
    'postMessage:msg=>parentPort["postMessage"].call(parentPort,msg)',
  ],
  [
    'parentPort.on("message",msg=>global.onmessage?.({data:msg}));Object.assign(globalThis,{self:global,postMessage:msg=>parentPort["postMessage"].call(parentPort,msg)});',
    'parentPort.on("message",msg=>global.onmessage?.({data:msg}));Object.assign(globalThis,{self:global});globalThis.postMessage??=(msg=>parentPort["postMessage"].call(parentPort,msg));',
  ],
  [
    'if(cmd==="load"){workerID=msgData.workerID;',
    'if(cmd==="load"){if(runtimeInitialized){postMessage({cmd:"loaded"});return}workerID=msgData.workerID;',
  ],
];

for (const nodeRuntimePath of nodeRuntimePaths) {
  let runtime = await readFile(nodeRuntimePath, 'utf8');
  const original = runtime;

  for (const [from, to] of replacements) {
    runtime = runtime.replaceAll(from, to);
  }

  if (runtime !== original) {
    await writeFile(nodeRuntimePath, runtime);
    console.log(`Patched ${path.basename(nodeRuntimePath)}: node-runtime-compatibility`);
  }
}

const webRuntimeReplacements = [
  [
    'var currentNodeVersion=typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
    'var currentNodeVersion=globalThis.__ORTOOLS_WASM_PTHREAD!==true&&typeof Deno==="undefined"&&typeof Bun==="undefined"&&typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
  ],
  [
    'var currentNodeVersion=typeof Deno==="undefined"&&typeof Bun==="undefined"&&typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
    'var currentNodeVersion=globalThis.__ORTOOLS_WASM_PTHREAD!==true&&typeof Deno==="undefined"&&typeof Bun==="undefined"&&typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
  ],
  [
    'var Module=moduleArg;var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&self.name?.startsWith("em-pthread");',
    'var Module=moduleArg;var ORTOOLS_WASM_WEB_HOST=typeof Deno!=="undefined"||typeof Bun!=="undefined";var ORTOOLS_WASM_PTHREAD_URL=typeof import.meta.url==="string"&&import.meta.url.includes("?em-pthread=");var ORTOOLS_WASM_PTHREAD_MARKER=globalThis.__ORTOOLS_WASM_PTHREAD===true;if(ORTOOLS_WASM_WEB_HOST&&!globalThis.window&&!ORTOOLS_WASM_PTHREAD_URL&&!ORTOOLS_WASM_PTHREAD_MARKER)globalThis.window=globalThis;var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope||ORTOOLS_WASM_PTHREAD_URL||ORTOOLS_WASM_PTHREAD_MARKER;var ENVIRONMENT_IS_NODE=!ORTOOLS_WASM_WEB_HOST&&globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&(ORTOOLS_WASM_PTHREAD_URL||ORTOOLS_WASM_PTHREAD_MARKER||self.name?.startsWith("em-pthread"));',
  ],
  [
    'if(!(globalThis.window||globalThis.WorkerGlobalScope))throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");',
    'if(!(globalThis.window||globalThis.WorkerGlobalScope||ORTOOLS_WASM_PTHREAD_MARKER))throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");',
  ],
  [
    'var Module=moduleArg;var ORTOOLS_WASM_WEB_HOST=typeof Deno!=="undefined"||typeof Bun!=="undefined";var ORTOOLS_WASM_PTHREAD_URL=typeof import.meta.url==="string"&&import.meta.url.includes("?em-pthread=");if(ORTOOLS_WASM_WEB_HOST&&!globalThis.window&&!ORTOOLS_WASM_PTHREAD_URL)globalThis.window=globalThis;var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope||ORTOOLS_WASM_PTHREAD_URL;var ENVIRONMENT_IS_NODE=!ORTOOLS_WASM_WEB_HOST&&globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&(ORTOOLS_WASM_PTHREAD_URL||self.name?.startsWith("em-pthread"));',
    'var Module=moduleArg;var ORTOOLS_WASM_WEB_HOST=typeof Deno!=="undefined"||typeof Bun!=="undefined";var ORTOOLS_WASM_PTHREAD_URL=typeof import.meta.url==="string"&&import.meta.url.includes("?em-pthread=");var ORTOOLS_WASM_PTHREAD_MARKER=globalThis.__ORTOOLS_WASM_PTHREAD===true;if(ORTOOLS_WASM_WEB_HOST&&!globalThis.window&&!ORTOOLS_WASM_PTHREAD_URL&&!ORTOOLS_WASM_PTHREAD_MARKER)globalThis.window=globalThis;var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope||ORTOOLS_WASM_PTHREAD_URL||ORTOOLS_WASM_PTHREAD_MARKER;var ENVIRONMENT_IS_NODE=!ORTOOLS_WASM_WEB_HOST&&globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&(ORTOOLS_WASM_PTHREAD_URL||ORTOOLS_WASM_PTHREAD_MARKER||self.name?.startsWith("em-pthread"));',
  ],
  [
    'worker.workerID=PThread.nextWorkerID++;PThread.unusedWorkers.push(worker)',
    'worker.unref?.();worker.workerID=PThread.nextWorkerID++;PThread.unusedWorkers.push(worker)',
  ],
  [
    'PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;',
    'Module["PThread"]=PThread;PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;',
  ],
  [
    'var isPthread=globalThis.self?.name?.startsWith("em-pthread");isPthread&&cpSatModule();',
    'var isPthread=globalThis.self?.name?.startsWith("em-pthread")||import.meta.url.includes("?em-pthread=")||globalThis.__ORTOOLS_WASM_PTHREAD===true;isPthread&&cpSatModule();',
  ],
  [
    'var isPthread=globalThis.self?.name?.startsWith("em-pthread")||import.meta.url.includes("?em-pthread=");isPthread&&cpSatModule();',
    'var isPthread=globalThis.self?.name?.startsWith("em-pthread")||import.meta.url.includes("?em-pthread=")||globalThis.__ORTOOLS_WASM_PTHREAD===true;isPthread&&cpSatModule();',
  ],
];

for (const runtimeName of runtimeNames) {
  const runtimeFileName = `${runtimeName}.js`;
  const workerExpression =
    `(typeof Bun!=="undefined"?new Worker(URL.createObjectURL(new Blob(["globalThis.__ORTOOLS_WASM_PTHREAD=true;import("+JSON.stringify(new URL("${runtimeFileName}",import.meta.url).href)+");"],{type:"text/javascript"})),{type:"module",name:"em-pthread-"+PThread.nextWorkerID}):new Worker(new URL("${runtimeFileName}"+"?em-pthread="+PThread.nextWorkerID,import.meta.url),{type:"module",name:"em-pthread-"+PThread.nextWorkerID}))`;
  webRuntimeReplacements.push(
    [
      `new Worker(new URL("${runtimeFileName}",import.meta.url),{type:"module",name:"em-pthread-"+PThread.nextWorkerID})`,
      workerExpression,
    ],
    [
      `new Worker(new URL("${runtimeFileName}?em-pthread="+PThread.nextWorkerID,import.meta.url),{type:"module",name:"em-pthread-"+PThread.nextWorkerID})`,
      workerExpression,
    ],
  );
}

for (const webRuntimePath of webRuntimePaths) {
  let runtime = await readFile(webRuntimePath, 'utf8');
  const original = runtime;

  for (const [from, to] of webRuntimeReplacements) {
    runtime = runtime.replaceAll(from, to);
  }
  runtime = runtime.replace(/(?:worker\.unref\?\.\(\);)+worker\.workerID/g, 'worker.unref?.();worker.workerID');

  if (runtime !== original) {
    await writeFile(webRuntimePath, runtime);
    console.log(`Patched ${path.basename(webRuntimePath)}: deno-bun-web-worker-runtime`);
  }
}
