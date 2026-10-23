#include <unistd.h>
#include "absl/cleanup/cleanup.h"
#include "server/src/mp_solver_executor.h"

#include <cstdlib>
#include <atomic>
#include <thread>
#include "absl/synchronization/barrier.h"
#include "absl/log/log_entry.h"
#include "absl/log/log_sink.h"
#include "absl/log/log_sink_registry.h"
#include <cmath>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "CbcModel.hpp"
#include "mp_solver.pb.h"
#include "javascript/mp_solver_search.h"
#include "scip/scip.h"
#include "scip/scipdefplugins.h"
#include "ortools/lp_data/mps_reader.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/model_validator.h"
#include "ortools/linear_solver/model_exporter.h"
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
  Expect(outer.has_metadata(), "MP Solver returns native metadata");
  Expect(outer.metadata().variable_basis_status_size() == 1, "MP Solver returns actual variable basis");
  Expect(outer.metadata().solver_version().find("Glop") != std::string::npos, "Native backend version identifies Glop");
  Expect(outer.metadata().nodes() == -1, "LP node count is unsupported rather than zero");
}

void VerifiesNativeSolutionSnapshots() {
  linear::MPModelProto model;
  auto* x = model.add_variable();
  x->set_name("x"); x->set_lower_bound(0); x->set_upper_bound(1);
  x->set_objective_coefficient(3);
  auto* row = model.add_constraint();
  row->add_var_index(0); row->add_coefficient(1);
  row->set_lower_bound(0); row->set_upper_bound(0.5);
  linear::MPSolutionResponse solution;
  solution.set_status(linear::MPSOLVER_FEASIBLE);
  solution.add_variable_value(0.25); solution.set_objective_value(0.75);
  auto verify = [&](int backend, double tolerance, bool log_errors) {
    bridge::MpSolverBridgeRequest request;
    auto* input = request.mutable_verify_solution();
    input->set_model_proto(model.SerializeAsString());
    input->set_solution_proto(solution.SerializeAsString());
    input->set_solver_type(backend); input->set_tolerance(tolerance);
    input->set_log_errors(log_errors);
    const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::MpSolverBridgeResponse result;
    Expect(result.ParseFromString(execution.payload) && result.has_solution_verified(), "Native verification returns a boolean including false");
    return result.solution_verified();
  };
  Expect(verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, 0, false), "Valid candidate verifies without solving");
  solution.set_objective_value(1);
  Expect(!verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, 0, false), "Incorrect objective fails native verification");
  solution.set_variable_value(0, 2); solution.set_objective_value(6);
  class Sink : public absl::LogSink {
   public:
    std::atomic<int> violations{0};
    void Send(const absl::LogEntry& entry) override {
      if (entry.text_message().find("too high") != absl::string_view::npos) ++violations;
    }
  } sink;
  absl::AddLogSink(&sink);
  const bool quiet = verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, 0, false);
  const int quiet_count = sink.violations.load();
  const bool logged = verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, 0, true);
  const int logged_count = sink.violations.load();
  absl::RemoveLogSink(&sink);
  Expect(!quiet && !logged && quiet_count == 0 && logged_count >= 2, "logErrors controls native bound and row diagnostics");
  Expect(verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, -1, false), "Negative tolerance retains native semantics");
  solution.set_variable_value(0, 0.25); solution.set_objective_value(0.75);
  x->set_is_integer(true);
  Expect(verify(linear::MPSolver::GLOP_LINEAR_PROGRAMMING, 0, false), "Continuous backend skips integrality checks");

  bridge::MpSolverBridgeRequest invalid;
  auto* input = invalid.mutable_verify_solution();
  input->set_solver_type(linear::MPSolver::GLOP_LINEAR_PROGRAMMING);
  input->set_model_proto(model.SerializeAsString());
  for (const std::string& bytes : {std::string("\xff"), linear::MPSolutionResponse().SerializeAsString()}) {
    input->set_solution_proto(bytes);
    Expect(!Execute({1, "mp-solver", invalid.SerializeAsString()}).ok, "Malformed or unsolved snapshots reject before verification");
  }
  solution.clear_variable_value(); input->set_solution_proto(solution.SerializeAsString());
  Expect(!Execute({1, "mp-solver", invalid.SerializeAsString()}).ok, "Native loader rejects mismatched solution dimensions");
  input->set_model_proto("\xff");
  Expect(!Execute({1, "mp-solver", invalid.SerializeAsString()}).ok, "Malformed models reject");
}

void SolvesPdlpWithRequestedThreads() {
  auto request = Request();
  bridge::MpSolverBridgeRequest outer;
  linear::MPModelRequest inner;
  Expect(outer.ParseFromString(request.payload), "PDLP bridge request parses");
  Expect(inner.ParseFromString(outer.solve().request_proto()), "PDLP model parses");
  inner.set_solver_type(linear::MPModelRequest::PDLP_LINEAR_PROGRAMMING);
  inner.set_solver_specific_parameters(
      "termination_criteria { eps_optimal_absolute: 1e-9 eps_optimal_relative: 1e-9 }");
  outer.mutable_solve()->set_request_proto(inner.SerializeAsString());
  outer.mutable_solve()->set_num_threads(2);
  request.payload = outer.SerializeAsString();
  MpSolverExecutor executor;
  Expect(executor.RequestedThreads(request, 2, 4) == 2, "PDLP reserves two threads");
  const auto execution = Execute(request);
  bridge::MpSolverBridgeResponse response;
  linear::MPSolutionResponse solution;
  Expect(execution.ok && response.ParseFromString(execution.payload), "PDLP response parses");
  Expect(solution.ParseFromString(response.response_proto()), "PDLP solution parses");
  Expect(solution.status() == linear::MPSOLVER_OPTIMAL, "PDLP solves through MPSolver");
  Expect(std::abs(solution.objective_value() - 12) < 1e-7, "PDLP objective is correct");
  Expect(response.metadata().iterations() > 0, "PDLP performed native iterations");
  Expect(response.metadata().variable_basis_status_size() == 0, "PDLP does not fabricate simplex basis");
}

void EnforcesBackendThreadBudgets() {
  MpSolverExecutor executor;
  for (const auto type : {linear::MPModelRequest::SAT_INTEGER_PROGRAMMING,
                          linear::MPModelRequest::PDLP_LINEAR_PROGRAMMING}) {
    for (const bool ignore : {false, true}) {
      auto request = Request();
      bridge::MpSolverBridgeRequest outer;
      linear::MPModelRequest inner;
      outer.ParseFromString(request.payload);
      inner.ParseFromString(outer.solve().request_proto());
      inner.set_solver_type(type);
      inner.set_ignore_solver_specific_parameters_failure(ignore);
      inner.set_solver_specific_parameters(type == linear::MPModelRequest::SAT_INTEGER_PROGRAMMING
          ? "num_workers: 1000000" : "num_threads: 1000000");
      outer.mutable_solve()->set_request_proto(inner.SerializeAsString());
      request.payload = outer.SerializeAsString();
      bool rejected = false;
      try { executor.RequestedThreads(request, 1, 8); }
      catch (const std::invalid_argument& error) {
        rejected = std::string(error.what()).find("reserved numThreads budget") != std::string::npos;
      }
      Expect(rejected, "Conflicting backend thread count is rejected before allocation");
      const auto execution = Execute(request);
      bridge::MpSolverBridgeResponse response;
      linear::MPSolutionResponse solution;
      Expect(execution.ok && response.ParseFromString(execution.payload), "Rejection response parses");
      Expect(solution.ParseFromString(response.response_proto()), "Rejection status parses");
      Expect(solution.status() == linear::MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS,
             "Direct native execution also rejects thread-budget escape");
    }
  }
  auto request = Request();
  bridge::MpSolverBridgeRequest outer;
  linear::MPModelRequest inner;
  outer.ParseFromString(request.payload);
  inner.ParseFromString(outer.solve().request_proto());
  inner.set_solver_type(linear::MPModelRequest::SAT_INTEGER_PROGRAMMING);
  inner.set_solver_specific_parameters("num_workers: 0 enumerate_all_solutions: true mip_presolve_level: 0 cp_model_presolve: false");
  outer.mutable_solve()->set_request_proto(inner.SerializeAsString());
  request.payload = outer.SerializeAsString();
  auto execution = Execute(request);
  bridge::MpSolverBridgeResponse response;
  linear::MPSolutionResponse solution;
  Expect(execution.ok && response.ParseFromString(execution.payload) &&
         solution.ParseFromString(response.response_proto()), "Automatic SAT response parses");
  Expect(solution.status() == linear::MPSOLVER_OPTIMAL && solution.objective_value() == 12,
         "SAT automatic workers honor sequential enumeration budget");
  outer.mutable_solve()->set_num_threads(2);
  request.payload = outer.SerializeAsString();
  execution = Execute(request);
  Expect(execution.ok && response.ParseFromString(execution.payload) &&
         solution.ParseFromString(response.response_proto()), "Parallel SAT response parses");
  Expect(solution.status() == linear::MPSOLVER_OPTIMAL && solution.objective_value() == 12,
         "Native enumeration may reduce the admitted two-thread budget to one worker");
  Expect(Execute(Request()).ok, "Runtime remains usable after parameter rejection");
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

  Expect(CbcModel::haveMultiThreadSupport(),
         "CBC is compiled with multi-thread support");
  Expect(executor.RequestedThreads(request, 2, 4) == 2,
         "MP Solver reserves CBC's requested threads");
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

linear::MPModelProto ExportModel() {
  linear::MPModelProto model;
  model.set_name("export_roundtrip"); model.set_maximize(true); model.set_objective_offset(5);
  const double lower[] = {-2, 0, -linear::MPSolver::infinity(), 7};
  const double upper[] = {4, linear::MPSolver::infinity(), 0, 7};
  const double objective[] = {3, 2, 1, 0};
  const char* names[] = {"x special", "y", "y", "unused"};
  for (int i = 0; i < 4; ++i) {
    auto* variable = model.add_variable(); variable->set_name(names[i]);
    variable->set_lower_bound(lower[i]); variable->set_upper_bound(upper[i]);
    variable->set_objective_coefficient(objective[i]); variable->set_is_integer(i == 0);
  }
  auto* range = model.add_constraint(); range->set_name("range");
  range->set_lower_bound(1); range->set_upper_bound(7);
  range->add_var_index(0); range->add_coefficient(2); range->add_var_index(1); range->add_coefficient(1);
  auto* limit = model.add_constraint(); limit->set_name("limit");
  limit->set_lower_bound(-linear::MPSolver::infinity()); limit->set_upper_bound(4);
  limit->add_var_index(1); limit->add_coefficient(1);
  limit = model.add_constraint(); limit->set_name("limit");
  limit->set_lower_bound(-3); limit->set_upper_bound(linear::MPSolver::infinity());
  limit->add_var_index(2); limit->add_coefficient(1);
  return model;
}

void ExportsThroughNativeFormattersAndParsers() {
  const auto model = ExportModel();
  const auto directory = std::filesystem::temp_directory_path() /
      ("ortools-native-export-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
  std::filesystem::create_directory(directory);
  struct CleanupDirectory { std::filesystem::path path; ~CleanupDirectory() { std::filesystem::remove_all(path); } } cleanup_directory{directory};
  for (const auto format : {bridge::MpSolverExportModelRequest::LP, bridge::MpSolverExportModelRequest::MPS}) {
    for (bool obfuscate : {false, true}) {
      bridge::MpSolverBridgeRequest request;
      auto* input = request.mutable_export_model(); input->set_model_proto(model.SerializeAsString());
      input->set_format(format); input->set_obfuscate(obfuscate); input->set_fixed_format(true);
      const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
      bridge::MpSolverBridgeResponse result;
      Expect(execution.ok && result.ParseFromString(execution.payload) && result.has_exported_model(), "Native export reply parses");
      linear::MPModelExportOptions options; options.obfuscate = obfuscate;
      const auto expected = format == bridge::MpSolverExportModelRequest::LP
          ? linear::ExportModelAsLpFormat(model, options) : linear::ExportModelAsMpsFormat(model, options);
      Expect(expected.ok() && result.exported_model() == *expected, "Bridge preserves exact native formatting and obfuscation");
      if (format == bridge::MpSolverExportModelRequest::LP) {
        const auto file = directory / "model.lp";
        { std::ofstream output(file); output << result.exported_model(); }
        SCIP* scip = nullptr;
        Expect(SCIPcreate(&scip) == SCIP_OKAY, "SCIP parser creates");
        struct Cleanup { SCIP** solver; ~Cleanup() { SCIPfree(solver); } } cleanup{&scip};
        Expect(SCIPincludeDefaultPlugins(scip) == SCIP_OKAY, "SCIP LP reader loads");
        SCIPsetMessagehdlrQuiet(scip, true);
        Expect(SCIPreadProb(scip, file.c_str(), nullptr) == SCIP_OKAY, "Native LP export parses with SCIP");
        Expect(SCIPgetNOrigIntVars(scip) + SCIPgetNOrigBinVars(scip) == 1, "LP preserves integer domain");
        Expect(SCIPsolve(scip) == SCIP_OKAY && SCIPgetStatus(scip) == SCIP_STATUS_OPTIMAL, "LP native round-trip solves");
        Expect(std::abs(SCIPgetPrimalbound(scip) - 17) < 1e-8, "LP preserves offset, ranges, bounds and integrality");
      } else {
        const auto parsed = linear::glop::MpsDataToMPModelProto(result.exported_model());
        Expect(parsed.ok(), std::string(parsed.status().message()));
        linear::MPModelRequest solve; *solve.mutable_model() = *parsed;
        solve.set_solver_type(linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING);
        linear::MPSolutionResponse solution; linear::MPSolver::SolveWithProto(solve, &solution);
        Expect(solution.status() == linear::MPSOLVER_OPTIMAL && std::abs(solution.objective_value() - 17) < 1e-8,
               "MPS preserves offset, ranges, bounds and integrality");
      }
    }
  }
  bridge::MpSolverBridgeRequest invalid;
  invalid.mutable_export_model()->set_model_proto(std::string(1, '\xff'));
  Expect(!Execute({1, "mp-solver", invalid.SerializeAsString()}).ok, "Malformed native export input rejects");
  auto bad = model; bad.mutable_constraint(0)->set_var_index(0, 99);
  invalid.mutable_export_model()->set_model_proto(bad.SerializeAsString());
  Expect(!Execute({1, "mp-solver", invalid.SerializeAsString()}).ok, "Invalid references reject before native indexing");
}

void LoadsSolutionsUsingNativeValidation() {
  linear::MPModelProto model;
  auto* variable = model.add_variable(); variable->set_lower_bound(0); variable->set_upper_bound(1);
  auto* row = model.add_constraint(); row->set_lower_bound(-linear::MPSolver::infinity()); row->set_upper_bound(linear::MPSolver::infinity());
  row->add_var_index(0); row->add_coefficient(1);
  linear::MPSolutionResponse candidate; candidate.set_status(linear::MPSOLVER_OPTIMAL);
  candidate.add_variable_value(0.5); candidate.add_dual_value(3); candidate.add_reduced_cost(4);
  const auto load = [&](const linear::MPSolutionResponse& value, double tolerance = 1e-7) {
    bridge::MpSolverBridgeRequest request;
    auto* input = request.mutable_load_solution(); input->set_model_proto(model.SerializeAsString());
    input->set_solution_proto(value.SerializeAsString()); input->set_solver_type(linear::MPSolver::GLOP_LINEAR_PROGRAMMING); input->set_tolerance(tolerance);
    const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
    bridge::MpSolverBridgeResponse response;
    Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_load_solution(), "Native load reply parses");
    return response.load_solution();
  };
  const auto valid = load(candidate); linear::MPSolutionResponse normalized;
  Expect(valid.loaded() && normalized.ParseFromString(valid.solution_proto()) && normalized.dual_value_size() == 1 && normalized.dual_value(0) == 3,
         "Native loading preserves free-row duals and normalizes a fresh snapshot");
  auto invalid = candidate; invalid.add_dual_value(7); Expect(!load(invalid).loaded(), "Native rejects extra dual entries");
  invalid = candidate; invalid.add_reduced_cost(7); Expect(!load(invalid).loaded(), "Native rejects extra reduced costs");
  invalid = candidate; invalid.set_variable_value(0, 2); Expect(!load(invalid).loaded() && load(invalid, linear::MPSolver::infinity()).loaded(), "Native owns bounds and tolerance semantics");
}

void ComputesNativeActivitiesWithoutOptimization() {
  auto model = ExportModel();
  // Many small terms between cancelling large terms exercise native summation.
  auto* row = model.add_constraint(); row->set_lower_bound(-linear::MPSolver::infinity()); row->set_upper_bound(linear::MPSolver::infinity());
  for (int i = 0; i < 30; ++i) {
    auto* variable = model.add_variable(); variable->set_lower_bound(0); variable->set_upper_bound(1);
    row->add_var_index(i + 4); row->add_coefficient(i == 0 ? 1e16 : i == 29 ? -1e16 : 1);
  }
  linear::MPSolutionResponse solution; solution.set_status(linear::MPSOLVER_FEASIBLE);
  for (int i = 0; i < model.variable_size(); ++i) solution.add_variable_value(i < 4 ? (i == 3 ? 7 : 0) : 1);
  linear::MPSolver reference("activities", linear::MPSolver::GLOP_LINEAR_PROGRAMMING);
  for (const auto& variable : model.variable())
    reference.MakeVar(variable.lower_bound(), variable.upper_bound(), variable.is_integer(), variable.name());
  for (const auto& input : model.constraint()) {
    auto* constraint = reference.MakeRowConstraint(input.lower_bound(), input.upper_bound(), input.name());
    for (int i = 0; i < input.var_index_size(); ++i)
      constraint->SetCoefficient(reference.variable(input.var_index(i)), input.coefficient(i));
  }
  Expect(reference.LoadSolutionFromProto(solution, linear::MPSolver::infinity()).ok(), "Reference solution loads");
  const auto expected = reference.ComputeConstraintActivities();
  Expect(expected.size() == model.constraint_size(), "Native construction preserves free rows");
  bridge::MpSolverBridgeRequest request;
  auto* input = request.mutable_activities(); input->set_model_proto(model.SerializeAsString());
  input->set_solution_proto(solution.SerializeAsString()); input->set_solver_type(linear::MPSolver::GLOP_LINEAR_PROGRAMMING);
  const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
  bridge::MpSolverBridgeResponse result;
  Expect(execution.ok && result.ParseFromString(execution.payload) && result.has_activities(), "Native activities reply parses");
  Expect(result.activities().activities_size() == static_cast<int>(expected.size()), "Native activities retain row order");
  for (int i = 0; i < static_cast<int>(expected.size()); ++i)
    // Native coefficient maps use pointer keys and can iterate in different
    // orders across instances. Preserve native Kahan results within rounding
    // tolerance for the ill-conditioned row, rather than prescribe an order.
    Expect(std::abs(result.activities().activities(i) - expected[i]) <= (i == 3 ? 4 : 0),
           "Native activities match MPSolver directly within summation tolerance");
  solution.clear_variable_value(); input->set_solution_proto(solution.SerializeAsString());
  Expect(!Execute({1, "mp-solver", request.SerializeAsString()}).ok, "Mismatched solution dimensions reject");
}

bridge::MpSolverImportModelResult ImportModel(const linear::MPModelProto& model, bool keep_names) {
  bridge::MpSolverBridgeRequest outer;
  auto* input = outer.mutable_import_model(); input->set_model_proto(model.SerializeAsString());
  input->set_solver_type(linear::MPModelRequest::GLOP_LINEAR_PROGRAMMING); input->set_name("target"); input->set_keep_names(keep_names);
  const auto execution = Execute({1, "mp-solver", outer.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse result; Expect(result.ParseFromString(execution.payload) && result.has_import_model(), "Import response parses");
  return result.import_model();
}
void ImportsAndNormalizesEditableModels() {
  linear::MPModelProto model; model.set_name("source"); model.set_objective_offset(5);
  auto* variable = model.add_variable(); variable->set_name("x"); variable->set_lower_bound(0); variable->set_upper_bound(10); variable->set_objective_coefficient(2); variable->set_branching_priority(7);
  auto* row = model.add_constraint(); row->set_name("lower"); row->set_lower_bound(3); row->add_var_index(0); row->add_coefficient(1); row->set_is_lazy(true);
  model.add_constraint()->set_name("unbounded"); model.mutable_solution_hint()->add_var_index(0); model.mutable_solution_hint()->add_var_value(4);
  const auto result = ImportModel(model, true); Expect(result.status() == linear::MPSOLVER_MODEL_IS_VALID && result.error().empty(), "Native import validates");
  linear::MPModelProto normalized; Expect(normalized.ParseFromString(result.model_proto()), "Normalized proto parses");
  Expect(normalized.name() == "target" && normalized.variable(0).name() == "x" && normalized.variable(0).branching_priority() == 7
    && normalized.constraint_size() == 1 && normalized.constraint(0).is_lazy() && normalized.solution_hint().var_value(0) == 4, "Native normalization preserves metadata, drops free rows and retains target name");
  linear::MPModelRequest request; *request.mutable_model() = normalized; request.set_solver_type(linear::MPModelRequest::GLOP_LINEAR_PROGRAMMING);
  linear::MPSolutionResponse solved; linear::MPSolver::SolveWithProto(request, &solved);
  Expect(solved.status() == linear::MPSOLVER_OPTIMAL && solved.objective_value() == 11, "Imported model solves correctly");
  model.add_variable()->set_name("x");
  Expect(ImportModel(model, true).status() == linear::MPSOLVER_MODEL_INVALID, "Keep names rejects duplicates");
  const auto unnamed = ImportModel(model, false); Expect(unnamed.status() == linear::MPSOLVER_MODEL_IS_VALID, "Default import accepts duplicate names");
  normalized.ParseFromString(unnamed.model_proto()); Expect(normalized.variable(0).name() == "auto_v_000000000" && normalized.variable(1).name() == "auto_v_000000001", "Native generated names are unique");
}
void RejectsUnsupportedAndMalformedImports() {
  for (int kind = 0; kind < 5; ++kind) {
    linear::MPModelProto model; model.add_variable();
    if (kind == 0) { model.mutable_variable(0)->set_lower_bound(2); model.mutable_variable(0)->set_upper_bound(1); }
    if (kind == 1) { auto* row = model.add_constraint(); row->add_var_index(1); row->add_coefficient(1); }
    if (kind == 2) { model.mutable_solution_hint()->add_var_index(1); model.mutable_solution_hint()->add_var_value(0); }
    if (kind == 3) model.mutable_quadratic_objective();
    if (kind == 4) model.add_general_constraint()->mutable_indicator_constraint();
    const auto result = ImportModel(model, true); Expect(result.status() != linear::MPSOLVER_MODEL_IS_VALID && !result.error().empty() && result.model_proto().empty(), "Rejected import returns diagnostics without a partial model");
  }
  bridge::MpSolverBridgeRequest malformed; malformed.mutable_import_model()->set_model_proto("\xff");
  const auto execution = Execute({1, "mp-solver", malformed.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse result; result.ParseFromString(execution.payload);
  Expect(result.import_model().status() == linear::MPSOLVER_MODEL_INVALID && !result.import_model().error().empty(), "Malformed model wire returns validation error");
}
void FillsNativeSolutionResponses() {
  for (auto type : {linear::MPSolver::GLOP_LINEAR_PROGRAMMING, linear::MPSolver::SCIP_MIXED_INTEGER_PROGRAMMING}) {
    linear::MPSolver solver("solution", type); linear::MPSolutionResponse response; response.set_objective_value(99);
    solver.FillSolutionResponseProto(&response);
    Expect(response.status() == linear::MPSOLVER_NOT_SOLVED && !response.has_objective_value() && response.variable_value_size() == 0, "Native unsolved fill clears fabricated solution fields");
    auto* variable = solver.MakeNumVar(0, 4, "x"); variable->SetInteger(solver.IsMIP());
    solver.MutableObjective()->SetCoefficient(variable, 3); solver.MutableObjective()->SetOffset(1); solver.MutableObjective()->SetMaximization();
    Expect(solver.Solve() == linear::MPSolver::OPTIMAL, "Native solution exists"); solver.FillSolutionResponseProto(&response);
    Expect(response.objective_value() == 13 && response.variable_value(0) == 4 && response.has_best_objective_bound() == solver.IsMIP()
      && response.reduced_cost_size() == (solver.IsMIP() ? 0 : 1), "Native LP/MIP solution response field semantics");
  }
}
void ConcurrentGlpkSolversOwnTheirEnvironments() {
  for (int round = 0; round < 8; ++round) {
    absl::Barrier ready(4); std::atomic<bool> passed{true}; std::vector<std::thread> threads;
    for (int worker = 0; worker < 4; ++worker) threads.emplace_back([&] {
      linear::MPSolver solver("concurrent", linear::MPSolver::GLPK_LINEAR_PROGRAMMING);
      auto* variable = solver.MakeNumVar(0, 4, "x"); solver.MutableObjective()->SetCoefficient(variable, 3); solver.MutableObjective()->SetMaximization();
      ready.Block();
      if (solver.Solve() != linear::MPSolver::OPTIMAL || solver.Objective().Value() != 12) passed.store(false);
    });
    for (auto& thread : threads) thread.join();
    Expect(passed.load(), "Concurrent GLPK solvers retain independent environments through thread exit");
  }
}
std::string ValidateModelBytes(const std::string& bytes) {
  bridge::MpSolverBridgeRequest request; request.mutable_validate_model()->set_model_proto(bytes);
  const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse response;
  Expect(response.ParseFromString(execution.payload) && response.has_model_validation_error(), "Validation response preserves empty oneof diagnostics");
  return response.model_validation_error();
}
void ValidatesModelsWithoutImportingOrSolving() {
  linear::MPModelProto model;
  Expect(ValidateModelBytes(model.SerializeAsString()).empty(), "Empty model is valid");
  model.add_variable()->set_name("duplicate"); model.add_variable()->set_name("duplicate");
  auto* quadratic = model.mutable_quadratic_objective(); quadratic->add_qvar1_index(0); quadratic->add_qvar2_index(1); quadratic->add_coefficient(1);
  Expect(ValidateModelBytes(model.SerializeAsString()).empty(), "Duplicate names and quadratic models validate without editable import");
  model.mutable_variable(0)->set_lower_bound(2); model.mutable_variable(0)->set_upper_bound(1);
  const auto expected = linear::FindErrorInMPModelProto(model);
  Expect(!expected.empty() && ValidateModelBytes(model.SerializeAsString()) == expected, "Native diagnostics are returned unchanged");
  Expect(!ValidateModelBytes(std::string(1, static_cast<char>(0xff))).empty(), "Malformed bytes return a diagnostic");
  Expect(ValidateModelBytes("").empty(), "Validation recovers after invalid input");
}
void ValidatesNativeSolverSpecificParameters() {
  for (const auto& [backend, text] : std::vector<std::pair<int, std::string>>{
      {linear::MPModelRequest::GLOP_LINEAR_PROGRAMMING, "use_preprocessing: false"},
      {linear::MPModelRequest::SAT_INTEGER_PROGRAMMING, "max_time_in_seconds: 1"},
      {linear::MPModelRequest::PDLP_LINEAR_PROGRAMMING, "termination_criteria { iteration_limit: 10 }"},
      {linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING, "limits/time = 1"},
      {linear::MPModelRequest::CBC_MIXED_INTEGER_PROGRAMMING, "unsupported_parameter = 1"},
      {linear::MPModelRequest::GLPK_LINEAR_PROGRAMMING, "unsupported_parameter = 1"}}) {
    linear::MPSolver native("", static_cast<linear::MPSolver::OptimizationProblemType>(backend));
    for (const auto& parameters : std::vector<std::string>{text, "__unknown_parameter__: true", "", std::string("unknown_field: true\0extra", 24)}) {
      const bool expected = native.SetSolverSpecificParametersAsString(parameters);
      bridge::MpSolverBridgeRequest request;
      request.mutable_validate_parameters()->set_solver_type(backend);
      request.mutable_validate_parameters()->set_parameters(parameters);
      MpSolverExecutor executor;
      Expect(executor.RequestedThreads({1, "mp-solver", request.SerializeAsString()}, 1, 2) == 1,
        "Validation does not reserve solver search threads");
      const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
      Expect(execution.ok, "Validation query succeeds even when backend rejects parameters");
      bridge::MpSolverBridgeResponse response;
      Expect(response.ParseFromString(execution.payload) && response.payload_case() == bridge::MpSolverBridgeResponse::kParametersAccepted
        && response.parameters_accepted() == expected, "Bridge returns the actual native setter result, including false");
    }
  }
  bridge::MpSolverBridgeRequest unavailable;
  unavailable.mutable_validate_parameters()->set_solver_type(9999);
  Expect(!Execute({1, "mp-solver", unavailable.SerializeAsString()}).ok, "Unavailable validation backend rejects before native construction");
}

void RetainsNativeSessionsAndAppliesOrderedEdits() {
  mp_session::Registry registry;
  linear::MPModelRequest model;
  model.set_solver_type(linear::MPModelRequest::GLOP_LINEAR_PROGRAMMING);
  model.mutable_model()->set_maximize(true);
  auto* x = model.mutable_model()->add_variable();
  x->set_lower_bound(0); x->set_upper_bound(4); x->set_objective_coefficient(3);
  auto* free_row = model.mutable_model()->add_constraint();
  free_row->set_lower_bound(-linear::MPSolver::infinity());
  free_row->set_upper_bound(linear::MPSolver::infinity());
  free_row->add_var_index(0); free_row->add_coefficient(1);
  bridge::MpSolverSessionCreateRequest create;
  create.set_request_proto(model.SerializeAsString());
  const auto handle = registry.Create(create).session_handle();
  const auto session = registry.Find(handle);
  auto* original_solver = session->solver.get();
  auto* original_variable = original_solver->variable(0);
  Expect(original_solver->NumConstraints() == 1,
         "Retained construction preserves free rows for later indexed edits");
  bridge::MpSolverSessionRunRequest run;
  run.set_handle(handle);
  model.clear_model();
  run.mutable_solve()->set_request_proto(model.SerializeAsString());
  run.mutable_solve()->set_num_threads(1);
  (*run.mutable_solve()->mutable_parameters()->mutable_integer_params())[1002] = 1;
  const auto solve = [](linear::MPSolver& solver, const linear::MPSolverParameters& parameters) { solver.Solve(parameters); };
  linear::MPSolutionResponse solution;
  solution.ParseFromString(registry.Run(run, solve).session_result().response_proto());
  Expect(solution.objective_value() == 12, "Initial retained solve returns optimum");
  auto* row_edit = run.add_edits(); row_edit->set_kind(bridge::MpSolverEdit::CONSTRAINT_BOUNDS);
  row_edit->set_index(0); row_edit->set_first(-linear::MPSolver::infinity()); row_edit->set_second(3);
  solution.ParseFromString(registry.Run(run, solve).session_result().response_proto());
  Expect(solution.objective_value() == 9, "A free row can be bounded using its original identity");
  run.clear_edits();
  auto* edit = run.add_edits(); edit->set_kind(bridge::MpSolverEdit::VARIABLE_BOUNDS);
  edit->set_index(0); edit->set_first(0); edit->set_second(2.5);
  solution.ParseFromString(registry.Run(run, solve).session_result().response_proto());
  Expect(solution.objective_value() == 7.5 && registry.Find(handle)->solver.get() == original_solver &&
    original_solver->variable(0) == original_variable, "Native solver and variable objects survive updates and repeated solves");
  run.clear_edits(); run.set_action(bridge::MpSolverSessionRunRequest::RESET);
  registry.Run(run, solve);
  Expect(registry.Find(handle)->solver.get() == original_solver, "Native Reset preserves the solver object");
  run.set_action(bridge::MpSolverSessionRunRequest::SOLVE);
  edit = run.add_edits(); edit->set_kind(bridge::MpSolverEdit::CLEAR);
  edit = run.add_edits(); edit->set_kind(bridge::MpSolverEdit::ADD_VARIABLE); edit->set_first(1); edit->set_second(2);
  edit = run.add_edits(); edit->set_kind(bridge::MpSolverEdit::OBJECTIVE_COEFFICIENT); edit->set_first(4);
  edit = run.add_edits(); edit->set_kind(bridge::MpSolverEdit::OBJECTIVE_DIRECTION); edit->set_flag(true);
  solution.ParseFromString(registry.Run(run, solve).session_result().response_proto());
  Expect(solution.objective_value() == 8, "Clear and ordered additions use native methods");
  registry.Close(handle);
  registry.Close(handle);  // A lost cleanup response can be retried safely.
  bool stale = false;
  try { registry.Run(run, solve); } catch (const std::invalid_argument&) { stale = true; }
  Expect(stale, "Closed session handles reject");

  MpSolverExecutor executor;
  JobScheduler scheduler({2, 8});
  const auto execute = [&](const bridge::MpSolverBridgeRequest& request) {
    SolverExecutorResult result;
    auto job = scheduler.Submit(JobSpec{"mp-solver", 1}, [&](JobContext& context) {
      result = executor.Execute({1, "mp-solver", request.SerializeAsString()}, context, [](std::string) {});
      return result.ok ? JobResult::Succeeded() : JobResult::Failed(result.error_message);
    });
    job.result().get();
    Expect(result.ok, result.error_message);
    bridge::MpSolverBridgeResponse response; Expect(response.ParseFromString(result.payload), "Session response parses");
    return response;
  };
  model.mutable_model()->add_variable()->set_upper_bound(1);
  bridge::MpSolverBridgeRequest request;
  request.mutable_session_create()->set_request_proto(model.SerializeAsString());
  const auto server_handle = execute(request).session_handle();
  request.Clear(); run.Clear(); run.set_handle(server_handle);
  model.clear_model(); run.mutable_solve()->set_request_proto(model.SerializeAsString()); run.mutable_solve()->set_num_threads(1);
  *request.mutable_session_run() = run;
  Expect(execute(request).has_session_result(), "Retained solver runs on a later server job thread");
  request.Clear(); request.mutable_session_close()->set_handle(server_handle); execute(request);
}

void StreamsNativeMessagesThroughBridge() {
  MpSolverExecutor executor;
  JobScheduler scheduler({2, 8});
  auto execute = [&](bridge::MpSolverBridgeRequest input, std::vector<std::string>* messages) {
    SolverExecutorResult result;
    auto job = scheduler.Submit(JobSpec{"mp-solver", 1}, [&](JobContext& context) {
      result = executor.Execute({1, "mp-solver", input.SerializeAsString()}, context,
        [&](std::string payload) {
          bridge::MpSolverLogEvent event;
          Expect(event.ParseFromString(payload) && event.messages_size() > 0,
                 "Bridge emits typed nonempty native message batches");
          for (const auto& value : event.messages()) messages->push_back(value);
        });
      return result.ok ? JobResult::Succeeded() : JobResult::Failed(result.error_message);
    });
    job.result().get();
    return result;
  };
  bridge::MpSolverBridgeRequest input;
  input.ParseFromString(Request().payload);
  linear::MPModelRequest model;
  model.ParseFromString(input.solve().request_proto()); model.set_enable_internal_solver_output(true);
  input.mutable_solve()->set_request_proto(model.SerializeAsString());
  input.mutable_solve()->set_stream_messages(true);
  std::vector<std::string> messages;
  const auto result = execute(input, &messages);
  Expect(result.ok && !messages.empty(), "Native logs reach server event sink");
  model.set_enable_internal_solver_output(false);
  input.mutable_solve()->set_request_proto(model.SerializeAsString());
  messages.clear();
  Expect(execute(input, &messages).ok && messages.empty(), "Native output flag suppresses logs");
  model.set_solver_type(linear::MPModelRequest::BOP_INTEGER_PROGRAMMING);
  model.mutable_model()->mutable_variable(0)->set_is_integer(true);
  input.mutable_solve()->set_request_proto(model.SerializeAsString());
  const auto unsupported = execute(input, &messages);
  Expect(!unsupported.ok && unsupported.error_message.find("does not support native message callbacks") != std::string::npos,
         "Unsupported native log hooks reject explicitly");
  input.mutable_solve()->set_stream_messages(false);
  Expect(execute(input, &messages).ok, "Unsupported log rejection leaves server executor reusable");
}

void RoutesNativeBackendMessagesAndReleasesObservers() {
  const std::vector<linear::MPSolver::OptimizationProblemType> backends = {
      linear::MPSolver::GLOP_LINEAR_PROGRAMMING,
      linear::MPSolver::SAT_INTEGER_PROGRAMMING,
      linear::MPSolver::PDLP_LINEAR_PROGRAMMING,
      linear::MPSolver::SCIP_MIXED_INTEGER_PROGRAMMING,
      linear::MPSolver::GLPK_LINEAR_PROGRAMMING,
      linear::MPSolver::GLPK_MIXED_INTEGER_PROGRAMMING,
      linear::MPSolver::CLP_LINEAR_PROGRAMMING,
      linear::MPSolver::CBC_MIXED_INTEGER_PROGRAMMING};
  for (const auto backend : backends) {
    linear::MPSolver solver("native_logs", backend);
    Expect(solver.SupportsMessageCallbacks(), "Built backend has a native message hook");
    auto* x = solver.MakeIntVar(0, 4, "x");
    auto* y = solver.MakeIntVar(0, 4, "y");
    auto* row = solver.MakeRowConstraint(-solver.infinity(), 5);
    row->SetCoefficient(x, 1); row->SetCoefficient(y, 1);
    solver.MutableObjective()->SetCoefficient(x, 3);
    solver.MutableObjective()->SetCoefficient(y, 1);
    solver.MutableObjective()->SetMaximization();
    if (backend == linear::MPSolver::SAT_INTEGER_PROGRAMMING)
      Expect(solver.SetNumThreads(1).ok(), "SAT uses one admitted worker");
    std::vector<std::string> messages;
    Expect(solver.SetMessageCallback([&](const std::string& message) {
      if (!message.empty()) messages.push_back(message);
    }), "Native callback attaches");
    solver.EnableOutput();
    Expect(solver.Solve() == linear::MPSolver::OPTIMAL, "Logging preserves the optimum");
    Expect(solver.Objective().Value() > 12.99 && solver.Objective().Value() < 13.01,
           "Backend returns the native objective while streaming");
    Expect(!messages.empty(), "Enabled output reaches the native callback");
    const auto initial_count = messages.size();
    std::vector<std::string> replacement;
    Expect(solver.SetMessageCallback([&](const std::string& message) {
      if (!message.empty()) replacement.push_back(message);
    }), "Native callback replaces the prior observer");
    x->SetBounds(0, 3);
    Expect(solver.Solve() == linear::MPSolver::OPTIMAL &&
           !replacement.empty() && messages.size() == initial_count,
           "Repeated native solve dispatches only to the new observer");
    const auto replacement_count = replacement.size();
    solver.SetMessageCallback(nullptr);
    solver.SuppressOutput();
    x->SetBounds(0, 2);
    Expect(solver.Solve() == linear::MPSolver::OPTIMAL,
           "Removing the observer preserves retained model reuse");
    solver.EnableOutput();
    x->SetBounds(0, 1);
    Expect(solver.Solve() == linear::MPSolver::OPTIMAL, "Output remains usable without an observer");
    solver.Reset();
    Expect(messages.size() == initial_count && replacement.size() == replacement_count,
           "Removed observers are not called by solve or reset");
  }
  linear::MPSolver bop("unsupported_logs", linear::MPSolver::BOP_INTEGER_PROGRAMMING);
  Expect(!bop.SupportsMessageCallbacks() &&
         !bop.SetMessageCallback([](const std::string&) {}),
         "BOP does not advertise a callback without a native hook");
  Expect(bop.SetMessageCallback(nullptr), "Clearing an unsupported callback is harmless");
}

void AppliesNativeStartingBasis() {
  bridge::MpSolverBridgeRequest input; Expect(input.ParseFromString(Request().payload), "Base request parses");
  auto* basis = input.mutable_solve()->mutable_starting_basis(); basis->add_variable_statuses(linear::MPSolver::AT_UPPER_BOUND);
  (*input.mutable_solve()->mutable_parameters()->mutable_integer_params())[linear::MPSolverParameters::PRESOLVE] = linear::MPSolverParameters::PRESOLVE_OFF;
  const auto execution = Execute({1,"mp-solver",input.SerializeAsString()}); Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse response; response.ParseFromString(execution.payload);
  linear::MPSolutionResponse solution; solution.ParseFromString(response.response_proto());
  Expect(solution.status() == linear::MPSOLVER_OPTIMAL && solution.objective_value() == 12, "Native GLOP solves from supplied basis");
  basis->add_variable_statuses(linear::MPSolver::FREE);
  Expect(!Execute({1,"mp-solver",input.SerializeAsString()}).ok, "Mismatched basis rejects before native indexing");
  basis->mutable_variable_statuses()->RemoveLast();
  linear::MPModelRequest model; model.ParseFromString(input.solve().request_proto()); model.set_solver_type(linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING);
  input.mutable_solve()->set_request_proto(model.SerializeAsString());
  Expect(!Execute({1,"mp-solver",input.SerializeAsString()}).ok, "Unsupported starting-basis backend rejects");
}

void ForwardsNativeMipCallbacksAndConstraints() {
  bridge::MpSolverBridgeRequest input; input.ParseFromString(Request().payload);
  linear::MPModelRequest model; model.ParseFromString(input.solve().request_proto());
  model.set_solver_type(linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING); model.mutable_model()->mutable_variable(0)->set_is_integer(true);
  input.mutable_solve()->set_request_proto(model.SerializeAsString());
  input.mutable_solve()->mutable_callback_registration()->set_might_add_lazy_constraints(true);
  int calls = 0;
  SolverExecutorRequest request{1,"mp-solver",input.SerializeAsString()};
  request.callback = [&](const std::string& bytes) -> std::optional<std::string> {
    bridge::MpSolverCallbackData data; Expect(data.ParseFromString(bytes), "Native callback data parses"); ++calls;
    bridge::MpSolverCallbackResult result;
    if (data.can_query_variable_values() && data.variable_values().at(0) > 1.0) {
      auto* row = result.add_lazy_constraints(); row->set_lower_bound(-std::numeric_limits<double>::infinity()); row->set_upper_bound(1);
      row->add_variable_indices(0); row->add_coefficients(1);
    }
    return result.SerializeAsString();
  };
  const auto execution = Execute(request); Expect(execution.ok, execution.error_message);
  bridge::MpSolverBridgeResponse response; response.ParseFromString(execution.payload);
  linear::MPSolutionResponse solution; solution.ParseFromString(response.response_proto());
  Expect(calls > 0 && solution.status() == linear::MPSOLVER_OPTIMAL && solution.objective_value() == 3, "Native lazy constraints change the native feasible set");
  input.mutable_solve()->set_num_threads(4); request.payload = input.SerializeAsString();
  Expect(!Execute(request).ok, "Native concurrent SCIP callback limitations are rejected explicitly");
  input.mutable_solve()->set_num_threads(1); request.payload = input.SerializeAsString();
  request.callback = [](const std::string&) -> std::optional<std::string> { return std::string(1, '\xff'); };
  Expect(!Execute(request).ok, "Malformed reply stops search and reports after native unwind");
  request.callback = {};
  Expect(!Execute(request).ok, "Missing callback transport rejects before search");
  input.mutable_solve()->clear_callback_registration(); request.payload = input.SerializeAsString();
  Expect(Execute(request).ok, "A later ordinary solve remains usable");
}

void ReturnsNativeCallbackCapabilities() {
  for (int id : {0, 1, 2, 3, 4, 5, 8, 12, 13, 14}) {
    const auto type = static_cast<linear::MPSolver::OptimizationProblemType>(id);
    if (!linear::MPSolver::SupportsProblemType(type)) continue;
    linear::MPSolver native("", type);
    bridge::MpSolverBridgeRequest request; request.mutable_capabilities()->set_solver_type(id);
    const auto execution = Execute({1, "mp-solver", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::MpSolverBridgeResponse response; Expect(response.ParseFromString(execution.payload), "Capability response parses");
    Expect(response.has_capabilities(), "Even two false answers retain capability response presence");
    Expect(response.capabilities().supports_callbacks() == native.SupportsCallbacks() &&
      response.capabilities().supports_message_callbacks() == native.SupportsMessageCallbacks(), "Both capabilities come from the native backend");
  }
  bridge::MpSolverBridgeRequest request; request.mutable_capabilities()->set_solver_type(999);
  Expect(!Execute({1, "mp-solver", request.SerializeAsString()}).ok, "Unavailable backend rejects before construction");
}

SolverExecutorRequest ClampRequest(const linear::MPSolutionResponse& solution) {
  bridge::MpSolverBridgeRequest request; linear::MPModelRequest original;
  bridge::MpSolverBridgeRequest solve; solve.ParseFromString(Request().payload);
  original.ParseFromString(solve.solve().request_proto());
  auto* input = request.mutable_clamp_solution();
  input->set_model_proto(original.model().SerializeAsString());
  input->set_solution_proto(solution.SerializeAsString()); input->set_solver_type(linear::MPSolver::GLOP_LINEAR_PROGRAMMING);
  return SolverExecutorRequest{1, "mp-solver", request.SerializeAsString()};
}
void ClampsSolutionsUsingNativeBounds() {
  for (const double value : {-2.0, 2.0, 8.0, -std::numeric_limits<double>::infinity(), std::numeric_limits<double>::infinity()}) {
    linear::MPSolutionResponse solution;
    solution.set_status(linear::MPSOLVER_FEASIBLE); solution.add_variable_value(value); solution.set_objective_value(123);
    const auto execution = Execute(ClampRequest(solution)); Expect(execution.ok, execution.error_message);
    bridge::MpSolverBridgeResponse outer; linear::MPSolutionResponse result;
    Expect(outer.ParseFromString(execution.payload) && result.ParseFromString(outer.clamped_solution()), "Native clamped solution parses");
    Expect(result.variable_value(0) == (value < 0 ? 0 : value > 4 ? 4 : value), "Native routine moves values onto variable bounds");
    Expect(result.objective_value() == 123 && result.status() == linear::MPSOLVER_FEASIBLE,
        "Native clamping preserves submitted objective and status without recertifying them");
    Expect(solution.variable_value(0) == value, "Submitted response remains unchanged");
  }
}
void PreservesNativeClampingErrors() {
  linear::MPSolutionResponse solution; solution.set_status(linear::MPSOLVER_FEASIBLE); solution.add_variable_value(8);
  for (int variant = 0; variant < 5; ++variant) {
    auto input = solution;
    if (variant == 0) input.set_variable_value(0, std::numeric_limits<double>::quiet_NaN());
    if (variant == 1) input.clear_variable_value();
    if (variant == 2) input.set_status(linear::MPSOLVER_NOT_SOLVED);
    if (variant == 3) { input.add_dual_value(1); }
    auto request = ClampRequest(input);
    if (variant == 4) {
      bridge::MpSolverBridgeRequest outer; outer.ParseFromString(request.payload);
      outer.mutable_clamp_solution()->set_solver_type(linear::MPSolver::HIGHS_LINEAR_PROGRAMMING);
      request.payload = outer.SerializeAsString();
    }
    Expect(!Execute(request).ok, "Invalid input or unavailable backend returns an error without exporting partial values");
  }
  Expect(Execute(ClampRequest(solution)).ok, "Native clamping recovers after failures");
}

void RejectsRemoteFilesystemParameters() {
  char path[] = "/tmp/ortools-mpsolver-policy-XXXXXX";
  const int fd = mkstemp(path); Expect(fd >= 0, "Create private policy sentinel"); close(fd);
  const absl::Cleanup cleanup = [&] { std::remove(path); };
  { std::ofstream output(path); output << "untouched"; }
  std::vector<std::string> names = {"visual/vbcfilename", "visual/bakfilename", "heuristics/alns/rewardfilename", "certificate/filename", "display/logfile"};
  names.push_back(std::string("visual/vbcfilename") + char(0) + "suffix");
  MpSolverExecutor executor;
  for (const auto& name : names) for (int operation = 0; operation < 4; ++operation) {
    const std::string parameters = "display/verblevel = 0,  " + name + "\t = \"" + path + "\"\n";
    linear::MPModelRequest inner; inner.set_solver_type(linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING);
    inner.set_solver_specific_parameters(parameters); inner.set_ignore_solver_specific_parameters_failure(true);
    bridge::MpSolverBridgeRequest request;
    if (operation == 0) request.mutable_solve()->set_request_proto(inner.SerializeAsString());
    if (operation == 1) request.mutable_session_create()->set_request_proto(inner.SerializeAsString());
    if (operation == 2) request.mutable_session_run()->mutable_solve()->set_request_proto(inner.SerializeAsString());
    if (operation == 3) {
      request.mutable_validate_parameters()->set_solver_type(inner.solver_type()); request.mutable_validate_parameters()->set_parameters(parameters);
    }
    const SolverExecutorRequest outer{1, "mp-solver", request.SerializeAsString()};
    bool rejected = false;
    try { executor.RequestedThreads(outer, 0, 2); } catch (const std::invalid_argument&) { rejected = true; }
    Expect(rejected, "Admission rejects backend path parameter: " + name);
    const auto result = Execute(outer);
    Expect(!result.ok && result.error_message.find("filesystem") != std::string::npos,
        "Direct executor entry also enforces filesystem policy");
    std::ifstream input(path); std::string contents; input >> contents;
    Expect(contents == "untouched", "Server never truncates the private sentinel");
  }
  bridge::MpSolverBridgeRequest request; request.ParseFromString(Request().payload);
  linear::MPModelRequest inner; inner.ParseFromString(request.solve().request_proto());
  inner.set_solver_type(linear::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING);
  inner.set_solver_specific_parameters("display/verblevel = 0, heuristics/undercover/fixingalts = lni");
  request.mutable_solve()->set_request_proto(inner.SerializeAsString());
  const auto result = Execute({1, "mp-solver", request.SerializeAsString()});
  bridge::MpSolverBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload), "Allowed native parameters still execute");
  linear::MPSolutionResponse solution; solution.ParseFromString(response.response_proto());
  Expect(solution.status() == linear::MPSOLVER_OPTIMAL, "Allowed native parameters retain solve behavior");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"RejectsRemoteFilesystemParameters", RejectsRemoteFilesystemParameters},
      {"ReturnsNativeCallbackCapabilities", ReturnsNativeCallbackCapabilities},
      {"AppliesNativeStartingBasis", AppliesNativeStartingBasis},
      {"ForwardsNativeMipCallbacksAndConstraints", ForwardsNativeMipCallbacksAndConstraints},
      {"RoutesNativeBackendMessagesAndReleasesObservers", RoutesNativeBackendMessagesAndReleasesObservers},
      {"StreamsNativeMessagesThroughBridge", StreamsNativeMessagesThroughBridge},
      {"RetainsNativeSessionsAndAppliesOrderedEdits", RetainsNativeSessionsAndAppliesOrderedEdits},
      {"VerifiesNativeSolutionSnapshots", VerifiesNativeSolutionSnapshots},
      {"ValidatesNativeSolverSpecificParameters", ValidatesNativeSolverSpecificParameters},
      {"ValidatesModelsWithoutImportingOrSolving", ValidatesModelsWithoutImportingOrSolving},
      {"ConcurrentGlpkSolversOwnTheirEnvironments", ConcurrentGlpkSolversOwnTheirEnvironments},
      {"ImportsAndNormalizesEditableModels", ImportsAndNormalizesEditableModels},
      {"RejectsUnsupportedAndMalformedImports", RejectsUnsupportedAndMalformedImports},
      {"FillsNativeSolutionResponses", FillsNativeSolutionResponses},
      {"ExportsThroughNativeFormattersAndParsers", ExportsThroughNativeFormattersAndParsers},
      {"LoadsSolutionsUsingNativeValidation", LoadsSolutionsUsingNativeValidation},
      {"ClampsSolutionsUsingNativeBounds", ClampsSolutionsUsingNativeBounds},
      {"PreservesNativeClampingErrors", PreservesNativeClampingErrors},
      {"ComputesNativeActivitiesWithoutOptimization", ComputesNativeActivitiesWithoutOptimization},
      {"SolvesNestedProto", SolvesNestedProto},
      {"ReservesRequestedThreads", ReservesRequestedThreads},
      {"EnforcesBackendThreadBudgets", EnforcesBackendThreadBudgets},
      {"SolvesPdlpWithRequestedThreads", SolvesPdlpWithRequestedThreads},
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
