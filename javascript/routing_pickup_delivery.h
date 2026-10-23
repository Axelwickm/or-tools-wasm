#ifndef ORTOOLS_WASM_ROUTING_PICKUP_DELIVERY_H_
#define ORTOOLS_WASM_ROUTING_PICKUP_DELIVERY_H_

#include <cstdint>
#include <string>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"

namespace ortools_wasm {
inline bool AddRoutingPickupAndDeliverySets(operations_research::RoutingModel& model,
    int pickup_disjunction, int delivery_disjunction) {
  if (pickup_disjunction < 0 || pickup_disjunction >= model.GetNumberOfDisjunctions()
      || delivery_disjunction < 0 || delivery_disjunction >= model.GetNumberOfDisjunctions()) return false;
  model.AddPickupAndDeliverySets(operations_research::RoutingModel::DisjunctionIndex(pickup_disjunction),
      operations_research::RoutingModel::DisjunctionIndex(delivery_disjunction));
  return true;
}

inline bool SetRoutingPickupToDeliveryLimits(operations_research::RoutingModel& model,
    const std::string& dimension_name, int pair_index, std::vector<int64_t> limits) {
  auto* dimension = model.GetMutableDimension(dimension_name);
  const auto& pairs = model.GetPickupAndDeliveryPairs();
  if (!dimension || pair_index < 0 || pair_index >= pairs.size()) return false;
  const auto& [pickups, deliveries] = pairs[pair_index];
  if (limits.size() != pickups.size() * deliveries.size()) return false;
  dimension->SetPickupToDeliveryLimitFunctionForPair(
      [limits = std::move(limits), columns = deliveries.size()](int pickup, int delivery) {
        return limits.at(pickup * columns + delivery);
      }, pair_index);
  return true;
}
}  // namespace ortools_wasm
#endif
