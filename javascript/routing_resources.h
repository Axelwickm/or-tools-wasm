#ifndef ORTOOLS_WASM_ROUTING_RESOURCES_H_
#define ORTOOLS_WASM_ROUTING_RESOURCES_H_
#include <stdexcept>
#include <string>
#include <vector>
#include "ortools/constraint_solver/routing.h"
#include "ortools/util/sorted_interval_list.h"
namespace ortools_wasm {
inline operations_research::RoutingModel::ResourceGroup& RoutingResourceGroup(operations_research::RoutingModel& model, int index) {
  if (index < 0 || index >= model.GetResourceGroups().size()) throw std::invalid_argument("Invalid Routing resource group index.");
  return *model.GetResourceGroup(index);
}
inline operations_research::Domain RoutingResourceDomain(const std::vector<int64_t>& bounds) {
  if (bounds.empty()) throw std::invalid_argument("Routing resource domains must be nonempty.");
  if (bounds.size() % 2) throw std::invalid_argument("Routing resource domain requires pairs of bounds.");
  for (size_t i = 0; i < bounds.size(); i += 2) if (bounds[i] > bounds[i + 1]) throw std::invalid_argument("Invalid Routing resource domain interval.");
  return operations_research::Domain::FromFlatIntervals(bounds);
}
inline int AddRoutingResource(operations_research::RoutingModel& model, int group_index, const std::string& name,
    const std::vector<int64_t>& start, const std::vector<int64_t>& end) {
  auto& group = RoutingResourceGroup(model, group_index);
  if (!model.HasDimension(name)) throw std::invalid_argument("Unknown Routing resource dimension.");
  const auto* dimension = model.GetMutableDimension(name);
  // The native resource optimizer currently supports one affected dimension per group.
  const auto& affected = group.GetAffectedDimensionIndices();
  if (!affected.empty() && !affected.contains(dimension->index())) throw std::invalid_argument("Routing resource groups currently support one dimension.");
  return group.AddResource({RoutingResourceDomain(start), RoutingResourceDomain(end)}, dimension);
}
inline void RequireRoutingResource(operations_research::RoutingModel& model, int group, int vehicle) {
  if (vehicle < 0 || vehicle >= model.vehicles()) throw std::invalid_argument("Invalid Routing resource vehicle.");
  RoutingResourceGroup(model, group).NotifyVehicleRequiresAResource(vehicle);
}
inline void AllowRoutingResources(operations_research::RoutingModel& model, int group_index, int vehicle, const std::vector<int>& resources) {
  auto& group = RoutingResourceGroup(model, group_index);
  if (vehicle < 0 || vehicle >= model.vehicles() || !group.VehicleRequiresAResource(vehicle) || resources.empty()) throw std::invalid_argument("Invalid Routing resource eligibility.");
  for (int resource : resources) if (resource < 0 || resource >= group.Size()) throw std::invalid_argument("Invalid Routing resource index.");
  group.SetAllowedResourcesForVehicle(vehicle, resources);
}
inline bool RoutingResourceAssignmentBounds(operations_research::RoutingModel& model, const operations_research::Assignment& assignment,
    int group, int vehicle, int64_t* bounds) {
  if (!bounds || group < 0 || group >= model.GetResourceGroups().size() || vehicle < 0 || vehicle >= model.vehicles()) return false;
  auto* variable = model.ResourceVar(vehicle, group);
  if (!assignment.Contains(variable)) return false;
  bounds[0] = assignment.Min(variable); bounds[1] = assignment.Max(variable); return true;
}
inline int RoutingResourceClassIndex(operations_research::RoutingModel& model, int group_index, int resource) {
  auto& group = RoutingResourceGroup(model, group_index);
  if (resource < 0 || resource >= group.Size() || group.GetResourceClassesCount() == 0) throw std::invalid_argument("Invalid Routing resource or unclosed resource classes.");
  return group.GetResourceClassIndex(resource).value();
}
inline const std::vector<int>& RoutingResourcesInClass(operations_research::RoutingModel& model, int group_index, int resource_class) {
  auto& group = RoutingResourceGroup(model, group_index);
  if (resource_class < 0 || resource_class >= group.GetResourceClassesCount()) throw std::invalid_argument("Invalid Routing resource class.");
  return group.GetResourceIndicesInClass(operations_research::RoutingModel::ResourceClassIndex(resource_class));
}
inline const operations_research::RoutingModel::ResourceGroup::Attributes& RoutingResourceAttributes(
    operations_research::RoutingModel& model, int group_index, int index, const std::string& name, bool for_class) {
  auto& group = RoutingResourceGroup(model, group_index);
  if (!model.HasDimension(name)) throw std::invalid_argument("Unknown Routing resource inspection dimension.");
  const auto dimension = model.GetDimensionOrDie(name).index();
  if (for_class) {
    RoutingResourcesInClass(model, group_index, index);
    return group.GetDimensionAttributesForClass(dimension, operations_research::RoutingModel::ResourceClassIndex(index));
  }
  if (index < 0 || index >= group.Size()) throw std::invalid_argument("Invalid Routing resource index.");
  return group.GetResource(index).GetDimensionAttributes(dimension);
}
}  // namespace ortools_wasm
#endif
