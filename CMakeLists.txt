# Copyright 2010-2025 Google LLC
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This file is just an orchestration
cmake_minimum_required(VERSION 3.20)
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

# Enable output of compile commands during generation.
option(CMAKE_EXPORT_COMPILE_COMMANDS "Export compile command" ON)

include(utils)
set_version(VERSION RELEASE)

project(ortools VERSION ${VERSION} LANGUAGES CXX C)
set(PROJECT_NAMESPACE ortools)
message(STATUS "${PROJECT_NAME} version: ${PROJECT_VERSION} release: ${RELEASE}")
#message(STATUS "major: ${PROJECT_VERSION_MAJOR}")
#message(STATUS "minor: ${PROJECT_VERSION_MINOR}")
#message(STATUS "patch: ${PROJECT_VERSION_PATCH}")

if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
  # Ensure all targets—including third-party deps—are built with pthread support
  # so shared memory can be used when linking with -sUSE_PTHREADS=1.
  set(EMSCRIPTEN_USE_PTHREADS ON CACHE BOOL
      "Enable pthread support when targeting Emscripten")
  message(STATUS "Emscripten pthreads support (global): ${EMSCRIPTEN_USE_PTHREADS}")
  if(EMSCRIPTEN_USE_PTHREADS)
    add_compile_options(-pthread)
    add_link_options(-pthread -sUSE_PTHREADS=1)
  endif()
  set(EMSCRIPTEN_USE_SIMD ON CACHE BOOL
      "Enable SIMD when targeting Emscripten")
  message(STATUS "Emscripten SIMD support (global): ${EMSCRIPTEN_USE_SIMD}")
  if(EMSCRIPTEN_USE_SIMD)
    add_compile_options(-msimd128)
    add_link_options(-msimd128)
  endif()

  set(BUILD_FLATZINC OFF CACHE BOOL "Build flatzinc" FORCE)
  set(BUILD_MATH_OPT ON CACHE BOOL "Build the MATH_OPT" FORCE)
  set(BUILD_SAMPLES OFF CACHE BOOL "Build samples" FORCE)
  set(BUILD_EXAMPLES OFF CACHE BOOL "Build examples" FORCE)
  set(USE_GUROBI OFF CACHE BOOL "Use the Gurobi solver" FORCE)
  set(USE_PDLP ON CACHE BOOL "Use the PDLP solver" FORCE)
  set(USE_XPRESS OFF CACHE BOOL "Use the Xpress solver" FORCE)
  option(ORTOOLS_WASM_USE_CLP "Build CLP support into the WASM MPSolver runtime" ON)
  option(ORTOOLS_WASM_USE_CBC "Build CBC support into the WASM MPSolver runtime" ON)
  option(ORTOOLS_WASM_USE_KNAPSACK "Build Knapsack support into the WASM MPSolver runtime" ON)
  option(ORTOOLS_WASM_USE_GLPK "Build GLPK support into the WASM MPSolver and MathOpt runtimes" ON)
  option(ORTOOLS_WASM_USE_SCIP "Build SCIP/GSCIP support into the WASM MPSolver and MathOpt runtimes" ON)
endif()

if(MSVC)
  set(CMAKE_CXX_STANDARD 20)
else()
  set(CMAKE_CXX_STANDARD 17)
endif()
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Set max os target version.
set(CMAKE_OSX_DEPLOYMENT_TARGET 10.15)

# Default Build Type to be Release
get_property(isMultiConfig GLOBAL PROPERTY GENERATOR_IS_MULTI_CONFIG)
if(isMultiConfig)
  if(NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_CONFIGURATION_TYPES "Release;Debug" CACHE STRING
    "Choose the type of builds, options are: Debug Release RelWithDebInfo MinSizeRel. (default: Release;Debug)"
    FORCE)
  endif()
  message(STATUS "Configuration types: ${CMAKE_CONFIGURATION_TYPES}")
else()
  if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "Release" CACHE STRING
    "Choose the type of build, options are: Debug Release RelWithDebInfo MinSizeRel. (default: Release)"
    FORCE)
  endif()
  message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
endif()

# Layout build dir like install dir
include(GNUInstallDirs)
if(UNIX)
  option(BUILD_SHARED_LIBS "Build shared libraries (.so or .dylib)." ON)
  set(CMAKE_BUILD_WITH_INSTALL_RPATH TRUE)
  set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_LIBDIR})
  set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_LIBDIR})
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_BINDIR})
  # for multi-config build system (e.g. Xcode, Ninja Multi-Config)
  foreach(OutputConfig IN LISTS CMAKE_CONFIGURATION_TYPES)
    string(TOUPPER ${OutputConfig} OUTPUTCONFIG)
    set(CMAKE_LIBRARY_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_LIBDIR})
    set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_LIBDIR})
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_BINDIR})
  endforeach()
else()
  option(BUILD_SHARED_LIBS "Build shared libraries (.dll)." ON)
  set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_BINDIR})
  set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_BINDIR})
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/${CMAKE_INSTALL_BINDIR})
  # for multi-config builds (e.g. msvc)
  foreach(OutputConfig IN LISTS CMAKE_CONFIGURATION_TYPES)
    string(TOUPPER ${OutputConfig} OUTPUTCONFIG)
    set(CMAKE_LIBRARY_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_BINDIR})
    set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_BINDIR})
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${OUTPUTCONFIG} ${CMAKE_BINARY_DIR}/${OutputConfig}/${CMAKE_INSTALL_BINDIR})
  endforeach()
endif()

if(MSVC AND BUILD_SHARED_LIBS)
  set(CMAKE_WINDOWS_EXPORT_ALL_SYMBOLS ON)
endif()

# Disable CTest targets
set_property(GLOBAL PROPERTY CTEST_TARGETS_ADDED 1)
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten" AND NOT DEFINED BUILD_TESTING)
  set(BUILD_TESTING OFF CACHE BOOL "Enable testing" FORCE)
endif()
include(CTest)

# By default only build the C++ library which agregate all components.
option(BUILD_CXX "Build C++ library" ON)
message(STATUS "Build C++ library: ${BUILD_CXX}")

# If we don't build ortools we could build the GLOP standalone project
if(NOT BUILD_CXX)
  OPTION(BUILD_GLOP "Build GLOP standalone" ON)
  message(STATUS "Build standalone Glop: ${BUILD_GLOP}")
endif()

option(BUILD_PYTHON "Build Python Library" OFF)
message(STATUS "Build Python: ${BUILD_PYTHON}")

# If wrapper are built, we need to have the install rpath in BINARY_DIR to package
if(BUILD_PYTHON)
  set(CMAKE_BUILD_WITH_INSTALL_RPATH TRUE)
endif()

include(CMakeDependentOption)

# Optional components (enabled by default)
## Flatzinc
CMAKE_DEPENDENT_OPTION(BUILD_FLATZINC "Build flatzinc" ON "BUILD_CXX" OFF)
message(STATUS "Build Flatzinc: ${BUILD_FLATZINC}")

## MathOpt
CMAKE_DEPENDENT_OPTION(BUILD_MATH_OPT "Build the MATH_OPT" ON "BUILD_CXX" OFF)
message(STATUS "Build MathOpt: ${BUILD_MATH_OPT}")

## Samples
option(BUILD_SAMPLES "Build samples" ON)
message(STATUS "Build samples: ${BUILD_SAMPLES}")
CMAKE_DEPENDENT_OPTION(BUILD_CXX_SAMPLES "Build cxx samples" ON "BUILD_SAMPLES;BUILD_CXX" OFF)
message(STATUS "Build C++ samples: ${BUILD_CXX_SAMPLES}")
CMAKE_DEPENDENT_OPTION(BUILD_PYTHON_SAMPLES "Build python samples" ON "BUILD_SAMPLES;BUILD_PYTHON" OFF)
message(STATUS "Build Python samples: ${BUILD_PYTHON_SAMPLES}")

## Examples
option(BUILD_EXAMPLES "Build examples" ON)
message(STATUS "Build examples: ${BUILD_EXAMPLES}")
CMAKE_DEPENDENT_OPTION(BUILD_CXX_EXAMPLES "Build cxx examples" ON "BUILD_EXAMPLES;BUILD_CXX" OFF)
message(STATUS "Build C++ examples: ${BUILD_CXX_EXAMPLES}")
CMAKE_DEPENDENT_OPTION(BUILD_PYTHON_EXAMPLES "Build python examples" ON "BUILD_EXAMPLES;BUILD_PYTHON" OFF)
message(STATUS "Build Python examples: ${BUILD_PYTHON_EXAMPLES}")

option(BUILD_DOC "Build documentation" OFF)
message(STATUS "Build documentation: ${BUILD_DOC}")
CMAKE_DEPENDENT_OPTION(INSTALL_DOC "Install doc" ON "BUILD_CXX AND BUILD_DOC" OFF)
message(STATUS "Install doc: ${INSTALL_DOC}")

# WASM JS bindings (optional, Emscripten only)
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
  # Embed proto schemas directly into the WASM binary.
  set(EMSCRIPTEN_ALLOWED_ORIGINS "" CACHE STRING
      "Comma-separated list of allowed origins for the WASM runtime. Empty allows all origins.")
  string(REGEX REPLACE "^\"(.*)\"$" "\\1"
    EMSCRIPTEN_ALLOWED_ORIGINS_STRIPPED "${EMSCRIPTEN_ALLOWED_ORIGINS}")
  string(REPLACE "\"" "\\\"" EMSCRIPTEN_ALLOWED_ORIGINS_ESCAPED
    "${EMSCRIPTEN_ALLOWED_ORIGINS_STRIPPED}")
  message(STATUS "Emscripten allowed origins: ${EMSCRIPTEN_ALLOWED_ORIGINS_STRIPPED}")
  file(MAKE_DIRECTORY "${PROJECT_BINARY_DIR}/javascript")
  set(PROTO_SCHEMA_HEADER "${PROJECT_BINARY_DIR}/javascript/generated_proto_schemas.h")
  add_custom_command(
    OUTPUT "${PROTO_SCHEMA_HEADER}"
    COMMAND "${CMAKE_COMMAND}"
            -DCP_MODEL_PROTO="${PROJECT_SOURCE_DIR}/ortools/sat/cp_model.proto"
            -DSAT_PARAMETERS_PROTO="${PROJECT_SOURCE_DIR}/ortools/sat/sat_parameters.proto"
            -DLINEAR_SOLVER_PROTO="${PROJECT_SOURCE_DIR}/ortools/linear_solver/linear_solver.proto"
            -DOPTIONAL_BOOLEAN_PROTO="${PROJECT_SOURCE_DIR}/ortools/util/optional_boolean.proto"
            -DTEMPLATE_FILE="${PROJECT_SOURCE_DIR}/javascript/generated_proto_schemas.h.in"
            -DOUTPUT_FILE="${PROTO_SCHEMA_HEADER}"
            -P "${PROJECT_SOURCE_DIR}/scripts/embed_proto.cmake"
    DEPENDS
      "${PROJECT_SOURCE_DIR}/scripts/embed_proto.cmake"
      "${PROJECT_SOURCE_DIR}/javascript/generated_proto_schemas.h.in"
      "${PROJECT_SOURCE_DIR}/ortools/sat/cp_model.proto"
      "${PROJECT_SOURCE_DIR}/ortools/sat/sat_parameters.proto"
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/linear_solver.proto"
      "${PROJECT_SOURCE_DIR}/ortools/util/optional_boolean.proto")
  add_custom_target(generate_proto_schemas
    DEPENDS "${PROTO_SCHEMA_HEADER}")

  set(JS_OUTPUT_DIR "${PROJECT_BINARY_DIR}/javascript/wasm")
  set(JS_NODE_OUTPUT_DIR "${PROJECT_BINARY_DIR}/javascript/node-wasm")
  set(JS_EXAMPLES_DIR "${JS_OUTPUT_DIR}/examples")
  file(MAKE_DIRECTORY "${JS_OUTPUT_DIR}")
  file(MAKE_DIRECTORY "${JS_NODE_OUTPUT_DIR}")
  file(MAKE_DIRECTORY "${JS_EXAMPLES_DIR}")

  set(CP_SAT_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/cp_sat_api.cc"
    "${PROTO_SCHEMA_HEADER}")

  set(ROUTING_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/routing_api.cc")

  set(MP_SOLVER_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/mp_solver_api.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/glop_interface.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/glop_proto_solver.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/preprocessor.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/sat_proto_solver.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/sat_solver_utils.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/sat_interface.cc"
    "${PROTO_SCHEMA_HEADER}")
  if(ORTOOLS_WASM_USE_CLP)
    list(APPEND MP_SOLVER_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/clp_interface.cc")
  endif()
  if(ORTOOLS_WASM_USE_CBC)
    list(APPEND MP_SOLVER_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/cbc_interface.cc")
  endif()
  if(ORTOOLS_WASM_USE_KNAPSACK)
    list(APPEND MP_SOLVER_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/knapsack_interface.cc")
  endif()
  if(ORTOOLS_WASM_USE_GLPK)
    list(APPEND MP_SOLVER_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/glpk_interface.cc")
  endif()
  if(ORTOOLS_WASM_USE_SCIP)
    list(APPEND MP_SOLVER_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/scip_params.cc"
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/scip_proto_solver.cc"
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/scip_callback.cc"
      "${PROJECT_SOURCE_DIR}/ortools/linear_solver/scip_interface.cc")
  endif()

  set(MATHOPT_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/mathopt_api.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/glop_interface.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/glop_proto_solver.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/preprocessor.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/sat_proto_solver.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/proto_solver/sat_solver_utils.cc"
    "${PROJECT_SOURCE_DIR}/ortools/linear_solver/sat_interface.cc")
  if(ORTOOLS_WASM_USE_GLPK)
    list(APPEND MATHOPT_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/glpk_solver.cc"
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/glpk/gap.cc"
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/glpk/glpk_sparse_vector.cc"
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/glpk/rays.cc"
      "${PROJECT_SOURCE_DIR}/ortools/third_party_solvers/glpk/glpk_env_deleter.cc"
      "${PROJECT_SOURCE_DIR}/ortools/third_party_solvers/glpk/glpk_formatters.cc")
  endif()
  if(ORTOOLS_WASM_USE_SCIP)
    file(GLOB_RECURSE ORTOOLS_WASM_GSCIP_SOURCES CONFIGURE_DEPENDS
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/gscip/*.cc")
    list(FILTER ORTOOLS_WASM_GSCIP_SOURCES EXCLUDE REGEX "/bugs/")
    list(FILTER ORTOOLS_WASM_GSCIP_SOURCES EXCLUDE REGEX "_test\\.cc$")
    list(FILTER ORTOOLS_WASM_GSCIP_SOURCES EXCLUDE REGEX "/gscip_testing\\.cc$")
    list(APPEND MATHOPT_BROWSER_SOURCES
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/gscip_solver.cc"
      "${PROJECT_SOURCE_DIR}/ortools/math_opt/solvers/message_callback_data.cc"
      ${ORTOOLS_WASM_GSCIP_SOURCES})
  endif()

  set(PDLP_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/pdlp_api.cc")

  set(GRAPH_BROWSER_SOURCES
    "${PROJECT_SOURCE_DIR}/javascript/graph_api.cc"
    "${PROJECT_SOURCE_DIR}/ortools/graph/assignment.cc"
    "${PROJECT_SOURCE_DIR}/ortools/graph/linear_assignment.cc"
    "${PROJECT_SOURCE_DIR}/ortools/graph/max_flow.cc"
    "${PROJECT_SOURCE_DIR}/ortools/graph/min_cost_flow.cc")

  set(CP_SAT_COMMON_LINK_OPTIONS
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=cpSatModule"
    "-sASSERTIONS=1"
    "-fexceptions"
    "-sDISABLE_EXCEPTION_CATCHING=0"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_BIGINT=1"
    "--bind"
    "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,stringToUTF8,allocateUTF8,HEAPU8"
    "-sNODEJS_CATCH_REJECTION=0"
    "-sNODEJS_CATCH_EXIT=0"
    "--no-entry"
    "-gsource-map"
    "--source-map-base=./")

  set(CP_SAT_PTHREAD_LINK_OPTIONS
    "-sUSE_PTHREADS=1"
    "-sPTHREAD_POOL_SIZE_STRICT=2"
    "-pthread"
    "--shared-memory")

  set(CP_SAT_BROWSER_LINK_OPTIONS
    "-sENVIRONMENT=web,worker"
    "-sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency")

  set(CP_SAT_NODE_LINK_OPTIONS
    "-sENVIRONMENT=node"
    "-sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency")

  set(CP_SAT_JSPI_LINK_OPTIONS
    "-sJSPI=2"
    "-sJSPI_EXPORTS=['solve_model','solve_model_with_callback_events','validate_model','routing_solve','routing_solve_with_parameters','routing_solve_with_parameters_ext','routing_solve_from_assignment_with_parameters','routing_read_assignment_from_routes','mp_solver_solve','mp_solver_solve_with_parameters','mp_solver_solve_model_request','mathopt_solve_request','pdlp_primal_dual_hybrid_gradient','graph_max_flow_solve_serialized','graph_min_cost_flow_solve_serialized','graph_linear_sum_assignment_solve_serialized']")

  set(CP_SAT_ASYNCIFY_LINK_OPTIONS
    "-sASYNCIFY=1")

  function(configure_ortools_wasm_target TARGET_NAME OUTPUT_NAME OUTPUT_DIR)
    add_dependencies(${TARGET_NAME} generate_proto_schemas)
    target_link_libraries(${TARGET_NAME} PRIVATE ${PROJECT_NAMESPACE}::ortools)
    target_include_directories(${TARGET_NAME} PRIVATE "${PROJECT_BINARY_DIR}/javascript")
    target_compile_options(${TARGET_NAME} PRIVATE "-fexceptions")
    target_compile_definitions(${TARGET_NAME} PRIVATE
      ORTOOLS_WASM_ALLOWED_ORIGINS="${EMSCRIPTEN_ALLOWED_ORIGINS_ESCAPED}")
    set_target_properties(${TARGET_NAME} PROPERTIES
      OUTPUT_NAME "${OUTPUT_NAME}"
      RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}")
  endfunction()

  function(add_ortools_wasm_runtime TARGET_NAME OUTPUT_DIR ENV_LINK_OPTIONS FLAVOR_LINK_OPTIONS)
    add_executable(${TARGET_NAME} ${ARGN})
    configure_ortools_wasm_target(${TARGET_NAME} "${TARGET_NAME}" "${OUTPUT_DIR}")
    target_link_options(${TARGET_NAME} PRIVATE
      ${CP_SAT_COMMON_LINK_OPTIONS}
      ${CP_SAT_PTHREAD_LINK_OPTIONS}
      ${${ENV_LINK_OPTIONS}}
      ${${FLAVOR_LINK_OPTIONS}})
  endfunction()

  set(ORTOOLS_WASM_RUNTIME_TARGETS)
  foreach(RUNTIME_SPEC
      "cp_sat_runtime;CP_SAT_BROWSER_SOURCES"
      "routing_runtime;ROUTING_BROWSER_SOURCES"
      "mp_solver_runtime;MP_SOLVER_BROWSER_SOURCES"
      "mathopt_runtime;MATHOPT_BROWSER_SOURCES"
      "pdlp_runtime;PDLP_BROWSER_SOURCES"
      "graph_runtime;GRAPH_BROWSER_SOURCES")
    list(GET RUNTIME_SPEC 0 RUNTIME_NAME)
    list(GET RUNTIME_SPEC 1 RUNTIME_SOURCES)

    add_ortools_wasm_runtime(
      ${RUNTIME_NAME}
      "${JS_OUTPUT_DIR}"
      CP_SAT_BROWSER_LINK_OPTIONS
      CP_SAT_JSPI_LINK_OPTIONS
      ${${RUNTIME_SOURCES}})
    add_ortools_wasm_runtime(
      ${RUNTIME_NAME}_asyncify
      "${JS_OUTPUT_DIR}"
      CP_SAT_BROWSER_LINK_OPTIONS
      CP_SAT_ASYNCIFY_LINK_OPTIONS
      ${${RUNTIME_SOURCES}})
    add_ortools_wasm_runtime(
      ${RUNTIME_NAME}_node
      "${JS_NODE_OUTPUT_DIR}"
      CP_SAT_NODE_LINK_OPTIONS
      CP_SAT_JSPI_LINK_OPTIONS
      ${${RUNTIME_SOURCES}})
    add_ortools_wasm_runtime(
      ${RUNTIME_NAME}_node_asyncify
      "${JS_NODE_OUTPUT_DIR}"
      CP_SAT_NODE_LINK_OPTIONS
      CP_SAT_ASYNCIFY_LINK_OPTIONS
      ${${RUNTIME_SOURCES}})

    list(APPEND ORTOOLS_WASM_RUNTIME_TARGETS
      ${RUNTIME_NAME}
      ${RUNTIME_NAME}_asyncify
      ${RUNTIME_NAME}_node
      ${RUNTIME_NAME}_node_asyncify)
  endforeach()

  if(ORTOOLS_WASM_USE_CLP)
    foreach(MP_SOLVER_TARGET
        mp_solver_runtime
        mp_solver_runtime_asyncify
        mp_solver_runtime_node
        mp_solver_runtime_node_asyncify)
      target_compile_definitions(${MP_SOLVER_TARGET} PRIVATE USE_CLP)
      target_link_libraries(${MP_SOLVER_TARGET} PRIVATE
        Coin::Clp
        Coin::OsiClp)
    endforeach()
  endif()

  if(ORTOOLS_WASM_USE_CBC)
    foreach(MP_SOLVER_TARGET
        mp_solver_runtime
        mp_solver_runtime_asyncify
        mp_solver_runtime_node
        mp_solver_runtime_node_asyncify)
      target_compile_definitions(${MP_SOLVER_TARGET} PRIVATE USE_CBC USE_CLP)
      target_link_libraries(${MP_SOLVER_TARGET} PRIVATE
        Coin::Cbc
        Coin::CbcSolver
        Coin::OsiCbc
        Coin::Cgl
        Coin::Clp
        Coin::OsiClp)
    endforeach()
  endif()

  if(ORTOOLS_WASM_USE_GLPK)
    foreach(GLPK_TARGET
        mp_solver_runtime
        mp_solver_runtime_asyncify
        mp_solver_runtime_node
        mp_solver_runtime_node_asyncify
        mathopt_runtime
        mathopt_runtime_asyncify
        mathopt_runtime_node
        mathopt_runtime_node_asyncify)
      target_compile_definitions(${GLPK_TARGET} PRIVATE USE_GLPK)
      target_link_libraries(${GLPK_TARGET} PRIVATE GLPK::GLPK)
    endforeach()
  endif()

  if(ORTOOLS_WASM_USE_SCIP)
    foreach(SCIP_TARGET
        mp_solver_runtime
        mp_solver_runtime_asyncify
        mp_solver_runtime_node
        mp_solver_runtime_node_asyncify
        mathopt_runtime
        mathopt_runtime_asyncify
        mathopt_runtime_node
        mathopt_runtime_node_asyncify)
      target_compile_definitions(${SCIP_TARGET} PRIVATE USE_SCIP)
      target_link_libraries(${SCIP_TARGET} PRIVATE SCIP::libscip)
    endforeach()
  endif()

  target_link_options(cp_sat_runtime PRIVATE
    "--emit-tsd"
    "${JS_OUTPUT_DIR}/cp_sat_runtime.d.ts")

  add_custom_target(cp_sat_runtime_site ALL
    DEPENDS ${ORTOOLS_WASM_RUNTIME_TARGETS}
    COMMENT "Building cp_sat_runtime runtimes")
endif()

# By default all dependencies are NOT built (i.e. BUILD_DEPS=OFF),
# BUT if building the Python wrapper then BUILD_DEPS=ON.
if(BUILD_PYTHON)
  option(BUILD_DEPS "Build all dependencies" ON)
else()
  option(BUILD_DEPS "Build all dependencies" OFF)
endif()
message(STATUS "Build all dependencies: ${BUILD_DEPS}")
# Install built dependencies if any,
option(INSTALL_BUILD_DEPS "Install build all dependencies" ON)

# IF BUILD_DEPS=ON THEN Force all BUILD_*=ON
CMAKE_DEPENDENT_OPTION(BUILD_ZLIB "Build the ZLIB dependency Library" ON
  "NOT BUILD_DEPS" ON)

CMAKE_DEPENDENT_OPTION(BUILD_BZip2 "Build the BZip2 dependency Library" ON
  "NOT BUILD_DEPS" ON)

set(_ORTOOLS_PATCH_DIR "${CMAKE_CURRENT_LIST_DIR}/patches")
if(BUILD_ZLIB AND NOT EXISTS "${_ORTOOLS_PATCH_DIR}/ZLIB-v1.3.1.patch")
  message(WARNING "Disabling BUILD_ZLIB (missing patches/ZLIB-v1.3.1.patch)")
  set(BUILD_ZLIB OFF CACHE BOOL "Build the ZLIB dependency Library" FORCE)
endif()
message(STATUS "Build ZLIB: ${BUILD_ZLIB}")

if(BUILD_BZip2 AND NOT EXISTS "${_ORTOOLS_PATCH_DIR}/bzip2.patch")
  message(WARNING "Disabling BUILD_BZip2 (missing patches/bzip2.patch)")
  set(BUILD_BZip2 OFF CACHE BOOL "Build the BZip2 dependency Library" FORCE)
endif()
message(STATUS "Build BZip2: ${BUILD_BZip2}")

CMAKE_DEPENDENT_OPTION(BUILD_absl "Build the abseil-cpp dependency Library" ON
  "NOT BUILD_DEPS" ON)
message(STATUS "Build abseil-cpp: ${BUILD_absl}")

CMAKE_DEPENDENT_OPTION(BUILD_Protobuf "Build the Protobuf dependency Library" ON
  "NOT BUILD_DEPS" ON)
message(STATUS "Build protobuf: ${BUILD_Protobuf}")

CMAKE_DEPENDENT_OPTION(BUILD_Eigen3 "Build the eigen3 dependency Library" ON
  "NOT BUILD_DEPS" ON)
message(STATUS "Build eigen3: ${BUILD_Eigen3}")

CMAKE_DEPENDENT_OPTION(BUILD_re2 "Build the re2 dependency Library" ON
  "NOT BUILD_DEPS" ON)
message(STATUS "Build re2: ${BUILD_re2}")

if(BUILD_TESTING)
  CMAKE_DEPENDENT_OPTION(BUILD_googletest "Build googletest" OFF
    "NOT BUILD_DEPS" ON)
  CMAKE_DEPENDENT_OPTION(BUILD_benchmark "Build benchmark" OFF
    "NOT BUILD_DEPS" ON)
else()
  set(BUILD_googletest OFF)
  set(BUILD_benchmark OFF)
endif()
message(STATUS "Build googletest: ${BUILD_googletest}")
message(STATUS "Build benchmark: ${BUILD_benchmark}")

# Optional third party solvers (enabled by default)
## BOP
CMAKE_DEPENDENT_OPTION(USE_BOP "Use the BOP solver" OFF "BUILD_CXX" OFF)
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
  set(USE_BOP OFF CACHE BOOL "Use the BOP solver" FORCE)
endif()
message(STATUS "BOP support: ${USE_BOP}")

## COIN-OR Solvers (Cbc, Clp)
CMAKE_DEPENDENT_OPTION(USE_COINOR "Use the COIN-OR solver" OFF "BUILD_CXX" OFF)
message(STATUS "COIN-OR support: ${USE_COINOR}")
if(USE_COINOR)
  CMAKE_DEPENDENT_OPTION(BUILD_CoinUtils "Build the CoinUtils dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Build CoinUtils: ${BUILD_CoinUtils}")

  CMAKE_DEPENDENT_OPTION(BUILD_Osi "Build the Osi dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Build Osi: ${BUILD_Osi}")

  CMAKE_DEPENDENT_OPTION(BUILD_Clp "Build the Clp dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Build Clp: ${BUILD_Clp}")

  CMAKE_DEPENDENT_OPTION(BUILD_Cgl "Build the Cgl dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Build Cgl: ${BUILD_Cgl}")

  CMAKE_DEPENDENT_OPTION(BUILD_Cbc "Build the Cbc dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Build Cbc: ${BUILD_Cbc}")
else()
  set(BUILD_CoinUtils OFF)
  set(BUILD_Osi OFF)
  set(BUILD_Clp OFF)
  set(BUILD_Cgl OFF)
  set(BUILD_Cbc OFF)
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten" AND (ORTOOLS_WASM_USE_CLP OR ORTOOLS_WASM_USE_CBC))
  set(BUILD_CoinUtils ON CACHE BOOL "Build the CoinUtils dependency Library" FORCE)
  set(BUILD_Osi ON CACHE BOOL "Build the Osi dependency Library" FORCE)
  set(BUILD_Clp ON CACHE BOOL "Build the Clp dependency Library" FORCE)
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten" AND ORTOOLS_WASM_USE_CBC)
  set(BUILD_Cgl ON CACHE BOOL "Build the Cgl dependency Library" FORCE)
  set(BUILD_Cbc ON CACHE BOOL "Build the Cbc dependency Library" FORCE)
endif()

## GLOP
# note OFF is currently not supported.
CMAKE_DEPENDENT_OPTION(USE_GLOP "Use the GLOP solver" ON "BUILD_CXX" OFF)
message(STATUS "GLOP support: ${USE_GLOP}")

## GLPK
# Disable by default since it is GPLv3, user could enable it and release under GPLv3
# see: https://www.apache.org/licenses/GPL-compatibility.html
CMAKE_DEPENDENT_OPTION(USE_GLPK "Use the GLPK solver" OFF "BUILD_CXX" OFF)
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten" AND ORTOOLS_WASM_USE_GLPK)
  set(USE_GLPK ON CACHE BOOL "Use the GLPK solver" FORCE)
  set(BUILD_GLPK ON CACHE BOOL "Build the GLPK dependency Library" FORCE)
endif()
message(STATUS "GLPK support: ${USE_GLPK}")
if(USE_GLPK)
  CMAKE_DEPENDENT_OPTION(BUILD_GLPK "Build the GLPK dependency Library" OFF
    "NOT BUILD_DEPS" ON)
else()
  set(BUILD_GLPK OFF)
endif()
message(STATUS "Build GLPK: ${BUILD_GLPK}")

## GUROBI
# Since it is dynamicaly loaded upon use, OFF is currently not supported.
CMAKE_DEPENDENT_OPTION(USE_GUROBI "Use the Gurobi solver" ON "BUILD_CXX" OFF)
message(STATUS "Gurobi support: ${USE_GUROBI}")

## HiGHS
# see: https://github.com/ERGO-Code/HiGHS
CMAKE_DEPENDENT_OPTION(USE_HIGHS "Use the HiGHS solver" OFF "BUILD_CXX" OFF)
message(STATUS "HiGHS support: ${USE_HIGHS}")
if(USE_HIGHS)
  CMAKE_DEPENDENT_OPTION(BUILD_HIGHS "Build the HiGHS dependency Library" OFF
    "NOT BUILD_DEPS" ON)
else()
  set(BUILD_HIGHS OFF)
endif()
message(STATUS "Build HiGHS: ${BUILD_HIGHS}")

## PDLP
CMAKE_DEPENDENT_OPTION(USE_PDLP "Use the PDLP solver" ON "BUILD_CXX" OFF)
message(STATUS "PDLP support: ${USE_PDLP}")
if(USE_PDLP)
  CMAKE_DEPENDENT_OPTION(BUILD_PDLP "Build the PDLP dependency Library" ON
    "NOT BUILD_DEPS" ON)
else()
  set(BUILD_PDLP OFF)
endif()
message(STATUS "Build PDLP: ${BUILD_PDLP}")

## SCIP
# see: https://github.com/scipopt/scip
CMAKE_DEPENDENT_OPTION(USE_SCIP "Use the Scip solver" OFF "BUILD_CXX" OFF)
if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten" AND ORTOOLS_WASM_USE_SCIP)
  set(USE_SCIP ON CACHE BOOL "Use the SCIP solver" FORCE)
  set(BUILD_Boost ON CACHE BOOL "Build the Boost dependency Library" FORCE)
  set(BUILD_soplex ON CACHE BOOL "Build the Soplex dependency Library" FORCE)
  set(BUILD_SCIP ON CACHE BOOL "Build the SCIP dependency Library" FORCE)
endif()
message(STATUS "SCIP support: ${USE_SCIP}")
if(USE_SCIP)
  CMAKE_DEPENDENT_OPTION(BUILD_Boost "Build the Boost dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  CMAKE_DEPENDENT_OPTION(BUILD_soplex "Build the Soplex dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  CMAKE_DEPENDENT_OPTION(BUILD_SCIP "Build the SCIP dependency Library" OFF
    "NOT BUILD_DEPS" ON)
else()
  set(BUILD_Boost OFF)
  set(BUILD_soplex OFF)
  set(BUILD_SCIP OFF)
endif()
message(STATUS "Build Boost (Soplex requirement): ${BUILD_Boost}")
message(STATUS "Build Soplex (SCIP requirement): ${BUILD_soplex}")
message(STATUS "Build SCIP: ${BUILD_SCIP}")

# Optional third party solvers (disabled by default)
## CPLEX
option(USE_CPLEX "Use the CPLEX solver" OFF)
message(STATUS "CPLEX support: ${USE_CPLEX}")

## XPRESS
# Since it is dynamicaly loaded upon use, OFF is currently not supported.
CMAKE_DEPENDENT_OPTION(USE_XPRESS "Use the Xpress solver" ON "BUILD_CXX" OFF)
message(STATUS "Xpress support: ${USE_XPRESS}")

# Language specific options
if(BUILD_CXX)
  CMAKE_DEPENDENT_OPTION(BUILD_CXX_DOC "Build the C++ doc" OFF "NOT BUILD_DOC" ON)
  message(STATUS "C++: Build doc: ${BUILD_CXX_DOC}")
endif()

if(BUILD_PYTHON)
  CMAKE_DEPENDENT_OPTION(BUILD_pybind11 "Build the pybind11 dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Python: Build pybind11: ${BUILD_pybind11}")

  CMAKE_DEPENDENT_OPTION(BUILD_pybind11_abseil "Build the pybind11_abseil dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Python: Build pybind11_abseil: ${BUILD_pybind11_abseil}")

  CMAKE_DEPENDENT_OPTION(BUILD_pybind11_protobuf "Build the pybind11_protobuf dependency Library" OFF
    "NOT BUILD_DEPS" ON)
  message(STATUS "Python: Build pybind11_protobuf: ${BUILD_pybind11_protobuf}")

  option(GENERATE_PYTHON_STUB "Generate Python stub file (.pyi)" ON)
  message(STATUS "Python: Generate stub file: ${GENERATE_PYTHON_STUB}")

CMAKE_DEPENDENT_OPTION(BUILD_PYTHON_DOC "Build the Python doc" OFF "NOT BUILD_DOC" ON)
  message(STATUS "Python: Build doc: ${BUILD_PYTHON_DOC}")

  CMAKE_DEPENDENT_OPTION(BUILD_VENV "Create Python venv in BINARY_DIR/python/venv" OFF
    "NOT BUILD_TESTING" ON)
  message(STATUS "Python: Create venv: ${BUILD_VENV}")

  CMAKE_DEPENDENT_OPTION(VENV_USE_SYSTEM_SITE_PACKAGES "Python venv can use system site packages" OFF
    "BUILD_VENV" OFF)
  message(STATUS "Python: Allow venv to use system site packages: ${VENV_USE_SYSTEM_SITE_PACKAGES}")

  option(FETCH_PYTHON_DEPS "Install python required modules if not available" ${BUILD_DEPS})
  message(STATUS "Python: Fetch dependencies: ${FETCH_PYTHON_DEPS}")
endif()

# Find system deps
include(system_deps)

# Build Needed dependencies
add_subdirectory(cmake/dependencies dependencies)
list(APPEND CMAKE_PREFIX_PATH ${CMAKE_CURRENT_BINARY_DIR}/dependencies/install)

include(host)
# verify deps
include(check_deps)

include(cpp)
include(flatzinc)
include(glop)

include(python)

# Since samples mix all languages we must parse them once we have included all
# <language>.cmake files
foreach(SAMPLES IN ITEMS
 glop
 ${MATH_OPT_DIR}
 ${PDLP_DIR}
 sat)
  add_subdirectory(ortools/${SAMPLES}/samples)
endforeach()
