FROM oven/bun:1

USER root
WORKDIR /bench

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN bun init -y \
  && bun add /tmp/or-tools-wasm-local.tgz

COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENV BENCH_IMPLEMENTATION=wasm-bun
ENV BENCH_ENVIRONMENT=bun-local

ENTRYPOINT ["bun", "/bench/benchmarking/runners/node/run.mjs"]
