// Minimal C API surface for MPSolver over WASM.
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "absl/status/status.h"
#include "absl/time/time.h"
#include <emscripten/emscripten.h>

#ifdef USE_CBC
#include "CbcModel.hpp"
#endif
#include "generated_proto_schemas.h"
#include "ortools/algorithms/knapsack_solver.h"
#include "knapsack_validation.h"
#include "mp_solver_parameters.h"
#include "javascript/mp_solver_messages.h"
#include "javascript/mp_solver_iis.h"
#include "mp_solver_model_import.h"
#include "javascript/mp_solver_model_queries.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/linear_solver/solve_mp_model.h"
#include "javascript/mp_solver_solution_verification.h"
#include "javascript/mp_solver_session.h"

namespace {

using operations_research::MPConstraint;
using operations_research::MPModelRequest;
using operations_research::MPModelProto;
using operations_research::MPObjective;
using operations_research::MPSolutionResponse;
using operations_research::MPSolver;
using operations_research::MPSolverParameters;
using operations_research::MPVariable;
using operations_research::KnapsackSolver;
using operations_research::sat::wasm::kLinearSolverProtoSchema;
using operations_research::sat::wasm::kOptionalBooleanProtoSchema;

struct VariableHandle {
  int solver_handle = 0;
  MPVariable* variable = nullptr;
};

struct ConstraintHandle {
  int solver_handle = 0;
  MPConstraint* constraint = nullptr;
};

int g_next_solver_handle = 1;
int g_next_variable_handle = 1;
int g_next_constraint_handle = 1;
int g_next_parameters_handle = 1;

std::unordered_map<int, std::unique_ptr<MPSolver>> g_solvers;
std::unordered_map<int, VariableHandle> g_variables;
std::unordered_map<int, ConstraintHandle> g_constraints;
std::unordered_map<int, std::unique_ptr<MPSolverParameters>> g_parameters;
std::string g_string_result;
std::string g_last_solve_metadata = "{}";
std::string g_last_verification_error;
ortools_wasm::MpSolverModelImportResult g_last_model_import;
std::atomic<bool> g_mp_solver_interrupt_requested = false;
ortools_wasm::mp_session::Registry g_mp_sessions;
std::string g_mp_session_error;

class ResetMpSolverInterruptOnExit {
 public:
  ~ResetMpSolverInterruptOnExit() {
    g_mp_solver_interrupt_requested.store(false);
  }
};

MPSolver* GetSolver(int solver_handle) {
  const auto it = g_solvers.find(solver_handle);
  return it == g_solvers.end() ? nullptr : it->second.get();
}

VariableHandle* GetVariable(int variable_handle) {
  const auto it = g_variables.find(variable_handle);
  return it == g_variables.end() ? nullptr : &it->second;
}

ConstraintHandle* GetConstraint(int constraint_handle) {
  const auto it = g_constraints.find(constraint_handle);
  return it == g_constraints.end() ? nullptr : &it->second;
}

MPSolverParameters* GetParameters(int parameters_handle) {
  const auto it = g_parameters.find(parameters_handle);
  return it == g_parameters.end() ? nullptr : it->second.get();
}

int StoreVariable(int solver_handle, MPVariable* variable) {
  if (variable == nullptr) return 0;
  const int handle = g_next_variable_handle++;
  g_variables.emplace(handle, VariableHandle{solver_handle, variable});
  return handle;
}

int StoreConstraint(int solver_handle, MPConstraint* constraint) {
  if (constraint == nullptr) return 0;
  const int handle = g_next_constraint_handle++;
  g_constraints.emplace(handle, ConstraintHandle{solver_handle, constraint});
  return handle;
}

MPSolver::OptimizationProblemType ParseSolverType(int problem_type) {
  return static_cast<MPSolver::OptimizationProblemType>(problem_type);
}

const char* StoreString(std::string value) {
  g_string_result = std::move(value);
  return g_string_result.c_str();
}

int64_t NumberToInt64(double value) { return static_cast<int64_t>(value); }

std::string JsonEscape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char ch : value) {
    if (ch == '\\' || ch == '"') {
      escaped.push_back('\\');
      escaped.push_back(ch);
    } else if (ch == '\n') {
      escaped += "\\n";
    } else if (ch == '\r') {
      escaped += "\\r";
    } else if (ch == '\t') {
      escaped += "\\t";
    } else {
      escaped.push_back(ch);
    }
  }
  return escaped;
}

uint8_t* CopyProtoToBuffer(const google::protobuf::MessageLite& message,
                           size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  std::string data;
  if (!message.SerializeToString(&data)) {
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

uint8_t* CopyStringToBuffer(const std::string& data, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
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

int MpSolverWorkerCapacity() {
  return EM_ASM_INT({ return PThread.unusedWorkers.length; });
}

std::function<void(const std::string&)> MpSolverMessages(int message_id) {
  if (!message_id) return nullptr;
  return [message_id](const std::string& message) {
    if (message.empty()) return;
    ortools_wasm::bridge::v1::MpSolverLogEvent event;
    event.add_messages(message);
    const auto bytes = event.SerializeAsString();
    MAIN_THREAD_EM_ASM({
      Module.__mpSolverMessages?.get($0)?.(HEAPU8.slice($1, $1 + $2));
    }, message_id, bytes.data(), bytes.size());
  };
}

uint8_t* SolveModelRequestWithThreads(
    MPModelRequest request, int num_threads,
    std::atomic<bool>* interrupt, size_t* out_len,
    const MPSolverParameters* parameters = nullptr,
    std::function<void(const std::string&)> messages = nullptr,
    ortools_wasm::bridge::v1::MpSolverNativeMetadata* native_metadata = nullptr,
    bool editable_snapshot = false) {
  g_last_solve_metadata = "{}";
  MPSolutionResponse response;
  if (!ortools_wasm::NormalizeMpSolverParameters(&request, num_threads, &response)) {
    return CopyProtoToBuffer(response, out_len);
  }
  if (num_threads > MpSolverWorkerCapacity() - (interrupt != nullptr ? 1 : 0)) {
    response.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
    response.set_status_str("MPSolver requests more threads than the WASM runtime capacity.");
    return CopyProtoToBuffer(response, out_len);
  }
  if (!request.has_model()) {
    response.set_status(operations_research::MPSOLVER_MODEL_INVALID);
    response.set_status_str(
        "MPSolver: threaded model-request solve requires a model field.");
    return CopyProtoToBuffer(response, out_len);
  }
#ifdef USE_CBC
  if (num_threads > 1 &&
      request.solver_type() ==
          MPModelRequest::CBC_MIXED_INTEGER_PROGRAMMING &&
      !CbcModel::haveMultiThreadSupport()) {
    response.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
    response.set_status_str(
        "CBC was built without multi-thread support.");
    return CopyProtoToBuffer(response, out_len);
  }
#endif

  const auto problem_type = static_cast<MPSolver::OptimizationProblemType>(request.solver_type());
  if (!MPSolver::SupportsProblemType(problem_type)) {
    response.set_status(operations_research::MPSOLVER_SOLVER_TYPE_UNAVAILABLE);
    response.set_status_str("MPSolver backend is not available in this runtime.");
    return CopyProtoToBuffer(response, out_len);
  }
  MPSolver solver(request.model().name(), problem_type);
  if (request.enable_internal_solver_output()) {
    solver.EnableOutput();
  }

  if (num_threads > 1 ||
      request.solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING) {
    const absl::Status status = solver.SetNumThreads(num_threads);
    if (!status.ok()) {
      response.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
      response.set_status_str(std::string(status.message()));
      return CopyProtoToBuffer(response, out_len);
    }
  }

  std::string error_message;
  const auto load_status = editable_snapshot
      ? ortools_wasm::PopulateMpSolverSnapshot(request.model(), solver, &error_message)
      : solver.LoadModelFromProto(request.model(), &error_message);
  if (load_status != operations_research::MPSOLVER_MODEL_IS_VALID) {
    response.set_status(load_status);
    response.set_status_str(error_message);
    return CopyProtoToBuffer(response, out_len);
  }

  if (request.has_solver_time_limit_seconds()) {
    solver.SetTimeLimit(absl::Seconds(request.solver_time_limit_seconds()));
  }
  if (request.has_solver_specific_parameters() &&
      !request.solver_specific_parameters().empty() &&
      !solver.SetSolverSpecificParametersAsString(
          request.solver_specific_parameters())) {
    if (!request.ignore_solver_specific_parameters_failure()) {
      response.set_status(
          operations_research::MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS);
      response.set_status_str(
          "MPSolver: solver_specific_parameters could not be applied.");
      return CopyProtoToBuffer(response, out_len);
    }
  }

  ortools_wasm::ScopedMpSolverMessages scoped_messages(solver, std::move(messages));
  std::atomic<bool> solve_finished = false;
  std::thread interrupt_thread;
  if (interrupt != nullptr) {
    if (!operations_research::SolverTypeSupportsInterruption(
            request.solver_type())) {
      response.set_status(operations_research::MPSOLVER_INCOMPATIBLE_OPTIONS);
      response.set_status_str(
          "MPSolver: the selected backend does not support interruption.");
      return CopyProtoToBuffer(response, out_len);
    }
    interrupt_thread = std::thread([&solver, &solve_finished, interrupt] {
      while (!solve_finished.load()) {
        if (interrupt->load()) solver.InterruptSolve();
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    });
  }
  if (parameters != nullptr) {
    solver.Solve(*parameters);
  } else {
    solver.Solve();
  }
  solve_finished.store(true);
  if (interrupt_thread.joinable()) interrupt_thread.join();
  solver.FillSolutionResponseProto(&response);
  if (native_metadata) ortools_wasm::mp_session::FillMetadata(solver, response, native_metadata);
  std::ostringstream metadata;
  metadata << std::setprecision(17);
  metadata << "{\"solverVersion\":\"" << JsonEscape(solver.SolverVersion())
           << "\",\"iterations\":\"" << solver.iterations()
           << "\",\"nodes\":\"" << (solver.IsMIP() ? solver.nodes() : -1)
           << "\",\"variableBasisStatus\":[";
  const bool has_basis = !solver.IsMIP() && solver.ProblemType() != MPSolver::PDLP_LINEAR_PROGRAMMING &&
      (response.status() == operations_research::MPSOLVER_OPTIMAL ||
       response.status() == operations_research::MPSOLVER_FEASIBLE);
  if (has_basis) {
    for (int i = 0; i < solver.NumVariables(); ++i) {
      if (i) metadata << ',';
      metadata << solver.variable(i)->basis_status();
    }
  }
  metadata << "],\"constraintBasisStatus\":[";
  if (has_basis) {
    for (int i = 0; i < solver.NumConstraints(); ++i) {
      if (i) metadata << ',';
      metadata << solver.constraint(i)->basis_status();
    }
  }
  metadata << "]";
  if (has_basis && solver.ProblemType() == MPSolver::GLPK_LINEAR_PROGRAMMING) {
    const double condition = solver.ComputeExactConditionNumber();
    metadata << ",\"exactConditionNumber\":";
    if (std::isfinite(condition)) metadata << condition;
    else metadata << "\"Infinity\"";
  }
  metadata << "}";
  g_last_solve_metadata = metadata.str();
  return CopyProtoToBuffer(response, out_len);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_solve_bridge_request(
    const uint8_t* data, size_t size, size_t* out_len, int message_id) {
  namespace bridge = ortools_wasm::bridge::v1;
  ResetMpSolverInterruptOnExit reset_interrupt;
  g_mp_session_error.clear();
  try {
    bridge::MpSolverBridgeRequest input;
    MPModelRequest request;
    if (!input.ParseFromArray(data, size) || !input.has_solve() ||
        !request.ParseFromString(input.solve().request_proto()))
      throw std::invalid_argument("Invalid MPSolver solve request.");
    MPSolverParameters parameters;
    for (const auto& [key, value] : input.solve().parameters().double_params())
      parameters.SetDoubleParam(static_cast<MPSolverParameters::DoubleParam>(key), value);
    for (const auto& [key, value] : input.solve().parameters().integer_params())
      parameters.SetIntegerParam(static_cast<MPSolverParameters::IntegerParam>(key), value);
    bridge::MpSolverBridgeResponse response;
    size_t result_size = 0;
    std::unique_ptr<uint8_t, decltype(&std::free)> result(
        SolveModelRequestWithThreads(std::move(request), input.solve().num_threads(),
          input.solve().interruptible() ? &g_mp_solver_interrupt_requested : nullptr,
          &result_size, &parameters,
          input.solve().stream_messages() ? MpSolverMessages(message_id) : nullptr,
          response.mutable_metadata(), input.solve().editable_snapshot()), &std::free);
    if (!result) throw std::runtime_error("Could not allocate MPSolver result.");
    if (response.metadata().solver_version().empty()) response.clear_metadata();
    response.set_response_proto(result.get(), result_size);
    return CopyProtoToBuffer(response, out_len);
  } catch (const std::exception& error) {
    g_mp_session_error = error.what(); *out_len = 0; return nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_compute_iis_request(
    const uint8_t* data, size_t size, size_t* out_len) {
  const ResetMpSolverInterruptOnExit reset_interrupt;
  namespace bridge = ortools_wasm::bridge::v1;
  g_mp_session_error.clear();
  try {
    bridge::MpSolverBridgeRequest request;
    if (!request.ParseFromArray(data, size) || !request.has_iis()) {
      g_mp_session_error = "Invalid MPSolver IIS request."; *out_len = 0; return nullptr;
    }
    const auto result = ortools_wasm::ComputeMpSolverIis(request.iis(),
        request.iis().interruptible() ? &g_mp_solver_interrupt_requested : nullptr);
    if (!result.ok()) {
      g_mp_session_error = result.status().ToString(); *out_len = 0; return nullptr;
    }
    bridge::MpSolverBridgeResponse response;
    *response.mutable_iis() = *result;
    return CopyProtoToBuffer(response, out_len);
  } catch (const std::exception& error) {
    g_mp_session_error = error.what(); *out_len = 0; return nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_bridge_error() { return g_mp_session_error.c_str(); }

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_model_query_request(
    const uint8_t* data, size_t size, size_t* out_len) {
  g_mp_session_error.clear();
  try {
    ortools_wasm::bridge::v1::MpSolverBridgeRequest request;
    if (!request.ParseFromArray(data, size)) throw std::invalid_argument("Invalid MPSolver model query.");
    const auto result = ortools_wasm::QueryMpSolverModel(request);
    if (!result.ok()) throw std::invalid_argument(result.status().ToString());
    return CopyProtoToBuffer(*result, out_len);
  } catch (const std::exception& error) {
    g_mp_session_error = error.what(); *out_len = 0; return nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_session_request(const uint8_t* data, size_t size, size_t* out_len, int message_id) {
  namespace bridge = ortools_wasm::bridge::v1;
  ResetMpSolverInterruptOnExit reset_interrupt;
  g_mp_session_error.clear();
  try {
    bridge::MpSolverBridgeRequest request;
    if (!request.ParseFromArray(data, size)) throw std::invalid_argument("Invalid MPSolver session request.");
    bridge::MpSolverBridgeResponse response;
    switch (request.payload_case()) {
      case bridge::MpSolverBridgeRequest::kSessionCreate:
        response = g_mp_sessions.Create(request.session_create()); break;
      case bridge::MpSolverBridgeRequest::kSessionClose:
        response = g_mp_sessions.Close(request.session_close().handle()); break;
      case bridge::MpSolverBridgeRequest::kSessionRun: {
        const auto& input = request.session_run();
        const bool interruptible = input.solve().interruptible();
        if (input.action() == bridge::MpSolverSessionRunRequest::SOLVE &&
            input.solve().num_threads() > MpSolverWorkerCapacity() - (interruptible ? 1 : 0))
          throw std::invalid_argument("MPSolver requests more threads than the WASM runtime capacity.");
        response = g_mp_sessions.Run(input, [&](MPSolver& solver, const MPSolverParameters& parameters) {
#ifdef USE_CBC
          if (input.solve().num_threads() > 1 && solver.ProblemType() == MPSolver::CBC_MIXED_INTEGER_PROGRAMMING && !CbcModel::haveMultiThreadSupport())
            throw std::invalid_argument("CBC was built without multi-thread support.");
#endif
          ortools_wasm::ScopedMpSolverMessages messages(solver, input.solve().stream_messages() ? MpSolverMessages(message_id) : nullptr);
          std::atomic<bool> finished = false;
          std::thread monitor;
          if (interruptible) {
            if (!operations_research::SolverTypeSupportsInterruption(static_cast<MPModelRequest::SolverType>(solver.ProblemType())))
              throw std::invalid_argument("MPSolver backend does not support interruption.");
            monitor = std::thread([&] {
              while (!finished.load()) {
                if (g_mp_solver_interrupt_requested.load()) solver.InterruptSolve();
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
              }
            });
          }
          try { solver.Solve(parameters); }
          catch (...) { finished.store(true); if (monitor.joinable()) monitor.join(); throw; }
          finished.store(true); if (monitor.joinable()) monitor.join();
        });
        break;
      }
      default: throw std::invalid_argument("Unsupported MPSolver session request.");
    }
    return CopyProtoToBuffer(response, out_len);
  } catch (const std::exception& error) {
    g_mp_session_error = error.what();
    if (out_len) *out_len = 0;
    return nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_backend_versions() {
  static std::string versions;
  std::ostringstream output;
  output << '{';
  bool first = true;
  for (int id : {0, 1, 2, 3, 4, 5, 8, 12, 13, 14}) {
    const auto type = static_cast<MPSolver::OptimizationProblemType>(id);
    if (!MPSolver::SupportsProblemType(type)) continue;
    MPSolver solver("", type);
    if (!first) output << ',';
    first = false;
    output << '\"' << id << "\":\"" << JsonEscape(solver.SolverVersion()) << '\"';
  }
  output << '}';
  versions = output.str();
  return versions.c_str();
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_last_solve_metadata() {
  return g_last_solve_metadata.c_str();
}

EMSCRIPTEN_KEEPALIVE uintptr_t mp_solver_interrupt_address() {
  return reinterpret_cast<uintptr_t>(&g_mp_solver_interrupt_requested);
}

#ifndef ORTOOLS_WASM_NO_LOCAL_FREE_BUFFER
EMSCRIPTEN_KEEPALIVE void free_buffer(uint8_t* ptr) { std::free(ptr); }
#endif

EMSCRIPTEN_KEEPALIVE const char* get_linear_solver_schema() {
  return kLinearSolverProtoSchema;
}

EMSCRIPTEN_KEEPALIVE const char* get_optional_boolean_schema() {
  return kOptionalBooleanProtoSchema;
}

EMSCRIPTEN_KEEPALIVE uint8_t* knapsack_solve_serialized(
    int solver_type, const char* name, int use_reduction,
    double time_limit_seconds, int num_workers, const int64_t* profits_data, int num_items,
    const int64_t* weights_data, int num_dimensions,
    const int64_t* capacities_data, size_t* out_len) {
  if (name == nullptr || (num_items > 0 && (profits_data == nullptr || weights_data == nullptr)) ||
      capacities_data == nullptr || num_items < 0 || num_dimensions < 0) {
    return CopyStringToBuffer(
        "{\"ok\":false,\"error\":\"KnapsackSolver: invalid input pointers or "
        "dimensions.\"}", out_len);
  }

  if (const char* error = ortools_wasm::ValidateKnapsackShape(solver_type, num_items, num_dimensions)) {
    return CopyStringToBuffer("{\"ok\":false,\"error\":\"" + JsonEscape(error) + "\"}", out_len);
  }
  if (const char* error = ortools_wasm::ValidateKnapsackWorkers(solver_type, num_workers)) {
    return CopyStringToBuffer("{\"ok\":false,\"error\":\"" + JsonEscape(error) + "\"}", out_len);
  }
  if (num_workers > MpSolverWorkerCapacity()) {
    return CopyStringToBuffer("{\"ok\":false,\"error\":\"Knapsack requests more workers than the WASM runtime capacity.\"}", out_len);
  }
  std::vector<int64_t> profits;
  if (num_items > 0) profits.assign(profits_data, profits_data + num_items);

  std::vector<std::vector<int64_t>> weights(num_dimensions,
                                            std::vector<int64_t>(num_items));
  for (int dimension = 0; dimension < num_dimensions; ++dimension) {
    for (int item = 0; item < num_items; ++item) {
      weights[dimension][item] = weights_data[dimension * num_items + item];
    }
  }

  std::vector<int64_t> capacities(capacities_data,
                                  capacities_data + num_dimensions);

  if (const char* error = ortools_wasm::ValidateKnapsackInput(
          solver_type, profits, weights, capacities, use_reduction != 0)) {
    return CopyStringToBuffer("{\"ok\":false,\"error\":\"" + JsonEscape(error) + "\"}", out_len);
  }

  try {
    KnapsackSolver solver(static_cast<KnapsackSolver::SolverType>(solver_type),
                          name);
    if (!solver.set_num_workers(num_workers)) throw std::invalid_argument("Unsupported Knapsack worker count.");
    solver.set_use_reduction(use_reduction != 0);
    if (std::isnan(time_limit_seconds) || time_limit_seconds < 0) {
      throw std::invalid_argument("Knapsack time limit must be non-negative.");
    }
    solver.set_time_limit(time_limit_seconds);
    solver.Init(profits, weights, capacities);
    const int64_t profit = solver.Solve();

    std::ostringstream out;
    out << "{\"ok\":true,\"profit\":\"" << profit << "\",\"optimal\":"
        << (solver.IsSolutionOptimal() ? "true" : "false") << ",\"name\":\""
        << JsonEscape(solver.GetName()) << "\",\"contains\":[";
    for (int item = 0; item < num_items; ++item) {
      if (item > 0) out << ",";
      out << (solver.BestSolutionContains(item) ? "true" : "false");
    }
    out << "]}";
    return CopyStringToBuffer(out.str(), out_len);
  } catch (const std::exception& e) {
    std::ostringstream out;
    out << "{\"ok\":false,\"error\":\"" << JsonEscape(e.what()) << "\"}";
    return CopyStringToBuffer(out.str(), out_len);
  } catch (...) {
    return CopyStringToBuffer(
        "{\"ok\":false,\"error\":\"KnapsackSolver: unknown native error.\"}",
        out_len);
  }
}

EMSCRIPTEN_KEEPALIVE double mp_solver_infinity() {
  return MPSolver::infinity();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_supports_problem_type(int problem_type) {
  return MPSolver::SupportsProblemType(ParseSolverType(problem_type)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_create(const char* name, int problem_type) {
  if (name == nullptr) return 0;
  const int handle = g_next_solver_handle++;
  auto solver = std::make_unique<MPSolver>(name, ParseSolverType(problem_type));
  g_solvers.emplace(handle, std::move(solver));
  return handle;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_create_solver(const char* solver_id) {
  if (solver_id == nullptr) return 0;
  std::unique_ptr<MPSolver> solver(MPSolver::CreateSolver(solver_id));
  if (!solver) return 0;
  const int handle = g_next_solver_handle++;
  g_solvers.emplace(handle, std::move(solver));
  return handle;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parse_solver_type(const char* solver_id) {
  if (solver_id == nullptr) return -1;
  MPSolver::OptimizationProblemType problem_type;
  if (!MPSolver::ParseSolverType(solver_id, &problem_type)) return -1;
  return problem_type;
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_name(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->Name());
}

EMSCRIPTEN_KEEPALIVE int mp_solver_problem_type(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? -1 : solver->ProblemType();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_is_mip(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->IsMIP() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_clear(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  for (auto it = g_variables.begin(); it != g_variables.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_variables.erase(it);
    } else {
      ++it;
    }
  }
  for (auto it = g_constraints.begin(); it != g_constraints.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_constraints.erase(it);
    } else {
      ++it;
    }
  }
  solver->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_delete(int solver_handle) {
  for (auto it = g_variables.begin(); it != g_variables.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_variables.erase(it);
    } else {
      ++it;
    }
  }
  for (auto it = g_constraints.begin(); it != g_constraints.end();) {
    if (it->second.solver_handle == solver_handle) {
      it = g_constraints.erase(it);
    } else {
      ++it;
    }
  }
  g_solvers.erase(solver_handle);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_variable(int solver_handle, int index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || index < 0 || index >= solver->NumVariables()) return 0;
  return StoreVariable(solver_handle, solver->variable(index));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_lookup_variable(int solver_handle,
                                                   const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->LookupVariableOrNull(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_var(int solver_handle, double lb,
                                           double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeNumVar(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_var(int solver_handle, double lb, double ub,
                                       int integer, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle,
                       solver->MakeVar(lb, ub, integer != 0, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_int_var(int solver_handle, double lb,
                                           double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeIntVar(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_bool_var(int solver_handle,
                                            const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreVariable(solver_handle, solver->MakeBoolVar(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_constraint(int solver_handle, int index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || index < 0 || index >= solver->NumConstraints()) {
    return 0;
  }
  return StoreConstraint(solver_handle, solver->constraint(index));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_lookup_constraint(int solver_handle,
                                                     const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->LookupConstraintOrNull(name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_row_constraint(int solver_handle, double lb,
                                                  double ub, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->MakeRowConstraint(lb, ub, name));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_unbounded_row_constraint(
    int solver_handle, const char* name) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || name == nullptr) return 0;
  return StoreConstraint(solver_handle, solver->MakeRowConstraint(name));
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_clear(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_coefficient(
    int constraint_handle, int variable_handle, double coefficient) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (constraint == nullptr || variable == nullptr ||
      constraint->solver_handle != variable->solver_handle) {
    return;
  }
  constraint->constraint->SetCoefficient(variable->variable, coefficient);
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_get_coefficient(
    int constraint_handle, int variable_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (constraint == nullptr || variable == nullptr ||
      constraint->solver_handle != variable->solver_handle) {
    return 0.0;
  }
  return constraint->constraint->GetCoefficient(variable->variable);
}

EMSCRIPTEN_KEEPALIVE const char* mp_constraint_name(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return StoreString(constraint == nullptr ? "" : constraint->constraint->name());
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_index(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? -1 : constraint->constraint->index();
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_lb(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->lb();
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_ub(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->ub();
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_lb(int constraint_handle,
                                               double lb) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetLB(lb);
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_ub(int constraint_handle,
                                               double ub) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetUB(ub);
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_bounds(int constraint_handle,
                                                   double lb, double ub) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->SetBounds(lb, ub);
}

EMSCRIPTEN_KEEPALIVE double mp_constraint_dual_value(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? 0.0 : constraint->constraint->dual_value();
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_basis_status(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint == nullptr ? -1 : constraint->constraint->basis_status();
}

EMSCRIPTEN_KEEPALIVE int mp_constraint_is_lazy(int constraint_handle) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  return constraint != nullptr && constraint->constraint->is_lazy() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_constraint_set_is_lazy(int constraint_handle,
                                                    int laziness) {
  ConstraintHandle* constraint = GetConstraint(constraint_handle);
  if (constraint == nullptr) return;
  constraint->constraint->set_is_lazy(laziness != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_clear(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->Clear();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_coefficient(
    int solver_handle, int variable_handle, double coefficient) {
  MPSolver* solver = GetSolver(solver_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (solver == nullptr || variable == nullptr ||
      variable->solver_handle != solver_handle) {
    return;
  }
  solver->MutableObjective()->SetCoefficient(variable->variable, coefficient);
}

EMSCRIPTEN_KEEPALIVE double mp_objective_get_coefficient(
    int solver_handle, int variable_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  VariableHandle* variable = GetVariable(variable_handle);
  if (solver == nullptr || variable == nullptr ||
      variable->solver_handle != solver_handle) {
    return 0.0;
  }
  return solver->Objective().GetCoefficient(variable->variable);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_offset(int solver_handle,
                                                  double offset) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetOffset(offset);
}

EMSCRIPTEN_KEEPALIVE double mp_objective_offset(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->Objective().offset();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_add_offset(int solver_handle,
                                                  double offset) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  MPObjective* objective = solver->MutableObjective();
  objective->SetOffset(objective->offset() + offset);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_optimization_direction(
    int solver_handle, int maximize) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetOptimizationDirection(maximize != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_minimization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetMinimization();
}

EMSCRIPTEN_KEEPALIVE void mp_objective_set_maximization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->MutableObjective()->SetMaximization();
}

EMSCRIPTEN_KEEPALIVE double mp_objective_value(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->MutableObjective()->Value();
}

EMSCRIPTEN_KEEPALIVE double mp_objective_best_bound(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->MutableObjective()->BestBound();
}

EMSCRIPTEN_KEEPALIVE int mp_objective_maximization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->Objective().maximization() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_objective_minimization(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->Objective().minimization() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_solve(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return MPSolver::ABNORMAL;
  return solver->Solve();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_solve_with_parameters(
    int solver_handle, int parameters_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (solver == nullptr || parameters == nullptr) return MPSolver::ABNORMAL;
  return solver->Solve(*parameters);
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_find_error_in_model_proto(const uint8_t* bytes, int length) {
  if (length < 0 || (length > 0 && bytes == nullptr)) return StoreString("Invalid MPModelProto buffer.");
  const std::string input = length == 0 ? std::string() : std::string(reinterpret_cast<const char*>(bytes), length);
  return StoreString(ortools_wasm::FindErrorInMpModelBytes(input));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_last_import_status() { return g_last_model_import.status; }
EMSCRIPTEN_KEEPALIVE const char* mp_solver_last_import_error() { return g_last_model_import.error.c_str(); }
EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_import_model(
    const uint8_t* bytes, int length, int solver_type, const char* name,
    int keep_names, size_t* out_len) {
  g_last_model_import = {};
  if (out_len != nullptr) *out_len = 0;
  if (length < 0 || (length > 0 && bytes == nullptr) || name == nullptr || (keep_names != 0 && keep_names != 1)) {
    g_last_model_import.error = "Invalid MPSolver model import arguments.";
    return nullptr;
  }
  const std::string input = length == 0 ? std::string() : std::string(reinterpret_cast<const char*>(bytes), length);
  g_last_model_import = ortools_wasm::ImportMpSolverModel(input, solver_type, name, keep_names != 0);
  if (g_last_model_import.status != operations_research::MPSOLVER_MODEL_IS_VALID) return nullptr;
  return CopyProtoToBuffer(g_last_model_import.model, out_len);
}

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_export_model_proto(
    int solver_handle, size_t* out_len) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    if (out_len != nullptr) *out_len = 0;
    StoreString("MPSolver: solver handle not found.");
    return nullptr;
  }
  MPModelProto model;
  solver->ExportModelToProto(&model);
  return CopyProtoToBuffer(model, out_len);
}

EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_export_model_request_proto(
    int solver_handle, int solver_type, double time_limit_seconds,
    int enable_output, const char* solver_specific_parameters,
    size_t* out_len) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    if (out_len != nullptr) *out_len = 0;
    StoreString("MPSolver: solver handle not found.");
    return nullptr;
  }
  MPModelRequest request;
  solver->ExportModelToProto(request.mutable_model());
  request.set_solver_type(static_cast<MPModelRequest::SolverType>(solver_type));
  if (time_limit_seconds > 0) {
    request.set_solver_time_limit_seconds(time_limit_seconds);
  }
  request.set_enable_internal_solver_output(enable_output != 0);
  if (solver_specific_parameters != nullptr &&
      solver_specific_parameters[0] != '\0') {
    request.set_solver_specific_parameters(solver_specific_parameters);
  }
  return CopyProtoToBuffer(request, out_len);
}

uint8_t* mp_solver_solve_model_request_impl(
    const uint8_t* request_data, size_t request_len, int enable_interrupt,
    size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  const ResetMpSolverInterruptOnExit reset_interrupt;
  MPModelRequest request;
  MPSolutionResponse response;
  if (request_data == nullptr ||
      !request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    response.set_status(operations_research::MPSOLVER_MODEL_INVALID);
    response.set_status_str("MPSolver: failed to parse MPModelRequest bytes.");
    return CopyProtoToBuffer(response, out_len);
  }
  if (!ortools_wasm::NormalizeMpSolverParameters(&request, 1, &response)) {
    return CopyProtoToBuffer(response, out_len);
  }
  if (request.solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING) {
    return SolveModelRequestWithThreads(
        request, 1,
        enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr,
        out_len);
  }
  MPSolver::SolveWithProto(
      request, &response,
      enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr);
  return CopyProtoToBuffer(response, out_len);
}

uint8_t* mp_solver_solve_model_request_with_threads_impl(
    const uint8_t* request_data, size_t request_len, int num_threads,
    int enable_interrupt, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  const ResetMpSolverInterruptOnExit reset_interrupt;
  MPModelRequest request;
  MPSolutionResponse response;
  if (request_data == nullptr ||
      !request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    response.set_status(operations_research::MPSOLVER_MODEL_INVALID);
    response.set_status_str("MPSolver: failed to parse MPModelRequest bytes.");
    return CopyProtoToBuffer(response, out_len);
  }
  if (!ortools_wasm::NormalizeMpSolverParameters(&request, num_threads, &response)) {
    return CopyProtoToBuffer(response, out_len);
  }
  if (num_threads <= 1) {
    if (request.solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING) {
      return SolveModelRequestWithThreads(
          request, 1,
          enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr,
          out_len);
    }
    MPSolver::SolveWithProto(
        request, &response,
        enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr);
    return CopyProtoToBuffer(response, out_len);
  }
  return SolveModelRequestWithThreads(
      request, num_threads,
      enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr,
      out_len);
}

uint8_t* mp_solver_solve_model_request_with_parameters_impl(
    const uint8_t* request_data, size_t request_len, int num_threads,
    int parameters_handle, int enable_interrupt, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  const ResetMpSolverInterruptOnExit reset_interrupt;
  MPModelRequest request;
  MPSolutionResponse response;
  const MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr || request_data == nullptr ||
      !request.ParseFromArray(request_data, static_cast<int>(request_len))) {
    response.set_status(operations_research::MPSOLVER_MODEL_INVALID);
    response.set_status_str("MPSolver: invalid model request or parameters handle.");
    return CopyProtoToBuffer(response, out_len);
  }
  return SolveModelRequestWithThreads(
      request, num_threads,
      enable_interrupt ? &g_mp_solver_interrupt_requested : nullptr,
      out_len, parameters);
}


EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_solve_model_request(const uint8_t* request_data, size_t request_len, int enable_interrupt, size_t* out_len) {
  const ResetMpSolverInterruptOnExit reset_interrupt;
  try {
    return mp_solver_solve_model_request_impl(request_data, request_len, enable_interrupt, out_len);
  } catch (const std::exception& error) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str(error.what());
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str("MPSolver native solve threw an unknown exception.");
    return CopyProtoToBuffer(response, out_len);
  }
}
EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_solve_model_request_with_threads(const uint8_t* request_data, size_t request_len, int num_threads, int enable_interrupt, size_t* out_len) {
  const ResetMpSolverInterruptOnExit reset_interrupt;
  try {
    return mp_solver_solve_model_request_with_threads_impl(request_data, request_len, num_threads, enable_interrupt, out_len);
  } catch (const std::exception& error) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str(error.what());
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str("MPSolver native solve threw an unknown exception.");
    return CopyProtoToBuffer(response, out_len);
  }
}
EMSCRIPTEN_KEEPALIVE uint8_t* mp_solver_solve_model_request_with_parameters(const uint8_t* request_data, size_t request_len, int num_threads, int parameters_handle, int enable_interrupt, size_t* out_len) {
  const ResetMpSolverInterruptOnExit reset_interrupt;
  try {
    return mp_solver_solve_model_request_with_parameters_impl(request_data, request_len, num_threads, parameters_handle, enable_interrupt, out_len);
  } catch (const std::exception& error) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str(error.what());
    return CopyProtoToBuffer(response, out_len);
  } catch (...) {
    MPSolutionResponse response;
    response.set_status(operations_research::MPSOLVER_ABNORMAL);
    response.set_status_str("MPSolver native solve threw an unknown exception.");
    return CopyProtoToBuffer(response, out_len);
  }
}

EMSCRIPTEN_KEEPALIVE int mp_solver_load_solution_proto(
    int solver_handle, const uint8_t* response_data, size_t response_len,
    double tolerance) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    StoreString("MPSolver: solver handle not found.");
    return 0;
  }
  MPSolutionResponse response;
  if (response_data == nullptr ||
      !response.ParseFromArray(response_data, static_cast<int>(response_len))) {
    StoreString("MPSolver: failed to parse MPSolutionResponse bytes.");
    return 0;
  }
  const absl::Status status = solver->LoadSolutionFromProto(response, tolerance);
  StoreString(status.ok() ? "" : std::string(status.message()));
  return status.ok() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_verify_solution(int solver_handle,
                                                   double tolerance,
                                                   int log_errors) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr &&
                 solver->VerifySolution(tolerance, log_errors != 0)
             ? 1
             : 0;
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_last_verification_error() {
  return g_last_verification_error.c_str();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_verify_solution_proto(
    const uint8_t* model_bytes, int model_length, const uint8_t* solution_bytes,
    int solution_length, int solver_type, double tolerance, int log_errors) {
  g_last_verification_error.clear();
  if (model_length < 0 || solution_length < 0 ||
      (model_length > 0 && model_bytes == nullptr) ||
      (solution_length > 0 && solution_bytes == nullptr)) {
    g_last_verification_error = "Invalid MPSolver verification buffer.";
    return -1;
  }
  const std::string model = model_length == 0 ? std::string() :
      std::string(reinterpret_cast<const char*>(model_bytes), model_length);
  const std::string solution = solution_length == 0 ? std::string() :
      std::string(reinterpret_cast<const char*>(solution_bytes), solution_length);
  const auto verified = ortools_wasm::VerifyMpSolverSolution(
      model, solution, solver_type, tolerance, log_errors != 0);
  if (!verified.ok()) {
    g_last_verification_error = std::string(verified.status().message());
    return -1;
  }
  return *verified ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_reset(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->Reset();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_interrupt_solve(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->InterruptSolve() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_next_solution(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->NextSolution() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_enable_output(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->EnableOutput();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_suppress_output(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->SuppressOutput();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_output_is_enabled(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver != nullptr && solver->OutputIsEnabled() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_set_time_limit(int solver_handle,
                                                   int64_t milliseconds) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return;
  solver->set_time_limit(milliseconds);
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_time_limit(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->time_limit();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_set_num_threads(int solver_handle,
                                                   int num_threads) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) return 0;
  return solver->SetNumThreads(num_threads).ok() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_get_num_threads(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->GetNumThreads();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_validate_solver_specific_parameters(
    int solver_type, const char* parameters, int length) {
  if (length < 0 || (!parameters && length > 0)) return -1;
  return ortools_wasm::ValidateMpSolverSpecificParameters(solver_type,
      parameters ? std::string(parameters, length) : std::string());
}

EMSCRIPTEN_KEEPALIVE int mp_solver_set_solver_specific_parameters_as_string(
    int solver_handle, const char* parameters) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || parameters == nullptr) return 0;
  return solver->SetSolverSpecificParametersAsString(parameters) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_get_solver_specific_parameters_as_string(
    int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->GetSolverSpecificParametersAsString());
}

EMSCRIPTEN_KEEPALIVE const char* mp_solver_solver_version(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return StoreString(solver == nullptr ? "" : solver->SolverVersion());
}

EMSCRIPTEN_KEEPALIVE int mp_solver_export_model_as_lp_format(
    int solver_handle, int obfuscate) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    StoreString("");
    return 0;
  }
  std::string model;
  const bool ok = solver->ExportModelAsLpFormat(obfuscate != 0, &model);
  StoreString(model);
  return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int mp_solver_export_model_as_mps_format(
    int solver_handle, int fixed_format, int obfuscate) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr) {
    StoreString("");
    return 0;
  }
  std::string model;
  const bool ok = solver->ExportModelAsMpsFormat(fixed_format != 0,
                                                 obfuscate != 0, &model);
  StoreString(model);
  return ok ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE const char* mp_last_string_result() {
  return g_string_result.c_str();
}

EMSCRIPTEN_KEEPALIVE double mp_solver_constraint_activity(int solver_handle,
                                                         int constraint_index) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || constraint_index < 0 ||
      constraint_index >= solver->NumConstraints()) {
    return 0.0;
  }
  const std::vector<double> activities = solver->ComputeConstraintActivities();
  return activities[constraint_index];
}

EMSCRIPTEN_KEEPALIVE double mp_solver_compute_exact_condition_number(
    int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0.0 : solver->ComputeExactConditionNumber();
}

EMSCRIPTEN_KEEPALIVE void mp_solver_set_hint(int solver_handle,
                                             const int* variable_handles,
                                             const double* values,
                                             int count) {
  MPSolver* solver = GetSolver(solver_handle);
  if (solver == nullptr || variable_handles == nullptr || values == nullptr ||
      count < 0) {
    return;
  }
  std::vector<std::pair<const MPVariable*, double>> hint;
  hint.reserve(count);
  for (int i = 0; i < count; ++i) {
    VariableHandle* variable = GetVariable(variable_handles[i]);
    if (variable != nullptr && variable->solver_handle == solver_handle) {
      hint.push_back({variable->variable, values[i]});
    }
  }
  solver->SetHint(std::move(hint));
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_variables(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->NumVariables();
}

EMSCRIPTEN_KEEPALIVE int mp_solver_num_constraints(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->NumConstraints();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_wall_time(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->wall_time();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_iterations(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->iterations();
}

EMSCRIPTEN_KEEPALIVE int64_t mp_solver_nodes(int solver_handle) {
  MPSolver* solver = GetSolver(solver_handle);
  return solver == nullptr ? 0 : solver->nodes();
}

EMSCRIPTEN_KEEPALIVE const char* mp_variable_name(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return StoreString(variable == nullptr ? "" : variable->variable->name());
}

EMSCRIPTEN_KEEPALIVE int mp_variable_index(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? -1 : variable->variable->index();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_solution_value(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->solution_value();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_unrounded_solution_value(
    int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->unrounded_solution_value();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_reduced_cost(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->reduced_cost();
}

EMSCRIPTEN_KEEPALIVE int mp_variable_basis_status(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? -1 : variable->variable->basis_status();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_lb(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->lb();
}

EMSCRIPTEN_KEEPALIVE double mp_variable_ub(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0.0 : variable->variable->ub();
}

EMSCRIPTEN_KEEPALIVE int mp_variable_integer(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable != nullptr && variable->variable->integer() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_integer(int variable_handle,
                                                  int integer) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetInteger(integer != 0);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_lb(int variable_handle, double lb) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetLB(lb);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_ub(int variable_handle, double ub) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetUB(ub);
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_bounds(int variable_handle,
                                                 double lb, double ub) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetBounds(lb, ub);
}

EMSCRIPTEN_KEEPALIVE int mp_variable_branching_priority(int variable_handle) {
  VariableHandle* variable = GetVariable(variable_handle);
  return variable == nullptr ? 0 : variable->variable->branching_priority();
}

EMSCRIPTEN_KEEPALIVE void mp_variable_set_branching_priority(
    int variable_handle, int priority) {
  VariableHandle* variable = GetVariable(variable_handle);
  if (variable == nullptr) return;
  variable->variable->SetBranchingPriority(priority);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parameters_create() {
  const int handle = g_next_parameters_handle++;
  g_parameters.emplace(handle, std::make_unique<MPSolverParameters>());
  return handle;
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_delete(int parameters_handle) {
  g_parameters.erase(parameters_handle);
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_set_double_param(
    int parameters_handle, int param, double value) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->SetDoubleParam(static_cast<MPSolverParameters::DoubleParam>(param),
                             value);
}

EMSCRIPTEN_KEEPALIVE double mp_solver_parameters_get_double_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return MPSolverParameters::kUnknownDoubleParamValue;
  return parameters->GetDoubleParam(
      static_cast<MPSolverParameters::DoubleParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset_double_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->ResetDoubleParam(
      static_cast<MPSolverParameters::DoubleParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_set_integer_param(
    int parameters_handle, int param, int value) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->SetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param), value);
}

EMSCRIPTEN_KEEPALIVE int mp_solver_parameters_get_integer_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) {
    return MPSolverParameters::kUnknownIntegerParamValue;
  }
  return parameters->GetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset_integer_param(
    int parameters_handle, int param) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->ResetIntegerParam(
      static_cast<MPSolverParameters::IntegerParam>(param));
}

EMSCRIPTEN_KEEPALIVE void mp_solver_parameters_reset(int parameters_handle) {
  MPSolverParameters* parameters = GetParameters(parameters_handle);
  if (parameters == nullptr) return;
  parameters->Reset();
}

}  // extern "C"
