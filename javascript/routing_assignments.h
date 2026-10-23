#ifndef ORTOOLS_WASM_ROUTING_ASSIGNMENTS_H_
#define ORTOOLS_WASM_ROUTING_ASSIGNMENTS_H_
#include <optional>
#include <sstream>
#include <stdexcept>
#include <vector>
#include "javascript/routing_variables.h"
#include "javascript/routing_breaks.h"
namespace ortools_wasm {
inline void SetRoutingAssignmentObjective(operations_research::RoutingModel& model,
    operations_research::Assignment& assignment, std::optional<int64_t> value,
    std::optional<int64_t> minimum, std::optional<int64_t> maximum) {
  if (minimum.has_value() != maximum.has_value() || (value && minimum) || (minimum && *minimum > *maximum))
    throw std::invalid_argument("Invalid Routing assignment objective snapshot.");
  if (!value && !minimum) return;
  if (!model.CostVar()) throw std::invalid_argument("Routing assignment requires a closed model.");
  assignment.AddObjective(model.CostVar());
  if (value) assignment.SetObjectiveValue(*value);
  else assignment.SetObjectiveRange(*minimum, *maximum);
}

struct RoutingSeedVariable { int kind; int index; int64_t value; };
struct RoutingSeedSnapshot {
  std::vector<RoutingSeedVariable> variables;
  int64_t objective_min;
  int64_t objective_max;
};

inline RoutingSeedSnapshot TransferRoutingAssignment(operations_research::RoutingModel& target,
    const operations_research::RoutingIndexManager& manager, const std::vector<int64_t>& next_values,
    const std::vector<int64_t>& vehicle_values) {
  if (!target.CostVar()) throw std::invalid_argument("Routing assignment transfer requires a closed model.");
  const int count = target.Size() + target.vehicles();
  const bool copy_vehicles = !target.CostsAreHomogeneousAcrossVehicles();
  if (next_values.size() != target.Size() || (!vehicle_values.empty() && vehicle_values.size() != count)
      || (copy_vehicles && vehicle_values.size() != count))
    throw std::invalid_argument("Routing assignment transfer dimensions do not match the index-manager layout.");
  // The native helper reads only NextVar/VehicleVar values. The public binding
  // checks source/target index layouts before sending these route snapshots;
  // source dimensions, costs and callbacks have no role in this operation.
  operations_research::RoutingModel source(manager);
  operations_research::Assignment source_assignment(source.solver());
  if (source.Size() != target.Size() || source.vehicles() != target.vehicles())
    throw std::invalid_argument("Routing assignment transfer index-manager layout does not match.");
  for (int i = 0; i < next_values.size(); ++i) {
    if (next_values[i] < 0 || next_values[i] >= count)
      throw std::invalid_argument("Invalid Routing assignment transfer successor.");
    source_assignment.Add(source.NextVar(i))->SetValue(next_values[i]);
  }
  for (int i = 0; i < vehicle_values.size(); ++i) {
    if (vehicle_values[i] < -1 || vehicle_values[i] >= target.vehicles())
      throw std::invalid_argument("Invalid Routing assignment transfer vehicle.");
    source_assignment.Add(source.VehicleVar(i))->SetValue(vehicle_values[i]);
  }
  operations_research::Assignment transferred(target.solver());
  target.SetAssignmentFromOtherModelAssignment(&transferred, &source, &source_assignment);
  RoutingSeedSnapshot snapshot{{}, transferred.ObjectiveMin(), transferred.ObjectiveMax()};
  for (int i = 0; i < target.Size(); ++i) snapshot.variables.push_back({3, i, transferred.Value(target.NextVar(i))});
  if (copy_vehicles) for (int i = 0; i < count; ++i) snapshot.variables.push_back({4, i, transferred.Value(target.VehicleVar(i))});
  return snapshot;
}

inline std::string RoutingSeedSnapshotJson(const RoutingSeedSnapshot& snapshot) {
  std::ostringstream out;
  out << "{\"objectiveMin\":\"" << snapshot.objective_min << "\",\"objectiveMax\":\"" << snapshot.objective_max
      << "\",\"intervals\":[],\"variables\":[";
  for (int i = 0; i < snapshot.variables.size(); ++i) {
    if (i) out << ',';
    const auto& value = snapshot.variables[i];
    out << "{\"variable\":{\"kind\":" << value.kind << ",\"index\":" << value.index
        << ",\"dimensionName\":\"\"},\"min\":\"" << value.value << "\",\"max\":\"" << value.value << "\"}";
  }
  out << "]}";
  return out.str();
}

inline bool SetRoutingAssignmentVariable(operations_research::RoutingModel& model,
    operations_research::Assignment& assignment, int kind, const std::string& name,
    int64_t index, int resource_group, int64_t minimum, int64_t maximum,
    const RoutingExpressionVariables* variables) {
  auto* variable = RoutingVariable(model, kind, name, index, resource_group, variables);
  if (!variable || minimum > maximum) return false;
  if (kind == 3 && (minimum < 0 || maximum >= model.Size() + model.vehicles())) return false;
  assignment.Add(variable);
  assignment.SetRange(variable, minimum, maximum);
  return true;
}
inline bool SetRoutingAssignmentInterval(operations_research::Assignment& assignment,
    const RoutingBreakIntervals& intervals, int index, const int64_t* bounds) {
  if (index < 0 || index >= intervals.size() || !bounds || bounds[0] < 0 || bounds[1] > 1 || bounds[0] > bounds[1]) return false;
  auto* interval = intervals[index];
  assignment.Add(interval);
  assignment.SetPerformedRange(interval, bounds[0], bounds[1]);
  if (bounds[1] != 0) {
    if (bounds[2] > bounds[3] || bounds[4] > bounds[5]) return false;
    assignment.SetStartRange(interval, bounds[2], bounds[3]);
    assignment.SetEndRange(interval, bounds[4], bounds[5]);
    assignment.SetDurationRange(interval, interval->DurationMin(), interval->DurationMax());
  }
  return true;
}
}  // namespace ortools_wasm
#endif
