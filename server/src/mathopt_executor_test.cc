#include "server/src/mathopt_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "mathopt.pb.h"
#include "ortools/math_opt/rpc.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
namespace math_opt = ::operations_research::math_opt;

void Expect(bool condition, const std::string& message) { if (!condition) throw std::runtime_error(message); }

math_opt::SolveRequest InnerRequest() {
  math_opt::SolveRequest request;
  request.set_solver_type(math_opt::SOLVER_TYPE_GLOP);
  request.mutable_model()->set_name("simple");
  auto* variables = request.mutable_model()->mutable_variables();
  variables->add_ids(0);
  variables->add_lower_bounds(0);
  variables->add_upper_bounds(4);
  variables->add_integers(false);
  auto* objective = request.mutable_model()->mutable_objective();
  objective->set_maximize(true);
  objective->mutable_linear_coefficients()->add_ids(0);
  objective->mutable_linear_coefficients()->add_values(3);
  request.mutable_parameters()->set_threads(1);
  return request;
}

SolverExecutorResult Execute(MathOptExecutor* executor, const bridge::MathOptBridgeRequest& request) {
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"mathopt", 1}, [&](JobContext& context) {
    execution = executor->Execute(SolverExecutorRequest{1, "mathopt", request.SerializeAsString()}, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

math_opt::SolveResponse InnerResponse(const SolverExecutorResult& execution) {
  Expect(execution.ok, execution.error_message);
  bridge::MathOptBridgeResponse outer;
  math_opt::SolveResponse inner;
  Expect(outer.ParseFromString(execution.payload), "MathOpt bridge response parses");
  Expect(inner.ParseFromString(outer.solve_response_proto()), "MathOpt SolveResponse parses");
  return inner;
}

void SolvesNestedProto() {
  MathOptExecutor executor;
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(InnerRequest().SerializeAsString());
  const auto response = InnerResponse(Execute(&executor, request));
  Expect(!response.has_status(), "MathOpt solve has no error status");
  Expect(response.has_result(), "MathOpt solve returns a result");
}

void CreatesAndDeletesIncrementalSession() {
  MathOptExecutor executor;
  bridge::MathOptBridgeRequest create;
  create.mutable_incremental_create()->set_solve_request_proto(InnerRequest().SerializeAsString());
  const auto created = InnerResponse(Execute(&executor, create));
  Expect(created.messages_size() == 1, "MathOpt returns an incremental handle");
  const uint64_t handle = std::stoull(created.messages(0));
  bridge::MathOptBridgeRequest remove;
  remove.mutable_incremental_delete()->set_handle(handle);
  Expect(Execute(&executor, remove).ok, "MathOpt deletes incremental session");
}

void ReservesNestedThreadCount() {
  MathOptExecutor executor;
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(InnerRequest().SerializeAsString());
  const SolverExecutorRequest outer{1, "mathopt", request.SerializeAsString()};
  Expect(executor.RequestedThreads(outer, 1, 4) == 1, "MathOpt reserves nested thread count");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"SolvesNestedProto", SolvesNestedProto}, {"CreatesAndDeletesIncrementalSession", CreatesAndDeletesIncrementalSession}, {"ReservesNestedThreadCount", ReservesNestedThreadCount}};
  for (const auto& [name, test] : tests) {
    try { test(); std::cout << "[PASS] " << name << '\n'; }
    catch (const std::exception& error) { std::cerr << "[FAIL] " << name << ": " << error.what() << '\n'; return EXIT_FAILURE; }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
