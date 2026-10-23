#include <fstream>
#include <unistd.h>
#include "absl/cleanup/cleanup.h"
#include "server/src/mathopt_executor.h"

#include <algorithm>
#include <cstdlib>
#include <cstdint>
#include <limits>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include <tuple>

#include "mathopt.pb.h"
#include "mathopt_iis.pb.h"
#include "mathopt_feasibility.pb.h"
#include "mathopt_solution_improvement.pb.h"
#include "mathopt_expression_bounds.pb.h"
#include "ortools/math_opt/cpp/math_opt.h"
#include "ortools/math_opt/labs/linear_expr_util.h"
#include "ortools/math_opt/infeasible_subsystem.pb.h"
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/io/mps_converter.h"
#include "ortools/math_opt/storage/model_storage.h"
#include "ortools/math_opt/core/solver.h"
#include "ortools/math_opt/solvers/gscip/gscip.h"
#include "scip/scip_iisfinder.h"
#include "ortools/math_opt/validators/model_parameters_validator.h"
#include "javascript/mathopt_thread_budget.h"
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

SolverExecutorResult Execute(MathOptExecutor* executor, const bridge::MathOptBridgeRequest& request,
    std::function<std::optional<std::string>(const std::string&)> callback = {},
    SolverEventSink emit_event = [](std::string) {}) {
  constexpr int kServerThreads = 8;
  const SolverExecutorRequest outer{1, "mathopt", request.SerializeAsString(), std::move(callback)};
  const int requested_threads =
      executor->RequestedThreads(outer, 0, kServerThreads);
  JobScheduler scheduler({kServerThreads, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"mathopt", requested_threads}, [&](JobContext& context) {
    execution = executor->Execute(outer, context, emit_event);
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

void RejectsIncrementalBackendChanges() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_PDLP);
  bridge::MathOptBridgeRequest create;
  create.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
  const auto created = InnerResponse(Execute(&executor, create));
  Expect(!created.has_status() && created.messages_size() == 1, "PDLP session is created");
  const uint64_t handle = std::stoull(created.messages(0));
  math_opt::ModelUpdateProto update;
  update.mutable_variable_updates()->mutable_upper_bounds()->add_ids(0);
  update.mutable_variable_updates()->mutable_upper_bounds()->add_values(2.5);
  auto changed = inner;
  changed.mutable_model()->mutable_variables()->set_upper_bounds(0, 2.5);
  for (const auto backend : {math_opt::SOLVER_TYPE_GLPK, math_opt::SOLVER_TYPE_GLOP}) {
    changed.set_solver_type(backend);
    for (const bool with_update : {false, true}) {
      bridge::MathOptBridgeRequest solve;
      auto* operation = solve.mutable_incremental_solve();
      operation->set_handle(handle);
      operation->set_solve_request_proto(changed.SerializeAsString());
      if (with_update) operation->set_model_update_proto(update.SerializeAsString());
      const auto rejected = InnerResponse(Execute(&executor, solve));
      Expect(rejected.has_status() && rejected.status().code() == static_cast<int>(absl::StatusCode::kInvalidArgument) &&
          rejected.status().message().find("session backend") != std::string::npos,
          "Incremental solve rejects backend changes before updating or rebuilding");
      bridge::MathOptBridgeRequest iis;
      auto* inspection = iis.mutable_compute_infeasible_subsystem();
      inspection->set_handle(handle);
      inspection->set_solve_request_proto(changed.SerializeAsString());
      if (with_update) inspection->set_model_update_proto(update.SerializeAsString());
      const auto result = Execute(&executor, iis);
      Expect(!result.ok && result.error_message.find("session backend") != std::string::npos,
          "Retained IIS rejects backend changes before updating or rebuilding");
    }
  }
  bridge::MathOptBridgeRequest solve;
  auto* operation = solve.mutable_incremental_solve();
  operation->set_handle(handle);
  operation->set_solve_request_proto(inner.SerializeAsString());
  const auto unchanged = InnerResponse(Execute(&executor, solve));
  Expect(!unchanged.has_status() && unchanged.result().termination().reason() == math_opt::TERMINATION_REASON_OPTIMAL &&
      unchanged.result().solutions(0).primal_solution().objective_value() == 12,
      "Rejected requests leave the original model and backend usable");
  changed.set_solver_type(math_opt::SOLVER_TYPE_PDLP);
  operation->set_solve_request_proto(changed.SerializeAsString());
  operation->set_model_update_proto(update.SerializeAsString());
  const auto rebuilt = InnerResponse(Execute(&executor, solve));
  Expect(!rebuilt.has_status() && rebuilt.result().termination().reason() == math_opt::TERMINATION_REASON_OPTIMAL &&
      rebuilt.result().solutions(0).primal_solution().objective_value() == 7.5,
      "PDLP rebuilds using the retained backend after an unsupported update");
  bridge::MathOptBridgeRequest remove;
  remove.mutable_incremental_delete()->set_handle(handle);
  Expect(Execute(&executor, remove).ok, "Retained session is safely deleted on a later job thread");
}

void UpdatesRawIncrementalSessionsWithoutRebuilding() {
  for (const auto backend : {math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_CP_SAT, math_opt::SOLVER_TYPE_PDLP}) {
    MathOptExecutor executor;
    auto inner = InnerRequest(); inner.set_solver_type(backend);
    bridge::MathOptBridgeRequest create;
    create.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
    const auto created = InnerResponse(Execute(&executor, create));
    Expect(!created.has_status() && created.messages_size() == 1, "Raw session creation returns a handle");
    const uint64_t handle = std::stoull(created.messages(0));
    math_opt::ModelUpdateProto update;
    update.mutable_variable_updates()->mutable_upper_bounds()->add_ids(0);
    update.mutable_variable_updates()->mutable_upper_bounds()->add_values(2.5);
    bridge::MathOptBridgeRequest apply;
    apply.mutable_incremental_update()->set_handle(handle);
    apply.mutable_incremental_update()->set_model_update_proto(update.SerializeAsString());
    const auto execution = Execute(&executor, apply);
    bridge::MathOptBridgeResponse response;
    Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_update_applied(), "Standalone update returns an explicit native boolean, including false");
    const bool supported = backend == math_opt::SOLVER_TYPE_GLOP;
    Expect(response.update_applied() == supported, "Raw update preserves the actual backend capability");
    inner.clear_model(); // A raw solve sends solve parameters, not a rebuilt model.
    bridge::MathOptBridgeRequest solve;
    solve.mutable_incremental_solve()->set_handle(handle);
    solve.mutable_incremental_solve()->set_solve_request_proto(inner.SerializeAsString());
    const auto solved = InnerResponse(Execute(&executor, solve));
    if (supported) {
      Expect(!solved.has_status() && solved.result().termination().reason() == math_opt::TERMINATION_REASON_OPTIMAL &&
          solved.result().solutions(0).primal_solution().objective_value() == 7.5, "Separate jobs solve the natively updated model without model reconstruction");
    } else {
      Expect(solved.has_status(), "False update retires the native solver; raw updates never rebuild it");
    }
    bridge::MathOptBridgeRequest remove; remove.mutable_incremental_delete()->set_handle(handle);
    Expect(Execute(&executor, remove).ok, "Raw sessions can be closed after true or false updates");
    Expect(!Execute(&executor, apply).ok, "Deleted raw handles cannot be updated");
  }
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

void RejectsGlpkIncrementalThreadLifetime() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_GLPK);
  bridge::MathOptBridgeRequest create;
  create.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
  const auto response = InnerResponse(Execute(&executor, create));
  Expect(response.has_status() && response.status().code() == 12,
         "Server rejects GLPK incremental state before its creating thread exits");
  Expect(response.messages_size() == 0 && response.status().message().find("same execution thread") != std::string::npos,
         "No native handle is allocated and the thread lifetime limitation is explicit");
}

void ReservesNestedThreadCount() {
  MathOptExecutor executor;
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(InnerRequest().SerializeAsString());
  const SolverExecutorRequest outer{1, "mathopt", request.SerializeAsString()};
  Expect(executor.RequestedThreads(outer, 1, 4) == 1, "MathOpt reserves nested thread count");
}

void AcceptsGlopThreads() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.mutable_parameters()->set_threads(2);
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  Expect(
      executor.RequestedThreads(
          SolverExecutorRequest{1, "mathopt", request.SerializeAsString()}, 2,
          4) == 2,
      "MathOpt reserves the requested GLOP threads");
}

void RejectsUnsupportedGlpkThreads() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_GLPK);
  inner.mutable_parameters()->set_threads(2);
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  bool rejected = false;
  try {
    executor.RequestedThreads(
        SolverExecutorRequest{1, "mathopt", request.SerializeAsString()}, 2, 4);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "MathOpt rejects unsupported GLPK parallelism");
}

void UsesPdlpThreadSelection() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_PDLP);
  inner.mutable_parameters()->set_threads(4);
  inner.mutable_parameters()->set_enable_output(true);
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  const auto response = InnerResponse(Execute(&executor, request));
  std::string messages;
  for (const auto& message : response.messages()) messages += message;
  Expect(messages.find("num_threads: 4") != std::string::npos,
         "PDLP receives the requested thread count");
  Expect(messages.find("Reducing num_threads from 4 to 1") !=
             std::string::npos,
         "PDLP applies its effective-thread selection");
}

void UsesGscipConcurrentSolve() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_GSCIP);
  inner.mutable_model()->mutable_variables()->set_integers(0, true);
  inner.mutable_parameters()->set_threads(4);
  auto* gscip = inner.mutable_parameters()->mutable_gscip();
  (*gscip->mutable_bool_params())["concurrent/presolvebefore"] = false;
  (*gscip->mutable_int_params())["parallel/minnthreads"] = 4;
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  const auto response = InnerResponse(Execute(&executor, request));
  Expect(!response.has_status(),
         "GSCIP satisfies the required four-thread concurrent solve");
  Expect(response.has_result(), "GSCIP concurrent solve returns a result");
}

void ReservesOneThreadForIncrementalSessionCreation() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.mutable_parameters()->set_threads(2);
  bridge::MathOptBridgeRequest request;
  request.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
  const SolverExecutorRequest outer{1, "mathopt", request.SerializeAsString()};
  Expect(executor.RequestedThreads(outer, 1, 4) == 1,
         "MathOpt incremental creation reserves one control thread");
}

SolverExecutorRequest Wrap(const math_opt::SolveRequest& inner, bool incremental = false) {
  bridge::MathOptBridgeRequest request;
  if (incremental) request.mutable_incremental_solve()->set_solve_request_proto(inner.SerializeAsString());
  else request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  return {1, "mathopt", request.SerializeAsString()};
}
void BackendOverrideAdmissionMatchesMergePrecedence() {
  MathOptExecutor executor;
  for (const auto solver : {math_opt::SOLVER_TYPE_CP_SAT, math_opt::SOLVER_TYPE_PDLP,
                           math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_GSCIP}) {
    auto inner = InnerRequest(); inner.set_solver_type(solver);
    auto* parameters = inner.mutable_parameters();
    if (solver == math_opt::SOLVER_TYPE_CP_SAT) parameters->mutable_cp_sat()->set_num_workers(2);
    if (solver == math_opt::SOLVER_TYPE_PDLP) parameters->mutable_pdlp()->set_num_threads(2);
    if (solver == math_opt::SOLVER_TYPE_GLOP) parameters->mutable_glop()->set_num_omp_threads(2);
    if (solver == math_opt::SOLVER_TYPE_GSCIP) (*parameters->mutable_gscip()->mutable_int_params())["parallel/maxnthreads"] = 2;
    for (bool incremental : {false, true}) {
      const auto request = Wrap(inner, incremental);
      Expect(executor.RequestedThreads(request, 2, 2) == 2, "Backend override takes precedence for normal/incremental solves");
      for (int kind = 0; kind < 2; ++kind) {
        bool rejected = false;
        try { executor.RequestedThreads(request, kind == 0 ? 1 : 2, kind == 0 ? 2 : 1); }
        catch (const std::invalid_argument&) { rejected = true; }
        Expect(rejected, "Client mismatch and backend capacity overflow reject before execution");
      }
    }
    if (solver == math_opt::SOLVER_TYPE_CP_SAT) {
      parameters->mutable_cp_sat()->clear_num_workers(); parameters->mutable_cp_sat()->set_num_search_workers(2);
      Expect(executor.RequestedThreads(Wrap(inner), 1, 2) == 1, "Common modern workers outrank legacy CP-SAT setting");
      parameters->mutable_cp_sat()->set_num_workers(0);
      Expect(executor.RequestedThreads(Wrap(inner), 2, 2) == 2, "Explicit zero modern workers selects legacy count");
    }
  }
}
void BindsAutomaticCpSatWorkersToAdmittedBudget() {
  auto inner = InnerRequest(); inner.set_solver_type(math_opt::SOLVER_TYPE_CP_SAT);
  inner.mutable_parameters()->clear_threads();
  Expect(ortools_wasm::MathOptThreadRequirement(inner) == 1, "Automatic CP-SAT defaults reserve one worker");
  ortools_wasm::BindMathOptAutomaticWorkers(&inner, 1);
  Expect(inner.parameters().cp_sat().num_workers() == 1, "Native auto workers bind to the admitted default");
  inner.mutable_parameters()->mutable_cp_sat()->set_num_workers(2);
  ortools_wasm::BindMathOptAutomaticWorkers(&inner, 1);
  Expect(inner.parameters().cp_sat().num_workers() == 2, "Explicit modern workers remain unchanged");
  inner.mutable_parameters()->mutable_cp_sat()->set_num_workers(0);
  inner.mutable_parameters()->mutable_cp_sat()->set_num_search_workers(2);
  ortools_wasm::BindMathOptAutomaticWorkers(&inner, 1);
  Expect(inner.parameters().cp_sat().num_workers() == 0 && inner.parameters().cp_sat().num_search_workers() == 2,
    "Explicit legacy workers remain unchanged");
}
void SolvesWithBackendWorkerOverrides() {
  MathOptExecutor executor;
  for (const auto solver : {math_opt::SOLVER_TYPE_CP_SAT, math_opt::SOLVER_TYPE_PDLP,
                           math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_GSCIP}) {
    auto inner = InnerRequest(); inner.set_solver_type(solver);
    auto* parameters = inner.mutable_parameters();
    if (solver == math_opt::SOLVER_TYPE_CP_SAT) {
      inner.mutable_model()->mutable_variables()->set_integers(0, true);
      parameters->mutable_cp_sat()->set_num_workers(2);
      parameters->mutable_cp_sat()->set_log_search_progress(true); parameters->set_enable_output(true);
    }
    if (solver == math_opt::SOLVER_TYPE_PDLP) { parameters->mutable_pdlp()->set_num_threads(2); parameters->set_enable_output(true); }
    if (solver == math_opt::SOLVER_TYPE_GLOP) parameters->mutable_glop()->set_num_omp_threads(2);
    if (solver == math_opt::SOLVER_TYPE_GSCIP) {
      inner.mutable_model()->mutable_variables()->set_integers(0, true);
      auto* gscip = parameters->mutable_gscip();
      (*gscip->mutable_bool_params())["concurrent/presolvebefore"] = false;
      (*gscip->mutable_int_params())["parallel/maxnthreads"] = 2;
      (*gscip->mutable_int_params())["parallel/minnthreads"] = 2;
    }
    bridge::MathOptBridgeRequest request; request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
    const auto response = InnerResponse(Execute(&executor, request));
    Expect(!response.has_status() && response.has_result(), "Backend worker overrides reach native solves");
    Expect(response.result().solutions_size() > 0 && std::abs(response.result().solutions(0).primal_solution().objective_value() - 12) < 1e-4,
      "Overrides retain native optimum");
    std::string messages; for (const auto& line : response.messages()) messages += line;
    if (solver == math_opt::SOLVER_TYPE_CP_SAT) Expect(messages.find("with 2 workers") != std::string::npos, "CP-SAT uses two admitted workers");
    if (solver == math_opt::SOLVER_TYPE_PDLP) Expect(messages.find("num_threads: 2") != std::string::npos, "PDLP uses backend thread override");
  }
}
void RejectsInvalidBackendWorkerCounts() {
  MathOptExecutor executor;
  for (const int count : {0, -1, 2147483647}) {
    for (const auto solver : {math_opt::SOLVER_TYPE_PDLP, math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_GSCIP}) {
      auto inner = InnerRequest(); inner.set_solver_type(solver);
      auto* parameters = inner.mutable_parameters();
      if (solver == math_opt::SOLVER_TYPE_PDLP) parameters->mutable_pdlp()->set_num_threads(count);
      if (solver == math_opt::SOLVER_TYPE_GLOP) parameters->mutable_glop()->set_num_omp_threads(count);
      if (solver == math_opt::SOLVER_TYPE_GSCIP) (*parameters->mutable_gscip()->mutable_int_params())["parallel/maxnthreads"] = count;
      bool rejected = false; try { executor.RequestedThreads(Wrap(inner), 0, 2); }
      catch (const std::invalid_argument&) { rejected = true; }
      Expect(rejected, "Nonpositive and oversized backend counts reject before allocation");
    }
  }
}
void ConvertsMpsUsingNativeConverters() {
  MathOptExecutor executor; bridge::MathOptBridgeRequest request;
  const auto model = InnerRequest().model(); request.set_model_proto_to_mps(model.SerializeAsString());
  const auto exported = Execute(&executor, request); bridge::MathOptBridgeResponse response;
  Expect(exported.ok && response.ParseFromString(exported.payload) && response.has_mps(), "MPS export response preserves its type");
  const auto native = math_opt::ModelProtoToMps(model);
  Expect(native.ok() && response.mps() == *native, "MPS text exactly matches the native converter");
  request.Clear(); request.set_mps_to_model_proto(response.mps());
  const auto imported = Execute(&executor, request); response.Clear(); response.ParseFromString(imported.payload);
  Expect(imported.ok && response.has_model_proto(), "MPS import response preserves model bytes");
  const auto expected = math_opt::MpsToModelProto(request.mps_to_model_proto()); math_opt::ModelProto parsed;
  Expect(expected.ok() && parsed.ParseFromString(response.model_proto()) && parsed.SerializeAsString() == expected->SerializeAsString(), "Model bytes exactly match native import");
}
void RejectsMalformedAndLossyMpsConversions() {
  MathOptExecutor executor; bridge::MathOptBridgeRequest request;
  request.set_model_proto_to_mps(std::string(1, static_cast<char>(0xff))); Expect(!Execute(&executor, request).ok, "Malformed model bytes reject");
  request.Clear(); request.set_mps_to_model_proto("this is not MPS"); Expect(!Execute(&executor, request).ok, "Malformed MPS rejects");
  auto model = InnerRequest().model();
  auto* quadratic = model.mutable_objective()->mutable_quadratic_coefficients(); quadratic->add_row_ids(0); quadratic->add_column_ids(0); quadratic->add_coefficients(1);
  request.Clear(); request.set_model_proto_to_mps(model.SerializeAsString()); Expect(!Execute(&executor, request).ok, "Quadratic objective cannot silently disappear");
  model.mutable_objective()->clear_quadratic_coefficients(); (*model.mutable_auxiliary_objectives())[0].set_priority(1);
  request.set_model_proto_to_mps(model.SerializeAsString()); Expect(!Execute(&executor, request).ok, "Auxiliary objective cannot silently disappear");
  request.Clear(); request.set_mps_to_model_proto("NAME empty"); Expect(Execute(&executor, request).ok, "Name-only model imports after errors");
}

void ValidatesEditableImportsNatively() {
  MathOptExecutor executor;
  auto model = InnerRequest().model();
  bridge::MathOptBridgeRequest request;
  const auto validate = [&]() {
    request.set_validate_model(model.SerializeAsString());
    const auto execution = Execute(&executor, request);
    Expect(execution.ok, execution.error_message);
    bridge::MathOptBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "Validation response parses");
    Expect(response.conversion_result_case() == bridge::MathOptBridgeResponse::kValidationError, "Native validation preserves empty error presence");
    return response.validation_error();
  };
  Expect(validate().empty(), "Valid import accepts native model semantics");
  model.mutable_variables()->clear_integers();
  Expect(!validate().empty(), "Native validator rejects mismatched parallel arrays");
  model = InnerRequest().model();
  model.mutable_objective()->mutable_linear_coefficients()->set_ids(0, 99);
  Expect(!validate().empty(), "Native validator rejects unknown coefficient references");
}

void ValidatesImportedResultsUsingNativeValidators() {
  MathOptExecutor executor;
  auto context = InnerRequest();
  bridge::MathOptBridgeRequest solve;
  solve.mutable_solve()->set_solve_request_proto(context.SerializeAsString());
  const auto original = InnerResponse(Execute(&executor, solve)).result();
  const auto validate = [&](const math_opt::SolveResultProto& value, bool accepted) {
    bridge::MathOptBridgeRequest query;
    query.mutable_validate_result()->set_solve_request_proto(context.SerializeAsString());
    query.mutable_validate_result()->set_result_proto(value.SerializeAsString());
    const auto execution = Execute(&executor, query);
    Expect(execution.ok, "Validation query executes independently of result validity");
    bridge::MathOptBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "Validation response parses");
    Expect((response.conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto) == accepted,
      "Native validator rejects malformed result data and references");
    if (!accepted) Expect(!response.validation_error().empty(), "Native validation diagnostic is preserved");
  };
  validate(original, true);
  for (int scenario = 0; scenario < 10; ++scenario) {
    auto value = original;
    auto* primal = value.mutable_solutions(0)->mutable_primal_solution()->mutable_variable_values();
    switch (scenario) {
      case 0: primal->clear_values(); break;
      case 1: primal->add_values(0); break;
      case 2: primal->set_ids(0, 999); break;
      case 3: primal->add_ids(0); primal->add_values(0); break;
      case 4: primal->set_values(0, std::numeric_limits<double>::quiet_NaN()); break;
      case 5: value.mutable_solutions(0)->mutable_dual_solution()->mutable_reduced_costs()->set_ids(0, 999); break;
      case 6: value.mutable_solutions(0)->mutable_basis()->mutable_variable_status()->set_ids(0, 999); break;
      case 7: value.mutable_termination()->set_reason(math_opt::TERMINATION_REASON_UNSPECIFIED); break;
      case 8: {
        auto* quadratic = value.mutable_solutions(0)->mutable_dual_solution()->mutable_quadratic_dual_values();
        quadratic->add_ids(999); quadratic->add_values(0); break;
      }
      case 9: value.mutable_solutions(0)->mutable_dual_solution()->mutable_quadratic_dual_values()->add_ids(999); break;
    }
    validate(value, false);
  }
  auto deleted = context; deleted.mutable_model()->mutable_variables()->clear_ids();
  bridge::MathOptBridgeRequest malformed;
  malformed.mutable_validate_result()->set_solve_request_proto(deleted.SerializeAsString());
  malformed.mutable_validate_result()->set_result_proto(original.SerializeAsString());
  auto execution = Execute(&executor, malformed);
  bridge::MathOptBridgeResponse response; response.ParseFromString(execution.payload);
  Expect(!response.validation_error().empty(), "Invalid supplied model rejects before result decoding");
}

void StreamsNativeMessages() {
  MathOptExecutor executor;
  for (bool incremental : {false, true}) {
    auto inner = InnerRequest();
    inner.mutable_parameters()->set_enable_output(true);
    uint64_t handle = 0;
    if (incremental) {
      bridge::MathOptBridgeRequest create;
      create.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
      handle = std::stoull(InnerResponse(Execute(&executor, create)).messages(0));
    }
    for (bool stream : {false, true}) for (bool enable : {false, true}) {
      inner.mutable_parameters()->set_enable_output(enable);
      bridge::MathOptBridgeRequest request;
      if (incremental) {
        auto* operation = request.mutable_incremental_solve();
        operation->set_handle(handle);
        operation->set_solve_request_proto(inner.SerializeAsString());
        operation->set_stream_messages(stream);
      } else {
        auto* operation = request.mutable_solve();
        operation->set_solve_request_proto(inner.SerializeAsString());
        operation->set_stream_messages(stream);
      }
      bool completed = false;
      std::vector<std::string> observed;
      const auto response = InnerResponse(Execute(&executor, request, {}, [&](std::string bytes) {
        Expect(!completed, "Messages are emitted before native completion");
        bridge::MathOptLogEvent event;
        Expect(event.ParseFromString(bytes), "Typed native log event parses");
        observed.insert(observed.end(), event.messages().begin(), event.messages().end());
      }));
      completed = true;
      Expect(response.has_result() && !response.has_status(), "Log streaming preserves native results");
      Expect(enable == (response.messages_size() > 0), "Native output flag governs retained messages");
      if (stream && enable) {
        Expect(observed == std::vector<std::string>(response.messages().begin(), response.messages().end()),
               "Live batches retain order without replaying the final log");
      } else Expect(observed.empty(), "No streaming events when output/streaming is disabled");
    }
    if (incremental) {
      bridge::MathOptBridgeRequest remove;
      remove.mutable_incremental_delete()->set_handle(handle);
      Execute(&executor, remove);
    }
  }
}

void ExecutesNativeCallbacks() {
  MathOptExecutor executor;
  auto inner = InnerRequest();
  inner.set_solver_type(math_opt::SOLVER_TYPE_CP_SAT);
  auto* variables = inner.mutable_model()->mutable_variables();
  for (int i = 0; i < variables->ids_size(); ++i) variables->set_integers(i, true);
  inner.mutable_parameters()->mutable_cp_sat()->set_cp_model_presolve(false);
  math_opt::CallbackRegistrationProto registration;
  registration.add_request_registration(math_opt::CALLBACK_EVENT_MIP_SOLUTION);
  bridge::MathOptBridgeRequest request;
  request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
  request.mutable_solve()->set_callback_registration_proto(registration.SerializeAsString());
  int calls = 0;
  const auto result = InnerResponse(Execute(&executor, request, [&](const std::string& bytes) -> std::optional<std::string> {
    math_opt::CallbackDataProto data;
    Expect(data.ParseFromString(bytes), "Native callback data parses");
    Expect(data.event() == math_opt::CALLBACK_EVENT_MIP_SOLUTION && data.has_primal_solution_vector(), "Native incumbent callback");
    ++calls;
    math_opt::CallbackResultProto response;
    response.set_terminate(true);
    return response.SerializeAsString();
  }));
  Expect(calls > 0 && result.has_result(), "Native callback reply permits a stopped solve result");
  Expect(InnerResponse(Execute(&executor, request)).has_status(), "Callback registration without transport rejects");
  request.mutable_solve()->set_callback_registration_proto(std::string(1, '\xff'));
  Expect(InnerResponse(Execute(&executor, request, [](const auto&) { return std::make_optional(std::string()); })).has_status(), "Malformed callback registration rejects");
}

bridge::MathOptBridgeResponse ConvertProto(MathOptExecutor* executor, int kind,
    const std::string& input, const math_opt::ModelProto& model = {}) {
  bridge::MathOptBridgeRequest query;
  query.mutable_convert_result()->set_kind(kind);
  query.mutable_convert_result()->set_model_proto(model.SerializeAsString());
  query.mutable_convert_result()->set_input_proto(input);
  const auto result = Execute(executor, query);
  Expect(result.ok, result.error_message);
  bridge::MathOptBridgeResponse response;
  Expect(response.ParseFromString(result.payload), "Conversion response parses");
  return response;
}

void ConvertsStandaloneSolutionsWithExactIds() {
  MathOptExecutor executor;
  auto model = InnerRequest().model();
  const int64_t id = 9007199254740993LL;
  model.mutable_variables()->set_ids(0, id);
  model.mutable_objective()->mutable_linear_coefficients()->set_ids(0, id);
  auto& auxiliary = (*model.mutable_auxiliary_objectives())[id + 1]; auxiliary.set_priority(1);
  auto& quadratic = (*model.mutable_quadratic_constraints())[9]; quadratic.set_upper_bound(16);
  quadratic.mutable_quadratic_terms()->add_row_ids(id);
  quadratic.mutable_quadratic_terms()->add_column_ids(id);
  quadratic.mutable_quadratic_terms()->add_coefficients(1);
  math_opt::PrimalSolutionProto primal;
  primal.set_feasibility_status(math_opt::SOLUTION_STATUS_FEASIBLE);
  primal.mutable_variable_values()->add_ids(id); primal.mutable_variable_values()->add_values(2);
  (*primal.mutable_auxiliary_objective_values())[id + 1] = 4;
  const auto response = ConvertProto(&executor, 1, primal.SerializeAsString(), model);
  Expect(response.conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto,
         "Native primal converter succeeds without choosing a solver backend");
  math_opt::PrimalSolutionProto converted;
  Expect(converted.ParseFromString(response.validated_result_proto()) && converted.variable_values().ids(0) == id &&
         converted.auxiliary_objective_values().at(id + 1) == 4, "Exact variable and auxiliary IDs survive");
  math_opt::DualSolutionProto dual;
  dual.set_feasibility_status(math_opt::SOLUTION_STATUS_UNDETERMINED);
  dual.mutable_quadratic_dual_values()->add_ids(9); dual.mutable_quadratic_dual_values()->add_values(0.5);
  math_opt::DualSolutionProto dual_result;
  Expect(dual_result.ParseFromString(ConvertProto(&executor, 2, dual.SerializeAsString(), model).validated_result_proto()) &&
         !dual_result.has_objective_value() && dual_result.quadratic_dual_values().values(0) == 0.5,
         "Native quadratic dual conversion preserves optional absence");
  dual.set_objective_value(0);
  Expect(dual_result.ParseFromString(ConvertProto(&executor, 2, dual.SerializeAsString(), model).validated_result_proto()) &&
         dual_result.has_objective_value() && dual_result.objective_value() == 0, "Native optional zero stays present");
  math_opt::SolutionProto solution;
  *solution.mutable_primal_solution() = primal; *solution.mutable_dual_solution() = dual;
  solution.mutable_basis()->mutable_variable_status()->add_ids(id);
  solution.mutable_basis()->mutable_variable_status()->add_values(math_opt::BASIS_STATUS_BASIC);
  math_opt::SolutionProto round_trip;
  Expect(round_trip.ParseFromString(ConvertProto(&executor, 6, solution.SerializeAsString(), model).validated_result_proto()) &&
         round_trip.has_basis() && round_trip.has_dual_solution() && round_trip.has_primal_solution(), "Composite solution converters preserve all components");
  math_opt::PrimalRayProto primal_ray; *primal_ray.mutable_variable_values() = primal.variable_values();
  math_opt::DualRayProto dual_ray; *dual_ray.mutable_reduced_costs() = primal.variable_values();
  for (const auto& [kind, bytes] : std::vector<std::pair<int, std::string>>{
           {3, solution.basis().SerializeAsString()}, {4, primal_ray.SerializeAsString()}, {5, dual_ray.SerializeAsString()}}) {
    Expect(ConvertProto(&executor, kind, bytes, model).conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto,
           "Native basis and ray converters validate model references");
  }
}

void ConvertsNativeResultMetadata() {
  MathOptExecutor executor;
  math_opt::ObjectiveBoundsProto bounds;
  Expect(ConvertProto(&executor, 8, bounds.SerializeAsString()).conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto,
         "Empty native zero bounds are a successful empty byte result");
  math_opt::SolveStatsProto stats;
  stats.set_simplex_iterations(9007199254740993LL);
  stats.set_barrier_iterations(std::numeric_limits<int64_t>::max());
  stats.set_first_order_iterations(9007199254740994LL);
  stats.set_node_count(9007199254740995LL);
  stats.mutable_solve_time()->set_nanos(500000000);
  math_opt::SolveStatsProto result;
  Expect(result.ParseFromString(ConvertProto(&executor, 9, stats.SerializeAsString()).validated_result_proto()) &&
         result.simplex_iterations() == stats.simplex_iterations() &&
         result.barrier_iterations() == stats.barrier_iterations() &&
         result.first_order_iterations() == stats.first_order_iterations() &&
         result.node_count() == stats.node_count() && result.solve_time().nanos() == 500000000,
         "Native metadata preserves exact counters and duration");
  math_opt::ProblemStatusProto status;
  status.set_primal_status(math_opt::FEASIBILITY_STATUS_FEASIBLE);
  status.set_dual_status(math_opt::FEASIBILITY_STATUS_FEASIBLE);
  Expect(ConvertProto(&executor, 7, status.SerializeAsString()).conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto,
         "Native problem status converts");
  math_opt::TerminationProto termination;
  termination.set_reason(math_opt::TERMINATION_REASON_OPTIMAL); *termination.mutable_problem_status() = status;
  Expect(ConvertProto(&executor, 10, termination.SerializeAsString()).conversion_result_case() == bridge::MathOptBridgeResponse::kValidatedResultProto,
         "Native termination converts");
}

void RejectsMalformedNativeConversionsAndRecovers() {
  MathOptExecutor executor;
  auto model = InnerRequest().model();
  math_opt::PrimalRayProto ray;
  ray.mutable_variable_values()->add_ids(99); ray.mutable_variable_values()->add_values(1);
  Expect(!ConvertProto(&executor, 4, ray.SerializeAsString(), model).validation_error().empty(), "Foreign IDs reject");
  ray.mutable_variable_values()->set_ids(0, 0); ray.mutable_variable_values()->clear_values();
  Expect(!ConvertProto(&executor, 4, ray.SerializeAsString(), model).validation_error().empty(), "Mismatched vectors reject");
  Expect(!ConvertProto(&executor, 6, std::string(1, '\xff'), model).validation_error().empty(), "Malformed bytes reject");
  Expect(!ConvertProto(&executor, 11, {}).validation_error().empty(), "Unknown conversion kinds reject");
  ray.mutable_variable_values()->add_values(1);
  Expect(ConvertProto(&executor, 4, ray.SerializeAsString(), model).validation_error().empty(), "Native conversion recovers after rejection");
}

void PreservesNativeObjectiveUpdatesAndParameterReferences() {
  auto model = InnerRequest().model();
  constexpr int64_t id = 3000000000LL;
  auto& auxiliary = (*model.mutable_auxiliary_objectives())[id];
  auxiliary.set_name("cost"); auxiliary.set_priority(std::numeric_limits<int64_t>::max());
  auxiliary.set_offset(7); auxiliary.mutable_linear_coefficients()->add_ids(0);
  auxiliary.mutable_linear_coefficients()->add_values(2);
  const auto imported = math_opt::ModelStorage::FromModelProto(model);
  Expect(imported.ok(), "Native storage accepts sparse objective IDs and exact priorities");
  auto& storage = **imported;
  math_opt::ModelUpdateProto update;
  update.mutable_objective_updates()->set_priority_update(3);
  auto& changed = (*update.mutable_auxiliary_objectives_updates()->mutable_objective_updates())[id];
  changed.set_direction_update(true); changed.set_priority_update(1); changed.set_offset_update(0);
  changed.mutable_linear_coefficients()->add_ids(0); changed.mutable_linear_coefficients()->add_values(0);
  auto& added = (*update.mutable_auxiliary_objectives_updates()->mutable_new_objectives())[id + 1];
  added.set_name("reward"); added.set_priority(2);
  added.mutable_linear_coefficients()->add_ids(0); added.mutable_linear_coefficients()->add_values(3);
  Expect(storage.ApplyUpdateProto(update).ok(), "Native storage applies objective updates without a solving backend");
  auto exported = storage.ExportModel();
  Expect(exported.objective().priority() == 3 && exported.auxiliary_objectives().at(id).priority() == 1 &&
      exported.auxiliary_objectives().at(id).maximize() && exported.auxiliary_objectives().at(id).offset() == 0 &&
      exported.auxiliary_objectives().at(id).linear_coefficients().ids_size() == 0 &&
      exported.auxiliary_objectives().at(id + 1).linear_coefficients().values(0) == 3,
      "Native zero updates remove terms while direction, priority and additions remain exact");
  const auto summary = math_opt::ModelSummary::Create(exported);
  Expect(summary.ok(), "Native objective model summary validates");
  math_opt::ModelSolveParametersProto parameters;
  parameters.mutable_primary_objective_parameters()->set_objective_degradation_absolute_tolerance(0);
  auto& objective_parameters = (*parameters.mutable_auxiliary_objective_parameters())[id + 1];
  objective_parameters.set_objective_degradation_absolute_tolerance(4.1);
  objective_parameters.set_objective_degradation_relative_tolerance(4.2);
  objective_parameters.mutable_time_limit()->set_seconds(1); objective_parameters.mutable_time_limit()->set_nanos(250000000);
  Expect(math_opt::ValidateModelSolveParameters(parameters, *summary).ok(), "Native objective parameters and fractional duration validate");
  (*parameters.mutable_auxiliary_objective_parameters())[id + 2];
  Expect(!math_opt::ValidateModelSolveParameters(parameters, *summary).ok(), "Native parameter validation rejects missing objective IDs");
  update.Clear(); update.mutable_auxiliary_objectives_updates()->add_deleted_objective_ids(id);
  update.add_deleted_variable_ids(0);
  Expect(storage.ApplyUpdateProto(update).ok(), "Native variable and auxiliary objective deletions apply together");
  exported = storage.ExportModel();
  Expect(exported.auxiliary_objectives().size() == 1 &&
      exported.auxiliary_objectives().at(id + 1).linear_coefficients().ids_size() == 0,
      "Native variable deletion removes remaining auxiliary coefficients without redundant zero updates");
}

void ReportsNativeIisCapabilities() {
  for (const auto type : {math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_GSCIP,
      math_opt::SOLVER_TYPE_GLPK, math_opt::SOLVER_TYPE_CP_SAT, math_opt::SOLVER_TYPE_PDLP}) {
    auto inner = InnerRequest(); inner.set_solver_type(type);
    if (type == math_opt::SOLVER_TYPE_CP_SAT) inner.mutable_model()->mutable_variables()->set_integers(0, true);
    math_opt::Solver::ComputeInfeasibleSubsystemArgs arguments;
    arguments.parameters.set_threads(1);
    const auto native = math_opt::Solver::NonIncrementalComputeInfeasibleSubsystem(inner.model(), type, {}, arguments);
    Expect(!native.ok() && native.status().code() == absl::StatusCode::kUnimplemented,
        "Bundled backend preserves upstream IIS capability errors");
    MathOptExecutor executor;
    for (const bool retained : {false, true}) {
      if (retained && type == math_opt::SOLVER_TYPE_GLPK) continue;
      bridge::MathOptBridgeRequest request;
      auto* operation = request.mutable_compute_infeasible_subsystem();
      if (retained) {
        bridge::MathOptBridgeRequest create;
        create.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
        const auto created = InnerResponse(Execute(&executor, create));
        Expect(!created.has_status() && created.messages_size() == 1, "Retained model is created");
        operation->set_handle(std::stoull(created.messages(0)));
      }
      operation->set_solve_request_proto(inner.SerializeAsString());
      bridge::MathOptBridgeResponse outer;
      bridge::MathOptInfeasibleSubsystemResponse reply;
      const auto result = Execute(&executor, request);
      Expect(result.ok && outer.ParseFromString(result.payload) && reply.ParseFromString(outer.solve_response_proto()) &&
          reply.has_status() && reply.status().code() == static_cast<int>(absl::StatusCode::kUnimplemented),
          "Standalone and retained IIS bindings preserve native UNIMPLEMENTED status");
      if (retained) {
        bridge::MathOptBridgeRequest close;
        close.mutable_incremental_delete()->set_handle(operation->handle());
        Expect(Execute(&executor, close).ok, "Unsupported IIS retains a deletable native session");
      }
    }
  }
}

void RejectsUnsupportedNativeCones() {
  auto model = InnerRequest().model();
  auto& cone = (*model.mutable_second_order_cone_constraints())[23];
  cone.add_arguments_to_norm()->set_offset(3);
  cone.mutable_upper_bound()->add_ids(0); cone.mutable_upper_bound()->add_coefficients(1);
  const auto created = math_opt::Solver::New(math_opt::SOLVER_TYPE_GSCIP, model, {});
  Expect(!created.ok() && created.status().message().find("cone") != std::string::npos,
      "GSCIP preserves upstream rejection of second-order cone models");
  auto original = math_opt::Solver::New(math_opt::SOLVER_TYPE_GSCIP, InnerRequest().model(), {});
  Expect(original.ok(), "An ordinary GSCIP model is created");
  math_opt::ModelUpdateProto update;
  (*update.mutable_second_order_cone_constraint_updates()->mutable_new_constraints())[23] = cone;
  const auto applied = (*original)->Update(update);
  Expect(applied.ok() && !*applied, "Native GSCIP declines unsupported cone updates without applying them");
}

bridge::MathOptBridgeResponse TransformIndicator(MathOptExecutor* executor, const math_opt::ModelProto& model, int64_t id) {
  bridge::MathOptBridgeRequest request;
  auto* input = request.mutable_formulate_indicator_constraint_as_mip();
  input->set_model_proto(model.SerializeAsString()); input->set_indicator_constraint_id(id);
  const auto execution = Execute(executor, request); Expect(execution.ok, execution.error_message);
  bridge::MathOptBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Native transformation reply parses");
  return response;
}

math_opt::ModelProto IndicatorModel() {
  math_opt::ModelProto model; model.set_name("indicator conversion");
  for (const auto [id, upper] : {std::pair<int64_t, double>{7, 1}, {11, 10}}) {
    auto* variables = model.mutable_variables(); variables->add_ids(id); variables->add_lower_bounds(0);
    variables->add_upper_bounds(upper); variables->add_integers(true);
  }
  auto& constraint = (*model.mutable_indicator_constraints())[23];
  constraint.set_indicator_id(7); constraint.set_lower_bound(2); constraint.set_upper_bound(6);
  constraint.mutable_expression()->add_ids(11); constraint.mutable_expression()->add_values(1);
  return model;
}

void FormulatesIndicatorConstraintsThroughNativeMathOpt() {
  MathOptExecutor executor; const auto model = IndicatorModel();
  const auto response = TransformIndicator(&executor, model, 23);
  math_opt::ModelProto converted;
  Expect(response.has_model_proto() && converted.ParseFromString(response.model_proto()), "Native returns an exported model");
  Expect(converted.indicator_constraints().empty() && converted.linear_constraints().ids_size() == 2 &&
    converted.variables().ids(0) == 7 && converted.variables().ids(1) == 11 && converted.name() == model.name(),
    "Only the selected indicator is replaced by native rows, retaining model metadata and variable IDs");
  Expect(model.indicator_constraints().size() == 1 && model.linear_constraints().ids_size() == 0,
    "Submitted proto is unchanged");
  auto exact = model; const int64_t id = (int64_t{1} << 60) + 3;
  auto indicator = exact.indicator_constraints().at(23); exact.clear_indicator_constraints();
  (*exact.mutable_indicator_constraints())[id] = indicator;
  Expect(TransformIndicator(&executor, exact, id).has_model_proto(), "Exact int64 indicator IDs survive the bridge");
}

void PreservesNativeIndicatorConversionErrors() {
  MathOptExecutor executor; auto model = IndicatorModel();
  Expect(TransformIndicator(&executor, model, 999).has_validation_error(), "Missing indicator rejects before native checked lookup");
  model.mutable_variables()->set_upper_bounds(1, std::numeric_limits<double>::infinity());
  auto response = TransformIndicator(&executor, model, 23);
  Expect(response.has_validation_error() && !response.validation_error().empty() && !response.has_model_proto(),
    "Insufficient upper bound reports native error without returning a partial transformation");
  Expect(model.indicator_constraints().size() == 1 && model.linear_constraints().ids_size() == 0, "Failure leaves input untouched");
  model.mutable_variables()->set_upper_bounds(1, 10);
  Expect(TransformIndicator(&executor, model, 23).has_model_proto(), "Native executor recovers after transformation errors");
  (*model.mutable_indicator_constraints())[23].clear_indicator_id();
  math_opt::ModelProto converted; response = TransformIndicator(&executor, model, 23);
  Expect(response.has_model_proto() && converted.ParseFromString(response.model_proto()) && converted.indicator_constraints().empty()
    && converted.linear_constraints().ids_size() == 0, "Native inactive indicator is deleted without adding rows");
}

bridge::MathOptFeasibilityResponse CheckPoint(MathOptExecutor* executor, const bridge::MathOptFeasibilityRequest& input) {
  bridge::MathOptBridgeRequest request; request.set_check_primal_feasibility(input.SerializeAsString());
  const auto execution = Execute(executor, request); Expect(execution.ok, execution.error_message);
  bridge::MathOptBridgeResponse outer; bridge::MathOptFeasibilityResponse result;
  Expect(outer.ParseFromString(execution.payload) && result.ParseFromString(outer.primal_feasibility()), "Native feasibility reply parses");
  return result;
}
void ChecksPrimalFeasibilityWithNativeTolerances() {
  MathOptExecutor executor;
  auto model = InnerRequest().model(); model.mutable_variables()->set_integers(0, true);
  bridge::MathOptFeasibilityRequest input; input.set_model_proto(model.SerializeAsString()); input.add_variable_ids(0); input.add_variable_values(4.5);
  auto result = CheckPoint(&executor, input); math_opt::ModelSubsetProto violations;
  Expect(result.error().empty() && !result.feasible() && violations.ParseFromString(result.violated_constraints_proto()), "Native checker returns typed violations");
  Expect(violations.variable_bounds().at(0).upper() && violations.variable_integrality_size() == 1 && result.descriptions_size() >= 2, "Bound and integer violations include native descriptions");
  input.set_absolute_constraint_tolerance(0.5); input.set_integrality_tolerance(0.5);
  result = CheckPoint(&executor, input); Expect(result.error().empty() && result.feasible() && result.descriptions_size() == 0, "Native tolerance boundaries are inclusive");
  input.set_integrality_tolerance(0); Expect(!CheckPoint(&executor, input).feasible(), "Explicit zero is distinct from native tolerance defaults");
  input.set_integrality_tolerance(-1); Expect(!CheckPoint(&executor, input).error().empty(), "Native checker rejects invalid tolerance");
  input.clear_integrality_tolerance(); input.set_variable_values(0, 4); Expect(CheckPoint(&executor, input).feasible(), "Runtime recovers after checker errors");
}
void ValidatesCompletePrimalValuesAndExactIds() {
  MathOptExecutor executor; auto model = InnerRequest().model();
  const int64_t id = (int64_t{1} << 60) + 3;
  model.mutable_variables()->set_ids(0, id); model.mutable_objective()->mutable_linear_coefficients()->set_ids(0, id);
  bridge::MathOptFeasibilityRequest input; input.set_model_proto(model.SerializeAsString());
  Expect(!CheckPoint(&executor, input).error().empty(), "Missing variable values reject");
  input.add_variable_ids(id); input.add_variable_values(-1);
  const auto result = CheckPoint(&executor, input); math_opt::ModelSubsetProto violations;
  Expect(result.error().empty() && violations.ParseFromString(result.violated_constraints_proto()) && violations.variable_bounds().at(id).lower(), "Exact int64 model IDs survive native checker serialization");
  input.add_variable_ids(id); input.add_variable_values(0);
  Expect(!CheckPoint(&executor, input).error().empty(), "Duplicate sparse IDs reject");
  input.set_variable_ids(1, id + 1); Expect(!CheckPoint(&executor, input).error().empty(), "Extra unknown IDs reject");
  input.clear_variable_values(); Expect(!CheckPoint(&executor, input).error().empty(), "Mismatched sparse vector lengths reject");
}

bridge::MathOptBridgeResponse TransformRobust(MathOptExecutor* executor,
    const bridge::MathOptRobustConstraintRequest& input) {
  bridge::MathOptBridgeRequest request; *request.mutable_add_robust_constraint() = input;
  const auto execution = Execute(executor, request); Expect(execution.ok, execution.error_message);
  bridge::MathOptBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Robust transformation response parses");
  return response;
}
bridge::MathOptRobustConstraintRequest RobustInput() {
  auto main = InnerRequest().model();
  auto* variables = main.mutable_variables();
  variables->add_ids(1); variables->add_lower_bounds(4); variables->add_upper_bounds(4); variables->add_integers(false);
  auto uncertainty = InnerRequest().model();
  uncertainty.mutable_variables()->set_upper_bounds(0, 1);
  bridge::MathOptRobustConstraintRequest input;
  input.set_model_proto(main.SerializeAsString()); input.set_uncertainty_model_proto(uncertainty.SerializeAsString());
  input.set_rhs_id(1);
  auto* coefficient = input.add_uncertain_coefficients(); coefficient->set_variable_id(0);
  coefficient->add_uncertainty_variable_ids(0); coefficient->add_coefficients(1); coefficient->set_offset(1);
  return input;
}
void FormulatesNativeRobustConstraints() {
  MathOptExecutor executor; const auto input = RobustInput();
  const auto response = TransformRobust(&executor, input);
  Expect(response.has_model_proto(), response.validation_error());
  math_opt::ModelProto model; Expect(model.ParseFromString(response.model_proto()), "Output model parses");
  Expect(model.variables().ids_size() == 4 && model.linear_constraints().ids_size() == 2,
      "Native LP duality adds split bound variables and linking rows");
  auto solved = math_opt::Solver::NonIncrementalSolve(model, math_opt::SOLVER_TYPE_GLOP, {}, {});
  Expect(solved.ok(), solved.status().ToString());
  Expect(std::abs(solved->solutions(0).primal_solution().objective_value() - 6) < 1e-8,
      "Native robust constraint enforces (1+w)*x <= 4 for every w in [0,1]");
  const int64_t id = 9007199254740993LL;
  auto exact = input; math_opt::ModelProto uncertainty;
  uncertainty.ParseFromString(input.uncertainty_model_proto());
  uncertainty.mutable_variables()->set_ids(0, id);
  uncertainty.mutable_objective()->mutable_linear_coefficients()->set_ids(0, id);
  exact.set_uncertainty_model_proto(uncertainty.SerializeAsString());
  exact.mutable_uncertain_coefficients(0)->set_uncertainty_variable_ids(0, id);
  Expect(TransformRobust(&executor, exact).has_model_proto(), "Exact uncertainty IDs survive native reconstruction");
}
void RejectsUnsafeRobustInputs() {
  MathOptExecutor executor;
  for (int variant = 0; variant < 8; ++variant) {
    auto input = RobustInput(); math_opt::ModelProto uncertainty;
    uncertainty.ParseFromString(input.uncertainty_model_proto());
    if (variant == 0) input.set_rhs_id(99);
    if (variant == 1) input.mutable_uncertain_coefficients(0)->set_variable_id(99);
    if (variant == 2) input.mutable_uncertain_coefficients(0)->set_uncertainty_variable_ids(0, 99);
    if (variant == 3) input.mutable_uncertain_coefficients(0)->clear_coefficients();
    if (variant == 4) input.mutable_uncertain_coefficients(0)->set_offset(std::numeric_limits<double>::quiet_NaN());
    if (variant == 5) uncertainty.mutable_variables()->set_integers(0, true);
    if (variant == 6) {
      auto* terms = uncertainty.mutable_objective()->mutable_quadratic_coefficients();
      terms->add_row_ids(0); terms->add_column_ids(0); terms->add_coefficients(1);
    }
    if (variant >= 5) input.set_uncertainty_model_proto(uncertainty.SerializeAsString());
    if (variant == 7) input.set_uncertainty_model_proto("\xff");
    Expect(TransformRobust(&executor, input).has_validation_error(), "Invalid robust input returns an error, never unchecked native access");
  }
  Expect(TransformRobust(&executor, RobustInput()).has_model_proto(), "Executor recovers after invalid robust inputs");
}

bridge::MathOptSolutionImprovementResponse ImproveValues(MathOptExecutor* executor,
    const bridge::MathOptSolutionImprovementRequest& input) {
  bridge::MathOptBridgeRequest request; request.set_improve_solution(input.SerializeAsString());
  const auto execution = Execute(executor, request); Expect(execution.ok, execution.error_message);
  bridge::MathOptBridgeResponse outer; bridge::MathOptSolutionImprovementResponse response;
  Expect(outer.ParseFromString(execution.payload) && response.ParseFromString(outer.improved_values()), "Improvement response parses");
  return response;
}
bridge::MathOptSolutionImprovementRequest ImprovementInput() {
  bridge::MathOptSolutionImprovementRequest input;
  input.set_model_proto(InnerRequest().model().SerializeAsString());
  input.add_variable_ids(0); input.add_variable_values(1); input.add_selected_variable_ids(0);
  return input;
}
void ImprovesSolutionsThroughNativeMathOpt() {
  MathOptExecutor executor; const auto input = ImprovementInput();
  const auto response = ImproveValues(&executor, input); Expect(response.error().empty(), response.error());
  math_opt::SparseDoubleVectorProto values;
  Expect(values.ParseFromString(response.variable_values_proto()) && values.ids(0) == 0 && values.values(0) == 4,
      "Native improvement moves selected variable to its best feasible bound");
  auto empty = input; empty.clear_selected_variable_ids();
  Expect(values.ParseFromString(ImproveValues(&executor, empty).variable_values_proto()) && values.values(0) == 1,
      "An explicit empty selection preserves the complete point");
  const int64_t id = 9007199254740993LL;
  auto exact = input; auto model = InnerRequest().model();
  model.mutable_variables()->set_ids(0, id); model.mutable_objective()->mutable_linear_coefficients()->set_ids(0, id);
  exact.set_model_proto(model.SerializeAsString()); exact.set_variable_ids(0, id); exact.set_selected_variable_ids(0, id);
  const auto transformed = ImproveValues(&executor, exact);
  Expect(transformed.error().empty() && values.ParseFromString(transformed.variable_values_proto()) && values.ids(0) == id,
      "Native output preserves exact int64 variable IDs");
}
void PreservesNativeImprovementErrors() {
  MathOptExecutor executor;
  for (int variant = 0; variant < 7; ++variant) {
    auto input = ImprovementInput(); auto model = InnerRequest().model();
    if (variant == 0) input.set_selected_variable_ids(0, 99);
    if (variant == 1) { input.clear_variable_ids(); input.clear_variable_values(); }
    if (variant == 2) input.set_variable_values(0, std::numeric_limits<double>::infinity());
    if (variant == 3) input.set_integrality_tolerance(-1);
    if (variant == 4) input.set_integrality_tolerance(0.2501);
    if (variant == 5) {
      model.mutable_variables()->set_upper_bounds(0, std::numeric_limits<double>::infinity());
      input.set_model_proto(model.SerializeAsString());
    }
    if (variant == 6) {
      auto* quadratic = model.mutable_objective()->mutable_quadratic_coefficients();
      quadratic->add_row_ids(0); quadratic->add_column_ids(0); quadratic->add_coefficients(1);
      input.set_model_proto(model.SerializeAsString());
    }
    Expect(!ImproveValues(&executor, input).error().empty(), "Native validation errors remain errors");
  }
  Expect(ImproveValues(&executor, ImprovementInput()).error().empty(), "Executor recovers after improvement errors");
}

void BoundsExpressionsThroughNativeMathOpt() {
  MathOptExecutor executor;
  math_opt::Model model;
  const auto x = model.AddContinuousVariable(-1, 2, "x");
  const auto y = model.AddContinuousVariable(3, 5, "y");
  model.AddLinearConstraint(x == 0);
  const math_opt::LinearExpression expression = 2 * x - 3 * y + 4;
  bridge::MathOptExpressionBoundsRequest input;
  input.set_model_proto(model.ExportModel().SerializeAsString());
  input.add_variable_ids(x.id()); input.add_coefficients(2);
  input.add_variable_ids(y.id()); input.add_coefficients(-3); input.set_offset(4);
  auto evaluate = [&](const bridge::MathOptExpressionBoundsRequest& value) {
    bridge::MathOptBridgeRequest request; request.set_expression_bounds(value.SerializeAsString());
    const auto execution = Execute(&executor, request); Expect(execution.ok, execution.error_message);
    bridge::MathOptBridgeResponse outer; bridge::MathOptExpressionBoundsResponse response;
    Expect(outer.ParseFromString(execution.payload) && response.ParseFromString(outer.expression_bounds()), "Native bounds reply parses");
    return response;
  };
  const auto response = evaluate(input);
  Expect(response.error().empty() && response.lower_bound() == math_opt::LowerBound(expression) &&
    response.upper_bound() == math_opt::UpperBound(expression) && response.lower_bound() == -13 && response.upper_bound() == -1,
    "Bridge matches direct native bounds independently of tighter constraints");
  for (int variant = 0; variant < 6; ++variant) {
    auto bad = input;
    if (variant == 0) bad.set_variable_ids(0, 99);
    if (variant == 1) bad.clear_coefficients();
    if (variant == 2) bad.set_variable_ids(1, x.id());
    if (variant == 3) bad.set_coefficients(0, std::numeric_limits<double>::infinity());
    if (variant == 4) bad.set_offset(std::numeric_limits<double>::quiet_NaN());
    if (variant == 5) bad.set_model_proto("\xff");
    Expect(!evaluate(bad).error().empty(), "Malformed expressions return native validation errors");
  }
  Expect(evaluate(input).error().empty(), "Executor recovers after invalid queries");
}

void RejectsRemoteFilesystemParameters() {
  char path[] = "/tmp/ortools-mathopt-policy-XXXXXX";
  const int fd = mkstemp(path); Expect(fd >= 0, "Create private policy sentinel"); close(fd);
  const absl::Cleanup cleanup = [&] { std::remove(path); };
  { std::ofstream output(path); output << "untouched"; }
  std::vector<operations_research::GScipParameters> parameters(3);
  parameters[0].set_search_logs_filename(path);
  parameters[1].set_detailed_solving_stats_filename(path);
  parameters[2].set_scip_model_filename(path);
  for (const std::string key : {"visual/vbcfilename", "visual/bakfilename", "heuristics/alns/rewardfilename", "certificate/filename", "future/file"}) {
    operations_research::GScipParameters value;
    (*value.mutable_string_params())[key] = path; parameters.push_back(value);
  }
  MathOptExecutor executor;
  for (const auto& value : parameters) for (int operation = 0; operation < 4; ++operation) {
    auto inner = InnerRequest(); inner.set_solver_type(math_opt::SOLVER_TYPE_GSCIP);
    *inner.mutable_parameters()->mutable_gscip() = value;
    bridge::MathOptBridgeRequest request;
    if (operation == 0) request.mutable_solve()->set_solve_request_proto(inner.SerializeAsString());
    if (operation == 1) request.mutable_incremental_create()->set_solve_request_proto(inner.SerializeAsString());
    if (operation == 2) request.mutable_incremental_solve()->set_solve_request_proto(inner.SerializeAsString());
    if (operation == 3) request.mutable_compute_infeasible_subsystem()->set_solve_request_proto(inner.SerializeAsString());
    const SolverExecutorRequest outer{1, "mathopt", request.SerializeAsString()};
    bool rejected = false;
    try { executor.RequestedThreads(outer, 0, 2); } catch (const std::invalid_argument&) { rejected = true; }
    Expect(rejected, "Admission rejects remote filesystem parameters");
    JobScheduler scheduler({1, 2}); SolverExecutorResult result;
    auto job = scheduler.Submit({"mathopt", 1}, [&](JobContext& context) {
      result = executor.Execute(outer, context, [](std::string) {}); return JobResult::Succeeded();
    });
    job.result().get();
    Expect(!result.ok && result.error_message.find("filesystem") != std::string::npos,
        "Direct executor entry also enforces filesystem policy");
    std::ifstream input(path); std::string contents; input >> contents;
    Expect(contents == "untouched", "Server never truncates the private sentinel");
  }
  auto safe = InnerRequest(); safe.set_solver_type(math_opt::SOLVER_TYPE_GSCIP);
  (*safe.mutable_parameters()->mutable_gscip()->mutable_int_params())["display/verblevel"] = 0;
  (*safe.mutable_parameters()->mutable_gscip()->mutable_string_params())["heuristics/undercover/fixingalts"] = "lni";
  bridge::MathOptBridgeRequest request; request.mutable_solve()->set_solve_request_proto(safe.SerializeAsString());
  Expect(InnerResponse(Execute(&executor, request)).has_result(), "Ordinary native parameters still solve");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"RejectsRemoteFilesystemParameters", RejectsRemoteFilesystemParameters},
      {"BoundsExpressionsThroughNativeMathOpt", BoundsExpressionsThroughNativeMathOpt},
      {"ImprovesSolutionsThroughNativeMathOpt", ImprovesSolutionsThroughNativeMathOpt},
      {"PreservesNativeImprovementErrors", PreservesNativeImprovementErrors},
      {"FormulatesNativeRobustConstraints", FormulatesNativeRobustConstraints},
      {"RejectsUnsafeRobustInputs", RejectsUnsafeRobustInputs},
      {"FormulatesIndicatorConstraintsThroughNativeMathOpt", FormulatesIndicatorConstraintsThroughNativeMathOpt},
      {"PreservesNativeIndicatorConversionErrors", PreservesNativeIndicatorConversionErrors},
      {"ChecksPrimalFeasibilityWithNativeTolerances", ChecksPrimalFeasibilityWithNativeTolerances},
      {"ValidatesCompletePrimalValuesAndExactIds", ValidatesCompletePrimalValuesAndExactIds},
      {"ReportsNativeIisCapabilities", ReportsNativeIisCapabilities},
      {"RejectsUnsupportedNativeCones", RejectsUnsupportedNativeCones},
      {"PreservesNativeObjectiveUpdatesAndParameterReferences", PreservesNativeObjectiveUpdatesAndParameterReferences},
      {"ConvertsStandaloneSolutionsWithExactIds", ConvertsStandaloneSolutionsWithExactIds},
      {"ConvertsNativeResultMetadata", ConvertsNativeResultMetadata},
      {"RejectsMalformedNativeConversionsAndRecovers", RejectsMalformedNativeConversionsAndRecovers},
      {"ExecutesNativeCallbacks", ExecutesNativeCallbacks},
      {"StreamsNativeMessages", StreamsNativeMessages},
      {"RejectsGlpkIncrementalThreadLifetime", RejectsGlpkIncrementalThreadLifetime},
      {"ValidatesImportedResultsUsingNativeValidators", ValidatesImportedResultsUsingNativeValidators},
      {"ValidatesEditableImportsNatively", ValidatesEditableImportsNatively},
      {"ConvertsMpsUsingNativeConverters", ConvertsMpsUsingNativeConverters},
      {"RejectsMalformedAndLossyMpsConversions", RejectsMalformedAndLossyMpsConversions},
      {"BackendOverrideAdmissionMatchesMergePrecedence", BackendOverrideAdmissionMatchesMergePrecedence},
      {"BindsAutomaticCpSatWorkersToAdmittedBudget", BindsAutomaticCpSatWorkersToAdmittedBudget},
      {"SolvesWithBackendWorkerOverrides", SolvesWithBackendWorkerOverrides},
      {"RejectsInvalidBackendWorkerCounts", RejectsInvalidBackendWorkerCounts},
      {"SolvesNestedProto", SolvesNestedProto},
      {"UpdatesRawIncrementalSessionsWithoutRebuilding", UpdatesRawIncrementalSessionsWithoutRebuilding},
      {"RejectsIncrementalBackendChanges", RejectsIncrementalBackendChanges},
      {"CreatesAndDeletesIncrementalSession", CreatesAndDeletesIncrementalSession},
      {"ReservesNestedThreadCount", ReservesNestedThreadCount},
      {"AcceptsGlopThreads", AcceptsGlopThreads},
      {"RejectsUnsupportedGlpkThreads", RejectsUnsupportedGlpkThreads},
      {"UsesPdlpThreadSelection", UsesPdlpThreadSelection},
      {"UsesGscipConcurrentSolve", UsesGscipConcurrentSolve},
      {"ReservesOneThreadForIncrementalSessionCreation",
       ReservesOneThreadForIncrementalSessionCreation}};
  for (const auto& [name, test] : tests) {
    try { test(); std::cout << "[PASS] " << name << '\n'; }
    catch (const std::exception& error) { std::cerr << "[FAIL] " << name << ": " << error.what() << '\n'; return EXIT_FAILURE; }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
