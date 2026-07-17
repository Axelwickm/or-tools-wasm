#include "server/src/cp_sat_executor.h"

#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>

#include "cp_sat.pb.h"
#include "generated_proto_schemas.h"
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/cp_model_checker.h"
#include "ortools/sat/cp_model_solver.h"
#include "ortools/sat/sat_parameters.pb.h"
#include "ortools/util/logging.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
namespace sat = ::operations_research::sat;

constexpr int kSolutionCallbackFlag = 1 << 0;
constexpr int kBestBoundCallbackFlag = 1 << 1;
constexpr int kLogCallbackFlag = 1 << 2;

SolverExecutorResult Error(
    std::string message,
    SolverExecutionFailureKind kind = SolverExecutionFailureKind::kInvalidRequest) {
  SolverExecutorResult result;
  result.ok = false;
  result.error_message = std::move(message);
  result.failure_kind = kind;
  return result;
}

SolverExecutorResult Response(const bridge::CpSatBridgeResponse& response) {
  std::string bytes;
  if (!response.SerializeToString(&bytes)) {
    return Error("Failed to serialize CP-SAT bridge response.");
  }
  return SolverExecutorResult{true, std::move(bytes), {}};
}

bool Serialize(const bridge::CpSatBridgeResponse& response, std::string* bytes) {
  return response.SerializeToString(bytes);
}

int CallbackFlags(const bridge::CpSatCallbackMask& mask) {
  int flags = 0;
  if (mask.solution()) flags |= kSolutionCallbackFlag;
  if (mask.best_bound()) flags |= kBestBoundCallbackFlag;
  if (mask.log()) flags |= kLogCallbackFlag;
  return flags;
}

class CpSatEventEmitter {
 public:
  explicit CpSatEventEmitter(SolverEventSink emit_event)
      : emit_event_(std::move(emit_event)) {}

  void EmitSolution(const sat::CpSolverResponse& solver_response) {
    std::string payload;
    if (!solver_response.SerializeToString(&payload)) return;
    bridge::CpSatBridgeResponse response;
    response.mutable_solve_event()->set_solution_proto(std::move(payload));
    Emit(response);
  }

  void EmitBestBound(double bound) {
    bridge::CpSatBridgeResponse response;
    response.mutable_solve_event()->set_best_bound(bound);
    Emit(response);
  }

  void EmitLog(std::string message) {
    bridge::CpSatBridgeResponse response;
    response.mutable_solve_event()->set_log(std::move(message));
    Emit(response);
  }

 private:
  void Emit(const bridge::CpSatBridgeResponse& response) {
    std::string bytes;
    if (Serialize(response, &bytes)) emit_event_(std::move(bytes));
  }

  SolverEventSink emit_event_;
};

SolverExecutorResult Solve(const bridge::CpSatSolveRequest& request,
                           const JobContext& context,
                           const SolverEventSink& emit_event) {
  sat::CpModelProto model_proto;
  if (!model_proto.ParseFromString(request.cp_model_proto())) {
    return Error("Failed to parse CpModelProto.");
  }

  sat::SatParameters parameters;
  if (!request.sat_parameters_proto().empty() &&
      !parameters.ParseFromString(request.sat_parameters_proto())) {
    return Error("Failed to parse SatParameters.");
  }
  const int callback_flags = CallbackFlags(request.callback_mask());

  sat::Model model;
  model.Add(sat::NewSatParameters(parameters));
  auto cancellation =
      context.OnCancellation([&model] { sat::StopSearch(&model); });
  if (context.cancellation_requested()) {
    return Error("CP-SAT solve was cancelled before it started.",
                 SolverExecutionFailureKind::kCancelled);
  }

  CpSatEventEmitter events(emit_event);
  if ((callback_flags & kSolutionCallbackFlag) != 0) {
    model.Add(sat::NewFeasibleSolutionObserver(
        [&events](const sat::CpSolverResponse& response) {
          events.EmitSolution(response);
        }));
  }
  if ((callback_flags & kBestBoundCallbackFlag) != 0) {
    model.Add(sat::NewBestBoundCallback(
        [&events](double bound) { events.EmitBestBound(bound); }));
  }
  if ((callback_flags & kLogCallbackFlag) != 0) {
    model.GetOrCreate<operations_research::SolverLogger>()
        ->AddInfoLoggingCallback(
            [&events](const std::string& message) { events.EmitLog(message); });
  }

  sat::CpSolverResponse solver_response = sat::SolveCpModel(model_proto, &model);

  bridge::CpSatBridgeResponse response;
  response.mutable_solve_result()->set_cp_solver_response_proto(
      solver_response.SerializeAsString());
  return Response(response);
}

SolverExecutorResult Validate(const bridge::CpSatValidateRequest& request) {
  sat::CpModelProto model_proto;
  if (!model_proto.ParseFromString(request.cp_model_proto())) {
    return Error("Failed to parse CpModelProto.");
  }

  bridge::CpSatBridgeResponse response;
  const std::string message = sat::ValidateCpModel(model_proto);
  auto* result = response.mutable_validate_result();
  result->set_ok(message.empty());
  result->set_message(message);
  return Response(response);
}

SolverExecutorResult Schema() {
  bridge::CpSatBridgeResponse response;
  auto* result = response.mutable_schema_result();
  result->set_cp_model_proto_schema(sat::wasm::kCpModelProtoSchema);
  result->set_sat_parameters_proto_schema(sat::wasm::kSatParametersProtoSchema);
  return Response(response);
}

}  // namespace

std::string CpSatExecutor::solver() const { return "cp-sat"; }

int CpSatExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                   int client_requested_threads,
                                   int server_total_threads) const {
  bridge::CpSatBridgeRequest cp_sat_request;
  if (!cp_sat_request.ParseFromString(request.payload)) {
    throw std::invalid_argument("Failed to parse CP-SAT bridge request.");
  }
  if (cp_sat_request.payload_case() != bridge::CpSatBridgeRequest::kSolve) return 1;

  sat::SatParameters parameters;
  if (!cp_sat_request.solve().sat_parameters_proto().empty() &&
      !parameters.ParseFromString(cp_sat_request.solve().sat_parameters_proto())) {
    throw std::invalid_argument("Failed to parse SatParameters.");
  }
  const int solver_threads = parameters.num_workers();
  if (client_requested_threads > 0 && solver_threads <= 0) {
    throw std::invalid_argument(
        "A finite thread request cannot be paired with CP-SAT automatic workers.");
  }
  if (client_requested_threads > 0 && solver_threads > 0 &&
      client_requested_threads != solver_threads) {
    throw std::invalid_argument(
        "CP-SAT worker count does not match the requested job threads.");
  }
  const int requested_threads = solver_threads > 0 ? solver_threads : server_total_threads;
  if (requested_threads > server_total_threads) {
    throw std::invalid_argument("CP-SAT requests more threads than the server capacity.");
  }
  return requested_threads;
}

SolverExecutorResult CpSatExecutor::Execute(const SolverExecutorRequest& request,
                                            const JobContext& context,
                                            const SolverEventSink& emit_event) {
  bridge::CpSatBridgeRequest cp_sat_request;
  if (!cp_sat_request.ParseFromString(request.payload)) {
    return Error("Failed to parse CP-SAT bridge request.");
  }

  switch (cp_sat_request.payload_case()) {
    case bridge::CpSatBridgeRequest::kSolve:
      return Solve(cp_sat_request.solve(), context, emit_event);
    case bridge::CpSatBridgeRequest::kValidate:
      return Validate(cp_sat_request.validate());
    case bridge::CpSatBridgeRequest::kSchema:
      return Schema();
    default:
      return Error("Unsupported CP-SAT server request payload.");
  }
}

}  // namespace ortools_wasm::server
