#include "server/src/mp_solver_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "CbcModel.hpp"
#include "mp_solver.pb.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
namespace linear = ::operations_research;

void Expect(bool condition, const std::string& message) { if (!condition) throw std::runtime_error(message); }

SolverExecutorRequest Request() {
  linear::MPModelRequest inner;
  inner.set_solver_type(linear::MPModelRequest::GLOP_LINEAR_PROGRAMMING);
  inner.mutable_model()->set_maximize(true);
  auto* variable = inner.mutable_model()->add_variable();
  variable->set_lower_bound(0);
  variable->set_upper_bound(4);
  variable->set_objective_coefficient(3);
  bridge::MpSolverBridgeRequest request;
  request.mutable_solve()->set_request_proto(inner.SerializeAsString());
  request.mutable_solve()->set_num_threads(1);
  return SolverExecutorRequest{1, "mp-solver", request.SerializeAsString()};
}

SolverExecutorResult Execute(const SolverExecutorRequest& request) {
  MpSolverExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"mp-solver", 1}, [&](JobContext& context) {
    execution = executor.Execute(request, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

void SolvesNestedProto() {
  const auto execution = Execute(Request());
  Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse outer;
  linear::MPSolutionResponse inner;
  Expect(outer.ParseFromString(execution.payload), "MP Solver bridge response parses");
  Expect(inner.ParseFromString(outer.response_proto()), "MPSolutionResponse parses");
  Expect(inner.status() == linear::MPSOLVER_OPTIMAL, "MP Solver finds optimum");
  Expect(inner.objective_value() == 12, "MP Solver returns objective");
}

void ReservesRequestedThreads() {
  MpSolverExecutor executor;
  auto request = Request();
  bridge::MpSolverBridgeRequest parsed;
  parsed.ParseFromString(request.payload);
  parsed.mutable_solve()->set_num_threads(2);
  request.payload = parsed.SerializeAsString();
  Expect(executor.RequestedThreads(request, 2, 4) == 2, "MP Solver reserves requested threads");
}

void UsesCbcBuildThreadCapability() {
  MpSolverExecutor executor;
  auto request = Request();
  bridge::MpSolverBridgeRequest outer;
  linear::MPModelRequest inner;
  Expect(outer.ParseFromString(request.payload), "MP Solver request parses");
  Expect(inner.ParseFromString(outer.solve().request_proto()), "MPModelRequest parses");
  inner.set_solver_type(linear::MPModelRequest::CBC_MIXED_INTEGER_PROGRAMMING);
  outer.mutable_solve()->set_request_proto(inner.SerializeAsString());
  outer.mutable_solve()->set_num_threads(2);
  request.payload = outer.SerializeAsString();

  const int expected_threads = CbcModel::haveMultiThreadSupport() ? 2 : 1;
  Expect(executor.RequestedThreads(request, 2, 4) == expected_threads,
         "MP Solver uses the CBC build's thread capability");
  Expect(Execute(request).ok, "CBC solve succeeds when multiple threads are requested");
}

void ReturnsSchemas() {
  bridge::MpSolverBridgeRequest request;
  request.mutable_schema();
  const auto result = Execute(SolverExecutorRequest{1, "mp-solver", request.SerializeAsString()});
  bridge::MpSolverBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload), "MP Solver schema response parses");
  Expect(!response.schema().linear_solver_proto_schema().empty(), "MP Solver returns linear schema");
}

void ReturnsUnavailableForUnsupportedBackend() {
  auto request = Request();
  bridge::MpSolverBridgeRequest outer_request;
  linear::MPModelRequest inner_request;
  Expect(outer_request.ParseFromString(request.payload), "MP Solver request parses");
  Expect(inner_request.ParseFromString(outer_request.solve().request_proto()),
         "MPModelRequest parses");
  inner_request.set_solver_type(linear::MPModelRequest::CPLEX_LINEAR_PROGRAMMING);
  outer_request.mutable_solve()->set_request_proto(inner_request.SerializeAsString());
  request.payload = outer_request.SerializeAsString();

  const auto execution = Execute(request);
  bridge::MpSolverBridgeResponse outer_response;
  linear::MPSolutionResponse inner_response;
  Expect(execution.ok && outer_response.ParseFromString(execution.payload),
         "MP Solver unavailable response parses");
  Expect(inner_response.ParseFromString(outer_response.response_proto()),
         "MPSolutionResponse parses");
  Expect(inner_response.status() == linear::MPSOLVER_SOLVER_TYPE_UNAVAILABLE,
         "unsupported backend returns unavailable status");
}

void SupportsKnapsackBackend() {
  auto request = Request();
  bridge::MpSolverBridgeRequest outer_request;
  linear::MPModelRequest inner_request;
  Expect(outer_request.ParseFromString(request.payload), "MP Solver request parses");
  Expect(inner_request.ParseFromString(outer_request.solve().request_proto()),
         "MPModelRequest parses");
  inner_request.set_solver_type(
      linear::MPModelRequest::KNAPSACK_MIXED_INTEGER_PROGRAMMING);
  outer_request.mutable_solve()->set_request_proto(inner_request.SerializeAsString());
  request.payload = outer_request.SerializeAsString();

  const auto execution = Execute(request);
  bridge::MpSolverBridgeResponse outer_response;
  linear::MPSolutionResponse inner_response;
  Expect(execution.ok && outer_response.ParseFromString(execution.payload),
         "MP Solver knapsack response parses");
  Expect(inner_response.ParseFromString(outer_response.response_proto()),
         "MPSolutionResponse parses");
  Expect(inner_response.status() != linear::MPSOLVER_SOLVER_TYPE_UNAVAILABLE,
         "knapsack backend is available");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesNestedProto", SolvesNestedProto},
      {"ReservesRequestedThreads", ReservesRequestedThreads},
      {"UsesCbcBuildThreadCapability", UsesCbcBuildThreadCapability},
      {"ReturnsSchemas", ReturnsSchemas},
      {"SupportsKnapsackBackend", SupportsKnapsackBackend},
      {"ReturnsUnavailableForUnsupportedBackend", ReturnsUnavailableForUnsupportedBackend}};
  for (const auto& [name, test] : tests) {
    try { test(); std::cout << "[PASS] " << name << '\n'; }
    catch (const std::exception& error) { std::cerr << "[FAIL] " << name << ": " << error.what() << '\n'; return EXIT_FAILURE; }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
