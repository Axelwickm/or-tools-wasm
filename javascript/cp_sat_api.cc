#include "javascript/cp_sat_statistics.h"
#include "javascript/cp_sat_model_export.h"
#include "javascript/cp_sat_solution_check.h"
// Minimal C API surface for CP-SAT over WASM.
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <thread>
#include <string>
#include <string_view>

#include <emscripten/em_asm.h>
#include <emscripten/emscripten.h>

#include "ortools/sat/cp_model.h"
#include "ortools/sat/cp_model_checker.h"
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/model.h"
#include "ortools/util/logging.h"
#include "ortools/util/time_limit.h"


namespace {

using operations_research::sat::CpModelProto;
using operations_research::sat::CpSolverResponse;
using operations_research::sat::Model;
using operations_research::sat::NewBestBoundCallback;
using operations_research::sat::NewFeasibleSolutionObserver;
using operations_research::sat::NewSatParameters;
using operations_research::sat::SatParameters;
using operations_research::sat::SolveCpModel;

constexpr int kSolutionCallbackFlag = 1 << 0;
constexpr int kBestBoundCallbackFlag = 1 << 1;
constexpr int kLogCallbackFlag = 1 << 2;

std::atomic<bool> interrupt_requested = false;

class ResetInterruptOnExit {
 public:
  ~ResetInterruptOnExit() { interrupt_requested.store(false); }
};

void RegisterInterrupt(Model* model) {
  model->GetOrCreate<operations_research::TimeLimit>()
      ->RegisterExternalBooleanAsLimit(&interrupt_requested);
}

enum class CallbackEventType : uint8_t {
  kSolution = 1,
  kBestBound = 2,
  kLog = 3,
};

#ifndef ORTOOLS_WASM_ALLOWED_ORIGINS
#define ORTOOLS_WASM_ALLOWED_ORIGINS ""
#endif

EM_JS(char*, GetHostCString, (), {
  var host = "";
  if (typeof location !== 'undefined' && location.hostname) {
    host = location.hostname;
  }
  var len = lengthBytesUTF8(host) + 1;
  var ptr = _malloc(len);
  stringToUTF8(host, ptr, len);
  return ptr;
});

std::string TrimAscii(std::string_view value) {
  const size_t start = value.find_first_not_of(" \t\r\n");
  if (start == std::string_view::npos) return std::string();
  const size_t end = value.find_last_not_of(" \t\r\n");
  return std::string(value.substr(start, end - start + 1));
}

std::string ToLowerAscii(std::string value) {
  for (char& ch : value) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return value;
}

std::string NormalizeHost(std::string_view value) {
  std::string trimmed = TrimAscii(value);
  if (trimmed.empty()) return trimmed;

  const size_t scheme_pos = trimmed.find("://");
  if (scheme_pos != std::string::npos) {
    trimmed = trimmed.substr(scheme_pos + 3);
  }

  const size_t path_pos = trimmed.find_first_of("/?#");
  if (path_pos != std::string::npos) {
    trimmed = trimmed.substr(0, path_pos);
  }

  const size_t port_pos = trimmed.find(':');
  if (port_pos != std::string::npos) {
    trimmed = trimmed.substr(0, port_pos);
  }

  return ToLowerAscii(trimmed);
}

std::string FetchHost() {
  char* host_ptr = GetHostCString();
  if (host_ptr == nullptr) return std::string();
  std::string host(host_ptr);
  std::free(host_ptr);
  return ToLowerAscii(host);
}

struct OriginCheckResult {
  bool allowed = true;
  std::string error;
};

const OriginCheckResult& CheckOriginAllowed() {
  static OriginCheckResult result = []() {
    OriginCheckResult res;
    const std::string allowlist = ORTOOLS_WASM_ALLOWED_ORIGINS;
    if (allowlist.empty()) {
      res.allowed = true;
      return res;
    }

    const std::string host = FetchHost();
    if (host.empty()) {
      res.allowed = false;
      res.error = "Host unavailable; refusing to run.";
      return res;
    }

    size_t start = 0;
    while (start < allowlist.size()) {
      const size_t comma = allowlist.find(',', start);
      const size_t end = (comma == std::string::npos) ? allowlist.size() : comma;
      const std::string token = NormalizeHost(
          std::string_view(allowlist).substr(start, end - start));
      if (!token.empty() && token == host) {
        res.allowed = true;
        return res;
      }
      if (comma == std::string::npos) break;
      start = comma + 1;
    }

    res.allowed = false;
    res.error = "Host not allowed: " + host;
    return res;
  }();
  return result;
}

uint8_t* SerializeResponse(const CpSolverResponse& response, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  std::string data;
  if (!response.SerializeToString(&data)) {
    *out_len = 0;
    return nullptr;
  }
  auto* buffer =
      static_cast<uint8_t*>(std::malloc(sizeof(uint8_t) * data.size()));
  if (buffer == nullptr) {
    *out_len = 0;
    return nullptr;
  }
  std::memcpy(buffer, data.data(), data.size());
  *out_len = data.size();
  return buffer;
}

CpSolverResponse MakeInvalidResponse(const std::string& message) {
  CpSolverResponse response;
  response.set_status(operations_research::sat::CpSolverStatus::MODEL_INVALID);
  response.set_solution_info(message);
  return response;
}

uint8_t* CopyStringToBuffer(const std::string& message, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  *out_len = message.size();
  if (message.empty()) return nullptr;
  auto* buffer =
      static_cast<uint8_t*>(std::malloc(sizeof(uint8_t) * message.size()));
  if (buffer == nullptr) {
    *out_len = 0;
    return nullptr;
  }
  std::memcpy(buffer, message.data(), message.size());
  return buffer;
}

EM_JS(int, CpSatWorkerCapacity, (), {
  return PThread.unusedWorkers.length;
});

// The outer JavaScript worker owns responsiveness. Native solver workers remain
// available for parallel search; no additional search orchestration thread.
CpSolverResponse SolveWithWorkerCapacity(const CpModelProto& proto, Model* model) {
  auto* parameters = model->GetOrCreate<SatParameters>();
  const int capacity = CpSatWorkerCapacity();
  const int requested = parameters->num_workers() != 0
      ? parameters->num_workers() : parameters->num_search_workers();
  if (requested > capacity) {
    return MakeInvalidResponse("CP-SAT requests more solver workers than the WASM runtime capacity (" +
        std::to_string(capacity) + ").");
  }
  if (parameters->num_workers() == 0 && parameters->num_search_workers() == 0 &&
      !parameters->enumerate_all_solutions() && proto.assumptions().empty()) {
    parameters->set_num_workers(std::min(capacity, std::max<int>(std::thread::hardware_concurrency(), 1)));
  }
  return SolveCpModel(proto, model);
}

void EmitCallbackEvent(int callback_id, CallbackEventType event_type,
                       std::string_view payload) {
  MAIN_THREAD_EM_ASM(
      {
        const sink = Module.__ortoolsCpSatCallbacks?.sinks.get($0);
        if (sink) sink($1, HEAPU8.slice($2, $2 + $3));
      },
      callback_id, static_cast<int>(event_type), payload.data(),
      payload.size());
}

std::string EncodeDouble(double value) {
  std::string payload(sizeof(double), '\0');
  std::memcpy(payload.data(), &value, sizeof(double));
  return payload;
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE uintptr_t cp_sat_interrupt_address() {
  return reinterpret_cast<uintptr_t>(&interrupt_requested);
}

EMSCRIPTEN_KEEPALIVE uint8_t* solve_model_with_callback_events(
    const uint8_t* model_data, size_t model_len, const uint8_t* params_data,
    size_t params_len, int callback_flags, int callback_id, size_t* out_len);

EMSCRIPTEN_KEEPALIVE uint8_t* solve_model_with_callback_events(
    const uint8_t* model_data, size_t model_len, const uint8_t* params_data,
    size_t params_len, int callback_flags, int callback_id, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  const ResetInterruptOnExit reset_interrupt;
  *out_len = 0;

  const OriginCheckResult& origin_check = CheckOriginAllowed();
  if (!origin_check.allowed) {
    const auto response = MakeInvalidResponse(origin_check.error);
    return SerializeResponse(response, out_len);
  }

  CpModelProto model_proto;
  if (model_len > 0 &&
      (model_data == nullptr ||
       !model_proto.ParseFromArray(model_data, static_cast<int>(model_len)))) {
    const auto response = MakeInvalidResponse("Failed to parse CpModelProto.");
    return SerializeResponse(response, out_len);
  }

  SatParameters sat_params;
  if (params_data != nullptr && params_len > 0) {
    sat_params.ParseFromArray(params_data, static_cast<int>(params_len));
  }
  Model model;
  model.Add(NewSatParameters(sat_params));
  RegisterInterrupt(&model);
  if ((callback_flags & kSolutionCallbackFlag) != 0) {
    model.Add(NewFeasibleSolutionObserver(
        [callback_id](const CpSolverResponse& response) {
          std::string data;
          if (!response.SerializeToString(&data)) return;
          EmitCallbackEvent(callback_id, CallbackEventType::kSolution, data);
        }));
  }
  if ((callback_flags & kBestBoundCallbackFlag) != 0) {
    model.Add(NewBestBoundCallback([callback_id](double bound) {
      EmitCallbackEvent(callback_id, CallbackEventType::kBestBound,
                        EncodeDouble(bound));
    }));
  }
  if ((callback_flags & kLogCallbackFlag) != 0) {
    model.GetOrCreate<operations_research::SolverLogger>()
        ->AddInfoLoggingCallback(
            [callback_id](const std::string& message) {
              EmitCallbackEvent(callback_id, CallbackEventType::kLog, message);
            });
  }

  const CpSolverResponse response = SolveWithWorkerCapacity(model_proto, &model);
  return SerializeResponse(response, out_len);
}

// Solve a CpModelProto and optional SatParameters provided as serialized binary
// blobs. Returns a malloc()'d buffer containing a serialized CpSolverResponse.
// The caller owns the buffer and must free it with free_buffer().
EMSCRIPTEN_KEEPALIVE uint8_t* solve_model(const uint8_t* model_data,
                                          size_t model_len,
                                          const uint8_t* params_data,
                                          size_t params_len, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  const ResetInterruptOnExit reset_interrupt;
  *out_len = 0;

  const OriginCheckResult& origin_check = CheckOriginAllowed();
  if (!origin_check.allowed) {
    const auto response = MakeInvalidResponse(origin_check.error);
    return SerializeResponse(response, out_len);
  }

  CpModelProto model_proto;
  if (model_len > 0 &&
      (model_data == nullptr ||
       !model_proto.ParseFromArray(model_data, static_cast<int>(model_len)))) {
    const auto response = MakeInvalidResponse("Failed to parse CpModelProto.");
    return SerializeResponse(response, out_len);
  }

  SatParameters sat_params;
  if (params_data != nullptr && params_len > 0) {
    sat_params.ParseFromArray(params_data, static_cast<int>(params_len));
  }

  Model model;
  model.Add(NewSatParameters(sat_params));
  RegisterInterrupt(&model);

  const CpSolverResponse response = SolveWithWorkerCapacity(model_proto, &model);
  return SerializeResponse(response, out_len);
}

// Free a buffer returned by solve_model() / validate_model().
EMSCRIPTEN_KEEPALIVE void free_buffer(uint8_t* ptr) {
  std::free(ptr);
}

// Validate a CpModelProto. Returns nullptr if valid, otherwise a malloc()'d
// buffer containing a UTF-8 error message.
EMSCRIPTEN_KEEPALIVE uint8_t* validate_model(const uint8_t* model_data,
                                             size_t model_len,
                                             size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  *out_len = 0;

  const OriginCheckResult& origin_check = CheckOriginAllowed();
  if (!origin_check.allowed) {
    return CopyStringToBuffer(origin_check.error, out_len);
  }

  CpModelProto model_proto;
  if (model_len > 0 &&
      (model_data == nullptr ||
       !model_proto.ParseFromArray(model_data, static_cast<int>(model_len)))) {
    return CopyStringToBuffer("Failed to parse CpModelProto.", out_len);
  }

  const std::string validation =
      operations_research::sat::ValidateCpModel(model_proto);
  if (validation.empty()) return nullptr;
  return CopyStringToBuffer(validation, out_len);
}

// Returns an owned error buffer, or nullptr on success. The explicit output
// distinguishes an infeasible assignment from malformed input/allocation errors.
EMSCRIPTEN_KEEPALIVE uint8_t* cp_sat_solution_is_feasible(
    const uint8_t* data, int length, const int64_t* values, int count,
    int* feasible, size_t* out_len) {
  if (out_len == nullptr || feasible == nullptr) return nullptr;
  *out_len = 0;
  *feasible = -1;
  const auto& origin = CheckOriginAllowed();
  if (!origin.allowed) return CopyStringToBuffer(origin.error, out_len);
  if (length < 0 || count < 0 || (length > 0 && data == nullptr) ||
      (count > 0 && values == nullptr)) {
    return CopyStringToBuffer("Invalid CP-SAT solution-check buffer.", out_len);
  }
  const std::string bytes = length == 0 ? std::string() :
      std::string(reinterpret_cast<const char*>(data), length);
  const auto result = ortools_wasm::CheckCpSatSolution(bytes, {values, static_cast<size_t>(count)});
  if (!result.error.empty()) return CopyStringToBuffer(result.error, out_len);
  *feasible = result.feasible ? 1 : 0;
  return nullptr;
}

// Shared with model/response statistics requests; access is serialized by the runtime lock.
static bool statistics_failed = false;
EMSCRIPTEN_KEEPALIVE uint8_t* cp_sat_statistics(const uint8_t* data, int length,
                                                int response, size_t* out_len) {
  statistics_failed = false;
  if (out_len == nullptr) { statistics_failed = true; return nullptr; }
  *out_len = 0;
  const OriginCheckResult& origin = CheckOriginAllowed();
  if (!origin.allowed) { statistics_failed = true; return CopyStringToBuffer(origin.error, out_len); }
  if (length < 0 || (length > 0 && data == nullptr)) {
    statistics_failed = true;
    return CopyStringToBuffer("Invalid CP-SAT statistics buffer.", out_len);
  }
  const std::string bytes = length == 0 ? std::string() : std::string(reinterpret_cast<const char*>(data), length);
  const auto result = ortools_wasm::CpSatStatistics(bytes, response != 0);
  statistics_failed = !result.error.empty();
  return CopyStringToBuffer(statistics_failed ? result.error : result.report, out_len);
}
EMSCRIPTEN_KEEPALIVE int cp_sat_statistics_failed() { return statistics_failed ? 1 : 0; }

static bool model_text_failed = false;
EMSCRIPTEN_KEEPALIVE uint8_t* cp_sat_export_model_text(const uint8_t* data,
                                                     int length, size_t* out_len) {
  model_text_failed = false;
  if (out_len == nullptr) { model_text_failed = true; return nullptr; }
  *out_len = 0;
  const auto& origin = CheckOriginAllowed();
  if (!origin.allowed) { model_text_failed = true; return CopyStringToBuffer(origin.error, out_len); }
  if (length < 0 || (length > 0 && data == nullptr)) {
    model_text_failed = true;
    return CopyStringToBuffer("Invalid CP-SAT model export buffer.", out_len);
  }
  const std::string input = length == 0 ? std::string() : std::string(reinterpret_cast<const char*>(data), length);
  const auto result = ortools_wasm::ExportCpSatModelText(input);
  model_text_failed = !result.error.empty();
  const std::string& text = model_text_failed ? result.error : result.text;
  auto* output = CopyStringToBuffer(text, out_len);
  if (output == nullptr && !text.empty()) model_text_failed = true;
  return output;
}
EMSCRIPTEN_KEEPALIVE int cp_sat_model_text_failed() { return model_text_failed ? 1 : 0; }

}  // extern "C"
