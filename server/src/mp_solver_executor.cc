#include "server/src/mp_solver_executor.h"

#include <stdexcept>
#include <string>
#include <utility>

#include "absl/time/time.h"
#include "generated_proto_schemas.h"
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

SolverExecutorResult Solve(const bridge::MpSolverSolveRequest& solve_request,
                           const JobContext& context) {
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

  bool rejected = false;
  MPSolver solver(request.model().name(), problem_type);
  if (request.enable_internal_solver_output()) solver.EnableOutput();
  if (solve_request.num_threads() > 1) {
    const auto status = solver.SetNumThreads(solve_request.num_threads());
    if (!status.ok()) {
      solution.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
      solution.set_status_str(std::string(status.message()));
      rejected = true;
    }
  }
  if (!rejected) {
    std::string error;
    const auto load_status = solver.LoadModelFromProto(request.model(), &error);
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
    auto cancellation = context.OnCancellation([&solver] { solver.InterruptSolve(); });
    if (context.cancellation_requested()) return Error("MP Solver solve was cancelled before it started.", SolverExecutionFailureKind::kCancelled);
    solver.Solve();
    solver.FillSolutionResponseProto(&solution);
  }

  bridge::MpSolverBridgeResponse response;
  response.set_response_proto(solution.SerializeAsString());
  return Response(response);
}

}  // namespace

std::string MpSolverExecutor::solver() const { return "mp-solver"; }

int MpSolverExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                       int client_requested_threads,
                                       int server_total_threads) const {
  bridge::MpSolverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse MP Solver bridge request.");
  if (parsed.payload_case() != bridge::MpSolverBridgeRequest::kSolve) return 1;
  const int payload_threads = parsed.solve().num_threads() > 0 ? parsed.solve().num_threads() : 1;
  if (client_requested_threads > 0 && client_requested_threads != payload_threads) throw std::invalid_argument("MP Solver thread counts do not match.");
  if (payload_threads > server_total_threads) throw std::invalid_argument("MP Solver requests more threads than server capacity.");
  return payload_threads;
}

SolverExecutorResult MpSolverExecutor::Execute(const SolverExecutorRequest& request,
                                               const JobContext& context,
                                               const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::MpSolverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse MP Solver bridge request.");
  switch (parsed.payload_case()) {
    case bridge::MpSolverBridgeRequest::kSolve:
      return Solve(parsed.solve(), context);
    case bridge::MpSolverBridgeRequest::kSchema: {
      bridge::MpSolverBridgeResponse response;
      auto* schema = response.mutable_schema();
      schema->set_linear_solver_proto_schema(operations_research::sat::wasm::kLinearSolverProtoSchema);
      schema->set_optional_boolean_proto_schema(operations_research::sat::wasm::kOptionalBooleanProtoSchema);
      return Response(response);
    }
    case bridge::MpSolverBridgeRequest::PAYLOAD_NOT_SET:
      return Error("MP Solver request has no operation.");
  }
  return Error("Unknown MP Solver operation.");
}

}  // namespace ortools_wasm::server
