#ifndef ORTOOLS_WASM_MP_SOLVER_MODEL_IMPORT_H_
#define ORTOOLS_WASM_MP_SOLVER_MODEL_IMPORT_H_
#include <string>
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/linear_solver/model_validator.h"
namespace ortools_wasm {
inline std::string FindErrorInMpModelBytes(const std::string& bytes) {
  operations_research::MPModelProto model;
  if (!model.ParseFromString(bytes)) return "Failed to parse MPModelProto.";
  return operations_research::FindErrorInMPModelProto(model);
}
struct MpSolverModelImportResult {
  int status = operations_research::MPSOLVER_MODEL_INVALID;
  std::string error;
  operations_research::MPModelProto model;
};
inline MpSolverModelImportResult ImportMpSolverModel(const std::string& bytes,
                                                     int solver_type,
                                                     const std::string& name,
                                                     bool keep_names) {
  using operations_research::MPSolver;
  MpSolverModelImportResult result;
  operations_research::MPModelProto input;
  if (!input.ParseFromString(bytes)) { result.error = "Failed to parse MPModelProto."; return result; }
  // Editable JavaScript state represents linear rows only. Raw proto solving
  // remains available for backend-specific general and quadratic models.
  if (input.general_constraint_size() != 0 || input.has_quadratic_objective()) {
    result.error = "Editable model import supports linear constraints and objectives only; use solveModelRequest for general or quadratic models.";
    return result;
  }
  const auto type = static_cast<MPSolver::OptimizationProblemType>(solver_type);
  if (!MPSolver::SupportsProblemType(type)) {
    result.status = operations_research::MPSOLVER_SOLVER_TYPE_UNAVAILABLE;
    result.error = "The requested MPSolver backend is unavailable.";
    return result;
  }
  MPSolver solver(name, type);
  result.status = solver.LoadModelFromProto(input, &result.error, !keep_names);
  if (result.status == operations_research::MPSOLVER_MODEL_IS_VALID) solver.ExportModelToProto(&result.model);
  return result;
}
}  // namespace ortools_wasm
#endif
