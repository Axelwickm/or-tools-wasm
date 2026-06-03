#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

if [[ -n "${CMAKE_BUILD_PARALLEL_LEVEL:-}" ]]; then
  build_parallel_level="${CMAKE_BUILD_PARALLEL_LEVEL}"
elif [[ -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" ]]; then
  build_parallel_level=4
else
  if command -v nproc >/dev/null 2>&1; then
    host_cores="$(nproc)"
  elif command -v sysctl >/dev/null 2>&1; then
    host_cores="$(sysctl -n hw.ncpu)"
  else
    host_cores=2
  fi
  build_parallel_level="$((host_cores > 1 ? host_cores - 1 : 1))"
fi

scripts/ensure-emsdk.sh
source ./emsdk/emsdk_env.sh

if [[ "${ORTOOLS_WASM_RECONFIGURE:-0}" == "1" || ! -f build/CMakeCache.txt ]]; then
  cmake -S . -B build \
    -DCMAKE_TOOLCHAIN_FILE="${EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
    ${CMAKE_ARGS:-}
fi

if [[ "${ORTOOLS_WASM_CLEAN:-0}" == "1" ]]; then
  rm -rf build/javascript/wasm build/javascript/node-wasm
  rm -rf package/build/javascript/wasm package/build/javascript/node-wasm
fi

mkdir -p build/javascript/wasm build/javascript/node-wasm
cmake --build build --target cp_sat_runtime_site --parallel "${build_parallel_level}"
node scripts/prune_wasm_outputs.mjs

rm -rf package/build/javascript/wasm package/build/javascript/node-wasm
mkdir -p package/build/javascript
cp -a build/javascript/wasm package/build/javascript/
cp -a build/javascript/node-wasm package/build/javascript/
