#include "server/src/routing_test_helpers.h"
#include "server/src/routing_executor.h"
#include "server/src/job_scheduler.h"
#include "routing.pb.h"
#include "ortools/constraint_solver/routing.h"
#include "javascript/routing_dimension_construction.h"

#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <tuple>
#include <vector>

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
void Expect(bool value, const std::string& message) {
  if (!value) throw std::runtime_error(message);
}
bridge::RoutingBridgeRequest Request(int nodes = 3, int vehicles = 1) {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(nodes);
  request.set_num_vehicles(vehicles);
  SetRoutingFirstSolutionStrategy(&request, 3);
  for (int vehicle = 0; vehicle < vehicles; ++vehicle) { request.add_starts(0); request.add_ends(0); }
  auto* matrix = request.mutable_transit_matrix();
  matrix->set_dimension(nodes);
  for (int index = 0; index < nodes * nodes; ++index) matrix->add_values(1);
  return request;
}
void AddTime(bridge::RoutingBridgeRequest& request, int64_t slack = 10, int64_t capacity = 30) {
  auto* dimension = request.add_operations()->mutable_add_dimension();
  *dimension->mutable_transit_matrix() = request.transit_matrix();
  dimension->set_slack_max(slack);
  dimension->set_capacity(capacity);
  dimension->set_fix_start_cumul_to_zero(true);
  dimension->set_name("time");
  request.add_dimension_names("time");
}
void Next(bridge::RoutingBridgeRequest& request, int64_t index, int64_t next) {
  auto* value = request.add_operations()->mutable_set_next_values();
  value->set_index(index); value->add_values(next);
}
void Slack(bridge::RoutingBridgeRequest& request, int64_t index, int64_t lower, int64_t upper) {
  auto* value = request.add_operations()->mutable_set_slack_bounds();
  value->set_dimension_name("time"); value->set_index(index); value->set_lower(lower); value->set_upper(upper);
}
void Active(bridge::RoutingBridgeRequest& request, int64_t index, const std::vector<int>& values) {
  auto* value = request.add_operations()->mutable_set_active_values();
  value->set_index(index); for (int item : values) value->add_values(item);
}
void Setting(bridge::RoutingBridgeRequest& request, bridge::RoutingDimensionValueKind kind, int64_t cost, int vehicle = -1) {
  auto* value = request.add_operations()->mutable_set_dimension_value();
  value->set_dimension_name("time"); value->set_kind(kind); value->set_value(cost);
  if (vehicle != -1) value->set_vehicle(vehicle);
}
SolverExecutorResult Execute(const bridge::RoutingBridgeRequest& request) {
  RoutingExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    execution = executor.Execute({1, "routing", request.SerializeAsString()}, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}
bridge::RoutingBridgeResponse Response(const bridge::RoutingBridgeRequest& request) {
  const auto execution = Execute(request);
  Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "response parses");
  return response;
}
void AppliesWaitingAndRouteRestoration() {
  auto request = Request();
  AddTime(request);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 3);
  Slack(request, 0, 2, 2); Slack(request, 1, 4, 6); Slack(request, 1, 5, 7);
  Slack(request, 2, std::numeric_limits<int64_t>::min(), 0);
  auto* window = request.add_operations()->mutable_set_cumul_bounds();
  window->set_dimension_name("time"); window->set_index(2); window->set_lower(9); window->set_upper(9);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) {
      auto* route = current.mutable_initial_assignment()->add_routes(); route->add_indices(1); route->add_indices(2);
      current.set_read_assignment_only(kind == 2);
    }
    const auto response = Response(current);
    Expect(response.has_solution() && response.objective_value() == 3, "Waiting must preserve the arc-only objective");
    const auto& values = response.dimensions(0).cumul_values();
    Expect(values.Get(1) == 3 && values.Get(2) == 9 && values.Get(3) == 10, "Native waiting bounds intersect before normal/warm/restored solving");
  }
}
void AppliesOptionalActivityAndConflicts() {
  auto request = Request(4);
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 5;
  for (const auto [index, penalty] : std::vector<std::pair<int, int>>{{1, 7}, {2, 9}}) {
    auto* optional = request.add_operations()->mutable_add_disjunction(); optional->add_indices(index); optional->set_penalty(penalty);
  }
  Active(request, 1, {1, 0, 1}); Active(request, 1, {0}); Active(request, 2, {1});
  Next(request, 0, 2); Next(request, 2, 3); Next(request, 3, 4);
  const auto response = Response(request);
  Expect(response.has_solution() && response.objective_value() == 22 && response.next_values(1) == 1 && response.vehicle_values(1) == -1,
         "Active domains force optional drops/visits and retain exact penalties");
  auto* route = request.mutable_initial_assignment()->add_routes(); route->add_indices(2); route->add_indices(3);
  request.set_read_assignment_only(true);
  Expect(Response(request).has_solution(), "Route restoration respects activity restrictions");
  request.clear_initial_assignment(); request.set_read_assignment_only(false);
  for (int kind : {1, 3}) {
    auto current = Request(2);
    if (kind == 0) Active(current, 1, {});
    if (kind == 1) Active(current, 1, {0});
    if (kind == 2) Active(current, 0, {0});
    if (kind == 3) { Active(current, 1, {1}); Next(current, 1, 1); }
    const auto result = Response(current);
    if (kind == 1) Expect(result.has_solution() && result.next_values(1) == 1,
                          "Native ActiveVar zero removes a node even without a disjunction");
    else Expect(!result.has_solution(), "Activity conflicts with starts and successors safely fail");
  }
}
void AppliesDimensionCostsAndSpanLimits() {
  auto request = Request(4, 2);
  AddTime(request);
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 4;
  Next(request, 0, 1); Next(request, 1, 5); Next(request, 4, 2); Next(request, 2, 3); Next(request, 3, 6);
  Slack(request, 0, 2, 2); Slack(request, 1, 3, 3); Slack(request, 4, 1, 1); Slack(request, 2, 2, 2); Slack(request, 3, 0, 0);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_UPPER_BOUND, 6, 0);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_UPPER_BOUND, 7, 0);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_UPPER_BOUND, 6, 1);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_COST, 2, 0);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_COST, 5, 1);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SLACK_COST, 7, 0);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SLACK_COST, 3, 1);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_GLOBAL_SPAN_COST, 11);
  const auto response = Response(request);
  Expect(response.has_solution() && response.objective_value() == 185, "Objective includes arcs, per-vehicle span/slack and max global span costs");
  Expect(response.dimensions(0).cumul_values(5) == 7 && response.dimensions(0).cumul_values(6) == 6, "Vehicle span limits constrain both routes");
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_UPPER_BOUND, 6, 0);
  Expect(!Response(request).has_solution(), "A shorter span limit makes a fixed route infeasible");
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_UPPER_BOUND, 7, 0);
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_COST, 0, vehicle);
    Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SLACK_COST, 0, vehicle);
  }
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_GLOBAL_SPAN_COST, 0);
  Expect(Response(request).objective_value() == 20, "Later dimension settings replace earlier costs and limits");
}
void PreservesExactInt64WaitingAndCosts() {
  constexpr int64_t exact = 9007199254741003LL;
  auto request = Request(2);
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 0;
  AddTime(request, exact, exact); Slack(request, 0, exact, exact); Slack(request, 1, 0, 0);
  auto response = Response(request);
  Expect(response.has_solution() && response.dimensions(0).cumul_values(1) == exact && response.dimensions(0).cumul_values(2) == exact,
         "Int64 waiting values remain exact beyond JavaScript safe integers");
  request = Request(2);
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 0;
  AddTime(request, 0, 1);
  auto* matrix = request.mutable_operations(0)->mutable_add_dimension()->mutable_transit_matrix();
  matrix->set_values(2, 1); matrix->set_values(3, 1);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_COST, exact, 0);
  response = Response(request);
  Expect(response.has_solution() && response.objective_value() == exact, "Int64 span coefficients remain exact in native objectives");
}
void RejectsMalformedBoundsActivityAndSettings() {
  for (int kind = 0; kind < 14; ++kind) {
    auto request = Request(); AddTime(request);
    if (kind < 4) {
      auto* value = request.add_operations()->mutable_set_slack_bounds();
      value->set_dimension_name(kind == 0 ? "missing" : "time"); value->set_index(kind == 1 ? 3 : kind == 2 ? -1 : 1);
      value->set_lower(kind == 3 ? 2 : 0); value->set_upper(1);
    } else if (kind < 8) {
      Active(request, kind == 4 ? 3 : kind == 5 ? -1 : 1, {kind == 6 ? -1 : kind == 7 ? 2 : 1});
    } else {
      auto* value = request.add_operations()->mutable_set_dimension_value();
      value->set_dimension_name(kind == 8 ? "missing" : "time"); value->set_value(kind == 9 ? -1 : 1);
      value->set_kind(kind == 10 ? static_cast<bridge::RoutingDimensionValueKind>(42) : bridge::ROUTING_DIMENSION_VALUE_KIND_SPAN_COST);
      if (kind != 11) value->set_vehicle(kind == 12 ? 1 : kind == 13 ? -1 : 0);
    }
    Expect(!Execute(request).ok, "Malformed slack/activity/cost requests are rejected before native checks or variable indexing");
  }
}
void Soft(bridge::RoutingBridgeRequest& request, int64_t index, int64_t bound, int64_t coefficient, bool lower = false) {
  auto* value = request.add_operations()->mutable_set_cumul_soft_bound();
  value->set_dimension_name("time"); value->set_index(index); value->set_bound(bound); value->set_coefficient(coefficient); value->set_lower(lower);
}
void AppliesSoftCumulCostsAndRestoration() {
  auto request = Request();
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 4;
  AddTime(request, 0);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 3);
  Soft(request, 2, 99, 99); Soft(request, 2, 5, 3); Soft(request, 1, 7, 2, true); Soft(request, 3, 10, 5); Soft(request, 0, -5, 2, true);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) { auto* route = current.mutable_initial_assignment()->add_routes(); route->add_indices(1); route->add_indices(2); current.set_read_assignment_only(kind == 2); }
    auto result = Response(current);
    Expect(result.has_solution() && result.objective_value() == 37, "Soft bounds charge exact early/late costs in normal, warm and restored routes");
    Expect(result.dimensions(0).cumul_values(1) == 4 && result.dimensions(0).cumul_values(2) == 8, "Soft bounds permit violations without making routes infeasible");
  }
  auto* linear = request.add_operations()->mutable_set_soft_span_upper_bound();
  linear->set_dimension_name("time"); linear->set_vehicle(0); linear->set_bound(10); linear->set_cost(2);
  auto* quadratic = request.add_operations()->mutable_set_quadratic_cost_soft_span_upper_bound();
  quadratic->set_dimension_name("time"); quadratic->set_vehicle(0); quadratic->set_bound(9); quadratic->set_cost(1);
  Expect(Response(request).objective_value() == 50, "Soft cumul and linear/quadratic span penalties compose");
  Soft(request, 2, 5, 0); Soft(request, 1, 7, 0, true); Soft(request, 3, 10, 0);
  // Replacing soft cumul settings with zero coefficients retains only span and arc costs.
  Expect(Response(request).objective_value() == 25, "Zero soft cumul coefficients replace earlier penalties");
}
void OptimizesSoftCumulCostsAndExactIntegers() {
  auto request = Request();
  for (auto& value : *request.mutable_transit_matrix()->mutable_values()) value = 4;
  AddTime(request);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 3);
  Soft(request, 1, 7, 2, true); Soft(request, 2, 8, 1);
  const auto optimum = Response(request);
  Expect(optimum.has_solution() && optimum.objective_value() == 15 && optimum.dimensions(0).cumul_values(1) == 7
    && optimum.dimensions(0).cumul_values(2) == 11, "Native optimizer trades waiting against early/late costs");
  auto optional = Request();
  for (auto& value : *optional.mutable_transit_matrix()->mutable_values()) value = 4;
  AddTime(optional, 0);
  auto* disjunction = optional.add_operations()->mutable_add_disjunction(); disjunction->add_indices(1); disjunction->set_penalty(2);
  Soft(optional, 1, 0, 10); Soft(optional, 1, 7, 2, true);
  const auto dropped = Response(optional);
  Expect(dropped.has_solution() && dropped.objective_value() == 10 && dropped.next_values(1) == 1,
    "Dropped optional nodes incur disjunction penalties without soft cumul costs");
  auto large = Request(2);
  for (auto& value : *large.mutable_transit_matrix()->mutable_values()) value = 0;
  AddTime(large, 0, 1);
  constexpr int64_t exact = 9007199254741003LL;
  Soft(large, 1, -1, exact);
  Expect(Response(large).objective_value() == exact, "Signed soft bounds and bigint coefficients remain exact");
}
void RejectsMalformedSoftBounds() {
  for (int kind = 0; kind < 12; ++kind) {
    auto request = Request(); AddTime(request);
    if (kind < 6) {
      Soft(request, kind == 0 ? -1 : kind == 1 ? 4 : kind == 2 ? std::numeric_limits<int64_t>::max() : 1, 5, kind == 3 ? -1 : 1, kind == 4);
      if (kind == 4) request.mutable_operations(1)->mutable_set_cumul_soft_bound()->set_coefficient(-1);
      if (kind == 5) request.mutable_operations(1)->mutable_set_cumul_soft_bound()->set_dimension_name("missing");
    } else if (kind < 9) {
      auto* value = request.add_operations()->mutable_set_soft_span_upper_bound();
      value->set_dimension_name(kind == 8 ? "missing" : "time"); value->set_bound(5); value->set_cost(kind == 7 ? -1 : 1); value->set_vehicle(kind == 6 ? 1 : 0);
    } else {
      auto* value = request.add_operations()->mutable_set_quadratic_cost_soft_span_upper_bound();
      value->set_dimension_name(kind == 11 ? "missing" : "time"); value->set_bound(5); value->set_cost(kind == 10 ? -1 : 1); value->set_vehicle(kind == 9 ? -1 : 0);
    }
    Expect(!Execute(request).ok, "Malformed soft cumul/span bounds fail before native indexing or negative-cost optimization");
  }
}
void ConstructsVehicleTransitAndCapacityDimensions() {
  auto request = Request(3, 2);
  auto* dimension = request.add_operations()->mutable_add_dimension_with_vehicle_transit_and_capacity();
  dimension->set_name("fleet"); dimension->set_fix_start_cumul_to_zero(true);
  for (int vehicle = 0; vehicle < 2; ++vehicle) {
    auto* matrix = dimension->add_transit_matrices(); matrix->set_dimension(3);
    for (int i = 0; i < 9; ++i) matrix->add_values(vehicle == 0 ? 2 : 3);
    dimension->add_capacities(vehicle == 0 ? 4 : 6);
  }
  request.add_dimension_names("fleet");
  Next(request, 0, 1); Next(request, 1, 4); Next(request, 3, 2); Next(request, 2, 5);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) {
      current.mutable_initial_assignment()->add_routes()->add_indices(1);
      current.mutable_initial_assignment()->add_routes()->add_indices(2);
      current.set_read_assignment_only(kind == 2);
    }
    const auto result = Response(current);
    Expect(result.has_solution() && result.dimensions(0).cumul_values(4) == 4 && result.dimensions(0).cumul_values(5) == 6,
      "Per-vehicle evaluators and capacities reach normal/warm/restored native routes");
  }
  dimension->set_capacities(0, 3);
  Expect(!Response(request).has_solution(), "Each vehicle capacity constrains feasibility independently");
}
void ConstructsConstantDimensionsWithWaiting() {
  auto request = Request(2);
  auto* dimension = request.add_operations()->mutable_add_constant_dimension();
  dimension->set_value(1); dimension->set_capacity(10); dimension->set_slack_max(5);
  dimension->set_fix_start_cumul_to_zero(true); dimension->set_name("time"); request.add_dimension_names("time");
  auto* window = request.add_operations()->mutable_set_cumul_bounds(); window->set_dimension_name("time");
  window->set_index(1); window->set_lower(6); window->set_upper(6);
  Setting(request, bridge::ROUTING_DIMENSION_VALUE_KIND_GLOBAL_SPAN_COST, 1);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) { current.mutable_initial_assignment()->add_routes()->add_indices(1); current.set_read_assignment_only(kind == 2); }
    const auto result = Response(current);
    Expect(result.has_solution() && result.objective_value() == 9 && result.dimensions(0).cumul_values(2) == 7,
      "Constant dimension waiting reaches native normal/warm/restored objective");
  }
  dimension->clear_slack_max();
  Expect(!Response(request).has_solution(), "Absent slack retains legacy zero-wait semantics");
  dimension->set_value(0); dimension->set_capacity(9007199254740993LL); dimension->set_slack_max(9007199254740993LL);
  window->set_lower(9007199254740993LL); window->set_upper(9007199254740993LL);
  const auto exact = Response(request);
  Expect(exact.has_solution() && exact.dimensions(0).cumul_values(1) == 9007199254740993LL, "Constant slack preserves exact int64 waits");
}
void InspectsNativeDimensionConstructionMetadata() {
  using operations_research::RoutingIndexManager;
  using operations_research::RoutingModel;
  RoutingIndexManager manager(2, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
  Expect(model.GetDimensions().empty() && model.GetAllDimensionNames().empty() && !model.HasDimension("missing"), "Empty dimension metadata");
  for (const std::string& name : {"z", "a", "𐀀", ""}) model.AddConstantDimension(1, 10, true, name);
  Expect(model.GetAllDimensionNames() == std::vector<std::string>({"a", "z", "", "𐀀"}), "Native names sort by UTF-8 bytes");
  Expect(model.GetDimensions()[0]->name() == "z" && model.GetDimensions()[1]->name() == "a"
    && model.GetDimensions()[2]->name() == "𐀀" && model.GetDimensions()[3]->name() == "", "Native dimension handles retain creation order");
  const auto duplicate = model.AddConstantDimensionWithSlack(9, 10, 5, true, "z");
  Expect(!duplicate.second && duplicate.first >= 0 && model.TransitCallback(duplicate.first)(0, 1) == 9,
    "Duplicate native constant dimensions still register a reusable transit evaluator");
  Expect(model.GetDimensions().size() == 4 && model.GetDimensionOrDie("z").GetTransitValue(0, 1, 0) == 1,
    "Duplicate construction does not replace existing dimension");
}
void RejectsMalformedDimensionConstruction() {
  for (int kind = 0; kind < 7; ++kind) {
    auto request = Request(2, 2);
    auto* dimension = request.add_operations()->mutable_add_dimension_with_vehicle_transit_and_capacity();
    dimension->set_name("fleet"); dimension->set_fix_start_cumul_to_zero(true);
    for (int i = 0; i < (kind == 0 ? 1 : 2); ++i) *dimension->add_transit_matrices() = request.transit_matrix();
    if (kind != 1) dimension->add_capacities(kind == 3 ? -1 : 10);
    if (kind != 2) dimension->add_capacities(10);
    if (kind == 4) dimension->set_slack_max(-1);
    if (kind == 5) dimension->mutable_transit_matrices(0)->clear_values();
    if (kind == 6) dimension->add_capacities(10);
    Expect(!Execute(request).ok, "Malformed vehicle arrays, matrices and negative limits reject before native indexing/checks");
  }
  for (int kind = 0; kind < 2; ++kind) {
    auto request = Request(2); auto* dimension = request.add_operations()->mutable_add_constant_dimension();
    dimension->set_name("wait"); dimension->set_value(1); dimension->set_capacity(kind == 0 ? -1 : 10); dimension->set_slack_max(kind == 1 ? -1 : 1);
    Expect(!Execute(request).ok, "Malformed constant capacity/slack rejects before native variable creation");
  }
}
void AppliesAllFinalizerMethods() {
  for (int kind = 1; kind <= 3; ++kind) for (bool weighted : {false, true}) {
    auto request = Request(2); AddTime(request); Next(request, 0, 1); Next(request, 1, 2);
    auto* finalizer = request.add_operations()->mutable_add_finalizer();
    finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_CUMUL); finalizer->set_dimension_name("time");
    finalizer->set_index(1); finalizer->set_kind(static_cast<bridge::RoutingFinalizerKind>(kind));
    finalizer->set_target(8); if (weighted) finalizer->set_weight(0);
    const auto response = Response(request);
    const int64_t expected = kind == 1 ? 1 : kind == 2 ? 11 : 8;
    Expect(response.has_solution() && response.dimensions(0).cumul_mins(1) == expected
      && response.dimensions(0).cumul_maxs(1) == expected && response.objective_value() == 2,
      "All six finalizers bind native cumuls without changing the route objective");
  }
}
void AppliesWeightedFinalizerPriorities() {
  for (bool prioritize_start : {false, true}) {
    auto request = Request(2); AddTime(request, 0, 10);
    request.mutable_operations(0)->mutable_add_dimension()->set_fix_start_cumul_to_zero(false);
    Next(request, 0, 1); Next(request, 1, 2);
    for (const auto [index, kind, weight] : std::vector<std::tuple<int, int, int>>{
      {0, 2, prioritize_start ? 9 : 1}, {2, 1, prioritize_start ? 1 : 9}}) {
      auto* finalizer = request.add_operations()->mutable_add_finalizer();
      finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_CUMUL); finalizer->set_dimension_name("time");
      finalizer->set_index(index); finalizer->set_kind(static_cast<bridge::RoutingFinalizerKind>(kind)); finalizer->set_weight(weight);
    }
    const auto response = Response(request);
    Expect(response.has_solution() && response.dimensions(0).cumul_values(0) == (prioritize_start ? 8 : 0)
      && response.dimensions(0).cumul_values(2) == (prioritize_start ? 10 : 2),
      "Higher weighted finalizer priority wins competing secondary targets");
  }
}
void RejectsMalformedFinalizers() {
  for (int invalid = 0; invalid < 8; ++invalid) {
    auto request = Request(2); AddTime(request);
    auto* finalizer = request.add_operations()->mutable_add_finalizer();
    finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_CUMUL); finalizer->set_dimension_name("time");
    finalizer->set_index(1); finalizer->set_kind(bridge::ROUTING_FINALIZER_MINIMIZE);
    if (invalid == 0) finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_UNSPECIFIED);
    if (invalid == 1) finalizer->set_kind(bridge::ROUTING_FINALIZER_UNSPECIFIED);
    if (invalid == 2) finalizer->set_dimension_name("missing");
    if (invalid == 3) finalizer->set_index(-1);
    if (invalid == 4) finalizer->set_index(3);
    if (invalid == 5) { finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_SLACK); finalizer->set_index(2); }
    if (invalid == 6) { finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_NEXT); finalizer->clear_dimension_name(); finalizer->set_index(2); }
    if (invalid == 7) finalizer->set_variable_kind(bridge::ROUTING_VARIABLE_VEHICLE);
    Expect(!Execute(request).ok, "Malformed finalizer handles reject before native indexing");
  }
}
bridge::RoutingVariableReference CumulReference(int64_t index) {
  bridge::RoutingVariableReference variable; variable.set_kind(bridge::ROUTING_VARIABLE_CUMUL);
  variable.set_dimension_name("time"); variable.set_index(index); return variable;
}
void InspectsNativeDomainsAndHoles() {
  auto request = Request(2); AddTime(request);
  auto modify = [&](bridge::RoutingDomainAction action, int64_t lower, int64_t upper, std::vector<int64_t> values = {}) {
    auto* operation = request.add_operations()->mutable_modify_domain(); *operation->mutable_variable() = CumulReference(1);
    operation->set_action(action); operation->set_lower(lower); operation->set_upper(upper);
    for (auto value : values) operation->add_values(value);
  };
  modify(bridge::ROUTING_DOMAIN_RANGE, 0, 10);
  modify(bridge::ROUTING_DOMAIN_REMOVE_INTERVAL, 3, 5);
  modify(bridge::ROUTING_DOMAIN_VALUES, 0, 0, {0, 2, 3, 6, 9, 9});
  modify(bridge::ROUTING_DOMAIN_REMOVE_VALUES, 0, 0, {0});
  modify(bridge::ROUTING_DOMAIN_RANGE, 3, 8);
  auto* query = request.add_domain_queries(); *query->mutable_variable() = CumulReference(1); query->set_contains_value(7);
  const auto response = Response(request);
  Expect(response.domain_results_size() == 1 && response.domain_results(0).min() == 6
    && response.domain_results(0).max() == 6 && response.domain_results(0).size() == 1
    && response.domain_results(0).bound() && response.domain_results(0).has_contains()
    && !response.domain_results(0).contains(), "Native domain inspection retains holes and optional false membership");
  auto huge = Request(2); AddTime(huge, 0, std::numeric_limits<int64_t>::max());
  *huge.add_domain_queries()->mutable_variable() = CumulReference(1);
  Expect(Response(huge).domain_results(0).size() == (uint64_t{1} << 63), "Native domain sizes preserve unsigned 64-bit counts");
}
void AppliesNativeLinearArithmetic() {
  auto request = Request(2); AddTime(request); Next(request, 0, 1); Next(request, 1, 2);
  auto* constraint = request.add_operations()->mutable_add_linear_constraint(); constraint->set_comparison(1);
  auto* term = constraint->mutable_left()->add_terms(); *term->mutable_variable() = CumulReference(1); term->set_coefficient(2);
  constraint->mutable_left()->set_offset(1); constraint->mutable_right()->set_offset(11);
  const auto response = Response(request);
  Expect(response.has_solution() && response.dimensions(0).cumul_values(1) == 5
    && response.objective_value() == 2, "Native scalar products and offsets constrain routing cumuls");
  auto* impossible = request.add_operations()->mutable_add_linear_constraint(); impossible->set_comparison(2);
  auto* value = impossible->mutable_left()->add_terms(); *value->mutable_variable() = CumulReference(1); value->set_coefficient(1);
  impossible->mutable_right()->set_offset(5);
  Expect(!Response(request).has_solution(), "Not-equal constraints are enforced by native search");
}
void InspectsNativeCostsAndSoftBounds() {
  auto request = Request(2); AddTime(request, 0, 20);
  auto* fixed = request.add_operations()->mutable_set_fixed_vehicle_cost(); fixed->set_vehicle(0); fixed->set_cost(100);
  auto* query = request.add_arc_cost_queries(); query->set_from_index(0); query->set_to_index(1); query->set_vehicle(0);
  auto* empty = request.add_arc_cost_queries(); empty->set_from_index(0); empty->set_to_index(2); empty->set_vehicle(0);
  const auto costs = Response(request);
  Expect(costs.arc_costs_size() == 2 && costs.arc_costs(0) == 101 && costs.arc_costs(1) == 0, "Arc queries use native fixed and empty-route costs");
  request.clear_arc_cost_queries();
  auto* domain = request.add_domain_queries(); *domain->mutable_variable() = CumulReference(1); domain->set_soft_lower_bound(false);
  Expect(Response(request).domain_results(0).soft_bound() == 20, "Unset soft upper bound comes from native variable domain");
  auto* soft = request.add_operations()->mutable_set_cumul_soft_bound(); soft->set_dimension_name("time"); soft->set_index(1); soft->set_bound(7); soft->set_coefficient(3);
  Expect(Response(request).domain_results(0).soft_bound() == 7, "Configured soft bound comes from native dimension");
}

void SupportsTransitAndVehicleActivityVariables() {
  auto request = Request(2, 2); AddTime(request, 4, 30);
  Next(request, 0, 1); Next(request, 1, 3); Next(request, 2, 4);
  const auto reference = [](bridge::RoutingVariableKind kind, int64_t index) {
    bridge::RoutingVariableReference value;
    value.set_kind(kind); value.set_index(index);
    if (kind != bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE) value.set_dimension_name("time");
    return value;
  };
  const auto restrict = [&](bridge::RoutingVariableKind kind, int index, int64_t lower, int64_t upper) {
    auto* operation = request.add_operations()->mutable_modify_domain();
    *operation->mutable_variable() = reference(kind, index);
    operation->set_action(bridge::ROUTING_DOMAIN_RANGE); operation->set_lower(lower); operation->set_upper(upper);
  };
  restrict(bridge::ROUTING_VARIABLE_TRANSIT, 0, 3, 5);
  restrict(bridge::ROUTING_VARIABLE_FIXED_TRANSIT, 0, 1, 1);
  restrict(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 0, 1, 1);
  restrict(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 1, 0, 0);
  for (const auto [kind, index] : std::vector<std::pair<bridge::RoutingVariableKind, int>>{
      {bridge::ROUTING_VARIABLE_TRANSIT, 0}, {bridge::ROUTING_VARIABLE_FIXED_TRANSIT, 0}, {bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 1}}) {
    *request.add_domain_queries()->mutable_variable() = reference(kind, index);
  }
  const auto domains = Response(request);
  Expect(domains.domain_results_size() == 3 && domains.domain_results(0).min() == 3
    && domains.domain_results(0).max() == 5 && domains.domain_results(1).min() == 1
    && domains.domain_results(2).max() == 0, "All three new handles resolve native construction domains");
  request.clear_domain_queries();
  auto* constraint = request.add_operations()->mutable_add_linear_constraint(); constraint->set_comparison(1);
  auto* term = constraint->mutable_left()->add_terms(); *term->mutable_variable() = reference(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 0); term->set_coefficient(1);
  term = constraint->mutable_left()->add_terms(); *term->mutable_variable() = reference(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 1); term->set_coefficient(1);
  constraint->mutable_right()->set_offset(1);
  const auto finalize = [&](bridge::RoutingVariableKind kind, int index, int mode, int64_t target) {
    auto* operation = request.add_operations()->mutable_add_finalizer();
    operation->set_variable_kind(kind); operation->set_index(index); operation->set_kind(static_cast<bridge::RoutingFinalizerKind>(mode)); operation->set_target(target);
    if (kind != bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE) operation->set_dimension_name("time");
  };
  finalize(bridge::ROUTING_VARIABLE_TRANSIT, 0, 1, 0);
  finalize(bridge::ROUTING_VARIABLE_TRANSIT, 1, 3, 5);
  finalize(bridge::ROUTING_VARIABLE_FIXED_TRANSIT, 0, 3, 1);
  finalize(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 0, 2, 0);
  const auto solved = Response(request);
  Expect(solved.has_solution() && solved.dimensions(0).cumul_values(1) == 3
    && solved.dimensions(0).cumul_values(3) == 8 && solved.next_values(2) == 4,
    "Native finalizers and expressions apply to transit and vehicle activity variables");
  const auto captured = [&](bridge::RoutingVariableKind kind, int index, int64_t expected) {
    for (const auto& value : solved.assignment_variables()) {
      if (value.variable().kind() == kind && value.variable().index() == index) {
        Expect(value.min() == expected && value.max() == expected, "Native captured assignment bounds");
        return;
      }
    }
    throw std::runtime_error("Missing native captured variable");
  };
  captured(bridge::ROUTING_VARIABLE_SLACK, 0, 2);
  captured(bridge::ROUTING_VARIABLE_TRANSIT, 1, 5);
  captured(bridge::ROUTING_VARIABLE_FIXED_TRANSIT, 0, 1);
  captured(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 0, 1);
  captured(bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 1, 0);
  for (const auto [kind, index, name] : std::vector<std::tuple<bridge::RoutingVariableKind, int64_t, std::string>>{
      {bridge::ROUTING_VARIABLE_TRANSIT, 3, "time"}, {bridge::ROUTING_VARIABLE_FIXED_TRANSIT, 3, "time"},
      {bridge::ROUTING_VARIABLE_TRANSIT, 0, "missing"}, {bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 2, ""},
      {bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE, 0, "time"}}) {
    auto malformed = Request(2, 2); AddTime(malformed);
    auto* value = malformed.add_domain_queries()->mutable_variable(); value->set_kind(kind); value->set_index(index); value->set_dimension_name(name);
    Expect(!Execute(malformed).ok, "Invalid new variable references reject before native indexing");
  }
}

void SupportsVehicleRouteConsideration() {
  for (bool used : {false, true}) {
    auto request = Request(1, 1);
    auto* setting = request.add_operations()->mutable_set_vehicle_used_when_empty();
    setting->set_vehicle(0); setting->set_is_used(used);
    auto* restriction = request.add_operations()->mutable_modify_domain();
    restriction->mutable_variable()->set_kind(bridge::ROUTING_VARIABLE_ROUTE_CONSIDERED);
    restriction->mutable_variable()->set_index(0);
    restriction->set_action(bridge::ROUTING_DOMAIN_RANGE);
    restriction->set_lower(used); restriction->set_upper(used);
    auto response = Response(request);
    Expect(response.has_solution(), "Empty route consideration forwards native usage setting");
    bool found = false;
    for (const auto& value : response.assignment_variables()) {
      if (value.variable().kind() == bridge::ROUTING_VARIABLE_ACTIVE_VEHICLE) {
        Expect(value.min() == 0 && value.max() == 0, "Empty routes remain inactive");
      }
      if (value.variable().kind() == bridge::ROUTING_VARIABLE_ROUTE_CONSIDERED) {
        found = true;
        Expect(value.variable().index() == 0 && value.min() == used && value.max() == used,
          "Route consideration bounds come from native assignment");
      }
    }
    Expect(found, "Route consideration is captured");
    restriction->set_lower(!used); restriction->set_upper(!used);
    Expect(!Response(request).has_solution(), "Contradictory consideration reaches native feasibility");
  }
  for (const auto [index, name] : std::vector<std::pair<int64_t, std::string>>{{-1, ""}, {1, ""}, {0, "time"}}) {
    auto request = Request(1, 1);
    auto* reference = request.add_domain_queries()->mutable_variable();
    reference->set_kind(bridge::ROUTING_VARIABLE_ROUTE_CONSIDERED); reference->set_index(index); reference->set_dimension_name(name);
    Expect(!Execute(request).ok, "Malformed route consideration references reject before native access");
  }
}

void SupportsConditionalComparisons() {
  for (int comparison = 1; comparison <= 6; ++comparison) {
    const int left[] = {0, 2, 2, 2, 3, 2, 3};
    const int right[] = {0, 2, 3, 3, 2, 3, 2};
    const int complement[] = {0, 2, 1, 6, 5, 4, 3};
    for (bool enabled : {false, true}) {
      auto request = Request(1, 1);
      auto* constraint = request.add_operations()->mutable_add_linear_constraint();
      constraint->mutable_left()->set_offset(0); constraint->mutable_right()->set_offset(1); constraint->set_comparison(1);
      auto* condition = constraint->add_conditions();
      condition->mutable_left()->set_offset(left[comparison]); condition->mutable_right()->set_offset(right[comparison]);
      condition->set_comparison(enabled ? comparison : complement[comparison]);
      Expect(Response(request).has_solution() == !enabled, "Native reified comparisons enforce implication");
      auto* false_condition = constraint->add_conditions();
      false_condition->mutable_left()->set_offset(0); false_condition->mutable_right()->set_offset(1); false_condition->set_comparison(1);
      Expect(Response(request).has_solution(), "Multiple guards are conjoined without forcing them true");
    }
  }
  for (int comparison : {0, 7}) {
    auto request = Request(1, 1);
    auto* constraint = request.add_operations()->mutable_add_linear_constraint();
    constraint->mutable_left()->set_offset(0); constraint->mutable_right()->set_offset(1); constraint->set_comparison(1);
    auto* condition = constraint->add_conditions();
    condition->mutable_left()->set_offset(0); condition->mutable_right()->set_offset(1); condition->set_comparison(comparison);
    Expect(!Execute(request).ok, "Malformed enforcement comparison rejects");
    condition->set_comparison(1); condition->clear_left();
    Expect(!Execute(request).ok, "Missing enforcement expression rejects");
  }
}

void RejectsMalformedDomainAndExpressionRequests() {
  for (int invalid = 0; invalid < 5; ++invalid) {
    auto request = Request(2); AddTime(request);
    if (invalid < 3) {
      auto* operation = request.add_operations()->mutable_modify_domain();
      if (invalid != 0) *operation->mutable_variable() = CumulReference(1);
      operation->set_action(invalid == 1 ? bridge::ROUTING_DOMAIN_UNSPECIFIED : bridge::ROUTING_DOMAIN_RANGE);
      if (invalid == 2) { operation->set_lower(3); operation->set_upper(2); }
    } else {
      auto* constraint = request.add_operations()->mutable_add_linear_constraint();
      constraint->mutable_left(); constraint->mutable_right(); constraint->set_comparison(invalid == 3 ? 99 : 1);
      if (invalid == 4) constraint->mutable_left()->add_terms()->set_coefficient(1);
    }
    Expect(!Execute(request).ok, "Malformed typed domain/expression requests reject safely");
  }
}
int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
    {"InspectsNativeDomainsAndHoles", InspectsNativeDomainsAndHoles},
    {"AppliesNativeLinearArithmetic", AppliesNativeLinearArithmetic},
    {"InspectsNativeCostsAndSoftBounds", InspectsNativeCostsAndSoftBounds},
    {"SupportsTransitAndVehicleActivityVariables", SupportsTransitAndVehicleActivityVariables},
    {"SupportsVehicleRouteConsideration", SupportsVehicleRouteConsideration},
    {"SupportsConditionalComparisons", SupportsConditionalComparisons},
    {"RejectsMalformedDomainAndExpressionRequests", RejectsMalformedDomainAndExpressionRequests},
    {"AppliesAllFinalizerMethods", AppliesAllFinalizerMethods},
    {"AppliesWeightedFinalizerPriorities", AppliesWeightedFinalizerPriorities},
    {"RejectsMalformedFinalizers", RejectsMalformedFinalizers},
    {"ConstructsVehicleTransitAndCapacityDimensions", ConstructsVehicleTransitAndCapacityDimensions},
    {"ConstructsConstantDimensionsWithWaiting", ConstructsConstantDimensionsWithWaiting},
    {"InspectsNativeDimensionConstructionMetadata", InspectsNativeDimensionConstructionMetadata},
    {"RejectsMalformedDimensionConstruction", RejectsMalformedDimensionConstruction},
    {"AppliesSoftCumulCostsAndRestoration", AppliesSoftCumulCostsAndRestoration},
    {"OptimizesSoftCumulCostsAndExactIntegers", OptimizesSoftCumulCostsAndExactIntegers},
    {"RejectsMalformedSoftBounds", RejectsMalformedSoftBounds},
    {"AppliesWaitingAndRouteRestoration", AppliesWaitingAndRouteRestoration},
    {"AppliesOptionalActivityAndConflicts", AppliesOptionalActivityAndConflicts},
    {"AppliesDimensionCostsAndSpanLimits", AppliesDimensionCostsAndSpanLimits},
    {"PreservesExactInt64WaitingAndCosts", PreservesExactInt64WaitingAndCosts},
    {"RejectsMalformedBoundsActivityAndSettings", RejectsMalformedBoundsActivityAndSettings},
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
