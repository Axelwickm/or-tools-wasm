#include "server/src/routing_test_helpers.h"
#include "server/src/routing_executor.h"
#include "javascript/routing_model_builder.h"

#include <future>
#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#include "routing.pb.h"
#include "javascript/routing_search_parameters.h"
#include "javascript/routing_assignment_workflows.h"
#include "javascript/routing_assignments.h"
#include "javascript/routing_route_callbacks.h"
#include "javascript/routing_dimension_inspection.h"
#include "javascript/routing_model_inspection.h"
#include "javascript/routing_search_configuration.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "ortools/constraint_solver/routing_enums.pb.h"
#include "ortools/util/optional_boolean.pb.h"
#include <chrono>
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

bridge::RoutingBridgeRequest SecondaryRequest(int strategy = 9, int period = 1, int vehicles = 1) {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(14); request.set_num_vehicles(vehicles);
  for (int i = 0; i < vehicles; ++i) { request.add_starts(0); request.add_ends(0); }
  const int size = 14 + 2 * vehicles - 1;
  auto* matrix = request.mutable_transit_matrix(); matrix->set_dimension(size); matrix->set_routing_indices(true);
  for (int i = 0; i < size; ++i) for (int j = 0; j < size; ++j)
    matrix->add_values(i == j ? 0 : 1 + (i * 7 + j * 11 + i * j * 3) % 71);
  operations_research::RoutingSearchParameters parameters;
  parameters.set_first_solution_strategy(static_cast<operations_research::FirstSolutionStrategy::Value>(strategy));
  parameters.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GREEDY_DESCENT);
  parameters.set_solution_limit(1); parameters.mutable_time_limit()->set_seconds(1);
  request.set_search_parameters_proto(parameters.SerializeAsString());
  for (const char* field : {"first_solution_strategy", "local_search_metaheuristic", "solution_limit", "time_limit"}) request.add_search_parameter_fields(field);
  const auto snapshot = request;
  auto* secondary = request.mutable_secondary_model(); secondary->CopyFrom(snapshot);
  parameters.set_solution_limit(std::numeric_limits<int64_t>::max());
  secondary->set_search_parameters_proto(parameters.SerializeAsString());
  parameters.set_solution_limit(1); parameters.set_first_solution_optimization_period(period);
  request.set_search_parameters_proto(parameters.SerializeAsString()); request.add_search_parameter_fields("first_solution_optimization_period");
  return request;
}

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

SolverExecutorRequest Request() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(4);
  request.set_num_vehicles(1);
  request.add_starts(0);
  request.add_ends(0);
  SetRoutingFirstSolutionStrategy(&request, 3);
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(4);
  for (int64_t value : {0, 1, 4, 2, 1, 0, 2, 3, 4, 2, 0, 1, 2, 3, 1, 0}) matrix->add_values(value);
  return SolverExecutorRequest{1, "routing", request.SerializeAsString()};
}

SolverExecutorResult Execute(const SolverExecutorRequest& request) {
  RoutingExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    execution = executor.Execute(request, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

bridge::RoutingBridgeResponse Reply(const bridge::RoutingBridgeRequest& request) {
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse reply;
  Expect(reply.ParseFromString(execution.payload), "Routing reply parses");
  return reply;
}

void ReoptimizesNativeFirstSolutionsWithSecondaryModel() {
  for (int strategy : {9, 16}) for (const auto& [period, objective] : std::vector<std::pair<int, int64_t>>{{0, 210}, {1, 163}, {3, 139}}) {
    const auto reply = Reply(SecondaryRequest(strategy, period));
    Expect(reply.has_solution() && reply.objective_value() == objective, "Secondary insertion result matches independent native probe for both strategies and explicit periods");
  }
}

void ValidatesSecondaryModelContractsAndThreadBudgets() {
  auto request = SecondaryRequest();
  request.mutable_secondary_model()->set_num_locations(15);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Mismatched managers reject before native secondary state access");
  request = SecondaryRequest();
  operations_research::RoutingSearchParameters parameters;
  parameters.ParseFromString(request.secondary_model().search_parameters_proto());
  parameters.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GUIDED_LOCAL_SEARCH);
  request.mutable_secondary_model()->set_search_parameters_proto(parameters.SerializeAsString());
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unsupported native fast-search metaheuristic rejects without DFATAL");
  request = SecondaryRequest(3);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Optimization period with an unsupported insertion strategy rejects");
  request = SecondaryRequest(); request.clear_secondary_model();
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Optimization period requires its secondary model");
  request = SecondaryRequest();
  parameters.ParseFromString(request.secondary_model().search_parameters_proto());
  parameters.mutable_sat_parameters()->set_num_workers(2);
  request.mutable_secondary_model()->set_search_parameters_proto(parameters.SerializeAsString());
  request.mutable_secondary_model()->add_search_parameter_fields("sat_parameters.num_workers");
  RoutingExecutor executor;
  Expect(executor.RequestedThreads({1, "routing", request.SerializeAsString()}, 2, 4) == 2, "Sequential models reserve their maximum native thread demand");
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Secondary search cannot exceed its admitted one-thread test job");
  request = SecondaryRequest(9, 1, 2);
  auto* costs = request.mutable_secondary_model()->add_operations()->mutable_set_arc_cost_evaluator_of_vehicles();
  costs->add_vehicles(1); costs->mutable_transit_matrix()->CopyFrom(request.transit_matrix());
  for (auto& value : *costs->mutable_transit_matrix()->mutable_values()) value *= 2;
  const auto rejected = Execute({1, "routing", request.SerializeAsString()});
  Expect(!rejected.ok && rejected.error_message.find("homogeneous") != std::string::npos,
      "Native next-only secondary assignment cannot support heterogeneous-cost operators; reject before native CHECK");
  request = SecondaryRequest();
  auto* route_cost = request.mutable_secondary_model()->add_operations()->mutable_add_route_constraint();
  route_cost->set_evaluator(0); route_cost->set_costs_are_homogeneous_across_vehicles(true);
  const auto callback_rejected = Execute({1, "routing", request.SerializeAsString()});
  Expect(!callback_rejected.ok && callback_rejected.error_message.find("whole-route") != std::string::npos,
      "Unsafe native secondary whole-route rejection is unavailable instead of crashing during callback failure");
  request = SecondaryRequest();
  request.add_operations()->mutable_add_route_constraint()->set_evaluator(0);
  const auto primary_callback_rejected = Execute({1, "routing", request.SerializeAsString()});
  Expect(!primary_callback_rejected.ok && primary_callback_rejected.error_message.find("whole-route") != std::string::npos,
      "Primary whole-route callbacks are rejected for the unsafe combined workflow as well");
  Expect(Reply(SecondaryRequest()).objective_value() == 163, "Invalid secondary configuration does not poison subsequent jobs");
}

void AppliesNativeLocksAndPreservesPreassignment() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* locks = request.mutable_route_locks(); auto* route = locks->add_routes(); route->add_indices(2); route->add_indices(1);
  request.set_inspect_pre_assignment(true);
  auto inspected = Reply(request);
  Expect(inspected.has_locks_applied() && inspected.locks_applied()
      && inspected.pre_assignment().next_values().at(0) == 2 && inspected.pre_assignment().next_values().at(2) == 1
      && !inspected.pre_assignment().next_values().contains(1), "Native locks preserve a partial prefix with an unlocked tail");
  request.set_inspect_pre_assignment(false);
  auto solved = Reply(request);
  Expect(solved.has_solution() && solved.next_values(0) == 2 && solved.next_values(2) == 1, "Native search obeys locked prefixes");
  route->set_indices(0, 1); route->set_indices(1, 1); request.set_inspect_pre_assignment(true);
  inspected = Reply(request);
  Expect(inspected.has_locks_applied() && !inspected.locks_applied() && inspected.pre_assignment().next_values().at(0) == 1,
      "Native failed lock application reports its partial preassignment without wrapper rollback");
  route->set_indices(1, 3); locks->set_close_routes(true); request.set_inspect_pre_assignment(false);
  Expect(!Reply(request).has_solution(), "Closing routes cannot omit a mandatory stop");
  auto* optional = request.add_operations()->mutable_add_disjunction(); optional->add_indices(2); optional->set_penalty(100); optional->set_max_cardinality(1);
  solved = Reply(request);
  Expect(solved.has_solution() && solved.next_values(0) == 1 && solved.next_values(1) == 3 && solved.next_values(2) == 2,
      "Native closed locks drop optional stops");
}

void RestoresNativeSnapshotsAndUsesFirstSolutionHints() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  bridge::RoutingAssignmentSnapshot snapshot; snapshot.set_objective_value(11);
  for (const auto& [index, next] : std::vector<std::pair<int, int>>{{0, 2}, {2, 1}, {1, 3}, {3, 4}}) {
    auto* value = snapshot.add_variables(); value->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_NEXT);
    value->mutable_variable()->set_index(index); value->set_min(next); value->set_max(next);
  }
  *request.mutable_initial_assignment()->mutable_snapshot() = snapshot;
  request.set_read_assignment_only(true);
  auto restored = Reply(request);
  Expect(restored.has_solution() && restored.objective_value() == 11 && restored.next_values(0) == 2
      && restored.next_values(2) == 1 && restored.next_values(1) == 3, "Native RestoreAssignment preserves a saved snapshot without optimizing it");
  request.set_read_assignment_only(false);
  const auto warm = Reply(request);
  Expect(warm.has_solution() && warm.objective_value() <= 11, "Native warm search optimizes the saved snapshot");
  request.clear_initial_assignment(); *request.mutable_first_solution_hint() = snapshot;
  SetRoutingFirstSolutionStrategy(&request, 9);
  operations_research::RoutingSearchParameters parameters; parameters.ParseFromString(request.search_parameters_proto());
  parameters.set_solution_limit(1); request.set_search_parameters_proto(parameters.SerializeAsString()); request.add_search_parameter_fields("solution_limit");
  const auto hinted = Reply(request);
  Expect(hinted.has_solution() && hinted.next_values(0) == 2 && hinted.next_values(2) == 1 && hinted.next_values(1) == 3,
      "Native local insertion honors a first-solution hint");
  auto* prefix = request.mutable_route_locks()->add_routes(); prefix->add_indices(1);
  const auto locked = Reply(request);
  Expect(locked.has_solution() && locked.next_values(0) == 1, "A hint does not override hard native locks");
  request.clear_route_locks(); request.clear_first_solution_hint();
  *request.mutable_initial_assignment()->mutable_snapshot() = snapshot;
  request.mutable_initial_assignment()->mutable_snapshot()->mutable_variables(0)->set_max(100);
  const auto malformed = Execute({1, "routing", request.SerializeAsString()});
  Expect(!malformed.ok && malformed.error_message.find("assignment variable snapshot") != std::string::npos,
      "Malformed next-index bounds reject before native hint indexing");
}

void SelectsNativePickupDeliveryAlternativesAndLimits() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(5); request.set_num_vehicles(1); request.add_starts(0); request.add_ends(0);
  SetRoutingFirstSolutionStrategy(&request, 8);
  auto* matrix = request.mutable_transit_matrix(); matrix->set_dimension(5);
  for (int from = 0; from < 5; ++from) for (int to = 0; to < 5; ++to) matrix->add_values(to == 2 || to == 4 ? 10 : 1);
  auto* time = request.add_operations()->mutable_add_constant_dimension();
  time->set_name("time"); time->set_value(1); time->set_capacity(100); time->set_fix_start_cumul_to_zero(true);
  auto* pickups = request.add_operations()->mutable_add_disjunction(); pickups->add_indices(1); pickups->add_indices(2);
  auto* deliveries = request.add_operations()->mutable_add_disjunction(); deliveries->add_indices(3); deliveries->add_indices(4);
  auto* pair = request.add_operations()->mutable_add_pickup_and_delivery_sets(); pair->set_pickup_disjunction(0); pair->set_delivery_disjunction(1);
  const auto baseline = Reply(request);
  Expect(baseline.has_solution() && baseline.next_values(0) == 1 && baseline.next_values(1) == 3,
      "Native alternative search initially selects the cheapest pickup and delivery");
  auto* limits = request.add_operations()->mutable_set_pickup_to_delivery_limits(); limits->set_dimension_name("time");
  for (int64_t limit : {0, 1, 1, 1}) limits->add_limits(limit);
  const auto limited = Reply(request);
  Expect(limited.has_solution() && (limited.next_values(1) == 1 || limited.next_values(3) == 3),
      "Native per-alternative limits select a different feasible pickup/delivery combination");
  limits->clear_limits(); limits->add_limits(1);
  const auto malformed = Execute({1, "routing", request.SerializeAsString()});
  Expect(!malformed.ok && malformed.error_message.find("limit table") != std::string::npos,
      "Native input validation rejects a limit table with the wrong shape");
}

void RejectsCpSatFallbackWithoutPickupDeliveryLimits() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* time = request.add_operations()->mutable_add_constant_dimension();
  time->set_name("time"); time->set_value(1); time->set_capacity(100); time->set_fix_start_cumul_to_zero(true);
  auto* pair = request.add_operations()->mutable_add_pickup_and_delivery(); pair->set_pickup(1); pair->set_delivery(2);
  auto* limits = request.add_operations()->mutable_set_pickup_to_delivery_limits(); limits->set_dimension_name("time"); limits->add_limits(0);
  const auto infeasible = Reply(request);
  Expect(!infeasible.has_solution(), "Default CP-SAT fallback cannot bypass a native zero ride-time limit");
  limits->set_limits(0, 100);
  Expect(Reply(request).has_solution(), "A feasible native limit remains solvable");
}

void SolvesAndSerializesResult() {
  const auto execution = Execute(Request());
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Routing response parses");
  Expect(response.has_solution(), "Routing finds a solution");
  Expect(response.starts_size() == 1 && response.ends_size() == 1, "Routing returns vehicle endpoints");
  Expect(response.next_values_size() > 0, "Routing returns assignment values");
}

void ReturnsNativeAutomaticStrategyAndAppliesNodePrecedence() {
  for (int kind = 0; kind < 3; ++kind) {
    bridge::RoutingBridgeRequest request;
    request.set_num_locations(3);
    request.set_num_vehicles(1);
    request.add_starts(0);
    request.add_ends(0);
    auto* matrix = request.mutable_transit_matrix();
    matrix->set_dimension(3);
    for (int index = 0; index < 9; ++index) matrix->add_values(1);
    auto* dimension = request.add_operations()->mutable_add_dimension();
    *dimension->mutable_transit_matrix() = *matrix;
    dimension->set_capacity(10);
    dimension->set_fix_start_cumul_to_zero(true);
    dimension->set_name("order");
    request.add_dimension_names("order");
    if (kind == 1) {
      auto* pair = request.add_operations()->mutable_add_pickup_and_delivery();
      pair->set_pickup(1);
      pair->set_delivery(2);
    }
    if (kind == 2) {
      auto* precedence = request.add_operations()->mutable_add_node_precedence();
      precedence->set_dimension_name("order");
      precedence->set_first(1);
      precedence->set_second(2);
      precedence->set_offset(1);
    }
    const int expected = kind == 0 ? 3 : 8;
    SetRoutingFirstSolutionStrategy(&request, kind == 0 ? 8 : 3);
    request.set_read_assignment_only(true);
    auto* route = request.mutable_initial_assignment()->add_routes();
    route->add_indices(1);
    route->add_indices(2);
    bridge::RoutingBridgeResponse response;
    auto result = Execute({1, "routing", request.SerializeAsString()});
    Expect(result.ok && response.ParseFromString(result.payload) && response.has_solution(), "Strategy route read succeeds");
    Expect(response.has_automatic_first_solution_strategy() && response.automatic_first_solution_strategy() == expected,
           "Response carries native automatic choice independently of requested strategy");
    request.set_read_assignment_only(false);
    result = Execute({2, "routing", request.SerializeAsString()});
    Expect(result.ok && response.ParseFromString(result.payload) && response.has_solution() && response.automatic_first_solution_strategy() == expected,
           "Warm optimization returns native automatic choice");
    if (kind == 2) {
      request.set_read_assignment_only(true);
      route = request.mutable_initial_assignment()->mutable_routes(0);
      route->set_indices(0, 2);
      route->set_indices(1, 1);
      result = Execute({3, "routing", request.SerializeAsString()});
      Expect(result.ok && response.ParseFromString(result.payload) && !response.has_solution() && response.automatic_first_solution_strategy() == expected,
             "Infeasible precedence route preserves native strategy metadata");
    }
    request.set_read_assignment_only(false);
    request.clear_initial_assignment();
    result = Execute({4, "routing", request.SerializeAsString()});
    Expect(result.ok && response.ParseFromString(result.payload) && response.has_solution() && response.automatic_first_solution_strategy() == expected,
           "Normal optimization returns native automatic choice");
    if (kind == 2) {
      const auto& cumuls = response.dimensions(0).cumul_values();
      Expect(cumuls.Get(2) >= cumuls.Get(1) + 1, "Native optimization honors node precedence offset");
      request.mutable_operations(1)->mutable_add_node_precedence()->set_first(4);
      Expect(!Execute({5, "routing", request.SerializeAsString()}).ok, "Invalid precedence index is rejected");
    }
  }
}

void AppliesVehicleDomainsAndForcedOptionalActivity() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(5);
  request.set_num_vehicles(3);
  for (int vehicle = 0; vehicle < 3; ++vehicle) { request.add_starts(0); request.add_ends(0); }
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(5);
  for (int i = 0; i < 25; ++i) matrix->add_values(5);
  for (int node : {3, 4}) {
    auto* optional = request.add_operations()->mutable_add_disjunction();
    optional->add_indices(node);
    optional->set_penalty(node == 3 ? 100 : 0);
  }
  auto add_domain = [&](int index, std::initializer_list<int> values) {
    auto* domain = request.add_operations()->mutable_set_vehicle_values();
    domain->set_index(index);
    for (int value : values) domain->add_values(value);
  };
  add_domain(1, {2, 0, 2});
  add_domain(2, {0});
  add_domain(3, {-1});
  add_domain(4, {-1, 2});
  add_domain(4, {2});
  request.set_read_assignment_only(true);
  auto* routes = request.mutable_initial_assignment();
  auto* first = routes->add_routes(); first->add_indices(1); first->add_indices(2);
  routes->add_routes();
  routes->add_routes()->add_indices(4);
  bridge::RoutingBridgeResponse response;
  auto run = [&]() {
    const auto result = Execute({1, "routing", request.SerializeAsString()});
    Expect(result.ok, result.error_message);
    Expect(response.ParseFromString(result.payload), "Vehicle domain response parses");
  };
  run();
  Expect(response.has_solution() && response.vehicle_values(1) == 0 && response.vehicle_values(2) == 0
         && response.vehicle_values(3) == -1 && response.vehicle_values(4) == 2 && response.objective_value() == 125,
         "Native domains permit forced optional drops/visits and preserve penalties");
  routes->mutable_routes(0)->clear_indices();
  routes->mutable_routes(0)->add_indices(2);
  routes->mutable_routes(1)->add_indices(1);
  run();
  Expect(!response.has_solution(), "Noncontiguous domain rejects excluded vehicle");
  request.set_read_assignment_only(false);
  request.clear_initial_assignment();
  run();
  Expect(response.has_solution() && response.vehicle_values(1) != 1 && response.vehicle_values(3) == -1
         && response.vehicle_values(4) == 2, "Normal optimization obeys domains and optional activity");
  add_domain(1, {2});
  add_domain(1, {-1, 0, 1, 2});
  run();
  Expect(response.has_solution() && response.vehicle_values(1) == 2, "Repeated domains intersect without widening");
  auto* invalid = request.add_operations()->mutable_set_vehicle_values();
  invalid->set_index(1);
  invalid->add_values(-2);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Raw value below -1 rejected");
  invalid->set_values(0, 3);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Raw out-of-range vehicle rejected");
  invalid->set_values(0, 0);
  invalid->set_index(10);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Raw out-of-range vehicle variable index rejected");
}

void AppliesVehicleEligibilityAndNativeConstrainedStrategy() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(4);
  request.set_num_vehicles(2);
  for (int vehicle = 0; vehicle < 2; ++vehicle) { request.add_starts(0); request.add_ends(0); }
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(4);
  for (int i = 0; i < 16; ++i) matrix->add_values(5);
  auto* optional = request.add_operations()->mutable_add_disjunction();
  optional->add_indices(3);
  optional->set_penalty(0);
  auto add_eligibility = [&](int index, std::initializer_list<int> vehicles) {
    auto* value = request.add_operations()->mutable_set_allowed_vehicles_for_index();
    value->set_index(index);
    for (int vehicle : vehicles) value->add_vehicles(vehicle);
  };
  add_eligibility(1, {1, 1});
  add_eligibility(2, {0});
  add_eligibility(3, {1});
  request.set_read_assignment_only(true);
  request.mutable_initial_assignment()->add_routes()->add_indices(2);
  request.mutable_initial_assignment()->add_routes()->add_indices(1);
  bridge::RoutingBridgeResponse response;
  auto run = [&]() {
    const auto result = Execute({1, "routing", request.SerializeAsString()});
    Expect(result.ok, result.error_message);
    Expect(response.ParseFromString(result.payload), "Eligibility response parses");
  };
  run();
  Expect(response.has_solution() && response.vehicle_values(1) == 1 && response.vehicle_values(2) == 0
         && response.vehicle_values(3) == -1 && response.automatic_first_solution_strategy() == 4,
         "Eligibility permits native route reads, optional drops and constrained strategy");
  request.mutable_initial_assignment()->mutable_routes(0)->set_indices(0, 1);
  request.mutable_initial_assignment()->mutable_routes(1)->set_indices(0, 2);
  run();
  Expect(!response.has_solution(), "Ineligible routes are rejected");
  request.set_read_assignment_only(false);
  request.clear_initial_assignment();
  run();
  Expect(response.has_solution() && response.vehicle_values(1) == 1 && response.vehicle_values(2) == 0,
         "Normal optimization obeys eligibility");
  add_eligibility(1, {0});
  run();
  Expect(response.has_solution() && response.vehicle_values(1) == 0, "Later eligibility replaces earlier list");
  add_eligibility(1, {});
  add_eligibility(2, {});
  add_eligibility(3, {0, 1});
  request.set_read_assignment_only(true);
  request.mutable_initial_assignment()->add_routes()->add_indices(1);
  request.mutable_initial_assignment()->add_routes()->add_indices(2);
  run();
  Expect(response.has_solution() && response.automatic_first_solution_strategy() == 3,
         "Empty and multi-vehicle eligibility restore unrestricted native strategy");
  auto* invalid = request.add_operations()->mutable_set_allowed_vehicles_for_index();
  invalid->set_index(1);
  invalid->add_vehicles(-1);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Negative raw vehicle rejected");
  invalid->set_vehicles(0, 2);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Out-of-range raw vehicle rejected");
  invalid->set_vehicles(0, 0);
  invalid->set_index(7);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Out-of-range raw routing index rejected");
}

void AppliesCumulBounds() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(3);
  request.set_num_vehicles(1);
  request.add_starts(0);
  request.add_ends(0);
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(3);
  for (int i = 0; i < 9; ++i) matrix->add_values(1);
  auto* dimension = request.add_operations()->mutable_add_dimension();
  *dimension->mutable_transit_matrix() = *matrix;
  dimension->set_slack_max(10);
  dimension->set_capacity(30);
  dimension->set_name("time");
  request.add_dimension_names("time");
  auto add_bounds = [&](int index, int64_t lower, int64_t upper) {
    auto* bounds = request.add_operations()->mutable_set_cumul_bounds();
    bounds->set_dimension_name("time");
    bounds->set_index(index);
    bounds->set_lower(lower);
    bounds->set_upper(upper);
  };
  add_bounds(0, 2, 4);
  add_bounds(1, 5, 6);
  add_bounds(2, 8, 10);
  add_bounds(3, 11, 12);
  request.set_read_assignment_only(true);
  auto* route = request.mutable_initial_assignment()->add_routes();
  route->add_indices(1);
  route->add_indices(2);
  bridge::RoutingBridgeResponse response;
  auto run = [&]() {
    const auto result = Execute({1, "routing", request.SerializeAsString()});
    Expect(result.ok, result.error_message);
    Expect(response.ParseFromString(result.payload), "Bounds response parses");
  };
  run();
  Expect(response.has_solution(), "Windowed route restores");
  for (int i = 0; i < 4; ++i) {
    const auto& bounds = request.operations(i + 1).set_cumul_bounds();
    Expect(response.dimensions(0).cumul_mins(i) >= bounds.lower() && response.dimensions(0).cumul_maxs(i) <= bounds.upper(),
           "Native intervals respect each customer and terminal window");
  }
  route->set_indices(0, 2);
  route->set_indices(1, 1);
  run();
  Expect(!response.has_solution(), "Reversed route misses customer windows");
  request.set_read_assignment_only(false);
  request.clear_initial_assignment();
  run();
  Expect(response.has_solution(), "Normal solve honors windows");
  add_bounds(1, 6, 20);
  add_bounds(1, -10, 30);
  run();
  Expect(response.has_solution() && response.dimensions(0).cumul_mins(1) == 6 && response.dimensions(0).cumul_maxs(1) == 6,
         "Repeated bounds intersect instead of replacing earlier limits");
  request.mutable_operations(1)->mutable_set_cumul_bounds()->set_index(4);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid raw cumul index rejected");
  request.mutable_operations(1)->mutable_set_cumul_bounds()->set_index(0);
  request.mutable_operations(1)->mutable_set_cumul_bounds()->set_lower(5);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Reversed raw bounds rejected");
  request.mutable_operations(1)->mutable_set_cumul_bounds()->set_lower(2);
  request.mutable_operations(1)->mutable_set_cumul_bounds()->set_dimension_name("missing");
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown raw dimension rejected");
}

void SerializesNativeVehicleValues() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(4);
  request.set_num_vehicles(2);
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    request.add_starts(0);
    request.add_ends(0);
  }
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(4);
  for (int index = 0; index < 16; ++index) matrix->add_values(5);
  auto* optional = request.add_operations()->mutable_add_disjunction();
  optional->add_indices(3);
  optional->set_penalty(0);
  request.set_read_assignment_only(true);
  request.mutable_initial_assignment()->add_routes()->add_indices(1);
  request.mutable_initial_assignment()->add_routes()->add_indices(2);
  auto execution = Execute({1, "routing", request.SerializeAsString()});
  bridge::RoutingBridgeResponse restored;
  Expect(execution.ok && restored.ParseFromString(execution.payload) && restored.has_solution(), "Vehicle route restoration succeeds");
  Expect(restored.vehicle_values_size() == 7, "Every routing index has a native vehicle value");
  Expect(restored.vehicle_values(1) == 0 && restored.vehicle_values(2) == 1 && restored.vehicle_values(3) == -1,
         "Assigned and dropped customer vehicle values are preserved");
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    Expect(restored.vehicle_values(restored.starts(vehicle)) == vehicle && restored.vehicle_values(restored.ends(vehicle)) == vehicle,
           "Native terminal vehicle values are preserved");
  }
  request.mutable_initial_assignment()->mutable_routes(0)->set_indices(0, 2);
  request.mutable_initial_assignment()->mutable_routes(1)->set_indices(0, 1);
  execution = Execute({2, "routing", request.SerializeAsString()});
  bridge::RoutingBridgeResponse swapped;
  Expect(execution.ok && swapped.ParseFromString(execution.payload) && swapped.has_solution(), "Swapped routes restore");
  Expect(swapped.vehicle_values(1) == 1 && restored.vehicle_values(1) == 0, "Responses keep independent vehicle values");
  request.clear_initial_assignment();
  request.set_read_assignment_only(false);
  execution = Execute({3, "routing", request.SerializeAsString()});
  bridge::RoutingBridgeResponse solved;
  Expect(execution.ok && solved.ParseFromString(execution.payload) && solved.has_solution(), "Normal solve returns vehicle values");
  Expect(solved.vehicle_values(3) == -1, "Zero-penalty node is dropped by normal optimization");
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    int64_t index = solved.starts(vehicle);
    for (int steps = 0; ; ++steps) {
      Expect(steps < solved.vehicle_values_size(), "Route terminates");
      Expect(solved.vehicle_values(index) == vehicle, "Vehicle values match solved route membership");
      if (index == solved.ends(vehicle)) break;
      index = solved.next_values(index);
    }
  }
}

void RestoresValidatedAssignmentsAndCumulRanges() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(2);
  request.set_num_vehicles(1);
  request.add_starts(0);
  request.add_ends(0);
  request.set_read_assignment_only(true);
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(2);
  for (int index = 0; index < 4; ++index) matrix->add_values(1);
  auto* dimension = request.add_operations()->mutable_add_dimension();
  *dimension->mutable_transit_matrix() = *matrix;
  dimension->set_slack_max(5);
  dimension->set_capacity(10);
  dimension->set_fix_start_cumul_to_zero(true);
  dimension->set_name("time");
  request.add_dimension_names("time");
  request.mutable_initial_assignment()->add_routes()->add_indices(1);
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_solution(), "Native restoration succeeds");
  Expect(response.objective_value() == 2, "Restored assignment has native objective");
  const auto& values = response.dimensions(0);
  Expect(values.cumul_mins(1) == 1 && values.cumul_maxs(1) == 6, "Customer cumul retains [1,6] range");
  Expect(values.cumul_mins(2) == 2 && values.cumul_maxs(2) == 10, "End cumul retains [2,10] range");
  for (const std::vector<int64_t>& route : std::vector<std::vector<int64_t>>{{}, {1, 1}, {0, 1}, {2}}) {
    request.mutable_initial_assignment()->clear_routes();
    auto* input = request.mutable_initial_assignment()->add_routes();
    for (int64_t index : route) input->add_indices(index);
    const auto invalid = Execute({1, "routing", request.SerializeAsString()});
    Expect(invalid.ok && response.ParseFromString(invalid.payload) && !response.has_solution(),
           "Invalid or incomplete routes return no assignment");
    Expect(response.status() != 1, "Invalid assignment never reports success");
  }
  request.mutable_initial_assignment()->clear_routes();
  request.mutable_initial_assignment()->add_routes()->add_indices(1);
  request.mutable_operations(0)->mutable_add_dimension()->set_capacity(1);
  const auto over_capacity = Execute({1, "routing", request.SerializeAsString()});
  Expect(over_capacity.ok && response.ParseFromString(over_capacity.payload) && !response.has_solution(),
         "Complete routes violating dimension capacity are rejected");
  request.clear_initial_assignment();
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Validation without routes is an invalid request");
}

void PreservesVehicleAndRoutingIndexCosts() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(3);
  request.set_num_vehicles(2);
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    request.add_starts(0);
    request.add_ends(0);
  }
  SetRoutingFirstSolutionStrategy(&request, 3);
  request.mutable_transit_matrix()->set_dimension(6);
  request.mutable_transit_matrix()->set_routing_indices(true);
  for (int index = 0; index < 36; ++index) request.mutable_transit_matrix()->add_values(7);
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    auto* cost = request.add_operations()->mutable_set_arc_cost_evaluator_of_vehicles();
    cost->add_vehicles(vehicle);
    cost->mutable_transit_matrix()->set_dimension(6);
    cost->mutable_transit_matrix()->set_routing_indices(true);
    for (int from = 0; from < 6; ++from) for (int to = 0; to < 6; ++to) {
      const int64_t value = vehicle == 0 ? (from == 0 ? 2 : to == 4 ? 3 : 7)
                                        : (from == 3 ? 5 : to == 5 ? 11 : 13);
      cost->mutable_transit_matrix()->add_values(value);
    }
  }
  auto* dimension = request.add_operations()->mutable_add_dimension_with_vehicle_capacity();
  dimension->mutable_transit_matrix()->set_dimension(6);
  dimension->mutable_transit_matrix()->set_routing_indices(true);
  for (int from = 0; from < 6; ++from) for (int to = 0; to < 6; ++to) {
    dimension->mutable_transit_matrix()->add_values(from == 1 || from == 2 ? 1 : 0);
  }
  dimension->add_capacities(1);
  dimension->add_capacities(1);
  dimension->set_fix_start_cumul_to_zero(true);
  dimension->set_name("load");
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_solution(), "Vehicle-cost solve succeeds");
  Expect(response.objective_value() == 21, "Vehicle costs include distinct duplicate-depot start/end indices");
  auto shared = request;
  shared.mutable_operations()->DeleteSubrange(1, 1);
  auto* grouped = shared.mutable_operations(0)->mutable_set_arc_cost_evaluator_of_vehicles();
  grouped->add_vehicles(1);
  for (int index = 0; index < grouped->mutable_transit_matrix()->values_size(); ++index)
    grouped->mutable_transit_matrix()->set_values(index, 2);
  const auto shared_execution = Execute({1, "routing", shared.SerializeAsString()});
  Expect(shared_execution.ok && response.ParseFromString(shared_execution.payload) && response.objective_value() == 8,
         "One evaluator supplies costs for both vehicles");
  grouped->clear_vehicles();
  Expect(!Execute({1, "routing", shared.SerializeAsString()}).ok, "Empty vehicle groups reject");
  grouped->add_vehicles(0);
  grouped->add_vehicles(2);
  Expect(!Execute({1, "routing", shared.SerializeAsString()}).ok, "Every grouped vehicle is validated");
  for (int vehicle : {-1, 2}) {
    request.mutable_operations(0)->mutable_set_arc_cost_evaluator_of_vehicles()->set_vehicles(0, vehicle);
    const auto invalid = Execute({1, "routing", request.SerializeAsString()});
    Expect(!invalid.ok && invalid.error_message.find("vehicle is out of range") != std::string::npos,
           "Invalid vehicle override fails without reaching native CHECK");
  }
  request.mutable_operations(0)->mutable_set_arc_cost_evaluator_of_vehicles()->set_vehicles(0, 0);
  request.mutable_operations(0)->mutable_set_arc_cost_evaluator_of_vehicles()->mutable_transit_matrix()->set_dimension(3);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid override matrix fails");
}

void ReservesOneThread() {
  RoutingExecutor executor;
  Expect(executor.RequestedThreads(Request(), 1, 8) == 1, "Routing reserves one thread");
  bool rejected = false;
  try { executor.RequestedThreads(Request(), 2, 8); } catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "Routing rejects multi-thread reservations");
}

void RejectsInvalidDimensions() {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(4);
  request.set_num_vehicles(1);
  Expect(!Execute(SolverExecutorRequest{1, "routing", request.SerializeAsString()}).ok,
         "Invalid Routing dimensions fail");
}

void AppliesSerializedModelOperations() {
  const auto base = Request();
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(base.payload), "Routing request parses");

  auto* dimension = request.add_operations()->mutable_add_dimension();
  *dimension->mutable_transit_matrix() = request.transit_matrix();
  dimension->set_capacity(100);
  dimension->set_fix_start_cumul_to_zero(true);
  dimension->set_name("distance");

  auto* vehicle_equality =
      request.add_operations()->mutable_add_vehicle_equality_constraint();
  vehicle_equality->set_left(1);
  vehicle_equality->set_right(2);

  auto* precedence =
      request.add_operations()->mutable_add_cumul_less_or_equal_constraint();
  precedence->set_dimension_name("distance");
  precedence->set_left(1);
  precedence->set_right(2);

  auto* soft_bound =
      request.add_operations()->mutable_set_soft_span_upper_bound();
  soft_bound->set_dimension_name("distance");
  soft_bound->set_bound(10);
  soft_bound->set_cost(2);
  soft_bound->set_vehicle(0);

  auto* quadratic_bound =
      request.add_operations()->mutable_set_quadratic_cost_soft_span_upper_bound();
  quadratic_bound->set_dimension_name("distance");
  quadratic_bound->set_bound(10);
  quadratic_bound->set_cost(2);
  quadratic_bound->set_vehicle(0);

  const auto execution = Execute(
      SolverExecutorRequest{1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
}

void RefinesSerializedInitialAssignment() {
  const auto base = Request();
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(base.payload), "Routing request parses");
  operations_research::RoutingSearchParameters parameters;
  Expect(parameters.ParseFromString(request.search_parameters_proto()), "Routing parameters parse");
  parameters.set_solution_limit(1);
  request.set_search_parameters_proto(parameters.SerializeAsString());
  request.add_search_parameter_fields("solution_limit");
  auto* route = request.mutable_initial_assignment()->add_routes();
  route->add_indices(1);
  route->add_indices(3);
  route->add_indices(2);

  const auto execution = Execute(
      SolverExecutorRequest{1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload),
         "Routing initial-assignment response parses");
  Expect(response.has_solution(), "Routing initial assignment finds a solution");
  Expect(response.next_values(0) == 1 && response.next_values(1) == 3 &&
             response.next_values(3) == 2,
         "Routing preserves the initial route with solution_limit=1");
}

void PreservesSparseParameterDefaultsAndExplicitValues() {
  operations_research::RoutingSearchParameters patch;
  patch.mutable_local_search_operators()->set_use_two_opt(operations_research::BOOL_FALSE);
  patch.set_solution_limit(2147483648LL);
  patch.mutable_sat_parameters()->set_no_overlap_2d_boolean_relations_limit(7);
  patch.mutable_sat_parameters()->add_subsolver_params()->set_use_energetic_reasoning_in_no_overlap_2d(true);
  patch.mutable_global_cheapest_insertion_ls_operator_parameters()->set_use_neighbors_ratio_for_initialization(false);
  patch.mutable_iterated_local_search_parameters()->set_improve_perturbed_solution(false);
  operations_research::RoutingSearchParameters normalized;
  std::string error;
  Expect(ortools_wasm::ParseRoutingSearchParameters(patch.SerializeAsString(),
      {"localSearchOperators.useTwoOpt", "solutionLimit", "satParameters.noOverlap2dBooleanRelationsLimit", "satParameters.subsolverParams",
       "globalCheapestInsertionLsOperatorParameters.useNeighborsRatioForInitialization",
       "iteratedLocalSearchParameters.improvePerturbedSolution", "localSearchMetaheuristics"},
      &normalized, &error), error);
  Expect(normalized.solution_limit() == 2147483648LL, "solution limit remains int64");
  Expect(normalized.sat_parameters().no_overlap_2d_boolean_relations_limit() == 7 && normalized.sat_parameters().subsolver_params(0).use_energetic_reasoning_in_no_overlap_2d(), "nested SAT digit names and repeated subsolver fields reach native configuration");
  Expect(normalized.local_search_operators().use_two_opt() == operations_research::BOOL_FALSE, "supplied operator applied");
  Expect(normalized.local_search_operators().use_cross() == operations_research::BOOL_TRUE, "untouched operator preserves native default");
  Expect(!normalized.global_cheapest_insertion_ls_operator_parameters().use_neighbors_ratio_for_initialization(), "explicit false replaces native true default");
  Expect(!normalized.iterated_local_search_parameters().improve_perturbed_solution(), "nested explicit false replaces native true default");
  Expect(normalized.local_search_metaheuristics().empty(), "explicit empty repeated parameter is preserved");
  Expect(!ortools_wasm::ParseRoutingSearchParameters(std::string("\x1a\x00", 2),
      {"localSearchOperators.useCross"}, &normalized, &error) && error.find("cross") != std::string::npos,
      "empty nested wire message preserves explicit zero override");
  Expect(error == "local_search_neighborhood_operator.use_cross should be set to BOOL_TRUE or BOOL_FALSE instead of BOOL_UNSPECIFIED (value: 0)", "operator validation diagnostic matches upstream Python/native format");
  patch.mutable_local_search_operators()->set_use_cross(operations_research::BOOL_UNSPECIFIED);
  Expect(!ortools_wasm::ParseRoutingSearchParameters(patch.SerializeAsString(),
      {"localSearchOperators.useCross"}, &normalized, &error) && error.find("cross") != std::string::npos,
      "explicit zero operator is rejected rather than merged away");
  patch.set_solution_limit(0);
  Expect(!ortools_wasm::ParseRoutingSearchParameters(patch.SerializeAsString(),
      {"solutionLimit"}, &normalized, &error) && error.find("solution_limit") != std::string::npos,
      "explicit zero solution limit is rejected rather than defaulted");
  Expect(!ortools_wasm::ParseRoutingSearchParameters("", {"notAParameter"}, &normalized, &error), "unknown field path is rejected");
}

void ReservesNestedCpSatWorkers() {
  RoutingExecutor executor;
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(Request().payload), "request parses");
  operations_research::RoutingSearchParameters patch;
  patch.mutable_sat_parameters()->set_num_workers(2);
  request.set_search_parameters_proto(patch.SerializeAsString());
  request.add_search_parameter_fields("satParameters.numWorkers");
  Expect(executor.RequestedThreads({1, "routing", request.SerializeAsString()}, 2, 8) == 2, "Routing reserves nested CP-SAT workers");
  patch.mutable_sat_parameters()->set_num_workers(0);
  request.set_search_parameters_proto(patch.SerializeAsString());
  Expect(executor.RequestedThreads({1, "routing", request.SerializeAsString()}, 0, 8) == 8, "automatic CP-SAT workers reserve server capacity");
  bool rejected = false;
  try { executor.RequestedThreads({1, "routing", request.SerializeAsString()}, 2, 8); } catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "finite job request rejects automatic solver workers");
}

void BindsAutomaticWorkersToAllocatedBudget() {
  operations_research::RoutingSearchParameters parameters;
  parameters.mutable_sat_parameters()->set_num_workers(0);
  BindRoutingAutomaticWorkerBudget(&parameters, 2);
  Expect(parameters.sat_parameters().num_workers() == 2,
         "automatic workers obey the allocated budget, even below host CPU count");
  parameters.mutable_sat_parameters()->set_num_workers(3);
  BindRoutingAutomaticWorkerBudget(&parameters, 2);
  Expect(parameters.sat_parameters().num_workers() == 3,
         "explicit worker count stays unchanged after reservation checks");
}

void StopsGuidedLocalSearchAtTimeLimit() {
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(Request().payload), "request parses");
  operations_research::RoutingSearchParameters patch;
  patch.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GUIDED_LOCAL_SEARCH);
  patch.mutable_time_limit()->set_nanos(100000000);
  request.set_search_parameters_proto(patch.SerializeAsString());
  request.add_search_parameter_fields("localSearchMetaheuristic");
  request.add_search_parameter_fields("timeLimit.nanos");
  const auto start = std::chrono::steady_clock::now();
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  Expect(std::chrono::steady_clock::now() - start < std::chrono::seconds(5), "guided local search obeys time budget");
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_solution(), "bounded search returns incumbent");
  patch.mutable_local_search_operators()->set_use_cross(operations_research::BOOL_UNSPECIFIED);
  request.set_search_parameters_proto(patch.SerializeAsString());
  request.add_search_parameter_fields("localSearchOperators.useCross");
  const auto invalid = Execute({1, "routing", request.SerializeAsString()});
  Expect(!invalid.ok && invalid.error_message.find("cross") != std::string::npos, "server surfaces native parameter validation");
}

void AppliesModelParametersAndReturnsActualProfile() {
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(Request().payload), "request parses");
  operations_research::RoutingModelParameters patch;
  patch.set_reduce_vehicle_cost_model(false);
  patch.set_max_callback_cache_size(0);
  patch.mutable_solver_parameters()->set_profile_local_search(true);
  patch.mutable_solver_parameters()->set_array_split_size(8);
  request.set_model_parameters_proto(patch.SerializeAsString());
  for (const std::string path : {"reduceVehicleCostModel", "maxCallbackCacheSize", "solverParameters.profileLocalSearch", "solverParameters.arraySplitSize"}) request.add_model_parameter_fields(path);
  operations_research::RoutingModelParameters normalized;
  std::string error;
  Expect(ortools_wasm::ParseRoutingModelParameters(request.model_parameters_proto(),
      std::vector<std::string>(request.model_parameter_fields().begin(), request.model_parameter_fields().end()),
      &normalized, &error), error);
  Expect(!normalized.reduce_vehicle_cost_model() && normalized.max_callback_cache_size() == 0, "explicit false/zero model overrides survive");
  Expect(normalized.solver_parameters().trail_block_size() == operations_research::DefaultRoutingModelParameters().solver_parameters().trail_block_size(), "unrelated native model defaults survive");
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_solution(), "configured model solves");
  Expect(response.local_search_profile().find("Local search") != std::string::npos, "native search profiler produces actual statistics");
  patch.mutable_solver_parameters()->set_array_split_size(0);
  request.set_model_parameters_proto(patch.SerializeAsString());
  const auto invalid = Execute({1, "routing", request.SerializeAsString()});
  Expect(!invalid.ok && invalid.error_message.find("RoutingModelParameters") != std::string::npos, "invalid block size is rejected before native CHECK");
}

void DeliversLiveSolutionsAndCancelsNormalAndWarmSearch() {
  for (const bool warm : {false, true}) for (const bool cancel : {false, true}) {
    const auto base = Request();
    bridge::RoutingBridgeRequest request;
    request.ParseFromString(base.payload);
    request.set_solution_events(true);
    operations_research::RoutingSearchParameters parameters;
    parameters.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GUIDED_LOCAL_SEARCH);
    parameters.mutable_time_limit()->set_nanos(20000000);
    request.set_search_parameters_proto(parameters.SerializeAsString());
    request.add_search_parameter_fields("local_search_metaheuristic");
    request.add_search_parameter_fields("time_limit");
    if (warm) {
      auto* route = request.mutable_initial_assignment()->add_routes();
      for (const auto node : {1, 2, 3}) route->add_indices(node);
      request.mutable_initial_assignment()->set_ignore_inactive_indices(true);
    }
    RoutingExecutor executor;
    JobScheduler scheduler({2, 8});
    SolverExecutorResult execution;
    int events = 0;
    std::promise<void> submitted;
    const auto ready = submitted.get_future().share();
    JobHandle handle;
    handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
      ready.wait();
      execution = executor.Execute({1, "routing", request.SerializeAsString()}, context,
          [&](std::string payload) {
            bridge::RoutingBridgeResponse event;
            Expect(event.ParseFromString(payload) && event.has_solve_event(), "Native Routing event parses");
            Expect(event.solve_event().objective_value() > 0, "Routing event reports current native objective");
            ++events;
            if (cancel && events == 1) handle.Cancel();
          });
      return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
    });
    submitted.set_value();
    handle.result().get();
    if (cancel) {
      Expect(events > 0 && !execution.ok && execution.failure_kind == SolverExecutionFailureKind::kCancelled,
             "Progress cancellation stops native normal/warm Routing search");
    } else {
      Expect(events > 1 && execution.ok, "Native normal/warm search emits intermediate solutions");
    }
  }
  Expect(Execute(Request()).ok, "Native Routing remains reusable after cancellation");
}

void ReportsOptedInUncheckedNeighbors() {
  bridge::RoutingBridgeRequest request;
  request.ParseFromString(Request().payload);
  request.set_num_locations(16);
  request.mutable_transit_matrix()->set_dimension(16);
  request.mutable_transit_matrix()->clear_values();
  for (int row = 0; row < 16; ++row) for (int col = 0; col < 16; ++col) {
    request.mutable_transit_matrix()->add_values(row == col ? 0 :
        (row * 131 + col * 71 + row * col * 13) % 97 + 1);
  }
  request.set_solution_events(true);
  request.set_track_unchecked_neighbors(true);
  operations_research::RoutingModelParameters model_parameters;
  model_parameters.mutable_solver_parameters()->set_check_solution_period(100);
  request.set_model_parameters_proto(model_parameters.SerializeAsString());
  request.add_model_parameter_fields("solver_parameters.check_solution_period");
  auto parameters = operations_research::DefaultRoutingSearchParameters();
  parameters.set_first_solution_strategy(operations_research::FirstSolutionStrategy::FIRST_UNBOUND_MIN_VALUE);
  parameters.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GREEDY_DESCENT);
  auto* operators = parameters.mutable_local_search_operators();
  const auto* descriptor = operators->GetDescriptor();
  const auto* reflection = operators->GetReflection();
  for (int index = 0; index < descriptor->field_count(); ++index) {
    const auto* field = descriptor->field(index);
    reflection->SetEnumValue(operators, field, field->name() == "use_two_opt" ? 3 : 2);
    request.add_search_parameter_fields("local_search_operators." + std::string(field->name()));
  }
  parameters.mutable_time_limit()->set_nanos(50000000);
  request.set_search_parameters_proto(parameters.SerializeAsString());
  for (const char* field : {"first_solution_strategy", "local_search_metaheuristic", "time_limit"})
    request.add_search_parameter_fields(field);
  RoutingExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  int checked = 0, unchecked = 0;
  auto handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    execution = executor.Execute({1, "routing", request.SerializeAsString()}, context,
        [&](std::string payload) {
          bridge::RoutingBridgeResponse event;
          Expect(event.ParseFromString(payload) && event.has_solve_event(), "Unchecked event parses");
          event.solve_event().unchecked() ? ++unchecked : ++checked;
        });
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  Expect(execution.ok && checked > 0 && unchecked > 0, "Fast native local search emits checked and unchecked events");
}

void RejectsInvalidConstraintIndices() {
  for (int kind = 0; kind < 4; ++kind) {
    for (int64_t index : {-1, 4, 5, 100}) {
      bridge::RoutingBridgeRequest request;
      Expect(request.ParseFromString(Request().payload), "request parses");
      auto* operation = request.add_operations();
      if (kind == 0) {
        auto* value = operation->mutable_add_disjunction();
        value->add_indices(index);
        value->set_penalty(10);
      } else if (kind == 1) {
        auto* value = operation->mutable_add_pickup_and_delivery();
        value->set_pickup(index);
        value->set_delivery(1);
      } else if (kind == 2) {
        // Terminal index 4 is a valid VehicleVar, but not a visit index.
        if (index == 4) continue;
        auto* value = operation->mutable_add_vehicle_equality_constraint();
        value->set_left(index);
        value->set_right(1);
      } else {
        if (index == 4) continue;
        auto* dimension = request.add_operations()->mutable_add_constant_dimension();
        dimension->set_name("time");
        dimension->set_value(1);
        dimension->set_capacity(10);
        // Dimension must be created before the invalid constraint is applied.
        request.mutable_operations()->SwapElements(request.operations_size() - 2, request.operations_size() - 1);
        auto* value = request.mutable_operations(request.operations_size() - 1)->mutable_add_cumul_less_or_equal_constraint();
        value->set_dimension_name("time");
        value->set_left(index);
        value->set_right(1);
      }
      const auto execution = Execute({1, "routing", request.SerializeAsString()});
      Expect(!execution.ok && execution.error_message.find("invalid index") != std::string::npos,
             "Invalid constraint indices return an error instead of reaching native variables");
    }
  }
}

void AppliesSuccessorDomainsAndPreservesRouteFeasibility() {
  bridge::RoutingBridgeRequest request;
  Expect(request.ParseFromString(Request().payload), "request parses");
  auto* optional = request.add_operations()->mutable_add_disjunction();
  optional->add_indices(3);
  optional->set_penalty(13);
  const auto restrict_next = [&](int64_t index, const std::vector<int64_t>& values) {
    auto* domain = request.add_operations()->mutable_set_next_values();
    domain->set_index(index);
    for (int64_t value : values) domain->add_values(value);
  };
  restrict_next(0, {2});
  restrict_next(2, {3, 1, 1});
  restrict_next(2, {1, 4});
  restrict_next(1, {4});
  restrict_next(3, {3});
  for (int kind = 0; kind < 4; ++kind) {
    auto current = request;
    if (kind > 0) {
      auto* route = current.mutable_initial_assignment()->add_routes();
      route->add_indices(kind == 3 ? 1 : 2);
      route->add_indices(kind == 3 ? 2 : 1);
      current.set_read_assignment_only(kind != 1);
    }
    const auto execution = Execute({1, "routing", current.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::RoutingBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "response parses");
    if (kind == 3) {
      Expect(!response.has_solution(), "Restoration rejects forbidden arcs");
    } else {
      Expect(response.has_solution() && response.objective_value() == 20,
             "Native successor restrictions preserve arc costs and drop penalties");
      Expect(response.next_values(0) == 2 && response.next_values(2) == 1 &&
             response.next_values(1) == 4 && response.next_values(3) == 3,
             "Domains intersect and optional self-loops force unperformed nodes");
    }
  }

}

void RejectsMalformedSuccessorDomains() {
  for (int kind = 0; kind < 6; ++kind) {
    bridge::RoutingBridgeRequest request;
    Expect(request.ParseFromString(Request().payload), "request parses");
    auto* domain = request.add_operations()->mutable_set_next_values();
    domain->set_index(kind == 0 ? -1 : kind == 1 ? 4 : kind == 2 ? 100 : 1);
    domain->add_values(kind == 3 ? -1 : kind == 4 ? 5 : kind == 5 ? 9223372036854775807LL : 2);
    const auto execution = Execute({1, "routing", request.SerializeAsString()});
    Expect(!execution.ok && execution.error_message.find("successor domain") != std::string::npos,
           "Raw successor indices and values must be validated before indexing native variables");
  }
}

void AssignsRoutingResourcesNatively() {
  bridge::RoutingBridgeRequest request;
  request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_capacity(100); dimension->set_name("time");
  request.add_dimension_names("time");
  auto* group = request.add_resource_groups();
  auto* resource = group->add_resources(); resource->set_dimension_name("time");
  resource->add_start_domain(10); resource->add_start_domain(10);
  resource->add_end_domain(14); resource->add_end_domain(14);
  group->add_required_vehicles(0);
  auto* allowed = group->add_allowed_resources(); allowed->set_vehicle(0); allowed->add_resources(0);
  const auto execution = Execute({1, "routing", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_solution(), "Resource model solves");
  Expect(response.resource_assignments_size() == 1 && response.resource_assignments(0).mins(0) == 0 && response.resource_assignments(0).maxs(0) == 0,
      "Assigned native resource is captured");
  Expect(response.dimensions(0).cumul_mins(response.starts(0)) == 10 && response.dimensions(0).cumul_mins(response.ends(0)) == 14,
      "Resource attributes constrain native start and end cumuls");
  resource->clear_start_domain();
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Empty domains reject before native Domain::Min");
  resource->add_start_domain(10); resource->add_start_domain(10);
  allowed->set_resources(0, 99);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown resource eligibility rejects safely");
}

void ConstrainsResourceVariablesNatively() {
  bridge::RoutingBridgeRequest request;
  request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_capacity(100); dimension->set_name("time");
  for (int group = 0; group < 2; ++group) {
    auto* data = request.add_resource_groups(); data->add_required_vehicles(0);
    for (int resource = 0; resource < 3; ++resource) {
      auto* item = data->add_resources(); item->set_dimension_name("time");
      item->add_start_domain(0); item->add_start_domain(0); item->add_end_domain(4); item->add_end_domain(4);
    }
  }
  auto* domain = request.add_operations()->mutable_modify_domain();
  domain->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_RESOURCE);
  domain->mutable_variable()->set_resource_group(1); domain->set_action(bridge::ROUTING_DOMAIN_RANGE);
  domain->set_lower(2); domain->set_upper(2);
  auto* constraint = request.add_operations()->mutable_add_linear_constraint(); constraint->set_comparison(1);
  auto* term = constraint->mutable_left()->add_terms(); term->set_coefficient(1);
  term->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_RESOURCE);
  constraint->mutable_right()->set_offset(1);
  auto* finalizer = request.add_operations()->mutable_add_finalizer();
  finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_RESOURCE); finalizer->set_resource_group(1);
  finalizer->set_kind(bridge::ROUTING_FINALIZER_TARGET); finalizer->set_target(2);
  const auto result = Execute({1, "routing", request.SerializeAsString()}); Expect(result.ok, result.error_message);
  bridge::RoutingBridgeResponse response; response.ParseFromString(result.payload);
  Expect(response.has_solution() && response.resource_assignments(0).mins(0) == 1 && response.resource_assignments(1).mins(0) == 2,
      "Resource variable references preserve group identity through constraints and finalizers");
  auto* query = request.add_domain_queries()->mutable_variable(); query->set_kind(bridge::ROUTING_VARIABLE_RESOURCE); query->set_resource_group(1);
  const auto inspected = Execute({1, "routing", request.SerializeAsString()}); Expect(inspected.ok, inspected.error_message);
  response.ParseFromString(inspected.payload);
  Expect(response.domain_results(0).min() == 2 && response.domain_results(0).max() == 2, "Native resource domain inspection");
  query->set_resource_group(2);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown resource groups reject without native DCHECK");
}

void InspectsNativeResourceAttributesAndClasses() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_capacity(100); dimension->set_name("time"); request.add_dimension_names("time");
  auto* group = request.add_resource_groups(); group->add_required_vehicles(0);
  for (int resource = 0; resource < 3; ++resource) {
    auto* item = group->add_resources(); item->set_dimension_name("time");
    if (resource == 0) { item->add_start_domain(5); item->add_start_domain(7); item->add_start_domain(0); item->add_start_domain(5); }
    else { item->add_start_domain(resource == 1 ? 0 : 10); item->add_start_domain(resource == 1 ? 7 : 12); }
    item->add_end_domain(14); item->add_end_domain(20);
  }
  request.set_resource_inspection_group(0);
  const auto execution = Execute({1, "routing", request.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response; response.ParseFromString(execution.payload);
  Expect(!response.has_solution() && response.has_resource_inspection(), "Inspection closes native model without searching");
  const auto& data = response.resource_inspection();
  Expect(data.resources_size() == 3 && data.classes_size() == 2 && data.classes(0).resource_indices_size() == 2,
      "Native class membership merges equal normalized attributes");
  Expect(data.resources(0).dimension_attributes(0).start_domain_size() == 2 && data.resources(0).dimension_attributes(0).start_domain(0) == 0
      && data.classes(0).dimension_attributes(0).start_domain(1) == 7, "Native per-resource and class attributes are normalized");
  auto* domain = request.add_operations()->mutable_modify_domain(); domain->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_RESOURCE);
  domain->set_action(bridge::ROUTING_DOMAIN_VALUES); domain->add_values(0);
  const auto constrained = Execute({1, "routing", request.SerializeAsString()}); Expect(constrained.ok, constrained.error_message);
  response.ParseFromString(constrained.payload);
  Expect(response.resource_inspection().classes_size() == 3, "Native resource classes account for variable domains");
  request.set_resource_inspection_group(-1);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid group inspection rejects safely");
  request.set_resource_inspection_group(0); request.add_dimension_names("unknown");
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown inspection dimensions reject safely");
}

void ReifiesNativeBooleanExpressions() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  for (int node : {1, 2}) { auto* disjunction = request.add_operations()->mutable_add_disjunction(); disjunction->add_indices(node); disjunction->set_max_cardinality(1); disjunction->set_penalty(0); }
  auto* inactive = request.add_operations()->mutable_set_active_values(); inactive->set_index(2); inactive->add_values(0);
  const auto reference = [](bridge::RoutingBooleanExpression* expression, bridge::RoutingVariableKind kind, int index) {
    expression->set_kind(2); expression->mutable_variable()->set_kind(kind); expression->mutable_variable()->set_index(index);
  };
  auto* first = request.add_operations()->mutable_add_boolean_variable(); first->set_index(0); first->mutable_expression()->set_kind(3);
  auto* comparison = first->mutable_expression()->mutable_comparison(); comparison->set_comparison(1);
  auto* term = comparison->mutable_left()->add_terms(); term->set_coefficient(1); term->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_ACTIVE); term->mutable_variable()->set_index(1);
  comparison->mutable_right()->set_offset(1);
  auto* negated = request.add_operations()->mutable_add_boolean_variable(); negated->set_index(1); negated->mutable_expression()->set_kind(6);
  reference(negated->mutable_expression()->add_operands(), bridge::ROUTING_VARIABLE_ACTIVE, 2);
  auto* conjunction = request.add_operations()->mutable_add_boolean_variable(); conjunction->set_index(2); conjunction->mutable_expression()->set_kind(4);
  reference(conjunction->mutable_expression()->add_operands(), bridge::ROUTING_VARIABLE_BOOLEAN, 0);
  reference(conjunction->mutable_expression()->add_operands(), bridge::ROUTING_VARIABLE_BOOLEAN, 1);
  auto* either = request.add_operations()->mutable_add_boolean_constraint()->mutable_expression(); either->set_kind(5);
  reference(either->add_operands(), bridge::ROUTING_VARIABLE_ACTIVE, 1); reference(either->add_operands(), bridge::ROUTING_VARIABLE_ACTIVE, 2);
  auto* conditional = request.add_operations()->mutable_add_linear_constraint(); conditional->set_comparison(1);
  term = conditional->mutable_left()->add_terms(); term->set_coefficient(1); term->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_ACTIVE); term->mutable_variable()->set_index(1);
  conditional->mutable_right()->set_offset(1);
  reference(conditional->add_boolean_conditions(), bridge::ROUTING_VARIABLE_BOOLEAN, 2);
  auto* finalizer = request.add_operations()->mutable_add_finalizer(); finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_BOOLEAN); finalizer->set_index(2);
  finalizer->set_kind(bridge::ROUTING_FINALIZER_TARGET); finalizer->set_target(0);
  const auto execution = Execute({1, "routing", request.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response; response.ParseFromString(execution.payload);
  Expect(response.has_solution() && response.next_values(1) != 1 && response.next_values(2) == 2, "Native OR forces the remaining optional stop");
  int captured = 0;
  for (const auto& value : response.assignment_variables()) if (value.variable().kind() == bridge::ROUTING_VARIABLE_BOOLEAN) {
    Expect(value.min() == 1 && value.max() == 1, "Reified comparison, NOT and AND are native bound truths"); ++captured;
  }
  Expect(captured == 3, "All registered Boolean variables are captured");
  negated->mutable_expression()->clear_operands();
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Malformed NOT rejects before native factory access");
  reference(negated->mutable_expression()->add_operands(), bridge::ROUTING_VARIABLE_BOOLEAN, 99);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown Boolean variable references reject safely");
}

void CreatesNativeNonlinearExpressions() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_slack_max(10); dimension->set_capacity(100); dimension->set_fix_start_cumul_to_zero(true); dimension->set_name("time");
  request.add_dimension_names("time");
  const auto term = [](bridge::RoutingLinearExpression* operand, bridge::RoutingVariableKind kind, int index, int64_t coefficient, const std::string& name = "") {
    auto* item = operand->add_terms(); item->set_coefficient(coefficient);
    auto* variable = item->mutable_variable(); variable->set_kind(kind); variable->set_index(index); variable->set_dimension_name(name);
  };
  auto* product = request.add_operations()->mutable_add_integer_expression(); product->set_index(0); product->set_kind(1);
  term(product->add_operands(), bridge::ROUTING_VARIABLE_CUMUL, 1, 1, "time"); term(product->add_operands(), bridge::ROUTING_VARIABLE_CUMUL, 2, 1, "time");
  auto* absolute = request.add_operations()->mutable_add_integer_expression(); absolute->set_index(1); absolute->set_kind(2);
  auto* difference = absolute->add_operands(); term(difference, bridge::ROUTING_VARIABLE_CUMUL, 1, 1, "time"); term(difference, bridge::ROUTING_VARIABLE_CUMUL, 2, -1, "time");
  auto* minimum = request.add_operations()->mutable_add_integer_expression(); minimum->set_index(2); minimum->set_kind(3);
  term(minimum->add_operands(), bridge::ROUTING_VARIABLE_EXPRESSION, 0, 1); minimum->add_operands()->set_offset(7);
  auto* maximum = request.add_operations()->mutable_add_integer_expression(); maximum->set_index(3); maximum->set_kind(4);
  term(maximum->add_operands(), bridge::ROUTING_VARIABLE_EXPRESSION, 0, 1); term(maximum->add_operands(), bridge::ROUTING_VARIABLE_EXPRESSION, 2, 1);
  auto* truth = request.add_operations()->mutable_add_boolean_variable(); truth->set_index(0); truth->mutable_expression()->set_kind(3);
  auto* comparison = truth->mutable_expression()->mutable_comparison(); comparison->set_comparison(1);
  term(comparison->mutable_left(), bridge::ROUTING_VARIABLE_EXPRESSION, 1, 1); comparison->mutable_right()->set_offset(3);
  for (const auto& bounds : std::vector<std::pair<int, int> >{{1, 2}, {2, 5}, {3, 7}}) {
    auto* value = request.add_operations()->mutable_set_cumul_bounds(); value->set_dimension_name("time"); value->set_index(bounds.first); value->set_lower(bounds.second); value->set_upper(bounds.second);
  }
  for (int index = 0; index < 4; ++index) { auto* next = request.add_operations()->mutable_set_next_values(); next->set_index(index); next->add_values(index + 1); }
  const auto execution = Execute({1, "routing", request.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response; response.ParseFromString(execution.payload); Expect(response.has_solution(), "Nonlinear routing model solves");
  int captured = 0;
  const int64_t expected[] = {10, 3, 7, 10};
  for (const auto& value : response.assignment_variables()) {
    if (value.variable().kind() == bridge::ROUTING_VARIABLE_EXPRESSION) { Expect(value.min() == expected[value.variable().index()] && value.max() == value.min(), "Native nonlinear values are captured exactly"); ++captured; }
    if (value.variable().kind() == bridge::ROUTING_VARIABLE_BOOLEAN) Expect(value.min() == 1, "Nonlinear and Boolean registries preserve overlapping index zero");
  }
  Expect(captured == 4, "All nonlinear handles are captured");
  absolute->clear_operands(); Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Malformed absolute arity rejects safely");
  term(absolute->add_operands(), bridge::ROUTING_VARIABLE_EXPRESSION, 99, 1);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown nonlinear variable references reject safely");
}

void DispatchesIlsWithNativeCompletionStatus() {
  using namespace operations_research;
  RoutingIndexManager manager(6, 1, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([](int64_t a, int64_t b) { return a == b ? 0 : 1 + (a * 17 + b * 11) % 23; }));
  auto parameters = DefaultRoutingSearchParameters();
  parameters.set_use_iterated_local_search(true); parameters.mutable_time_limit()->set_nanos(50000000);
  parameters.mutable_iterated_local_search_parameters()->mutable_ruin_recreate_parameters()->add_ruin_strategies()->mutable_spatially_close_routes()->set_num_ruined_routes(1);
  ortools_wasm::RoutingAssignmentWorkflow workflow;
  workflow.Validate(parameters, false);
  Expect(workflow.Run(model, nullptr, parameters) && model.status() == RoutingSearchStatus::ROUTING_SUCCESS,
      "A returned native ILS assignment must report successful completion");
  Expect(workflow.collected.empty(), "ILS does not emulate collected solutions");
  bool rejected = false;
  try { workflow.Validate(parameters, true); } catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "ILS rejects native unsupported warm starts");
}
void SerializesCollectedSolutionsAndNativeStatistics() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Request parses");
  operations_research::RoutingSearchParameters parameters;
  Expect(parameters.ParseFromString(request.search_parameters_proto()), "Parameters parse");
  parameters.set_number_of_solutions_to_collect(3);
  request.add_search_parameter_fields("number_of_solutions_to_collect");
  request.set_search_parameters_proto(parameters.SerializeAsString());
  const auto response = Reply(request);
  Expect(response.has_solution() && response.collected_solutions_size() > 0 && response.collected_solutions_size() <= 3,
      "Native solution vector is returned before model destruction");
  int64_t previous = std::numeric_limits<int64_t>::max();
  for (const auto& solution : response.collected_solutions()) {
    Expect(solution.objective_value() <= previous && solution.next_values_size() == response.next_values_size()
        && solution.vehicle_values_size() == response.vehicle_values_size() && solution.starts_size() == 1 && solution.ends_size() == 1,
        "Every ordered collected assignment has a complete independent snapshot");
    previous = solution.objective_value();
  }
  Expect(previous == response.objective_value() && response.has_objective_lower_bound() && response.has_search_statistics(),
      "Best collection entry matches the result and native metadata is explicit");
}
void PreservesPackingOutcomesAndOwnsCompaction() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 2, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([](int64_t, int64_t) { return 1; }));
  auto parameters = DefaultRoutingSearchParameters(); model.CloseModelWithParameters(parameters);
  const auto* original = model.ReadAssignmentFromRoutes({{}, {1, 2}}, true);
  Expect(original != nullptr, "Higher-vehicle assignment is feasible");
  ortools_wasm::RoutingAssignmentWorkflow packing; packing.action = 1; packing.packing_duration_seconds = 1;
  Expect(packing.Run(model, original, parameters) == original && !packing.time_limit_reached,
      "Packing without eligible optimizers preserves its input");
  packing.packing_duration_seconds = 0;
  Expect(packing.Run(model, original, parameters) == original && packing.time_limit_reached,
      "Nonpositive packing duration returns the original assignment and native flag");
  ortools_wasm::RoutingAssignmentWorkflow compact; compact.action = 3;
  const auto* result = compact.Run(model, original, parameters);
  Expect(result && compact.compacted.get() == result && result->Value(model.NextVar(model.Start(0))) == 1,
      "Compaction retains caller-owned memory until serialization");
  Expect(model.IsEnd(original->Value(model.NextVar(model.Start(0)))), "Original assignment is independent");
}
void ComputesNativeLowerBoundWithUnsupportedZero() {
  using namespace operations_research;
  for (bool optional : {false, true}) {
    RoutingIndexManager manager(4, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
    model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([](int64_t, int64_t) { return 1; }));
    if (optional) model.AddDisjunction({1}, 1);
    auto parameters = DefaultRoutingSearchParameters(); model.CloseModelWithParameters(parameters);
    ortools_wasm::RoutingAssignmentWorkflow workflow; workflow.action = 6;
    Expect(!workflow.Run(model, nullptr, parameters) && workflow.computed_lower_bound == (optional ? 0 : 3),
        "Explicit native computation preserves valid and unsupported-case bounds");
  }
}

void FastSolveDoesNotExposeFailedCpCandidates() {
  using namespace operations_research;
  for (bool check : {false, true}) {
    RoutingIndexManager manager(4, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
    model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([&](int64_t a, int64_t b) {
      return manager.IndexToNode(b).value() == (manager.IndexToNode(a).value() + 1) % 4 ? 1 : 100;
    }));
    auto parameters = DefaultRoutingSearchParameters(); parameters.set_local_search_metaheuristic(LocalSearchMetaheuristic::GREEDY_DESCENT);
    model.CloseModelWithParameters(parameters);
    const auto* input = model.ReadAssignmentFromRoutes({{1, 2, 3}}, true);
    model.solver()->AddConstraint(model.solver()->MakeNonEquality(model.solver()->MakeProd(model.NextVar(model.Start(0)), model.NextVar(1)), 2));
    ortools_wasm::RoutingAssignmentWorkflow workflow; workflow.action = 4; workflow.check_solution_in_cp = check;
    const auto* result = workflow.Run(model, input, parameters);
    Expect(check ? !result && model.status() == RoutingSearchStatus::ROUTING_FAIL
                 : result && model.status() == RoutingSearchStatus::ROUTING_SUCCESS,
        "Failed CP checking preserves failure status without exposing the non-null native candidate as checked output");
  }
}

void CompactionUpdatesCapturedVehicleActivity() {
  using namespace operations_research;
  for (bool used_when_empty : {false, true}) {
    RoutingIndexManager manager(3, 2, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
    model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([](int64_t, int64_t) { return 1; }));
    for (int vehicle = 0; vehicle < 2; ++vehicle) {
      model.SetVehicleUsedWhenEmpty(used_when_empty, vehicle);
      model.AddToAssignment(model.ActiveVehicleVar(vehicle));
      model.AddToAssignment(model.VehicleRouteConsideredVar(vehicle));
    }
    model.CloseModelWithParameters(DefaultRoutingSearchParameters());
    const auto* original = model.ReadAssignmentFromRoutes({{}, {1, 2}}, true);
    Expect(original != nullptr, "Higher-vehicle input is feasible");
    std::unique_ptr<Assignment> result(model.CompactAndCheckAssignment(*original));
    Expect(result && result->Value(model.NextVar(model.Start(0))) == 1
        && result->Value(model.ActiveVehicleVar(0)) == 1 && result->Value(model.ActiveVehicleVar(1)) == 0
        && result->Value(model.VehicleRouteConsideredVar(0)) == 1
        && result->Value(model.VehicleRouteConsideredVar(1)) == static_cast<int64_t>(used_when_empty),
        "Native compaction updates captured activity and honors empty-route consideration");
    Expect(original->Value(model.ActiveVehicleVar(0)) == 0, "The input assignment remains independent");
  }
}

void UsesDedicatedFirstSolutionEvaluator() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  SetRoutingFirstSolutionStrategy(&request, 5);
  operations_research::RoutingSearchParameters parameters; parameters.ParseFromString(request.search_parameters_proto());
  parameters.set_solution_limit(1); request.set_search_parameters_proto(parameters.SerializeAsString()); request.add_search_parameter_fields("solution_limit");
  Expect(Reply(request).status() == operations_research::RoutingSearchStatus::ROUTING_INVALID, "Evaluator strategy without a setter is natively invalid");
  auto* rank = request.add_operations()->mutable_set_first_solution_evaluator(); rank->set_dimension(4);
  for (int a = 0; a < 4; ++a) for (int b = 0; b < 4; ++b) rank->add_values((a == 0 && b == 3) || b == a - 1 ? 1 : 100);
  const auto reply = Reply(request);
  Expect(reply.has_solution() && reply.next_values(0) == 3 && reply.next_values(3) == 2 && reply.next_values(2) == 1,
      "Dedicated evaluator controls first-solution ranking");
}

void UsesPrimaryConstrainedDimension() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
  model.SetArcCostEvaluatorOfAllVehicles(model.RegisterTransitCallback([](int64_t, int64_t) { return 1; }));
  model.AddConstantDimension(1, 100, true, "time");
  model.GetMutableDimension("time")->CumulVar(2)->SetMax(2);
  model.SetPrimaryConstrainedDimension("time");
  model.CloseModelWithParameters(DefaultRoutingSearchParameters());
  Expect(model.GetPrimaryConstrainedDimension() == "time" && model.ArcIsMoreConstrainedThanArc(0, 2, 1), "Native comparison uses the primary dimension upper bounds");
  model.SetPrimaryConstrainedDimension("");
  Expect(model.GetPrimaryConstrainedDimension().empty() && model.ArcIsMoreConstrainedThanArc(0, 1, 2), "Clearing restores native tie breaking");
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  request.add_operations()->set_set_primary_constrained_dimension("missing");
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Unknown primary dimension rejects without entering native DCHECK");
}

void InspectsNativeCumulOptimizers() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_capacity(100); dimension->set_name("time");
  auto* cost = request.add_operations()->mutable_set_dimension_value();
  cost->set_dimension_name("time"); cost->set_kind(bridge::ROUTING_DIMENSION_VALUE_KIND_GLOBAL_SPAN_COST); cost->set_value(1);
  request.set_inspect_cumul_optimizers(true);
  const auto reply = Reply(request);
  Expect(reply.has_cumul_optimizers() && reply.cumul_optimizers().global_dimensions_size() == 1
      && reply.cumul_optimizers().global_dimensions(0) == "time" && !reply.has_solution(), "Inspection reports native optimizer dimensions without searching");
  operations_research::RoutingSearchParameters parameters;
  parameters.set_disable_scheduling_beware_this_may_degrade_performance(true);
  request.set_search_parameters_proto(parameters.SerializeAsString()); request.clear_search_parameter_fields();
  request.add_search_parameter_fields("disable_scheduling_beware_this_may_degrade_performance");
  Expect(Reply(request).cumul_optimizers().global_dimensions_size() == 0, "Caller-selected closure parameters control inspection");
}

void ChecksNativeAssignmentFeasibility() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  const auto solved = Reply(request); Expect(solved.has_solution(), "Feasibility input exists");
  auto* input = request.mutable_initial_assignment()->mutable_snapshot();
  input->set_objective_value(solved.objective_value());
  for (const auto& variable : solved.assignment_variables()) *input->add_variables() = variable;
  for (int index = 0; index < solved.next_values_size() - request.num_vehicles(); ++index) {
    auto* value = input->add_variables(); value->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_NEXT);
    value->mutable_variable()->set_index(index); value->set_min(solved.next_values(index)); value->set_max(solved.next_values(index));
  }
  request.set_assignment_action(bridge::ROUTING_ASSIGNMENT_ACTION_CHECK_FEASIBILITY);
  auto reply = Reply(request);
  Expect(reply.has_assignment_feasible() && reply.assignment_feasible() && !reply.has_solution(), "Native check returns Boolean feasibility without another result assignment");
  auto* incompatible = request.add_operations()->mutable_set_next_values();
  incompatible->set_index(0); incompatible->add_values(solved.next_values(0) == 1 ? 2 : 1);
  reply = Reply(request);
  Expect(reply.has_assignment_feasible() && !reply.assignment_feasible(), "Incompatible saved bounds fail native restoration");
}


void QueriesNativePickupDeliverySibling() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* pair = request.add_operations()->mutable_add_pickup_and_delivery(); pair->set_pickup(1); pair->set_delivery(2);
  auto* query = request.mutable_model_query();
  query->set_kind(bridge::ROUTING_MODEL_QUERY_FIRST_MATCHING_PICKUP_DELIVERY_SIBLING);
  query->set_index(1); query->set_predicate_evaluator(7);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Raw sibling query requires callback transport");
  SolverExecutorRequest job{1, "routing", request.SerializeAsString()};
  int calls = 0; int value = 1;
  job.callback = [&](const std::string& data) -> std::optional<std::string> {
    ++calls;
    Expect(data == ortools_wasm::RoutingRouteCallbackData(7, {2}), "Native sibling and evaluator handle reach predicate");
    std::string reply(9, '\0'); reply[0] = 1; reply[1] = value; return reply;
  };
  bridge::RoutingBridgeResponse response;
  auto result = Execute(job);
  Expect(result.ok && response.ParseFromString(result.payload) && response.model_inspection().value() == 2 && calls == 1 && !response.has_solution(), "True predicate returns native sibling without solving");
  value = 0; result = Execute(job);
  Expect(result.ok && response.ParseFromString(result.payload) && response.model_inspection().value() == -1, "False predicate preserves no-match outcome");
  value = 2; Expect(!Execute(job).ok, "Raw non-Boolean predicate reply rejects");
  job.callback = [](const std::string&) -> std::optional<std::string> { return std::string(1, '\0'); };
  Expect(!Execute(job).ok, "Null evaluator reply is not a Boolean predicate");
  job.callback = [](const std::string&) -> std::optional<std::string> { return std::nullopt; };
  Expect(!Execute(job).ok, "Interrupted predicate rejects");
  query->set_index(4); job.payload = request.SerializeAsString();
  Expect(!Execute(job).ok, "End index rejects before unsafe native indexing");
}

void EvaluatesNativeCustomRouteCost() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  request.mutable_route_cost_query();
  Expect(Reply(request).has_route_cost() && Reply(request).route_cost().has_cost() &&
    Reply(request).route_cost().cost() == 0, "Empty callback list returns a present zero cost without solving");
  for (int evaluator : {7, 8}) request.add_operations()->mutable_add_route_constraint()->set_evaluator(evaluator);
  for (int index : {0, 1, 1, 4}) request.mutable_route_cost_query()->add_indices(index);
  SolverExecutorRequest job{1, "routing", request.SerializeAsString()};
  int calls = 0;
  job.callback = [&](const std::string& data) -> std::optional<std::string> {
    ++calls;
    Expect(data == ortools_wasm::RoutingRouteCallbackData(calls == 1 ? 7 : 8, {0, 1, 1, 4}), "Native query forwards the supplied route unchanged");
    const int64_t value = (int64_t{1} << 60) + 3;
    std::string reply(9, '\0'); reply[0] = 1;
    for (int j = 0; j < 8; ++j) reply[1 + j] = static_cast<uint64_t>(value) >> (8 * j);
    return reply;
  };
  auto execution = Execute(job); bridge::RoutingBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload) && calls == 2 && !response.has_solution() &&
    response.route_cost().cost() == (int64_t{1} << 61) + 6, "Native aggregation preserves exact int64 costs without search");
  calls = 0;
  job.callback = [&](const std::string&) -> std::optional<std::string> { ++calls; return std::string(1, '\0'); };
  execution = Execute(job);
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_route_cost() &&
    !response.route_cost().has_cost() && calls == 1, "Null rejects and short-circuits later evaluators");
  job.callback = [](const std::string&) -> std::optional<std::string> { throw std::runtime_error("query callback failed"); };
  Expect(!Execute(job).ok, "Callback failure rejects rather than becoming a route rejection");
  request.clear_operations(); request.mutable_route_cost_query()->add_indices(99);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Invalid raw route indices reject before callbacks");
}

void RoutesCallbacksThroughNativeSearch() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  request.add_operations()->mutable_add_route_constraint()->set_evaluator(7);
  SolverExecutorRequest job{1, "routing", request.SerializeAsString()};
  Expect(!Execute(job).ok, "Route callbacks require transport instead of being silently ignored");
  int calls = 0;
  job.callback = [&](const std::string& data) -> std::optional<std::string> {
    ++calls;
    Expect(data.size() >= 4 && (data.size() - 4) % 8 == 0 && static_cast<uint8_t>(data[0]) == 7, "Native callback includes evaluator handle and route indices");
    std::string reply(9, '\0'); reply[0] = 1; reply[1] = 5; return reply;
  };
  auto execution = Execute(job); bridge::RoutingBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_solution() && calls > 0,
      "Server forwards synchronous whole-route evaluations into native search");
  auto baseline = request; baseline.clear_operations();
  Expect(response.objective_value() == Reply(baseline).objective_value() + 5, "Native route costs contribute once to the objective");
  job.callback = [](const std::string&) -> std::optional<std::string> { return std::string(1, '\0'); };
  execution = Execute(job);
  Expect(execution.ok && response.ParseFromString(execution.payload) && !response.has_solution(), "Native null route cost rejects feasibility");
  job.callback = [](const std::string&) -> std::optional<std::string> { return "malformed"; };
  Expect(!Execute(job).ok, "Malformed callback replies fail the job without process abort");
  Expect(Reply(baseline).has_solution(), "Executor remains usable after callback error");
  std::string exact(9, static_cast<char>(0xff)); exact[0] = 1;
  Expect(ortools_wasm::RoutingRouteCallbackCost(exact) == -1 && !ortools_wasm::RoutingRouteCallbackCost(std::string(1, '\0')), "Reply decoder preserves signed int64 and null");
}

void InspectsPickupDeliveryAndBreakConfiguration() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* pair = request.add_operations()->mutable_add_pickup_and_delivery(); pair->set_pickup(1); pair->set_delivery(2);
  request.set_pickup_delivery_inspection_index(1);
  auto response = Reply(request);
  Expect(response.pickup_delivery_inspection().is_pickup() && !response.pickup_delivery_inspection().is_delivery()
      && response.pickup_delivery_inspection().pickup().pair_index() == 0 && response.pickup_delivery_inspection().pickup().alternative_index() == 0,
      "Native pickup position and classification are serialized");
  request.set_pickup_delivery_inspection_index(0); response = Reply(request);
  Expect(!response.pickup_delivery_inspection().has_pickup() && !response.pickup_delivery_inspection().has_delivery(), "Absent native positions stay absent");
  request.set_pickup_delivery_inspection_index(4);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "End indices are rejected before native lookup");
  request.clear_pickup_delivery_inspection_index();
  auto* dimension = request.add_operations()->mutable_add_constant_dimension(); dimension->set_value(1); dimension->set_capacity(100); dimension->set_name("time");
  request.mutable_break_inspection()->set_dimension_name("time"); response = Reply(request);
  Expect(!response.break_configuration().has_break_constraints() && !response.break_configuration().has_pre_travel_evaluator(), "Uninitialized break vectors are not accessed");
  auto* interval = request.add_operations()->mutable_add_break_interval(); interval->set_index(0); interval->set_start_min(1); interval->set_start_max(1); interval->set_duration(2);
  auto* breaks = request.add_operations()->mutable_set_break_intervals(); breaks->set_dimension_name("time"); breaks->add_intervals(0);
  breaks->set_pre_travel_handle(42); breaks->mutable_pre_travel()->set_dimension(4);
  for (int i = 0; i < 16; ++i) breaks->mutable_pre_travel()->add_values(0);
  auto* limit = request.add_operations()->mutable_set_break_distance_duration(); limit->set_dimension_name("time"); limit->set_distance(9007199254740993LL); limit->set_duration(1);
  response = Reply(request);
  Expect(response.break_configuration().has_break_constraints() && response.break_configuration().intervals(0) == 0
      && response.break_configuration().distance_duration(0).distance() == 9007199254740993LL
      && response.break_configuration().pre_travel_evaluator() == 42 && response.break_configuration().post_travel_evaluator() == -1,
      "Native break indices, exact limits and portable evaluator handles are preserved");
}


void ForwardsNativePiecewiseCumulCosts() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension(); dimension->set_name("time"); dimension->set_value(2); dimension->set_capacity(100); dimension->set_fix_start_cumul_to_zero(true);
  const auto baseline = Reply(request);
  auto* cost = request.add_operations()->mutable_set_piecewise_cost(); cost->set_dimension_name("time"); cost->set_index(4);
  auto* first = cost->add_segments(); first->set_other_point_x(6);
  auto* second = cost->add_segments(); second->set_point_x(6); second->set_slope(5); second->set_other_point_x(100);
  Expect(Reply(request).objective_value() == baseline.objective_value() + 10, "Native end cumul cost is included once");
  request.mutable_dimension_query()->set_dimension_name("time"); request.mutable_dimension_query()->set_index(4); request.mutable_dimension_query()->set_kind(bridge::ROUTING_DIMENSION_QUERY_PIECEWISE_COST);
  auto response = Reply(request);
  Expect(response.dimension_inspection().has_piecewise_linear_cost() && response.dimension_inspection().cost_segments(1).slope() == 5, "Server returns accepted native cost segments");
  auto* ignored = request.add_operations()->mutable_set_piecewise_cost(); ignored->set_dimension_name("time"); ignored->set_index(4);
  auto* invalid = ignored->add_segments(); invalid->set_slope(-1); invalid->set_point_y(5); invalid->set_other_point_x(100);
  Expect(Reply(request).dimension_inspection().cost_segments(1).slope() == 5, "Native ignored replacements preserve accepted costs");
  invalid->set_slope(0); invalid->set_point_y(0); invalid->set_point_x(5); invalid->set_other_point_x(10);
  auto* overlap = ignored->add_segments(); overlap->set_point_x(6); overlap->set_other_point_x(20);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Malformed segment overlap is rejected before the native fatal factory check");
}

void QueriesNativeDimensionClassesAndIntervals() {
  operations_research::RoutingIndexManager manager(3, 2, operations_research::RoutingIndexManager::NodeIndex(0));
  operations_research::RoutingModel model(manager);
  const int evaluator = model.RegisterTransitCallback([](int64_t, int64_t) { return 1; });
  model.SetArcCostEvaluatorOfAllVehicles(evaluator); model.SetFixedCostOfVehicle(8, 1);
  model.AddDimension(evaluator, 0, 100, false, "time"); auto* time = model.GetMutableDimension("time");
  time->CumulVar(1)->SetRange(2, 12); ortools_wasm::AddRoutingForbiddenIntervals(model, "time", 1, {{5, 7}});
  model.CloseModelWithParameters(operations_research::DefaultRoutingSearchParameters());
  Expect(model.GetVehicleClassIndexOfVehicle(0) != model.GetVehicleClassIndexOfVehicle(1), "Native model vehicle classes differ");
  const auto query = [&](int kind, int vehicle, int64_t lower, int64_t upper) {
    return ortools_wasm::InspectRoutingDimension(model, "time", kind, 1, 2, vehicle, lower, upper);
  };
  Expect(query(7, 1, 0, 0).value == 0 && query(1, 0, 0, 0).value == 1, "Transit queries use dimension evaluator classes");
  bool rejected = false; try { query(1, 1, 0, 0); } catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "Model vehicle-class IDs cannot index dimension evaluator classes");
  const auto intervals = query(2, 0, 0, 100).intervals;
  Expect(intervals == std::vector<std::pair<int64_t, int64_t>>{{2, 4}, {8, 12}} && query(3, 0, 0, 0).intervals == std::vector<std::pair<int64_t, int64_t>>{{5, 7}}, "Native bounds and holes determine interval snapshots");
  Expect(query(2, 0, 2, 3).intervals == std::vector<std::pair<int64_t, int64_t>>{{2, 3}}, "Allowed prefix is clipped before a later forbidden interval");
  Expect(query(4, 0, 6, 0).value == 8 && query(5, 0, 0, 6).value == 4 && query(4, 0, 20, 0).value == 20, "Permitted-value queries retain native unclamped behavior");
  operations_research::RoutingIndexManager large_manager(3, 1, operations_research::RoutingIndexManager::NodeIndex(0));
  operations_research::RoutingModel large(large_manager); const auto max = std::numeric_limits<int64_t>::max();
  large.AddConstantDimension(1, max, false, "time"); large.GetMutableDimension("time")->CumulVar(1)->SetRange(max - 3, max);
  ortools_wasm::AddRoutingForbiddenIntervals(large, "time", 1, {{max - 1, max}});
  large.CloseModelWithParameters(operations_research::DefaultRoutingSearchParameters());
  const auto tail = ortools_wasm::InspectRoutingDimension(large, "time", 2, 1, 0, 0, max - 2, max).intervals;
  Expect(tail == std::vector<std::pair<int64_t, int64_t>>{{max - 2, max - 2}}, "Forbidden int64 maximum cannot reappear through saturating successor arithmetic");
}

void ReportsNativeSearchEntryBeforeSolutions() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  request.set_search_entry_events(true); request.set_solution_events(true);
  RoutingExecutor executor; JobScheduler scheduler({2, 8}); SolverExecutorResult result; std::vector<int> events;
  auto job = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    result = executor.Execute({1, "routing", request.SerializeAsString()}, context, [&](std::string payload) {
      bridge::RoutingBridgeResponse event; Expect(event.ParseFromString(payload), "Search event parses");
      if (event.search_entered()) events.push_back(1);
      if (event.has_solve_event()) events.push_back(2);
    });
    return result.ok ? JobResult::Succeeded() : JobResult::Failed(result.error_message);
  }); job.result().get();
  Expect(result.ok && !events.empty() && events.front() == 1 && std::find(events.begin(), events.end(), 2) != events.end(), "Native entry is delivered before native solutions");
}

void BindsNativeSweepAndOrderedActivity() {
  bridge::RoutingBridgeRequest input; Expect(input.ParseFromString(Request().payload), "Routing base parses");
  SetRoutingFirstSolutionStrategy(&input, operations_research::FirstSolutionStrategy::SWEEP);
  auto missing = Reply(input); Expect(!missing.has_solution() && missing.status() == 5, "Native SWEEP requires its arranger");
  auto* sweep = input.add_operations()->mutable_set_sweep_arranger();
  for (const auto& xy : std::vector<std::pair<int,int>>{{0,0},{1,0},{0,1},{-1,0},{0,0}}) {
    auto* point = sweep->add_points(); point->set_x(xy.first); point->set_y(xy.second);
  }
  Expect(Reply(input).has_solution(), "Native sweep arranger enables SWEEP");
  sweep->mutable_points(1)->set_x(std::numeric_limits<int32_t>::min());
  sweep->mutable_points(0)->set_x(std::numeric_limits<int32_t>::max());
  Expect(!Execute({1,"routing",input.SerializeAsString()}).ok, "Native coordinate subtraction cannot overflow");

  operations_research::RoutingIndexManager manager(3, 1, operations_research::RoutingIndexManager::NodeIndex(0));
  operations_research::RoutingModel model(manager);
  const auto first = model.AddDisjunction({1}, 0), second = model.AddDisjunction({2}, 100);
  AddRoutingOrderedActivityGroup(model, {first.value(), second.value()});
  Expect(model.GetOrderedActivityGroups().size() == 1, "Native ordered groups are recorded");
  model.ActiveVar(1)->SetValue(0);
  const auto* assignment = model.SolveWithParameters(operations_research::DefaultRoutingSearchParameters());
  Expect(assignment && assignment->Value(model.ActiveVar(2)) == 0, "Later activation requires the earlier disjunction");
  bool rejected = false;
  try { AddRoutingOrderedActivityGroup(model, {2}); } catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "Invalid disjunction does not reach native indexing");
}

void BindsNativeGenericTabuVariables() {
  bridge::RoutingBridgeRequest input; Expect(input.ParseFromString(Request().payload), "Routing base parses");
  operations_research::RoutingSearchParameters parameters;
  parameters.set_local_search_metaheuristic(operations_research::LocalSearchMetaheuristic::GENERIC_TABU_SEARCH);
  parameters.set_solution_limit(8); parameters.mutable_time_limit()->set_nanos(50000000);
  input.set_search_parameters_proto(parameters.SerializeAsString());
  for (const char* field : {"local_search_metaheuristic", "solution_limit", "time_limit"}) input.add_search_parameter_fields(field);
  auto* selected = input.add_operations()->mutable_set_tabu_vars();
  auto* variable = selected->add_variables(); variable->set_kind(bridge::ROUTING_VARIABLE_NEXT); variable->set_index(0);
  Expect(Reply(input).has_solution(), "Native generic tabu accepts a successor variable selection");
  selected->clear_variables(); Expect(Reply(input).has_solution(), "Empty native variable selection is preserved");
  selected->set_reset(true); Expect(Reply(input).has_solution(), "Clearing the native callback restores its default");
  selected->set_reset(false);
  variable = selected->add_variables(); variable->set_kind(bridge::ROUTING_VARIABLE_NEXT); variable->set_index(-1);
  Expect(!Execute(SolverExecutorRequest{1, "routing", input.SerializeAsString()}).ok, "Invalid raw variable references reject before native search");
  operations_research::RoutingIndexManager manager(4, 1, operations_research::RoutingNodeIndex(0));
  operations_research::RoutingModel model(manager), other(manager);
  bool rejected = false;
  try { SetRoutingTabuVars(model, std::vector<operations_research::IntVar*>{other.NextVar(0)}); }
  catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "Native helper rejects variable pointers from another solver");
}

void InspectsNativeCostClasses() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* fixed = request.add_operations()->mutable_set_fixed_vehicle_cost(); fixed->set_vehicle(0); fixed->set_cost(3);
  auto* query = request.mutable_model_query();
  query->set_kind(bridge::ROUTING_MODEL_QUERY_COST_CLASSES_COUNT);
  Expect(Reply(request).model_inspection().value() == 2, "Native class count includes reserved zero");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_NONZERO_COST_CLASSES_COUNT);
  Expect(Reply(request).model_inspection().value() == 1, "Native nonzero class count excludes reserved zero");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_VEHICLE_COST_CLASS); query->set_vehicle_or_class(0);
  const int cost_class = Reply(request).model_inspection().value();
  Expect(cost_class > 0, "Native vehicle cost class is assigned");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_ARC_COST_FOR_CLASS); query->set_index(0); query->set_other_index(1);
  query->set_vehicle_or_class(cost_class);
  Expect(Reply(request).model_inspection().value() == 4, "Class cost includes vehicle fixed cost");
  query->set_vehicle_or_class(0);
  Expect(Reply(request).model_inspection().value() == 3, "Reserved zero class retains native fixed-cost contribution");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_HAS_VEHICLE_COST_CLASS); query->set_vehicle_or_class(99);
  const auto absent = Reply(request).model_inspection();
  Expect(absent.has_value() && absent.value() == 0, "Native false retains scalar presence");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_ARC_COST_FOR_CLASS); query->set_vehicle_or_class(99);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Invalid classes reject before native indexing");
  query->set_vehicle_or_class(cost_class); query->set_index(4);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "End indices cannot start non-self arcs");
}

void InspectsNativeUnperformedPenalties() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* disjunction = request.add_operations()->mutable_add_disjunction(); disjunction->add_indices(1); disjunction->set_penalty((int64_t{1} << 60) + 3);
  for (int penalty : {5,7}) {
    auto* overlap = request.add_operations()->mutable_add_disjunction(); overlap->add_indices(2); overlap->add_indices(3); overlap->set_penalty(penalty);
  }
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_UNPERFORMED_PENALTY); query->set_index(1);
  Expect(Reply(request).model_inspection().value() == (int64_t{1} << 60) + 3, "Exact native penalty survives the bridge");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_UNPERFORMED_PENALTY_OR_VALUE); query->set_index(2); query->set_default_value(-(int64_t{1} << 60));
  Expect(Reply(request).model_inspection().value() == -(int64_t{1} << 60), "Overlapping disjunctions preserve caller fallback");
  query->set_index(0);
  Expect(Reply(request).model_inspection().value() == std::numeric_limits<int64_t>::max(), "Forced-active sentinel is native int64 max");
  query->set_index(4); Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Penalty end indices reject before native indexing");
}

void InspectsNativeDimensionClassification() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  for (const std::string name : {"unary", "binary", "costly"}) {
    auto* dimension = request.add_operations()->mutable_add_dimension();
    dimension->set_name(name); dimension->set_capacity(20); dimension->set_fix_start_cumul_to_zero(true);
    auto* matrix = dimension->mutable_transit_matrix(); matrix->set_dimension(5); matrix->set_routing_indices(true); matrix->set_unary(name == "unary");
    for (int i = 0; i < 25; ++i) matrix->add_values(1);
  }
  auto* soft = request.add_operations()->mutable_set_cumul_soft_bound();
  soft->set_dimension_name("costly"); soft->set_index(1); soft->set_bound(2); soft->set_coefficient(1);
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_UNARY_DIMENSIONS);
  auto result = Reply(request).model_inspection();
  Expect(result.dimension_indices_size() == 1 && result.dimension_indices(0) == 0, "Native unary metadata distinguishes equal-valued binary evaluators");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_SOFT_OR_SPAN_DIMENSIONS);
  result = Reply(request).model_inspection();
  Expect(result.dimension_indices_size() == 1 && result.dimension_indices(0) == 2, "Native classification returns native dimension indices");
  request.clear_model_query();
  auto* dimension = request.mutable_dimension_query(); dimension->set_kind(bridge::ROUTING_DIMENSION_QUERY_IS_UNARY); dimension->set_dimension_name("unary");
  Expect(Reply(request).dimension_inspection().value() == 1, "Individual unary predicate is forwarded");
  dimension->set_dimension_name("binary");
  Expect(Reply(request).dimension_inspection().has_value() && Reply(request).dimension_inspection().value() == 0, "Individual false remains present");
}

void InspectsNativeVehicleRelationships() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* equality = request.add_operations()->mutable_add_linear_constraint(); equality->set_comparison(1);
  for (auto [expression, index] : {std::pair{equality->mutable_left(), 1}, std::pair{equality->mutable_right(), 2}}) {
    auto* term = expression->add_terms(); term->set_coefficient(1);
    term->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_VEHICLE); term->mutable_variable()->set_index(index);
  }
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_SAME_VEHICLE_INDICES); query->set_index(1);
  const auto group = Reply(request).model_inspection();
  Expect(group.indices_size() == 2 && group.indices(0) == 1 && group.indices(1) == 2, "Native equality groups preserved");
  query->set_index(4);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "End index cannot index same-vehicle groups");
  request.clear_operations(); request.set_num_vehicles(3); request.clear_starts(); request.clear_ends();
  for (int v = 0; v < 3; ++v) { request.add_starts(0); request.add_ends(0); }
  auto* fixed = request.add_operations()->mutable_set_fixed_vehicle_cost(); fixed->set_vehicle(2); fixed->set_cost(7);
  query->set_kind(bridge::ROUTING_MODEL_QUERY_VEHICLES_OF_SAME_CLASS); query->set_index(0);
  const auto vehicles = Reply(request).model_inspection();
  Expect(vehicles.indices_size() == 2 && vehicles.indices(0) == 0 && vehicles.indices(1) == 1, "Equivalent vehicles in native order");
  query->set_index(1);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Customer index cannot locate vehicle class");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_SAME_VEHICLE_CLASS_ARCS); query->set_index(0); query->set_other_index(1);
  auto arcs = Reply(request).model_inspection();
  Expect(arcs.groups_size() == 2 && arcs.groups(0).indices(0) == 0 && arcs.groups(1).indices(0) == 4 && arcs.groups(1).indices(1) == 1,
    "Native equivalent start arcs use routing indices");
  query->set_index(1); query->set_other_index(2); arcs = Reply(request).model_inspection();
  Expect(arcs.groups_size() == 1 && arcs.groups(0).indices(0) == 1 && arcs.groups(0).indices(1) == 2,
    "Ordinary arc returns itself, matching the implementation");
  query->set_index(999);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Invalid raw arc index rejects safely");
}

void InspectsNativeNodePrecedenceLayers() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  for (const std::string name : {"empty", "first", "second"}) {
    auto* dimension = request.add_operations()->mutable_add_constant_dimension();
    dimension->set_name(name); dimension->set_value(1); dimension->set_capacity(20); dimension->set_fix_start_cumul_to_zero(true);
  }
  const auto add = [&](const std::string& dimension, int first, int second, int offset) {
    auto* precedence = request.add_operations()->mutable_add_node_precedence();
    precedence->set_dimension_name(dimension); precedence->set_first(first); precedence->set_second(second); precedence->set_offset(offset);
  };
  add("first", 1, 3, 1); add("first", 2, 3, 5); add("second", 3, 1, 0);
  request.mutable_model_query()->set_kind(bridge::ROUTING_MODEL_QUERY_SORTED_NODE_PRECEDENCES);
  auto data = Reply(request).model_inspection();
  Expect(data.precedence_groups_size() == 2 && data.precedence_groups(0).groups_size() == 2 &&
    data.precedence_groups(0).groups(0).indices(0) == 2 && data.precedence_groups(0).groups(0).indices(1) == 1 &&
    data.precedence_groups(0).groups(1).indices(0) == 3 && data.precedence_groups(1).groups(0).indices(0) == 3,
    "Native layers preserve dimension filtering and offset ordering");
  add("first", 3, 2, 0); data = Reply(request).model_inspection();
  Expect(data.precedence_groups_size() == 2 && data.precedence_groups(0).groups_size() == 0 &&
    data.precedence_groups(1).groups_size() == 2, "Cyclic dimension retains empty native layers in its position");
}

void InspectsNativeVehicleClassesAndVisitRelationships() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_VEHICLE_CLASSES_COUNT);
  Expect(Reply(request).model_inspection().value() == 1, "One native vehicle class");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_VEHICLE_CLASS); query->set_vehicle_or_class(0);
  const int vehicle_class = Reply(request).model_inspection().value();
  query->set_kind(bridge::ROUTING_MODEL_QUERY_VEHICLE_OF_CLASS); query->set_vehicle_or_class(vehicle_class);
  Expect(Reply(request).model_inspection().value() == 0, "Native representative vehicle");
  query->set_vehicle_or_class(999);
  Expect(Reply(request).model_inspection().value() == -1, "Unknown class preserves native sentinel");
  query->set_vehicle_or_class(-1);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Negative class rejects before native indexing");
  for (int index : {1, 2, 3}) {
    auto* type = request.add_operations()->mutable_set_visit_type(); type->set_index(index); type->set_type(index - 1);
  }
  auto* requirement = request.add_operations()->mutable_add_type_requirement();
  requirement->set_dependent_type(1); requirement->add_required_type_alternatives(0);
  query->set_kind(bridge::ROUTING_MODEL_QUERY_VISIT_TYPE_COMPONENTS);
  const auto components = Reply(request).model_inspection();
  Expect(components.groups_size() == 3 && components.groups(0).indices_size() == 2 &&
    components.groups(0).indices(0) == 0 && components.groups(0).indices(1) == 1 &&
    components.groups(1).indices(0) == 2 && components.groups(2).indices_size() == 0,
    "Native component order and trailing empty groups preserved");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_SORTED_VISIT_TYPES);
  const auto sorted = Reply(request).model_inspection();
  Expect(sorted.groups_size() == 2 && sorted.groups(0).indices(0) == 0 && sorted.groups(1).indices(0) == 1,
    "Native ordering contains only types in requirements");
  requirement = request.add_operations()->mutable_add_type_requirement();
  requirement->set_dependent_type(0); requirement->add_required_type_alternatives(1);
  Expect(Reply(request).model_inspection().groups_size() == 0, "Cyclic native requirements have no topological order");
}

void InspectsNativeVisitTypeMembership() {
  bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
  auto* pickups = request.add_operations()->mutable_add_disjunction(); pickups->add_indices(1); pickups->add_indices(2); pickups->set_penalty(100); pickups->set_max_cardinality(1);
  auto* deliveries = request.add_operations()->mutable_add_disjunction(); deliveries->add_indices(3); deliveries->set_penalty(100); deliveries->set_max_cardinality(1);
  auto* pair = request.add_operations()->mutable_add_pickup_and_delivery_sets(); pair->set_pickup_disjunction(0); pair->set_delivery_disjunction(1);
  auto* type = request.add_operations()->mutable_set_visit_type(); type->set_index(1); type->set_type(0);
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_PAIR_INDICES_OF_TYPE); query->set_vehicle_or_class(0);
  const auto result = Reply(request).model_inspection();
  Expect(result.indices_size() == 1 && result.indices(0) == 0, "Set alternatives belong to their native pair");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_SINGLE_NODES_OF_TYPE);
  Expect(Reply(request).model_inspection().indices_size() == 0, "Pickup alternatives are not singletons");
  query->set_vehicle_or_class(1);
  Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Invalid visit type rejects before native indexing");
}

void ForwardsNativePrecedencePresence() {
  for (int relationship = 0; relationship < 4; ++relationship) {
    bridge::RoutingBridgeRequest request; Expect(request.ParseFromString(Request().payload), "Base request parses");
    auto* dimension = request.add_operations()->mutable_add_constant_dimension(); dimension->set_name("order"); dimension->set_value(1); dimension->set_capacity(20); dimension->set_fix_start_cumul_to_zero(true);
    for (int index : {1, 2, 3}) {
      auto* optional = request.add_operations()->mutable_add_disjunction(); optional->add_indices(index); optional->set_penalty(100); optional->set_max_cardinality(1);
    }
    auto* precedence = request.add_operations()->mutable_add_node_precedence(); precedence->set_dimension_name("order"); precedence->set_first(1); precedence->set_second(2); precedence->set_offset(1); precedence->set_performed_constraint(relationship);
    request.set_read_assignment_only(true);
    for (int mask = 0; mask < 4; ++mask) {
      request.clear_initial_assignment(); auto* initial = request.mutable_initial_assignment(); initial->set_ignore_inactive_indices(true); auto* route = initial->add_routes();
      if (mask & 1) route->add_indices(1);
      if (mask & 2) route->add_indices(2);
      const bool expected = relationship == 0 || (relationship == 1 && mask != 2) || (relationship == 2 && mask != 1) || (relationship == 3 && (mask == 0 || mask == 3));
      Expect(Reply(request).has_solution() == expected, "Native precedence presence truth table");
    }
    // Reacquire after adding operations, which may move protobuf entries.
    precedence = request.mutable_operations(4)->mutable_add_node_precedence();
    precedence->set_performed_constraint(4);
    Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "Invalid native presence enum rejects");
    precedence->set_performed_constraint(0); precedence->set_second(4);
    Expect(!Execute({1,"routing",request.SerializeAsString()}).ok, "End indices have no active variable for precedence");
  }
}

void SimplifiesNativeForcedZeroDisjunctions() {
  for (int behavior : {0, 1}) {
    bridge::RoutingBridgeRequest request;
    request.ParseFromString(Request().payload);
    for (int i = 0; i < request.mutable_transit_matrix()->values_size(); ++i) request.mutable_transit_matrix()->set_values(i, 0);
    auto* disjunction = request.add_operations()->mutable_add_disjunction();
    for (int index : {1, 2, 3}) disjunction->add_indices(index);
    const int64_t exact = (int64_t{1} << 53) + 1;
    disjunction->set_penalty(exact); disjunction->set_max_cardinality(2); disjunction->set_penalty_cost_behavior(behavior);
    for (int index : {1, 2, 3}) {
      auto* active = request.add_operations()->mutable_set_active_values(); active->set_index(index); active->add_values(0);
    }
    Expect(Reply(request).objective_value() == exact * (behavior == 0 ? 1 : 2), "No implicit disjunction simplification");
    request.add_operations()->set_ignore_disjunctions_already_forced_to_zero(true);
    const auto result = Reply(request);
    Expect(result.has_solution() && result.objective_value() == 0, "Explicit simplification removes native penalties for both behaviors");
    request.mutable_model_query()->set_kind(bridge::ROUTING_MODEL_QUERY_DISJUNCTION_MAX_CARDINALITY);
    Expect(Reply(request).model_inspection().value() == 0, "Native inspection returns mutated cardinality");
    request.mutable_model_query()->set_kind(bridge::ROUTING_MODEL_QUERY_HAS_MAX_CARDINALITY_CONSTRAINED_DISJUNCTIONS);
    Expect(Reply(request).model_inspection().value() == 1, "Native flag reflects zero cardinality");
    request.mutable_model_query()->set_kind(bridge::ROUTING_MODEL_QUERY_DISJUNCTION_MAX_CARDINALITY);
    request.mutable_model_query()->set_index(1);
    Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid native disjunction inspection rejects");
  }
}

void PreservesForcedZeroConstructionOrder() {
  bridge::RoutingBridgeRequest request;
  request.ParseFromString(Request().payload);
  for (int i = 0; i < request.mutable_transit_matrix()->values_size(); ++i) request.mutable_transit_matrix()->set_values(i, 0);
  auto* disjunction = request.add_operations()->mutable_add_disjunction();
  for (int index : {1, 2, 3}) disjunction->add_indices(index);
  disjunction->set_penalty(50);
  request.add_operations()->set_ignore_disjunctions_already_forced_to_zero(true);
  for (int index : {1, 2, 3}) {
    auto* active = request.add_operations()->mutable_set_active_values(); active->set_index(index); active->add_values(0);
  }
  Expect(Reply(request).objective_value() == 50, "Later domain changes do not alter earlier simplification");
  request.add_operations()->set_ignore_disjunctions_already_forced_to_zero(true);
  Expect(Reply(request).objective_value() == 0, "A subsequent explicit operation sees the updated native domains");
  auto* mandatory = request.add_operations()->mutable_add_disjunction(); mandatory->add_indices(1);
  Expect(!Reply(request).has_solution(), "New mandatory disjunctions are not silently simplified");
  request.add_operations()->set_ignore_disjunctions_already_forced_to_zero(true);
  Expect(Reply(request).has_solution(), "Explicit native operation can also simplify mandatory disjunctions");
}

void QueriesNativeDimensionMetadata() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 3, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  const int positive = model.RegisterTransitCallback([](int64_t, int64_t) { return 1; }, RoutingModel::kTransitEvaluatorSignPositiveOrZero);
  const int negative = model.RegisterTransitCallback([](int64_t, int64_t) { return -1; }, RoutingModel::kTransitEvaluatorSignNegativeOrZero);
  const int unknown = model.RegisterTransitCallback([](int64_t, int64_t) { return 1; });
  model.AddDimensionWithVehicleTransits({positive, negative, unknown}, 0, 100, false, "time");
  model.CloseModelWithParameters(DefaultRoutingSearchParameters());
  for (int vehicle = 0; vehicle < 3; ++vehicle) {
    auto* time = model.GetMutableDimension("time");
    Expect(ortools_wasm::InspectRoutingDimension(model, "time", 11, 0, 0, vehicle, 0, 0).value == time->AreVehicleTransitsPositive(vehicle), "Native positive flag");
    Expect(ortools_wasm::InspectRoutingDimension(model, "time", 12, 0, 0, vehicle, 0, 0).value == time->GetTransitEvaluatorSign(vehicle), "Native sign metadata");
  }
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_name("time"); dimension->set_value(1); dimension->set_capacity(std::numeric_limits<int64_t>::max());
  auto* precedence = request.add_operations()->mutable_add_node_precedence();
  precedence->set_dimension_name("time"); precedence->set_first(1); precedence->set_second(2);
  precedence->set_offset(-9007199254740993LL); precedence->set_performed_constraint(3);
  auto* query = request.mutable_dimension_query(); query->set_dimension_name("time");
  query->set_kind(bridge::ROUTING_DIMENSION_QUERY_NODE_PRECEDENCES);
  auto response = Reply(request);
  Expect(response.dimension_inspection().node_precedences_size() == 1, "Native precedence list");
  const auto& record = response.dimension_inspection().node_precedences(0);
  Expect(record.first() == 1 && record.second() == 2 && record.offset() == -9007199254740993LL && record.performed_constraint() == 3, "Owned exact precedence records");
  query->set_kind(bridge::ROUTING_DIMENSION_QUERY_TRANSIT_SIGN);
  Expect(Reply(request).dimension_inspection().value() == RoutingModel::kTransitEvaluatorSignPositiveOrZero, "Server sign metadata");
  query->set_kind(bridge::ROUTING_DIMENSION_QUERY_TRANSITS_POSITIVE);
  Expect(Reply(request).dimension_inspection().value() == 1, "Server positive flag");
  query->set_vehicle_or_class(1);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid native inspection vehicle rejects safely");
  query->set_vehicle_or_class(0); query->set_kind(bridge::ROUTING_DIMENSION_QUERY_PICKUP_DELIVERY_LIMIT); query->set_pair_index(100);
  Expect(Reply(request).dimension_inspection().value() == std::numeric_limits<int64_t>::max(), "Native unset pair limit sentinel");
}

void QueriesNativeModelClassification() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 2, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  const int transit = model.RegisterUnaryTransitCallback([](int64_t index) { return index == 0 ? 0 : 1; });
  model.AddDimension(transit, 0, 1, true, "capacity"); model.CloseModel();
  Expect(ortools_wasm::InspectRoutingModel(model, 29, 0, 0, 0, 0).value == 1, "Native matching model");
  auto parameters = DefaultRoutingSearchParameters();
  Expect(ortools_wasm::InspectRoutingModel(model, 30, 0, 0, 0, 0, {}, 0, &parameters).value == 0, "Independent native routes");
  parameters.set_local_search_metaheuristic(LocalSearchMetaheuristic::TABU_SEARCH);
  Expect(ortools_wasm::InspectRoutingModel(model, 30, 0, 0, 0, 0, {}, 0, &parameters).value == 1, "Native tabu route coupling");
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_IS_MATCHING_MODEL);
  Expect(Reply(request).model_inspection().value() == 0, "Plain bridge model is not matching");
  query->set_kind(bridge::ROUTING_MODEL_QUERY_ROUTES_INTERDEPENDENT);
  Expect(Reply(request).model_inspection().value() == 0, "Native default parameters through bridge");
  parameters.set_local_search_metaheuristic(LocalSearchMetaheuristic::GENERIC_TABU_SEARCH);
  request.set_search_parameters_proto(parameters.SerializeAsString());
  request.add_search_parameter_fields("local_search_metaheuristic");
  Expect(Reply(request).model_inspection().value() == 1, "Search parameters reach native bridge query");
}

void QueriesNativeArcComparisonAndSlack() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 1, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  const int fixed = model.RegisterTransitCallback([](int64_t, int64_t) { return 1; });
  const int dependent = model.RegisterStateDependentTransitCallback([](int64_t, int64_t) {
    return RoutingModel::MakeStateDependentTransit([](int64_t) { return 2; }, 0, 101);
  });
  model.AddDimensionDependentDimensionWithVehicleCapacity(fixed, dependent, nullptr, 10, {100}, true, "time");
  auto* time = model.GetMutableDimension("time"); time->CumulVar(1)->SetMin(6);
  model.CloseModel();
  const auto* answer = model.ReadAssignmentFromRoutes({{1, 2}}, false);
  Expect(answer != nullptr, "Self-dependent native assignment");
  Expect(ortools_wasm::InspectRoutingShortestTransitionSlack(model, "time", 0, answer) == 3, "Native nonzero shortest slack");
  Expect(ortools_wasm::InspectRoutingShortestTransitionSlack(model, "time", 2, answer) == 0, "Native end-arc slack");
  for (int index : {1, static_cast<int>(model.End(0))}) {
    bool rejected = false;
    try { ortools_wasm::InspectRoutingShortestTransitionSlack(model, "time", index, answer); }
    catch (const std::invalid_argument&) { rejected = true; }
    Expect(rejected, "Unbound current cumul and end index reject before fatal native access");
  }
  Expect(ortools_wasm::InspectRoutingShortestTransitionSlack(model, "time", 0, answer) == 3, "Search state cleaned after rejection");
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* query = request.mutable_model_query(); query->set_kind(bridge::ROUTING_MODEL_QUERY_ARC_MORE_CONSTRAINED);
  query->set_index(0); query->set_other_index(1); query->set_third_index(3);
  Expect(Reply(request).model_inspection().value() == 1, "Native customer preferred over end through bridge");
  query->set_other_index(3); query->set_third_index(1);
  Expect(Reply(request).model_inspection().value() == 0, "Native comparison direction through bridge");
  query->set_third_index(100);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Invalid third index rejected");
  request.clear_model_query();
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_name("time"); dimension->set_value(1); dimension->set_capacity(100);
  request.mutable_dimension_query()->set_dimension_name("time");
  request.mutable_dimension_query()->set_kind(bridge::ROUTING_DIMENSION_QUERY_SHORTEST_TRANSITION_SLACK);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Missing slack assignment rejects");
}

void TransfersNativeAssignmentAcrossModels() {
  using namespace operations_research;
  RoutingIndexManager manager(3, 2, RoutingIndexManager::NodeIndex(0));
  RoutingModel source(manager);
  source.SetArcCostEvaluatorOfAllVehicles(source.RegisterTransitCallback([](int64_t, int64_t) { return 1; }));
  source.CloseModel();
  const auto* original = source.ReadAssignmentFromRoutes({{1}, {2}}, false);
  Expect(original != nullptr, "Source native routes");
  std::vector<int64_t> next, vehicles;
  for (int i = 0; i < source.Size(); ++i) next.push_back(original->Value(source.NextVar(i)));
  for (int i = 0; i < manager.num_indices(); ++i) vehicles.push_back(original->Value(source.VehicleVar(i)));
  for (bool heterogeneous : {false, true}) {
    RoutingModel target(manager);
    target.SetArcCostEvaluatorOfAllVehicles(target.RegisterTransitCallback([](int64_t, int64_t) { return 2; }));
    if (heterogeneous) target.SetArcCostEvaluatorOfVehicle(target.RegisterTransitCallback([](int64_t, int64_t) { return 3; }), 1);
    target.AddConstantDimension(5, 100, true, "target_time"); target.CloseModel();
    Assignment native(target.solver());
    target.SetAssignmentFromOtherModelAssignment(&native, &source, original);
    const auto seed = ortools_wasm::TransferRoutingAssignment(target, manager, next, vehicles);
    Expect(seed.variables.size() == target.Size() + (heterogeneous ? manager.num_indices() : 0), "Native route-variable selection");
    Expect(seed.objective_min == native.ObjectiveMin() && seed.objective_max == native.ObjectiveMax(), "Native unbound objective range");
    Assignment transported(target.solver());
    ortools_wasm::SetRoutingAssignmentObjective(target, transported, std::nullopt, seed.objective_min, seed.objective_max);
    for (const auto& value : seed.variables) {
      auto* variable = value.kind == 3 ? target.NextVar(value.index) : target.VehicleVar(value.index);
      Expect(value.value == native.Value(variable), "Transferred values match native helper");
      transported.Add(variable)->SetValue(value.value);
    }
    const auto* restored = target.RestoreAssignment(transported);
    Expect(restored && restored->ObjectiveValue() == (heterogeneous ? 10 : 8), "Target costs are evaluated on restoration");
    Expect(restored->Value(target.GetDimensionOrDie("target_time").CumulVar(target.End(0))) == 10, "Target schedule is recomputed");
    if (heterogeneous) {
      bool rejected = false;
      try { ortools_wasm::TransferRoutingAssignment(target, manager, next, {}); }
      catch (const std::invalid_argument&) { rejected = true; }
      Expect(rejected, "Heterogeneous transfer requires source vehicle values");
    }
  }
}

void TransportsPartialRoutingSeedsWithoutInventingObjectives() {
  bridge::RoutingBridgeRequest request; request.ParseFromString(Request().payload);
  auto* input = request.mutable_assignment_transfer();
  for (int value : {1, 2, 3, 4}) input->add_next_values(value);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_name("target_time"); dimension->set_value(3); dimension->set_capacity(100); dimension->set_fix_start_cumul_to_zero(true);
  request.add_dimension_names("target_time");
  const auto response = Reply(request);
  Expect(response.has_assignment_seed() && !response.has_solution(), "Transfer returns a seed, not a solution");
  const auto& seed = response.assignment_seed();
  Expect(seed.variables_size() == 4 && seed.intervals_size() == 0 && !seed.has_objective_value(), "Seed contains only copied route values");
  Expect(seed.has_objective_min() && seed.has_objective_max() && seed.objective_min() == std::numeric_limits<int64_t>::min()
      && seed.objective_max() == std::numeric_limits<int64_t>::max(), "Exact native unbound objective range");
  auto restored_request = request;
  restored_request.clear_assignment_transfer(); restored_request.set_read_assignment_only(true);
  restored_request.mutable_initial_assignment()->mutable_snapshot()->CopyFrom(seed);
  auto restored = Reply(restored_request);
  Expect(restored.has_solution() && restored.objective_value() == 6 && restored.dimensions_size() == 1
      && restored.dimensions(0).cumul_values(4) == 12, "Restoration yields an evaluated target solution");
  auto malformed = restored_request;
  malformed.mutable_initial_assignment()->mutable_snapshot()->clear_objective_max();
  Expect(!Execute({1, "routing", malformed.SerializeAsString()}).ok, "Incomplete objective ranges reject safely");
  restored_request.set_read_assignment_only(false); restored_request.set_assignment_action(bridge::ROUTING_ASSIGNMENT_ACTION_FAST_SOLVE);
  auto fast = Execute({1, "routing", restored_request.SerializeAsString()});
  Expect(!fast.ok && fast.error_message.find("restored assignment") != std::string::npos, "Unchecked fast solving rejects unbound route seeds before serialization");
  input->mutable_next_values()->RemoveLast();
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Malformed route-seed dimensions reject safely");
  input->add_next_values(5);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Out-of-range successors reject safely");
  input->set_next_values(3, 4); input->add_vehicle_values(0);
  Expect(!Execute({1, "routing", request.SerializeAsString()}).ok, "Malformed vehicle-vector dimensions reject safely");
}

void SharedBuilderOwnsManagersCallbacksAndSecondaryModels() {
  using Builder = ortools_wasm::RoutingModelBuilder;
  auto manager = Builder::CreateManager(4, 1, {0}, {0});
  std::weak_ptr<Builder::Manager> manager_lifetime = manager;
  auto model_parameters = operations_research::DefaultRoutingModelParameters();
  model_parameters.set_max_callback_cache_size(0);
  auto primary = std::make_shared<Builder>(manager, model_parameters);
  auto secondary = std::make_shared<Builder>(manager);
  std::weak_ptr<Builder> secondary_lifetime = secondary;
  bool primary_destroyed_before_secondary = false;
  struct CallbackLifetime {
    std::weak_ptr<Builder> secondary;
    bool* observed;
    ~CallbackLifetime() { *observed = !secondary.expired(); }
  };
  auto callback = std::make_shared<CallbackLifetime>();
  std::weak_ptr<CallbackLifetime> callback_lifetime = callback;
  callback->secondary = secondary;
  callback->observed = &primary_destroyed_before_secondary;
  const int evaluator = primary->RegisterTransitCallback([callback](int64_t from, int64_t to) {
    return from == to ? int64_t{0} : int64_t{1};
  });
  callback.reset();
  primary->SetArcCostEvaluator(evaluator);
  primary->SetSecondaryModel(secondary, operations_research::DefaultRoutingSearchParameters());
  secondary.reset();
  manager.reset();
  Expect(!manager_lifetime.expired() && !secondary_lifetime.expired() && !callback_lifetime.expired(),
      "Builder retains manager, callback storage and secondary independently of adapter handles");
  Expect(primary->AddDimension(evaluator, 0, 100, true, "time"),
      "Attaching a secondary leaves the primary open for subsequent construction");
  primary.reset();
  Expect(primary_destroyed_before_secondary,
      "Primary native callback storage is destroyed while its secondary remains alive");
  Expect(secondary_lifetime.expired() && manager_lifetime.expired() && callback_lifetime.expired(),
      "Destroying the builder releases callbacks, secondary models and managers");
}

void SharedBuilderPreservesConstructionOrderAndDimensions() {
  using Builder = ortools_wasm::RoutingModelBuilder;
  auto manager = Builder::CreateManager(4, 1, {0}, {0});
  Builder state(manager);
  const int dimension = manager->num_indices();
  std::vector<int64_t> matrix(dimension * dimension);
  for (int from = 0; from < dimension; ++from) for (int to = 0; to < dimension; ++to)
    matrix[from * dimension + to] = std::abs(manager->IndexToNode(from).value() - manager->IndexToNode(to).value());
  const int evaluator = state.RegisterIndexMatrix(std::move(matrix), dimension, false);
  state.SetArcCostEvaluator(evaluator);
  Expect(state.AddDimensionWithVehicleTransitAndCapacity({evaluator}, 0, {100}, true, "time"),
      "Shared construction uses registered evaluators and vehicle capacities");
  Expect(!state.AddDimension(evaluator, 0, 100, true, "time"), "Duplicate dimensions preserve native failure");
  Expect(state.AddPickupAndDelivery(1, 2) && state.AddVehicleEquality(1, 2) && state.AddCumulLessOrEqual("time", 1, 2),
      "Shared pickup/delivery constraints use dimensions created earlier");
  Expect(state.SetAllowedVehicles(1, {0}) && state.SetVehicleValues(2, {0}), "Shared vehicle domains apply before solving");
  auto parameters = operations_research::DefaultRoutingSearchParameters();
  parameters.set_first_solution_strategy(operations_research::FirstSolutionStrategy::PATH_CHEAPEST_ARC);
  parameters.set_solution_limit(1);
  const auto* assignment = state.model->SolveWithParameters(parameters);
  Expect(assignment && assignment->ObjectiveValue() == 6, "Shared construction preserves the deterministic model objective");
  Expect(!state.SetAllowedVehicles(-1, {0}) && !state.AddPickupAndDelivery(state.model->End(0), 1),
      "Shared construction rejects invalid visit indices");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SharedBuilderOwnsManagersCallbacksAndSecondaryModels", SharedBuilderOwnsManagersCallbacksAndSecondaryModels},
      {"SharedBuilderPreservesConstructionOrderAndDimensions", SharedBuilderPreservesConstructionOrderAndDimensions},
      {"SimplifiesNativeForcedZeroDisjunctions", SimplifiesNativeForcedZeroDisjunctions},
      {"PreservesForcedZeroConstructionOrder", PreservesForcedZeroConstructionOrder},
      {"InspectsNativeVehicleRelationships", InspectsNativeVehicleRelationships},
      {"InspectsNativeNodePrecedenceLayers", InspectsNativeNodePrecedenceLayers},
      {"InspectsNativeVehicleClassesAndVisitRelationships", InspectsNativeVehicleClassesAndVisitRelationships},
      {"InspectsNativeVisitTypeMembership", InspectsNativeVisitTypeMembership},
      {"ForwardsNativePrecedencePresence", ForwardsNativePrecedencePresence},
      {"InspectsNativeCostClasses", InspectsNativeCostClasses},
      {"InspectsNativeUnperformedPenalties", InspectsNativeUnperformedPenalties},
      {"InspectsNativeDimensionClassification", InspectsNativeDimensionClassification},
      {"BindsNativeGenericTabuVariables", BindsNativeGenericTabuVariables},
      {"BindsNativeSweepAndOrderedActivity", BindsNativeSweepAndOrderedActivity},
      {"ForwardsNativePiecewiseCumulCosts", ForwardsNativePiecewiseCumulCosts},
      {"QueriesNativeDimensionClassesAndIntervals", QueriesNativeDimensionClassesAndIntervals},
      {"QueriesNativeDimensionMetadata", QueriesNativeDimensionMetadata},
      {"QueriesNativeModelClassification", QueriesNativeModelClassification},
      {"QueriesNativeArcComparisonAndSlack", QueriesNativeArcComparisonAndSlack},
      {"TransfersNativeAssignmentAcrossModels", TransfersNativeAssignmentAcrossModels},
      {"TransportsPartialRoutingSeedsWithoutInventingObjectives", TransportsPartialRoutingSeedsWithoutInventingObjectives},
      {"ReportsNativeSearchEntryBeforeSolutions", ReportsNativeSearchEntryBeforeSolutions},
      {"QueriesNativePickupDeliverySibling", QueriesNativePickupDeliverySibling},
      {"EvaluatesNativeCustomRouteCost", EvaluatesNativeCustomRouteCost},
      {"RoutesCallbacksThroughNativeSearch", RoutesCallbacksThroughNativeSearch},
      {"InspectsPickupDeliveryAndBreakConfiguration", InspectsPickupDeliveryAndBreakConfiguration},
      {"UsesDedicatedFirstSolutionEvaluator", UsesDedicatedFirstSolutionEvaluator},
      {"UsesPrimaryConstrainedDimension", UsesPrimaryConstrainedDimension},
      {"InspectsNativeCumulOptimizers", InspectsNativeCumulOptimizers},
      {"ChecksNativeAssignmentFeasibility", ChecksNativeAssignmentFeasibility},
      {"CompactionUpdatesCapturedVehicleActivity", CompactionUpdatesCapturedVehicleActivity},
      {"FastSolveDoesNotExposeFailedCpCandidates", FastSolveDoesNotExposeFailedCpCandidates},
      {"DispatchesIlsWithNativeCompletionStatus", DispatchesIlsWithNativeCompletionStatus},
      {"SerializesCollectedSolutionsAndNativeStatistics", SerializesCollectedSolutionsAndNativeStatistics},
      {"PreservesPackingOutcomesAndOwnsCompaction", PreservesPackingOutcomesAndOwnsCompaction},
      {"ComputesNativeLowerBoundWithUnsupportedZero", ComputesNativeLowerBoundWithUnsupportedZero},
      {"AssignsRoutingResourcesNatively", AssignsRoutingResourcesNatively},
      {"ConstrainsResourceVariablesNatively", ConstrainsResourceVariablesNatively},
      {"InspectsNativeResourceAttributesAndClasses", InspectsNativeResourceAttributesAndClasses},
      {"ReifiesNativeBooleanExpressions", ReifiesNativeBooleanExpressions},
      {"CreatesNativeNonlinearExpressions", CreatesNativeNonlinearExpressions},
      {"AppliesSuccessorDomainsAndPreservesRouteFeasibility", AppliesSuccessorDomainsAndPreservesRouteFeasibility},
      {"RejectsMalformedSuccessorDomains", RejectsMalformedSuccessorDomains},
      {"RejectsInvalidConstraintIndices", RejectsInvalidConstraintIndices},
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReoptimizesNativeFirstSolutionsWithSecondaryModel", ReoptimizesNativeFirstSolutionsWithSecondaryModel},
      {"ValidatesSecondaryModelContractsAndThreadBudgets", ValidatesSecondaryModelContractsAndThreadBudgets},
      {"SelectsNativePickupDeliveryAlternativesAndLimits", SelectsNativePickupDeliveryAlternativesAndLimits},
      {"RejectsCpSatFallbackWithoutPickupDeliveryLimits", RejectsCpSatFallbackWithoutPickupDeliveryLimits},
      {"AppliesNativeLocksAndPreservesPreassignment", AppliesNativeLocksAndPreservesPreassignment},
      {"RestoresNativeSnapshotsAndUsesFirstSolutionHints", RestoresNativeSnapshotsAndUsesFirstSolutionHints},
      {"ReportsOptedInUncheckedNeighbors", ReportsOptedInUncheckedNeighbors},
      {"DeliversLiveSolutionsAndCancelsNormalAndWarmSearch", DeliversLiveSolutionsAndCancelsNormalAndWarmSearch},
      {"AppliesModelParametersAndReturnsActualProfile", AppliesModelParametersAndReturnsActualProfile},
      {"PreservesSparseParameterDefaultsAndExplicitValues", PreservesSparseParameterDefaultsAndExplicitValues},
      {"StopsGuidedLocalSearchAtTimeLimit", StopsGuidedLocalSearchAtTimeLimit},
      {"ReservesNestedCpSatWorkers", ReservesNestedCpSatWorkers},
      {"BindsAutomaticWorkersToAllocatedBudget", BindsAutomaticWorkersToAllocatedBudget},
      {"ReservesOneThread", ReservesOneThread},
      {"PreservesVehicleAndRoutingIndexCosts", PreservesVehicleAndRoutingIndexCosts},
      {"RestoresValidatedAssignmentsAndCumulRanges", RestoresValidatedAssignmentsAndCumulRanges},
      {"SerializesNativeVehicleValues", SerializesNativeVehicleValues},
      {"AppliesCumulBounds", AppliesCumulBounds},
      {"AppliesVehicleEligibilityAndNativeConstrainedStrategy", AppliesVehicleEligibilityAndNativeConstrainedStrategy},
      {"AppliesVehicleDomainsAndForcedOptionalActivity", AppliesVehicleDomainsAndForcedOptionalActivity},
      {"ReturnsNativeAutomaticStrategyAndAppliesNodePrecedence", ReturnsNativeAutomaticStrategyAndAppliesNodePrecedence},
      {"RejectsInvalidDimensions", RejectsInvalidDimensions},
      {"AppliesSerializedModelOperations", AppliesSerializedModelOperations},
      {"RefinesSerializedInitialAssignment", RefinesSerializedInitialAssignment},
  };
  for (const auto& [name, test] : tests) {
    try { test(); std::cout << "[PASS] " << name << '\n'; }
    catch (const std::exception& error) { std::cerr << "[FAIL] " << name << ": " << error.what() << '\n'; return EXIT_FAILURE; }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
