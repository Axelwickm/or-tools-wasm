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
#include <atomic>
#include <chrono>
#include <thread>
#include "javascript/mathopt_thread_budget.h"
#include "javascript/mathopt_mps_conversion.h"
#include "javascript/mathopt_result_validation.h"
#include "javascript/mathopt_result_conversion.h"

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

std::atomic<bool> g_mathopt_interrupt_requested = false;
class MathOptInterruptScope {
 public:
  explicit MathOptInterruptScope(bool enabled, bool initially_interrupted) {
    if (initially_interrupted) interrupter_.Interrupt();
    if (enabled) monitor_ = std::thread([this] {
      while (!finished_.load()) {
        if (g_mathopt_interrupt_requested.load()) interrupter_.Interrupt();
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    });
  }
  ~MathOptInterruptScope() {
    finished_.store(true);
    if (monitor_.joinable()) monitor_.join();
  }
  SolveInterrupter* get() { return &interrupter_; }
 private:
  SolveInterrupter interrupter_;
  std::atomic<bool> finished_ = false;
  std::thread monitor_;
};
int MathOptWorkerCapacity() {
  return EM_ASM_INT({ return PThread.unusedWorkers.length; });
}
absl::Status CheckMathOptWorkerCapacity(const SolveRequest& request, bool interrupted) {
  const int workers = ortools_wasm::MathOptThreadRequirement(request);
  if (workers < 1) return absl::InvalidArgumentError("MathOpt native thread count must be positive.");
  if (workers > MathOptWorkerCapacity() - (interrupted ? 1 : 0))
    return absl::InvalidArgumentError("MathOpt requests more threads than the WASM runtime capacity.");
  return absl::OkStatus();
}

absl::Status ConfigureMathOptCallbacks(const uint8_t* data, size_t length, int callback_id, Solver::SolveArgs* args) {
  if (callback_id == 0) return absl::OkStatus();
  if (!data || !args->callback_registration.ParseFromArray(data, static_cast<int>(length)))
    return absl::InvalidArgumentError("Invalid MathOpt callback registration.");
  args->user_cb = [callback_id](const operations_research::math_opt::CallbackDataProto& data) -> CallbackResultProto {
    const std::string bytes = data.SerializeAsString();
    auto* buffer = reinterpret_cast<uint8_t*>(MAIN_THREAD_EM_ASM_PTR({
      return Module.__mathoptCallbacks.get($0)(HEAPU8.slice($1, $1 + $2));
    }, callback_id, bytes.data(), bytes.size()));
    if (!buffer) { CallbackResultProto stopped; stopped.set_terminate(true); return stopped; }
    uint32_t length;
    std::memcpy(&length, buffer, sizeof(length));
    CallbackResultProto result;
    const bool parsed = result.ParseFromArray(buffer + sizeof(length), static_cast<int>(length));
    std::free(buffer);
    if (!parsed) result.set_terminate(true);
    return result;
  };
  return absl::OkStatus();
}

Solver::MessageCallback MathOptMessages(SolveResponse* response, int message_id) {
  return [response, message_id](const std::vector<std::string>& messages) {
    SolveResponse batch;
    for (const auto& message : messages) {
      response->add_messages(message);
      if (message_id != 0) batch.add_messages(message);
    }
    if (message_id == 0 || messages.empty()) return;
    const std::string bytes = batch.SerializeAsString();
    MAIN_THREAD_EM_ASM({
      Module.__mathoptMessages.get($0)(HEAPU8.slice($1, $1 + $2));
    }, message_id, bytes.data(), bytes.size());
  };
}

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
uint8_t* mathopt_solve_request_impl(const uint8_t* request_data, size_t request_len,
                               int use_interrupter,
                               int interrupt_at_start, size_t* out_len, const uint8_t* callback_data, size_t callback_len, int callback_id, int message_id) {
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
      message_callback = MathOptMessages(&response, message_id);
    }
    const auto capacity = CheckMathOptWorkerCapacity(request, use_interrupter != 0);
    if (!capacity.ok()) { SetStatus(&response, capacity); return CopyProtoToBuffer(response, out_len); }
    ortools_wasm::BindMathOptAutomaticWorkers(&request, ortools_wasm::MathOptThreadRequirement(request));
    MathOptInterruptScope interrupter(use_interrupter != 0, interrupt_at_start != 0);
    Solver::SolveArgs arguments{
         .parameters = request.parameters(),
         .model_parameters = request.model_parameters(),
         .message_callback = std::move(message_callback),
         .interrupter = use_interrupter != 0 ? interrupter.get() : nullptr};
    const auto callback_status = ConfigureMathOptCallbacks(callback_data, callback_len, callback_id, &arguments);
    if (!callback_status.ok()) { SetStatus(&response, callback_status); return CopyProtoToBuffer(response, out_len); }
    result = Solver::NonIncrementalSolve(request.model(), request.solver_type(), {.streamable = request.initializer()}, arguments);
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
uint8_t* mathopt_incremental_solve_impl(
    int handle, const uint8_t* request_data, size_t request_len,
    const uint8_t* update_data, size_t update_len, int use_update,
    int use_interrupter, int interrupt_at_start, size_t* out_len, const uint8_t* callback_data, size_t callback_len, int callback_id, int message_id) {
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
      message_callback = MathOptMessages(&response, message_id);
    }
    const auto capacity = CheckMathOptWorkerCapacity(request, use_interrupter != 0);
    if (!capacity.ok()) { SetStatus(&response, capacity); return CopyProtoToBuffer(response, out_len); }
    ortools_wasm::BindMathOptAutomaticWorkers(&request, ortools_wasm::MathOptThreadRequirement(request));
    MathOptInterruptScope interrupter(use_interrupter != 0, interrupt_at_start != 0);
    Solver::SolveArgs arguments{
         .parameters = request.parameters(),
         .model_parameters = request.model_parameters(),
         .message_callback = std::move(message_callback),
         .interrupter = use_interrupter != 0 ? interrupter.get() : nullptr};
    const auto callback_status = ConfigureMathOptCallbacks(callback_data, callback_len, callback_id, &arguments);
    if (!callback_status.ok()) { SetStatus(&response, callback_status); return CopyProtoToBuffer(response, out_len); }
    auto result = it->second.solver->Solve(arguments);
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

EMSCRIPTEN_KEEPALIVE uintptr_t mathopt_interrupt_address() {
  return reinterpret_cast<uintptr_t>(&g_mathopt_interrupt_requested);
}
EMSCRIPTEN_KEEPALIVE uint8_t* mathopt_solve_request(const uint8_t* request_data, size_t request_len, int use_interrupter, int interrupt_at_start, size_t* out_len, const uint8_t* callback_data, size_t callback_len, int callback_id, int message_id) {
  struct ResetInterrupt { ~ResetInterrupt() { g_mathopt_interrupt_requested.store(false); } } reset;
  try {
    return mathopt_solve_request_impl(request_data, request_len, use_interrupter, interrupt_at_start, out_len, callback_data, callback_len, callback_id, message_id);
  } catch (const std::exception& error) {
    SolveResponse response;
    SetStatus(&response, absl::InternalError(error.what()));
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    SolveResponse response;
    SetStatus(&response, absl::InternalError("MathOpt native solve threw an unknown exception."));
    return CopyProtoToBuffer(response, out_len);
  }
}
EMSCRIPTEN_KEEPALIVE uint8_t* mathopt_incremental_solve(int handle, const uint8_t* request_data, size_t request_len, const uint8_t* update_data, size_t update_len, int use_update, int use_interrupter, int interrupt_at_start, size_t* out_len, const uint8_t* callback_data, size_t callback_len, int callback_id, int message_id) {
  struct ResetInterrupt { ~ResetInterrupt() { g_mathopt_interrupt_requested.store(false); } } reset;
  try {
    return mathopt_incremental_solve_impl(handle, request_data, request_len, update_data, update_len, use_update, use_interrupter, interrupt_at_start, out_len, callback_data, callback_len, callback_id, message_id);
  } catch (const std::exception& error) {
    SolveResponse response;
    SetStatus(&response, absl::InternalError(error.what()));
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    SolveResponse response;
    SetStatus(&response, absl::InternalError("MathOpt native solve threw an unknown exception."));
    return CopyProtoToBuffer(response, out_len);
  }
}

EMSCRIPTEN_KEEPALIVE
const char* mathopt_incremental_update(int handle, const uint8_t* update_data, size_t update_len) {
  static std::string result;
  try {
    const auto found = IncrementalSolvers().find(handle);
    if (found == IncrementalSolvers().end()) {
      result = absl::FailedPreconditionError("MathOpt IncrementalSolver is closed.").ToString();
    } else {
      ModelUpdateProto update;
      if (!update.ParseFromArray(update_data, static_cast<int>(update_len))) {
        result = absl::InvalidArgumentError("Could not parse MathOpt ModelUpdateProto.").ToString();
      } else {
        const auto updated = found->second.solver->Update(std::move(update));
        result = updated.ok() ? (*updated ? "true" : "false") : updated.status().ToString();
      }
    }
  } catch (const std::exception& error) {
    result = absl::InternalError(error.what()).ToString();
  } catch (...) {
    result = absl::InternalError("MathOpt native update threw an unknown exception.").ToString();
  }
  return result.c_str();
}

EMSCRIPTEN_KEEPALIVE
void mathopt_incremental_delete(int handle) {
  IncrementalSolvers().erase(handle);
}

EMSCRIPTEN_KEEPALIVE const char* mathopt_validate_model(const uint8_t* input, int length) {
  static std::string error;
  if (length < 0 || (length && !input)) error = "Invalid MathOpt model buffer.";
  else error = ortools_wasm::ValidateMathOptModelBytes(length ? std::string(reinterpret_cast<const char*>(input), length) : std::string());
  return error.c_str();
}

static bool result_validation_failed = false;
EMSCRIPTEN_KEEPALIVE uint8_t* mathopt_validate_result(const uint8_t* request, int request_length,
    const uint8_t* result, int result_length, size_t* out_len) {
  result_validation_failed = false;
  if (!out_len) { result_validation_failed = true; return nullptr; }
  *out_len = 0;
  ortools_wasm::MathOptResultValidation validation;
  if (request_length < 0 || result_length < 0 || (request_length > 0 && !request) || (result_length > 0 && !result))
    validation.error = "Invalid MathOpt result validation buffer.";
  else {
    try {
      validation = ortools_wasm::ValidateMathOptResultBytes(
        request_length ? std::string(reinterpret_cast<const char*>(request), request_length) : std::string(),
        result_length ? std::string(reinterpret_cast<const char*>(result), result_length) : std::string());
    } catch (const std::exception& error) { validation.error = error.what(); }
  }
  result_validation_failed = !validation.error.empty();
  const auto& output = result_validation_failed ? validation.error : validation.result;
  auto* buffer = static_cast<uint8_t*>(std::malloc(output.size() + 1));
  if (!buffer) { result_validation_failed = true; return nullptr; }
  std::memcpy(buffer, output.data(), output.size()); *out_len = output.size();
  return buffer;
}
EMSCRIPTEN_KEEPALIVE uint8_t* mathopt_convert_result_proto(const uint8_t* model, int model_length,
    const uint8_t* input, int input_length, int kind, size_t* out_len) {
  result_validation_failed = false;
  if (!out_len) { result_validation_failed = true; return nullptr; }
  *out_len = 0;
  ortools_wasm::MathOptProtoConversion conversion;
  if (model_length < 0 || input_length < 0 || (model_length && !model) || (input_length && !input))
    conversion.error = "Invalid MathOpt result conversion buffer.";
  else {
    try {
      conversion = ortools_wasm::ConvertMathOptResultProto(kind,
          model_length ? std::string(reinterpret_cast<const char*>(model), model_length) : std::string(),
          input_length ? std::string(reinterpret_cast<const char*>(input), input_length) : std::string());
    } catch (const std::exception& error) { conversion.error = error.what(); }
  }
  result_validation_failed = !conversion.error.empty();
  const auto& output = result_validation_failed ? conversion.error : conversion.result;
  auto* buffer = static_cast<uint8_t*>(std::malloc(output.size() + 1));
  if (!buffer) { result_validation_failed = true; return nullptr; }
  std::memcpy(buffer, output.data(), output.size()); *out_len = output.size();
  return buffer;
}
EMSCRIPTEN_KEEPALIVE int mathopt_result_validation_failed() { return result_validation_failed ? 1 : 0; }

static bool mps_conversion_failed = false;
EMSCRIPTEN_KEEPALIVE uint8_t* mathopt_mps_convert(const uint8_t* input, int length,
                                                 int to_mps, size_t* out_len) {
  mps_conversion_failed = false;
  if (out_len == nullptr) { mps_conversion_failed = true; return nullptr; }
  *out_len = 0;
  ortools_wasm::MathOptMpsConversionResult result;
  if (length < 0 || (length > 0 && input == nullptr)) result.error = "Invalid MathOpt MPS conversion buffer.";
  else {
    const std::string bytes = length == 0 ? std::string() : std::string(reinterpret_cast<const char*>(input), length);
    try { result = ortools_wasm::ConvertMathOptMps(bytes, to_mps != 0); }
    catch (const std::exception& error) { result.error = error.what(); }
  }
  mps_conversion_failed = !result.error.empty();
  const std::string& output = mps_conversion_failed ? result.error : result.output;
  auto* buffer = static_cast<uint8_t*>(std::malloc(output.size() + 1));
  if (buffer == nullptr) { mps_conversion_failed = true; return nullptr; }
  std::memcpy(buffer, output.data(), output.size()); *out_len = output.size();
  return buffer;
}
EMSCRIPTEN_KEEPALIVE int mathopt_mps_conversion_failed() { return mps_conversion_failed ? 1 : 0; }

}  // extern "C"
