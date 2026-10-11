#include "server/src/mathopt_executor.h"
#include "javascript/mathopt_thread_budget.h"
#include "javascript/mathopt_mps_conversion.h"
#include "javascript/mathopt_result_validation.h"
#include "javascript/mathopt_result_conversion.h"

#include <exception>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "absl/status/status.h"
#include "mathopt.pb.h"
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
  std::lock_guard lock(sessions_mutex_);
  const auto it = sessions_.find(handle);
  return it == sessions_.end() ? nullptr : it->second;
}

std::string MathOptExecutor::solver() const { return "mathopt"; }

int MathOptExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                      int client_requested_threads,
                                      int server_total_threads) const {
  bridge::MathOptBridgeRequest outer;
  if (!outer.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse MathOpt bridge request.");
  const std::string* solve_bytes = nullptr;
  if (outer.payload_case() == bridge::MathOptBridgeRequest::kSolve) solve_bytes = &outer.solve().solve_request_proto();
  if (outer.payload_case() == bridge::MathOptBridgeRequest::kIncrementalSolve) solve_bytes = &outer.incremental_solve().solve_request_proto();
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
  EnsureSolversRegistered();
  math_opt::SolveResponse response;
  try {
    switch (outer.payload_case()) {
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
          uint64_t handle;
          {
            std::lock_guard lock(sessions_mutex_);
            // Exact JavaScript-number IDs; stale handles must not alias after restart.
            do { handle = absl::Uniform<uint64_t>(random_, 1, uint64_t{1} << 53); } while (sessions_.count(handle));
            sessions_.emplace(handle, std::move(session));
          }
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
        if (operation.has_model_update_proto()) {
          math_opt::ModelUpdateProto update;
          if (!update.ParseFromString(operation.model_update_proto())) {
            SetStatus(&response, absl::InvalidArgumentError("Could not parse MathOpt ModelUpdateProto."));
            return OuterResponse(response);
          }
          auto updated = session->solver->Update(std::move(update));
          if (!updated.ok()) { SetStatus(&response, updated.status()); return OuterResponse(response); }
          if (!*updated) {
            math_opt::Solver::InitArgs init_args;
            init_args.streamable = parsed.initializer();
            auto replacement =
                math_opt::Solver::New(parsed.solver_type(), parsed.model(), init_args);
            if (!replacement.ok()) { SetStatus(&response, replacement.status()); return OuterResponse(response); }
            session->solver = std::move(*replacement);
          }
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
        std::lock_guard lock(sessions_mutex_);
        sessions_.erase(outer.incremental_delete().handle());
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
