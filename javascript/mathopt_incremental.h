#ifndef ORTOOLS_WASM_JAVASCRIPT_MATHOPT_INCREMENTAL_H_
#define ORTOOLS_WASM_JAVASCRIPT_MATHOPT_INCREMENTAL_H_

#include <memory>
#include <utility>

#include "absl/status/status.h"
#include "ortools/math_opt/core/solver.h"
#include "ortools/math_opt/rpc.pb.h"

namespace ortools_wasm {

inline absl::Status CheckMathOptSessionBackend(
    const operations_research::math_opt::SolveRequest& request,
    operations_research::math_opt::SolverTypeProto solver_type) {
  if (request.solver_type() != solver_type) {
    return absl::InvalidArgumentError(
        "MathOpt incremental request backend must match the session backend.");
  }
  return absl::OkStatus();
}

// Mirrors native IncrementalSolver: rebuild only when native Update declines.
inline absl::Status UpdateMathOptSolver(
    std::unique_ptr<operations_research::math_opt::Solver>& solver,
    const operations_research::math_opt::SolveRequest& request,
    operations_research::math_opt::SolverTypeProto solver_type,
    const operations_research::math_opt::Solver::InitArgs& init_args,
    operations_research::math_opt::ModelUpdateProto update) {
  auto updated = solver->Update(std::move(update));
  if (!updated.ok()) return updated.status();
  if (*updated) return absl::OkStatus();
  auto replacement = operations_research::math_opt::Solver::New(
      solver_type, request.model(), init_args);
  if (!replacement.ok()) return replacement.status();
  solver = std::move(*replacement);
  return absl::OkStatus();
}

}  // namespace ortools_wasm
#endif
