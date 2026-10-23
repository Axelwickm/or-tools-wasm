#ifndef ORTOOLS_WASM_ROUTING_VARIABLES_H_
#define ORTOOLS_WASM_ROUTING_VARIABLES_H_
#include <cstdint>
#include <string>
#include <vector>
#include "javascript/routing_index_validation.h"
#include "routing.pb.h"
namespace ortools_wasm {
using ::ortools_wasm::bridge::v1::RoutingVariableKind;
struct RoutingExpressionVariables {
  std::vector<operations_research::IntVar*> boolean;
  std::vector<operations_research::IntVar*> integer;
};

inline operations_research::IntVar* RoutingVariable(operations_research::RoutingModel& model,
    int kind, const std::string& name, int64_t index, int resource_group = 0, const RoutingExpressionVariables* variables = nullptr) {
  if (kind == RoutingVariableKind::ROUTING_VARIABLE_BOOLEAN || kind == RoutingVariableKind::ROUTING_VARIABLE_EXPRESSION) {
    if (!variables || !name.empty()) return nullptr;
    const auto& values = kind == RoutingVariableKind::ROUTING_VARIABLE_BOOLEAN ? variables->boolean : variables->integer;
    return index >= 0 && index < values.size() ? values[index] : nullptr;
  }
  if (kind == RoutingVariableKind::ROUTING_VARIABLE_RESOURCE) {
    if (!name.empty() || index < 0 || index >= model.vehicles() || resource_group < 0 || resource_group >= model.GetResourceGroups().size()) return nullptr;
    return model.ResourceVar(static_cast<int>(index), resource_group);
  }
  if (kind == RoutingVariableKind::ROUTING_VARIABLE_ACTIVE_VEHICLE || kind == RoutingVariableKind::ROUTING_VARIABLE_ROUTE_CONSIDERED) {
    if (!name.empty() || index < 0 || index >= model.vehicles()) return nullptr;
    return kind == RoutingVariableKind::ROUTING_VARIABLE_ACTIVE_VEHICLE ? model.ActiveVehicleVar(static_cast<int>(index))
                     : model.VehicleRouteConsideredVar(static_cast<int>(index));
  }
  if (kind < RoutingVariableKind::ROUTING_VARIABLE_CUMUL || kind > RoutingVariableKind::ROUTING_VARIABLE_FIXED_TRANSIT || !IsRoutingIndexValid(model, index, kind == RoutingVariableKind::ROUTING_VARIABLE_CUMUL || kind == RoutingVariableKind::ROUTING_VARIABLE_VEHICLE)) return nullptr;
  if (kind == RoutingVariableKind::ROUTING_VARIABLE_CUMUL || kind == RoutingVariableKind::ROUTING_VARIABLE_SLACK || kind == RoutingVariableKind::ROUTING_VARIABLE_TRANSIT || kind == RoutingVariableKind::ROUTING_VARIABLE_FIXED_TRANSIT) {
    auto* dimension = model.GetMutableDimension(name);
    if (!dimension) return nullptr;
    switch (kind) {
      case RoutingVariableKind::ROUTING_VARIABLE_CUMUL: return dimension->CumulVar(index);
      case RoutingVariableKind::ROUTING_VARIABLE_SLACK: return dimension->SlackVar(index);
      case RoutingVariableKind::ROUTING_VARIABLE_TRANSIT: return dimension->TransitVar(index);
      case RoutingVariableKind::ROUTING_VARIABLE_FIXED_TRANSIT: return dimension->FixedTransitVar(index);
    }
  }
  if (!name.empty()) return nullptr;
  switch (kind) {
    case RoutingVariableKind::ROUTING_VARIABLE_NEXT: return model.NextVar(index);
    case RoutingVariableKind::ROUTING_VARIABLE_VEHICLE: return model.VehicleVar(index);
    case RoutingVariableKind::ROUTING_VARIABLE_ACTIVE: return model.ActiveVar(index);
  }
  return nullptr;
}
// Register native variables for collection without adding finalizers or constraints.
inline bool CaptureRoutingVariables(operations_research::RoutingModel& model, int kind, const std::string& name, const RoutingExpressionVariables* variables = nullptr) {
  int64_t count = (kind == RoutingVariableKind::ROUTING_VARIABLE_ACTIVE_VEHICLE || kind == RoutingVariableKind::ROUTING_VARIABLE_ROUTE_CONSIDERED) ? model.vehicles() : model.Size();
  if (kind == RoutingVariableKind::ROUTING_VARIABLE_BOOLEAN || kind == RoutingVariableKind::ROUTING_VARIABLE_EXPRESSION) {
    if (!variables) return false;
    count = (kind == RoutingVariableKind::ROUTING_VARIABLE_BOOLEAN ? variables->boolean : variables->integer).size();
  }
  if (kind != RoutingVariableKind::ROUTING_VARIABLE_SLACK && kind != RoutingVariableKind::ROUTING_VARIABLE_TRANSIT && kind != RoutingVariableKind::ROUTING_VARIABLE_FIXED_TRANSIT && kind != RoutingVariableKind::ROUTING_VARIABLE_ACTIVE_VEHICLE && kind != RoutingVariableKind::ROUTING_VARIABLE_ROUTE_CONSIDERED && kind != RoutingVariableKind::ROUTING_VARIABLE_BOOLEAN && kind != RoutingVariableKind::ROUTING_VARIABLE_EXPRESSION) return false;
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
