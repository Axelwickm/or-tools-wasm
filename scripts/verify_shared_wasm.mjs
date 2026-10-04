import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Ignore only the source-map URL, not arbitrary custom sections: code, data,
// imports, exports and all other metadata must match before sharing a binary.
export function withoutSourceMapUrl(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) {
    throw new Error('Invalid WASM header');
  }
  let offset = 8;
  const sections = [bytes.subarray(0, 8)];
  function readUnsigned(end) {
    let value = 0;
    for (let shift = 0; shift < 35 && offset < end; shift += 7) {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128) && value <= 0xffffffff) return value;
    }
    throw new Error('Invalid WASM section length');
  }
  while (offset < bytes.length) {
    const start = offset;
    const id = bytes[offset++];
    const length = readUnsigned(bytes.length);
    const end = offset + length;
    if (end > bytes.length) throw new Error('Truncated WASM section');
    let isSourceMap = false;
    if (id === 0) {
      const nameLength = readUnsigned(end);
      if (offset + nameLength > end) throw new Error('Truncated WASM custom section');
      isSourceMap = bytes.subarray(offset, offset + nameLength).toString() === 'sourceMappingURL';
    }
    if (!isSourceMap) sections.push(bytes.subarray(start, end));
    offset = end;
  }
  return Buffer.concat(sections);
}

export async function verifySharedWasm(packageBuildRoot) {
  const runtimes = ['cp_sat', 'routing', 'mp_solver', 'mathopt', 'pdlp', 'graph', 'set_cover'];
  for (const runtime of runtimes) {
    for (const suffix of ['', '_asyncify']) {
      const webName = `${runtime}_runtime${suffix}.wasm`;
      const nodeName = `${runtime}_runtime_node${suffix}.wasm`;
      const [web, node] = await Promise.all([
        readFile(path.join(packageBuildRoot, 'wasm', webName)),
        readFile(path.join(packageBuildRoot, 'node-wasm', nodeName)),
      ]);
      if (!withoutSourceMapUrl(web).equals(withoutSourceMapUrl(node))) {
        throw new Error(`Cannot share WASM: ${webName} differs from ${nodeName}`);
      }
    }
  }
  console.log('Verified all 14 shared browser/Node WASM binaries.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifySharedWasm(fileURLToPath(new URL('../javascript/build/javascript/', import.meta.url)));
}
