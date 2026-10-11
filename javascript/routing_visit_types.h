#ifndef ORTOOLS_WASM_ROUTING_VISIT_TYPES_H_
#define ORTOOLS_WASM_ROUTING_VISIT_TYPES_H_
#include <cstdint>
#include <limits>
#include <vector>
#include <utility>
#include "javascript/routing_index_validation.h"
namespace ortools_wasm {
inline bool SetRoutingVisitType(operations_research::RoutingModel& model,
                               int64_t index, int type, int policy) {
  // FinalizeVisitTypes accesses pickup/delivery arrays that exclude end indices.
  if (!IsRoutingIndexValid(model, index, false) || type < -1
      || type == std::numeric_limits<int>::max() || policy < 0 || policy > 3) return false;
  model.SetVisitType(index, type, static_cast<operations_research::RoutingModel::VisitTypePolicy>(policy));
  return true;
}
inline bool AddRoutingHardTypeIncompatibility(operations_research::RoutingModel& model, int type1, int type2) {
  if (type1 < 0 || type2 < 0 || type1 >= model.GetNumberOfVisitTypes() || type2 >= model.GetNumberOfVisitTypes()) return false;
  model.AddHardTypeIncompatibility(type1, type2);
  return true;
}
inline bool AddRoutingTemporalTypeIncompatibility(operations_research::RoutingModel& model, int type1, int type2) {
  if (type1 < 0 || type2 < 0 || type1 >= model.GetNumberOfVisitTypes() || type2 >= model.GetNumberOfVisitTypes()) return false;
  model.AddTemporalTypeIncompatibility(type1, type2);
  return true;
}
// Kinds match RoutingTypeRequirementKind in the bridge schema.
inline bool AddRoutingTypeRequirement(operations_research::RoutingModel& model,
                                     int kind, int dependent_type,
                                     const std::vector<int>& alternatives) {
  const int count = model.GetNumberOfVisitTypes();
  if (kind < 0 || kind > 2 || dependent_type < 0 || dependent_type >= count) return false;
  for (int type : alternatives) if (type < 0 || type >= count) return false;
  absl::flat_hash_set<int> required(alternatives.begin(), alternatives.end());
  switch (kind) {
    case 0: model.AddSameVehicleRequiredTypeAlternatives(dependent_type, std::move(required)); break;
    case 1: model.AddRequiredTypeAlternativesWhenAddingType(dependent_type, std::move(required)); break;
    case 2: model.AddRequiredTypeAlternativesWhenRemovingType(dependent_type, std::move(required)); break;
  }
  return true;
}
}  // namespace ortools_wasm
#endif
