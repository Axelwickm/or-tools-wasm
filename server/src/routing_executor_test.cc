#include "server/src/routing_test_helpers.h"
#include "server/src/routing_executor.h"

#include <future>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "routing.pb.h"
#include "javascript/routing_search_parameters.h"
#include "ortools/constraint_solver/routing_enums.pb.h"
#include "ortools/util/optional_boolean.pb.h"
#include <chrono>
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

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

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"AssignsRoutingResourcesNatively", AssignsRoutingResourcesNatively},
      {"ConstrainsResourceVariablesNatively", ConstrainsResourceVariablesNatively},
      {"InspectsNativeResourceAttributesAndClasses", InspectsNativeResourceAttributesAndClasses},
      {"ReifiesNativeBooleanExpressions", ReifiesNativeBooleanExpressions},
      {"CreatesNativeNonlinearExpressions", CreatesNativeNonlinearExpressions},
      {"AppliesSuccessorDomainsAndPreservesRouteFeasibility", AppliesSuccessorDomainsAndPreservesRouteFeasibility},
      {"RejectsMalformedSuccessorDomains", RejectsMalformedSuccessorDomains},
      {"RejectsInvalidConstraintIndices", RejectsInvalidConstraintIndices},
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
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
