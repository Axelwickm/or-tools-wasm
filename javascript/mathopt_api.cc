// Minimal C API surface for MathOpt over WASM.
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <memory>
#include <utility>
#include <unordered_map>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "absl/status/status.h"
#include "ortools/math_opt/core/solver.h"
#include "ortools/math_opt/core/solver_interface.h"
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/solvers/cp_sat_solver.h"
#include "ortools/math_opt/solvers/glop_solver.h"
#include "ortools/math_opt/solvers/pdlp_solver.h"
#include "ortools/util/solve_interrupter.h"
#ifdef USE_SCIP
#include "ortools/math_opt/solvers/gscip_solver.h"
#endif

namespace {

using operations_research::math_opt::CallbackRegistrationProto;
using operations_research::math_opt::CallbackResultProto;
using operations_research::math_opt::AllSolversRegistry;
using operations_research::math_opt::CpSatSolver;
#ifdef USE_SCIP
using operations_research::math_opt::GScipSolver;
#endif
using operations_research::math_opt::GlopSolver;
using operations_research::math_opt::PdlpSolver;
using operations_research::math_opt::SolveRequest;
using operations_research::math_opt::SolveResponse;
using operations_research::math_opt::SolveResultProto;
using operations_research::math_opt::Solver;
using operations_research::math_opt::ModelUpdateProto;
using operations_research::math_opt::SOLVER_TYPE_CP_SAT;
#ifdef USE_SCIP
using operations_research::math_opt::SOLVER_TYPE_GSCIP;
#endif
using operations_research::math_opt::SOLVER_TYPE_GLOP;
using operations_research::math_opt::SOLVER_TYPE_PDLP;
using operations_research::SolveInterrupter;

struct IncrementalSolverState {
  std::unique_ptr<Solver> solver;
  operations_research::math_opt::SolverTypeProto solver_type;
  operations_research::math_opt::Solver::InitArgs init_args;
};

std::unordered_map<int, IncrementalSolverState>& IncrementalSolvers() {
  static auto* solvers = new std::unordered_map<int, IncrementalSolverState>();
  return *solvers;
}

int NextIncrementalSolverHandle() {
  static int next_handle = 1;
  return next_handle++;
}

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
  if (!registry->IsRegistered(SOLVER_TYPE_PDLP)) {
    registry->Register(SOLVER_TYPE_PDLP, PdlpSolver::New);
  }
#ifdef USE_SCIP
  if (!registry->IsRegistered(SOLVER_TYPE_GSCIP)) {
    registry->Register(SOLVER_TYPE_GSCIP, GScipSolver::New);
  }
#endif
}

}  // namespace

extern "C" {

#ifndef ORTOOLS_WASM_NO_LOCAL_FREE_BUFFER
EMSCRIPTEN_KEEPALIVE void free_buffer(uint8_t* ptr) { std::free(ptr); }
#endif

EMSCRIPTEN_KEEPALIVE
uint8_t* mathopt_solve_request(const uint8_t* request_data, size_t request_len,
                               int use_interrupter,
                               int interrupt_at_start, size_t* out_len) {
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
  absl::StatusOr<SolveResultProto> result;
  try {
    Solver::MessageCallback message_callback = nullptr;
    if (request.parameters().enable_output()) {
      message_callback = [&response](const std::vector<std::string>& messages) {
        for (const std::string& message : messages) {
          response.add_messages(message);
        }
      };
    }
    SolveInterrupter interrupter;
    if (interrupt_at_start != 0) {
      interrupter.Interrupt();
    }
    result = Solver::NonIncrementalSolve(
        request.model(), request.solver_type(),
        {.streamable = request.initializer()},
        {.parameters = request.parameters(),
         .model_parameters = request.model_parameters(),
         .message_callback = std::move(message_callback),
         .callback_registration = CallbackRegistrationProto(),
         .user_cb =
             [](const operations_research::math_opt::CallbackDataProto&) {
               return CallbackResultProto();
             },
         .interrupter = use_interrupter != 0 ? &interrupter : nullptr});
  } catch (const std::exception& e) {
    SetStatus(&response, absl::InternalError(e.what()));
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    SetStatus(&response, absl::InternalError("MathOpt solve threw an unknown exception."));
    return CopyProtoToBuffer(response, out_len);
  }

  if (!result.ok()) {
    SetStatus(&response, result.status());
  } else {
    *response.mutable_result() = std::move(*result);
  }
  return CopyProtoToBuffer(response, out_len);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* mathopt_incremental_create(const uint8_t* request_data,
                                    size_t request_len, size_t* out_len) {
  SolveResponse response;
  if (request_data == nullptr || out_len == nullptr) {
    if (out_len != nullptr) *out_len = 0;
    return nullptr;
  }

  SolveRequest request;
  if (!request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    SetStatus(&response, absl::InvalidArgumentError(
                             "Could not parse MathOpt SolveRequest."));
  } else {
    EnsureMathOptSolversRegistered();
    try {
      auto solver = Solver::New(request.solver_type(), request.model(),
                                {.streamable = request.initializer()});
      if (!solver.ok()) {
        SetStatus(&response, solver.status());
      } else {
        const int handle = NextIncrementalSolverHandle();
        IncrementalSolvers().emplace(
            handle, IncrementalSolverState{std::move(*solver),
                                           request.solver_type(),
                                           {.streamable = request.initializer()}});
        response.add_messages(std::to_string(handle));
      }
    } catch (const std::exception& e) {
      SetStatus(&response, absl::InternalError(e.what()));
    } catch (...) {
      SetStatus(&response, absl::InternalError(
                               "MathOpt incremental solver creation threw an "
                               "unknown exception."));
    }
  }
  return CopyProtoToBuffer(response, out_len);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* mathopt_incremental_solve(
    int handle, const uint8_t* request_data, size_t request_len,
    const uint8_t* update_data, size_t update_len, int use_update,
    int use_interrupter, int interrupt_at_start, size_t* out_len) {
  SolveResponse response;
  if (request_data == nullptr || out_len == nullptr) {
    if (out_len != nullptr) *out_len = 0;
    return nullptr;
  }
  auto it = IncrementalSolvers().find(handle);
  if (it == IncrementalSolvers().end()) {
    SetStatus(&response, absl::FailedPreconditionError(
                             "MathOpt IncrementalSolver is closed."));
    return CopyProtoToBuffer(response, out_len);
  }

  SolveRequest request;
  if (!request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    SetStatus(&response, absl::InvalidArgumentError(
                             "Could not parse MathOpt SolveRequest."));
    return CopyProtoToBuffer(response, out_len);
  }

  EnsureMathOptSolversRegistered();
  try {
    if (use_update != 0) {
      ModelUpdateProto update;
      if (!update.ParseFromArray(update_data, static_cast<int>(update_len))) {
        SetStatus(&response, absl::InvalidArgumentError(
                               "Could not parse MathOpt ModelUpdateProto."));
        return CopyProtoToBuffer(response, out_len);
      }
      auto updated = it->second.solver->Update(std::move(update));
      if (!updated.ok()) {
        SetStatus(&response, updated.status());
        return CopyProtoToBuffer(response, out_len);
      }
      if (!*updated) {
        auto replacement = Solver::New(request.solver_type(), request.model(),
                                       {.streamable = request.initializer()});
        if (!replacement.ok()) {
          SetStatus(&response, replacement.status());
          return CopyProtoToBuffer(response, out_len);
        }
        it->second.solver = std::move(*replacement);
      }
    }

    Solver::MessageCallback message_callback = nullptr;
    if (request.parameters().enable_output()) {
      message_callback = [&response](const std::vector<std::string>& messages) {
        for (const std::string& message : messages) {
          response.add_messages(message);
        }
      };
    }
    SolveInterrupter interrupter;
    if (interrupt_at_start != 0) {
      interrupter.Interrupt();
    }
    auto result = it->second.solver->Solve(
        {.parameters = request.parameters(),
         .model_parameters = request.model_parameters(),
         .message_callback = std::move(message_callback),
         .callback_registration = CallbackRegistrationProto(),
         .user_cb =
             [](const operations_research::math_opt::CallbackDataProto&) {
               return CallbackResultProto();
             },
         .interrupter = use_interrupter != 0 ? &interrupter : nullptr});
    if (!result.ok()) {
      SetStatus(&response, result.status());
    } else {
      *response.mutable_result() = std::move(*result);
    }
  } catch (const std::exception& e) {
    SetStatus(&response, absl::InternalError(e.what()));
  } catch (...) {
    SetStatus(&response, absl::InternalError(
                             "MathOpt incremental solve threw an unknown "
                             "exception."));
  }
  return CopyProtoToBuffer(response, out_len);
}

EMSCRIPTEN_KEEPALIVE
void mathopt_incremental_delete(int handle) {
  IncrementalSolvers().erase(handle);
}

}  // extern "C"
