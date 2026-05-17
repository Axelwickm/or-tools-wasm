// Minimal C API surface for MPSolver over WASM.
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/linear_solver/linear_solver.h"

namespace {

using operations_research::MPConstraint;
using operations_research::MPObjective;
using operations_research::MPSolver;
using operations_research::MPSolverParameters;
using operations_research::MPVariable;

struct VariableHandle {
  int solver_handle = 0;
  MPVariable* variable = nullptr;
};

struct ConstraintHandle {
  int solver_handle = 0;
  MPConstraint* constraint = nullptr;
};

int g_next_solver_handle = 1;
int g_next_variable_handle = 1;
int g_next_constraint_handle = 1;
int g_next_parameters_handle = 1;

std::unordered_map<int, std::unique_ptr<MPSolver>> g_solvers;
std::unordered_map<int, VariableHandle> g_variables;
std::unordered_map<int, ConstraintHandle> g_constraints;
std::unordered_map<int, std::unique_ptr<MPSolverParameters>> g_parameters;
std::string g_string_result;

MPSolver* GetSolver(int solver_handle) {
  const auto it = g_solvers.find(solver_handle);
  return it == g_solvers.end() ? nullptr : it->second.get();
}

VariableHandle* GetVariable(int variable_handle) {
  const auto it = g_variables.find(variable_handle);
  return it == g_variables.end() ? nullptr : &it->second;
}

ConstraintHandle* GetConstraint(int constraint_handle) {
  const auto it = g_constraints.find(constraint_handle);
  return it == g_constraints.end() ? nullptr : &it->second;
}

MPSolverParameters* GetParameters(int parameters_handle) {
  const auto it = g_parameters.find(parameters_handle);
  return it == g_parameters.end() ? nullptr : it->second.get();
}

int StoreVariable(int solver_handle, MPVariable* variable) {
  if (variable == nullptr) return 0;
  const int handle = g_next_variable_handle++;
  g_variables.emplace(handle, VariableHandle{solver_handle, variable});
  return handle;
}

int StoreConstraint(int solver_handle, MPConstraint* constraint) {
  if (constraint == nullptr) return 0;
  const int handle = g_next_constraint_handle++;
  g_constraints.emplace(handle, ConstraintHandle{solver_handle, constraint});
  return handle;
}

MPSolver::OptimizationProblemType ParseSolverType(int problem_type) {
  return static_cast<MPSolver::OptimizationProblemType>(problem_type);
}

const char* StoreString(std::string value) {
  g_string_result = std::move(value);
  return g_string_result.c_str();
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE double mp_solver_infinity() {
  return MPSolver::infinity();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_supports_problem_type(int problem_type) {
  return MPSolver::SupportsProblemType(ParseSolverType(problem_type)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_create(const char* name, int problem_type) {
  if (name == nullptr) return 0;
  const int handle = g_next_solver_handle++;
  auto solver = std::make_unique<MPSolver>(name, ParseSolverType(problem_type));
  g_solvers.emplace(handle, std::move(solver));
  return handle;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_create_solver(const char* solver_id) {
  if (solver_id == nullptr) return 0;
  std::unique_ptr<MPSolver> solver(MPSolver::CreateSolver(solver_id));
  if (!solver) return 0;
  const int handle = g_next_solver_handle++;
  g_solvers.emplace(handle, std::move(solver));
  return handle;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parse_solver_type(const char* solver_id) {
  if (solver_id == nullptr) return -1;
  MPSolver::OptimizationProblemType problem_type;
  if (!MPSolver::ParseSolverType(solver_id, &problem_type)) return -1;
  return problem_type;
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_name(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->Name());
}

EMSCRIPTEN_KEEPALIVE int mp_solver_problem_type(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? -1 : solver->ProblemType();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_is_mip(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->IsMIP() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_clear(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  for (auto it = g_variables.begin(); it != g_variables.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_variables.erase(it);
    } else {
      ++it;
    }
  }
  for (auto it = g_constraints.begin(); it != g_constraints.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_constraints.erase(it);
    } else {
      ++it;
    }
  }
  solver->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_delete(int solver_handle) {
  for (auto it = g_variables.begin(); it != g_variables.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_variables.erase(it);
    } else {
      ++it;
    }
  }
  for (auto it = g_constraints.begin(); it != g_constraints.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_constraints.erase(it);
    } else {
      ++it;
    }
  }
  g_solvers.erase(solver_handle);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_variable(int solver_handle, int index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || index < 0 || index >= solver->NumVariables()) return 0;
  return StoreVariable(solver_handle, solver->variable(index));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_lookup_variable(int solver_handle,
                                                   const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->LookupVariableOrNull(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_var(int solver_handle, double lb,
                                           double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeNumVar(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_var(int solver_handle, double lb, double ub,
                                       int integer, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle,
                       solver->MakeVar(lb, ub, integer != 0, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_int_var(int solver_handle, double lb,
                                           double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeIntVar(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_bool_var(int solver_handle,
                                            const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeBoolVar(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_constraint(int solver_handle, int index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || index < 0 || index >= solver->NumConstraints()) {
    return 0;
  }
  return StoreConstraint(solver_handle, solver->constraint(index));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_lookup_constraint(int solver_handle,
                                                     const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->LookupConstraintOrNull(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_row_constraint(int solver_handle, double lb,
                                                  double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->MakeRowConstraint(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_unbounded_row_constraint(
    int solver_handle, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->MakeRowConstraint(name));
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_clear(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_coefficient(
    int constraint_handle, int variable_handle, double coefficient) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (constraint == nullptr || variable == nullptr ||
      constraint->solver_handle != variable->solver_handle) {
    return;
  }
  constraint->constraint->SetCoefficient(variable->variable, coefficient);
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_get_coefficient(
    int constraint_handle, int variable_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (constraint == nullptr || variable == nullptr ||
      constraint->solver_handle != variable->solver_handle) {
    return 0.0;
  }
  return constraint->constraint->GetCoefficient(variable->variable);
}

EMSCRIPTEN_KEEPALIVE const char* mp_constraint_name(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return StoreString(constraint == nullptr ? "" : constraint->constraint->name());
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_index(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? -1 : constraint->constraint->index();
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_lb(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->lb();
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_ub(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->ub();
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_lb(int constraint_handle,
                                               double lb) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetLB(lb);
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_ub(int constraint_handle,
                                               double ub) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetUB(ub);
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_bounds(int constraint_handle,
                                                   double lb, double ub) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetBounds(lb, ub);
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_dual_value(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->dual_value();
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_basis_status(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? -1 : constraint->constraint->basis_status();
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_is_lazy(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint != nullptr && constraint->constraint->is_lazy() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_is_lazy(int constraint_handle,
                                                    int laziness) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->set_is_lazy(laziness != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_clear(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_coefficient(
    int solver_handle, int variable_handle, double coefficient) {
  MPSolver* solver = GetSolver(solver_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (solver == nullptr || variable == nullptr ||
      variable->solver_handle != solver_handle) {
    return;
  }
  solver->MutableObjective()->SetCoefficient(variable->variable, coefficient);
}

EMSCRIPTEN_KEEPALIVE double mp_objective_get_coefficient(
    int solver_handle, int variable_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (solver == nullptr || variable == nullptr ||
      variable->solver_handle != solver_handle) {
    return 0.0;
  }
  return solver->Objective().GetCoefficient(variable->variable);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_offset(int solver_handle,
                                                  double offset) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetOffset(offset);
}

EMSCRIPTEN_KEEPALIVE double mp_objective_offset(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->Objective().offset();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_add_offset(int solver_handle,
                                                  double offset) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  MPObjective* objective = solver->MutableObjective();
  objective->SetOffset(objective->offset() + offset);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_optimization_direction(
    int solver_handle, int maximize) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetOptimizationDirection(maximize != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_minimization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetMinimization();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_maximization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetMaximization();
}

EMSCRIPTEN_KEEPALIVE double mp_objective_value(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->MutableObjective()->Value();
}

EMSCRIPTEN_KEEPALIVE double mp_objective_best_bound(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->MutableObjective()->BestBound();
}

EMSCRIPTEN_KEEPALIVE int mp_objective_maximization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->Objective().maximization() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_objective_minimization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->Objective().minimization() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_solve(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return MPSolver::ABNORMAL;
  return solver->Solve();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_solve_with_parameters(
    int solver_handle, int parameters_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (solver == nullptr || parameters == nullptr) return MPSolver::ABNORMAL;
  return solver->Solve(*parameters);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_verify_solution(int solver_handle,
                                                   double tolerance,
                                                   int log_errors) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr &&
                 solver->VerifySolution(tolerance, log_errors != 0)
             ? 1
             : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_reset(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->Reset();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_interrupt_solve(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->InterruptSolve() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_next_solution(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->NextSolution() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_enable_output(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->EnableOutput();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_suppress_output(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->SuppressOutput();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_output_is_enabled(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->OutputIsEnabled() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_set_time_limit(int solver_handle,
                                                   int64_t milliseconds) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->set_time_limit(milliseconds);
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_time_limit(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->time_limit();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_set_num_threads(int solver_handle,
                                                   int num_threads) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return 0;
  return solver->SetNumThreads(num_threads).ok() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_get_num_threads(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->GetNumThreads();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_set_solver_specific_parameters_as_string(
    int solver_handle, const char* parameters) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || parameters == nullptr) return 0;
  return solver->SetSolverSpecificParametersAsString(parameters) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_get_solver_specific_parameters_as_string(
    int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->GetSolverSpecificParametersAsString());
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_solver_version(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->SolverVersion());
}

EMSCRIPTEN_KEEPALIVE int mp_solver_export_model_as_lp_format(
    int solver_handle, int obfuscate) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    StoreString("");
    return 0;
  }
  std::string model;
  const bool ok = solver->ExportModelAsLpFormat(obfuscate != 0, &model);
  StoreString(model);
  return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_export_model_as_mps_format(
    int solver_handle, int fixed_format, int obfuscate) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    StoreString("");
    return 0;
  }
  std::string model;
  const bool ok = solver->ExportModelAsMpsFormat(fixed_format != 0,
                                                 obfuscate != 0, &model);
  StoreString(model);
  return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* mp_last_string_result() {
  return g_string_result.c_str();
}

EMSCRIPTEN_KEEPALIVE double mp_solver_constraint_activity(int solver_handle,
                                                         int constraint_index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || constraint_index < 0 ||
      constraint_index >= solver->NumConstraints()) {
    return 0.0;
  }
  const std::vector<double> activities = solver->ComputeConstraintActivities();
  return activities[constraint_index];
}

EMSCRIPTEN_KEEPALIVE double mp_solver_compute_exact_condition_number(
    int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->ComputeExactConditionNumber();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_set_hint(int solver_handle,
                                             const int* variable_handles,
                                             const double* values,
                                             int count) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || variable_handles == nullptr || values == nullptr ||
      count < 0) {
    return;
  }
  std::vector<std::pair<const MPVariable*, double>> hint;
  hint.reserve(count);
  for (int i = 0; i < count; ++i) {
    VariableHandle* variable = GetVariable(variable_handles[i]);
    if (variable != nullptr && variable->solver_handle == solver_handle) {
      hint.push_back({variable->variable, values[i]});
    }
  }
  solver->SetHint(std::move(hint));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_variables(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->NumVariables();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_constraints(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->NumConstraints();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_wall_time(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->wall_time();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_iterations(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->iterations();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_nodes(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->nodes();
}

EMSCRIPTEN_KEEPALIVE const char* mp_variable_name(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return StoreString(variable == nullptr ? "" : variable->variable->name());
}

EMSCRIPTEN_KEEPALIVE int mp_variable_index(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? -1 : variable->variable->index();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_solution_value(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->solution_value();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_unrounded_solution_value(
    int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->unrounded_solution_value();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_reduced_cost(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->reduced_cost();
}

EMSCRIPTEN_KEEPALIVE int mp_variable_basis_status(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? -1 : variable->variable->basis_status();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_lb(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->lb();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_ub(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->ub();
}

EMSCRIPTEN_KEEPALIVE int mp_variable_integer(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable != nullptr && variable->variable->integer() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_integer(int variable_handle,
                                                  int integer) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetInteger(integer != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_lb(int variable_handle, double lb) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetLB(lb);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_ub(int variable_handle, double ub) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetUB(ub);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_bounds(int variable_handle,
                                                 double lb, double ub) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetBounds(lb, ub);
}

EMSCRIPTEN_KEEPALIVE int mp_variable_branching_priority(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0 : variable->variable->branching_priority();
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_branching_priority(
    int variable_handle, int priority) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetBranchingPriority(priority);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parameters_create() {
  const int handle = g_next_parameters_handle++;
  g_parameters.emplace(handle, std::make_unique<MPSolverParameters>());
  return handle;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_delete(int parameters_handle) {
  g_parameters.erase(parameters_handle);
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_set_double_param(
    int parameters_handle, int param, double value) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->SetDoubleParam(static_cast<MPSolverParameters::DoubleParam>(param),
                             value);
}

EMSCRIPTEN_KEEPALIVE double mp_solver_parameters_get_double_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return MPSolverParameters::kUnknownDoubleParamValue;
  return parameters->GetDoubleParam(
      static_cast<MPSolverParameters::DoubleParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset_double_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->ResetDoubleParam(
      static_cast<MPSolverParameters::DoubleParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_set_integer_param(
    int parameters_handle, int param, int value) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->SetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param), value);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parameters_get_integer_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) {
    return MPSolverParameters::kUnknownIntegerParamValue;
  }
  return parameters->GetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset_integer_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->ResetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset(int parameters_handle) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->Reset();
}

}  // extern "C"
