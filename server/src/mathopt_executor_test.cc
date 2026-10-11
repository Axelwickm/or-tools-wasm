#include "server/src/mathopt_executor.h"

#include <cstdlib>
#include <cstdint>
#include <limits>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "mathopt.pb.h"
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/io/mps_converter.h"
#include "ortools/math_opt/storage/model_storage.h"
#include "ortools/math_opt/core/solver.h"
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

void ReportsNativeIisBackendLimitations() {
  for (const auto type : {math_opt::SOLVER_TYPE_GLOP, math_opt::SOLVER_TYPE_GSCIP,
      math_opt::SOLVER_TYPE_GLPK, math_opt::SOLVER_TYPE_CP_SAT, math_opt::SOLVER_TYPE_PDLP}) {
    auto model = InnerRequest().model();
    if (type == math_opt::SOLVER_TYPE_CP_SAT) model.mutable_variables()->set_integers(0, true);
    auto* rows = model.mutable_linear_constraints();
    rows->add_ids(17); rows->add_lower_bounds(5); rows->add_upper_bounds(std::numeric_limits<double>::infinity());
    auto* matrix = model.mutable_linear_constraint_matrix();
    matrix->add_row_ids(17); matrix->add_column_ids(0); matrix->add_coefficients(1);
    // x <= 4 and x >= 5 is valid but infeasible. Calling the native API proves
    // the built MathOpt adapters lack IIS, independently of wrapper coverage.
    math_opt::Solver::ComputeInfeasibleSubsystemArgs arguments;
    arguments.parameters.set_threads(1);
    auto result = math_opt::Solver::NonIncrementalComputeInfeasibleSubsystem(model, type, {}, arguments);
    Expect(!result.ok() && result.status().code() == absl::StatusCode::kUnimplemented,
        "Native MathOpt IIS must report UNIMPLEMENTED for " + math_opt::SolverTypeProto_Name(type) +
        ": " + result.status().ToString());
  }
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"ReportsNativeIisBackendLimitations", ReportsNativeIisBackendLimitations},
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
