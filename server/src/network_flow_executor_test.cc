#include "server/src/network_flow_executor.h"

#include <cstdlib>
#include <iostream>
#include <limits>
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

void RejectsUnsafeEndpointsAndRecovers() {
  const int32_t maximum = std::numeric_limits<int32_t>::max();
  for (int operation : {0, 1, 2}) {
    const int32_t first_invalid = operation == 0 ? maximum - 1
        : operation == 1 ? maximum - 3 : maximum / 2;
    for (int32_t invalid : {-1, first_invalid, maximum}) {
      for (bool invalid_tail : {false, true}) {
        bridge::NetworkFlowBridgeRequest request;
        if (operation == 0) {
          auto* flow = request.mutable_max_flow();
          flow->add_tails(invalid_tail ? invalid : 0);
          flow->add_heads(invalid_tail ? 1 : invalid);
          flow->add_capacities(2); flow->set_source(0); flow->set_sink(1);
        } else if (operation == 1) {
          auto* flow = request.mutable_min_cost_flow();
          flow->add_tails(invalid_tail ? invalid : 0);
          flow->add_heads(invalid_tail ? 1 : invalid);
          flow->add_capacities(2); flow->add_unit_costs(3);
        } else {
          auto* assignment = request.mutable_linear_sum_assignment();
          assignment->add_left_nodes(invalid_tail ? invalid : 0);
          assignment->add_right_nodes(invalid_tail ? 0 : invalid);
          assignment->add_costs(2);
        }
        const auto result = Execute(Wrap(request));
        Expect(!result.ok && result.failure_kind == SolverExecutionFailureKind::kInvalidRequest,
               "Unsafe raw endpoints reject before native graph construction");
      }
    }
  }
  SolvesMaxFlow(); SolvesMinCostFlow(); SolvesAssignment();
}

void MinCostRangeFailuresAndRecovery() {
  const int64_t maximum = std::numeric_limits<int64_t>::max();
  const int64_t minimum = std::numeric_limits<int64_t>::min();
  bridge::NetworkFlowBridgeRequest request;
  auto* flow = request.mutable_min_cost_flow();
  flow->add_tails(0); flow->add_heads(1);
  flow->add_capacities(3); flow->add_unit_costs(2);
  for (const auto& supplies : std::vector<std::pair<int64_t, int64_t>>{
           {maximum, 1}, {-maximum, -1}, {0, minimum}}) {
    flow->clear_supplies(); flow->add_supplies(supplies.first); flow->add_supplies(supplies.second);
    for (bool adjust : {false, true}) {
      flow->set_solve_max_flow_with_min_cost(adjust);
      const auto result = Parse(Execute(Wrap(request)));
      Expect(result.status() == 7 && result.flows_size() == 0,
             "Supply arithmetic rejects with native BAD_CAPACITY_RANGE");
    }
  }
  flow->set_solve_max_flow_with_min_cost(false);
  flow->clear_supplies(); flow->add_supplies(3); flow->add_supplies(-3);
  const auto recovered = Parse(Execute(Wrap(request)));
  Expect(recovered.status() == 1 && recovered.optimal_cost() == 6 && recovered.flows(0) == 3,
         "Native min-cost flow recovers after unsafe supplies");
  for (int64_t cost : {minimum, maximum}) {
    flow->set_unit_costs(0, cost);
    Expect(Parse(Execute(Wrap(request))).status() == 6,
           "Unsafe cost reports native BAD_COST_RANGE");
  }
}

void AssignmentSignedScalingAndExactCost() {
  const int64_t maximum = std::numeric_limits<int64_t>::max();
  bridge::NetworkFlowBridgeRequest request;
  auto* assignment = request.mutable_linear_sum_assignment();
  assignment->add_left_nodes(0); assignment->add_right_nodes(0); assignment->add_costs(0);
  for (int64_t cost : {std::numeric_limits<int64_t>::min(), -maximum, -(maximum / 2) - 1, maximum}) {
    assignment->set_costs(0, cost);
    const auto result = Parse(Execute(Wrap(request)));
    Expect(result.status() == 2 && result.right_mates_size() == 0,
           "Both signs of unsafe scaling report POSSIBLE_OVERFLOW");
  }
  assignment->set_costs(0, -9007199254740993LL);
  const auto result = Parse(Execute(Wrap(request)));
  Expect(result.status() == 0 && result.optimal_cost() == -9007199254740993LL && result.right_mates(0) == 0,
         "Safe negative costs retain exact int64 optimization");
}

void MaxFlowInt64AndStatusBoundaries() {
  bridge::NetworkFlowBridgeRequest request;
  auto* flow = request.mutable_max_flow();
  flow->add_tails(0); flow->add_heads(1);
  flow->add_capacities(std::numeric_limits<int64_t>::max());
  flow->set_source(0); flow->set_sink(1);
  const auto exact = Parse(Execute(Wrap(request)));
  Expect(exact.status() == 0 && exact.optimal_flow() == std::numeric_limits<int64_t>::max(),
         "Full int64 capacity is preserved");
  flow->add_tails(0); flow->add_heads(1); flow->add_capacities(1);
  Expect(Parse(Execute(Wrap(request))).status() == 1, "Overflow remains native status");
  flow->set_sink(0);
  Expect(Parse(Execute(Wrap(request))).status() == 2, "Equal endpoints remain native BAD_INPUT");
  flow->set_source(std::numeric_limits<int32_t>::max()); flow->set_sink(1);
  const auto outside = Parse(Execute(Wrap(request)));
  Expect(outside.status() == 0 && outside.optimal_flow() == 0 && outside.flows_size() == 2,
         "Out-of-graph source remains native optimal zero");
  flow->set_source(-1);
  Expect(Parse(Execute(Wrap(request))).status() == 2, "Raw negative source remains native BAD_INPUT");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesMaxFlow", SolvesMaxFlow},
      {"SolvesMinCostFlow", SolvesMinCostFlow},
      {"SolvesAssignment", SolvesAssignment},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsMalformedRequest", RejectsMalformedRequest},
      {"RejectsMismatchedArrays", RejectsMismatchedArrays},
      {"RejectsUnsafeEndpointsAndRecovers", RejectsUnsafeEndpointsAndRecovers},
      {"MinCostRangeFailuresAndRecovery", MinCostRangeFailuresAndRecovery},
      {"AssignmentSignedScalingAndExactCost", AssignmentSignedScalingAndExactCost},
      {"MaxFlowInt64AndStatusBoundaries", MaxFlowInt64AndStatusBoundaries},
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
