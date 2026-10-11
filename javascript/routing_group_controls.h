#ifndef ORTOOLS_WASM_ROUTING_GROUP_CONTROLS_H_
#define ORTOOLS_WASM_ROUTING_GROUP_CONTROLS_H_

#include <cstdint>
#include <vector>
#include "absl/types/span.h"
#include "javascript/routing_index_validation.h"

namespace ortools_wasm {
inline int AddRoutingDisjunction(operations_research::RoutingModel& model,
                                 absl::Span<const int64_t> indices, int64_t penalty,
                                 int64_t maximum, int behavior) {
  if (indices.empty() || maximum < 1 || behavior < 0 || behavior > 1) return -1;
  for (int64_t index : indices) {
    if (!IsRoutingIndexValid(model, index, false) || model.IsStart(index)) return -1;
  }
  return model.AddDisjunction(std::vector<int64_t>(indices.begin(), indices.end()), penalty, maximum,
      static_cast<operations_research::RoutingModel::PenaltyCostBehavior>(behavior)).value();
}
inline bool AddRoutingSoftSameVehicleConstraint(operations_research::RoutingModel& model,
                                                absl::Span<const int64_t> indices, int64_t cost) {
  if (cost < 0) return false;
  for (int64_t index : indices) if (!IsRoutingIndexValid(model, index, false)) return false;
  model.AddSoftSameVehicleConstraint(std::vector<int64_t>(indices.begin(), indices.end()), cost);
  return true;
}
inline bool SetRoutingPickupDeliveryPolicy(operations_research::RoutingModel& model, int vehicle, int policy) {
  if (vehicle < 0 || vehicle >= model.vehicles() || policy < 0 || policy > 2) return false;
  model.SetPickupAndDeliveryPolicyOfVehicle(
      static_cast<operations_research::RoutingModel::PickupAndDeliveryPolicy>(policy), vehicle);
  return true;
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_ROUTING_GROUP_CONTROLS_H_
