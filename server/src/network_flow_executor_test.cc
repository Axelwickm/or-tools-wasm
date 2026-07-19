#include "server/src/network_flow_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "network_flow.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

SolverExecutorRequest Wrap(const bridge::NetworkFlowBridgeRequest& request) {
  return SolverExecutorRequest{1, "network-flow", request.SerializeAsString()};
}

SolverExecutorResult Execute(const SolverExecutorRequest& request) {
  NetworkFlowExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"network-flow", 1}, [&](JobContext& context) {
    execution = executor.Execute(request, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded()
                        : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

bridge::NetworkFlowBridgeResponse Parse(const SolverExecutorResult& execution) {
  Expect(execution.ok, execution.error_message);
  bridge::NetworkFlowBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Network Flow response parses");
  return response;
}

void SolvesMaxFlow() {
  bridge::NetworkFlowBridgeRequest request;
  auto* max_flow = request.mutable_max_flow();
  for (double value : {0, 0, 1}) max_flow->add_tails(value);
  for (double value : {1, 2, 2}) max_flow->add_heads(value);
  for (double value : {3, 2, 4}) max_flow->add_capacities(value);
  max_flow->set_source(0);
  max_flow->set_sink(2);
  const auto response = Parse(Execute(Wrap(request)));
  Expect(response.status() == 0, "Max Flow is optimal");
  Expect(response.optimal_flow() == 5, "Max Flow has expected objective");
  Expect(response.flows_size() == 3, "Max Flow returns arc flows");
}

void SolvesMinCostFlow() {
  bridge::NetworkFlowBridgeRequest request;
  auto* min_cost = request.mutable_min_cost_flow();
  min_cost->add_tails(0);
  min_cost->add_heads(1);
  min_cost->add_capacities(4);
  min_cost->add_unit_costs(3);
  min_cost->add_supplies(4);
  min_cost->add_supplies(-4);
  const auto response = Parse(Execute(Wrap(request)));
  Expect(response.status() == 1, "Min Cost Flow is optimal");
  Expect(response.optimal_cost() == 12, "Min Cost Flow has expected cost");
  Expect(response.maximum_flow() == 4, "Min Cost Flow has expected flow");
}

void SolvesAssignment() {
  bridge::NetworkFlowBridgeRequest request;
  auto* assignment = request.mutable_linear_sum_assignment();
  for (double value : {0, 0, 1, 1}) assignment->add_left_nodes(value);
  for (double value : {0, 1, 0, 1}) assignment->add_right_nodes(value);
  for (double value : {1, 5, 4, 2}) assignment->add_costs(value);
  const auto response = Parse(Execute(Wrap(request)));
  Expect(response.status() == 0, "Assignment is optimal");
  Expect(response.optimal_cost() == 3, "Assignment has expected cost");
  Expect(response.right_mates_size() == 2, "Assignment returns both mates");
}

void ReservesOneThread() {
  NetworkFlowExecutor executor;
  bridge::NetworkFlowBridgeRequest request;
  request.mutable_max_flow();
  Expect(executor.RequestedThreads(Wrap(request), 1, 8) == 1,
         "Network Flow reserves one thread");
  bool rejected = false;
  try {
    executor.RequestedThreads(Wrap(request), 2, 8);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "Network Flow rejects multi-thread reservations");
}

void RejectsMalformedRequest() {
  const auto result = Execute(SolverExecutorRequest{1, "network-flow", "not protobuf"});
  Expect(!result.ok, "Malformed request produces execution failure");
}

void RejectsMismatchedArrays() {
  bridge::NetworkFlowBridgeRequest request;
  request.mutable_max_flow()->add_tails(0);
  const auto result = Execute(Wrap(request));
  Expect(!result.ok, "Mismatched arrays produce execution failure");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesMaxFlow", SolvesMaxFlow},
      {"SolvesMinCostFlow", SolvesMinCostFlow},
      {"SolvesAssignment", SolvesAssignment},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsMalformedRequest", RejectsMalformedRequest},
      {"RejectsMismatchedArrays", RejectsMismatchedArrays},
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
