#ifndef ORTOOLS_WASM_ROUTING_MODEL_INSPECTION_H_
#define ORTOOLS_WASM_ROUTING_MODEL_INSPECTION_H_
#include <cstdint>
#include <functional>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "ortools/constraint_solver/routing.h"

namespace ortools_wasm {
struct RoutingModelInspection {
  std::optional<int64_t> value;
  std::vector<int> dimension_indices;
  std::vector<int> indices;
  std::vector<std::vector<int>> groups;
  std::vector<std::vector<std::vector<int>>> precedence_groups;
};
// Kinds match RoutingModelQueryKind. Callers close for finalized metadata/costs;
// disjunction and explicit vehicle-eligibility queries are available before closure.
inline RoutingModelInspection InspectRoutingModel(operations_research::RoutingModel& model,
    int kind, int64_t index, int64_t other_index, int vehicle_or_class, int64_t default_value,
    const std::function<bool(int64_t)>& is_match = {}, int64_t third_index = 0,
    const operations_research::RoutingSearchParameters* parameters = nullptr) {
  RoutingModelInspection result;
  switch (kind) {
    case 0:
      if (vehicle_or_class < 0 || vehicle_or_class >= model.vehicles())
        throw std::invalid_argument("Invalid Routing vehicle.");
      result.value = model.GetCostClassIndexOfVehicle(vehicle_or_class).value(); break;
    case 1:
      if (vehicle_or_class < 0) throw std::invalid_argument("Invalid Routing cost class.");
      result.value = model.HasVehicleWithCostClassIndex(operations_research::RoutingModel::CostClassIndex(vehicle_or_class)); break;
    case 2: result.value = model.GetCostClassesCount(); break;
    case 3: result.value = model.GetNonZeroCostClassesCount(); break;
    case 4: result.value = model.CostsAreHomogeneousAcrossVehicles(); break;
    case 5: {
      const int64_t size = model.Size() + model.vehicles();
      if (index < 0 || index >= size || other_index < 0 || other_index >= size
          || (model.IsEnd(index) && index != other_index)
          || vehicle_or_class < 0 || vehicle_or_class >= model.GetCostClassesCount())
        throw std::invalid_argument("Invalid Routing arc or cost class.");
      result.value = model.GetArcCostForClass(index, other_index, vehicle_or_class); break;
    }
    case 6:
    case 7:
      if (index < 0 || index >= model.Size()) throw std::invalid_argument("Invalid Routing penalty index.");
      result.value = kind == 6 ? model.UnperformedPenalty(index) : model.UnperformedPenaltyOrValue(default_value, index); break;
    case 8:
    case 9: {
      const auto dimensions = kind == 8 ? model.GetUnaryDimensions() : model.GetDimensionsWithSoftOrSpanCosts();
      for (const auto* dimension : dimensions) result.dimension_indices.push_back(dimension->index().value());
      break;
    }
    case 10:
    case 11:
      if (vehicle_or_class < 0 || vehicle_or_class >= model.GetNumberOfVisitTypes())
        throw std::invalid_argument("Invalid Routing visit type.");
      result.indices = kind == 10 ? model.GetSingleNodesOfType(vehicle_or_class) : model.GetPairIndicesOfType(vehicle_or_class);
      break;
    case 12:
      if (vehicle_or_class < 0 || vehicle_or_class >= model.vehicles())
        throw std::invalid_argument("Invalid Routing vehicle.");
      result.value = model.GetVehicleClassIndexOfVehicle(vehicle_or_class).value(); break;
    case 13: result.value = model.GetVehicleClassesCount(); break;
    case 14:
      if (vehicle_or_class < 0) throw std::invalid_argument("Invalid Routing vehicle class.");
      result.value = model.GetVehicleOfClass(operations_research::RoutingModel::VehicleClassIndex(vehicle_or_class)); break;
    case 15: result.groups = model.GetVisitTypeComponents(); break;
    case 16: result.groups = model.GetTopologicallySortedVisitTypes(); break;
    case 17:
      if (index < 0 || index >= model.Size()) throw std::invalid_argument("Invalid Routing same-vehicle index.");
      result.indices = model.GetSameVehicleIndicesOfIndex(index); break;
    case 18: {
      if (index < 0 || index >= model.Size() + model.vehicles() || (!model.IsStart(index) && !model.IsEnd(index)))
        throw std::invalid_argument("Routing vehicle-class lookup requires a start or end index.");
      const auto& vehicles = model.GetVehiclesOfSameClass(index);
      result.indices.assign(vehicles.begin(), vehicles.end()); break;
    }
    case 19:
      if (index < 0 || index >= model.Size() + model.vehicles() || other_index < 0 || other_index >= model.Size() + model.vehicles())
        throw std::invalid_argument("Invalid Routing arc index.");
      for (const auto& [from, to] : model.GetSameVehicleClassArcs(index, other_index))
        result.groups.push_back({static_cast<int>(from), static_cast<int>(to)});
      break;
    case 20: result.precedence_groups = model.GetTopologicallySortedNodePrecedences(); break;
    case 21:
      if (index < 0 || index >= model.GetNumberOfDisjunctions()) throw std::invalid_argument("Invalid Routing disjunction.");
      result.value = model.GetDisjunctionMaxCardinality(operations_research::RoutingModel::DisjunctionIndex(index)); break;
    case 22: result.value = model.HasMaxCardinalityConstrainedDisjunctions(); break;
    case 23:
      for (const auto& [first, second] : model.GetPerfectBinaryDisjunctions())
        result.groups.push_back({static_cast<int>(first), static_cast<int>(second)});
      break;
    case 24: result.value = model.GetNumOfSingletonNodes(); break;
    case 25:
      if (index < 0 || index >= model.Size() || vehicle_or_class < 0 || vehicle_or_class >= model.vehicles())
        throw std::invalid_argument("Invalid Routing vehicle or eligibility index.");
      result.value = model.IsVehicleAllowedForIndex(vehicle_or_class, index); break;
    case 26:
      if (index < 0 || index >= model.Size() || other_index < 0 || other_index >= model.Size() + model.vehicles())
        throw std::invalid_argument("Invalid Routing first-solution arc.");
      result.value = model.GetArcCostForFirstSolution(index, other_index); break;
    case 27:
      if (index < 0 || index >= model.Size() || !is_match)
        throw std::invalid_argument("Invalid Routing sibling query or missing predicate.");
      if (model.IsPickup(index) && model.IsDelivery(index))
        throw std::invalid_argument("Native Routing sibling lookup does not support a node that is both pickup and delivery.");
      result.value = model.GetFirstMatchingPickupDeliverySibling(index, is_match).value_or(-1); break;
    case 28:
      if (index < 0 || index >= model.Size() || other_index < 0 || other_index >= model.Size() + model.vehicles()
          || third_index < 0 || third_index >= model.Size() + model.vehicles())
        throw std::invalid_argument("Invalid Routing arc comparison index.");
      result.value = model.ArcIsMoreConstrainedThanArc(index, other_index, third_index); break;
    case 29: result.value = model.IsMatchingModel(); break;
    case 30:
      if (!parameters) throw std::invalid_argument("Routing route-interdependence inspection requires search parameters.");
      result.value = model.AreRoutesInterdependent(*parameters); break;
    default: throw std::invalid_argument("Unknown Routing model inspection kind.");
  }
  return result;
}
inline void RoutingInspectionArrayJson(std::ostream& out, int value) { out << value; }
template <typename T>
void RoutingInspectionArrayJson(std::ostream& out, const std::vector<T>& values) {
  out << '[';
  for (size_t i = 0; i < values.size(); ++i) {
    if (i) out << ',';
    RoutingInspectionArrayJson(out, values[i]);
  }
  out << ']';
}
inline std::string RoutingModelInspectionJson(const RoutingModelInspection& result) {
  std::ostringstream out;
  out << "{\"dimensionIndices\":"; RoutingInspectionArrayJson(out, result.dimension_indices);
  out << ",\"indices\":"; RoutingInspectionArrayJson(out, result.indices);
  out << ",\"groups\":"; RoutingInspectionArrayJson(out, result.groups);
  out << ",\"precedenceGroups\":"; RoutingInspectionArrayJson(out, result.precedence_groups);
  if (result.value) out << ",\"value\":\"" << *result.value << '\"';
  out << '}';
  return out.str();
}
}  // namespace ortools_wasm
#endif
