#include "server/src/cp_sat_executor.h"

#include <cstdlib>
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "cp_sat.pb.h"
#include "google/protobuf/text_format.h"
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/cp_model_solver.h"
#include "ortools/sat/sat_parameters.pb.h"
#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
namespace sat = ::operations_research::sat;

class TestFailure : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

void Expect(bool condition, const std::string& message) {
  if (!condition) throw TestFailure(message);
}

template <typename Lhs, typename Rhs>
void ExpectEq(const Lhs& lhs, const Rhs& rhs, const std::string& message) {
  if (!(lhs == rhs)) throw TestFailure(message);
}

SolverExecutorRequest SolveRequest(int num_workers, bool enumerate_all,
                                   bool solution_events,
                                   int num_search_workers = 0) {
  sat::CpModelProto model;
  for (const char* name : {"x", "y"}) {
    auto* variable = model.add_variables();
    variable->set_name(name);
    variable->add_domain(0);
    variable->add_domain(5);
  }
  auto* linear = model.add_constraints()->mutable_linear();
  linear->add_vars(0);
  linear->add_vars(1);
  linear->add_coeffs(1);
  linear->add_coeffs(1);
  linear->add_domain(6);
  linear->add_domain(6);

  sat::SatParameters parameters;
  parameters.set_num_workers(num_workers);
  parameters.set_num_search_workers(num_search_workers);
  parameters.set_enumerate_all_solutions(enumerate_all);

  bridge::CpSatBridgeRequest request;
  auto* solve = request.mutable_solve();
  solve->set_cp_model_proto(model.SerializeAsString());
  solve->set_sat_parameters_proto(parameters.SerializeAsString());
  solve->mutable_callback_mask()->set_solution(solution_events);

  return SolverExecutorRequest{7, "cp-sat", request.SerializeAsString()};
}

SolverExecutorRequest LongEnumerationRequest() {
  sat::CpModelProto model;
  for (int index = 0; index < 40; ++index) {
    auto* variable = model.add_variables();
    variable->add_domain(0);
    variable->add_domain(1);
  }
  sat::SatParameters parameters;
  parameters.set_num_workers(1);
  parameters.set_enumerate_all_solutions(true);
  bridge::CpSatBridgeRequest request;
  request.mutable_solve()->set_cp_model_proto(model.SerializeAsString());
  request.mutable_solve()->set_sat_parameters_proto(parameters.SerializeAsString());
  return SolverExecutorRequest{9, "cp-sat", request.SerializeAsString()};
}

void ResolvesThreadsWithoutChangingSolverParameters() {
  CpSatExecutor executor;
  const auto request = SolveRequest(2, false, false);
  ExpectEq(executor.RequestedThreads(request, 2, 8), 2,
           "explicit CP-SAT worker count determines scheduler reservation");
  bool deprecated_workers_rejected = false;
  try {
    executor.RequestedThreads(SolveRequest(0, false, false, 2), 2, 8);
  } catch (const std::invalid_argument& error) {
    deprecated_workers_rejected =
        std::string(error.what()).find("use num_workers") != std::string::npos;
  }
  Expect(deprecated_workers_rejected,
         "deprecated worker count is rejected with the supported replacement");

  bool mismatch_rejected = false;
  try {
    executor.RequestedThreads(request, 3, 8);
  } catch (const std::invalid_argument&) {
    mismatch_rejected = true;
  }
  Expect(mismatch_rejected, "scheduler hint cannot disagree with solver parameters");

  bool capacity_rejected = false;
  try {
    executor.RequestedThreads(SolveRequest(9, false, false), 9, 8);
  } catch (const std::invalid_argument&) {
    capacity_rejected = true;
  }
  Expect(capacity_rejected, "worker count above server capacity is rejected");
}

void AutomaticWorkersReserveServerCapacity() {
  CpSatExecutor executor;
  ExpectEq(executor.RequestedThreads(SolveRequest(0, false, false), 0, 8), 8,
           "automatic CP-SAT workers reserve the full server capacity");
}

void EmitsOnlyNativeEnumerationCallbacks() {
  CpSatExecutor executor;
  JobScheduler scheduler({1, 8});
  const SolverExecutorRequest request = SolveRequest(1, true, true);
  std::vector<std::string> event_payloads;
  SolverExecutorResult execution_result;

  auto handle = scheduler.Submit(
      JobSpec{"cp-sat", 1},
      [&](JobContext& context) {
        execution_result = executor.Execute(
            request, context,
            [&](std::string payload) { event_payloads.push_back(std::move(payload)); });
        return execution_result.ok
                   ? JobResult::Succeeded()
                   : JobResult::Failed(execution_result.error_message);
      });
  const JobResult job_result = handle.result().get();
  ExpectEq(job_result.state, JobState::kSucceeded,
           "enumeration job succeeds: " + job_result.message + " " +
               execution_result.error_message);
  Expect(execution_result.ok, "CP-SAT executor returns a result");

  int solution_events = 0;
  for (const std::string& payload : event_payloads) {
    bridge::CpSatBridgeResponse event;
    Expect(event.ParseFromString(payload), "callback payload parses");
    if (event.payload_case() == bridge::CpSatBridgeResponse::kSolveEvent &&
        event.solve_event().payload_case() ==
            bridge::CpSatSolveEvent::kSolutionProto) {
      ++solution_events;
    }
  }
  ExpectEq(solution_events, 5, "enumeration emits each native solution exactly once");

  bridge::CpSatBridgeResponse result;
  Expect(result.ParseFromString(execution_result.payload), "solve result parses");
  sat::CpSolverResponse solver_response;
  Expect(solver_response.ParseFromString(
             result.solve_result().cp_solver_response_proto()),
         "native solver response parses");
  ExpectEq(solver_response.status(), sat::CpSolverStatus::OPTIMAL,
           "enumeration completes with native OPTIMAL status");
}

void RunningSolveObservesCancellation() {
  using namespace std::chrono_literals;
  CpSatExecutor executor;
  JobScheduler scheduler({1, 8});
  const SolverExecutorRequest request = LongEnumerationRequest();
  auto handle = scheduler.Submit(JobSpec{"cp-sat", 1}, [&](JobContext& context) {
    const SolverExecutorResult result = executor.Execute(request, context, [](std::string) {});
    return result.ok ? JobResult::Succeeded()
                     : JobResult::Failed(result.error_message);
  });

  const auto deadline = std::chrono::steady_clock::now() + 2s;
  while (handle.status().state != JobState::kRunning &&
         std::chrono::steady_clock::now() < deadline) {
    std::this_thread::sleep_for(1ms);
  }
  ExpectEq(handle.status().state, JobState::kRunning,
           "long CP-SAT solve reaches running state");
  Expect(handle.Cancel(), "running cancellation is accepted");
  ExpectEq(handle.result().wait_for(2s), std::future_status::ready,
           "running CP-SAT cancellation completes promptly");
  ExpectEq(handle.result().get().state, JobState::kCancelled,
           "running CP-SAT cancellation is reported truthfully");
}

SolverExecutorResult DiagnosticRequest(const bridge::CpSatBridgeRequest& request) {
  JobScheduler scheduler({1, 8}); CpSatExecutor executor;
  SolverExecutorResult result;
  auto handle = scheduler.Submit(JobSpec{"cp-sat", 1}, [&](JobContext& context) {
    result = executor.Execute({1, "cp-sat", request.SerializeAsString()}, context, [](std::string) {});
    return result.ok ? JobResult::Succeeded() : JobResult::Failed(result.error_message);
  });
  handle.result().wait(); return result;
}
SolverExecutorResult StatisticsRequest(const std::string& bytes, bool response) {
  bridge::CpSatBridgeRequest request;
  if (response) request.set_response_stats(bytes); else request.set_model_stats(bytes);
  return DiagnosticRequest(request);
}
void ExportsCompleteNativeTextIncludingInvalidModels() {
  sat::CpModelProto model;
  model.set_name("escaped\"\nname");
  auto* variable = model.add_variables(); variable->set_name("x");
  variable->add_domain(-9007199254740993LL); variable->add_domain(9007199254740993LL);
  auto* row = model.add_constraints()->mutable_linear();
  row->add_vars(0); row->add_coeffs(7); row->add_domain(0); row->add_domain(7);
  model.mutable_solution_hint()->add_vars(0); model.mutable_solution_hint()->add_values(1);
  model.add_assumptions(0);
  model.mutable_objective()->add_vars(0); model.mutable_objective()->add_coeffs(2);
  const auto exported = [&](const std::string& bytes) {
    bridge::CpSatBridgeRequest request; request.set_export_model_text(bytes);
    return DiagnosticRequest(request);
  };
  const auto check = [&]() {
    const auto result = exported(model.SerializeAsString());
    bridge::CpSatBridgeResponse response;
    Expect(result.ok && response.ParseFromString(result.payload) && response.has_model_text(), "Model text response parses");
    std::string expected;
    Expect(google::protobuf::TextFormat::PrintToString(model, &expected), "Native text formatter succeeds");
    ExpectEq(response.model_text(), expected, "Export exactly matches native protobuf text");
    sat::CpModelProto recovered;
    Expect(google::protobuf::TextFormat::ParseFromString(response.model_text(), &recovered), "Text parses back into native model");
    ExpectEq(recovered.SerializeAsString(), model.SerializeAsString(), "Complete native model round trips");
  };
  check();
  variable->clear_domain(); variable->add_domain(0); check();
  Expect(!exported(std::string(1, static_cast<char>(0xff))).ok, "Malformed bytes reject");
  const auto empty = exported(""); bridge::CpSatBridgeResponse response;
  Expect(empty.ok && response.ParseFromString(empty.payload) && response.has_model_text() && response.model_text().empty(), "Empty text response preserves oneof presence and recovers");
}
void ReturnsExactNativeStatisticsAndRejectsMalformedInputs() {
  sat::CpModelProto model; model.set_name("native-statistics");
  auto* variable = model.add_variables(); variable->add_domain(0); variable->add_domain(4);
  auto result = StatisticsRequest(model.SerializeAsString(), false); bridge::CpSatBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload) && response.has_statistics(), "Model statistics response parses");
  ExpectEq(response.statistics(), sat::CpModelStats(model), "Model report equals native formatter exactly");
  sat::CpSolverResponse proto; proto.set_status(sat::CpSolverStatus::FEASIBLE); proto.set_num_branches(9007199254740993LL);
  result = StatisticsRequest(proto.SerializeAsString(), true); response.ParseFromString(result.payload);
  Expect(result.ok && response.statistics() == sat::CpSolverResponseStats(proto), "Response report preserves native exact int64 formatting");
  for (bool is_response : {false, true}) {
    Expect(!StatisticsRequest(std::string(1, static_cast<char>(0xff)), is_response).ok, "Malformed statistics bytes fail safely");
    Expect(StatisticsRequest("", is_response).ok, "Default protos recover after malformed input");
  }
  variable->clear_domain(); variable->add_domain(0);
  Expect(!StatisticsRequest(model.SerializeAsString(), false).ok, "Malformed domains reject before native formatting");
}

using TestFn = void (*)();

int RunAllTests() {
  const std::vector<std::pair<std::string, TestFn>> tests = {
      {"ExportsCompleteNativeTextIncludingInvalidModels", ExportsCompleteNativeTextIncludingInvalidModels},
      {"ReturnsExactNativeStatisticsAndRejectsMalformedInputs", ReturnsExactNativeStatisticsAndRejectsMalformedInputs},
      {"ResolvesThreadsWithoutChangingSolverParameters",
       ResolvesThreadsWithoutChangingSolverParameters},
      {"AutomaticWorkersReserveServerCapacity",
       AutomaticWorkersReserveServerCapacity},
      {"EmitsOnlyNativeEnumerationCallbacks", EmitsOnlyNativeEnumerationCallbacks},
      {"RunningSolveObservesCancellation", RunningSolveObservesCancellation},
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
