#ifndef ORTOOLS_WASM_MP_SOLVER_SOLUTION_VERIFICATION_H_
#define ORTOOLS_WASM_MP_SOLVER_SOLUTION_VERIFICATION_H_

#include <limits>
#include <string>

#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "javascript/mp_solver_model_snapshot.h"

namespace ortools_wasm {
inline absl::StatusOr<bool> VerifyMpSolverSolution(
    const std::string& model_bytes, const std::string& solution_bytes,
    int solver_type, double tolerance, bool log_errors) {
  using operations_research::MPSolver;
  operations_research::MPModelProto model;
  operations_research::MPSolutionResponse solution;
  if (!model.ParseFromString(model_bytes)) {
    return absl::InvalidArgumentError("Failed to parse MPModelProto.");
  }
  if (!solution.ParseFromString(solution_bytes)) {
    return absl::InvalidArgumentError("Failed to parse MPSolutionResponse.");
  }
  const auto type = static_cast<MPSolver::OptimizationProblemType>(solver_type);
  if (!MPSolver::SupportsProblemType(type)) {
    return absl::InvalidArgumentError("The requested MPSolver backend is unavailable.");
  }
  MPSolver solver(model.name(), type);
  std::string error;
  if (PopulateMpSolverSnapshot(model, solver, &error) !=
      operations_research::MPSOLVER_MODEL_IS_VALID) {
    return absl::InvalidArgumentError(error);
  }
  // Let VerifySolution check bounds and log violations, rather than rejecting
  // them while loading the snapshot. No optimization is performed.
  const auto loaded = solver.LoadSolutionFromProto(
      solution, std::numeric_limits<double>::infinity());
  if (!loaded.ok()) return loaded;
  return solver.VerifySolution(tolerance, log_errors);
}
}  // namespace ortools_wasm
#endif
