#include "server/src/pdlp_executor.h"

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "pdlp.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

bridge::PdlpBridgeRequest TinyLp(bridge::PdlpOperation operation) {
  bridge::PdlpBridgeRequest request;
  request.set_operation(operation);
  auto* qp = request.mutable_quadratic_program();
  qp->set_num_variables(1);
  qp->set_num_constraints(1);
  qp->set_objective_scaling_factor(1);
  qp->add_objective_vector(1);
  qp->add_constraint_lower_bounds(1);
  qp->add_constraint_upper_bounds(1);
  qp->add_variable_lower_bounds(0);
  qp->add_variable_upper_bounds(2);
  auto* entry = qp->add_constraint_matrix_entries();
  entry->set_row(0);
  entry->set_column(0);
  entry->set_value(1);
  return request;
}

SolverExecutorResult Execute(const bridge::PdlpBridgeRequest& request) {
  PdlpExecutor executor;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"pdlp", 1}, [&](JobContext& context) {
    execution = executor.Execute(
        SolverExecutorRequest{1, "pdlp", request.SerializeAsString()}, context,
        [](std::string) {});
    return execution.ok ? JobResult::Succeeded()
                        : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

bridge::PdlpBridgeResponse Response(const SolverExecutorResult& execution) {
  Expect(execution.ok, execution.error_message);
  bridge::PdlpBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "PDLP response parses");
  return response;
}

void DetectsLinearProgram() {
  Expect(Response(Execute(TinyLp(bridge::PDLP_OPERATION_IS_LINEAR))).is_linear(),
         "Tiny LP is linear");
}

void SolvesLinearProgram() {
  auto request = TinyLp(bridge::PDLP_OPERATION_SOLVE);
  request.mutable_parameters()->set_iteration_limit(1000);
  const auto response = Response(Execute(request));
  Expect(response.has_solver_result(), "PDLP solve returns a result");
  Expect(response.solver_result().primal_solution_size() == 1,
         "PDLP solve returns one primal value");
}

void ReservesOneThread() {
  PdlpExecutor executor;
  const auto request = TinyLp(bridge::PDLP_OPERATION_SOLVE);
  const SolverExecutorRequest encoded{1, "pdlp", request.SerializeAsString()};
  Expect(executor.RequestedThreads(encoded, 1, 8) == 1,
         "PDLP reserves one thread");
  bool rejected = false;
  try {
    executor.RequestedThreads(encoded, 2, 8);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "PDLP rejects unsupported multi-thread reservations");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"DetectsLinearProgram", DetectsLinearProgram},
      {"SolvesLinearProgram", SolvesLinearProgram},
      {"ReservesOneThread", ReservesOneThread},
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
