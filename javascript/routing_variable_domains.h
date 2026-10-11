#ifndef ORTOOLS_WASM_ROUTING_VARIABLE_DOMAINS_H_
#define ORTOOLS_WASM_ROUTING_VARIABLE_DOMAINS_H_

#include <cstdint>
#include <vector>
#include "absl/types/span.h"
#include "javascript/routing_variables.h"

namespace ortools_wasm {
inline void IntersectRoutingValues(operations_research::RoutingModel&,
                                   operations_research::IntVar& variable,
                                   absl::Span<const int64_t> values) {
  variable.SetValues(std::vector<int64_t>(values.begin(), values.end()));
}

inline void IntersectRoutingRange(operations_research::RoutingModel&,
                                  operations_research::IntVar& variable,
                                  int64_t lower, int64_t upper) {
  variable.SetRange(lower, upper);
}

inline bool SetRoutingActiveValues(operations_research::RoutingModel& model,
                                   int64_t index, absl::Span<const int64_t> values) {
  if (!IsRoutingIndexValid(model, index, false)) return false;
  for (int64_t value : values) {
    if (value < 0 || value > 1) return false;
  }
  IntersectRoutingValues(model, *model.ActiveVar(index), values);
  return true;
}
inline bool ModifyRoutingDomain(operations_research::RoutingModel& model, int kind,
    const std::string& name, int64_t index, int action, int64_t lower, int64_t upper,
    const std::vector<int64_t>& values, int resource_group = 0, const RoutingExpressionVariables* variables = nullptr) {
  auto* variable = RoutingVariable(model, kind, name, index, resource_group, variables);
  if (!variable || action < 1 || action > 4 || ((action == 1 || action == 3) && lower > upper)) return false;
  switch (action) {
    case 1: variable->SetRange(lower, upper); break;
    case 2: variable->SetValues(values); break;
    case 3: variable->RemoveInterval(lower, upper); break;
    case 4: variable->RemoveValues(values); break;
  }
  return true;
}

}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_ROUTING_VARIABLE_DOMAINS_H_
