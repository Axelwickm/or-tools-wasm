// Minimal C API surface for MathOpt over WASM.
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>

#include <emscripten/emscripten.h>

#include "absl/status/status.h"
#include "ortools/math_opt/core/solver.h"
#include "ortools/math_opt/core/solver_interface.h"
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/solvers/cp_sat_solver.h"
#include "ortools/math_opt/solvers/glop_solver.h"

namespace {

using operations_research::math_opt::CallbackRegistrationProto;
using operations_research::math_opt::CallbackResultProto;
using operations_research::math_opt::AllSolversRegistry;
using operations_research::math_opt::CpSatSolver;
using operations_research::math_opt::GlopSolver;
using operations_research::math_opt::SolveRequest;
using operations_research::math_opt::SolveResponse;
using operations_research::math_opt::Solver;
using operations_research::math_opt::SOLVER_TYPE_CP_SAT;
using operations_research::math_opt::SOLVER_TYPE_GLOP;

uint8_t* CopyProtoToBuffer(const google::protobuf::MessageLite& message,
                           size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  std::string data;
  if (!message.SerializeToString(&data)) {
    *out_len = 0;
    return nullptr;
  }
  auto* buffer = static_cast<uint8_t*>(std::malloc(data.size()));
  if (buffer == nullptr) {
    *out_len = 0;
    return nullptr;
  }
  std::memcpy(buffer, data.data(), data.size());
  *out_len = data.size();
  return buffer;
}

void SetStatus(SolveResponse* response, const absl::Status& status) {
  auto* proto_status = response->mutable_status();
  proto_status->set_code(static_cast<int>(status.code()));
  proto_status->set_message(std::string(status.message()));
}

void EnsureMathOptSolversRegistered() {
  auto* const registry = AllSolversRegistry::Instance();
  if (!registry->IsRegistered(SOLVER_TYPE_GLOP)) {
    registry->Register(SOLVER_TYPE_GLOP, GlopSolver::New);
  }
  if (!registry->IsRegistered(SOLVER_TYPE_CP_SAT)) {
    registry->Register(SOLVER_TYPE_CP_SAT, CpSatSolver::New);
  }
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
uint8_t* mathopt_solve_request(const uint8_t* request_data, size_t request_len,
                               size_t* out_len) {
  SolveResponse response;
  if (request_data == nullptr || out_len == nullptr) {
    if (out_len != nullptr) *out_len = 0;
    return nullptr;
  }

  response.clear_status();
  SolveRequest request;
  if (!request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    SetStatus(&response, absl::InvalidArgumentError(
                             "Could not parse MathOpt SolveRequest."));
    return CopyProtoToBuffer(response, out_len);
  }

  EnsureMathOptSolversRegistered();
  auto result = Solver::NonIncrementalSolve(
      request.model(), request.solver_type(),
      {.streamable = request.initializer()},
      {.parameters = request.parameters(),
       .model_parameters = request.model_parameters(),
       .message_callback = nullptr,
       .callback_registration = CallbackRegistrationProto(),
       .user_cb =
           [](const operations_research::math_opt::CallbackDataProto&) {
             return CallbackResultProto();
           },
       .interrupter = nullptr});

  if (!result.ok()) {
    SetStatus(&response, result.status());
  } else {
    *response.mutable_result() = std::move(*result);
  }
  return CopyProtoToBuffer(response, out_len);
}

}  // extern "C"
