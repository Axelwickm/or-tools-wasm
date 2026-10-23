#ifndef ORTOOLS_WASM_ROUTING_DIMENSION_INSPECTION_H_
#define ORTOOLS_WASM_ROUTING_DIMENSION_INSPECTION_H_
#include <algorithm>
#include <cstdint>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"
#include "ortools/util/piecewise_linear_function.h"
namespace ortools_wasm {
struct RoutingCostSegment { int64_t point_x, point_y, slope, other_point_x; };
inline operations_research::RoutingDimension* InspectedRoutingDimension(
    operations_research::RoutingModel& model, const std::string& name, int64_t index) {
  if (!model.HasDimension(name) || index < 0 || index >= model.Size() + model.vehicles())
    throw std::invalid_argument("Invalid Routing dimension or inspection index.");
  return model.GetMutableDimension(name);
}
inline void AddRoutingForbiddenIntervals(operations_research::RoutingModel& model, const std::string& name,
    int64_t index, const std::vector<std::pair<int64_t, int64_t>>& intervals) {
  auto* dimension = InspectedRoutingDimension(model, name, index);
  std::vector<int64_t> starts, ends;
  for (const auto& interval : intervals) {
    if (interval.first > interval.second) throw std::invalid_argument("Invalid Routing forbidden interval.");
    starts.push_back(interval.first); ends.push_back(interval.second);
  }
  model.solver()->AddConstraint(model.solver()->MakeNotMemberCt(dimension->CumulVar(index), starts, ends));
}
inline void SetRoutingPiecewiseCost(operations_research::RoutingModel& model,
    const std::string& name, int64_t index, const std::vector<RoutingCostSegment>& input) {
  auto* dimension = InspectedRoutingDimension(model, name, index);
  if (input.empty()) throw std::invalid_argument("Routing piecewise cost requires at least one segment.");
  std::vector<operations_research::PiecewiseSegment> segments;
  std::vector<int64_t> x, y, slopes, ends;
  for (const auto& value : input) {
    segments.emplace_back(value.point_x, value.point_y, value.slope, value.other_point_x);
    x.push_back(value.point_x); y.push_back(value.point_y); slopes.push_back(value.slope); ends.push_back(value.other_point_x);
  }
  // Guard the native factory's fatal overlap check, without evaluating costs.
  std::sort(segments.begin(), segments.end(), operations_research::PiecewiseSegment::SortComparator);
  for (size_t i = 1; i < segments.size(); ++i)
    if (segments[i - 1].end_x() > segments[i].start_x()) throw std::invalid_argument("Routing piecewise cost segments overlap.");
  std::unique_ptr<operations_research::PiecewiseLinearFunction> cost(
      operations_research::PiecewiseLinearFunction::CreatePiecewiseLinearFunction(x, y, slopes, ends));
  dimension->SetCumulVarPiecewiseLinearCost(index, *cost);
}
struct RoutingDimensionInspection {
  std::optional<int64_t> value;
  std::vector<std::pair<int64_t, int64_t>> intervals;
  bool has_piecewise_linear_cost = false;
  std::vector<RoutingCostSegment> cost_segments;
  std::vector<operations_research::RoutingDimension::NodePrecedence> node_precedences;
};
// Restore only the supplied domains: no completion search or slack optimization.
inline int64_t InspectRoutingShortestTransitionSlack(operations_research::RoutingModel& model,
    const std::string& name, int64_t index, const operations_research::Assignment* assignment) {
  auto* dimension = InspectedRoutingDimension(model, name, index);
  if (!assignment || dimension->base_dimension() != dimension || model.IsEnd(index))
    throw std::invalid_argument("Shortest transition slack requires an assignment, a self-dependent dimension and a non-end index.");
  auto* solver = model.solver();
  operations_research::Assignment restored(assignment);
  solver->NewSearch(solver->MakeRestoreAssignment(&restored));
  try {
    if (!solver->NextSolution()) throw std::invalid_argument("Routing assignment cannot be restored.");
    if (!model.NextVar(index)->Bound()) throw std::invalid_argument("Shortest transition slack requires a bound successor.");
    const int64_t next = model.NextVar(index)->Value();
    if (!model.IsEnd(next)) {
      if (next == index || !model.NextVar(next)->Bound() || !model.VehicleVar(index)->Bound()
          || !model.VehicleVar(next)->Bound() || model.VehicleVar(index)->Min() < 0
          || model.VehicleVar(index)->Min() != model.VehicleVar(next)->Min()
          || !dimension->CumulVar(index)->Bound())
        throw std::invalid_argument("Shortest transition slack requires an active route, bound vehicles, successors and current cumul.");
    }
    const int64_t value = dimension->ShortestTransitionSlack(index);
    solver->EndSearch();
    return value;
  } catch (...) { solver->EndSearch(); throw; }
}
// Query kinds are defined in the bridge schema. Native model closure is the
// caller's responsibility for transit/classes and forbidden-interval queries.
inline RoutingDimensionInspection InspectRoutingDimension(operations_research::RoutingModel& model,
    const std::string& name, int kind, int64_t index, int64_t other_index, int vehicle_or_class,
    int64_t lower, int64_t upper, int pair_index = 0, int pickup_alternative = 0, int delivery_alternative = 0) {
  RoutingDimensionInspection result;
  auto* dimension = InspectedRoutingDimension(model, name, index);
  if (kind == 9) {
    if (pair_index < 0 || pickup_alternative < 0 || delivery_alternative < 0)
      throw std::invalid_argument("Invalid Routing pickup/delivery position.");
    const auto& pairs = model.GetPickupAndDeliveryPairs();
    if (pair_index < pairs.size()) {
      const auto& [pickups, deliveries] = pairs[pair_index];
      if (pickup_alternative >= pickups.size() || delivery_alternative >= deliveries.size())
        throw std::invalid_argument("Invalid Routing pickup/delivery alternative.");
    }
    result.value = dimension->GetPickupToDeliveryLimitForPair(pair_index, pickup_alternative, delivery_alternative);
    return result;
  }
  if (kind == 10) { result.node_precedences = dimension->GetNodePrecedences(); return result; }
  if (kind == 11 || kind == 12) {
    if (vehicle_or_class < 0 || vehicle_or_class >= model.vehicles()) throw std::invalid_argument("Invalid Routing vehicle.");
    result.value = kind == 11 ? static_cast<int>(dimension->AreVehicleTransitsPositive(vehicle_or_class))
        : static_cast<int>(dimension->GetTransitEvaluatorSign(vehicle_or_class));
    return result;
  }
  if (kind == 8) { result.value = dimension->IsUnary(); return result; }
  if (kind == 7) {
    if (vehicle_or_class < 0 || vehicle_or_class >= model.vehicles()) throw std::invalid_argument("Invalid Routing vehicle.");
    result.value = dimension->vehicle_to_class(vehicle_or_class);
    return result;
  }
  if (kind == 0 || kind == 1) {
    bool valid_vehicle = kind == 0 && vehicle_or_class >= 0 && vehicle_or_class < model.vehicles();
    if (kind == 1) for (int vehicle = 0; vehicle < model.vehicles(); ++vehicle)
      valid_vehicle |= dimension->vehicle_to_class(vehicle) == vehicle_or_class;
    if (other_index < 0 || other_index >= model.Size() + model.vehicles() || !valid_vehicle)
      throw std::invalid_argument("Invalid Routing transit destination or vehicle class.");
    result.value = kind == 0 ? dimension->GetTransitValue(index, other_index, vehicle_or_class)
        : dimension->GetTransitValueFromClass(index, other_index, vehicle_or_class);
  } else if (kind == 2 || kind == 3) {
    if (kind == 2 && lower > upper) throw std::invalid_argument("Invalid Routing interval range.");
    const auto intervals = kind == 2 ? dimension->GetAllowedIntervalsInRange(index, lower, upper)
        : dimension->forbidden_intervals().at(index);
    for (const auto& interval : intervals) result.intervals.emplace_back(interval.start, interval.end);
  } else if (kind == 4) result.value = dimension->GetFirstPossibleGreaterOrEqualValueForNode(index, lower);
  else if (kind == 5) result.value = dimension->GetLastPossibleLessOrEqualValueForNode(index, upper);
  else if (kind == 6) {
    const auto* cost = dimension->GetCumulVarPiecewiseLinearCost(index);
    result.has_piecewise_linear_cost = cost != nullptr;
    if (cost) for (const auto& segment : cost->segments())
      result.cost_segments.push_back({segment.start_x(), segment.start_y(), segment.slope(), segment.end_x()});
  } else throw std::invalid_argument("Unknown Routing dimension inspection kind.");
  return result;
}
inline std::string RoutingDimensionInspectionJson(const RoutingDimensionInspection& result) {
  std::ostringstream out;
  out << "{\"hasPiecewiseLinearCost\":" << (result.has_piecewise_linear_cost ? "true" : "false");
  if (result.value) out << ",\"value\":\"" << *result.value << '\"';
  out << ",\"intervals\":[";
  for (size_t i = 0; i < result.intervals.size(); ++i) {
    if (i) out << ',';
    out << "{\"start\":\"" << result.intervals[i].first << "\",\"end\":\"" << result.intervals[i].second << "\"}";
  }
  out << "],\"costSegments\":[";
  for (size_t i = 0; i < result.cost_segments.size(); ++i) {
    if (i) out << ',';
    const auto& value = result.cost_segments[i];
    out << "{\"pointX\":\"" << value.point_x << "\",\"pointY\":\"" << value.point_y
        << "\",\"slope\":\"" << value.slope << "\",\"otherPointX\":\"" << value.other_point_x << "\"}";
  }
  out << "],\"nodePrecedences\":[";
  for (size_t i = 0; i < result.node_precedences.size(); ++i) {
    if (i) out << ',';
    const auto& value = result.node_precedences[i];
    out << "{\"first\":\"" << value.first_node << "\",\"second\":\"" << value.second_node
        << "\",\"offset\":\"" << value.offset << "\",\"performedConstraint\":" << static_cast<int>(value.performed_constraint) << '}';
  }
  out << "]}"; return out.str();
}
}  // namespace ortools_wasm
#endif
