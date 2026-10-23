# syntax=docker/dockerfile:1.7

FROM debian:trixie-slim

WORKDIR /repo

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    g++ \
    git \
    libcpp-httplib-dev \
    libssl-dev \
    ninja-build \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY CMakeLists.txt Version.txt ./
COPY bridge-types ./bridge-types
COPY cmake ./cmake
COPY javascript/generated_proto_schemas.h.in ./javascript/generated_proto_schemas.h.in
COPY javascript/cp_sat_statistics.h ./javascript/cp_sat_statistics.h
COPY javascript/cp_sat_model_export.h ./javascript/cp_sat_model_export.h
COPY javascript/cp_sat_solution_check.h ./javascript/cp_sat_solution_check.h
COPY javascript/knapsack_validation.h ./javascript/knapsack_validation.h
COPY javascript/network_flow_validation.h ./javascript/network_flow_validation.h
COPY javascript/mathopt_mps_conversion.h ./javascript/mathopt_mps_conversion.h
COPY javascript/mathopt_result_validation.h ./javascript/mathopt_result_validation.h
COPY javascript/mathopt_feasibility.h ./javascript/mathopt_feasibility.h
COPY javascript/mathopt_expression_bounds.h ./javascript/mathopt_expression_bounds.h
COPY javascript/mathopt_solution_improvement.h ./javascript/mathopt_solution_improvement.h
COPY javascript/mathopt_model_transform.h ./javascript/mathopt_model_transform.h
COPY javascript/mathopt_result_conversion.h ./javascript/mathopt_result_conversion.h
COPY javascript/set_cover_statistics.h ./javascript/set_cover_statistics.h
COPY javascript/set_cover_lagrangian.h ./javascript/set_cover_lagrangian.h
COPY javascript/set_cover_cft.h ./javascript/set_cover_cft.h
COPY javascript/set_cover_mip.h ./javascript/set_cover_mip.h
COPY javascript/set_cover_guided_tabu.h ./javascript/set_cover_guided_tabu.h
COPY javascript/set_cover_guided_session.h ./javascript/set_cover_guided_session.h
COPY javascript/set_cover_trace.h ./javascript/set_cover_trace.h
COPY javascript/set_cover_mutations.h ./javascript/set_cover_mutations.h
COPY javascript/set_cover_formats.h ./javascript/set_cover_formats.h
COPY javascript/pdlp_model_import.h ./javascript/pdlp_model_import.h
COPY javascript/mathopt_thread_budget.h ./javascript/mathopt_thread_budget.h
COPY javascript/mathopt_incremental.h ./javascript/mathopt_incremental.h
COPY javascript/mp_solver_parameters.h ./javascript/mp_solver_parameters.h
COPY javascript/mp_solver_messages.h ./javascript/mp_solver_messages.h
COPY javascript/mp_solver_search.h ./javascript/mp_solver_search.h
COPY javascript/session_registry.h ./javascript/session_registry.h
COPY javascript/mp_solver_session.h ./javascript/mp_solver_session.h
COPY javascript/mp_solver_solution_verification.h ./javascript/mp_solver_solution_verification.h
COPY javascript/mp_solver_model_import.h ./javascript/mp_solver_model_import.h
COPY javascript/mp_solver_model_queries.h ./javascript/mp_solver_model_queries.h
COPY javascript/mp_solver_model_snapshot.h ./javascript/mp_solver_model_snapshot.h
COPY javascript/routing_progress.h ./javascript/routing_progress.h
COPY javascript/routing_index_validation.h ./javascript/routing_index_validation.h
COPY javascript/routing_successor_domains.h ./javascript/routing_successor_domains.h
COPY javascript/routing_variable_domains.h ./javascript/routing_variable_domains.h
COPY javascript/routing_dimension_construction.h ./javascript/routing_dimension_construction.h
COPY javascript/routing_model_builder.h ./javascript/routing_model_builder.h
COPY javascript/routing_dimension_bounds.h ./javascript/routing_dimension_bounds.h
COPY javascript/routing_vehicle_costs.h ./javascript/routing_vehicle_costs.h
COPY javascript/routing_transit_matrix.h ./javascript/routing_transit_matrix.h
COPY javascript/routing_state_dependent_transit.h ./javascript/routing_state_dependent_transit.h
COPY javascript/routing_pickup_delivery.h ./javascript/routing_pickup_delivery.h
COPY javascript/routing_assignments.h ./javascript/routing_assignments.h
COPY javascript/routing_assignment_workflows.h ./javascript/routing_assignment_workflows.h
COPY javascript/routing_route_callbacks.h ./javascript/routing_route_callbacks.h
COPY javascript/routing_dimension_inspection.h ./javascript/routing_dimension_inspection.h
COPY javascript/routing_model_inspection.h ./javascript/routing_model_inspection.h
COPY javascript/routing_resources.h ./javascript/routing_resources.h
COPY javascript/routing_breaks.h ./javascript/routing_breaks.h
COPY javascript/routing_visit_types.h ./javascript/routing_visit_types.h
COPY javascript/routing_finalizers.h ./javascript/routing_finalizers.h
COPY javascript/routing_variables.h ./javascript/routing_variables.h
COPY javascript/routing_linear_constraints.h ./javascript/routing_linear_constraints.h
COPY javascript/routing_search_configuration.h ./javascript/routing_search_configuration.h
COPY javascript/routing_group_controls.h ./javascript/routing_group_controls.h
COPY javascript/routing_search_parameters.h ./javascript/routing_search_parameters.h
COPY ortools ./ortools
COPY patches ./patches
COPY scripts/embed_proto.cmake ./scripts/embed_proto.cmake
COPY server ./server

ARG NATIVE_BUILD_CACHE_ID=ortools-native-cmake-build
ARG NATIVE_BUILD_JOBS=4
RUN --mount=type=cache,id=${NATIVE_BUILD_CACHE_ID},target=/build/server,sharing=locked \
  set -eux; \
  # COPY preserves timestamps; cached objects may be newer than changed sources. \
  # Refresh copied sources so the native cache cannot reuse a different snapshot. \
  find . -type f -exec touch {} +; \
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
  cmake --build /build/server --parallel "$NATIVE_BUILD_JOBS" --target \
    ortools_server \
    server_tests; \
  rm -rf /opt/ortools-server; \
  mkdir -p /opt; \
  cp -a /build/server /opt/ortools-server

RUN rm -rf /build/server \
  && mkdir -p /build \
  && ln -s /opt/ortools-server /build/server

USER 10001:10001

CMD ["/build/server/ortools_server"]
