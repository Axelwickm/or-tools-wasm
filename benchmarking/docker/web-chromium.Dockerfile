FROM node:26.5.0-bookworm-slim

WORKDIR /bench

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN npm init -y \
  && npm install --no-audit --no-fund /tmp/or-tools-wasm-local.tgz playwright-core@1.60.0

COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENV BENCH_BROWSER_EXECUTABLE=/usr/bin/chromium

ENTRYPOINT ["node", "/bench/benchmarking/runners/browser/run.mjs"]
