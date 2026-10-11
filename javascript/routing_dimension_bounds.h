#ifndef ORTOOLS_WASM_ROUTING_DIMENSION_BOUNDS_H_
#define ORTOOLS_WASM_ROUTING_DIMENSION_BOUNDS_H_

#include <cstdint>
#include <string>
#include "javascript/routing_variable_domains.h"

namespace ortools_wasm {
inline bool SetRoutingDimensionBounds(operations_research::RoutingModel& model,
                                      const std::string& name, int64_t index,
                                      int64_t lower, int64_t upper, bool slack) {
  if (lower > upper || !IsRoutingIndexValid(model, index, !slack)) return false;
  auto* dimension = model.GetMutableDimension(name);
  if (dimension == nullptr) return false;
  auto* variable = slack ? dimension->SlackVar(index) : dimension->CumulVar(index);
  IntersectRoutingRange(model, *variable, lower, upper);
  return true;
}

// Values match bridge RoutingDimensionValueKind; zero/unknown kinds are invalid.
enum class RoutingDimensionValueKind {
  kSpanUpperBound = 1, kSpanCost = 2, kSlackCost = 3, kGlobalSpanCost = 4,
};
inline bool SetRoutingDimensionValue(operations_research::RoutingModel& model,
                                     const std::string& name, int kind,
                                     int vehicle, int64_t value) {
  if (value < 0) return false;
  auto* dimension = model.GetMutableDimension(name);
  if (dimension == nullptr) return false;
  const auto setting = static_cast<RoutingDimensionValueKind>(kind);
  if (setting == RoutingDimensionValueKind::kGlobalSpanCost) {
    if (vehicle != -1) return false;
    dimension->SetGlobalSpanCostCoefficient(value);
    return true;
  }
  if (vehicle < 0 || vehicle >= model.vehicles()) return false;
  switch (setting) {
    case RoutingDimensionValueKind::kSpanUpperBound:
      dimension->SetSpanUpperBoundForVehicle(value, vehicle); return true;
    case RoutingDimensionValueKind::kSpanCost:
      dimension->SetSpanCostCoefficientForVehicle(value, vehicle); return true;
    case RoutingDimensionValueKind::kSlackCost:
      dimension->SetSlackCostCoefficientForVehicle(value, vehicle); return true;
    default: return false;
  }
}
inline bool SetRoutingCumulSoftBound(operations_research::RoutingModel& model,
                                     const std::string& name, int64_t index,
                                     int64_t bound, int64_t coefficient, bool lower) {
  if (coefficient < 0 || !IsRoutingIndexValid(model, index, true)) return false;
  auto* dimension = model.GetMutableDimension(name);
  if (dimension == nullptr) return false;
  if (lower) dimension->SetCumulVarSoftLowerBound(index, bound, coefficient);
  else dimension->SetCumulVarSoftUpperBound(index, bound, coefficient);
  return true;
}

inline bool SetRoutingSoftSpanBound(operations_research::RoutingModel& model,
                                    const std::string& name, int vehicle,
                                    int64_t bound, int64_t coefficient, bool quadratic) {
  if (coefficient < 0 || vehicle < 0 || vehicle >= model.vehicles()) return false;
  auto* dimension = model.GetMutableDimension(name);
  if (dimension == nullptr) return false;
  const operations_research::BoundCost value(bound, coefficient);
  if (quadratic) dimension->SetQuadraticCostSoftSpanUpperBoundForVehicle(value, vehicle);
  else dimension->SetSoftSpanUpperBoundForVehicle(value, vehicle);
  return true;
}

}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_ROUTING_DIMENSION_BOUNDS_H_
