#ifndef ORTOOLS_WASM_ROUTING_BREAKS_H_
#define ORTOOLS_WASM_ROUTING_BREAKS_H_
#include <cstdint>
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"
namespace ortools_wasm {
using RoutingBreakIntervals = std::vector<operations_research::IntervalVar*>;
inline int AddRoutingBreakInterval(operations_research::RoutingModel& model, RoutingBreakIntervals& intervals,
    int64_t start_min, int64_t start_max, int64_t duration, bool optional, const std::string& name) {
  if (start_min > start_max || duration < 0 || start_max > std::numeric_limits<int64_t>::max() - duration)
    throw std::invalid_argument("Invalid Routing break start range or duration.");
  auto* interval = model.solver()->MakeFixedDurationIntervalVar(start_min, start_max, duration, optional, name);
  model.AddIntervalToAssignment(interval);
  intervals.push_back(interval);
  return intervals.size() - 1;
}
inline operations_research::RoutingDimension* RoutingBreakDimension(operations_research::RoutingModel& model,
    const std::string& dimension, int vehicle) {
  if (!model.HasDimension(dimension) || vehicle < 0 || vehicle >= model.vehicles())
    throw std::invalid_argument("Invalid Routing break dimension or vehicle.");
  return model.GetMutableDimension(dimension);
}
inline int64_t RoutingBreakConfigurationValue(operations_research::RoutingModel& model,
    const RoutingBreakIntervals& intervals, const std::string& name, int vehicle, int kind, int index) {
  auto* dimension = RoutingBreakDimension(model, name, vehicle);
  if (kind == 0) return dimension->HasBreakConstraints();
  if (!dimension->HasBreakConstraints()) throw std::invalid_argument("Routing break constraints are not initialized.");
  if (kind == 6) return dimension->GetPreTravelEvaluatorOfVehicle(vehicle);
  if (kind == 7) return dimension->GetPostTravelEvaluatorOfVehicle(vehicle);
  if (kind <= 2) {
    const auto& configured = dimension->GetBreakIntervalsOfVehicle(vehicle);
    if (kind == 1) return configured.size();
    if (index < 0 || index >= configured.size()) throw std::invalid_argument("Invalid Routing break inspection index.");
    const auto found = std::find(intervals.begin(), intervals.end(), configured[index]);
    if (found == intervals.end()) throw std::invalid_argument("Unregistered Routing break interval.");
    return found - intervals.begin();
  }
  const auto& pairs = dimension->GetBreakDistanceDurationOfVehicle(vehicle);
  if (kind == 3) return pairs.size();
  if (index < 0 || index >= pairs.size() || (kind != 4 && kind != 5)) throw std::invalid_argument("Invalid Routing break distance inspection index.");
  return kind == 4 ? pairs[index].first : pairs[index].second;
}
inline void SetRoutingBreakIntervals(operations_research::RoutingModel& model, const RoutingBreakIntervals& intervals,
    const std::string& dimension, int vehicle, const std::vector<int>& indices, int pre_travel, int post_travel) {
  auto* target = RoutingBreakDimension(model, dimension, vehicle);
  if (!indices.empty() && target->base_dimension())
    throw std::invalid_argument("Routing breaks on state-dependent dimensions are not supported.");
  std::vector<operations_research::IntervalVar*> selected;
  for (int index : indices) {
    if (index < 0 || index >= intervals.size()) throw std::invalid_argument("Invalid Routing break interval index.");
    selected.push_back(intervals[index]);
  }
  target->SetBreakIntervalsOfVehicle(std::move(selected), vehicle, pre_travel, post_travel);
}
inline void SetRoutingBreakDistanceDuration(operations_research::RoutingModel& model, const std::string& dimension,
    int vehicle, int64_t distance, int64_t duration) {
  if (distance < 0 || duration < 0) throw std::invalid_argument("Routing break distance and duration must be nonnegative.");
  auto* target = RoutingBreakDimension(model, dimension, vehicle);
  if (target->base_dimension())
    throw std::invalid_argument("Routing breaks on state-dependent dimensions are not supported.");
  target->SetBreakDistanceDurationOfVehicle(distance, duration, vehicle);
}
inline bool RoutingBreakAssignmentBounds(const operations_research::Assignment& assignment,
    const RoutingBreakIntervals& intervals, int index, int64_t* output) {
  if (index < 0 || index >= intervals.size() || !output || !assignment.Contains(intervals[index])) return false;
  auto* interval = intervals[index];
  output[0] = assignment.PerformedMin(interval); output[1] = assignment.PerformedMax(interval);
  if (output[1] != 0) {
    output[2] = assignment.StartMin(interval); output[3] = assignment.StartMax(interval);
    output[4] = assignment.EndMin(interval); output[5] = assignment.EndMax(interval);
  }
  return true;
}
}  // namespace ortools_wasm
#endif
