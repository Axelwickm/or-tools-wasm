#include "server/src/routing_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "routing.pb.h"
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
  request.set_first_solution_strategy(3);
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
  request.set_solution_limit(1);
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

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReservesOneThread", ReservesOneThread},
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
