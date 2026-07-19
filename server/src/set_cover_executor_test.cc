#include "server/src/set_cover_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "server/src/job_scheduler.h"
#include "set_cover.pb.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

SolverExecutorRequest Request() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  for (double cost : {1, 1, 1}) request.add_costs(cost);
  for (int start : {0, 2, 4, 5}) request.add_starts(start);
  for (int element : {0, 1, 1, 2, 2}) request.add_elements(element);
  for (int i = 0; i < 3; ++i) request.add_selected(false);
  request.set_max_iterations(100);
  return SolverExecutorRequest{1, "set-cover", request.SerializeAsString()};
}

SolverExecutorResult Execute(const SolverExecutorRequest& request) {
  SetCoverExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"set-cover", 1}, [&](JobContext& context) {
    execution = executor.Execute(request, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

void SolvesAndSerializesResult() {
  const auto execution = Execute(Request());
  Expect(execution.ok, execution.error_message);
  bridge::SetCoverBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Set Cover response parses");
  Expect(response.next_solution(), "Set Cover finds a solution");
  Expect(response.num_uncovered_elements() == 0, "Set Cover covers all elements");
  Expect(response.selected_size() == 3, "Set Cover returns one selection per subset");
}

void ReservesOneThread() {
  SetCoverExecutor executor;
  Expect(executor.RequestedThreads(Request(), 1, 8) == 1, "Set Cover reserves one thread");
  bool rejected = false;
  try {
    executor.RequestedThreads(Request(), 2, 8);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "Set Cover rejects multi-thread reservations");
}

void RejectsMismatchedDimensions() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  request.add_costs(1);
  const auto result = Execute(SolverExecutorRequest{1, "set-cover", request.SerializeAsString()});
  Expect(!result.ok, "Mismatched dimensions produce execution failure");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsMismatchedDimensions", RejectsMismatchedDimensions},
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
