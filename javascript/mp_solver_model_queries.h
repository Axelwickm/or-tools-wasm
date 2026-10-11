#ifndef ORTOOLS_WASM_MP_SOLVER_MODEL_QUERIES_H_
#define ORTOOLS_WASM_MP_SOLVER_MODEL_QUERIES_H_

#include <limits>
#include <cmath>
#include <string>

#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "mp_solver.pb.h"
#include "javascript/mp_solver_model_snapshot.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/model_exporter.h"
#include "ortools/linear_solver/model_validator.h"

namespace ortools_wasm {

inline absl::StatusOr<bridge::v1::MpSolverBridgeResponse> QueryMpSolverModel(
    const bridge::v1::MpSolverBridgeRequest& request) {
  namespace wire = bridge::v1;
  using operations_research::MPSolver;
  operations_research::MPModelProto model;
  const auto& bytes = request.has_export_model() ? request.export_model().model_proto()
      : request.has_load_solution() ? request.load_solution().model_proto() : request.activities().model_proto();
  if (!model.ParseFromString(bytes)) return absl::InvalidArgumentError("Failed to parse MPModelProto.");
  const auto error = operations_research::FindErrorInMPModelProto(model);
  if (!error.empty()) return absl::InvalidArgumentError(error);
  wire::MpSolverBridgeResponse response;
  if (request.has_export_model()) {
    const auto& input = request.export_model();
    operations_research::MPModelExportOptions options;
    options.obfuscate = input.obfuscate();
    // Like MPSolver::ExportModelAsMpsFormat, native free-format export ignores
    // fixed_format. Naming, objective offsets and row formatting remain native.
    absl::StatusOr<std::string> text = absl::InvalidArgumentError("Unknown MPSolver export format.");
    switch (input.format()) {
      case wire::MpSolverExportModelRequest::LP:
        text = operations_research::ExportModelAsLpFormat(model, options); break;
      case wire::MpSolverExportModelRequest::MPS:
        text = operations_research::ExportModelAsMpsFormat(model, options); break;
      default: break;
    }
    if (!text.ok()) return text.status();
    response.set_exported_model(*text);
  } else if (request.has_load_solution()) {
    const auto& input = request.load_solution();
    operations_research::MPSolutionResponse solution;
    if (!solution.ParseFromString(input.solution_proto())) return absl::InvalidArgumentError("Failed to parse MPSolutionResponse.");
    const auto type = static_cast<MPSolver::OptimizationProblemType>(input.solver_type());
    if (!MPSolver::SupportsProblemType(type)) return absl::InvalidArgumentError("The requested MPSolver backend is unavailable.");
    MPSolver solver(model.name(), type);
    std::string load_error;
    if (PopulateMpSolverSnapshot(model, solver, &load_error) != operations_research::MPSOLVER_MODEL_IS_VALID)
      return absl::InvalidArgumentError(load_error);
    auto* result = response.mutable_load_solution();
    // Retain the wrapper's input-safety contract; native owns all dimensional,
    // status and tolerance/bound checks. Never commit a partially loaded answer.
    if (std::isnan(input.tolerance())) return response;
    for (double value : solution.variable_value()) if (std::isnan(value)) return response;
    if (!solver.LoadSolutionFromProto(solution, input.tolerance()).ok()) return response;
    result->set_loaded(true);
    solver.FillSolutionResponseProto(&solution);
    result->set_solution_proto(solution.SerializeAsString());
  } else if (request.has_activities()) {
    const auto& input = request.activities();
    operations_research::MPSolutionResponse solution;
    if (!solution.ParseFromString(input.solution_proto())) return absl::InvalidArgumentError("Failed to parse MPSolutionResponse.");
    const auto type = static_cast<MPSolver::OptimizationProblemType>(input.solver_type());
    if (!MPSolver::SupportsProblemType(type)) return absl::InvalidArgumentError("The requested MPSolver backend is unavailable.");
    MPSolver solver(model.name(), type);
    std::string load_error;
    if (PopulateMpSolverSnapshot(model, solver, &load_error) != operations_research::MPSOLVER_MODEL_IS_VALID)
      return absl::InvalidArgumentError(load_error);
    const auto loaded = solver.LoadSolutionFromProto(solution, std::numeric_limits<double>::infinity());
    if (!loaded.ok()) return loaded;
    auto* result = response.mutable_activities();
    for (double value : solver.ComputeConstraintActivities()) result->add_activities(value);
  } else {
    return absl::InvalidArgumentError("MPSolver request has no model query.");
  }
  return response;
}

}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_MODEL_QUERIES_H_
