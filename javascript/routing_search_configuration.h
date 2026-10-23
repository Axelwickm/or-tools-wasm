#ifndef ORTOOLS_WASM_ROUTING_SEARCH_CONFIGURATION_H_
#define ORTOOLS_WASM_ROUTING_SEARCH_CONFIGURATION_H_
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_search.h"
namespace ortools_wasm {
inline void ValidateRoutingSecondarySearch(const operations_research::RoutingSearchParameters& parameters,
    bool has_secondary_model) {
  if (parameters.first_solution_optimization_period() <= 0) return;
  if (!has_secondary_model) throw std::invalid_argument("Routing first-solution optimization requires a secondary model.");
  const auto strategy = parameters.first_solution_strategy();
  if (strategy != operations_research::FirstSolutionStrategy::LOCAL_CHEAPEST_INSERTION &&
      strategy != operations_research::FirstSolutionStrategy::LOCAL_CHEAPEST_COST_INSERTION)
    throw std::invalid_argument("Routing first-solution optimization requires LOCAL_CHEAPEST_INSERTION or LOCAL_CHEAPEST_COST_INSERTION.");
}

inline void SetRoutingSecondaryModel(operations_research::RoutingModel& model,
    operations_research::RoutingModel& secondary,
    const operations_research::RoutingSearchParameters& parameters) {
  if (&model == &secondary || model.nodes() != secondary.nodes() || model.vehicles() != secondary.vehicles() || model.Size() != secondary.Size())
    throw std::invalid_argument("Routing secondary model must use the same index-manager layout.");
  for (int vehicle = 0; vehicle < model.vehicles(); ++vehicle) {
    if (model.Start(vehicle) != secondary.Start(vehicle) || model.End(vehicle) != secondary.End(vehicle))
      throw std::invalid_argument("Routing secondary model must use the same index-manager layout.");
  }
  if (parameters.local_search_metaheuristic() != operations_research::LocalSearchMetaheuristic::GREEDY_DESCENT &&
      parameters.local_search_metaheuristic() != operations_research::LocalSearchMetaheuristic::AUTOMATIC)
    throw std::invalid_argument("Routing secondary model requires GREEDY_DESCENT or AUTOMATIC for native fast search.");
  // Native SecondaryOptimizer stores NextVars only. Heterogeneous-cost local
  // search additionally requires VehicleVars and otherwise hits a native CHECK.
  secondary.CloseModelWithParameters(parameters);
  if (secondary.status() == operations_research::RoutingSearchStatus::ROUTING_INVALID)
    throw std::invalid_argument("Invalid Routing secondary-model search parameters.");
  if (!secondary.CostsAreHomogeneousAcrossVehicles())
    throw std::invalid_argument("Native Routing secondary search requires homogeneous vehicle costs.");
  model.SetSecondaryModel(&secondary, parameters);
}

inline void SetRoutingTabuVars(operations_research::RoutingModel& model,
    std::optional<std::vector<operations_research::IntVar*>> variables) {
  if (!variables) { model.SetTabuVarsCallback(nullptr); return; }
  for (auto* variable : *variables) {
    if (!variable || variable->solver() != model.solver())
      throw std::invalid_argument("Invalid Routing tabu variable or variable from another model.");
  }
  model.SetTabuVarsCallback([values = std::move(*variables)](operations_research::RoutingModel*) { return values; });
}
inline void SetRoutingSweepArranger(operations_research::RoutingModel& model,
    const std::vector<std::pair<int64_t, int64_t>>& points) {
  if (points.size() != static_cast<size_t>(model.Size() + model.vehicles()))
    throw std::invalid_argument("Routing sweep requires one point per routing index, including starts and ends.");
  // Native storage and subtraction use int, despite the constructor's int64 API.
  const auto fits = [](int64_t value) { return value >= std::numeric_limits<int>::min() && value <= std::numeric_limits<int>::max(); };
  for (const auto& [x, y] : points) {
    if (!fits(x) || !fits(y) || !fits(x - points.front().first) || !fits(y - points.front().second))
      throw std::invalid_argument("Routing sweep coordinates and offsets from point zero must fit int32.");
  }
  auto arranger = std::make_unique<operations_research::SweepArranger>(points);
  model.SetSweepArranger(arranger.release());  // RoutingModel takes ownership.
}
inline void AddRoutingOrderedActivityGroup(operations_research::RoutingModel& model,
    const std::vector<int>& indices) {
  std::vector<operations_research::RoutingModel::DisjunctionIndex> disjunctions;
  for (int index : indices) {
    if (index < 0 || index >= model.GetNumberOfDisjunctions())
      throw std::invalid_argument("Invalid Routing ordered-activity disjunction.");
    disjunctions.emplace_back(index);
  }
  model.AddOrderedActivityGroup(std::move(disjunctions));
}
}  // namespace ortools_wasm
#endif
