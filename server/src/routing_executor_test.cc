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

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsInvalidDimensions", RejectsInvalidDimensions},
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
