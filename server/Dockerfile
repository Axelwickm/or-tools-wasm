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

RUN set -eux; \
  major="$(sed -n 's/^OR_TOOLS_MAJOR=//p' Version.txt)"; \
  minor="$(sed -n 's/^OR_TOOLS_MINOR=//p' Version.txt)"; \
  echo "Building native OR-Tools ${major}.${minor} CP-SAT hello world"; \
  cmake -S server -B /build/server -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_DEPS=ON \
    -DBUILD_TESTING=OFF \
    -DBUILD_SAMPLES=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_PYTHON=OFF \
    -DBUILD_FLATZINC=OFF \
    -DBUILD_MATH_OPT=OFF \
    -DUSE_COINOR=OFF \
    -DUSE_CPLEX=OFF \
    -DUSE_GUROBI=OFF \
    -DUSE_GLPK=OFF \
    -DUSE_HIGHS=OFF \
    -DUSE_PDLP=OFF \
    -DUSE_SCIP=OFF \
    -DUSE_XPRESS=OFF; \
  cmake --build /build/server --target \
    server_cp_sat_hello \
    server_job_scheduler_test \
    server_config_test

CMD ["/build/server/server_cp_sat_hello"]
