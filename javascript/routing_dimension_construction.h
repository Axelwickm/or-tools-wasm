#ifndef ORTOOLS_WASM_ROUTING_DIMENSION_CONSTRUCTION_H_
#define ORTOOLS_WASM_ROUTING_DIMENSION_CONSTRUCTION_H_
#include <algorithm>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"
namespace ortools_wasm {
inline bool IsRoutingVehicleDimensionValid(int vehicles, int evaluators,
                                           const std::vector<int64_t>& capacities, int64_t slack) {
  return evaluators == vehicles && capacities.size() == vehicles && slack >= 0
      && std::all_of(capacities.begin(), capacities.end(), [](int64_t value) { return value >= 0; });
}
inline std::pair<int, bool> AddRoutingConstantDimensionWithSlack(
    operations_research::RoutingModel& model, int64_t value, int64_t capacity,
    int64_t slack, bool fixed_start, const std::string& name) {
  if (capacity < 0 || slack < 0) return {-1, false};
  return model.AddConstantDimensionWithSlack(value, capacity, slack, fixed_start, name);
}
}  // namespace ortools_wasm
#endif
