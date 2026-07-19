# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim

WORKDIR /repo

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    g++ \
    git \
    libcpp-httplib-dev \
    ninja-build \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY CMakeLists.txt Version.txt ./
COPY bridge-types ./bridge-types
COPY cmake ./cmake
COPY javascript/generated_proto_schemas.h.in ./javascript/generated_proto_schemas.h.in
COPY ortools ./ortools
COPY patches ./patches
COPY scripts/embed_proto.cmake ./scripts/embed_proto.cmake
COPY server ./server

RUN --mount=type=cache,id=ortools-native-cmake-build,target=/build/server,sharing=locked \
  set -eux; \
  major="$(sed -n 's/^OR_TOOLS_MAJOR=//p' Version.txt)"; \
  minor="$(sed -n 's/^OR_TOOLS_MINOR=//p' Version.txt)"; \
  echo "Building native OR-Tools ${major}.${minor} solver server"; \
  cmake -S server -B /build/server -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_DEPS=ON \
    -DBUILD_TESTING=OFF \
    -DBUILD_SAMPLES=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_PYTHON=OFF \
    -DBUILD_FLATZINC=OFF \
    -DBUILD_MATH_OPT=ON \
    -DUSE_BOP=ON \
    -DUSE_COINOR=ON \
    -DUSE_CPLEX=OFF \
    -DUSE_GUROBI=OFF \
    -DUSE_GLPK=ON \
    -DUSE_HIGHS=OFF \
    -DUSE_PDLP=ON \
    -DUSE_SCIP=ON \
    -DUSE_XPRESS=OFF; \
  cmake --build /build/server --target \
    ortools_server \
    server_job_scheduler_test \
    server_cp_sat_executor_test \
    server_knapsack_executor_test \
    server_network_flow_executor_test \
    server_mp_solver_executor_test \
    server_mathopt_executor_test \
    server_pdlp_executor_test \
    server_routing_executor_test \
    server_set_cover_executor_test \
    server_solver_job_service_test \
    server_config_test; \
  rm -rf /opt/ortools-server; \
  mkdir -p /opt; \
  cp -a /build/server /opt/ortools-server

RUN rm -rf /build/server \
  && mkdir -p /build \
  && ln -s /opt/ortools-server /build/server

CMD ["/build/server/ortools_server"]
