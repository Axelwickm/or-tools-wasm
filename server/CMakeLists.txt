cmake_minimum_required(VERSION 3.20)

project(ortools_native_server LANGUAGES C CXX)

include(CTest)
include(FetchContent)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)

find_package(PkgConfig REQUIRED)
pkg_search_module(CPP_HTTPLIB IMPORTED_TARGET cpp-httplib httplib)
if(TARGET PkgConfig::CPP_HTTPLIB)
  add_library(server_cpp_httplib INTERFACE)
  target_link_libraries(server_cpp_httplib INTERFACE PkgConfig::CPP_HTTPLIB)
else()
  FetchContent_Declare(
    cpp_httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.27.0)
  FetchContent_MakeAvailable(cpp_httplib)
  add_library(server_cpp_httplib INTERFACE)
  target_link_libraries(server_cpp_httplib INTERFACE httplib::httplib)
endif()

set(BUILD_CXX ON CACHE BOOL "Build OR-Tools C++ library" FORCE)
set(BUILD_PYTHON OFF CACHE BOOL "Build Python wrapper" FORCE)
set(BUILD_FLATZINC OFF CACHE BOOL "Build FlatZinc" FORCE)
set(BUILD_MATH_OPT ON CACHE BOOL "Build MathOpt" FORCE)
set(BUILD_SAMPLES OFF CACHE BOOL "Build OR-Tools samples" FORCE)
set(BUILD_EXAMPLES OFF CACHE BOOL "Build OR-Tools examples" FORCE)
set(USE_BOP ON CACHE BOOL "Use BOP solver" FORCE)
set(USE_COINOR ON CACHE BOOL "Use COIN-OR solver" FORCE)
set(USE_CPLEX OFF CACHE BOOL "Use CPLEX solver" FORCE)
set(USE_GUROBI OFF CACHE BOOL "Use Gurobi solver" FORCE)
set(USE_GLPK ON CACHE BOOL "Use GLPK solver" FORCE)
set(USE_HIGHS OFF CACHE BOOL "Use HiGHS solver" FORCE)
set(USE_PDLP ON CACHE BOOL "Use PDLP solver" FORCE)
set(USE_SCIP ON CACHE BOOL "Use SCIP solver" FORCE)
set(USE_XPRESS OFF CACHE BOOL "Use Xpress solver" FORCE)

if(NOT TARGET ortools::ortools)
  add_subdirectory("${REPO_ROOT}" "${CMAKE_BINARY_DIR}/ortools" EXCLUDE_FROM_ALL)
endif()

set(BRIDGE_PROTO_OUT_DIR "${CMAKE_BINARY_DIR}/server_bridge_protos")
set(PROTO_SCHEMA_HEADER "${CMAKE_BINARY_DIR}/server_proto_schemas/generated_proto_schemas.h")
set(SERVER_CP_MODEL_PROTO "${REPO_ROOT}/ortools/sat/cp_model.proto")
set(SERVER_SAT_PARAMETERS_PROTO "${REPO_ROOT}/ortools/sat/sat_parameters.proto")
set(SERVER_LINEAR_SOLVER_PROTO "${REPO_ROOT}/ortools/linear_solver/linear_solver.proto")
set(SERVER_OPTIONAL_BOOLEAN_PROTO "${REPO_ROOT}/ortools/util/optional_boolean.proto")
set(SERVER_PROTO_SCHEMA_TEMPLATE "${REPO_ROOT}/javascript/generated_proto_schemas.h.in")
set(BRIDGE_PROTO_SRCS
  "${BRIDGE_PROTO_OUT_DIR}/job.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/cp_sat.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/knapsack.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/mathopt.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/mp_solver.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/network_flow.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/pdlp.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/routing.pb.cc"
  "${BRIDGE_PROTO_OUT_DIR}/set_cover.pb.cc")
set(BRIDGE_PROTO_HDRS
  "${BRIDGE_PROTO_OUT_DIR}/job.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/cp_sat.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/knapsack.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/mathopt.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/mp_solver.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/network_flow.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/pdlp.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/routing.pb.h"
  "${BRIDGE_PROTO_OUT_DIR}/set_cover.pb.h")

add_custom_command(
  OUTPUT ${BRIDGE_PROTO_SRCS} ${BRIDGE_PROTO_HDRS}
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${BRIDGE_PROTO_OUT_DIR}"
  COMMAND protobuf::protoc
    "--proto_path=${REPO_ROOT}/bridge-types"
    "--cpp_out=${BRIDGE_PROTO_OUT_DIR}"
    "job.proto"
    "cp_sat.proto"
    "knapsack.proto"
    "mathopt.proto"
    "mp_solver.proto"
    "network_flow.proto"
    "pdlp.proto"
    "routing.proto"
    "set_cover.proto"
  DEPENDS
    "${REPO_ROOT}/bridge-types/job.proto"
    "${REPO_ROOT}/bridge-types/cp_sat.proto"
    "${REPO_ROOT}/bridge-types/knapsack.proto"
    "${REPO_ROOT}/bridge-types/mathopt.proto"
    "${REPO_ROOT}/bridge-types/mp_solver.proto"
    "${REPO_ROOT}/bridge-types/network_flow.proto"
    "${REPO_ROOT}/bridge-types/pdlp.proto"
    "${REPO_ROOT}/bridge-types/routing.proto"
    "${REPO_ROOT}/bridge-types/set_cover.proto"
    protobuf::protoc
  COMMENT "Generate C++ protobufs for server bridge types"
  VERBATIM)

add_library(server_bridge_proto OBJECT ${BRIDGE_PROTO_SRCS} ${BRIDGE_PROTO_HDRS})
target_include_directories(server_bridge_proto PUBLIC "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_bridge_proto PUBLIC protobuf::libprotobuf)

add_custom_command(
  OUTPUT "${PROTO_SCHEMA_HEADER}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_BINARY_DIR}/server_proto_schemas"
  COMMAND "${CMAKE_COMMAND}"
          "-DCP_MODEL_PROTO=${SERVER_CP_MODEL_PROTO}"
          "-DSAT_PARAMETERS_PROTO=${SERVER_SAT_PARAMETERS_PROTO}"
          "-DLINEAR_SOLVER_PROTO=${SERVER_LINEAR_SOLVER_PROTO}"
          "-DOPTIONAL_BOOLEAN_PROTO=${SERVER_OPTIONAL_BOOLEAN_PROTO}"
          "-DTEMPLATE_FILE=${SERVER_PROTO_SCHEMA_TEMPLATE}"
          "-DOUTPUT_FILE=${PROTO_SCHEMA_HEADER}"
          -P "${REPO_ROOT}/scripts/embed_proto.cmake"
  DEPENDS
    "${REPO_ROOT}/scripts/embed_proto.cmake"
    "${SERVER_PROTO_SCHEMA_TEMPLATE}"
    "${SERVER_CP_MODEL_PROTO}"
    "${SERVER_SAT_PARAMETERS_PROTO}"
    "${SERVER_LINEAR_SOLVER_PROTO}"
    "${SERVER_OPTIONAL_BOOLEAN_PROTO}"
  COMMENT "Generate server proto schema strings"
  VERBATIM)
add_custom_target(server_proto_schemas DEPENDS "${PROTO_SCHEMA_HEADER}")

add_library(server_ortools_link_shims OBJECT
  "${REPO_ROOT}/ortools/linear_solver/knapsack_interface.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/glop_proto_solver.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/pdlp_proto_solver.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/preprocessor.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/sat_proto_solver.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/sat_solver_utils.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/scip_params.cc"
  "${REPO_ROOT}/ortools/linear_solver/proto_solver/scip_proto_solver.cc"
  "${REPO_ROOT}/ortools/third_party_solvers/gurobi_environment.cc")
target_link_libraries(server_ortools_link_shims PRIVATE ortools::ortools)

add_executable(ortools_server
  src/cp_sat_executor.cc
  src/http_server.cc
  src/job_scheduler.cc
  src/knapsack_executor.cc
  src/mathopt_executor.cc
  src/mp_solver_executor.cc
  src/main.cc
  src/network_flow_executor.cc
  src/pdlp_executor.cc
  src/routing_executor.cc
  src/set_cover_executor.cc
  src/server_config.cc
  src/solver_job_service.cc)
add_dependencies(ortools_server server_proto_schemas)
target_include_directories(ortools_server PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}"
  "${CMAKE_BINARY_DIR}/server_proto_schemas")
target_link_libraries(ortools_server PRIVATE
  Eigen3::Eigen
  ortools::ortools
  protobuf::libprotobuf
  server_cpp_httplib
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_job_scheduler_test
  src/job_scheduler.cc
  src/job_scheduler_test.cc)
target_include_directories(server_job_scheduler_test PRIVATE "${REPO_ROOT}")

add_executable(server_config_test
  src/server_config.cc
  src/server_config_test.cc)
target_include_directories(server_config_test PRIVATE "${REPO_ROOT}")

add_executable(server_solver_job_service_test
  src/job_scheduler.cc
  src/solver_job_service.cc
  src/solver_job_service_test.cc)
target_include_directories(server_solver_job_service_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_solver_job_service_test PRIVATE
  protobuf::libprotobuf
  server_bridge_proto)

add_executable(server_cp_sat_executor_test
  src/cp_sat_executor.cc
  src/cp_sat_executor_test.cc
  src/job_scheduler.cc)
add_dependencies(server_cp_sat_executor_test server_proto_schemas)
target_include_directories(server_cp_sat_executor_test PRIVATE
  "${REPO_ROOT}"
  "${CMAKE_BINARY_DIR}/server_proto_schemas")
target_link_libraries(server_cp_sat_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_knapsack_executor_test
  src/job_scheduler.cc
  src/knapsack_executor.cc
  src/knapsack_executor_test.cc)
target_include_directories(server_knapsack_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_knapsack_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_network_flow_executor_test
  src/job_scheduler.cc
  src/network_flow_executor.cc
  src/network_flow_executor_test.cc)
target_include_directories(server_network_flow_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_network_flow_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_mp_solver_executor_test
  src/job_scheduler.cc
  src/mp_solver_executor.cc
  src/mp_solver_executor_test.cc)
add_dependencies(server_mp_solver_executor_test server_proto_schemas)
target_include_directories(server_mp_solver_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}"
  "${CMAKE_BINARY_DIR}/server_proto_schemas")
target_link_libraries(server_mp_solver_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_mathopt_executor_test
  src/job_scheduler.cc
  src/mathopt_executor.cc
  src/mathopt_executor_test.cc)
target_include_directories(server_mathopt_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_mathopt_executor_test PRIVATE
  Eigen3::Eigen
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_set_cover_executor_test
  src/job_scheduler.cc
  src/set_cover_executor.cc
  src/set_cover_executor_test.cc)
target_include_directories(server_set_cover_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_set_cover_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_pdlp_executor_test
  src/job_scheduler.cc
  src/pdlp_executor.cc
  src/pdlp_executor_test.cc)
target_include_directories(server_pdlp_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_pdlp_executor_test PRIVATE
  Eigen3::Eigen
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

add_executable(server_routing_executor_test
  src/job_scheduler.cc
  src/routing_executor.cc
  src/routing_executor_test.cc)
target_include_directories(server_routing_executor_test PRIVATE
  "${REPO_ROOT}"
  "${BRIDGE_PROTO_OUT_DIR}")
target_link_libraries(server_routing_executor_test PRIVATE
  ortools::ortools
  server_bridge_proto
  server_ortools_link_shims)

if(BUILD_TESTING)
  add_test(NAME server_job_scheduler_test COMMAND server_job_scheduler_test)
  add_test(NAME server_config_test COMMAND server_config_test)
  add_test(NAME server_solver_job_service_test COMMAND server_solver_job_service_test)
  add_test(NAME server_cp_sat_executor_test COMMAND server_cp_sat_executor_test)
  add_test(NAME server_knapsack_executor_test COMMAND server_knapsack_executor_test)
  add_test(NAME server_network_flow_executor_test COMMAND server_network_flow_executor_test)
  add_test(NAME server_mp_solver_executor_test COMMAND server_mp_solver_executor_test)
  add_test(NAME server_mathopt_executor_test COMMAND server_mathopt_executor_test)
  add_test(NAME server_set_cover_executor_test COMMAND server_set_cover_executor_test)
  add_test(NAME server_pdlp_executor_test COMMAND server_pdlp_executor_test)
  add_test(NAME server_routing_executor_test COMMAND server_routing_executor_test)
endif()
