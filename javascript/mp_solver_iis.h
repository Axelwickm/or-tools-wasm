#ifndef ORTOOLS_WASM_MP_SOLVER_IIS_H_
#define ORTOOLS_WASM_MP_SOLVER_IIS_H_

#include <atomic>
#include <cmath>
#include <optional>
#include <string>

#include "absl/status/statusor.h"
#include "mp_solver.pb.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"

namespace ortools_wasm {
inline absl::StatusOr<bridge::v1::MpSolverIisResult> ComputeMpSolverIis(
    const bridge::v1::MpSolverIisRequest& request,
    const std::atomic<bool>* interrupt = nullptr) {
  using operations_research::MPSolver;
  operations_research::MPModelProto model;
  if (!model.ParseFromString(request.model_proto()))
    return absl::InvalidArgumentError("Failed to parse MPModelProto for IIS.");
  if (model.general_constraint_size() || model.has_quadratic_objective())
    return absl::InvalidArgumentError("MPSolver IIS supports linear models; general constraints and quadratic objectives are unsupported.");
  if (request.has_time_limit_seconds() &&
      (!std::isfinite(request.time_limit_seconds()) || request.time_limit_seconds() < 0))
    return absl::InvalidArgumentError("IIS timeLimitSeconds must be finite and nonnegative.");
  const auto type = static_cast<MPSolver::OptimizationProblemType>(request.solver_type());
  if (!MPSolver::SupportsProblemType(type))
    return absl::InvalidArgumentError("The requested MPSolver IIS backend is unavailable.");
  MPSolver solver(model.name(), type);
  std::string error;
  if (solver.LoadModelFromProto(model, &error) != operations_research::MPSOLVER_MODEL_IS_VALID)
    return absl::InvalidArgumentError(error);
  if (!request.solver_specific_parameters().empty() &&
      !solver.SetSolverSpecificParametersAsString(request.solver_specific_parameters()))
    return absl::InvalidArgumentError("MPSolver IIS solver-specific parameters could not be applied.");
  // Native IIS generation calls serial SCIPsolve() in its copied subproblems.
  // Its limit fields override the corresponding native parameter settings.
  auto found = solver.ComputeIrreducibleInfeasibleSubset(interrupt,
      request.has_time_limit_seconds() ? std::make_optional(request.time_limit_seconds()) : std::nullopt,
      request.has_node_limit() ? std::make_optional(request.node_limit()) : std::nullopt);
  if (!found.ok()) return found.status();
  bridge::v1::MpSolverIisResult result;
  result.set_is_infeasible(found->is_infeasible);
  result.set_is_irreducible(found->is_irreducible);
  result.set_time_seconds(found->time_seconds);
  result.set_nodes(found->nodes);
  for (const auto index : found->constraint_indices) result.add_constraint_indices(index);
  for (const auto& bound : found->variable_bounds) {
    auto* value = result.add_variable_bounds();
    value->set_variable_index(bound.variable_index);
    value->set_lower_bound_included(bound.lower_bound);
    value->set_upper_bound_included(bound.upper_bound);
  }
  return result;
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_IIS_H_
