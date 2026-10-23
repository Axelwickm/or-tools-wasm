#include "server/src/routing_executor.h"
#include "javascript/routing_model_builder.h"

#include <cstdint>
#include <algorithm>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#include <unordered_map>
#include <exception>

#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "javascript/routing_search_parameters.h"
#include "javascript/routing_pickup_delivery.h"
#include "javascript/routing_assignments.h"
#include "javascript/routing_assignment_workflows.h"
#include "javascript/routing_route_callbacks.h"
#include "javascript/routing_dimension_inspection.h"
#include "javascript/routing_model_inspection.h"
#include "javascript/routing_progress.h"
#include "javascript/routing_index_validation.h"
#include "javascript/routing_successor_domains.h"
#include "javascript/routing_dimension_bounds.h"
#include "javascript/routing_dimension_construction.h"
#include "javascript/routing_vehicle_costs.h"
#include "javascript/routing_transit_matrix.h"
#include "javascript/routing_state_dependent_transit.h"
#include "javascript/routing_group_controls.h"
#include "javascript/routing_search_configuration.h"
#include "javascript/routing_visit_types.h"
#include "javascript/routing_resources.h"
#include "javascript/routing_breaks.h"
#include "javascript/routing_finalizers.h"
#include "javascript/routing_linear_constraints.h"
#include "routing.pb.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::Assignment;
using ::operations_research::DefaultRoutingSearchParameters;
using ::operations_research::FirstSolutionStrategy;
using ::operations_research::RoutingIndexManager;
using ::operations_research::RoutingModel;
using ::operations_research::RoutingSearchParameters;

SolverExecutorResult Error(std::string message) {
  return SolverExecutorResult{false, {}, std::move(message),
                              SolverExecutionFailureKind::kInvalidRequest};
}

std::vector<int64_t> Values(const google::protobuf::RepeatedField<int64_t>& values) {
  return {values.begin(), values.end()};
}

bool Matrix(const bridge::RoutingMatrix& input,
            std::vector<std::vector<int64_t>>* output) {
  const int dimension = input.dimension();
  if (dimension <= 0 || input.values_size() != dimension * dimension) return false;
  output->assign(dimension, std::vector<int64_t>(dimension));
  for (int row = 0; row < dimension; ++row) {
    for (int column = 0; column < dimension; ++column) {
      (*output)[row][column] = input.values(row * dimension + column);
    }
  }
  return true;
}

int RegisterMatrix(ortools_wasm::RoutingModelBuilder& state, const bridge::RoutingMatrix& input) {
  auto* model = state.model.get();
  if (input.routing_indices()) return state.RegisterIndexMatrix(
      std::vector<int64_t>(input.values().begin(), input.values().end()), input.dimension(), input.unary());
  std::vector<std::vector<int64_t>> matrix;
  if (input.unary() || !Matrix(input, &matrix)) throw std::invalid_argument("Invalid Routing node matrix.");
  // Preserve native requests whose matrices are indexed by node.
  if (input.dimension() == model->nodes()) return state.RegisterNodeMatrix(std::move(matrix));
  throw std::invalid_argument("Routing matrix must match the node count.");
}

operations_research::IntExpr* LinearExpression(RoutingModel* model, const bridge::RoutingLinearExpression& input, const ortools_wasm::RoutingExpressionVariables* variables) {
  std::vector<ortools_wasm::RoutingLinearTerm> terms;
  for (const auto& term : input.terms()) {
    if (!term.has_variable()) return nullptr;
    const auto& variable = term.variable();
    terms.push_back({variable.kind(), variable.dimension_name(), variable.index(), term.coefficient(), variable.resource_group()});
  }
  return ortools_wasm::RoutingLinearExpression(*model, terms, input.offset(), variables);
}

operations_research::IntVar* BooleanExpression(RoutingModel* model, const bridge::RoutingBooleanExpression& input,
    const ortools_wasm::RoutingExpressionVariables* variables) {
  operations_research::IntExpr* left = nullptr; operations_research::IntExpr* right = nullptr;
  int comparison = 0;
  if (input.kind() == 2) {
    if (!input.has_variable()) return nullptr;
    const auto& variable = input.variable();
    left = ortools_wasm::RoutingVariable(*model, variable.kind(), variable.dimension_name(), variable.index(), variable.resource_group(), variables);
  } else if (input.kind() == 3) {
    if (!input.has_comparison() || !input.comparison().has_left() || !input.comparison().has_right()) return nullptr;
    left = LinearExpression(model, input.comparison().left(), variables);
    right = LinearExpression(model, input.comparison().right(), variables); comparison = input.comparison().comparison();
  }
  std::vector<operations_research::IntVar*> operands;
  for (const auto& operand : input.operands()) { auto* value = BooleanExpression(model, operand, variables); if (!value) return nullptr; operands.push_back(value); }
  return ortools_wasm::RoutingBooleanExpression(model->solver(), input.kind(), input.value(), comparison, left, right, operands);
}

void ApplyOperation(ortools_wasm::RoutingModelBuilder& state, const bridge::RoutingModelOperation& operation) {
  auto* model = state.model.get();
  auto* variables = &state.variables;
  auto* breaks = &state.breaks;
  auto* travel_handles = &state.travel_handles;
  switch (operation.operation_case()) {
    case bridge::RoutingModelOperation::kIgnoreDisjunctionsAlreadyForcedToZero:
      state.IgnoreForcedDisjunctions(); break;
    case bridge::RoutingModelOperation::kSetTabuVars: {
      const auto& data = operation.set_tabu_vars();
      if (data.reset()) { ortools_wasm::SetRoutingTabuVars(*model, std::nullopt); break; }
      std::vector<operations_research::IntVar*> selected;
      for (const auto& variable : data.variables()) selected.push_back(ortools_wasm::RoutingVariable(*model,
          variable.kind(), variable.dimension_name(), variable.index(), variable.resource_group(), variables));
      ortools_wasm::SetRoutingTabuVars(*model, std::move(selected)); break;
    }
    case bridge::RoutingModelOperation::kAddDependentDimension: {
      const auto& value = operation.add_dependent_dimension();
      if (value.transit_matrices_size() != model->vehicles() || value.dependent_matrices_size() != model->vehicles())
        throw std::invalid_argument("Routing dependent dimension requires one evaluator per vehicle.");
      std::vector<int> fixed, dependent;
      for (const auto& matrix : value.transit_matrices()) fixed.push_back(RegisterMatrix(state, matrix));
      for (const auto& matrix : value.dependent_matrices()) {
        ortools_wasm::RoutingStateDependentMatrix native{matrix.domain_start(), matrix.domain_end(), {}};
        for (const auto& function : matrix.functions()) native.functions.push_back({
          std::vector<int64_t>(function.x().begin(), function.x().end()), std::vector<int64_t>(function.y().begin(), function.y().end())});
        dependent.push_back(state.RegisterDependentMatrix(std::move(native)));
      }
      const std::string* base = value.has_base_dimension() ? &value.base_dimension() : nullptr;
      if (!state.AddDependentDimension(fixed, dependent, base, value.slack_max(),
          std::vector<int64_t>(value.capacities().begin(), value.capacities().end()), value.fix_start_cumul_to_zero(), value.name()))
        throw std::invalid_argument("Routing dependent dimension already exists.");
      return;
    }
    case bridge::RoutingModelOperation::kSetSweepArranger: {
      std::vector<std::pair<int64_t, int64_t>> points;
      for (const auto& point : operation.set_sweep_arranger().points()) points.emplace_back(point.x(), point.y());
      SetRoutingSweepArranger(*model, points); break;
    }
    case bridge::RoutingModelOperation::kAddOrderedActivityGroup: {
      const auto& indices = operation.add_ordered_activity_group().disjunctions();
      AddRoutingOrderedActivityGroup(*model, std::vector<int>(indices.begin(), indices.end())); break;
    }
    case bridge::RoutingModelOperation::kAddForbiddenIntervals: {
      const auto& data = operation.add_forbidden_intervals();
      std::vector<std::pair<int64_t, int64_t>> intervals;
      for (const auto& interval : data.intervals()) intervals.emplace_back(interval.start(), interval.end());
      ortools_wasm::AddRoutingForbiddenIntervals(*model, data.dimension_name(), data.index(), intervals);
      return;
    }
    case bridge::RoutingModelOperation::kSetPiecewiseCost: {
      const auto& cost = operation.set_piecewise_cost();
      std::vector<ortools_wasm::RoutingCostSegment> segments;
      for (const auto& value : cost.segments()) segments.push_back({value.point_x(), value.point_y(), value.slope(), value.other_point_x()});
      ortools_wasm::SetRoutingPiecewiseCost(*model, cost.dimension_name(), cost.index(), segments);
      return;
    }
    case bridge::RoutingModelOperation::kAddBreakInterval: {
      const auto& value = operation.add_break_interval();
      if (value.index() != breaks->size()) throw std::invalid_argument("Invalid Routing break interval index.");
      ortools_wasm::AddRoutingBreakInterval(*model, *breaks, value.start_min(), value.start_max(), value.duration(), value.optional(), value.name());
      return;
    }
    case bridge::RoutingModelOperation::kSetBreakIntervals: {
      const auto& value = operation.set_break_intervals();
      const int pre_travel = value.has_pre_travel() ? RegisterMatrix(state, value.pre_travel()) : -1;
      const int post_travel = value.has_post_travel() ? RegisterMatrix(state, value.post_travel()) : -1;
      if (pre_travel >= 0 && value.has_pre_travel_handle()) (*travel_handles)[pre_travel] = value.pre_travel_handle();
      if (post_travel >= 0 && value.has_post_travel_handle()) (*travel_handles)[post_travel] = value.post_travel_handle();
      ortools_wasm::SetRoutingBreakIntervals(*model, *breaks, value.dimension_name(), value.vehicle(),
        std::vector<int>(value.intervals().begin(), value.intervals().end()), pre_travel, post_travel);
      return;
    }
    case bridge::RoutingModelOperation::kSetBreakDistanceDuration: {
      const auto& value = operation.set_break_distance_duration();
      ortools_wasm::SetRoutingBreakDistanceDuration(*model, value.dimension_name(), value.vehicle(), value.distance(), value.duration());
      return;
    }
    case bridge::RoutingModelOperation::kAddIntegerExpression: {
      const auto& value = operation.add_integer_expression();
      if (value.index() != variables->integer.size()) throw std::invalid_argument("Invalid Routing integer expression index.");
      std::vector<operations_research::IntExpr*> operands;
      for (const auto& operand : value.operands()) operands.push_back(LinearExpression(model, operand, variables));
      auto* expression = ortools_wasm::RoutingIntegerExpression(model->solver(), value.kind(), operands);
      if (!expression) throw std::invalid_argument("Invalid Routing integer expression kind, arity or operands.");
      if (!state.RegisterIntegerVariable(value.index(), expression)) throw std::invalid_argument("Invalid Routing integer variable.");
      return;
    }
    case bridge::RoutingModelOperation::kAddBooleanVariable: {
      const auto& value = operation.add_boolean_variable();
      if (value.index() != variables->boolean.size() || !value.has_expression()) throw std::invalid_argument("Invalid Routing Boolean variable index or expression.");
      auto* variable = BooleanExpression(model, value.expression(), variables);
      if (!variable) throw std::invalid_argument("Invalid Routing Boolean expression.");
      if (!state.RegisterBooleanVariable(value.index(), variable)) throw std::invalid_argument("Invalid Routing Boolean variable.");
      return;
    }
    case bridge::RoutingModelOperation::kAddBooleanConstraint: {
      const auto& value = operation.add_boolean_constraint();
      if (!value.has_expression()) throw std::invalid_argument("Routing Boolean constraint has no expression.");
      auto* expression = BooleanExpression(model, value.expression(), variables);
      if (!expression) throw std::invalid_argument("Invalid Routing Boolean constraint.");
      if (!state.AddBooleanConstraint(expression)) throw std::invalid_argument("Invalid Routing Boolean constraint.");
      return;
    }

    case bridge::RoutingModelOperation::kAddTypeRequirement: {
      const auto& value = operation.add_type_requirement();
      const std::vector<int> alternatives(value.required_type_alternatives().begin(), value.required_type_alternatives().end());
      if (!ortools_wasm::AddRoutingTypeRequirement(*model, value.kind(), value.dependent_type(), alternatives))
        throw std::invalid_argument("Invalid Routing type requirement kind or visit type.");
      return;
    }
    case bridge::RoutingModelOperation::kSetVisitType: {
      const auto& value = operation.set_visit_type();
      if (!ortools_wasm::SetRoutingVisitType(*model, value.index(), value.type(), value.policy()))
        throw std::invalid_argument("Invalid Routing visit-type index, type or policy.");
      return;
    }
    case bridge::RoutingModelOperation::kAddHardTypeIncompatibility: {
      const auto& value = operation.add_hard_type_incompatibility();
      if (!ortools_wasm::AddRoutingHardTypeIncompatibility(*model, value.type1(), value.type2()))
        throw std::invalid_argument("Routing hard incompatibility references an unknown visit type.");
      return;
    }
    case bridge::RoutingModelOperation::kAddTemporalTypeIncompatibility: {
      const auto& value = operation.add_temporal_type_incompatibility();
      if (!ortools_wasm::AddRoutingTemporalTypeIncompatibility(*model, value.type1(), value.type2()))
        throw std::invalid_argument("Routing temporal incompatibility references an unknown visit type.");
      return;
    }
    case bridge::RoutingModelOperation::kSetMaximumActiveVehicles: {
      if (!ortools_wasm::SetRoutingMaximumActiveVehicles(*model, operation.set_maximum_active_vehicles().maximum())) throw std::invalid_argument("Invalid Routing active vehicle limit.");
      return;
    }
    case bridge::RoutingModelOperation::kSetFixedVehicleCost: {
      const auto& value = operation.set_fixed_vehicle_cost();
      if (!ortools_wasm::SetRoutingFixedVehicleCost(*model, value.vehicle(), value.cost())) throw std::invalid_argument("Invalid Routing fixed vehicle cost.");
      return;
    }
    case bridge::RoutingModelOperation::kSetPathEnergyCosts: {
      const auto& value = operation.set_path_energy_costs();
      if (!ortools_wasm::SetRoutingPathEnergyCosts(*model, value.force(), value.distance(), value.vehicle(), value.threshold(), value.cost_below(), value.cost_above()))
        throw std::invalid_argument("Invalid Routing path-energy dimensions, vehicle or costs.");
      return;
    }
    case bridge::RoutingModelOperation::kAddSameActivityGroup: {
      const auto& indices = operation.add_same_activity_group().indices();
      if (!ortools_wasm::AddRoutingSameActivityGroup(*model, std::vector<int>(indices.begin(), indices.end())))
        throw std::invalid_argument("Invalid Routing same-activity index.");
      return;
    }
    case bridge::RoutingModelOperation::kSetAmortizedVehicleCosts: {
      const auto& value = operation.set_amortized_vehicle_costs();
      if (!ortools_wasm::SetRoutingAmortizedVehicleCosts(*model, value.vehicle(), value.linear(), value.quadratic())) throw std::invalid_argument("Invalid Routing amortized vehicle costs.");
      return;
    }
    case bridge::RoutingModelOperation::kSetVehicleUsedWhenEmpty: {
      const auto& value = operation.set_vehicle_used_when_empty();
      if (!ortools_wasm::SetRoutingVehicleUsedWhenEmpty(*model, value.vehicle(), value.is_used())) throw std::invalid_argument("Invalid Routing empty-route vehicle.");
      return;
    }
    case bridge::RoutingModelOperation::kSetFirstSolutionEvaluator: {
      const int evaluator = RegisterMatrix(state, operation.set_first_solution_evaluator());
      state.SetFirstSolutionEvaluator(evaluator);
      return;
    }
    case bridge::RoutingModelOperation::kSetPrimaryConstrainedDimension: {
      const auto& name = operation.set_primary_constrained_dimension();
      if (!state.SetPrimaryConstrainedDimension(name)) throw std::invalid_argument("Routing primary constrained dimension does not exist.");
      return;
    }
    case bridge::RoutingModelOperation::kSetArcCostEvaluatorOfVehicles: {
      const auto& value = operation.set_arc_cost_evaluator_of_vehicles();
      if (value.vehicles().empty()) throw std::invalid_argument("Routing arc-cost evaluator requires at least one vehicle.");
      for (const int vehicle : value.vehicles()) if (vehicle < 0 || vehicle >= model->vehicles()) {
        throw std::invalid_argument("Routing arc-cost vehicle is out of range.");
      }
      if (!value.has_transit_matrix() || value.transit_matrix().dimension() != model->Size() + model->vehicles()) {
        throw std::invalid_argument("Routing arc-cost matrix must match the index manager.");
      }
      const int evaluator = RegisterMatrix(state, value.transit_matrix());
      for (const int vehicle : value.vehicles()) state.SetArcCostEvaluator(evaluator, vehicle);
      return;
    }
    case bridge::RoutingModelOperation::kAddDimension: {
      const auto& value = operation.add_dimension();
      if (!state.AddDimension(RegisterMatrix(state, value.transit_matrix()), value.slack_max(),
                               value.capacity(), value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleCapacity: {
      const auto& value = operation.add_dimension_with_vehicle_capacity();
      if (!state.AddDimensionWithVehicleCapacity(
              RegisterMatrix(state, value.transit_matrix()), value.slack_max(), Values(value.capacities()),
              value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleTransits: {
      const auto& value = operation.add_dimension_with_vehicle_transits();
      std::vector<int> evaluators;
      evaluators.reserve(value.transit_matrices_size());
      for (const auto& matrix : value.transit_matrices()) evaluators.push_back(RegisterMatrix(state, matrix));
      if (!state.AddDimensionWithVehicleTransits(evaluators, value.slack_max(), value.capacity(),
                                                  value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleTransitAndCapacity: {
      const auto& value = operation.add_dimension_with_vehicle_transit_and_capacity();
      const auto capacities = Values(value.capacities());
      if (!ortools_wasm::IsRoutingVehicleDimensionValid(model->vehicles(), value.transit_matrices_size(), capacities, value.slack_max()))
        throw std::invalid_argument("Invalid Routing vehicle dimension evaluators, capacities or slack.");
      std::vector<int> evaluators;
      for (const auto& matrix : value.transit_matrices()) evaluators.push_back(RegisterMatrix(state, matrix));
      if (!state.AddDimensionWithVehicleTransitAndCapacity(evaluators, value.slack_max(), capacities,
          value.fix_start_cumul_to_zero(), value.name())) throw std::invalid_argument("Routing dimension already exists: " + value.name());
      return;
    }
    case bridge::RoutingModelOperation::kAddConstantDimension: {
      const auto& value = operation.add_constant_dimension();
      if (!state.AddConstantDimension(value.value(), value.capacity(), value.fix_start_cumul_to_zero(), value.name(), value.slack_max()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddVectorDimension: {
      const auto& value = operation.add_vector_dimension();
      if (!state.AddVectorDimension(Values(value.values()), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddMatrixDimension: {
      const auto& value = operation.add_matrix_dimension();
      std::vector<std::vector<int64_t>> matrix;
      if (!Matrix(value.matrix(), &matrix)) throw std::invalid_argument("Routing dimension matrix is invalid.");
      if (!state.AddMatrixDimension(std::move(matrix), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddSoftSameVehicleConstraint: {
      const auto& value = operation.add_soft_same_vehicle_constraint();
      if (!ortools_wasm::AddRoutingSoftSameVehicleConstraint(*model, Values(value.indices()), value.cost())) throw std::invalid_argument("Invalid Routing soft same-vehicle constraint.");
      return;
    }
    case bridge::RoutingModelOperation::kSetPickupDeliveryPolicy: {
      const auto& value = operation.set_pickup_delivery_policy();
      if (!ortools_wasm::SetRoutingPickupDeliveryPolicy(*model, value.vehicle(), value.policy())) throw std::invalid_argument("Invalid Routing pickup/delivery policy.");
      return;
    }
    case bridge::RoutingModelOperation::kAddDisjunction: {
      const auto& value = operation.add_disjunction();
      if (ortools_wasm::AddRoutingDisjunction(*model, Values(value.indices()),
          value.has_penalty() ? value.penalty() : RoutingModel::kNoPenalty,
          value.has_max_cardinality() ? value.max_cardinality() : 1,
          value.has_penalty_cost_behavior() ? value.penalty_cost_behavior() : 0) < 0) throw std::invalid_argument("Routing disjunction has an invalid index, cardinality or penalty behavior.");
      return;
    }
    case bridge::RoutingModelOperation::kAddPickupAndDeliverySets: {
      const auto& value = operation.add_pickup_and_delivery_sets();
      if (!ortools_wasm::AddRoutingPickupAndDeliverySets(*model, value.pickup_disjunction(), value.delivery_disjunction()))
        throw std::invalid_argument("Routing pickup/delivery sets have an invalid disjunction.");
      return;
    }
    case bridge::RoutingModelOperation::kSetPickupToDeliveryLimits: {
      const auto& value = operation.set_pickup_to_delivery_limits();
      if (!ortools_wasm::SetRoutingPickupToDeliveryLimits(*model, value.dimension_name(), value.pair_index(), Values(value.limits())))
        throw std::invalid_argument("Routing pickup/delivery limit table has an invalid dimension, pair or size.");
      return;
    }
    case bridge::RoutingModelOperation::kAddPickupAndDelivery: {
      const auto& value = operation.add_pickup_and_delivery();
      if (!state.AddPickupAndDelivery(value.pickup(), value.delivery()))
        throw std::invalid_argument("Routing pickup/delivery has an invalid index.");
      return;
    }
    case bridge::RoutingModelOperation::kAddVehicleEqualityConstraint: {
      const auto& value = operation.add_vehicle_equality_constraint();
      if (!state.AddVehicleEquality(value.left(), value.right()))
        throw std::invalid_argument("Routing vehicle equality has an invalid index.");
      return;
    }
    case bridge::RoutingModelOperation::kAddCumulLessOrEqualConstraint: {
      const auto& value = operation.add_cumul_less_or_equal_constraint();
      if (!state.AddCumulLessOrEqual(value.dimension_name(), value.left(), value.right()))
        throw std::invalid_argument("Routing cumul constraint has an invalid index or dimension.");
      return;
    }
    case bridge::RoutingModelOperation::kModifyDomain: {
      const auto& value = operation.modify_domain();
      if (!value.has_variable()) throw std::invalid_argument("Routing domain operation has no variable.");
      const auto& variable = value.variable();
      if (!ortools_wasm::ModifyRoutingDomain(*model, variable.kind(), variable.dimension_name(), variable.index(),
          value.action(), value.lower(), value.upper(), Values(value.values()), variable.resource_group(), variables)) throw std::invalid_argument("Invalid Routing domain operation.");
      return;
    }
    case bridge::RoutingModelOperation::kAddLinearConstraint: {
      const auto& value = operation.add_linear_constraint();
      std::vector<ortools_wasm::RoutingLinearCondition> conditions;
      for (const auto& condition : value.conditions()) {
        if (!condition.has_left() || !condition.has_right()) throw std::invalid_argument("Routing enforcement condition has no expression.");
        conditions.push_back({LinearExpression(model, condition.left(), variables), LinearExpression(model, condition.right(), variables), condition.comparison()});
      }
      std::vector<operations_research::IntVar*> boolean_conditions;
      for (const auto& predicate : value.boolean_conditions()) { auto* condition = BooleanExpression(model, predicate, variables); if (!condition) throw std::invalid_argument("Invalid Routing Boolean enforcement condition."); boolean_conditions.push_back(condition); }
      if (!value.has_left() || !value.has_right() || !ortools_wasm::AddRoutingLinearConstraint(*model,
          LinearExpression(model, value.left(), variables), LinearExpression(model, value.right(), variables), value.comparison(), conditions, boolean_conditions))
        throw std::invalid_argument("Invalid Routing linear constraint.");
      return;
    }
    case bridge::RoutingModelOperation::kAddFinalizer: {
      const auto& value = operation.add_finalizer();
      if (!ortools_wasm::AddRoutingFinalizer(*model, value.variable_kind(), value.dimension_name(), value.index(),
          value.kind(), value.target(), value.has_weight(), value.weight(), value.resource_group(), variables)) {
        throw std::invalid_argument("Routing finalizer has an invalid variable, dimension or kind.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetNextValues: {
      const auto& value = operation.set_next_values();
      const auto successors = Values(value.values());
      if (!SetRoutingNextValues(*model, value.index(), successors)) {
        throw std::invalid_argument("Routing successor domain has an invalid index or value.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetActiveValues: {
      const auto& value = operation.set_active_values();
      const std::vector<int64_t> domain(value.values().begin(), value.values().end());
      if (!SetRoutingActiveValues(*model, value.index(), domain)) {
        throw std::invalid_argument("Routing active domain has an invalid index or value.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetSlackBounds: {
      const auto& value = operation.set_slack_bounds();
      if (!SetRoutingDimensionBounds(*model, value.dimension_name(), value.index(), value.lower(), value.upper(), true)) {
        throw std::invalid_argument("Routing slack bounds have an unknown dimension, invalid index or reversed range.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetDimensionValue: {
      const auto& value = operation.set_dimension_value();
      if (value.has_vehicle() && (value.vehicle() < 0 || value.vehicle() >= model->vehicles())) {
        throw std::invalid_argument("Routing dimension setting has an invalid vehicle.");
      }
      if (!SetRoutingDimensionValue(*model, value.dimension_name(), value.kind(), value.has_vehicle() ? value.vehicle() : -1, value.value())) {
        throw std::invalid_argument("Routing dimension setting has an unknown dimension, invalid kind, vehicle or value.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetVehicleValues: {
      const auto& value = operation.set_vehicle_values();
      if (!state.SetVehicleValues(value.index(), {value.values().begin(), value.values().end()}))
        throw std::invalid_argument("Routing vehicle domain has an invalid index or value.");
      return;
    }
    case bridge::RoutingModelOperation::kSetAllowedVehiclesForIndex: {
      const auto& value = operation.set_allowed_vehicles_for_index();
      if (!state.SetAllowedVehicles(value.index(), {value.vehicles().begin(), value.vehicles().end()}))
        throw std::invalid_argument("Routing vehicle eligibility has an invalid index or vehicle.");
      return;
    }
    case bridge::RoutingModelOperation::kSetCumulBounds: {
      const auto& value = operation.set_cumul_bounds();
      if (!SetRoutingDimensionBounds(*model, value.dimension_name(), value.index(), value.lower(), value.upper(), false)) {
        throw std::invalid_argument("Routing cumul bounds have an unknown dimension, invalid index or reversed range.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddNodePrecedence: {
      const auto& value = operation.add_node_precedence();
      if (!state.AddNodePrecedence(value.dimension_name(), value.first(), value.second(), value.offset(), value.performed_constraint()))
        throw std::invalid_argument("Routing node precedence has an unknown dimension or invalid indices.");
      return;
    }
    case bridge::RoutingModelOperation::kSetCumulSoftBound: {
      const auto& value = operation.set_cumul_soft_bound();
      if (!ortools_wasm::SetRoutingCumulSoftBound(*model, value.dimension_name(), value.index(),
                                                 value.bound(), value.coefficient(), value.lower())) {
        throw std::invalid_argument("Invalid Routing soft cumul bound.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetSoftSpanUpperBound: {
      const auto& value = operation.set_soft_span_upper_bound();
      if (!ortools_wasm::SetRoutingSoftSpanBound(*model, value.dimension_name(), value.vehicle(), value.bound(), value.cost(), false)) {
        throw std::invalid_argument("Invalid Routing soft span bound.");
      }
      return;
    }
    case bridge::RoutingModelOperation::kSetQuadraticCostSoftSpanUpperBound: {
      const auto& value = operation.set_quadratic_cost_soft_span_upper_bound();
      if (!ortools_wasm::SetRoutingSoftSpanBound(*model, value.dimension_name(), value.vehicle(), value.bound(), value.cost(), true)) {
        throw std::invalid_argument("Invalid Routing quadratic soft span bound.");
      }
      return;
    }
    case bridge::RoutingModelOperation::OPERATION_NOT_SET:
      throw std::invalid_argument("Routing model operation is empty.");
  }
}

SolverExecutorResult Serialize(const bridge::RoutingBridgeResponse& response) {
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize Routing response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

}  // namespace

void BindRoutingAutomaticWorkerBudget(RoutingSearchParameters* parameters,
                                      int allocated_threads) {
  if (allocated_threads < 1) {
    throw std::invalid_argument("Routing requires at least one allocated thread.");
  }
  if (parameters->sat_parameters().num_workers() == 0) {
    parameters->mutable_sat_parameters()->set_num_workers(allocated_threads);
  }
}

std::string RoutingExecutor::solver() const { return "routing"; }

int RoutingExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                      int client_requested_threads,
                                      int server_total_threads) const {
  bridge::RoutingBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse Routing bridge request.");
  if (server_total_threads < 1) throw std::invalid_argument("Server has no Routing capacity.");
  int solver_threads = 1;
  bool automatic = false;
  for (const auto* current = &parsed; current; current = current->has_secondary_model() ? &current->secondary_model() : nullptr) {
    RoutingSearchParameters parameters;
    std::string error;
    if (!ortools_wasm::ParseRoutingSearchParameters(current->search_parameters_proto(),
        std::vector<std::string>(current->search_parameter_fields().begin(), current->search_parameter_fields().end()), &parameters, &error))
      throw std::invalid_argument(error);
    const int workers = parameters.sat_parameters().num_workers();
    automatic |= workers == 0;
    solver_threads = std::max(solver_threads, workers);
  }
  if (automatic) solver_threads = 0;
  if (client_requested_threads > 0 && solver_threads <= 0) {
    throw std::invalid_argument("A finite thread request cannot be paired with Routing CP-SAT automatic workers.");
  }
  if (client_requested_threads > 0 && solver_threads > 0 && client_requested_threads != solver_threads) {
    throw std::invalid_argument("Routing CP-SAT worker count does not match the requested job threads.");
  }
  const int requested_threads = solver_threads > 0 ? solver_threads : server_total_threads;
  if (requested_threads > server_total_threads) {
    throw std::invalid_argument("Routing CP-SAT requests more threads than the server capacity.");
  }
  return requested_threads;
}

namespace {
using BuiltRoutingModel = ortools_wasm::RoutingModelBuilder;

std::unique_ptr<BuiltRoutingModel> BuildRoutingModel(const bridge::RoutingBridgeRequest& parsed,
    const SolverExecutorRequest& request, int allocated_threads,
    std::exception_ptr& route_callback_error, const std::function<void()>& cancel) {
  if (parsed.num_locations() <= 0 || parsed.num_vehicles() <= 0 ||
      parsed.starts_size() != parsed.num_vehicles() || parsed.ends_size() != parsed.num_vehicles() || !parsed.has_transit_matrix())
    throw std::invalid_argument("Routing request dimensions are invalid.");
  if (parsed.has_secondary_model()) for (const auto& operation : parsed.operations()) if (operation.has_add_route_constraint())
    throw std::invalid_argument("Native Routing secondary-model optimization does not safely support whole-route callbacks.");
  auto manager = BuiltRoutingModel::CreateManager(parsed.num_locations(), parsed.num_vehicles(),
      {parsed.starts().begin(), parsed.starts().end()}, {parsed.ends().begin(), parsed.ends().end()});
  operations_research::RoutingModelParameters model_parameters;
  std::string model_error;
  if (!ortools_wasm::ParseRoutingModelParameters(parsed.model_parameters_proto(),
      std::vector<std::string>(parsed.model_parameter_fields().begin(), parsed.model_parameter_fields().end()),
      &model_parameters, &model_error)) throw std::invalid_argument(model_error);
  auto state = std::make_unique<BuiltRoutingModel>(std::move(manager), model_parameters);
  auto& model = *state->model;
  state->SetArcCostEvaluator(RegisterMatrix(*state, parsed.transit_matrix()));
  for (int group = 0; group < parsed.resource_groups_size(); ++group) state->AddResourceGroup();
  for (const auto& operation : parsed.operations()) {
    if (operation.has_add_route_constraint()) {
      if (!request.callback || operation.add_route_constraint().evaluator() < 0) throw std::invalid_argument("Routing route constraints require callback transport.");
      const auto& value = operation.add_route_constraint();
      state->AddRouteConstraint([callback = request.callback, evaluator = value.evaluator(), cancel, &route_callback_error](const std::vector<int64_t>& route) -> std::optional<int64_t> {
        // Never unwind a C++ exception through an active CP search.
        try {
          if (route_callback_error) return std::nullopt;
          const auto reply = callback(ortools_wasm::RoutingRouteCallbackData(evaluator, route));
          if (!reply) { cancel(); return std::nullopt; }
          return ortools_wasm::RoutingRouteCallbackCost(*reply);
        } catch (...) {
          route_callback_error = std::current_exception();
          cancel();
          return std::nullopt;
        }
      }, value.costs_are_homogeneous_across_vehicles());
    } else ApplyOperation(*state, operation);
  }

  for (int group = 0; group < parsed.resource_groups_size(); ++group) {
    const auto& data = parsed.resource_groups(group);
    for (const auto& resource : data.resources()) ortools_wasm::AddRoutingResource(model, group, resource.dimension_name(),
        {resource.start_domain().begin(), resource.start_domain().end()}, {resource.end_domain().begin(), resource.end_domain().end()});
    for (int vehicle : data.required_vehicles()) ortools_wasm::RequireRoutingResource(model, group, vehicle);
    for (const auto& allowed : data.allowed_resources()) ortools_wasm::AllowRoutingResources(model, group, allowed.vehicle(), {allowed.resources().begin(), allowed.resources().end()});
  }

  if (parsed.has_secondary_model()) {
    const auto& secondary = parsed.secondary_model();
    for (const auto& operation : secondary.operations()) if (operation.has_add_route_constraint())
      throw std::invalid_argument("Native Routing secondary-model optimization does not safely support whole-route callbacks.");
    if (parsed.num_locations() != secondary.num_locations() || parsed.num_vehicles() != secondary.num_vehicles() ||
        std::vector<int>(parsed.starts().begin(), parsed.starts().end()) != std::vector<int>(secondary.starts().begin(), secondary.starts().end()) ||
        std::vector<int>(parsed.ends().begin(), parsed.ends().end()) != std::vector<int>(secondary.ends().begin(), secondary.ends().end()))
      throw std::invalid_argument("Routing secondary model must use the same index-manager layout.");
    state->secondary = BuildRoutingModel(secondary, request, allocated_threads, route_callback_error, cancel);
    RoutingSearchParameters parameters;
    std::string error;
    if (!ortools_wasm::ParseRoutingSearchParameters(secondary.search_parameters_proto(),
        std::vector<std::string>(secondary.search_parameter_fields().begin(), secondary.search_parameter_fields().end()), &parameters, &error))
      throw std::invalid_argument(error);
    BindRoutingAutomaticWorkerBudget(&parameters, allocated_threads);
    if (parameters.sat_parameters().num_workers() > allocated_threads) throw std::invalid_argument("Routing secondary model exceeds its admitted thread budget.");
    ortools_wasm::ValidateRoutingSecondarySearch(parameters, secondary.has_secondary_model());
    state->SetSecondaryModel(state->secondary, parameters);
  }
  return state;
}
}  // namespace

SolverExecutorResult RoutingExecutor::Execute(const SolverExecutorRequest& request,
                                              const JobContext& context,
                                              const SolverEventSink& emit_event) {

  bridge::RoutingBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse Routing bridge request.");
  if (parsed.read_assignment_only() && !parsed.has_initial_assignment()) return Error("Routing assignment validation requires routes.");
  if (parsed.num_locations() <= 0 || parsed.num_vehicles() <= 0 ||
      parsed.starts_size() != parsed.num_vehicles() || parsed.ends_size() != parsed.num_vehicles() ||
      !parsed.has_transit_matrix()) return Error("Routing request dimensions are invalid.");
  if (context.cancellation_requested()) {
    auto result = Error("Routing solve was cancelled before it started.");
    result.failure_kind = SolverExecutionFailureKind::kCancelled;
    return result;
  }

  try {
    std::exception_ptr route_callback_error;
    const auto serialize_response = [&](const bridge::RoutingBridgeResponse& response) {
      if (route_callback_error) std::rethrow_exception(route_callback_error);
      return Serialize(response);
    };
    std::unique_ptr<BuiltRoutingModel> state;
    state = BuildRoutingModel(parsed, request, context.allocated_threads(), route_callback_error, [&state] { if (state) state->Cancel(); });
    auto& manager = *state->manager;
    auto& model = *state->model;
    auto& variables = state->variables;
    auto& breaks = state->breaks;
    auto& travel_handles = state->travel_handles;

    const auto apply_route_locks = [&] {
      std::vector<std::vector<int64_t>> routes;
      for (const auto& route : parsed.route_locks().routes()) {
        routes.emplace_back(route.indices().begin(), route.indices().end());
      }
      return model.ApplyLocksToAllVehicles(routes, parsed.route_locks().close_routes());
    };
    if (parsed.inspect_pre_assignment()) {
      RoutingSearchParameters parameters;
      std::string parameter_error;
      if (!ortools_wasm::ParseRoutingSearchParameters(parsed.search_parameters_proto(),
          std::vector<std::string>(parsed.search_parameter_fields().begin(), parsed.search_parameter_fields().end()),
          &parameters, &parameter_error)) return Error(parameter_error);
      BindRoutingAutomaticWorkerBudget(&parameters, context.allocated_threads());
      model.CloseModelWithParameters(parameters);
      bridge::RoutingBridgeResponse response;
      if (parsed.has_route_locks()) {
        response.set_locks_applied(apply_route_locks());
      }
      auto* values = response.mutable_pre_assignment()->mutable_next_values();
      for (int index = 0; index < model.Size(); ++index) {
        auto* variable = model.NextVar(index); const auto* assignment = model.PreAssignment();
        if (assignment->Contains(variable) && assignment->Bound(variable)) (*values)[index] = assignment->Value(variable);
      }
      return serialize_response(response);
    }
    if (parsed.inspect_activity_groups()) {
      model.CloseModelWithParameters(DefaultRoutingSearchParameters());
      bridge::RoutingBridgeResponse response;
      auto* inspection = response.mutable_activity_groups();
      for (int group : model.GetSameActivityGroups()) inspection->add_groups(group);
      for (int group = 0; group < model.GetSameActivityGroupsCount(); ++group) {
        auto* members = inspection->add_members();
        for (int index : model.GetSameActivityIndicesOfGroup(group)) members->add_indices(index);
      }
      return serialize_response(response);
    }
    if (parsed.has_resource_inspection_group()) {
      const int group_index = parsed.resource_inspection_group();
      auto& group = ortools_wasm::RoutingResourceGroup(model, group_index);
      model.CloseModelWithParameters(DefaultRoutingSearchParameters());
      bridge::RoutingBridgeResponse response;
      auto* inspection = response.mutable_resource_inspection();
      const auto attributes = [&](auto* output, int index, bool for_class) {
        for (const auto& name : parsed.dimension_names()) {
          const auto& values = ortools_wasm::RoutingResourceAttributes(model, group_index, index, name, for_class);
          auto* item = output->add_dimension_attributes(); item->set_dimension_name(name);
          for (int64_t bound : values.start_domain().FlattenedIntervals()) item->add_start_domain(bound);
          for (int64_t bound : values.end_domain().FlattenedIntervals()) item->add_end_domain(bound);
        }
      };
      for (const auto& name : parsed.dimension_names()) {
        if (!model.HasDimension(name)) return Error("Unknown Routing resource inspection dimension.");
        if (group.GetAffectedDimensionIndices().contains(model.GetDimensionOrDie(name).index())) inspection->add_affected_dimensions(name);
      }
      for (int resource = 0; resource < group.Size(); ++resource) {
        auto* item = inspection->add_resources(); item->set_class_index(ortools_wasm::RoutingResourceClassIndex(model, group_index, resource));
        attributes(item, resource, false);
      }
      for (int resource_class = 0; resource_class < group.GetResourceClassesCount(); ++resource_class) {
        auto* item = inspection->add_classes();
        for (int resource : ortools_wasm::RoutingResourcesInClass(model, group_index, resource_class)) item->add_resource_indices(resource);
        attributes(item, resource_class, true);
      }
      return serialize_response(response);
    }
    if (parsed.has_route_cost_query()) {
      const auto& input = parsed.route_cost_query().indices();
      const auto cost = ortools_wasm::EvaluateRoutingRouteCost(model, {input.begin(), input.end()});
      bridge::RoutingBridgeResponse response;
      auto* result = response.mutable_route_cost();
      if (cost) result->set_cost(*cost);
      return serialize_response(response);
    }
    if (parsed.has_pickup_delivery_inspection_index()) {
      const int index = parsed.pickup_delivery_inspection_index();
      if (index < 0 || index >= model.Size()) return Error("Invalid Routing pickup/delivery index.");
      bridge::RoutingBridgeResponse response; auto* inspection = response.mutable_pickup_delivery_inspection();
      if (const auto position = model.GetPickupPosition(index)) { auto* value = inspection->mutable_pickup(); value->set_pair_index(position->pd_pair_index); value->set_alternative_index(position->alternative_index); }
      if (const auto position = model.GetDeliveryPosition(index)) { auto* value = inspection->mutable_delivery(); value->set_pair_index(position->pd_pair_index); value->set_alternative_index(position->alternative_index); }
      inspection->set_is_pickup(model.IsPickup(index)); inspection->set_is_delivery(model.IsDelivery(index));
      return serialize_response(response);
    }
    if (parsed.has_break_inspection()) {
      const auto& query = parsed.break_inspection();
      const auto value = [&](int kind, int index = 0) { return ortools_wasm::RoutingBreakConfigurationValue(model, breaks, query.dimension_name(), query.vehicle(), kind, index); };
      bridge::RoutingBridgeResponse response; auto* config = response.mutable_break_configuration();
      config->set_has_break_constraints(value(0));
      if (config->has_break_constraints()) {
        for (int i = 0, count = value(1); i < count; ++i) config->add_intervals(value(2, i));
        for (int i = 0, count = value(3); i < count; ++i) { auto* pair = config->add_distance_duration(); pair->set_distance(value(4, i)); pair->set_duration(value(5, i)); }
        const int pre = value(6), post = value(7);
        config->set_pre_travel_evaluator(travel_handles.count(pre) ? travel_handles.at(pre) : pre);
        config->set_post_travel_evaluator(travel_handles.count(post) ? travel_handles.at(post) : post);
      }
      return serialize_response(response);
    }
    if (parsed.domain_queries_size() > 0) {
      bridge::RoutingBridgeResponse response;
      for (const auto& query : parsed.domain_queries()) {
        if (!query.has_variable()) return Error("Routing domain query has no variable.");
        const auto& reference = query.variable();
        auto* variable = ortools_wasm::RoutingVariable(model, reference.kind(), reference.dimension_name(), reference.index(), reference.resource_group(), &variables);
        if (!variable) return Error("Invalid Routing variable domain query.");
        auto* domain = response.add_domain_results();
        domain->set_min(variable->Min()); domain->set_max(variable->Max()); domain->set_size(variable->Size()); domain->set_bound(variable->Bound());
        if (query.has_contains_value()) domain->set_contains(variable->Contains(query.contains_value()));
        if (query.has_soft_lower_bound()) {
          if (reference.kind() != bridge::ROUTING_VARIABLE_CUMUL) return Error("Soft bounds require a cumul variable.");
          const auto& dimension = model.GetDimensionOrDie(reference.dimension_name());
          domain->set_soft_bound(query.soft_lower_bound() ? dimension.GetCumulVarSoftLowerBound(reference.index()) : dimension.GetCumulVarSoftUpperBound(reference.index()));
        }
      }
      return serialize_response(response);
    }
    if (parsed.arc_cost_queries_size() > 0) {
      bridge::RoutingBridgeResponse response;
      model.CloseModelWithParameters(DefaultRoutingSearchParameters());
      for (const auto& query : parsed.arc_cost_queries()) {
        if (!ortools_wasm::IsRoutingIndexValid(model, query.from_index(), true)
            || !ortools_wasm::IsRoutingIndexValid(model, query.to_index(), true)
            || query.vehicle() < -1 || query.vehicle() >= model.vehicles()) return Error("Invalid Routing arc cost query.");
        response.add_arc_costs(model.GetArcCostForVehicle(query.from_index(), query.to_index(), query.vehicle()));
      }
      return serialize_response(response);
    }
    const auto capture = [&](int kind, const std::string& name) {
      if (!ortools_wasm::CaptureRoutingVariables(model, kind, name, &variables)) throw std::invalid_argument("Failed to capture Routing assignment variables.");
    };
    for (const auto& name : parsed.dimension_names()) for (int kind : {2, 6, 7}) capture(kind, name);
    for (int kind : {8, 9, 11, 12}) capture(kind, "");
    auto cancellation = context.OnCancellation([&state] { state->Cancel(); });
    RoutingSearchParameters parameters;
    std::string parameter_error;
    if (!ortools_wasm::ParseRoutingSearchParameters(parsed.search_parameters_proto(),
        std::vector<std::string>(parsed.search_parameter_fields().begin(), parsed.search_parameter_fields().end()),
        &parameters, &parameter_error)) return Error(parameter_error);
    BindRoutingAutomaticWorkerBudget(&parameters, context.allocated_threads());
    ortools_wasm::ValidateRoutingSecondarySearch(parameters, parsed.has_secondary_model());
    if ((parsed.has_model_query() && (parsed.model_query().kind() < bridge::ROUTING_MODEL_QUERY_UNARY_DIMENSIONS || (parsed.model_query().kind() >= bridge::ROUTING_MODEL_QUERY_SINGLE_NODES_OF_TYPE && parsed.model_query().kind() <= bridge::ROUTING_MODEL_QUERY_SORTED_NODE_PRECEDENCES) || parsed.model_query().kind() == bridge::ROUTING_MODEL_QUERY_SINGLETON_NODES || parsed.model_query().kind() == bridge::ROUTING_MODEL_QUERY_FIRST_SOLUTION_ARC_COST || parsed.model_query().kind() == bridge::ROUTING_MODEL_QUERY_FIRST_MATCHING_PICKUP_DELIVERY_SIBLING || (parsed.model_query().kind() >= bridge::ROUTING_MODEL_QUERY_ARC_MORE_CONSTRAINED && parsed.model_query().kind() <= bridge::ROUTING_MODEL_QUERY_ROUTES_INTERDEPENDENT))) || (parsed.has_dimension_query() && parsed.dimension_query().kind() != bridge::ROUTING_DIMENSION_QUERY_PIECEWISE_COST && parsed.dimension_query().kind() != bridge::ROUTING_DIMENSION_QUERY_IS_UNARY) || parsed.inspect_cumul_optimizers() || parsed.has_assignment_transfer() || parsed.assignment_action() != bridge::ROUTING_ASSIGNMENT_ACTION_SOLVE || parsed.has_route_locks() || parsed.has_first_solution_hint() || (parsed.has_initial_assignment() && parsed.initial_assignment().has_snapshot()))
      model.CloseModelWithParameters(parameters);
    if (model.status() == operations_research::RoutingSearchStatus::ROUTING_INVALID) return Error("Invalid Routing search parameters for model closure.");
    if (parsed.has_assignment_transfer()) {
      const auto& input = parsed.assignment_transfer();
      const auto snapshot = ortools_wasm::TransferRoutingAssignment(model, manager,
          {input.next_values().begin(), input.next_values().end()}, {input.vehicle_values().begin(), input.vehicle_values().end()});
      bridge::RoutingBridgeResponse response;
      auto* seed = response.mutable_assignment_seed();
      seed->set_objective_min(snapshot.objective_min); seed->set_objective_max(snapshot.objective_max);
      for (const auto& value : snapshot.variables) {
        auto* output = seed->add_variables();
        output->mutable_variable()->set_kind(static_cast<bridge::RoutingVariableKind>(value.kind));
        output->mutable_variable()->set_index(value.index);
        output->set_min(value.value); output->set_max(value.value);
      }
      return serialize_response(response);
    }
    const auto load_snapshot = [&](const bridge::RoutingAssignmentSnapshot& snapshot) {
      auto* assignment = model.solver()->MakeAssignment();
      ortools_wasm::SetRoutingAssignmentObjective(model, *assignment,
          snapshot.has_objective_value() ? std::optional<int64_t>(snapshot.objective_value()) : std::nullopt,
          snapshot.has_objective_min() ? std::optional<int64_t>(snapshot.objective_min()) : std::nullopt,
          snapshot.has_objective_max() ? std::optional<int64_t>(snapshot.objective_max()) : std::nullopt);
      for (const auto& value : snapshot.variables()) {
        const auto& reference = value.variable();
        if (!ortools_wasm::SetRoutingAssignmentVariable(model, *assignment, reference.kind(), reference.dimension_name(),
            reference.index(), reference.resource_group(), value.min(), value.max(), &variables))
          throw std::invalid_argument("Invalid Routing assignment variable snapshot.");
      }
      for (const auto& value : snapshot.intervals()) {
        const int64_t bounds[] = {value.performed_min(), value.performed_max(), value.start_min(), value.start_max(), value.end_min(), value.end_max()};
        if (!ortools_wasm::SetRoutingAssignmentInterval(*assignment, breaks, value.index(), bounds))
          throw std::invalid_argument("Invalid Routing interval snapshot.");
      }
      return assignment;
    };
    if (parsed.has_model_query()) {
      const auto& query = parsed.model_query();
      std::function<bool(int64_t)> predicate;
      if (query.kind() == bridge::ROUTING_MODEL_QUERY_FIRST_MATCHING_PICKUP_DELIVERY_SIBLING) {
        if (!request.callback || query.predicate_evaluator() < 0) throw std::invalid_argument("Routing sibling lookup requires callback transport.");
        predicate = [&](int64_t sibling) {
          const auto reply = request.callback(ortools_wasm::RoutingRouteCallbackData(query.predicate_evaluator(), {sibling}));
          if (!reply) throw std::runtime_error("Routing sibling predicate interrupted.");
          const auto value = ortools_wasm::RoutingRouteCallbackCost(*reply);
          if (!value) throw std::invalid_argument("Routing sibling predicate requires a Boolean reply.");
          return ortools_wasm::RoutingPredicateCallbackResult(*value);
        };
      }
      const auto result = ortools_wasm::InspectRoutingModel(model, query.kind(), query.index(), query.other_index(), query.vehicle_or_class(), query.default_value(), predicate, query.third_index(), &parameters);
      bridge::RoutingBridgeResponse response;
      auto* data = response.mutable_model_inspection();
      if (result.value) data->set_value(*result.value);
      for (int index : result.dimension_indices) data->add_dimension_indices(index);
      for (int index : result.indices) data->add_indices(index);
      for (const auto& group : result.groups) {
        auto* output = data->add_groups();
        for (int index : group) output->add_indices(index);
      }
      for (const auto& groups : result.precedence_groups) {
        auto* collection = data->add_precedence_groups();
        for (const auto& group : groups) {
          auto* output = collection->add_groups();
          for (int index : group) output->add_indices(index);
        }
      }
      return serialize_response(response);
    }
    if (parsed.has_dimension_query()) {
      const auto& query = parsed.dimension_query();
      ortools_wasm::RoutingDimensionInspection result;
      if (query.kind() == bridge::ROUTING_DIMENSION_QUERY_SHORTEST_TRANSITION_SLACK) {
        if (!parsed.has_initial_assignment() || !parsed.initial_assignment().has_snapshot())
          throw std::invalid_argument("Shortest transition slack requires an assignment snapshot.");
        result.value = ortools_wasm::InspectRoutingShortestTransitionSlack(model, query.dimension_name(), query.index(),
            load_snapshot(parsed.initial_assignment().snapshot()));
      } else result = ortools_wasm::InspectRoutingDimension(model, query.dimension_name(), query.kind(), query.index(), query.other_index(), query.vehicle_or_class(), query.lower(), query.upper(),
          query.pair_index(), query.pickup_alternative_index(), query.delivery_alternative_index());
      bridge::RoutingBridgeResponse response; auto* data = response.mutable_dimension_inspection();
      if (result.value) data->set_value(*result.value);
      data->set_has_piecewise_linear_cost(result.has_piecewise_linear_cost);
      for (const auto& interval : result.intervals) { auto* value = data->add_intervals(); value->set_start(interval.first); value->set_end(interval.second); }
      for (const auto& segment : result.cost_segments) { auto* value = data->add_cost_segments(); value->set_point_x(segment.point_x); value->set_point_y(segment.point_y); value->set_slope(segment.slope); value->set_other_point_x(segment.other_point_x); }
      for (const auto& precedence : result.node_precedences) {
        auto* value = data->add_node_precedences();
        value->set_first(precedence.first_node); value->set_second(precedence.second_node);
        value->set_offset(precedence.offset); value->set_performed_constraint(static_cast<int>(precedence.performed_constraint));
      }
      return serialize_response(response);
    }
    if (parsed.inspect_cumul_optimizers()) {
      bridge::RoutingBridgeResponse response;
      auto* optimizers = response.mutable_cumul_optimizers();
      for (const auto* dimension : model.GetDimensionsWithGlobalCumulOptimizers()) optimizers->add_global_dimensions(dimension->name());
      for (const auto* dimension : model.GetDimensionsWithLocalCumulOptimizers()) optimizers->add_local_dimensions(dimension->name());
      return serialize_response(response);
    }
    if (parsed.has_route_locks()) {
      apply_route_locks();
    }
    if (parsed.has_first_solution_hint()) model.SetFirstSolutionHint(load_snapshot(parsed.first_solution_hint()));
    if (parsed.search_entry_events()) model.AddEnterSearchCallback([&] {
      bridge::RoutingBridgeResponse event; event.set_search_entered(true); emit_event(event.SerializeAsString());
    });
    if (parsed.solution_events()) ortools_wasm::AddRoutingProgress(&model, parsed.track_unchecked_neighbors(), [&](bool unchecked) {
      bridge::RoutingBridgeResponse event;
      auto* progress = event.mutable_solve_event();
      progress->set_objective_value(model.CostVar()->Max());
      progress->set_unchecked(unchecked);
      progress->set_solution_count(model.solver()->solutions());
      emit_event(event.SerializeAsString());
    });
    ortools_wasm::RoutingAssignmentWorkflow workflow;
    workflow.action = parsed.assignment_action();
    workflow.packing_duration_seconds = parsed.packing_duration_seconds();
    workflow.check_solution_in_cp = parsed.check_solution_in_cp();
    workflow.call_at_solution_monitors = parsed.call_at_solution_monitors();
    for (const auto& candidate : parsed.candidate_assignments()) workflow.candidates.push_back(load_snapshot(candidate));
    workflow.Validate(parameters, parsed.has_initial_assignment());
    const Assignment* assignment = nullptr;
    if (parsed.has_initial_assignment() && parsed.initial_assignment().has_snapshot()) {
      const auto* initial_assignment = load_snapshot(parsed.initial_assignment().snapshot());
      assignment = parsed.read_assignment_only() ? model.RestoreAssignment(*initial_assignment)
          : workflow.Run(model, initial_assignment, parameters);
    } else if (parsed.has_initial_assignment()) {
      model.CloseModelWithParameters(parameters);
      std::vector<std::vector<int64_t>> routes;
      routes.reserve(parsed.initial_assignment().routes_size());
      for (const auto& route : parsed.initial_assignment().routes()) {
        routes.emplace_back(route.indices().begin(), route.indices().end());
      }
      const Assignment* initial_assignment = model.ReadAssignmentFromRoutes(
          routes, parsed.initial_assignment().ignore_inactive_indices());
      if (initial_assignment != nullptr) {
        assignment = parsed.read_assignment_only() ? initial_assignment
            : workflow.Run(model, initial_assignment, parameters);
      }
    } else {
      assignment = workflow.Run(model, nullptr, parameters);
    }
    if (context.cancellation_requested()) {
      auto result = Error("Routing solve was cancelled.");
      result.failure_kind = SolverExecutionFailureKind::kCancelled;
      return result;
    }

    bridge::RoutingBridgeResponse response;
    response.set_status(model.status());
    response.set_objective_lower_bound(model.objective_lower_bound());
    if (workflow.action == bridge::ROUTING_ASSIGNMENT_ACTION_PACK) response.set_time_limit_reached(workflow.time_limit_reached);
    if (workflow.action == bridge::ROUTING_ASSIGNMENT_ACTION_LOWER_BOUND) response.set_computed_lower_bound(workflow.computed_lower_bound);
    if (workflow.action == bridge::ROUTING_ASSIGNMENT_ACTION_CHECK_FEASIBILITY) response.set_assignment_feasible(workflow.assignment_feasible);
    const auto& stats = model.search_stats();
    auto* statistics = response.mutable_search_statistics();
    statistics->set_num_cp_sat_calls_in_lp_scheduling(stats.num_cp_sat_calls_in_lp_scheduling);
    statistics->set_num_glop_calls_in_lp_scheduling(stats.num_glop_calls_in_lp_scheduling);
    statistics->set_num_min_cost_flow_calls(stats.num_min_cost_flow_calls);
    statistics->set_num_cp_sat_calls_in_routing(stats.num_cp_sat_calls_in_routing);
    statistics->set_num_generalized_cp_sat_calls_in_routing(stats.num_generalized_cp_sat_calls_in_routing);
    if (model.status() != operations_research::RoutingSearchStatus::ROUTING_INVALID) {
      statistics->set_num_decisions_in_first_solution(model.GetNumberOfDecisionsInFirstSolution(parameters));
      statistics->set_num_rejects_in_first_solution(model.GetNumberOfRejectsInFirstSolution(parameters));
    }
    response.set_automatic_first_solution_strategy(model.GetAutomaticFirstSolutionStrategy());
    if (assignment == nullptr && parsed.has_initial_assignment() && model.status() == 0) response.set_status(3);
    response.set_local_search_profile(model.solver()->LocalSearchProfile());
    if (assignment == nullptr) return serialize_response(response);
    const auto serialize_assignment = [&](const Assignment* assignment, auto* output) {
      output->set_objective_value(assignment->ObjectiveValue());
      for (int index = 0; index < manager.num_indices(); ++index) {
        output->add_next_values(index);
        output->add_vehicle_values(assignment->Value(model.VehicleVar(index)));
      }
      for (int vehicle = 0; vehicle < parsed.num_vehicles(); ++vehicle) {
        int64_t index = model.Start(vehicle);
        output->add_starts(index);
        while (!model.IsEnd(index)) {
          const int64_t next = assignment->Value(model.NextVar(index));
          output->set_next_values(index, next);
          index = next;
        }
        output->add_ends(index);
      }
      for (const std::string& name : parsed.dimension_names()) {
        if (!model.HasDimension(name)) throw std::invalid_argument("Routing response requested an unknown dimension: " + name);
        auto* values = output->add_dimensions();
        values->set_name(name);
        const auto& dimension = model.GetDimensionOrDie(name);
        for (int index = 0; index < manager.num_indices(); ++index) {
          const auto* cumul = dimension.CumulVar(index);
          values->add_cumul_values(assignment->Min(cumul));
          values->add_cumul_mins(assignment->Min(cumul));
          values->add_cumul_maxs(assignment->Max(cumul));
        }
      }
      const auto snapshot = [&](int kind, const std::string& name, int64_t count) {
        for (int64_t index = 0; index < count; ++index) {
          int64_t bounds[2];
          if (!ortools_wasm::RoutingAssignmentBounds(model, *assignment, kind, name, index, bounds, &variables)) throw std::invalid_argument("Native Routing assignment has no captured variable bounds.");
          auto* value = output->add_assignment_variables();
          auto* reference = value->mutable_variable(); reference->set_kind(static_cast<bridge::RoutingVariableKind>(kind)); reference->set_dimension_name(name); reference->set_index(index);
          value->set_min(bounds[0]); value->set_max(bounds[1]);
        }
      };
      for (int group = 0; group < model.GetResourceGroups().size(); ++group) {
        auto* values = output->add_resource_assignments();
        for (int vehicle = 0; vehicle < model.vehicles(); ++vehicle) {
          int64_t bounds[2];
          if (!ortools_wasm::RoutingResourceAssignmentBounds(model, *assignment, group, vehicle, bounds)) throw std::invalid_argument("Routing assignment has no resource bounds.");
          values->add_mins(bounds[0]); values->add_maxs(bounds[1]);
        }
      }
      for (const auto& name : parsed.dimension_names()) for (int kind : {2, 6, 7}) snapshot(kind, name, model.Size());
      for (int kind : {8, 9}) snapshot(kind, "", model.vehicles());
      snapshot(11, "", variables.boolean.size());
      snapshot(12, "", variables.integer.size());
      for (int i = 0; i < breaks.size(); ++i) {
        int64_t bounds[6] = {};
        if (!ortools_wasm::RoutingBreakAssignmentBounds(*assignment, breaks, i, bounds)) throw std::invalid_argument("Routing assignment has no break interval bounds.");
        auto* value = output->add_break_assignments();
        value->set_index(i); value->set_performed_min(bounds[0]); value->set_performed_max(bounds[1]);
        if (bounds[1] != 0) {
          value->set_start_min(bounds[2]); value->set_start_max(bounds[3]); value->set_end_min(bounds[4]); value->set_end_max(bounds[5]);
        }
      }
    };
    response.set_has_solution(true);
    serialize_assignment(assignment, &response);
    for (const auto* collected : workflow.collected) serialize_assignment(collected, response.add_collected_solutions());
    return serialize_response(response);
  } catch (const std::invalid_argument& error) {
    return Error(error.what());
  } catch (const std::exception& error) {
    return SolverExecutorResult{false, {}, error.what(), SolverExecutionFailureKind::kInternal};
  }
}

}  // namespace ortools_wasm::server
