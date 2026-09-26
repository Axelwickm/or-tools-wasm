#include "server/src/network_flow_executor.h"

#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "network_flow.pb.h"
#include "ortools/graph/assignment.h"
#include "ortools/graph/max_flow.h"
#include "ortools/graph/min_cost_flow.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::SimpleLinearSumAssignment;
using ::operations_research::SimpleMaxFlow;
using ::operations_research::SimpleMinCostFlow;

SolverExecutorResult Error(std::string message) {
  SolverExecutorResult result;
  result.ok = false;
  result.error_message = std::move(message);
  result.failure_kind = SolverExecutionFailureKind::kInvalidRequest;
  return result;
}

template <typename... Repeated>
bool SameSize(const Repeated&... values) {
  const int sizes[] = {values.size()...};
  for (int size : sizes) {
    if (size != sizes[0]) return false;
  }
  return true;
}

SolverExecutorResult Serialize(const bridge::NetworkFlowBridgeResponse& response) {
  std::string payload;
  if (!response.SerializeToString(&payload)) {
    return Error("Failed to serialize Network Flow response.");
  }
  return SolverExecutorResult{true, std::move(payload), {}};
}

SolverExecutorResult SolveMaxFlow(const bridge::MaxFlowRequest& request) {
  if (!SameSize(request.tails(), request.heads(), request.capacities())) {
    return Error("SimpleMaxFlow input arrays must have equal lengths.");
  }
  SimpleMaxFlow solver;
  for (int arc = 0; arc < request.tails_size(); ++arc) {
    solver.AddArcWithCapacity(request.tails(arc), request.heads(arc), request.capacities(arc));
  }

  const auto status = solver.Solve(request.source(), request.sink());
  bridge::NetworkFlowBridgeResponse response;
  response.set_status(status);
  response.set_optimal_flow(solver.OptimalFlow());
  response.set_num_nodes(solver.NumNodes());
  response.set_num_arcs(solver.NumArcs());
  if (status == SimpleMaxFlow::OPTIMAL) {
    for (int arc = 0; arc < solver.NumArcs(); ++arc) {
      response.add_flows(solver.Flow(arc));
    }
    std::vector<int32_t> source_cut;
    std::vector<int32_t> sink_cut;
    solver.GetSourceSideMinCut(&source_cut);
    solver.GetSinkSideMinCut(&sink_cut);
    for (int node : source_cut) response.add_source_side_min_cut(node);
    for (int node : sink_cut) response.add_sink_side_min_cut(node);
  }
  return Serialize(response);
}

SolverExecutorResult SolveMinCostFlow(const bridge::MinCostFlowRequest& request) {
  if (!SameSize(request.tails(), request.heads(), request.capacities(),
                request.unit_costs())) {
    return Error("SimpleMinCostFlow arc arrays must have equal lengths.");
  }
  SimpleMinCostFlow solver;
  for (int arc = 0; arc < request.tails_size(); ++arc) {
    solver.AddArcWithCapacityAndUnitCost(request.tails(arc), request.heads(arc),
                                        request.capacities(arc), request.unit_costs(arc));
  }
  for (int node = 0; node < request.supplies_size(); ++node) {
    solver.SetNodeSupply(node, request.supplies(node));
  }

  const auto status = request.solve_max_flow_with_min_cost()
                          ? solver.SolveMaxFlowWithMinCost()
                          : solver.Solve();
  bridge::NetworkFlowBridgeResponse response;
  response.set_status(status);
  response.set_optimal_cost(solver.OptimalCost());
  response.set_maximum_flow(solver.MaximumFlow());
  response.set_num_nodes(solver.NumNodes());
  response.set_num_arcs(solver.NumArcs());
  if (status == SimpleMinCostFlow::OPTIMAL || status == SimpleMinCostFlow::FEASIBLE) {
    for (int arc = 0; arc < solver.NumArcs(); ++arc) {
      response.add_flows(solver.Flow(arc));
    }
  }
  return Serialize(response);
}

SolverExecutorResult SolveAssignment(
    const bridge::LinearSumAssignmentRequest& request) {
  if (!SameSize(request.left_nodes(), request.right_nodes(), request.costs())) {
    return Error("SimpleLinearSumAssignment input arrays must have equal lengths.");
  }
  SimpleLinearSumAssignment solver;
  solver.ReserveArcs(request.left_nodes_size());
  for (int arc = 0; arc < request.left_nodes_size(); ++arc) {
    solver.AddArcWithCost(request.left_nodes(arc), request.right_nodes(arc), request.costs(arc));
  }

  const auto status = solver.Solve();
  bridge::NetworkFlowBridgeResponse response;
  response.set_status(status);
  response.set_optimal_cost(solver.OptimalCost());
  response.set_num_nodes(solver.NumNodes());
  response.set_num_arcs(solver.NumArcs());
  if (status == SimpleLinearSumAssignment::OPTIMAL) {
    for (int node = 0; node < solver.NumNodes(); ++node) {
      response.add_right_mates(solver.RightMate(node));
      response.add_assignment_costs(solver.AssignmentCost(node));
    }
  }
  return Serialize(response);
}

}  // namespace

std::string NetworkFlowExecutor::solver() const { return "network-flow"; }

int NetworkFlowExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                          int client_requested_threads,
                                          int server_total_threads) const {
  bridge::NetworkFlowBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload) ||
      parsed.payload_case() == bridge::NetworkFlowBridgeRequest::PAYLOAD_NOT_SET) {
    throw std::invalid_argument("Failed to parse Network Flow bridge request.");
  }
  if (client_requested_threads != 0 && client_requested_threads != 1) {
    throw std::invalid_argument("Network Flow jobs require exactly one thread.");
  }
  if (server_total_threads < 1) {
    throw std::invalid_argument("Server has no Network Flow capacity.");
  }
  return 1;
}

SolverExecutorResult NetworkFlowExecutor::Execute(
    const SolverExecutorRequest& request, const JobContext& context,
    const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::NetworkFlowBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) {
    return Error("Failed to parse Network Flow bridge request.");
  }
  if (context.cancellation_requested()) {
    auto result = Error("Network Flow solve was cancelled before it started.");
    result.failure_kind = SolverExecutionFailureKind::kCancelled;
    return result;
  }
  switch (parsed.payload_case()) {
    case bridge::NetworkFlowBridgeRequest::kMaxFlow:
      return SolveMaxFlow(parsed.max_flow());
    case bridge::NetworkFlowBridgeRequest::kMinCostFlow:
      return SolveMinCostFlow(parsed.min_cost_flow());
    case bridge::NetworkFlowBridgeRequest::kLinearSumAssignment:
      return SolveAssignment(parsed.linear_sum_assignment());
    case bridge::NetworkFlowBridgeRequest::PAYLOAD_NOT_SET:
      return Error("Network Flow request has no operation.");
  }
  return Error("Unknown Network Flow operation.");
}

}  // namespace ortools_wasm::server
