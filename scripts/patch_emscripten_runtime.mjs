import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const wasmDir = path.join(repoRoot, 'build/javascript/wasm');
const runtimeFiles = ['cp_sat_runtime.js', 'cp_sat_runtime_asyncify.js'];

const patches = [
  {
    name: 'deno-runtime-detection',
    prelude: `
var __orToolsWasmDeno = typeof Deno !== "undefined";
if (__orToolsWasmDeno) {
  globalThis.self ??= globalThis;
  globalThis.WorkerGlobalScope ??= class WorkerGlobalScope {};
}
`,
    replacements: [
      [
        [
          '  globalThis.window ??= globalThis;\n  globalThis.self ??= globalThis;\n  globalThis.WorkerGlobalScope ??= class WorkerGlobalScope {};',
          '  globalThis.self ??= globalThis;\n  globalThis.WorkerGlobalScope ??= class WorkerGlobalScope {};\n  globalThis.navigator ??= { hardwareConcurrency: 1 };',
        ],
        '  globalThis.self ??= globalThis;\n  globalThis.WorkerGlobalScope ??= class WorkerGlobalScope {};',
      ],
      [
        'var currentNodeVersion=typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
        'var currentNodeVersion=typeof Deno==="undefined"&&typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;',
      ],
      [
        [
          'var ENVIRONMENT_IS_WEB=!!globalThis.window;',
          'var ENVIRONMENT_IS_WEB=!!globalThis.window||__orToolsWasmDeno;',
        ],
        'var ENVIRONMENT_IS_WEB=!!globalThis.window&&!__orToolsWasmDeno;',
      ],
      [
        'var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";',
        'var ENVIRONMENT_IS_NODE=!__orToolsWasmDeno&&globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";',
      ],
      [
        [
          '__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,65536,false)',
          '__emscripten_thread_init(tb,__orToolsWasmDeno||!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,65536,false)',
        ],
        '__emscripten_thread_init(tb,__orToolsWasmDeno||!ENVIRONMENT_IS_WORKER,1,__orToolsWasmDeno?false:!ENVIRONMENT_IS_WEB,65536,false)',
      ],
      [
        [
          'function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;var e=new WebAssembly.RuntimeError(what);readyPromiseReject?.(e);throw e}',
          'function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;if(what.indexOf("RuntimeError: unreachable")>=0){what+=\'. "unreachable" may be due to ASYNCIFY_STACK_SIZE not being large enough (try increasing it)\'}var e=new WebAssembly.RuntimeError(what);readyPromiseReject?.(e);throw e}',
          'function abort(what){if(String(what).includes("emscripten_is_main_browser_thread"))return;Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;var e=new WebAssembly.RuntimeError(what);readyPromiseReject?.(e);throw e}',
        ],
        'function abort(what){if(String(what).includes("emscripten_is_main_browser_thread"))return;Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;var e=new WebAssembly.RuntimeError(what);readyPromiseReject?.(e);throw e}',
      ],
      [
        [
          'var ___assert_fail=(condition,filename,line,func)=>abort(`Assertion failed: ${UTF8ToString(condition)}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,func?UTF8ToString(func):"unknown function"]);',
          'var ___assert_fail=(condition,filename,line,func)=>{var conditionText=UTF8ToString(condition);var funcText=func?UTF8ToString(func):"unknown function";if(__orToolsWasmDeno&&conditionText==="emscripten_is_main_browser_thread()"&&funcText==="futex_wait_main_browser_thread")return;abort(`Assertion failed: ${conditionText}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,funcText])};',
          'var ___assert_fail=(condition,filename,line,func)=>{var conditionText=UTF8ToString(condition);var funcText=func?UTF8ToString(func):"unknown function";if(__orToolsWasmDeno&&conditionText==="emscripten_is_main_browser_thread()")return;abort(`Assertion failed: ${conditionText}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,funcText])};',
          'var ___assert_fail=(condition,filename,line,func)=>{var conditionText=UTF8ToString(condition);var funcText=func?UTF8ToString(func):"unknown function";if(__orToolsWasmDeno&&conditionText.includes("emscripten_is_main_browser_thread"))return;abort(`Assertion failed: ${conditionText}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,funcText])};',
          'var ___assert_fail=(condition,filename,line,func)=>{var conditionText=UTF8ToString(condition);var funcText=func?UTF8ToString(func):"unknown function";if(typeof Deno!=="undefined"&&conditionText.includes("emscripten_is_main_browser_thread"))return;abort(`Assertion failed: ${conditionText}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,funcText])};',
        ],
        'var ___assert_fail=(condition,filename,line,func)=>{var conditionText=UTF8ToString(condition);var funcText=func?UTF8ToString(func):"unknown function";if(conditionText.includes("emscripten_is_main_browser_thread"))return;abort(`Assertion failed: ${conditionText}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,funcText])};',
      ],
    ],
  },
];

function applyPatch(code, patch) {
  let patched = code;
  const preludeMarker = patch.prelude.trim().split('\n')[0];
  if (!patched.includes(preludeMarker)) {
    patched = `${patch.prelude}\n${patched}`;
  }
  for (const [from, to] of patch.replacements) {
    const alternatives = Array.isArray(from) ? from : [from];
    const found = alternatives.find((snippet) => patched.includes(snippet));
    if (!found && !patched.includes(to)) {
      throw new Error(`Could not find Emscripten snippet for ${patch.name}: ${alternatives[0]}`);
    }
    if (found) {
      patched = patched.replace(found, to);
    }
  }
  return patched;
}

for (const fileName of runtimeFiles) {
  const filePath = path.join(wasmDir, fileName);
  const original = await readFile(filePath, 'utf8');
  const patched = patches.reduce((code, patch) => applyPatch(code, patch), original);
  if (patched !== original) {
    await writeFile(filePath, patched);
    console.log(`Patched ${fileName}: ${patches.map((patch) => patch.name).join(', ')}`);
  }
}
