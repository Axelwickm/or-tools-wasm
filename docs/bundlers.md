# Bundler configuration

## Vite

For Vite apps, keep `or-tools-wasm` out of dependency optimization so Vite
handles the worker and WebAssembly URLs through its normal asset pipeline.
`protobufjs` is CommonJS, so include it in dependency optimization. The worker
runtime also needs ES module worker output:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['protobufjs'],
    exclude: ['or-tools-wasm'],
  },
  worker: {
    format: 'es',
  },
});
```

## Webpack

For Webpack 5, enable async WebAssembly, emit `.wasm` files as resources, and
use `publicPath: 'auto'` so worker and WebAssembly URLs resolve from the emitted
bundle location:

```js
// webpack.config.cjs
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

module.exports = {
  output: {
    publicPath: 'auto',
  },
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  devServer: {
    headers,
  },
};
```

## Rollup

Rollup core does not bundle module workers or emit `new URL(...,
import.meta.url)` assets by itself. The verified fixture uses Rollup's standard
plugin surface for those features:

```js
// rollup.config.mjs
import { nodeResolve } from '@rollup/plugin-node-resolve';
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

export default {
  input: 'src/main.js',
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    nodeResolve({ browser: true }),
    moduleRelativeFileUrls(),
    OMT(),
    importMetaAssets(),
  ],
};
```

Other modern bundlers may also work if they support module workers and
WebAssembly asset emission, but they are not yet officially verified.
