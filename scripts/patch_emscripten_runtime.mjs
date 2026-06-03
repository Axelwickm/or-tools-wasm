import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const packageBuildRoot = path.join(repoRoot, 'package/build/javascript');
const runtimeNames = [
  'cp_sat_runtime',
  'cp_sat_runtime_asyncify',
  'routing_runtime',
  'routing_runtime_asyncify',
  'mp_solver_runtime',
  'mp_solver_runtime_asyncify',
  'mathopt_runtime',
  'mathopt_runtime_asyncify',
  'pdlp_runtime',
  'pdlp_runtime_asyncify',
  'graph_runtime',
  'graph_runtime_asyncify',
  'set_cover_runtime',
  'set_cover_runtime_asyncify',
];
const nodeRuntimePaths = [
  path.join(packageBuildRoot, 'node-wasm/cp_sat_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/cp_sat_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/routing_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/routing_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/mp_solver_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/mp_solver_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/mathopt_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/mathopt_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/pdlp_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/pdlp_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/graph_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/graph_runtime_node_asyncify.js'),
  path.join(packageBuildRoot, 'node-wasm/set_cover_runtime_node.js'),
  path.join(packageBuildRoot, 'node-wasm/set_cover_runtime_node_asyncify.js'),
];
const webRuntimePaths = runtimeNames.map((runtimeName) =>
  path.join(packageBuildRoot, `wasm/${runtimeName}.js`)
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
  if (!(await exists(nodeRuntimePath))) continue;
  let runtime = await readFile(nodeRuntimePath, 'utf8');
  const original = runtime;

  for (const [from, to] of replacements) {
    runtime = runtime.replaceAll(from, to);
  }
  runtime = patchJspiAsyncCtors(runtime);
  runtime = patchJspiInvokeTableEntries(runtime);

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
  if (!(await exists(webRuntimePath))) continue;
  let runtime = await readFile(webRuntimePath, 'utf8');
  const original = runtime;

  for (const [from, to] of webRuntimeReplacements) {
    runtime = runtime.replaceAll(from, to);
  }
  runtime = runtime.replace(/(?:worker\.unref\?\.\(\);)+worker\.workerID/g, 'worker.unref?.();worker.workerID');
  runtime = patchJspiAsyncCtors(runtime);
  runtime = patchJspiInvokeTableEntries(runtime);

  if (runtime !== original) {
    await writeFile(webRuntimePath, runtime);
    console.log(`Patched ${path.basename(webRuntimePath)}: deno-bun-web-worker-runtime`);
  }
}

function patchJspiAsyncCtors(runtime) {
  if (!runtime.includes('WebAssembly.promising')) return runtime;

  const initRuntime =
    'function initRuntime(){assert(!runtimeInitialized);runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();checkStackCookie();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}';
  const asyncInitRuntime =
    'async function initRuntime(){assert(!runtimeInitialized);runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();checkStackCookie();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();await wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}';

  return runtime
    .replace(initRuntime, asyncInitRuntime)
    .replaceAll('initRuntime();readyPromiseResolve?.(Module);', 'await initRuntime();readyPromiseResolve?.(Module);');
}

function patchJspiInvokeTableEntries(runtime) {
  if (!runtime.includes('WebAssembly.promising')) return runtime;

  const tableEntryHelper =
    'var wasmTableMirror=[];var getWasmTableEntry=funcPtr=>{var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(funcPtr);if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};';
  const patchedTableEntryHelper =
    `${tableEntryHelper}var wasmTablePromisingMirror=[];var getWasmTableEntryPromising=funcPtr=>{var func=wasmTablePromisingMirror[funcPtr];if(!func){wasmTablePromisingMirror[funcPtr]=func=Asyncify.makeAsyncFunction(wasmTable.get(funcPtr))}return func};`;

  if (!runtime.includes(tableEntryHelper)) return runtime;
  return runtime
    .replace(tableEntryHelper, patchedTableEntryHelper)
    .replaceAll('function invoke_', 'async function invoke_')
    .replaceAll('return getWasmTableEntry(index)', 'return await getWasmTableEntryPromising(index)')
    .replaceAll('try{getWasmTableEntry(index)', 'try{await getWasmTableEntryPromising(index)')
    .replaceAll('return getWasmTableEntryPromising(index)', 'return await getWasmTableEntryPromising(index)')
    .replaceAll('try{getWasmTableEntryPromising(index)', 'try{await getWasmTableEntryPromising(index)')
    .replaceAll('async async function invoke_', 'async function invoke_')
    .replaceAll('await await getWasmTableEntryPromising(index)', 'await getWasmTableEntryPromising(index)');
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
