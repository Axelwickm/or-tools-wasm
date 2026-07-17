#include "server/src/cp_sat_executor.h"

#include <string>
#include <utility>

#include "cp_sat.pb.h"
#include "generated_proto_schemas.h"
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/cp_model_checker.h"
#include "ortools/sat/cp_model_solver.h"
#include "ortools/sat/sat_parameters.pb.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
namespace sat = ::operations_research::sat;

SolverExecutorResult Error(std::string message) {
  return SolverExecutorResult{false, {}, std::move(message)};
}

SolverExecutorResult Response(const bridge::CpSatBridgeResponse& response) {
  std::string bytes;
  if (!response.SerializeToString(&bytes)) {
    return Error("Failed to serialize CP-SAT bridge response.");
  }
  return SolverExecutorResult{true, std::move(bytes), {}};
}

SolverExecutorResult Solve(uint32_t request_id,
                           const bridge::CpSatSolveRequest& request,
                           const JobContext& context) {
  sat::CpModelProto model_proto;
  if (!model_proto.ParseFromString(request.cp_model_proto())) {
    return Error("Failed to parse CpModelProto.");
  }

  sat::SatParameters parameters;
  if (!request.sat_parameters_proto().empty() &&
      !parameters.ParseFromString(request.sat_parameters_proto())) {
    return Error("Failed to parse SatParameters.");
  }
  parameters.set_num_workers(context.allocated_threads());

  sat::Model model;
  model.Add(sat::NewSatParameters(parameters));
  if (context.cancellation_requested()) {
    return Error("CP-SAT solve was cancelled before it started.");
  }

  sat::CpSolverResponse solver_response = sat::SolveCpModel(model_proto, &model);
  bridge::CpSatBridgeResponse response;
  response.set_request_id(request_id);
  response.mutable_solve_result()->set_cp_solver_response_proto(
      solver_response.SerializeAsString());
  return Response(response);
}

SolverExecutorResult Validate(uint32_t request_id,
                              const bridge::CpSatValidateRequest& request) {
  sat::CpModelProto model_proto;
  if (!model_proto.ParseFromString(request.cp_model_proto())) {
    return Error("Failed to parse CpModelProto.");
  }

  bridge::CpSatBridgeResponse response;
  response.set_request_id(request_id);
  const std::string message = sat::ValidateCpModel(model_proto);
  auto* result = response.mutable_validate_result();
  result->set_ok(message.empty());
  result->set_message(message);
  return Response(response);
}

SolverExecutorResult Schema(uint32_t request_id) {
  bridge::CpSatBridgeResponse response;
  response.set_request_id(request_id);
  auto* result = response.mutable_schema_result();
  result->set_cp_model_proto_schema(sat::wasm::kCpModelProtoSchema);
  result->set_sat_parameters_proto_schema(sat::wasm::kSatParametersProtoSchema);
  return Response(response);
}

}  // namespace

std::string CpSatExecutor::solver() const { return "cp-sat"; }

SolverExecutorResult CpSatExecutor::Execute(const SolverExecutorRequest& request,
                                            const JobContext& context) {
  bridge::CpSatBridgeRequest cp_sat_request;
  if (!cp_sat_request.ParseFromString(request.payload)) {
    return Error("Failed to parse CP-SAT bridge request.");
  }

  switch (cp_sat_request.payload_case()) {
    case bridge::CpSatBridgeRequest::kSolve:
      return Solve(cp_sat_request.request_id(), cp_sat_request.solve(), context);
    case bridge::CpSatBridgeRequest::kValidate:
      return Validate(cp_sat_request.request_id(), cp_sat_request.validate());
    case bridge::CpSatBridgeRequest::kSchema:
      return Schema(cp_sat_request.request_id());
    default:
      return Error("Unsupported CP-SAT server request payload.");
  }
}

}  // namespace ortools_wasm::server
