import assert from 'node:assert/strict';
import test from 'node:test';
import { patchJspiAsyncCtors } from '../../scripts/patch_jspi_ctors.ts';

for (const tail of ['', ';FS.ignorePermissions=false']) {
  test(`JSPI constructor patch handles tail ${JSON.stringify(tail)} idempotently`, () => {
    const source = `WebAssembly.promising;function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return;wasmExports["__wasm_call_ctors"]()${tail}}async function run(){initRuntime();postRun()}`;
    const patched = patchJspiAsyncCtors(source);
    assert.ok(patched.includes('async function initRuntime()'));
    assert.ok(patched.includes('await wasmExports["__wasm_call_ctors"]();'));
    assert.ok(patched.includes('await initRuntime();postRun()'));
    assert.equal(patchJspiAsyncCtors(patched), patched);
    assert.equal(patchJspiAsyncCtors(source.replace('WebAssembly.promising', 'Asyncify')), source.replace('WebAssembly.promising', 'Asyncify'));
  });
}
