FROM node:26.5.0-bookworm-slim

WORKDIR /bench

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN npm init -y \
  && npm install --omit=dev --no-audit --no-fund /tmp/or-tools-wasm-local.tgz

COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENV BENCH_ENVIRONMENT=node-26.5.0

ENTRYPOINT ["node", "/bench/benchmarking/runners/node/run.mjs"]
