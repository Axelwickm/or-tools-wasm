FROM node:22-bookworm-slim

WORKDIR /bench

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN npm init -y \
  && npm install --omit=dev --no-audit --no-fund /tmp/or-tools-wasm-local.tgz

COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENTRYPOINT ["node", "/bench/benchmarking/runners/node/run.mjs"]
