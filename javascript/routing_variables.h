#ifndef ORTOOLS_WASM_ROUTING_VARIABLES_H_
#define ORTOOLS_WASM_ROUTING_VARIABLES_H_
#include <cstdint>
#include <string>
#include <vector>
#include "javascript/routing_index_validation.h"
namespace ortools_wasm {
struct RoutingExpressionVariables {
  std::vector<operations_research::IntVar*> boolean;
  std::vector<operations_research::IntVar*> integer;
};
// Values match RoutingVariableKind in the bridge.
inline operations_research::IntVar* RoutingVariable(operations_research::RoutingModel& model,
    int kind, const std::string& name, int64_t index, int resource_group = 0, const RoutingExpressionVariables* variables = nullptr) {
  if (kind == 11 || kind == 12) {
    if (!variables || !name.empty()) return nullptr;
    const auto& values = kind == 11 ? variables->boolean : variables->integer;
    return index >= 0 && index < values.size() ? values[index] : nullptr;
  }
  if (kind == 10) {
    if (!name.empty() || index < 0 || index >= model.vehicles() || resource_group < 0 || resource_group >= model.GetResourceGroups().size()) return nullptr;
    return model.ResourceVar(static_cast<int>(index), resource_group);
  }
  if (kind == 8 || kind == 9) {
    if (!name.empty() || index < 0 || index >= model.vehicles()) return nullptr;
    return kind == 8 ? model.ActiveVehicleVar(static_cast<int>(index))
                     : model.VehicleRouteConsideredVar(static_cast<int>(index));
  }
  if (kind < 1 || kind > 7 || !IsRoutingIndexValid(model, index, kind == 1 || kind == 4)) return nullptr;
  if (kind == 1 || kind == 2 || kind == 6 || kind == 7) {
    auto* dimension = model.GetMutableDimension(name);
    if (!dimension) return nullptr;
    switch (kind) {
      case 1: return dimension->CumulVar(index);
      case 2: return dimension->SlackVar(index);
      case 6: return dimension->TransitVar(index);
      case 7: return dimension->FixedTransitVar(index);
    }
  }
  if (!name.empty()) return nullptr;
  switch (kind) {
    case 3: return model.NextVar(index);
    case 4: return model.VehicleVar(index);
    case 5: return model.ActiveVar(index);
  }
  return nullptr;
}
// Register native variables for collection without adding finalizers or constraints.
inline bool CaptureRoutingVariables(operations_research::RoutingModel& model, int kind, const std::string& name, const RoutingExpressionVariables* variables = nullptr) {
  int64_t count = (kind == 8 || kind == 9) ? model.vehicles() : model.Size();
  if (kind == 11 || kind == 12) {
    if (!variables) return false;
    count = (kind == 11 ? variables->boolean : variables->integer).size();
  }
  if (kind != 2 && kind != 6 && kind != 7 && kind != 8 && kind != 9 && kind != 11 && kind != 12) return false;
  for (int64_t index = 0; index < count; ++index) {
    auto* variable = RoutingVariable(model, kind, name, index, 0, variables);
    if (!variable) return false;
    model.AddToAssignment(variable);
  }
  return true;
}
inline bool RoutingAssignmentBounds(operations_research::RoutingModel& model, const operations_research::Assignment& assignment,
    int kind, const std::string& name, int64_t index, int64_t* bounds, const RoutingExpressionVariables* variables = nullptr) {
  auto* variable = RoutingVariable(model, kind, name, index, 0, variables);
  if (!variable || !assignment.Contains(variable) || !bounds) return false;
  bounds[0] = assignment.Min(variable); bounds[1] = assignment.Max(variable);
  return true;
}
}  // namespace ortools_wasm
#endif
