FROM node:26.5.0-bookworm-slim AS deps

WORKDIR /bench

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN npm init -y \
  && npm install --omit=dev --no-audit --no-fund /tmp/or-tools-wasm-local.tgz

FROM denoland/deno:2.9.3

USER root
WORKDIR /bench

COPY --from=deps /bench/package.json ./package.json
COPY --from=deps /bench/package-lock.json ./package-lock.json
COPY --from=deps /bench/node_modules ./node_modules
COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENV BENCH_IMPLEMENTATION=wasm-deno
ENV BENCH_ENVIRONMENT=deno-2.9.3
ENV DENO_NO_UPDATE_CHECK=1

ENTRYPOINT ["deno", "run", "--allow-read=/bench,/results", "--allow-write=/results", "--allow-env", "--allow-sys", "--node-modules-dir=manual", "/bench/benchmarking/runners/node/run.mjs"]
