#include "server/src/mathopt_executor.h"
#include "server/src/remote_parameters.h"
#include "javascript/mathopt_thread_budget.h"
#include "javascript/mathopt_incremental.h"
#include "javascript/mathopt_mps_conversion.h"
#include "javascript/mathopt_result_validation.h"
#include "javascript/mathopt_result_conversion.h"
#include "javascript/mathopt_feasibility.h"
#include "javascript/mathopt_expression_bounds.h"
#include "javascript/mathopt_solution_improvement.h"
#include "javascript/mathopt_model_transform.h"

#include <exception>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "absl/status/status.h"
#include "mathopt.pb.h"
#include "mathopt_iis.pb.h"
#include "ortools/math_opt/core/solver.h"
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/solvers/cp_sat_solver.h"
#include "ortools/math_opt/solvers/glop_solver.h"
#include "ortools/math_opt/solvers/pdlp_solver.h"
#include "ortools/util/solve_interrupter.h"
#ifdef USE_SCIP
#include "ortools/math_opt/solvers/gscip_solver.h"
#endif

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
namespace math_opt = ::operations_research::math_opt;
using ::operations_research::SolveInterrupter;

SolverExecutorResult Error(std::string message) {
  return SolverExecutorResult{false, {}, std::move(message), SolverExecutionFailureKind::kInvalidRequest};
}

void SetStatus(math_opt::SolveResponse* response, const absl::Status& status) {
  response->mutable_status()->set_code(static_cast<int>(status.code()));
  response->mutable_status()->set_message(std::string(status.message()));
}

void EnsureSolversRegistered() {
  static std::once_flag once;
  std::call_once(once, [] {
    auto* registry = math_opt::AllSolversRegistry::Instance();
    if (!registry->IsRegistered(math_opt::SOLVER_TYPE_GLOP)) registry->Register(math_opt::SOLVER_TYPE_GLOP, math_opt::GlopSolver::New);
    if (!registry->IsRegistered(math_opt::SOLVER_TYPE_CP_SAT)) registry->Register(math_opt::SOLVER_TYPE_CP_SAT, math_opt::CpSatSolver::New);
    if (!registry->IsRegistered(math_opt::SOLVER_TYPE_PDLP)) registry->Register(math_opt::SOLVER_TYPE_PDLP, math_opt::PdlpSolver::New);
#ifdef USE_SCIP
    if (!registry->IsRegistered(math_opt::SOLVER_TYPE_GSCIP)) registry->Register(math_opt::SOLVER_TYPE_GSCIP, math_opt::GScipSolver::New);
#endif
  });
}

math_opt::Solver::SolveArgs SolveArguments(const math_opt::SolveRequest& request,
                                           math_opt::SolveResponse* response,
                                           const SolveInterrupter* interrupter, const SolverExecutorRequest& outer,
                                           const std::optional<std::string>& registration,
                                           const SolverEventSink& emit_event, bool stream_messages) {
  math_opt::Solver::MessageCallback messages = nullptr;
  if (request.parameters().enable_output()) {
    messages = [response, emit_event, stream_messages](const std::vector<std::string>& values) {
      for (const auto& value : values) response->add_messages(value);
      if (stream_messages && !values.empty()) {
        bridge::MathOptLogEvent event;
        for (const auto& value : values) event.add_messages(value);
        emit_event(event.SerializeAsString());
      }
    };
  }
  math_opt::Solver::SolveArgs arguments;
  arguments.parameters = request.parameters();
  arguments.model_parameters = request.model_parameters();
  arguments.message_callback = std::move(messages);
  if (registration) {
    if (!outer.callback || !arguments.callback_registration.ParseFromString(*registration)) throw std::invalid_argument("Invalid MathOpt callback registration or missing callback transport.");
    arguments.user_cb = [callback = outer.callback](const math_opt::CallbackDataProto& data) -> math_opt::CallbackResultProto {
      const auto reply = callback(data.SerializeAsString());
      if (!reply) { math_opt::CallbackResultProto stopped; stopped.set_terminate(true); return stopped; }
      math_opt::CallbackResultProto result;
      if (!result.ParseFromString(*reply)) result.set_terminate(true);
      return result;
    };
  }
  arguments.interrupter = interrupter;
  return arguments;
}

SolverExecutorResult OuterResponse(const math_opt::SolveResponse& inner) {
  bridge::MathOptBridgeResponse response;
  response.set_solve_response_proto(inner.SerializeAsString());
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize MathOpt response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

bool ParseSolveRequest(const std::string& bytes, math_opt::SolveRequest* request,
                       math_opt::SolveResponse* response) {
  if (request->ParseFromString(bytes)) return true;
  SetStatus(response, absl::InvalidArgumentError("Could not parse MathOpt SolveRequest."));
  return false;
}

}  // namespace

struct MathOptExecutor::Session {
  std::mutex mutex;
  std::unique_ptr<math_opt::Solver> solver;
  math_opt::SolverTypeProto solver_type;
  math_opt::Solver::InitArgs init_args;
};

std::shared_ptr<MathOptExecutor::Session> MathOptExecutor::FindSession(uint64_t handle) {
  return sessions_.Find(handle);
}

std::string MathOptExecutor::solver() const { return "mathopt"; }

int MathOptExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                      int client_requested_threads,
                                      int server_total_threads) const {
  bridge::MathOptBridgeRequest outer;
  if (!outer.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse MathOpt bridge request.");
  ValidateRemoteParameters(outer);
  const std::string* solve_bytes = nullptr;
  if (outer.payload_case() == bridge::MathOptBridgeRequest::kSolve) solve_bytes = &outer.solve().solve_request_proto();
  if (outer.payload_case() == bridge::MathOptBridgeRequest::kIncrementalSolve) solve_bytes = &outer.incremental_solve().solve_request_proto();
  if (outer.payload_case() == bridge::MathOptBridgeRequest::kComputeInfeasibleSubsystem) solve_bytes = &outer.compute_infeasible_subsystem().solve_request_proto();
  int requested = 1;
  if (solve_bytes != nullptr) {
    math_opt::SolveRequest parsed;
    if (!parsed.ParseFromString(*solve_bytes)) throw std::invalid_argument("Failed to parse MathOpt SolveRequest.");
    requested = ortools_wasm::MathOptThreadRequirement(parsed);
    if (requested > 1 &&
        parsed.solver_type() == math_opt::SOLVER_TYPE_GLPK) {
      throw std::invalid_argument(
          "The selected MathOpt backend does not support multiple threads.");
    }
  }
  if (client_requested_threads > 0 && client_requested_threads != requested) throw std::invalid_argument("MathOpt thread counts do not match.");
  if (requested < 1 || requested > server_total_threads) throw std::invalid_argument("MathOpt thread count is outside server capacity.");
  return requested;
}

SolverExecutorResult MathOptExecutor::Execute(const SolverExecutorRequest& request,
                                              const JobContext& context,
                                              const SolverEventSink& emit_event) {
  bridge::MathOptBridgeRequest outer;
  if (!outer.ParseFromString(request.payload)) return Error("Failed to parse MathOpt bridge request.");
  try { ValidateRemoteParameters(outer); }
  catch (const std::invalid_argument& error) { return Error(error.what()); }
  EnsureSolversRegistered();
  math_opt::SolveResponse response;
  try {
    switch (outer.payload_case()) {
      case bridge::MathOptBridgeRequest::kComputeInfeasibleSubsystem: {
        const auto& input = outer.compute_infeasible_subsystem();
        math_opt::SolveRequest parsed;
        bridge::MathOptInfeasibleSubsystemResponse reply;
        if (!parsed.ParseFromString(input.solve_request_proto())) return Error("Could not parse MathOpt IIS request.");
        std::shared_ptr<Session> session;
        std::unique_lock<std::mutex> session_lock;
        if (input.has_handle()) {
          session = FindSession(input.handle());
          if (!session) return Error("MathOpt IncrementalSolver is closed.");
          session_lock = std::unique_lock(session->mutex);
          const auto backend = ortools_wasm::CheckMathOptSessionBackend(parsed, session->solver_type);
          if (!backend.ok()) return Error(backend.ToString());
          if (input.has_model_update_proto()) {
            math_opt::ModelUpdateProto update;
            if (!update.ParseFromString(input.model_update_proto())) return Error("Could not parse MathOpt ModelUpdateProto.");
            const auto status = ortools_wasm::UpdateMathOptSolver(session->solver, parsed,
                session->solver_type, session->init_args, std::move(update));
            if (!status.ok()) return Error(status.ToString());
          }
        } else if (input.has_model_update_proto()) {
          return Error("MathOpt IIS model updates require a retained solver.");
        }
        ortools_wasm::BindMathOptAutomaticWorkers(&parsed, context.allocated_threads());
        SolveInterrupter interrupter;
        if (input.interrupt_at_start() || context.cancellation_requested() || context.interruption_requested()) interrupter.Interrupt();
        auto cancellation = context.OnCancellation([&] { interrupter.Interrupt(); });
        auto interruption = context.OnInterruption([&] { interrupter.Interrupt(); });
        math_opt::Solver::ComputeInfeasibleSubsystemArgs arguments;
        arguments.parameters = parsed.parameters();
        arguments.interrupter = &interrupter;
        if (parsed.parameters().enable_output()) arguments.message_callback = [&](const std::vector<std::string>& values) {
          for (const auto& value : values) reply.add_messages(value);
          if (input.stream_messages() && !values.empty()) {
            bridge::MathOptLogEvent event;
            for (const auto& value : values) event.add_messages(value);
            emit_event(event.SerializeAsString());
          }
        };
        const auto result = session ? session->solver->ComputeInfeasibleSubsystem(arguments)
            : math_opt::Solver::NonIncrementalComputeInfeasibleSubsystem(parsed.model(), parsed.solver_type(),
                {.streamable = parsed.initializer()}, arguments);
        if (result.ok()) reply.set_result_proto(result->SerializeAsString());
        else { reply.mutable_status()->set_code(static_cast<int>(result.status().code()));
          reply.mutable_status()->set_message(std::string(result.status().message())); }
        bridge::MathOptBridgeResponse outer_reply;
        outer_reply.set_solve_response_proto(reply.SerializeAsString());
        return SolverExecutorResult{true, outer_reply.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kAddRobustConstraint: {
        const auto result = ortools_wasm::AddMathOptRobustConstraint(outer.add_robust_constraint());
        bridge::MathOptBridgeResponse response;
        if (result.ok()) response.set_model_proto(result->SerializeAsString());
        else response.set_validation_error(result.status().ToString());
        return SolverExecutorResult{true, response.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kFormulateIndicatorConstraintAsMip: {
        const auto& input = outer.formulate_indicator_constraint_as_mip();
        const auto result = ortools_wasm::FormulateMathOptIndicatorAsMip(input.model_proto(), input.indicator_constraint_id());
        bridge::MathOptBridgeResponse response;
        if (result.ok()) response.set_model_proto(result->SerializeAsString());
        else response.set_validation_error(result.status().ToString());
        return SolverExecutorResult{true, response.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kExpressionBounds: {
        bridge::MathOptBridgeResponse response;
        response.set_expression_bounds(ortools_wasm::MathOptExpressionBoundsBytes(outer.expression_bounds()));
        return SolverExecutorResult{true, response.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kImproveSolution: {
        bridge::MathOptBridgeResponse response;
        response.set_improved_values(ortools_wasm::ImproveMathOptSolutionBytes(outer.improve_solution()));
        return SolverExecutorResult{true, response.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kCheckPrimalFeasibility: {
        bridge::MathOptBridgeResponse response;
        response.set_primal_feasibility(ortools_wasm::CheckMathOptFeasibilityBytes(outer.check_primal_feasibility()));
        return SolverExecutorResult{true, response.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kConvertResult: {
        const auto& input = outer.convert_result();
        const auto conversion = ortools_wasm::ConvertMathOptResultProto(input.kind(), input.model_proto(), input.input_proto());
        bridge::MathOptBridgeResponse result;
        if (conversion.error.empty()) result.set_validated_result_proto(conversion.result);
        else result.set_validation_error(conversion.error);
        return SolverExecutorResult{true, result.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kValidateResult: {
        const auto& input = outer.validate_result();
        const auto validation = ortools_wasm::ValidateMathOptResultBytes(input.solve_request_proto(), input.result_proto());
        bridge::MathOptBridgeResponse result;
        if (validation.error.empty()) result.set_validated_result_proto(validation.result);
        else result.set_validation_error(validation.error);
        return SolverExecutorResult{true, result.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kValidateModel: {
        bridge::MathOptBridgeResponse result;
        result.set_validation_error(ortools_wasm::ValidateMathOptModelBytes(outer.validate_model()));
        return SolverExecutorResult{true, result.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kModelProtoToMps:
      case bridge::MathOptBridgeRequest::kMpsToModelProto: {
        const bool to_mps = outer.payload_case() == bridge::MathOptBridgeRequest::kModelProtoToMps;
        const auto converted = ortools_wasm::ConvertMathOptMps(to_mps ? outer.model_proto_to_mps() : outer.mps_to_model_proto(), to_mps);
        if (!converted.error.empty()) return Error(converted.error);
        bridge::MathOptBridgeResponse result;
        if (to_mps) result.set_mps(converted.output); else result.set_model_proto(converted.output);
        return SolverExecutorResult{true, result.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kSolve: {
        math_opt::SolveRequest parsed;
        if (!ParseSolveRequest(outer.solve().solve_request_proto(), &parsed, &response)) return OuterResponse(response);
        ortools_wasm::BindMathOptAutomaticWorkers(&parsed, context.allocated_threads());
        SolveInterrupter interrupter;
        if (outer.solve().interrupt_at_start() || (context.cancellation_requested() || context.interruption_requested())) interrupter.Interrupt();
        auto cancellation = context.OnCancellation([&interrupter] { interrupter.Interrupt(); });
        auto interruption = context.OnInterruption([&interrupter] { interrupter.Interrupt(); });
        math_opt::Solver::InitArgs init_args;
        init_args.streamable = parsed.initializer();
        auto result = math_opt::Solver::NonIncrementalSolve(
            parsed.model(), parsed.solver_type(), init_args,
            SolveArguments(parsed, &response, &interrupter, request, outer.solve().has_callback_registration_proto() ? std::make_optional(outer.solve().callback_registration_proto()) : std::nullopt, emit_event, outer.solve().stream_messages()));
        if (!result.ok()) SetStatus(&response, result.status());
        else *response.mutable_result() = std::move(*result);
        return OuterResponse(response);
      }
      case bridge::MathOptBridgeRequest::kIncrementalCreate: {
        math_opt::SolveRequest parsed;
        if (!ParseSolveRequest(outer.incremental_create().solve_request_proto(), &parsed, &response)) return OuterResponse(response);
        // GLPK destroys its problem objects when their creating thread exits.
        // Server jobs run on separate threads, so no GLPK session can outlive creation.
        if (parsed.solver_type() == math_opt::SOLVER_TYPE_GLPK) {
          SetStatus(&response, absl::UnimplementedError(
              "MathOpt GLPK incremental sessions require the same execution thread and are not supported by the server executor."));
          return OuterResponse(response);
        }
        math_opt::Solver::InitArgs init_args;
        init_args.streamable = parsed.initializer();
        auto solver = math_opt::Solver::New(parsed.solver_type(), parsed.model(), init_args);
        if (!solver.ok()) SetStatus(&response, solver.status());
        else {
          auto session = std::make_shared<Session>();
          session->solver = std::move(*solver);
          session->solver_type = parsed.solver_type();
          session->init_args = init_args;
          const uint64_t handle = sessions_.Insert(std::move(session));
          response.add_messages(std::to_string(handle));
        }
        return OuterResponse(response);
      }
      case bridge::MathOptBridgeRequest::kIncrementalUpdate: {
        const auto& operation = outer.incremental_update();
        auto session = FindSession(operation.handle());
        if (!session) return Error("MathOpt IncrementalSolver is closed.");
        std::lock_guard session_lock(session->mutex);
        math_opt::ModelUpdateProto update;
        if (!update.ParseFromString(operation.model_update_proto())) return Error("Could not parse MathOpt ModelUpdateProto.");
        const auto updated = session->solver->Update(std::move(update));
        if (!updated.ok()) return Error(updated.status().ToString());
        bridge::MathOptBridgeResponse result;
        result.set_update_applied(*updated);
        return SolverExecutorResult{true, result.SerializeAsString(), {}};
      }
      case bridge::MathOptBridgeRequest::kIncrementalSolve: {
        const auto& operation = outer.incremental_solve();
        auto session = FindSession(operation.handle());
        if (!session) { SetStatus(&response, absl::FailedPreconditionError("MathOpt IncrementalSolver is closed.")); return OuterResponse(response); }
        std::lock_guard session_lock(session->mutex);
        math_opt::SolveRequest parsed;
        if (!ParseSolveRequest(operation.solve_request_proto(), &parsed, &response)) return OuterResponse(response);
        const auto backend = ortools_wasm::CheckMathOptSessionBackend(parsed, session->solver_type);
        if (!backend.ok()) { SetStatus(&response, backend); return OuterResponse(response); }
        if (operation.has_model_update_proto()) {
          math_opt::ModelUpdateProto update;
          if (!update.ParseFromString(operation.model_update_proto())) {
            SetStatus(&response, absl::InvalidArgumentError("Could not parse MathOpt ModelUpdateProto."));
            return OuterResponse(response);
          }
          const auto updated = ortools_wasm::UpdateMathOptSolver(session->solver, parsed,
              session->solver_type, session->init_args, std::move(update));
          if (!updated.ok()) { SetStatus(&response, updated); return OuterResponse(response); }
        }
        ortools_wasm::BindMathOptAutomaticWorkers(&parsed, context.allocated_threads());
        SolveInterrupter interrupter;
        if (operation.interrupt_at_start() || (context.cancellation_requested() || context.interruption_requested())) interrupter.Interrupt();
        auto cancellation = context.OnCancellation([&interrupter] { interrupter.Interrupt(); });
        auto interruption = context.OnInterruption([&interrupter] { interrupter.Interrupt(); });
        auto result = session->solver->Solve(SolveArguments(parsed, &response, &interrupter, request, operation.has_callback_registration_proto() ? std::make_optional(operation.callback_registration_proto()) : std::nullopt, emit_event, operation.stream_messages()));
        if (!result.ok()) SetStatus(&response, result.status());
        else *response.mutable_result() = std::move(*result);
        return OuterResponse(response);
      }
      case bridge::MathOptBridgeRequest::kIncrementalDelete: {
        sessions_.Erase(outer.incremental_delete().handle());
        return OuterResponse(response);
      }
      case bridge::MathOptBridgeRequest::PAYLOAD_NOT_SET:
        return Error("MathOpt request has no operation.");
    }
  } catch (const std::exception& error) {
    SetStatus(&response, absl::InternalError(error.what()));
    return OuterResponse(response);
  }
  return Error("Unknown MathOpt operation.");
}

}  // namespace ortools_wasm::server
