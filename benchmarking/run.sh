#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s nullglob

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

RESULTS_DIR="${ROOT}/benchmarking/results"
PACKAGE_DIR="${ROOT}/benchmarking/package"
PACKAGE_TARBALL="${PACKAGE_DIR}/or-tools-wasm-local.tgz"
NPM_CACHE_DIR="${ROOT}/.npm-cache"
mkdir -p "${RESULTS_DIR}"
mkdir -p "${PACKAGE_DIR}"
mkdir -p "${NPM_CACHE_DIR}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-${NPM_CACHE_DIR}}"

GIT_SHA="$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || printf unknown)"
PYTHON_IMAGE="ortools-wasm-bench-native-python"
NODE_IMAGE="ortools-wasm-bench-wasm-node"
DENO_IMAGE="ortools-wasm-bench-wasm-deno"
BUN_IMAGE="ortools-wasm-bench-wasm-bun"
WEB_IMAGE="ortools-wasm-bench-web-chromium"
FIREFOX_IMAGE="ortools-wasm-bench-web-firefox"

BENCHMARK_CONTAINER_LABEL="org.or-tools-wasm.benchmark.run=1"
RUN_CONTAINER_NAMES=(
  "ortools-wasm-bench-run-native-python"
  "ortools-wasm-bench-run-wasm-node"
  "ortools-wasm-bench-run-wasm-deno"
  "ortools-wasm-bench-run-wasm-bun"
  "ortools-wasm-bench-run-web-chromium"
  "ortools-wasm-bench-run-web-firefox"
)

cleanup_containers() {
  local had_errexit=0
  [[ $- == *e* ]] && had_errexit=1
  set +e
  for container_name in "${RUN_CONTAINER_NAMES[@]}"; do
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
  done
  local labeled_containers
  labeled_containers="$(docker ps -aq --filter "label=${BENCHMARK_CONTAINER_LABEL}" 2>/dev/null || true)"
  if [[ -n "${labeled_containers}" ]]; then
    docker rm -f ${labeled_containers} >/dev/null 2>&1 || true
  fi
  if [[ ${had_errexit} -eq 1 ]]; then
    set -e
  fi
}

on_exit() {
  local status=$?
  cleanup_containers
  exit "${status}"
}

on_error() {
  local status=$?
  local command=${BASH_COMMAND}
  printf "\nbenchmarking/run.sh failed with exit %s while running:\n  %s\n" "${status}" "${command}" >&2
  exit "${status}"
}

trap on_error ERR
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cleanup_containers

for required_dir in \
  "${ROOT}/javascript/build/javascript/node" \
  "${ROOT}/javascript/build/javascript/node-wasm" \
  "${ROOT}/javascript/build/javascript/browser" \
  "${ROOT}/javascript/build/javascript/wasm"
do
  if [[ ! -d "${required_dir}" ]]; then
    fail "Missing ${required_dir}. Run npm --prefix javascript run build:lib before benchmarking."
  fi
done

printf 'Packing local npm package into %s\n' "${PACKAGE_DIR}"
rm -f "${PACKAGE_DIR}"/or-tools-wasm-*.tgz "${PACKAGE_TARBALL}"
(cd "${ROOT}/package" && npm pack --pack-destination "${PACKAGE_DIR}")
packed_tarballs=("${PACKAGE_DIR}"/or-tools-wasm-*.tgz)
if [[ ${#packed_tarballs[@]} -ne 1 ]]; then
  fail "Expected exactly one packed tarball in ${PACKAGE_DIR}, found ${#packed_tarballs[@]}."
fi
mv "${packed_tarballs[0]}" "${PACKAGE_TARBALL}"
printf 'Packed %s\n' "${PACKAGE_TARBALL}"

docker build -f "${ROOT}/benchmarking/docker/native-python.Dockerfile" -t "${PYTHON_IMAGE}" "${ROOT}"
docker build -f "${ROOT}/benchmarking/docker/wasm-node.Dockerfile" -t "${NODE_IMAGE}" "${ROOT}"
docker build -f "${ROOT}/benchmarking/docker/wasm-deno.Dockerfile" -t "${DENO_IMAGE}" "${ROOT}"
docker build -f "${ROOT}/benchmarking/docker/wasm-bun.Dockerfile" -t "${BUN_IMAGE}" "${ROOT}"
docker build -f "${ROOT}/benchmarking/docker/web-chromium.Dockerfile" -t "${WEB_IMAGE}" "${ROOT}"
docker build -f "${ROOT}/benchmarking/docker/web-firefox.Dockerfile" -t "${FIREFOX_IMAGE}" "${ROOT}"

docker run --rm \
  --name "ortools-wasm-bench-run-native-python" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${PYTHON_IMAGE}" --out /results/native-python.csv

docker run --rm \
  --name "ortools-wasm-bench-run-wasm-node" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${NODE_IMAGE}" --out /results/wasm-node.csv

docker run --rm \
  --name "ortools-wasm-bench-run-wasm-deno" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${DENO_IMAGE}" --out /results/wasm-deno.csv

docker run --rm \
  --name "ortools-wasm-bench-run-wasm-bun" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${BUN_IMAGE}" --out /results/wasm-bun.csv

docker run --rm \
  --name "ortools-wasm-bench-run-web-chromium" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${WEB_IMAGE}" --out /results/web-chromium.csv

docker run --rm \
  --name "ortools-wasm-bench-run-web-firefox" \
  --label "${BENCHMARK_CONTAINER_LABEL}" \
  -e BENCH_GIT_SHA="${GIT_SHA}" \
  -v "${RESULTS_DIR}:/results" \
  "${FIREFOX_IMAGE}" --out /results/web-firefox.csv

printf 'Wrote %s\n' "${RESULTS_DIR}/native-python.csv"
printf 'Wrote %s\n' "${RESULTS_DIR}/wasm-node.csv"
printf 'Wrote %s\n' "${RESULTS_DIR}/wasm-deno.csv"
printf 'Wrote %s\n' "${RESULTS_DIR}/wasm-bun.csv"
printf 'Wrote %s\n' "${RESULTS_DIR}/web-chromium.csv"
printf 'Wrote %s\n' "${RESULTS_DIR}/web-firefox.csv"

printf 'Rendering benchmark report\n'
python3 "${ROOT}/benchmarking/scripts/render_results.py"
