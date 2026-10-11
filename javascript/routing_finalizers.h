#ifndef ORTOOLS_WASM_ROUTING_FINALIZERS_H_
#define ORTOOLS_WASM_ROUTING_FINALIZERS_H_

#include <cstdint>
#include <string>
#include "javascript/routing_variables.h"

namespace ortools_wasm {
// Values match RoutingVariableKind and RoutingFinalizerKind in the bridge.
inline bool AddRoutingFinalizer(operations_research::RoutingModel& model,
                               int variable_kind, const std::string& dimension_name,
                               int64_t index, int kind, int64_t target,
                               bool weighted, int64_t weight, int resource_group = 0, const RoutingExpressionVariables* variables = nullptr) {
  if (kind < 1 || kind > 3) return false;
  auto* variable = RoutingVariable(model, variable_kind, dimension_name, index, resource_group, variables);
  if (!variable) return false;
  switch (kind) {
    case 1:
      if (weighted) model.AddWeightedVariableMinimizedByFinalizer(variable, weight);
      else model.AddVariableMinimizedByFinalizer(variable);
      break;
    case 2:
      if (weighted) model.AddWeightedVariableMaximizedByFinalizer(variable, weight);
      else model.AddVariableMaximizedByFinalizer(variable);
      break;
    case 3:
      if (weighted) model.AddWeightedVariableTargetToFinalizer(variable, target, weight);
      else model.AddVariableTargetToFinalizer(variable, target);
      break;
  }
  return true;
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_ROUTING_FINALIZERS_H_
