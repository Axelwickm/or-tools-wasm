#ifndef ORTOOLS_WASM_MP_SOLVER_MODEL_SNAPSHOT_H_
#define ORTOOLS_WASM_MP_SOLVER_MODEL_SNAPSHOT_H_

#include <string>
#include <utility>
#include <vector>

#include "absl/strings/match.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/model_validator.h"

namespace ortools_wasm {

// Recreate an editable linear snapshot through native modeling primitives.
// Unlike LoadModelFromProto(), construction preserves free rows and their IDs.
// Explicit proto imports continue to use the native importer and normalization.
inline operations_research::MPSolverResponseStatus PopulateMpSolverSnapshot(
    const operations_research::MPModelProto& model,
    operations_research::MPSolver& solver, std::string* error) {
  if (model.general_constraint_size() != 0 || model.has_quadratic_objective()) {
    *error = "Editable MPSolver snapshots support linear constraints and objectives only.";
    return operations_research::MPSOLVER_MODEL_INVALID;
  }
  *error = operations_research::FindErrorInMPModelProto(model);
  if (!error->empty()) {
    // Use the same native validator/status classification as LoadModelFromProto.
    return absl::StrContains(*error, "Infeasible")
        ? operations_research::MPSOLVER_INFEASIBLE : operations_research::MPSOLVER_MODEL_INVALID;
  }
  if (solver.NumVariables() != 0 || solver.NumConstraints() != 0) {
    *error = "MPSolver snapshot requires an empty solver.";
    return operations_research::MPSOLVER_MODEL_INVALID;
  }
  auto* objective = solver.MutableObjective();
  for (const auto& input : model.variable()) {
    auto* variable = solver.MakeVar(input.lower_bound(), input.upper_bound(),
                                    input.is_integer(), input.name());
    variable->SetBranchingPriority(input.branching_priority());
    objective->SetCoefficient(variable, input.objective_coefficient());
  }
  for (const auto& input : model.constraint()) {
    auto* row = solver.MakeRowConstraint(input.lower_bound(), input.upper_bound(),
                                         input.name());
    row->set_is_lazy(input.is_lazy());
    for (int i = 0; i < input.var_index_size(); ++i) {
      row->SetCoefficient(solver.variable(input.var_index(i)), input.coefficient(i));
    }
  }
  objective->SetOffset(model.objective_offset());
  objective->SetOptimizationDirection(model.maximize());
  std::vector<std::pair<const operations_research::MPVariable*, double>> hint;
  for (int i = 0; i < model.solution_hint().var_index_size(); ++i) {
    hint.emplace_back(solver.variable(model.solution_hint().var_index(i)),
                      model.solution_hint().var_value(i));
  }
  solver.SetHint(std::move(hint));
  return operations_research::MPSOLVER_MODEL_IS_VALID;
}

}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_MODEL_SNAPSHOT_H_
