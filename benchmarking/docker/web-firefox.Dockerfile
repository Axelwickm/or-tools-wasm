FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /bench

COPY benchmarking/package/or-tools-wasm-local.tgz /tmp/or-tools-wasm-local.tgz
RUN npm init -y \
  && npm install --no-audit --no-fund /tmp/or-tools-wasm-local.tgz playwright-core@1.60.0

COPY Version.txt ./Version.txt
COPY benchmarking ./benchmarking

ENV BENCH_BROWSER=firefox
ENV BENCH_IMPLEMENTATION=web-firefox
ENV BENCH_ENVIRONMENT=firefox-headless-main-thread
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

ENTRYPOINT ["node", "/bench/benchmarking/runners/browser/run.mjs"]
