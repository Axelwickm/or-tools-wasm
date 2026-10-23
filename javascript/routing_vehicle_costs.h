#ifndef ORTOOLS_WASM_ROUTING_VEHICLE_COSTS_H_
#define ORTOOLS_WASM_ROUTING_VEHICLE_COSTS_H_

#include <cstdint>
#include <limits>
#include "ortools/constraint_solver/routing.h"

namespace ortools_wasm {
inline bool SetRoutingPathEnergyCosts(operations_research::RoutingModel& model,
    const std::string& force, const std::string& distance, int vehicle,
    int64_t threshold, int64_t below, int64_t above) {
  if (vehicle < 0 || vehicle >= model.vehicles() || threshold < 0 || below < 0 || above < 0
      || !model.HasDimension(force) || !model.HasDimension(distance)) return false;
  if (!model.GetDimensionOrDie(force).IsUnary()) return false;
  model.SetPathEnergyCostsOfVehicle(force, distance, threshold, below, above, vehicle);
  return true;
}
inline bool SetRoutingMaximumActiveVehicles(operations_research::RoutingModel& model, int maximum) {
  if (maximum < 0) return false;
  model.SetMaximumNumberOfActiveVehicles(maximum);
  return true;
}
inline bool SetRoutingFixedVehicleCost(operations_research::RoutingModel& model, int vehicle, int64_t cost) {
  if (vehicle < 0 || vehicle >= model.vehicles() || cost < 0) return false;
  model.SetFixedCostOfVehicle(cost, vehicle);
  return true;
}
inline bool SetRoutingAmortizedVehicleCosts(operations_research::RoutingModel& model, int vehicle,
                                            int64_t linear, int64_t quadratic) {
  if (vehicle < 0 || vehicle >= model.vehicles() || linear < 0 || quadratic < 0 ||
      linear > std::numeric_limits<int64_t>::max() - quadratic) return false;
  model.SetAmortizedCostFactorsOfVehicle(linear, quadratic, vehicle);
  return true;
}
inline bool SetRoutingVehicleUsedWhenEmpty(operations_research::RoutingModel& model, int vehicle, bool is_used) {
  if (vehicle < 0 || vehicle >= model.vehicles()) return false;
  model.SetVehicleUsedWhenEmpty(is_used, vehicle);
  return true;
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_ROUTING_VEHICLE_COSTS_H_
