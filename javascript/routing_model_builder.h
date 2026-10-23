#ifndef ORTOOLS_WASM_ROUTING_MODEL_BUILDER_H_
#define ORTOOLS_WASM_ROUTING_MODEL_BUILDER_H_

#include <algorithm>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "javascript/routing_breaks.h"
#include "javascript/routing_dimension_construction.h"
#include "javascript/routing_index_validation.h"
#include "javascript/routing_linear_constraints.h"
#include "javascript/routing_search_configuration.h"
#include "javascript/routing_state_dependent_transit.h"
#include "javascript/routing_transit_matrix.h"
#include "javascript/routing_variable_domains.h"

namespace ortools_wasm {

// Native construction and its lifetimes only. Adapters own wire decoding,
// callback transport, progress/cancellation hooks, closure and search.
class RoutingModelBuilder {
 public:
  using Manager = operations_research::RoutingIndexManager;
  using Model = operations_research::RoutingModel;

  static std::shared_ptr<Manager> CreateManager(int locations, int vehicles,
      const std::vector<int>& starts, const std::vector<int>& ends) {
    if (locations <= 0 || vehicles <= 0 || starts.size() != vehicles || ends.size() != vehicles)
      throw std::invalid_argument("Routing request dimensions are invalid.");
    std::vector<Manager::NodeIndex> start_nodes, end_nodes;
    for (int value : starts) {
      if (value < 0 || value >= locations) throw std::invalid_argument("Invalid Routing start node.");
      start_nodes.emplace_back(value);
    }
    for (int value : ends) {
      if (value < 0 || value >= locations) throw std::invalid_argument("Invalid Routing end node.");
      end_nodes.emplace_back(value);
    }
    return std::make_shared<Manager>(locations, vehicles, start_nodes, end_nodes);
  }

  explicit RoutingModelBuilder(std::shared_ptr<Manager> index_manager,
      const operations_research::RoutingModelParameters& parameters = operations_research::DefaultRoutingModelParameters())
      : manager(std::move(index_manager)), model(std::make_unique<Model>(*manager, parameters)) {}
  virtual ~RoutingModelBuilder() = default;
  RoutingModelBuilder(const RoutingModelBuilder&) = delete;
  RoutingModelBuilder& operator=(const RoutingModelBuilder&) = delete;

  int RegisterTransitCallback(std::function<int64_t(int64_t, int64_t)> callback) {
    return RememberEvaluator(model->RegisterTransitCallback(std::move(callback)));
  }
  int RegisterIndexMatrix(std::vector<int64_t> values, int dimension, bool unary) {
    return RememberEvaluator(RegisterRoutingIndexTransitMatrix(*model, std::move(values), dimension, unary));
  }
  int RegisterNodeMatrix(std::vector<std::vector<int64_t>> values) {
    return RememberEvaluator(model->RegisterTransitMatrix(std::move(values)));
  }
  int RegisterDependentMatrix(RoutingStateDependentMatrix values) {
    return RegisterRoutingStateDependentTransitMatrix(*model, std::move(values), dependent_domains);
  }
  void SetArcCostEvaluator(int evaluator, int vehicle = -1) {
    if (vehicle < 0) model->SetArcCostEvaluatorOfAllVehicles(evaluator);
    else model->SetArcCostEvaluatorOfVehicle(evaluator, vehicle);
  }
  bool SetFirstSolutionEvaluator(int evaluator) {
    if (!evaluators.count(evaluator)) return false;
    model->SetFirstSolutionEvaluator(model->TransitCallback(evaluator));
    return true;
  }
  bool SetPrimaryConstrainedDimension(const std::string& name) {
    if (!name.empty() && !model->HasDimension(name)) return false;
    model->SetPrimaryConstrainedDimension(name);
    return true;
  }
  void SetSecondaryModel(std::shared_ptr<RoutingModelBuilder> value,
      const operations_research::RoutingSearchParameters& parameters) {
    SetRoutingSecondaryModel(*model, *value->model, parameters);
    secondary = std::move(value);
  }
  void AddRouteConstraint(std::function<std::optional<int64_t>(const std::vector<int64_t>&)> callback,
      bool homogeneous) {
    has_route_callbacks = true;
    model->AddRouteConstraint(std::move(callback), homogeneous);
  }
  void IgnoreForcedDisjunctions() { model->IgnoreDisjunctionsAlreadyForcedToZero(); }
  int AddResourceGroup() {
    const int index = model->GetResourceGroups().size();
    model->AddResourceGroup();
    return index;
  }

  bool AddDimension(int evaluator, int64_t slack, int64_t capacity, bool fixed, const std::string& name) {
    return model->AddDimension(evaluator, slack, capacity, fixed, name);
  }
  bool AddDimensionWithVehicleCapacity(int evaluator, int64_t slack,
      const std::vector<int64_t>& capacities, bool fixed, const std::string& name) {
    return model->AddDimensionWithVehicleCapacity(evaluator, slack, capacities, fixed, name);
  }
  bool AddDimensionWithVehicleTransits(const std::vector<int>& transits, int64_t slack,
      int64_t capacity, bool fixed, const std::string& name) {
    return model->AddDimensionWithVehicleTransits(transits, slack, capacity, fixed, name);
  }
  bool AddDimensionWithVehicleTransitAndCapacity(const std::vector<int>& transits, int64_t slack,
      const std::vector<int64_t>& capacities, bool fixed, const std::string& name) {
    if (!IsRoutingVehicleDimensionValid(model->vehicles(), transits.size(), capacities, slack)) return false;
    for (int evaluator : transits) if (!evaluators.count(evaluator)) return false;
    return model->AddDimensionWithVehicleTransitAndCapacity(transits, slack, capacities, fixed, name);
  }
  bool AddDependentDimension(const std::vector<int>& transits, const std::vector<int>& dependent,
      const std::string* base, int64_t slack, const std::vector<int64_t>& capacities,
      bool fixed, const std::string& name) {
    for (int evaluator : transits) if (!evaluators.count(evaluator)) return false;
    return AddRoutingDependentDimension(*model, transits, dependent, dependent_domains, base, slack, capacities, fixed, name);
  }
  std::pair<int, bool> AddConstantDimension(int64_t value, int64_t capacity, bool fixed,
      const std::string& name, int64_t slack = 0) {
    auto result = AddRoutingConstantDimensionWithSlack(*model, value, capacity, slack, fixed, name);
    if (result.first >= 0) RememberEvaluator(result.first);
    return result;
  }
  std::pair<int, bool> AddVectorDimension(std::vector<int64_t> values, int64_t capacity,
      bool fixed, const std::string& name) {
    auto result = model->AddVectorDimension(std::move(values), capacity, fixed, name);
    RememberEvaluator(result.first);
    return result;
  }
  std::pair<int, bool> AddMatrixDimension(std::vector<std::vector<int64_t>> values, int64_t capacity,
      bool fixed, const std::string& name) {
    auto result = model->AddMatrixDimension(std::move(values), capacity, fixed, name);
    RememberEvaluator(result.first);
    return result;
  }
  bool AddPickupAndDelivery(int64_t pickup, int64_t delivery) {
    if (!IsRoutingIndexValid(*model, pickup, false) || !IsRoutingIndexValid(*model, delivery, false)) return false;
    model->AddPickupAndDelivery(pickup, delivery);
    return true;
  }
  bool AddVehicleEquality(int64_t left, int64_t right) {
    if (!IsRoutingIndexValid(*model, left) || !IsRoutingIndexValid(*model, right)) return false;
    model->solver()->AddConstraint(model->solver()->MakeEquality(model->VehicleVar(left), model->VehicleVar(right)));
    return true;
  }
  bool AddCumulLessOrEqual(const std::string& name, int64_t left, int64_t right) {
    if (!IsRoutingIndexValid(*model, left) || !IsRoutingIndexValid(*model, right)) return false;
    auto* dimension = model->GetMutableDimension(name);
    if (!dimension) return false;
    model->solver()->AddConstraint(model->solver()->MakeLessOrEqual(dimension->CumulVar(left), dimension->CumulVar(right)));
    return true;
  }
  bool SetVehicleValues(int64_t index, const std::vector<int64_t>& values) {
    if (!IsRoutingIndexValid(*model, index)) return false;
    for (int64_t vehicle : values) if (vehicle < -1 || vehicle >= model->vehicles()) return false;
    IntersectRoutingValues(*model, *model->VehicleVar(index), values);
    return true;
  }
  bool SetAllowedVehicles(int64_t index, const std::vector<int>& vehicles) {
    if (!IsRoutingIndexValid(*model, index)) return false;
    for (int vehicle : vehicles) if (vehicle < 0 || vehicle >= model->vehicles()) return false;
    model->SetAllowedVehiclesForIndex(vehicles, index);
    return true;
  }
  bool AddNodePrecedence(const std::string& name, int64_t first, int64_t second,
      int64_t offset, int performed) {
    auto* dimension = model->GetMutableDimension(name);
    if (!dimension || first < 0 || second < 0 || first >= model->Size() || second >= model->Size()
        || performed < 0 || performed > 3) return false;
    dimension->AddNodePrecedence(first, second, offset,
        static_cast<operations_research::RoutingDimension::NodePrecedence::PerformedConstraint>(performed));
    return true;
  }
  bool RegisterIntegerVariable(int index, operations_research::IntExpr* expression) {
    if (!expression || index != variables.integer.size()) return false;
    variables.integer.push_back(expression->Var());
    return true;
  }
  bool RegisterBooleanVariable(int index, operations_research::IntExpr* expression) {
    if (!expression || index != variables.boolean.size() || expression->Min() < 0 || expression->Max() > 1) return false;
    variables.boolean.push_back(expression->Var());
    return true;
  }
  bool AddBooleanConstraint(operations_research::IntExpr* expression) {
    if (!expression || expression->Min() < 0 || expression->Max() > 1) return false;
    model->solver()->AddConstraint(model->solver()->MakeEquality(expression, 1));
    return true;
  }
  void Cancel() {
    model->CancelSearch();
    if (secondary) secondary->Cancel();
  }

  std::shared_ptr<Manager> manager;
  RoutingExpressionVariables variables;
  RoutingBreakIntervals breaks;
  RoutingStateDependentDomains dependent_domains;
  std::unordered_map<int, int> travel_handles;
  std::unordered_set<int> evaluators{0};
  bool has_route_callbacks = false;
  std::shared_ptr<RoutingModelBuilder> secondary;
  // Model first, then secondary, then the state and manager referenced by them.
  std::unique_ptr<Model> model;

 private:
  int RememberEvaluator(int evaluator) { evaluators.insert(evaluator); return evaluator; }
};
}  // namespace ortools_wasm
#endif
