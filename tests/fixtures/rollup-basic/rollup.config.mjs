import { nodeResolve } from '@rollup/plugin-node-resolve';
import { transform } from 'esbuild';
import OMT from '@surma/rollup-plugin-off-main-thread';
import { importMetaAssets } from '@web/rollup-plugin-import-meta-assets';

function moduleRelativeFileUrls() {
  return {
    name: 'module-relative-file-urls',
    resolveFileUrl({ fileName }) {
      return `new URL(${JSON.stringify(fileName)}, import.meta.url).href`;
    },
  };
}

function esbuildTypeScript() {
  return {
    name: 'esbuild-typescript',
    async transform(code, id) {
      if (!id.endsWith('.ts')) {
        return null;
      }
      const result = await transform(code, {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcemap: true,
        sourcefile: id,
      });
      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    nodeResolve({
      browser: true,
    }),
    esbuildTypeScript(),
    moduleRelativeFileUrls(),
    OMT(),
    importMetaAssets(),
  ],
};
