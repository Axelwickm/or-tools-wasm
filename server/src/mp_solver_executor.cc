#include "server/src/mp_solver_executor.h"
#include "server/src/remote_parameters.h"

#include <stdexcept>
#include <string>
#include <utility>

#include "CbcModel.hpp"
#include "absl/time/time.h"
#include "generated_proto_schemas.h"
#include "javascript/mp_solver_parameters.h"
#include "javascript/mp_solver_search.h"
#include "javascript/mp_solver_messages.h"
#include "javascript/mp_solver_model_import.h"
#include "javascript/mp_solver_model_queries.h"
#include "javascript/mp_solver_solution_verification.h"
#include "mp_solver.pb.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::MPModelRequest;
using ::operations_research::MPSolutionResponse;
using ::operations_research::MPSolver;

SolverExecutorResult Error(std::string message,
                           SolverExecutionFailureKind kind = SolverExecutionFailureKind::kInvalidRequest) {
  return SolverExecutorResult{false, {}, std::move(message), kind};
}

SolverExecutorResult Response(const bridge::MpSolverBridgeResponse& response) {
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize MP Solver response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

int EffectiveThreads(const MPModelRequest& request, int requested_threads) {
  requested_threads = requested_threads > 0 ? requested_threads : 1;
  if (request.solver_type() == MPModelRequest::CBC_MIXED_INTEGER_PROGRAMMING &&
      requested_threads > 1 && !CbcModel::haveMultiThreadSupport()) {
    throw std::invalid_argument(
        "CBC was built without multi-thread support.");
  }
  return requested_threads;
}

std::function<void(const std::string&)> Messages(bool stream, const SolverEventSink& emit_event) {
  if (!stream) return nullptr;
  return [emit_event](const std::string& message) {
    if (message.empty()) return;
    bridge::MpSolverLogEvent event;
    event.add_messages(message);
    emit_event(event.SerializeAsString());
  };
}

SolverExecutorResult Solve(const bridge::MpSolverSolveRequest& solve_request,
                           const JobContext& context, const SolverEventSink& emit_event,
                           const ScopedMpSolverCallback::Transport& transport) {
  MPModelRequest request;
  if (!request.ParseFromString(solve_request.request_proto())) return Error("Failed to parse MPModelRequest.");
  if (!request.has_model()) return Error("MPModelRequest has no model.");

  MPSolutionResponse solution;
  const auto problem_type =
      static_cast<MPSolver::OptimizationProblemType>(request.solver_type());
  if (!MPSolver::SupportsProblemType(problem_type)) {
    solution.set_status(operations_research::MPSOLVER_SOLVER_TYPE_UNAVAILABLE);
    solution.set_status_str("The requested MP Solver backend is not available on this server.");
    bridge::MpSolverBridgeResponse response;
    response.set_response_proto(solution.SerializeAsString());
    return Response(response);
  }

  bridge::MpSolverNativeMetadata metadata;
  const int num_threads = EffectiveThreads(request, solve_request.num_threads());
  bool rejected = !NormalizeMpSolverParameters(&request, num_threads, &solution);
  MPSolver solver(request.model().name(), problem_type);
  if (request.enable_internal_solver_output()) solver.EnableOutput();
  if (!rejected && (num_threads > 1 || request.solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING)) {
    const auto status = solver.SetNumThreads(num_threads);
    if (!status.ok()) {
      solution.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
      solution.set_status_str(std::string(status.message()));
      rejected = true;
    }
  }
  if (!rejected) {
    std::string error;
    const auto load_status = solve_request.editable_snapshot()
        ? PopulateMpSolverSnapshot(request.model(), solver, &error)
        : solver.LoadModelFromProto(request.model(), &error);
    if (load_status != operations_research::MPSOLVER_MODEL_IS_VALID) {
      solution.set_status(load_status);
      solution.set_status_str(error);
      rejected = true;
    }
  }
  if (!rejected && request.has_solver_time_limit_seconds()) {
    solver.SetTimeLimit(absl::Seconds(request.solver_time_limit_seconds()));
  }
  if (!rejected && request.has_solver_specific_parameters() &&
      !request.solver_specific_parameters().empty() &&
      !solver.SetSolverSpecificParametersAsString(request.solver_specific_parameters()) &&
      !request.ignore_solver_specific_parameters_failure()) {
    solution.set_status(operations_research::MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS);
    solution.set_status_str("MP Solver parameters could not be applied.");
    rejected = true;
  }
  if (!rejected) {
    if (solve_request.has_starting_basis()) ApplyMpStartingBasis(solver, solve_request.starting_basis());
    ScopedMpSolverCallback callback(solver, solve_request.has_callback_registration() ? &solve_request.callback_registration() : nullptr, transport);
    ScopedMpSolverMessages messages(solver, Messages(solve_request.stream_messages(), emit_event));
    auto cancellation = context.OnCancellation([&solver] { solver.InterruptSolve(); });
    if (context.cancellation_requested()) return Error("MP Solver solve was cancelled before it started.", SolverExecutionFailureKind::kCancelled);
    operations_research::MPSolverParameters parameters;
    for (const auto& [key, value] : solve_request.parameters().double_params()) {
      parameters.SetDoubleParam(
          static_cast<operations_research::MPSolverParameters::DoubleParam>(key), value);
    }
    for (const auto& [key, value] : solve_request.parameters().integer_params()) {
      parameters.SetIntegerParam(
          static_cast<operations_research::MPSolverParameters::IntegerParam>(key), value);
    }
    solver.Solve(parameters);
    callback.CheckError();
    solver.FillSolutionResponseProto(&solution);
    metadata.set_solver_version(solver.SolverVersion());
    metadata.set_iterations(solver.iterations());
    metadata.set_nodes(solver.IsMIP() ? solver.nodes() : -1);
    if (!solver.IsMIP() && problem_type != MPSolver::PDLP_LINEAR_PROGRAMMING && (solution.status() == operations_research::MPSOLVER_OPTIMAL ||
                           solution.status() == operations_research::MPSOLVER_FEASIBLE)) {
      for (const auto* variable : solver.variables()) metadata.add_variable_basis_status(variable->basis_status());
      for (const auto* constraint : solver.constraints()) metadata.add_constraint_basis_status(constraint->basis_status());
      if (problem_type == MPSolver::GLPK_LINEAR_PROGRAMMING) metadata.set_exact_condition_number(solver.ComputeExactConditionNumber());
    }
  }

  bridge::MpSolverBridgeResponse response;
  response.set_response_proto(solution.SerializeAsString());
  if (!rejected) *response.mutable_metadata() = std::move(metadata);
  return Response(response);
}

}  // namespace

std::string MpSolverExecutor::solver() const { return "mp-solver"; }

int MpSolverExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                       int client_requested_threads,
                                       int server_total_threads) const {
  bridge::MpSolverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse MP Solver bridge request.");
  ValidateRemoteParameters(parsed);
  const bridge::MpSolverSolveRequest* solve_request = nullptr;
  if (parsed.payload_case() == bridge::MpSolverBridgeRequest::kSolve) solve_request = &parsed.solve();
  if (parsed.payload_case() == bridge::MpSolverBridgeRequest::kSessionRun &&
      parsed.session_run().action() == bridge::MpSolverSessionRunRequest::SOLVE) solve_request = &parsed.session_run().solve();
  if (!solve_request) return 1;
  const int payload_threads = solve_request->num_threads() > 0 ? solve_request->num_threads() : 1;
  if (client_requested_threads > 0 && client_requested_threads != payload_threads) throw std::invalid_argument("MP Solver thread counts do not match.");
  MPModelRequest model_request;
  if (!model_request.ParseFromString(solve_request->request_proto())) {
    throw std::invalid_argument("Failed to parse MPModelRequest.");
  }
  const int effective_threads = EffectiveThreads(model_request, payload_threads);
  MPSolutionResponse validation;
  if (!NormalizeMpSolverParameters(&model_request, effective_threads, &validation)) {
    throw std::invalid_argument(validation.status_str());
  }
  if (effective_threads > server_total_threads) throw std::invalid_argument("MP Solver requests more threads than server capacity.");
  return effective_threads;
}

SolverExecutorResult MpSolverExecutor::Execute(const SolverExecutorRequest& request,
                                               const JobContext& context,
                                               const SolverEventSink& emit_event) {
  bridge::MpSolverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse MP Solver bridge request.");
  try { ValidateRemoteParameters(parsed); }
  catch (const std::exception& error) { return Error(error.what()); }
  switch (parsed.payload_case()) {
    case bridge::MpSolverBridgeRequest::kCapabilities:
    case bridge::MpSolverBridgeRequest::kExportModel:
    case bridge::MpSolverBridgeRequest::kClampSolution:
    case bridge::MpSolverBridgeRequest::kLoadSolution:
    case bridge::MpSolverBridgeRequest::kActivities: {
      const auto result = QueryMpSolverModel(parsed);
      if (!result.ok()) return Error(result.status().ToString());
      return Response(*result);
    }
    case bridge::MpSolverBridgeRequest::kSessionCreate:
      try { return Response(sessions_.Create(parsed.session_create())); }
      catch (const std::exception& error) { return Error(error.what()); }
    case bridge::MpSolverBridgeRequest::kSessionRun:
      try {
        return Response(sessions_.Run(parsed.session_run(), [&](MPSolver& solver, const operations_research::MPSolverParameters& parameters) {
          ScopedMpSolverCallback callback(solver,
              parsed.session_run().solve().has_callback_registration() ? &parsed.session_run().solve().callback_registration() : nullptr, request.callback);
          ScopedMpSolverMessages messages(solver, Messages(parsed.session_run().solve().stream_messages(), emit_event));
          auto cancellation = context.OnCancellation([&solver] { solver.InterruptSolve(); });
          if (context.cancellation_requested()) throw std::runtime_error("MPSolver session solve was cancelled before it started.");
          solver.Solve(parameters);
          callback.CheckError();
        }));
      } catch (const std::exception& error) { return Error(error.what()); }
    case bridge::MpSolverBridgeRequest::kSessionClose:
      try { return Response(sessions_.Close(parsed.session_close().handle())); }
      catch (const std::exception& error) { return Error(error.what()); }
    case bridge::MpSolverBridgeRequest::kVerifySolution: {
      const auto& input = parsed.verify_solution();
      const auto verified = ortools_wasm::VerifyMpSolverSolution(
          input.model_proto(), input.solution_proto(), input.solver_type(),
          input.tolerance(), input.log_errors());
      if (!verified.ok()) return Error(std::string(verified.status().message()));
      bridge::MpSolverBridgeResponse response;
      response.set_solution_verified(*verified);
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::kSolve:
      try { return Solve(parsed.solve(), context, emit_event, request.callback); }
      catch (const std::exception& error) { return Error(error.what()); }
    case bridge::MpSolverBridgeRequest::kValidateParameters: {
      const auto& input = parsed.validate_parameters();
      const int accepted = ortools_wasm::ValidateMpSolverSpecificParameters(input.solver_type(), input.parameters());
      if (accepted < 0) return Error("MPSolver parameter validation backend is unavailable.");
      bridge::MpSolverBridgeResponse response;
      response.set_parameters_accepted(accepted == 1);
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::kValidateModel: {
      bridge::MpSolverBridgeResponse response;
      response.set_model_validation_error(ortools_wasm::FindErrorInMpModelBytes(parsed.validate_model().model_proto()));
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::kImportModel: {
      const auto& input = parsed.import_model();
      const auto imported = ortools_wasm::ImportMpSolverModel(input.model_proto(), input.solver_type(), input.name(), input.keep_names());
      bridge::MpSolverBridgeResponse response;
      auto* result = response.mutable_import_model();
      result->set_status(imported.status); result->set_error(imported.error);
      if (imported.status == operations_research::MPSOLVER_MODEL_IS_VALID) result->set_model_proto(imported.model.SerializeAsString());
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::kSchema: {
      bridge::MpSolverBridgeResponse response;
      auto* schema = response.mutable_schema();
      schema->set_linear_solver_proto_schema(operations_research::sat::wasm::kLinearSolverProtoSchema);
      schema->set_optional_boolean_proto_schema(operations_research::sat::wasm::kOptionalBooleanProtoSchema);
      for (int id : {0, 1, 2, 3, 4, 5, 8, 12, 13, 14}) {
        const auto type = static_cast<MPSolver::OptimizationProblemType>(id);
        if (!MPSolver::SupportsProblemType(type)) continue;
        MPSolver solver("", type);
        (*schema->mutable_backend_versions())[id] = solver.SolverVersion();
      }
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::PAYLOAD_NOT_SET:
      return Error("MP Solver request has no operation.");
  }
  return Error("Unknown MP Solver operation.");
}

}  // namespace ortools_wasm::server
