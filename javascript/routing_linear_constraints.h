#ifndef ORTOOLS_WASM_ROUTING_LINEAR_CONSTRAINTS_H_
#define ORTOOLS_WASM_ROUTING_LINEAR_CONSTRAINTS_H_
#include <vector>
#include "javascript/routing_variables.h"
namespace ortools_wasm {
struct RoutingLinearTerm { int kind; std::string dimension; int64_t index; int64_t coefficient; int resource_group = 0; };
inline operations_research::IntExpr* RoutingLinearExpression(operations_research::RoutingModel& model,
    const std::vector<RoutingLinearTerm>& terms, int64_t offset, const RoutingExpressionVariables* registry = nullptr) {
  std::vector<operations_research::IntVar*> variables;
  std::vector<int64_t> coefficients;
  for (const auto& term : terms) {
    auto* variable = RoutingVariable(model, term.kind, term.dimension, term.index, term.resource_group, registry);
    if (!variable) return nullptr;
    variables.push_back(variable); coefficients.push_back(term.coefficient);
  }
  auto* solver = model.solver();
  auto* expression = terms.empty() ? solver->MakeIntConst(0) : solver->MakeScalProd(variables, coefficients);
  return offset == 0 ? expression : solver->MakeSum(expression, offset);
}
struct RoutingLinearCondition { operations_research::IntExpr* left; operations_research::IntExpr* right; int comparison; };
inline operations_research::IntVar* RoutingComparisonStatus(operations_research::Solver* solver,
    operations_research::IntExpr* left, operations_research::IntExpr* right, int comparison) {
  switch (comparison) {
    case 1: return solver->MakeIsEqualVar(left, right);
    case 2: return solver->MakeIsDifferentVar(left, right);
    case 3: return solver->MakeIsLessOrEqualVar(left, right);
    case 4: return solver->MakeIsGreaterOrEqualVar(left, right);
    case 5: return solver->MakeIsLessVar(left, right);
    case 6: return solver->MakeIsGreaterVar(left, right);
  }
  return nullptr;
}
inline bool AddRoutingLinearConstraint(operations_research::RoutingModel& model,
    operations_research::IntExpr* left, operations_research::IntExpr* right, int comparison,
    const std::vector<RoutingLinearCondition>& conditions = {}, const std::vector<operations_research::IntVar*>& boolean_conditions = {}) {
  if (!left || !right || comparison < 1 || comparison > 6) return false;
  auto* solver = model.solver();
  if (!conditions.empty() || !boolean_conditions.empty()) {
    for (const auto& condition : conditions) {
      if (!condition.left || !condition.right || condition.comparison < 1 || condition.comparison > 6) return false;
    }
    std::vector<operations_research::IntVar*> statuses = boolean_conditions;
    for (auto* status : statuses) if (!status || status->Min() < 0 || status->Max() > 1) return false;
    for (const auto& condition : conditions) statuses.push_back(RoutingComparisonStatus(solver, condition.left, condition.right, condition.comparison));
    solver->AddConstraint(solver->MakeLessOrEqual(solver->MakeMin(statuses), RoutingComparisonStatus(solver, left, right, comparison)));
    return true;
  }
  operations_research::Constraint* constraint = nullptr;
  switch (comparison) {
    case 1: constraint = solver->MakeEquality(left, right); break;
    case 2: constraint = solver->MakeNonEquality(left, right); break;
    case 3: constraint = solver->MakeLessOrEqual(left, right); break;
    case 4: constraint = solver->MakeGreaterOrEqual(left, right); break;
    case 5: constraint = solver->MakeLess(left, right); break;
    case 6: constraint = solver->MakeGreater(left, right); break;
  }
  solver->AddConstraint(constraint);
  return true;
}
inline operations_research::IntVar* RoutingBooleanExpression(operations_research::Solver* solver, int kind, bool value,
    int comparison, operations_research::IntExpr* left, operations_research::IntExpr* right,
    const std::vector<operations_research::IntVar*>& operands) {
  if (kind == 1) return solver->MakeIntConst(value ? 1 : 0);
  if (kind == 2) return left && left->Min() >= 0 && left->Max() <= 1 ? left->Var() : nullptr;
  if (kind == 3) return left && right ? RoutingComparisonStatus(solver, left, right, comparison) : nullptr;
  if (kind < 4 || kind > 6 || operands.empty() || (kind == 6 && operands.size() != 1)) return nullptr;
  for (auto* operand : operands) if (!operand || operand->Min() < 0 || operand->Max() > 1) return nullptr;
  if (kind == 4) return solver->MakeMin(operands)->Var();
  if (kind == 5) return solver->MakeMax(operands)->Var();
  return solver->MakeDifference(1, operands[0])->Var();
}
inline operations_research::IntExpr* RoutingIntegerExpression(operations_research::Solver* solver, int kind,
    const std::vector<operations_research::IntExpr*>& operands) {
  if (kind < 1 || kind > 4 || operands.empty() || (kind == 1 && operands.size() != 2) || (kind == 2 && operands.size() != 1)) return nullptr;
  for (auto* operand : operands) if (!operand) return nullptr;
  if (kind == 1) return solver->MakeProd(operands[0], operands[1]);
  if (kind == 2) return solver->MakeAbs(operands[0]);
  std::vector<operations_research::IntVar*> variables;
  for (auto* operand : operands) variables.push_back(operand->Var());
  return kind == 3 ? solver->MakeMin(variables) : solver->MakeMax(variables);
}
}  // namespace ortools_wasm
#endif
