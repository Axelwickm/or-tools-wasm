#include "server/src/mathopt_executor.h"

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
                                           const SolveInterrupter* interrupter) {
  math_opt::Solver::MessageCallback messages = nullptr;
  if (request.parameters().enable_output()) {
    messages = [response](const std::vector<std::string>& values) {
      for (const auto& value : values) response->add_messages(value);
    };
  }
  math_opt::Solver::SolveArgs arguments;
  arguments.parameters = request.parameters();
  arguments.model_parameters = request.model_parameters();
  arguments.message_callback = std::move(messages);
  arguments.callback_registration = math_opt::CallbackRegistrationProto();
  arguments.user_cb = [](const math_opt::CallbackDataProto&) {
    return math_opt::CallbackResultProto();
  };
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
    if (parsed.parameters().has_threads()) requested = parsed.parameters().threads();
  }
  if (client_requested_threads > 0 && client_requested_threads != requested) throw std::invalid_argument("MathOpt thread counts do not match.");
  if (requested < 1 || requested > server_total_threads) throw std::invalid_argument("MathOpt thread count is outside server capacity.");
  return requested;
}

SolverExecutorResult MathOptExecutor::Execute(const SolverExecutorRequest& request,
                                              const JobContext& context,
                                              const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::MathOptBridgeRequest outer;
  if (!outer.ParseFromString(request.payload)) return Error("Failed to parse MathOpt bridge request.");
  EnsureSolversRegistered();
  math_opt::SolveResponse response;
  try {
    switch (outer.payload_case()) {
      case bridge::MathOptBridgeRequest::kSolve: {
        math_opt::SolveRequest parsed;
        if (!ParseSolveRequest(outer.solve().solve_request_proto(), &parsed, &response)) return OuterResponse(response);
        SolveInterrupter interrupter;
        if (outer.solve().interrupt_at_start() || context.cancellation_requested()) interrupter.Interrupt();
        auto cancellation = context.OnCancellation([&interrupter] { interrupter.Interrupt(); });
        math_opt::Solver::InitArgs init_args;
        init_args.streamable = parsed.initializer();
        auto result = math_opt::Solver::NonIncrementalSolve(
            parsed.model(), parsed.solver_type(), init_args,
            SolveArguments(parsed, &response, &interrupter));
        if (!result.ok()) SetStatus(&response, result.status());
        else *response.mutable_result() = std::move(*result);
        return OuterResponse(response);
      }
      case bridge::MathOptBridgeRequest::kIncrementalCreate: {
        math_opt::SolveRequest parsed;
        if (!ParseSolveRequest(outer.incremental_create().solve_request_proto(), &parsed, &response)) return OuterResponse(response);
        math_opt::Solver::InitArgs init_args;
        init_args.streamable = parsed.initializer();
        auto solver = math_opt::Solver::New(parsed.solver_type(), parsed.model(), init_args);
        if (!solver.ok()) SetStatus(&response, solver.status());
        else {
          const uint64_t handle = next_handle_.fetch_add(1);
          auto session = std::make_shared<Session>();
          session->solver = std::move(*solver);
          session->solver_type = parsed.solver_type();
          session->init_args = init_args;
          { std::lock_guard lock(sessions_mutex_); sessions_.emplace(handle, std::move(session)); }
          response.add_messages(std::to_string(handle));
        }
        return OuterResponse(response);
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
        SolveInterrupter interrupter;
        if (operation.interrupt_at_start() || context.cancellation_requested()) interrupter.Interrupt();
        auto cancellation = context.OnCancellation([&interrupter] { interrupter.Interrupt(); });
        auto result = session->solver->Solve(SolveArguments(parsed, &response, &interrupter));
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
