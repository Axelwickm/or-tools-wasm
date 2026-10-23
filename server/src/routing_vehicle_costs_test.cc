#include "server/src/routing_test_helpers.h"
#include "server/src/routing_executor.h"
#include "server/src/job_scheduler.h"
#include "routing.pb.h"
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
void Expect(bool value, const std::string& message) { if (!value) throw std::runtime_error(message); }
bridge::RoutingBridgeRequest Request(int nodes, int vehicles, int64_t cost) {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(nodes); request.set_num_vehicles(vehicles); SetRoutingFirstSolutionStrategy(&request, 3);
  for (int vehicle = 0; vehicle < vehicles; ++vehicle) { request.add_starts(0); request.add_ends(0); }
  auto* matrix = request.mutable_transit_matrix(); matrix->set_dimension(nodes);
  for (int index = 0; index < nodes * nodes; ++index) matrix->add_values(cost);
  return request;
}
void Next(bridge::RoutingBridgeRequest& request, int index, int successor) {
  auto* value = request.add_operations()->mutable_set_next_values(); value->set_index(index); value->add_values(successor);
}
void Maximum(bridge::RoutingBridgeRequest& request, int maximum) { request.add_operations()->mutable_set_maximum_active_vehicles()->set_maximum(maximum); }
void Fixed(bridge::RoutingBridgeRequest& request, int vehicle, int64_t cost) {
  auto* value = request.add_operations()->mutable_set_fixed_vehicle_cost(); value->set_vehicle(vehicle); value->set_cost(cost);
}
void Factors(bridge::RoutingBridgeRequest& request, int vehicle, int64_t linear, int64_t quadratic) {
  auto* value = request.add_operations()->mutable_set_amortized_vehicle_costs(); value->set_vehicle(vehicle); value->set_linear(linear); value->set_quadratic(quadratic);
}
void Empty(bridge::RoutingBridgeRequest& request, int vehicle, bool is_used) {
  auto* value = request.add_operations()->mutable_set_vehicle_used_when_empty(); value->set_vehicle(vehicle); value->set_is_used(is_used);
}
SolverExecutorResult Execute(const bridge::RoutingBridgeRequest& request) {
  RoutingExecutor executor; JobScheduler scheduler({2, 8}); SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    execution = executor.Execute({1, "routing", request.SerializeAsString()}, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get(); return execution;
}
bridge::RoutingBridgeResponse Response(const bridge::RoutingBridgeRequest& request) {
  const auto execution = Execute(request); Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response; Expect(response.ParseFromString(execution.payload), "Response parses"); return response;
}
void AppliesFixedCostsAndActiveLimits() {
  auto request = Request(5, 2, 10);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 6); Next(request, 5, 3); Next(request, 3, 4); Next(request, 4, 7);
  Fixed(request, 0, 99); Fixed(request, 0, 7); Fixed(request, 1, 11);
  Maximum(request, 1); Expect(!Response(request).has_solution(), "One active vehicle cannot perform two required fixed routes");
  Maximum(request, 2);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) {
      auto* first = current.mutable_initial_assignment()->add_routes(); first->add_indices(1); first->add_indices(2);
      auto* second = current.mutable_initial_assignment()->add_routes(); second->add_indices(3); second->add_indices(4);
      current.set_read_assignment_only(kind == 2);
    }
    auto result = Response(current); Expect(result.has_solution() && result.objective_value() == 78, "Fixed costs compose with arcs in normal/warm/restored routes");
  }
  Maximum(request, 0); Expect(!Response(request).has_solution(), "Zero active vehicles cannot serve mandatory nodes");
  Maximum(request, 5); Fixed(request, 0, 0); Fixed(request, 1, 0);
  Expect(Response(request).objective_value() == 60, "Limits above fleet size are nonbinding and zero fixed costs replace prior costs");
  auto preferred = Request(3, 2, 1); Fixed(preferred, 0, 100); Fixed(preferred, 1, 4);
  const auto result = Response(preferred);
  Expect(result.has_solution() && result.objective_value() == 7 && result.vehicle_values(1) == 1 && result.vehicle_values(2) == 1,
    "Fixed costs affect native vehicle selection");
}
void AppliesAmortizedFactorsAndExactCosts() {
  auto request = Request(4, 2, 10);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 5); Next(request, 4, 3); Next(request, 3, 6);
  Fixed(request, 0, 3); Fixed(request, 1, 5); Factors(request, 0, 20, 2); Factors(request, 1, 20, 2); Factors(request, 1, 10, 1);
  Expect(Response(request).objective_value() == 79, "Amortized objective uses customer-count squares and per-vehicle overrides");
  Factors(request, 0, 0, 0); Factors(request, 1, 0, 0);
  Expect(Response(request).objective_value() == 58, "Zero factors replace prior costs");
  auto dense = Request(5, 2, 1); Factors(dense, 0, 30, 2); Factors(dense, 1, 30, 2);
  Expect(Response(dense).objective_value() == 3, "Quadratic factors reward dense routes");
  constexpr int64_t exact = 9007199254741003LL;
  auto large = Request(2, 1, 0); Fixed(large, 0, exact);
  Expect(Response(large).objective_value() == exact, "Fixed costs preserve exact int64 objectives");
  Fixed(large, 0, 0); Factors(large, 0, exact, 0);
  Expect(Response(large).objective_value() == exact, "Amortized costs preserve exact int64 objectives");
}
void CountsEmptyRouteCostsWithoutActiveSlots() {
  auto request = Request(1, 2, 5); Maximum(request, 0);
  Fixed(request, 0, 100); Fixed(request, 1, 100); Factors(request, 0, 7, 1); Factors(request, 1, 7, 1);
  Expect(Response(request).objective_value() == 0, "Empty routes are unused by default");
  Empty(request, 0, true); Expect(Response(request).objective_value() == 5, "An empty route charges transit but no fixed/amortized cost and consumes no active slot");
  Empty(request, 1, true); request.mutable_initial_assignment()->add_routes(); request.mutable_initial_assignment()->add_routes(); request.set_read_assignment_only(true);
  Expect(Response(request).objective_value() == 10, "Restoration respects empty-route usage");
  request.clear_initial_assignment(); request.set_read_assignment_only(false); Empty(request, 0, false); Empty(request, 1, false);
  Expect(Response(request).objective_value() == 0, "False usage flags replace earlier true flags");
  auto optional = Request(2, 2, 1); Maximum(optional, 0); Fixed(optional, 0, 100); Fixed(optional, 1, 100);
  auto* disjunction = optional.add_operations()->mutable_add_disjunction(); disjunction->add_indices(1); disjunction->set_penalty(9);
  const auto dropped = Response(optional); Expect(dropped.has_solution() && dropped.objective_value() == 9 && dropped.next_values(1) == 1, "Zero active limits can drop optional nodes");
}
void RejectsMalformedVehicleSettings() {
  for (int kind = 0; kind < 11; ++kind) {
    auto request = Request(2, 2, 1);
    if (kind == 0) Maximum(request, -1);
    else if (kind < 4) Fixed(request, kind == 1 ? -1 : kind == 2 ? 2 : 0, kind == 3 ? -1 : 1);
    else if (kind < 9) Factors(request, kind == 4 ? -1 : kind == 5 ? 2 : 0,
      kind == 6 ? -1 : kind == 8 ? std::numeric_limits<int64_t>::max() : 1, kind == 7 ? -1 : 1);
    else Empty(request, kind == 9 ? -1 : 2, true);
    Expect(!Execute(request).ok, "Malformed vehicle settings fail before native indexing, negative costs or int64 factor overflow");
  }
}
void AppliesNativePathEnergyCosts() {
  auto unary = Request(3, 1, 1);
  auto* load = unary.add_operations()->mutable_add_dimension();
  load->set_name("load"); load->set_capacity(10); load->set_fix_start_cumul_to_zero(true);
  auto* matrix=load->mutable_transit_matrix(); matrix->set_dimension(4); matrix->set_routing_indices(true); matrix->set_unary(true);
  for(int from=0; from<4; ++from) for(int to=0; to<4; ++to) matrix->add_values(from==1 || from==2 ? 1:0);
  auto* distance=unary.add_operations()->mutable_add_constant_dimension();
  distance->set_name("distance"); distance->set_value(2); distance->set_capacity(100); distance->set_fix_start_cumul_to_zero(true);
  auto* unary_cost=unary.add_operations()->mutable_set_path_energy_costs();
  unary_cost->set_force("load"); unary_cost->set_distance("distance"); unary_cost->set_cost_above(3);
  Expect(Response(unary).objective_value()==21, "Native search uses preserved unary callback arity without a forced route");
  auto invalid_unary=unary;
  invalid_unary.mutable_operations(0)->mutable_add_dimension()->mutable_transit_matrix()->set_values(1,5);
  Expect(!Execute(invalid_unary).ok, "Unary matrices reject destination-dependent rows");
  auto binary_force=unary;
  binary_force.mutable_operations(0)->mutable_add_dimension()->mutable_transit_matrix()->set_unary(false);
  Expect(!Execute(binary_force).ok, "Energy force dimensions require native unary evaluators");
  auto request = Request(3, 1, 1);
  for (const auto& [name, value] : std::vector<std::pair<std::string, int>>{{"force",1},{"distance",2}}) {
    auto* dimension = request.add_operations()->mutable_add_constant_dimension();
    dimension->set_name(name); dimension->set_value(value); dimension->set_capacity(100); dimension->set_fix_start_cumul_to_zero(true);
  }
  Next(request,0,1); Next(request,1,2); Next(request,2,3);
  auto* energy = request.add_operations()->mutable_set_path_energy_costs();
  energy->set_force("force"); energy->set_distance("distance"); energy->set_cost_above(3);
  Expect(Response(request).objective_value() == 39, "Native energy integrates next-node force with arc distance");
  energy->set_threshold(2); energy->set_cost_below(2); energy->set_cost_above(5);
  for (int kind = 0; kind < 3; ++kind) {
    auto current=request;
    if(kind) {auto* route=current.mutable_initial_assignment()->add_routes(); route->add_indices(1); route->add_indices(2); current.set_read_assignment_only(kind==2);}
    Expect(Response(current).objective_value() == 33, "Threshold energy uses native rates in normal, warm and restored routes");
  }
  auto* zero = request.add_operations()->mutable_set_path_energy_costs();
  zero->set_force("force"); zero->set_distance("distance");
  Expect(Response(request).objective_value() == 33, "Zero energy costs preserve the native no-op behavior");
  for (int malformed=0; malformed<6; ++malformed) {
    auto invalid=request; auto* value=invalid.add_operations()->mutable_set_path_energy_costs();
    value->set_force(malformed==0 ? "missing":"force"); value->set_distance(malformed==1 ? "missing":"distance");
    value->set_vehicle(malformed==2 ? 1:0); value->set_threshold(malformed==3 ? -1:0);
    value->set_cost_below(malformed==4 ? -1:0); value->set_cost_above(malformed==5 ? -1:1);
    Expect(!Execute(invalid).ok, "Invalid energy data rejects before native fatal checks");
  }
}
int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
    {"AppliesFixedCostsAndActiveLimits", AppliesFixedCostsAndActiveLimits},
    {"AppliesAmortizedFactorsAndExactCosts", AppliesAmortizedFactorsAndExactCosts},
    {"CountsEmptyRouteCostsWithoutActiveSlots", CountsEmptyRouteCostsWithoutActiveSlots},
    {"RejectsMalformedVehicleSettings", RejectsMalformedVehicleSettings},
    {"AppliesNativePathEnergyCosts", AppliesNativePathEnergyCosts},
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
