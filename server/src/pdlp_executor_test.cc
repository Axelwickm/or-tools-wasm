#include "server/src/pdlp_executor.h"

#include <future>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#include "pdlp.pb.h"
#include "ortools/pdlp/solvers.pb.h"
#include "ortools/pdlp/solve_log.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

void PopulateTinyLp(bridge::PdlpQuadraticProgram* qp) {
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
}

bridge::PdlpBridgeRequest TinyLpIsLinearRequest() {
  bridge::PdlpBridgeRequest request;
  PopulateTinyLp(request.mutable_is_linear()->mutable_quadratic_program());
  return request;
}

bridge::PdlpBridgeRequest TinyLpSolveRequest() {
  bridge::PdlpBridgeRequest request;
  PopulateTinyLp(request.mutable_solve()->mutable_quadratic_program());
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
  Expect(Response(Execute(TinyLpIsLinearRequest())).is_linear_result().value(),
         "Tiny LP is linear");
}

void SolvesLinearProgram() {
  auto request = TinyLpSolveRequest();
  request.mutable_solve()->mutable_parameters()->set_iteration_limit(1000);
  const auto response = Response(Execute(request));
  Expect(response.has_solve_result(), "PDLP solve returns a result");
  Expect(response.solve_result().solver_result().primal_solution_size() == 1,
         "PDLP solve returns one primal value");
}

void ReservesSolverThreads() {
  PdlpExecutor executor;
  auto request = TinyLpSolveRequest();
  const SolverExecutorRequest encoded{1, "pdlp", request.SerializeAsString()};
  Expect(executor.RequestedThreads(encoded, 1, 8) == 1,
         "PDLP reserves one thread");

  request.mutable_solve()->mutable_parameters()->set_num_threads(2);
  const SolverExecutorRequest parallel{1, "pdlp", request.SerializeAsString()};
  Expect(executor.RequestedThreads(parallel, 2, 8) == 2,
         "PDLP reserves its requested solver threads");

  bool mismatch_rejected = false;
  try {
    executor.RequestedThreads(parallel, 3, 8);
  } catch (const std::invalid_argument&) {
    mismatch_rejected = true;
  }
  Expect(mismatch_rejected,
         "PDLP rejects scheduler reservations that disagree with num_threads");
}

void HonorsNativeControlsAndReturnsFullLog() {
  auto request = TinyLpSolveRequest();
  operations_research::pdlp::PrimalDualHybridGradientParams params;
  params.mutable_termination_criteria()->set_time_sec_limit(0);
  params.mutable_presolve_options()->set_use_glop(false);
  request.mutable_solve()->mutable_parameters()->set_native_parameters(params.SerializeAsString());
  const auto response = Response(Execute(request));
  operations_research::pdlp::SolveLog log;
  Expect(log.ParseFromString(response.solve_result().solver_result().native_solve_log()), "Native SolveLog parses");
  Expect(log.termination_reason() == operations_research::pdlp::TERMINATION_REASON_TIME_LIMIT, "Native zero time limit stops PDLP");
  Expect(log.iteration_count() == 0, "Zero time limit prevents iterations");
  Expect(log.params().termination_criteria().has_time_sec_limit(), "Native log retains explicit zero presence");
}

void DeliversProgressAndInterruptsNativeSearch() {
  for (const bool cancel : {false, true}) {
    auto request = TinyLpSolveRequest();
    request.mutable_solve()->set_callback_flags(3);
    operations_research::pdlp::PrimalDualHybridGradientParams params;
    params.set_verbosity_level(2);
    params.set_termination_check_frequency(1);
    params.mutable_presolve_options()->set_use_glop(false);
    request.mutable_solve()->mutable_parameters()->set_native_parameters(params.SerializeAsString());
    PdlpExecutor executor;
    JobScheduler scheduler({2, 8});
    SolverExecutorResult execution;
    int logs = 0, iterations = 0, last_iteration = 0;
    std::promise<void> submitted;
    const auto ready = submitted.get_future().share();
    JobHandle handle;
    handle = scheduler.Submit(JobSpec{"pdlp", 1}, [&](JobContext& context) {
      ready.wait();
      execution = executor.Execute({1, "pdlp", request.SerializeAsString()}, context,
          [&](std::string payload) {
            bridge::PdlpBridgeResponse event;
            Expect(event.ParseFromString(payload) && event.has_solve_event(), "Native progress event parses");
            if (event.solve_event().has_log()) { ++logs; return; }
            const auto& info = event.solve_event().iteration();
            operations_research::pdlp::IterationStats stats;
            operations_research::pdlp::TerminationCriteria criteria;
            Expect(stats.ParseFromString(info.iteration_stats()), "Full native iteration stats parse");
            Expect(criteria.ParseFromString(info.termination_criteria()), "Full native criteria parse");
            Expect(std::isfinite(info.l2_norm_primal_linear_objective()), "Callback retains native bound norms");
            ++iterations;
            last_iteration = stats.iteration_number();
            if (cancel && iterations == 1) handle.Cancel();
          });
      return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
    });
    submitted.set_value();
    handle.result().get();
    const auto response = Response(execution);
    const auto& result = response.solve_result().solver_result();
    Expect(logs > 0 && iterations > 0, "Logs and iteration callbacks are native search events");
    if (cancel) {
      Expect(result.termination_reason() == operations_research::pdlp::TERMINATION_REASON_INTERRUPTED_BY_USER,
             "Cancellation from actual progress interrupts native PDLP");
    } else {
      Expect(result.termination_reason() == operations_research::pdlp::TERMINATION_REASON_OPTIMAL,
             "Progress observation preserves the optimum");
      Expect(iterations > 1 && last_iteration > 0, "Progress includes actual iterative work");
    }
  }
  const auto reused = Response(Execute(TinyLpSolveRequest()));
  Expect(reused.solve_result().solver_result().termination_reason() == operations_research::pdlp::TERMINATION_REASON_OPTIMAL,
         "Native PDLP remains usable after interruption");
}

void ReservesNativeParameterThreads() {
  auto request = TinyLpSolveRequest();
  operations_research::pdlp::PrimalDualHybridGradientParams params;
  params.set_num_threads(2);
  auto* bridge_params = request.mutable_solve()->mutable_parameters();
  bridge_params->set_native_parameters(params.SerializeAsString());
  PdlpExecutor executor;
  Expect(executor.RequestedThreads({1, "pdlp", request.SerializeAsString()}, 2, 8) == 2,
         "Server derives reservation from native parameters without legacy hint");
  bridge_params->set_num_threads(1);
  bool rejected = false;
  try { executor.RequestedThreads({1, "pdlp", request.SerializeAsString()}, 1, 8); }
  catch (const std::invalid_argument&) { rejected = true; }
  Expect(rejected, "Server rejects native/bridge thread disagreement");
}

void ImportsModelsWithNativeParsersAndDiagnostics() {
  const std::string text = R"(name: "imported" maximize: true objective_offset: 5
    variable { name: "x" lower_bound: 0 upper_bound: 4 objective_coefficient: 3 }
    constraint { name: "capacity" upper_bound: 4 var_index: 0 coefficient: 1 })";
  bridge::PdlpBridgeRequest request;
  auto* input = request.mutable_from_mp_model();
  input->set_input_format(2); input->set_mp_model_proto(text); input->set_include_names(true);
  const auto imported = Response(Execute(request)).from_mp_model_result().quadratic_program();
  Expect(imported.problem_name() == "imported" && imported.variable_names(0) == "x", "Import retains names when requested");
  Expect(imported.objective_scaling_factor() == -1 && imported.objective_offset() == -5 && imported.objective_vector(0) == -3,
         "Maximization conversion retains native scaling and offset");
  auto solve = TinyLpSolveRequest();
  *solve.mutable_solve()->mutable_quadratic_program() = imported;
  const auto result = Response(Execute(solve)).solve_result().solver_result();
  Expect(std::abs(result.primal_solution(0) - 4) < 1e-5, "Imported model solves to its actual optimum");
  input->set_include_names(false);
  Expect(Response(Execute(request)).from_mp_model_result().quadratic_program().variable_names_size() == 0,
         "Names omitted by default");
  for (const auto& invalid : std::vector<std::pair<int, std::string>>{
      {1, "not MPS"}, {2, "not textproto"}, {3, "not JSON"}, {0, std::string(1, '\xff')},
      {2, "variable {} constraint { var_index: 0 }"},
      {2, "variable { is_integer: true }"},
      {2, "variable {} variable {} quadratic_objective { qvar1_index: 0 qvar2_index: 1 coefficient: 1 }"},
      {99, text}}) {
    input->set_input_format(invalid.first); input->set_mp_model_proto(invalid.second);
    const auto error = Execute(request);
    Expect(!error.ok && !error.error_message.empty(), "Invalid imports reject with native diagnostics without aborting");
  }
  input->set_input_format(2); input->set_mp_model_proto("variable { is_integer: true }"); input->set_relax_integer_variables(true);
  Expect(Execute(request).ok, "Integer relaxation requires an explicit option");
}

void RejectsNonfiniteCoefficientsBeforeRescaling() {
  const double infinity = std::numeric_limits<double>::infinity();
  for (const int field : {0, 1, 2, 3}) {
    auto request = TinyLpSolveRequest();
    auto* qp = request.mutable_solve()->mutable_quadratic_program();
    if (field == 0) qp->set_objective_vector(0, infinity);
    if (field == 1) qp->set_objective_scaling_factor(infinity);
    if (field == 2) { qp->set_has_objective_matrix_diagonal(true); qp->add_objective_matrix_diagonal(infinity); }
    if (field == 3) {
      qp->mutable_constraint_matrix_entries(0)->set_value(1e308);
      *qp->add_constraint_matrix_entries() = qp->constraint_matrix_entries(0);
    }
    const auto result = Response(Execute(request)).solve_result().solver_result();
    Expect(result.termination_reason() == operations_research::pdlp::TERMINATION_REASON_INVALID_PROBLEM,
           "Nonfinite coefficients, including native duplicate summation overflow, return InvalidProblem before rescaling");
  }
  const auto recovered = Response(Execute(TinyLpSolveRequest())).solve_result().solver_result();
  Expect(recovered.termination_reason() == operations_research::pdlp::TERMINATION_REASON_OPTIMAL,
         "Rejected numerical input does not poison subsequent native solves");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"RejectsNonfiniteCoefficientsBeforeRescaling", RejectsNonfiniteCoefficientsBeforeRescaling},
      {"HonorsNativeControlsAndReturnsFullLog", HonorsNativeControlsAndReturnsFullLog},
      {"ReservesNativeParameterThreads", ReservesNativeParameterThreads},
      {"DeliversProgressAndInterruptsNativeSearch", DeliversProgressAndInterruptsNativeSearch},
      {"ImportsModelsWithNativeParsersAndDiagnostics", ImportsModelsWithNativeParsersAndDiagnostics},
      {"DetectsLinearProgram", DetectsLinearProgram},
      {"SolvesLinearProgram", SolvesLinearProgram},
      {"ReservesSolverThreads", ReservesSolverThreads},
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
