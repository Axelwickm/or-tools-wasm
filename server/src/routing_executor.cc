#include "server/src/routing_executor.h"

#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "javascript/routing_search_parameters.h"
#include "javascript/routing_progress.h"
#include "javascript/routing_index_validation.h"
#include "javascript/routing_successor_domains.h"
#include "javascript/routing_dimension_bounds.h"
#include "javascript/routing_dimension_construction.h"
#include "javascript/routing_vehicle_costs.h"
#include "javascript/routing_group_controls.h"
#include "javascript/routing_visit_types.h"
#include "javascript/routing_resources.h"
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

int RegisterMatrix(RoutingModel* model, const bridge::RoutingMatrix& input) {
  std::vector<std::vector<int64_t>> matrix;
  if (!Matrix(input, &matrix)) throw std::invalid_argument("Routing matrix dimensions do not match its values.");
  if (input.routing_indices()) {
    if (input.dimension() != model->Size() + model->vehicles()) {
      throw std::invalid_argument("Routing matrix must match the index count.");
    }
    // JS callbacks are sampled by routing index, including duplicate depots.
    return model->RegisterTransitCallback(
        [matrix = std::move(matrix)](int64_t from, int64_t to) { return matrix[from][to]; });
  }
  // Preserve legacy native requests whose matrices are indexed by node.
  if (input.dimension() == model->nodes()) return model->RegisterTransitMatrix(std::move(matrix));
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

void ApplyOperation(RoutingModel* model, const bridge::RoutingModelOperation& operation, ortools_wasm::RoutingExpressionVariables* variables) {
  switch (operation.operation_case()) {
    case bridge::RoutingModelOperation::kAddIntegerExpression: {
      const auto& value = operation.add_integer_expression();
      if (value.index() != variables->integer.size()) throw std::invalid_argument("Invalid Routing integer expression index.");
      std::vector<operations_research::IntExpr*> operands;
      for (const auto& operand : value.operands()) operands.push_back(LinearExpression(model, operand, variables));
      auto* expression = ortools_wasm::RoutingIntegerExpression(model->solver(), value.kind(), operands);
      if (!expression) throw std::invalid_argument("Invalid Routing integer expression kind, arity or operands.");
      variables->integer.push_back(expression->Var()); return;
    }
    case bridge::RoutingModelOperation::kAddBooleanVariable: {
      const auto& value = operation.add_boolean_variable();
      if (value.index() != variables->boolean.size() || !value.has_expression()) throw std::invalid_argument("Invalid Routing Boolean variable index or expression.");
      auto* variable = BooleanExpression(model, value.expression(), variables);
      if (!variable) throw std::invalid_argument("Invalid Routing Boolean expression.");
      variables->boolean.push_back(variable); return;
    }
    case bridge::RoutingModelOperation::kAddBooleanConstraint: {
      const auto& value = operation.add_boolean_constraint();
      if (!value.has_expression()) throw std::invalid_argument("Routing Boolean constraint has no expression.");
      auto* expression = BooleanExpression(model, value.expression(), variables);
      if (!expression) throw std::invalid_argument("Invalid Routing Boolean constraint.");
      model->solver()->AddConstraint(model->solver()->MakeEquality(expression, 1)); return;
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
    case bridge::RoutingModelOperation::kSetArcCostEvaluatorOfVehicles: {
      const auto& value = operation.set_arc_cost_evaluator_of_vehicles();
      if (value.vehicles().empty()) throw std::invalid_argument("Routing arc-cost evaluator requires at least one vehicle.");
      for (const int vehicle : value.vehicles()) if (vehicle < 0 || vehicle >= model->vehicles()) {
        throw std::invalid_argument("Routing arc-cost vehicle is out of range.");
      }
      if (!value.has_transit_matrix() || value.transit_matrix().dimension() != model->Size() + model->vehicles()) {
        throw std::invalid_argument("Routing arc-cost matrix must match the index manager.");
      }
      const int evaluator = RegisterMatrix(model, value.transit_matrix());
      for (const int vehicle : value.vehicles()) model->SetArcCostEvaluatorOfVehicle(evaluator, vehicle);
      return;
    }
    case bridge::RoutingModelOperation::kAddDimension: {
      const auto& value = operation.add_dimension();
      if (!model->AddDimension(RegisterMatrix(model, value.transit_matrix()), value.slack_max(),
                               value.capacity(), value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleCapacity: {
      const auto& value = operation.add_dimension_with_vehicle_capacity();
      if (!model->AddDimensionWithVehicleCapacity(
              RegisterMatrix(model, value.transit_matrix()), value.slack_max(), Values(value.capacities()),
              value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleTransits: {
      const auto& value = operation.add_dimension_with_vehicle_transits();
      std::vector<int> evaluators;
      evaluators.reserve(value.transit_matrices_size());
      for (const auto& matrix : value.transit_matrices()) evaluators.push_back(RegisterMatrix(model, matrix));
      if (!model->AddDimensionWithVehicleTransits(evaluators, value.slack_max(), value.capacity(),
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
      for (const auto& matrix : value.transit_matrices()) evaluators.push_back(RegisterMatrix(model, matrix));
      if (!model->AddDimensionWithVehicleTransitAndCapacity(evaluators, value.slack_max(), capacities,
          value.fix_start_cumul_to_zero(), value.name())) throw std::invalid_argument("Routing dimension already exists: " + value.name());
      return;
    }
    case bridge::RoutingModelOperation::kAddConstantDimension: {
      const auto& value = operation.add_constant_dimension();
      if (!ortools_wasm::AddRoutingConstantDimensionWithSlack(*model, value.value(), value.capacity(), value.slack_max(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddVectorDimension: {
      const auto& value = operation.add_vector_dimension();
      if (!model->AddVectorDimension(Values(value.values()), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddMatrixDimension: {
      const auto& value = operation.add_matrix_dimension();
      std::vector<std::vector<int64_t>> matrix;
      if (!Matrix(value.matrix(), &matrix)) throw std::invalid_argument("Routing dimension matrix is invalid.");
      if (!model->AddMatrixDimension(std::move(matrix), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
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
    case bridge::RoutingModelOperation::kAddPickupAndDelivery:
      if (!IsRoutingIndexValid(*model, operation.add_pickup_and_delivery().pickup(), false) ||
          !IsRoutingIndexValid(*model, operation.add_pickup_and_delivery().delivery(), false)) {
        throw std::invalid_argument("Routing pickup/delivery has an invalid index.");
      }
      model->AddPickupAndDelivery(operation.add_pickup_and_delivery().pickup(),
                                  operation.add_pickup_and_delivery().delivery());
      return;
    case bridge::RoutingModelOperation::kAddVehicleEqualityConstraint: {
      const auto& value = operation.add_vehicle_equality_constraint();
      if (!IsRoutingIndexValid(*model, value.left()) || !IsRoutingIndexValid(*model, value.right())) {
        throw std::invalid_argument("Routing vehicle equality has an invalid index.");
      }
      model->solver()->AddConstraint(model->solver()->MakeEquality(
          model->VehicleVar(value.left()), model->VehicleVar(value.right())));
      return;
    }
    case bridge::RoutingModelOperation::kAddCumulLessOrEqualConstraint: {
      const auto& value = operation.add_cumul_less_or_equal_constraint();
      if (!IsRoutingIndexValid(*model, value.left()) || !IsRoutingIndexValid(*model, value.right())) {
        throw std::invalid_argument("Routing cumul constraint has an invalid index.");
      }
      auto* dimension = model->GetMutableDimension(value.dimension_name());
      if (dimension == nullptr) {
        throw std::invalid_argument("Unknown Routing dimension: " +
                                    value.dimension_name());
      }
      model->solver()->AddConstraint(model->solver()->MakeLessOrEqual(
          dimension->CumulVar(value.left()),
          dimension->CumulVar(value.right())));
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
      if (value.index() < 0 || value.index() >= model->Size() + model->vehicles()) {
        throw std::invalid_argument("Routing vehicle domain has an invalid index.");
      }
      for (int vehicle : value.values()) {
        if (vehicle < -1 || vehicle >= model->vehicles()) {
          throw std::invalid_argument("Routing vehicle domain has an invalid value.");
        }
      }
      const std::vector<int64_t> domain(value.values().begin(), value.values().end());
      IntersectRoutingValues(*model, *model->VehicleVar(value.index()), domain);
      return;
    }
    case bridge::RoutingModelOperation::kSetAllowedVehiclesForIndex: {
      const auto& value = operation.set_allowed_vehicles_for_index();
      if (value.index() < 0 || value.index() >= model->Size() + model->vehicles()) {
        throw std::invalid_argument("Routing vehicle eligibility has an invalid index.");
      }
      const std::vector<int> vehicles(value.vehicles().begin(), value.vehicles().end());
      for (int vehicle : vehicles) {
        if (vehicle < 0 || vehicle >= model->vehicles()) {
          throw std::invalid_argument("Routing vehicle eligibility has an invalid vehicle.");
        }
      }
      model->SetAllowedVehiclesForIndex(vehicles, value.index());
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
      auto* dimension = model->GetMutableDimension(value.dimension_name());
      const int64_t indices = model->Size() + model->vehicles();
      if (dimension == nullptr || value.first() < 0 || value.second() < 0 ||
          value.first() >= indices || value.second() >= indices) {
        throw std::invalid_argument("Routing node precedence has an unknown dimension or invalid indices.");
      }
      dimension->AddNodePrecedence(value.first(), value.second(), value.offset());
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
  RoutingSearchParameters parameters = DefaultRoutingSearchParameters();
  if (!parsed.search_parameters_proto().empty() || parsed.search_parameter_fields_size() > 0) {
    std::string error;
    if (!ortools_wasm::ParseRoutingSearchParameters(parsed.search_parameters_proto(),
        std::vector<std::string>(parsed.search_parameter_fields().begin(), parsed.search_parameter_fields().end()),
        &parameters, &error)) throw std::invalid_argument(error);
  }
  const int solver_threads = parameters.sat_parameters().num_workers();
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
    std::vector<RoutingIndexManager::NodeIndex> starts;
    std::vector<RoutingIndexManager::NodeIndex> ends;
    for (int value : parsed.starts()) starts.push_back(RoutingIndexManager::NodeIndex(value));
    for (int value : parsed.ends()) ends.push_back(RoutingIndexManager::NodeIndex(value));
    RoutingIndexManager manager(parsed.num_locations(), parsed.num_vehicles(), starts, ends);
    operations_research::RoutingModelParameters model_parameters;
    std::string model_error;
    if (!ortools_wasm::ParseRoutingModelParameters(parsed.model_parameters_proto(),
        std::vector<std::string>(parsed.model_parameter_fields().begin(), parsed.model_parameter_fields().end()),
        &model_parameters, &model_error)) return Error(model_error);
    RoutingModel model(manager, model_parameters);
    model.SetArcCostEvaluatorOfAllVehicles(RegisterMatrix(&model, parsed.transit_matrix()));
    for (int group = 0; group < parsed.resource_groups_size(); ++group) model.AddResourceGroup();
    ortools_wasm::RoutingExpressionVariables variables;
    for (const auto& operation : parsed.operations()) ApplyOperation(&model, operation, &variables);

    for (int group = 0; group < parsed.resource_groups_size(); ++group) {
      const auto& data = parsed.resource_groups(group);
      for (const auto& resource : data.resources()) ortools_wasm::AddRoutingResource(model, group, resource.dimension_name(),
          {resource.start_domain().begin(), resource.start_domain().end()}, {resource.end_domain().begin(), resource.end_domain().end()});
      for (int vehicle : data.required_vehicles()) ortools_wasm::RequireRoutingResource(model, group, vehicle);
      for (const auto& allowed : data.allowed_resources()) ortools_wasm::AllowRoutingResources(model, group, allowed.vehicle(), {allowed.resources().begin(), allowed.resources().end()});
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
      return Serialize(response);
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
      return Serialize(response);
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
      return Serialize(response);
    }
    const auto capture = [&](int kind, const std::string& name) {
      if (!ortools_wasm::CaptureRoutingVariables(model, kind, name, &variables)) throw std::invalid_argument("Failed to capture Routing assignment variables.");
    };
    for (const auto& name : parsed.dimension_names()) for (int kind : {2, 6, 7}) capture(kind, name);
    for (int kind : {8, 9, 11, 12}) capture(kind, "");
    auto cancellation = context.OnCancellation([&model] { model.CancelSearch(); });
    RoutingSearchParameters parameters;
    std::string parameter_error;
    if (!ortools_wasm::ParseRoutingSearchParameters(parsed.search_parameters_proto(),
        std::vector<std::string>(parsed.search_parameter_fields().begin(), parsed.search_parameter_fields().end()),
        &parameters, &parameter_error)) return Error(parameter_error);
    BindRoutingAutomaticWorkerBudget(&parameters, context.allocated_threads());
    if (parsed.solution_events()) ortools_wasm::AddRoutingProgress(&model, parsed.track_unchecked_neighbors(), [&](bool unchecked) {
      bridge::RoutingBridgeResponse event;
      auto* progress = event.mutable_solve_event();
      progress->set_objective_value(model.CostVar()->Max());
      progress->set_unchecked(unchecked);
      progress->set_solution_count(model.solver()->solutions());
      emit_event(event.SerializeAsString());
    });
    const Assignment* assignment = nullptr;
    if (parsed.has_initial_assignment()) {
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
            : model.SolveFromAssignmentWithParameters(initial_assignment, parameters);
      }
    } else {
      assignment = model.SolveWithParameters(parameters);
    }
    if (context.cancellation_requested()) {
      auto result = Error("Routing solve was cancelled.");
      result.failure_kind = SolverExecutionFailureKind::kCancelled;
      return result;
    }

    bridge::RoutingBridgeResponse response;
    response.set_status(model.status());
    response.set_automatic_first_solution_strategy(model.GetAutomaticFirstSolutionStrategy());
    if (assignment == nullptr && parsed.has_initial_assignment() && model.status() == 0) response.set_status(3);
    response.set_local_search_profile(model.solver()->LocalSearchProfile());
    if (assignment == nullptr) return Serialize(response);
    response.set_has_solution(true);
    response.set_objective_value(assignment->ObjectiveValue());
    for (int index = 0; index < manager.num_indices(); ++index) {
      response.add_next_values(index);
      response.add_vehicle_values(assignment->Value(model.VehicleVar(index)));
    }
    for (int vehicle = 0; vehicle < parsed.num_vehicles(); ++vehicle) {
      int64_t index = model.Start(vehicle);
      response.add_starts(index);
      while (!model.IsEnd(index)) {
        const int64_t next = assignment->Value(model.NextVar(index));
        response.set_next_values(index, next);
        index = next;
      }
      response.add_ends(index);
    }
    for (const std::string& name : parsed.dimension_names()) {
      if (!model.HasDimension(name)) return Error("Routing response requested an unknown dimension: " + name);
      auto* values = response.add_dimensions();
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
        auto* value = response.add_assignment_variables();
        auto* reference = value->mutable_variable(); reference->set_kind(static_cast<bridge::RoutingVariableKind>(kind)); reference->set_dimension_name(name); reference->set_index(index);
        value->set_min(bounds[0]); value->set_max(bounds[1]);
      }
    };
    for (int group = 0; group < model.GetResourceGroups().size(); ++group) {
      auto* values = response.add_resource_assignments();
      for (int vehicle = 0; vehicle < model.vehicles(); ++vehicle) {
        int64_t bounds[2];
        if (!ortools_wasm::RoutingResourceAssignmentBounds(model, *assignment, group, vehicle, bounds)) return Error("Routing assignment has no resource bounds.");
        values->add_mins(bounds[0]); values->add_maxs(bounds[1]);
      }
    }
    for (const auto& name : parsed.dimension_names()) for (int kind : {2, 6, 7}) snapshot(kind, name, model.Size());
    for (int kind : {8, 9}) snapshot(kind, "", model.vehicles());
    snapshot(11, "", variables.boolean.size());
    snapshot(12, "", variables.integer.size());
    return Serialize(response);
  } catch (const std::invalid_argument& error) {
    return Error(error.what());
  } catch (const std::exception& error) {
    return SolverExecutorResult{false, {}, error.what(), SolverExecutionFailureKind::kInternal};
  }
}

}  // namespace ortools_wasm::server
