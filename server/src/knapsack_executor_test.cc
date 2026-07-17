#include "server/src/knapsack_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "knapsack.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

SolverExecutorRequest Request() {
  bridge::KnapsackBridgeRequest request;
  request.set_solver_type(5);
  request.set_name("test");
  request.set_use_reduction(true);
  for (double profit : {1, 2, 3, 4, 5}) request.add_profits(profit);
  auto* weights = request.add_weights();
  for (double weight : {1, 2, 3, 4, 5}) weights->add_values(weight);
  request.add_capacities(7);
  return SolverExecutorRequest{1, "knapsack", request.SerializeAsString()};
}

void SolvesAndSerializesResult() {
  KnapsackExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"knapsack", 1}, [&](JobContext& context) {
    execution = executor.Execute(Request(), context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  Expect(handle.result().get().state == JobState::kSucceeded, "Knapsack job succeeds");
  bridge::KnapsackBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Knapsack response parses");
  Expect(response.profit() == 7, "Knapsack result has expected profit");
  Expect(response.optimal(), "Knapsack result is optimal");
  Expect(response.contains_size() == 5, "Knapsack result contains one flag per item");
}

void ReservesOneThread() {
  KnapsackExecutor executor;
  Expect(executor.RequestedThreads(Request(), 1, 8) == 1, "Knapsack reserves one thread");
  bool rejected = false;
  try {
    executor.RequestedThreads(Request(), 2, 8);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "Knapsack rejects multi-thread reservations");
}

void RejectsMalformedDimensions() {
  KnapsackExecutor executor;
  bridge::KnapsackBridgeRequest request;
  request.set_solver_type(5);
  request.add_profits(1);
  request.add_weights()->add_values(1);
  JobScheduler scheduler({1, 8});
  auto handle = scheduler.Submit(JobSpec{"knapsack", 1}, [&](JobContext& context) {
    const auto result = executor.Execute(
        SolverExecutorRequest{1, "knapsack", request.SerializeAsString()},
        context, [](std::string) {});
    Expect(!result.ok, "Malformed dimensions produce execution failure");
    return JobResult::Succeeded();
  });
  Expect(handle.result().get().state == JobState::kSucceeded, "Validation test completes");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsMalformedDimensions", RejectsMalformedDimensions},
  };
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
      return EXIT_FAILURE;
    }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
