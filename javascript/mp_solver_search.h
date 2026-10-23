#ifndef ORTOOLS_WASM_MP_SOLVER_SEARCH_H_
#define ORTOOLS_WASM_MP_SOLVER_SEARCH_H_
#include <cmath>
#include <functional>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
#include <utility>
#include "mp_solver.pb.h"
#include "ortools/linear_solver/linear_expr.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver_callback.h"
namespace ortools_wasm {
namespace mp_search_bridge = ::ortools_wasm::bridge::v1;
inline void ApplyMpStartingBasis(operations_research::MPSolver& solver,
    const mp_search_bridge::MpSolverStartingBasis& input) {
  using S = operations_research::MPSolver;
  if (solver.ProblemType() != S::GLOP_LINEAR_PROGRAMMING)
    throw std::invalid_argument("Explicit MPSolver starting bases require GLOP.");
  if (input.variable_statuses_size() != solver.NumVariables() || input.constraint_statuses_size() != solver.NumConstraints())
    throw std::invalid_argument("MPSolver starting-basis dimensions do not match the native model.");
  const auto convert = [](const auto& values) {
    std::vector<S::BasisStatus> result;
    for (int value : values) {
      if (value < S::FREE || value > S::BASIC) throw std::invalid_argument("Invalid MPSolver basis status.");
      result.push_back(static_cast<S::BasisStatus>(value));
    }
    return result;
  };
  solver.SetStartingLpBasis(convert(input.variable_statuses()), convert(input.constraint_statuses()));
}
// Scope the native callback to Solve(): a retained solver must not keep a
// pointer to a completed job's callback or transport.
class ScopedMpSolverCallback final : public operations_research::MPCallback {
 public:
  using Transport = std::function<std::optional<std::string>(const std::string&)>;
  ScopedMpSolverCallback(operations_research::MPSolver& solver,
      const mp_search_bridge::MpSolverCallbackRegistration* registration, Transport transport)
      : MPCallback(registration && registration->might_add_cuts(), registration && registration->might_add_lazy_constraints()),
        solver_(solver), transport_(std::move(transport)) {
    if (!registration) return;
    if (solver.ProblemType() == operations_research::MPSolver::SCIP_MIXED_INTEGER_PROGRAMMING && solver.GetNumThreads() > 1)
      throw std::invalid_argument("Native SCIP MPSolver callbacks require one solver thread.");
    if (!solver.SupportsCallbacks()) throw std::invalid_argument("MPSolver backend does not support native MIP callbacks.");
    if (!transport_) throw std::invalid_argument("MPSolver callback transport is unavailable.");
    if (registration->filter_variables()) {
      for (int index : registration->variable_indices()) { CheckIndex(index); indices_.push_back(index); }
    } else {
      for (int i = 0; i < solver.NumVariables(); ++i) indices_.push_back(i);
    }
    solver_.SetCallback(this); installed_ = true;
  }
  ~ScopedMpSolverCallback() override { if (installed_) solver_.SetCallback(nullptr); }
  void CheckError() const { if (!error_.empty()) throw std::runtime_error(error_); }
  void RunCallback(operations_research::MPCallbackContext* context) override {
    if (stopped_) return;
    try {
      using E = operations_research::MPCallbackEvent;
      const auto event = context->Event();
      if (event != E::kMipSolution && event != E::kMipNode) throw std::invalid_argument("Unsupported MPSolver callback event.");
      mp_search_bridge::MpSolverCallbackData data;
      data.set_event(event == E::kMipNode ? mp_search_bridge::MpSolverCallbackData::MIP_NODE : mp_search_bridge::MpSolverCallbackData::MIP_SOLUTION);
      data.set_can_query_variable_values(context->CanQueryVariableValues());
      if (data.can_query_variable_values()) for (int index : indices_)
        (*data.mutable_variable_values())[index] = context->VariableValue(solver_.variable(index));
      data.set_num_explored_nodes(context->NumExploredNodes());
      const auto bytes = transport_(data.SerializeAsString());
      if (!bytes) { Stop(); return; }
      mp_search_bridge::MpSolverCallbackResult result;
      if (!result.ParseFromString(*bytes)) throw std::invalid_argument("Invalid MPSolver callback reply.");
      if (result.cuts_size() && (!might_add_cuts() || event != E::kMipNode)) throw std::invalid_argument("MPSolver cuts require a registered MIP-node callback.");
      if (result.lazy_constraints_size() && !might_add_lazy_constraints()) throw std::invalid_argument("MPSolver lazy constraints require callback registration.");
      // Validate the whole reply before forwarding any constraints.
      for (const auto& row : result.cuts()) Validate(row);
      for (const auto& row : result.lazy_constraints()) Validate(row);
      for (const auto& row : result.cuts()) context->AddCut(Range(row));
      for (const auto& row : result.lazy_constraints()) context->AddLazyConstraint(Range(row));
    } catch (const std::exception& error) { error_ = error.what(); Stop(); }
  }
 private:
  void CheckIndex(int index) const {
    if (index < 0 || index >= solver_.NumVariables()) throw std::invalid_argument("Invalid MPSolver callback variable index.");
  }
  void Validate(const mp_search_bridge::MpSolverCallbackConstraint& row) const {
    if (row.variable_indices_size() != row.coefficients_size() || std::isnan(row.lower_bound()) || std::isnan(row.upper_bound()) || row.lower_bound() > row.upper_bound())
      throw std::invalid_argument("Invalid MPSolver callback constraint dimensions or bounds.");
    for (int i = 0; i < row.variable_indices_size(); ++i) {
      CheckIndex(row.variable_indices(i));
      if (!std::isfinite(row.coefficients(i))) throw std::invalid_argument("MPSolver callback coefficients must be finite.");
    }
  }
  operations_research::LinearRange Range(const mp_search_bridge::MpSolverCallbackConstraint& row) const {
    operations_research::LinearExpr expression;
    for (int i = 0; i < row.variable_indices_size(); ++i) expression += row.coefficients(i) * operations_research::LinearExpr(solver_.variable(row.variable_indices(i)));
    return operations_research::LinearRange(row.lower_bound(), expression, row.upper_bound());
  }
  void Stop() { stopped_ = true; solver_.InterruptSolve(); }
  operations_research::MPSolver& solver_;
  Transport transport_;
  std::vector<int> indices_;
  bool installed_ = false, stopped_ = false;
  std::string error_;
};
}  // namespace ortools_wasm
#endif
