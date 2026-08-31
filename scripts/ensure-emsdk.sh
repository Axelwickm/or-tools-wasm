#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="${ROOT_DIR}/emsdk"
EMCC_BIN="${EMSDK_DIR}/upstream/emscripten/emcc"
EMSDK_BIN="${EMSDK_DIR}/emsdk"
EMSCRIPTEN_VERSION="6.0.8"

installed_version=""
if [[ -x "${EMCC_BIN}" ]]; then
  installed_version="$("${EMCC_BIN}" --version 2>/dev/null | sed -n '1s/.* \([0-9][0-9.]*\) (.*/\1/p')"
  if [[ "${installed_version}" == "${EMSCRIPTEN_VERSION}" ]]; then
    exit 0
  fi
fi

if [[ ! -x "${EMSDK_BIN}" ]]; then
  echo "emsdk submodule not initialized. Initializing pinned emsdk checkout..."
  git -C "${ROOT_DIR}" submodule update --init --recursive emsdk
fi

if [[ -n "${installed_version}" ]]; then
  echo "Emscripten ${installed_version} is installed; switching to ${EMSCRIPTEN_VERSION}..."
else
  echo "Emscripten toolchain not found. Installing Emscripten ${EMSCRIPTEN_VERSION} via emsdk..."
fi
"${EMSDK_BIN}" install "${EMSCRIPTEN_VERSION}"
"${EMSDK_BIN}" activate "${EMSCRIPTEN_VERSION}"

installed_version="$("${EMCC_BIN}" --version 2>/dev/null | sed -n '1s/.* \([0-9][0-9.]*\) (.*/\1/p')"
if [[ "${installed_version}" != "${EMSCRIPTEN_VERSION}" ]]; then
  echo "Expected Emscripten ${EMSCRIPTEN_VERSION}, found ${installed_version:-unknown}." >&2
  exit 1
fi
