// Minimal C API surface for routing over WASM.
#include <array>
#include <algorithm>
#include <cstring>
#include <exception>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <limits>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "ortools/constraint_solver/routing_parameters.pb.h"
#include "javascript/routing_search_parameters.h"
#include "javascript/routing_model_builder.h"
#include "javascript/routing_pickup_delivery.h"
#include "javascript/routing_progress.h"
#include "javascript/routing_index_validation.h"
#include "javascript/routing_successor_domains.h"
#include "javascript/routing_dimension_bounds.h"
#include "javascript/routing_dimension_construction.h"
#include <unordered_set>
#include "javascript/routing_vehicle_costs.h"
#include "javascript/routing_transit_matrix.h"
#include "javascript/routing_state_dependent_transit.h"
#include "javascript/routing_group_controls.h"
#include "javascript/routing_search_configuration.h"
#include "javascript/routing_visit_types.h"
#include "javascript/routing_resources.h"
#include "javascript/routing_breaks.h"
#include "javascript/routing_finalizers.h"
#include "javascript/routing_assignments.h"
#include "javascript/routing_assignment_workflows.h"
#include "javascript/routing_route_callbacks.h"
#include "javascript/routing_dimension_inspection.h"
#include "javascript/routing_model_inspection.h"
#include "javascript/routing_linear_constraints.h"


namespace {

using operations_research::Assignment;
using operations_research::BoundCost;
using operations_research::DefaultRoutingSearchParameters;
using operations_research::FirstSolutionStrategy;
using operations_research::IntVar;
using operations_research::RoutingIndexManager;
using operations_research::RoutingDimension;
using operations_research::RoutingModel;
using operations_research::RoutingNodeIndex;
using operations_research::RoutingSearchParameters;

struct RoutingModelHandle : ortools_wasm::RoutingModelBuilder {
  using RoutingModelBuilder::RoutingModelBuilder;
  std::unordered_map<int, operations_research::IntExpr*> expressions;
  int next_expression = 1;
  ortools_wasm::RoutingAssignmentWorkflow workflow;
  const Assignment* assignment = nullptr;
  Assignment* input_assignment = nullptr;
};

int g_next_manager_handle = 1;
int g_next_model_handle = 1;
std::unordered_map<int, std::shared_ptr<RoutingIndexManager>> g_managers;
std::unordered_map<int, std::shared_ptr<RoutingModelHandle>> g_models;
std::atomic<bool> g_routing_interrupt_requested = false;
std::string g_routing_search_parameter_error;
std::string g_routing_break_error;
std::string g_routing_dimension_inspection_result;
std::string g_routing_model_inspection_result;

bool ReadRoutingSearchParameters(const char* bytes, int byte_count, const char* field_paths, RoutingSearchParameters* parameters) {
  std::vector<std::string> paths;
  const std::string fields(field_paths ? field_paths : "");
  size_t begin = 0;
  while (begin < fields.size()) {
    const size_t end = fields.find(',', begin);
    paths.push_back(fields.substr(begin, end == std::string::npos ? end : end - begin));
    if (end == std::string::npos) break;
    begin = end + 1;
  }
  return byte_count >= 0 && (byte_count == 0 || bytes != nullptr) &&
      ortools_wasm::ParseRoutingSearchParameters(std::string(bytes ? bytes : "", byte_count), paths,
          parameters, &g_routing_search_parameter_error);
}

class ResetRoutingInterruptOnExit {
 public:
  ~ResetRoutingInterruptOnExit() {
    g_routing_interrupt_requested.store(false);
  }
};

EM_JS(int, RoutingWorkerCapacity, (), {
  return Math.max(0, PThread.unusedWorkers.length - 1);
});

bool BindRoutingWorkers(RoutingSearchParameters* parameters) {
  const int capacity = RoutingWorkerCapacity();
  if (capacity < 1 || parameters->sat_parameters().num_workers() > capacity) {
    g_routing_search_parameter_error = "Routing requests more threads than the WASM runtime capacity.";
    return false;
  }
  if (parameters->sat_parameters().num_workers() == 0) {
    parameters->mutable_sat_parameters()->set_num_workers(capacity);
  }
  return true;
}

// The parent JavaScript worker writes the shared flag while this worker is
// inside native search. Only this monitor bridges that flag to Routing's native
// atomic CP/CP-SAT cancellation; search itself stays on the calling thread.
template <typename Solve>
const Assignment* SolveInterruptibly(RoutingModel* model, int enable_interrupt,
                                     Solve&& solve, const std::vector<RoutingModel*>& secondary = {}) {
  std::atomic<bool> finished = false;
  std::thread interrupt_thread;
  if (enable_interrupt != 0) {
    interrupt_thread = std::thread([&] {
      while (!finished.load()) {
        if (g_routing_interrupt_requested.load()) {
          model->CancelSearch();
          for (auto* target : secondary) target->CancelSearch();
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    });
  }
  const Assignment* assignment = nullptr;
  try { assignment = solve(); }
  catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); }
  catch (...) { g_routing_search_parameter_error = "Native Routing search threw an exception."; }
  finished.store(true);
  if (interrupt_thread.joinable()) interrupt_thread.join();
  return assignment;
}

RoutingIndexManager* GetManager(int handle) {
  const auto it = g_managers.find(handle);
  return it == g_managers.end() ? nullptr : it->second.get();
}

RoutingModelHandle* GetModel(int handle) {
  const auto it = g_models.find(handle);
  return it == g_models.end() ? nullptr : it->second.get();
}

std::vector<int> CopyInts(const int* values, int count) {
  if (values == nullptr || count <= 0) return {};
  return std::vector<int>(values, values + count);
}

std::vector<int64_t> CopyInt64s(const int64_t* values, int count) {
  if (values == nullptr || count <= 0) return {};
  return std::vector<int64_t>(values, values + count);
}

std::vector<std::vector<int64_t>> CopyMatrix(const int64_t* values,
                                             int value_count,
                                             int dimension) {
  std::vector<std::vector<int64_t>> matrix;
  if (values == nullptr || dimension <= 0 || value_count != dimension * dimension) {
    return matrix;
  }
  matrix.resize(dimension);
  for (int i = 0; i < dimension; ++i) {
    matrix[i].reserve(dimension);
    for (int j = 0; j < dimension; ++j) {
      matrix[i].push_back(values[i * dimension + j]);
    }
  }
  return matrix;
}

RoutingDimension* GetDimension(RoutingModelHandle* handle, const char* name) {
  if (handle == nullptr || name == nullptr) return nullptr;
  return handle->model->GetMutableDimension(name);
}

EM_JS(int64_t, CallRoutingTransitCallback,
      (int callback_id, int64_t from_index, int64_t to_index), {
  const callbacks = Module.__routingTransitCallbacks;
  const callback = callbacks && callbacks.get(callback_id);
  if (typeof callback !== 'function') {
    throw new Error(`Routing transit callback ${callback_id} is not registered.`);
  }
  const from = Number(from_index);
  const to = Number(to_index);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    throw new RangeError('Routing callback index exceeds JavaScript safe integer range.');
  }
  const value = callback(from, to);
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError('Routing callback result must be a safe integer or bigint.');
  }
  const exact = BigInt(value);
  if (BigInt.asIntN(64, exact) !== exact) {
    throw new RangeError('Routing callback result is outside signed int64 range.');
  }
  return exact;
});

std::optional<int64_t> CallRoutingEvaluator(int callback_id, int evaluator, const std::vector<int64_t>& indices, RoutingModel* model = nullptr) {
  const auto bytes = ortools_wasm::RoutingRouteCallbackData(evaluator, indices);
  auto* buffer = reinterpret_cast<uint8_t*>(MAIN_THREAD_EM_ASM_PTR({
    return Module.__ortoolsRoutingRouteCallbacks.get($0)(HEAPU8.slice($1, $1 + $2));
  }, callback_id, bytes.data(), bytes.size()));
  if (!buffer) {
    if (!model) throw std::runtime_error("Routing predicate callback failed.");
    model->CancelSearch(); return std::nullopt;
  }
  uint32_t size; std::memcpy(&size, buffer, sizeof(size));
  const std::string reply(reinterpret_cast<const char*>(buffer + sizeof(size)), size);
  std::free(buffer);
  return ortools_wasm::RoutingRouteCallbackCost(reply);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* routing_inspect_model(int model_handle, int kind,
    int64_t index, int64_t other_index, int vehicle_or_class, int64_t default_value, int callback_id, int predicate_evaluator, int64_t third_index) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle) throw std::invalid_argument("Invalid Routing model inspection input.");
    std::function<bool(int64_t)> predicate;
    if (kind == 27) {
      if (callback_id <= 0 || predicate_evaluator < 0) throw std::invalid_argument("Routing sibling lookup requires callback transport.");
      predicate = [callback_id, predicate_evaluator](int64_t sibling) {
        const auto value = CallRoutingEvaluator(callback_id, predicate_evaluator, {sibling});
        if (!value) throw std::invalid_argument("Routing sibling predicate requires a Boolean reply.");
        return ortools_wasm::RoutingPredicateCallbackResult(*value);
      };
    }
    const auto result = ortools_wasm::InspectRoutingModel(*handle->model, kind, index, other_index, vehicle_or_class, default_value, predicate, third_index);
    g_routing_model_inspection_result = ortools_wasm::RoutingModelInspectionJson(result);
    return g_routing_model_inspection_result.c_str();
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return nullptr; }
}

EMSCRIPTEN_KEEPALIVE const char* routing_inspect_model_parameters(int model_handle, int kind,
    const char* bytes, int byte_count, const char* paths) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || kind != 30) throw std::invalid_argument("Invalid Routing parameter-dependent inspection.");
    RoutingSearchParameters parameters;
    if (!ReadRoutingSearchParameters(bytes, byte_count, paths, &parameters) || !BindRoutingWorkers(&parameters)) return nullptr;
    const auto result = ortools_wasm::InspectRoutingModel(*handle->model, kind, 0, 0, 0, 0, {}, 0, &parameters);
    g_routing_model_inspection_result = ortools_wasm::RoutingModelInspectionJson(result);
    return g_routing_model_inspection_result.c_str();
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return nullptr; }
}

EMSCRIPTEN_KEEPALIVE int routing_set_tabu_vars(int model_handle, const int32_t* kinds,
    const int64_t* indices, const char* const* names, const int32_t* resource_groups, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || count < -1 || (count > 0 && (!kinds || !indices || !names || !resource_groups)))
      throw std::invalid_argument("Invalid Routing tabu variable references.");
    if (count == -1) { ortools_wasm::SetRoutingTabuVars(*handle->model, std::nullopt); return 1; }
    std::vector<IntVar*> variables;
    for (int i = 0; i < count; ++i) {
      if (!names[i]) throw std::invalid_argument("Invalid Routing tabu dimension name.");
      variables.push_back(ortools_wasm::RoutingVariable(*handle->model, kinds[i], names[i], indices[i], resource_groups[i], &handle->variables));
    }
    ortools_wasm::SetRoutingTabuVars(*handle->model, std::move(variables)); return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}

EMSCRIPTEN_KEEPALIVE int routing_set_sweep_arranger(int model_handle, const int32_t* data, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || count <= 0 || !data) throw std::invalid_argument("Invalid Routing sweep points.");
    std::vector<std::pair<int64_t, int64_t>> points;
    for (int i = 0; i < count; ++i) points.emplace_back(data[2*i], data[2*i+1]);
    ortools_wasm::SetRoutingSweepArranger(*handle->model, points); return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_add_ordered_activity_group(int model_handle, const int32_t* data, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || count < 0 || (count && !data)) throw std::invalid_argument("Invalid Routing ordered activity group.");
    std::vector<int> indices;
    for (int i = 0; i < count; ++i) indices.push_back(data[i]);
    ortools_wasm::AddRoutingOrderedActivityGroup(*handle->model, indices); return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_add_forbidden_intervals(int model_handle, const char* name, int64_t index,
    const int64_t* data, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || !name || count < 0 || (count && !data)) throw std::invalid_argument("Invalid Routing forbidden intervals input.");
    std::vector<std::pair<int64_t, int64_t>> intervals;
    for (int i = 0; i < count; ++i) intervals.emplace_back(data[2 * i], data[2 * i + 1]);
    ortools_wasm::AddRoutingForbiddenIntervals(*handle->model, name, index, intervals);
    return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_set_piecewise_cost(int model_handle, const char* name, int64_t index,
    const int64_t* data, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || !name || count <= 0 || !data) throw std::invalid_argument("Invalid Routing piecewise cost input.");
    std::vector<ortools_wasm::RoutingCostSegment> segments;
    for (int i = 0; i < count; ++i) segments.push_back({data[4 * i], data[4 * i + 1], data[4 * i + 2], data[4 * i + 3]});
    ortools_wasm::SetRoutingPiecewiseCost(*handle->model, name, index, segments);
    return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE const char* routing_inspect_dimension(int model_handle, const char* name, int kind,
    int64_t index, int64_t other_index, int vehicle, int64_t lower, int64_t upper,
    int pair_index, int pickup_alternative, int delivery_alternative) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || !name) throw std::invalid_argument("Invalid Routing dimension inspection input.");
    ortools_wasm::RoutingDimensionInspection result;
    if (kind == 13) result.value = ortools_wasm::InspectRoutingShortestTransitionSlack(*handle->model, name, index, handle->input_assignment);
    else result = ortools_wasm::InspectRoutingDimension(*handle->model, name, kind, index, other_index, vehicle, lower, upper,
        pair_index, pickup_alternative, delivery_alternative);
    g_routing_dimension_inspection_result = ortools_wasm::RoutingDimensionInspectionJson(result);
    return g_routing_dimension_inspection_result.c_str();
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return nullptr; }
}
EMSCRIPTEN_KEEPALIVE void routing_add_enter_search_callback(int model_handle, int callback_id) {
  auto* handle = GetModel(model_handle); if (!handle || callback_id <= 0) return;
  handle->model->AddEnterSearchCallback([callback_id] {
    MAIN_THREAD_EM_ASM({
      const sink = Module.__ortoolsRoutingCallbacks?.sinks.get($0);
      if (sink) sink(new Uint8Array());
    }, callback_id);
  });
}

EMSCRIPTEN_KEEPALIVE const char* routing_get_route_cost(int model_handle, const int64_t* indices, int count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || count < 0 || (count && !indices)) throw std::invalid_argument("Invalid Routing route cost query.");
    std::vector<int64_t> route;
    if (count) route.assign(indices, indices + count);
    const auto cost = ortools_wasm::EvaluateRoutingRouteCost(*handle->model, route);
    g_routing_model_inspection_result = cost ? std::to_string(*cost) : "null";
    return g_routing_model_inspection_result.c_str();
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return nullptr; }
}

EMSCRIPTEN_KEEPALIVE int routing_add_route_constraint(int model_handle, int evaluator, int callback_id, int homogeneous) {
  auto* handle = GetModel(model_handle); if (!handle || evaluator < 0 || callback_id <= 0) return 0;
  auto* model = handle->model.get();
  handle->AddRouteConstraint([model, evaluator, callback_id](const std::vector<int64_t>& route) -> std::optional<int64_t> {
    return CallRoutingEvaluator(callback_id, evaluator, route, model);
  }, homogeneous != 0);
  return 1;
}

EMSCRIPTEN_KEEPALIVE int routing_pickup_delivery_position(int model_handle, int index, int delivery, int field) {
  auto* handle = GetModel(model_handle);
  if (!handle || index < 0 || index >= handle->model->Size()) return -2;
  const auto position = delivery ? handle->model->GetDeliveryPosition(index) : handle->model->GetPickupPosition(index);
  if (field == 2) return delivery ? handle->model->IsDelivery(index) : handle->model->IsPickup(index);
  return !position ? -1 : field == 0 ? position->pd_pair_index : position->alternative_index;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_break_configuration_value(int model_handle, const char* name, int vehicle, int kind, int index) {
  auto* handle = GetModel(model_handle); if (!handle || !name) return -2;
  try { return ortools_wasm::RoutingBreakConfigurationValue(*handle->model, handle->breaks, name, vehicle, kind, index); }
  catch (const std::exception& error) { g_routing_break_error = error.what(); return -2; }
}

EMSCRIPTEN_KEEPALIVE uintptr_t routing_interrupt_address() {
  return reinterpret_cast<uintptr_t>(&g_routing_interrupt_requested);
}

EMSCRIPTEN_KEEPALIVE int routing_create_index_manager(int num_locations,
                                                      int num_vehicles,
                                                      int depot) {
  if (num_locations <= 0 || num_vehicles <= 0) return 0;
  try {
    auto manager = ortools_wasm::RoutingModelBuilder::CreateManager(num_locations, num_vehicles,
        std::vector<int>(num_vehicles, depot), std::vector<int>(num_vehicles, depot));
    const int handle = g_next_manager_handle++;
    g_managers.emplace(handle, std::move(manager));
    return handle;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}

EMSCRIPTEN_KEEPALIVE int routing_create_index_manager_starts_ends(
    int num_locations, int num_vehicles, const int* starts, const int* ends) {
  if (!starts || !ends || num_vehicles <= 0) return 0;
  try {
    auto manager = ortools_wasm::RoutingModelBuilder::CreateManager(num_locations, num_vehicles,
        CopyInts(starts, num_vehicles), CopyInts(ends, num_vehicles));
    const int handle = g_next_manager_handle++;
    g_managers.emplace(handle, std::move(manager));
    return handle;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}

EMSCRIPTEN_KEEPALIVE void routing_delete_index_manager(int manager_handle) {
  g_managers.erase(manager_handle);
}

EMSCRIPTEN_KEEPALIVE int routing_manager_num_nodes(int manager_handle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return 0;
  return manager->num_nodes();
}

EMSCRIPTEN_KEEPALIVE int routing_manager_num_vehicles(int manager_handle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return 0;
  return manager->num_vehicles();
}

EMSCRIPTEN_KEEPALIVE int64_t routing_manager_index_to_node(int manager_handle,
                                                           int64_t index) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return -1;
  return manager->IndexToNode(index).value();
}

EMSCRIPTEN_KEEPALIVE int64_t routing_manager_node_to_index(int manager_handle,
                                                           int node) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return -1;
  return manager->NodeToIndex(RoutingNodeIndex(node));
}

EMSCRIPTEN_KEEPALIVE int routing_manager_num_indices(int manager_handle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return 0;
  return manager->num_indices();
}

EMSCRIPTEN_KEEPALIVE int64_t routing_manager_start_index(int manager_handle,
                                                         int vehicle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return -1;
  return manager->GetStartIndex(vehicle);
}

EMSCRIPTEN_KEEPALIVE int64_t routing_manager_end_index(int manager_handle,
                                                       int vehicle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return -1;
  return manager->GetEndIndex(vehicle);
}



EMSCRIPTEN_KEEPALIVE int routing_create_model_with_parameters(
    int manager_handle, const uint8_t* data, int length, const char* field_paths) {
  auto* manager = GetManager(manager_handle);
  if (!manager || length < 0 || (length > 0 && !data)) return 0;
  std::vector<std::string> paths;
  std::string remaining = field_paths ? field_paths : "";
  size_t begin = 0;
  while (begin < remaining.size()) {
    const auto end = remaining.find(',', begin);
    paths.push_back(remaining.substr(begin, end == std::string::npos ? end : end - begin));
    if (end == std::string::npos) break;
    begin = end + 1;
  }
  operations_research::RoutingModelParameters parameters;
  if (!ortools_wasm::ParseRoutingModelParameters(
      length ? std::string(reinterpret_cast<const char*>(data), length) : "", paths,
      &parameters, &g_routing_search_parameter_error)) return 0;
  const int handle = g_next_model_handle++;
  g_models.emplace(handle, std::make_shared<RoutingModelHandle>(g_managers.at(manager_handle), parameters));
  return handle;
}

EMSCRIPTEN_KEEPALIVE const char* routing_local_search_profile(int model_handle) {
  static std::string profile;
  const auto* handle = GetModel(model_handle);
  profile = handle ? handle->model->solver()->LocalSearchProfile() : "";
  return profile.c_str();
}

EMSCRIPTEN_KEEPALIVE int routing_create_model(int manager_handle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return 0;

  const int handle = g_next_model_handle++;
  g_models.emplace(handle, std::make_shared<RoutingModelHandle>(g_managers.at(manager_handle)));
  return handle;
}

EMSCRIPTEN_KEEPALIVE void routing_delete_model(int model_handle) {
  g_models.erase(model_handle);
  // Standalone restoration has no solve call to clear the shared flag. Keep
  // it live across restoration -> warm solve, then clear it at job cleanup.
  g_routing_interrupt_requested.store(false);
}

EMSCRIPTEN_KEEPALIVE int routing_register_matrix_transit_callback(
    int model_handle, const int64_t* values, int value_count, int dimension, int unary) {
  auto* handle = GetModel(model_handle);
  if (!handle || !values || value_count < 0 || (unary != 0 && unary != 1)) return -1;
  try {
    const int evaluator = handle->RegisterIndexMatrix(std::vector<int64_t>(values, values + value_count), dimension, unary != 0);
    return evaluator;
  } catch (const std::invalid_argument&) { return -1; }
}

EMSCRIPTEN_KEEPALIVE void routing_add_solution_callback(int model_handle, int callback_id, int unchecked) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  RoutingModel* model = handle->model.get();
  ortools_wasm::AddRoutingProgress(model, unchecked != 0, [model, callback_id](bool unchecked) {
    const std::array<int64_t, 3> values{model->CostVar()->Max(), model->solver()->solutions(), unchecked ? 1 : 0};
    MAIN_THREAD_EM_ASM({
      const sink = Module.__ortoolsRoutingCallbacks?.sinks.get($0);
      if (sink) sink(HEAPU8.slice($1, $1 + 24));
    }, callback_id, values.data());
  });
}

EMSCRIPTEN_KEEPALIVE int routing_register_transit_callback(int model_handle,
                                                           int callback_id) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return -1;
  const int evaluator = handle->RegisterTransitCallback(
      [callback_id](int64_t from_index, int64_t to_index) {
        return CallRoutingTransitCallback(callback_id, from_index, to_index);
      });
  return evaluator;
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension(int model_handle,
                                               int evaluator_index,
                                               int64_t slack_max,
                                               int64_t capacity,
                                               int fix_start_cumul_to_zero,
                                               const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return handle->AddDimension(evaluator_index, slack_max, capacity,
                            fix_start_cumul_to_zero != 0, name)
         ? 1
         : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension_with_vehicle_capacity(
    int model_handle, int evaluator_index, int64_t slack_max,
    const int64_t* capacities, int capacity_count, int fix_start_cumul_to_zero,
    const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return handle->AddDimensionWithVehicleCapacity(
                 evaluator_index, slack_max, CopyInt64s(capacities, capacity_count),
                 fix_start_cumul_to_zero != 0, name)
         ? 1
         : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension_with_vehicle_transits(
    int model_handle, const int* evaluator_indices, int evaluator_count,
    int64_t slack_max, int64_t capacity, int fix_start_cumul_to_zero,
    const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return handle->AddDimensionWithVehicleTransits(
                 CopyInts(evaluator_indices, evaluator_count), slack_max, capacity,
                 fix_start_cumul_to_zero != 0, name)
         ? 1
         : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_set_visit_type(int model_handle, int64_t index, int type, int policy) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::SetRoutingVisitType(*handle->model, index, type, policy) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int routing_add_hard_type_incompatibility(int model_handle, int type1, int type2) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::AddRoutingHardTypeIncompatibility(*handle->model, type1, type2) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int routing_add_type_requirement(
    int model_handle, int kind, int dependent_type, const int32_t* alternatives, int count) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || count < 0 || (count > 0 && alternatives == nullptr)) return 0;
  return ortools_wasm::AddRoutingTypeRequirement(*handle->model, kind, dependent_type, CopyInts(alternatives, count)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_temporal_type_incompatibility(int model_handle, int type1, int type2) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::AddRoutingTemporalTypeIncompatibility(*handle->model, type1, type2) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension_with_vehicle_transit_and_capacity(
    int model_handle, const int* evaluator_indices, int evaluator_count, int64_t slack_max,
    const int64_t* capacities, int capacity_count, int fixed_start, const char* name) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr || evaluator_indices == nullptr || capacities == nullptr
      || evaluator_count != handle->model->vehicles() || capacity_count != handle->model->vehicles()
      || (fixed_start != 0 && fixed_start != 1)) return 0;
  const auto limits = CopyInt64s(capacities, capacity_count);
  return handle->AddDimensionWithVehicleTransitAndCapacity(CopyInts(evaluator_indices, evaluator_count),
      slack_max, limits, fixed_start != 0, name) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_register_state_dependent_transit_matrix(
    int model_handle, int64_t domain_start, int64_t domain_end, const int32_t* offsets,
    int offset_count, const int64_t* x, const int64_t* y, int anchor_count) {
  auto* handle = GetModel(model_handle);
  if (!handle || !offsets || !x || !y || anchor_count < 0 || offset_count < 1) return -1;
  const int64_t dimension = handle->model->Size() + handle->model->vehicles();
  if (offset_count != dimension * dimension + 1 || offsets[0] != 0 || offsets[offset_count - 1] != anchor_count) return -1;
  try {
    ortools_wasm::RoutingStateDependentMatrix matrix{domain_start, domain_end, {}};
    for (int i = 0; i + 1 < offset_count; ++i) {
      if (offsets[i] < 0 || offsets[i] > offsets[i + 1] || offsets[i + 1] > anchor_count) return -1;
      matrix.functions.push_back({CopyInt64s(x + offsets[i], offsets[i + 1] - offsets[i]),
          CopyInt64s(y + offsets[i], offsets[i + 1] - offsets[i])});
    }
    return handle->RegisterDependentMatrix(std::move(matrix));
  } catch (const std::exception&) { return -1; }
}

EMSCRIPTEN_KEEPALIVE int routing_add_dependent_dimension(int model_handle, const int32_t* fixed,
    const int32_t* dependent, int count, const char* base_name, int64_t slack,
    const int64_t* capacities, int fixed_start, const char* name) {
  auto* handle = GetModel(model_handle);
  if (!handle || !fixed || !dependent || !capacities || !name || count != handle->model->vehicles()
      || (fixed_start != 0 && fixed_start != 1)) return 0;
  try {
    const auto evaluators = CopyInts(fixed, count);
    const std::string base = base_name ? base_name : "";
    return handle->AddDependentDimension(evaluators, CopyInts(dependent, count), base_name ? &base : nullptr, slack, CopyInt64s(capacities, count), fixed_start != 0, name) ? 1 : 0;
  } catch (const std::exception&) { return 0; }
}

EMSCRIPTEN_KEEPALIVE int routing_add_constant_dimension_with_slack(
    int model_handle, int64_t value, int64_t capacity, int64_t slack_max,
    int fixed_start, const char* name) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr || (fixed_start != 0 && fixed_start != 1)) return -1;
  const auto [evaluator, created] = handle->AddConstantDimension(value, capacity, fixed_start != 0, name, slack_max);
  return created ? evaluator : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_add_constant_dimension(
    int model_handle, int64_t value, int64_t capacity,
    int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->AddConstantDimension(
      value, capacity, fix_start_cumul_to_zero != 0, name);
  return created ? evaluator_index : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_add_vector_dimension(
    int model_handle, const int64_t* values, int value_count, int64_t capacity,
    int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->AddVectorDimension(
      CopyInt64s(values, value_count), capacity, fix_start_cumul_to_zero != 0,
      name);
  return created ? evaluator_index : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_add_matrix_dimension(
    int model_handle, const int64_t* values, int value_count, int dimension,
    int64_t capacity, int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->AddMatrixDimension(
      CopyMatrix(values, value_count, dimension), capacity,
      fix_start_cumul_to_zero != 0, name);
  return created ? evaluator_index : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_has_dimension(int model_handle,
                                               const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return handle->model->HasDimension(name) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_disjunction_with_options(
    int model_handle, const int64_t* indices, int index_count, int64_t penalty,
    int has_penalty, int64_t maximum, int behavior) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || indices == nullptr || index_count <= 0) return -1;
  return ortools_wasm::AddRoutingDisjunction(*handle->model,
      absl::Span<const int64_t>(indices, index_count), has_penalty ? penalty : RoutingModel::kNoPenalty, maximum, behavior);
}

EMSCRIPTEN_KEEPALIVE int routing_add_disjunction(int model_handle,
    const int64_t* indices, int index_count, int64_t penalty, int has_penalty) {
  return routing_add_disjunction_with_options(model_handle, indices, index_count, penalty, has_penalty, 1, 0);
}

EMSCRIPTEN_KEEPALIVE int routing_add_soft_same_vehicle_constraint(int model_handle,
    const int64_t* indices, int index_count, int64_t cost) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || index_count < 0 || (index_count > 0 && indices == nullptr)) return 0;
  return ortools_wasm::AddRoutingSoftSameVehicleConstraint(*handle->model, absl::Span<const int64_t>(indices, index_count), cost);
}

EMSCRIPTEN_KEEPALIVE int routing_set_pickup_delivery_policy(int model_handle, int vehicle, int policy) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::SetRoutingPickupDeliveryPolicy(*handle->model, vehicle, policy);
}

EMSCRIPTEN_KEEPALIVE void routing_set_arc_cost_evaluator_of_all_vehicles(
    int model_handle, int evaluator_index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->SetArcCostEvaluator(evaluator_index);
}

EMSCRIPTEN_KEEPALIVE void routing_set_arc_cost_evaluator_of_vehicle(
    int model_handle, int evaluator_index, int vehicle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->SetArcCostEvaluator(evaluator_index, vehicle);
}

EMSCRIPTEN_KEEPALIVE int routing_status(int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->status();
}

EMSCRIPTEN_KEEPALIVE const char* routing_last_search_parameter_error() {
  return g_routing_search_parameter_error.c_str();
}
EMSCRIPTEN_KEEPALIVE int routing_solve_with_parameters_proto(
    int model_handle, const char* bytes, int byte_count, const char* field_paths,
    int from_assignment, int enable_interrupt) {
  const ResetRoutingInterruptOnExit reset_interrupt;
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  RoutingSearchParameters parameters;
  if (!ReadRoutingSearchParameters(bytes, byte_count, field_paths, &parameters)) return -1;
  const Assignment* initial_assignment = handle->assignment;
  if (from_assignment && initial_assignment == nullptr) return 0;
  if (!BindRoutingWorkers(&parameters)) return -1;
  try {
    ortools_wasm::ValidateRoutingSecondarySearch(parameters, handle->secondary != nullptr);
    handle->workflow.Validate(parameters, from_assignment != 0);
  }
  catch (const std::invalid_argument& error) { g_routing_search_parameter_error = error.what(); return -1; }
  std::vector<RoutingModel*> secondary;
  for (auto* child = handle->secondary.get(); child; child = child->secondary.get()) secondary.push_back(child->model.get());
  handle->assignment = SolveInterruptibly(handle->model.get(), enable_interrupt, [&] {
    return handle->workflow.Run(*handle->model, from_assignment ? initial_assignment : nullptr, parameters);
  }, secondary);
  return handle->assignment == nullptr ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE int routing_configure_assignment_workflow(int model_handle, int action, double duration, int check, int call_monitors) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  handle->workflow.action = action;
  handle->workflow.packing_duration_seconds = duration;
  handle->workflow.check_solution_in_cp = check != 0;
  handle->workflow.call_at_solution_monitors = call_monitors != 0;
  return 1;
}

EMSCRIPTEN_KEEPALIVE int routing_assignment_feasible(int model_handle) {
  auto* handle = GetModel(model_handle);
  return handle && handle->workflow.assignment_feasible;
}

EMSCRIPTEN_KEEPALIVE int routing_ignore_disjunctions_already_forced_to_zero(int model_handle) {
  auto* handle = GetModel(model_handle);
  if (!handle) return 0;
  // Construction operations are replayed before any model closure or search.
  handle->IgnoreForcedDisjunctions();
  return 1;
}

EMSCRIPTEN_KEEPALIVE int routing_set_first_solution_evaluator(int model_handle, int evaluator) {
  auto* handle = GetModel(model_handle);
  return handle && handle->SetFirstSolutionEvaluator(evaluator);
}

EMSCRIPTEN_KEEPALIVE int routing_set_secondary_model(int primary_handle, int secondary_handle,
    const char* bytes, int byte_count, const char* paths) {
  auto* primary = GetModel(primary_handle);
  auto* secondary = GetModel(secondary_handle);
  try {
    if (!primary || !secondary) throw std::invalid_argument("Invalid Routing secondary model handle.");
    if (primary->has_route_callbacks || secondary->has_route_callbacks)
      throw std::invalid_argument("Native Routing secondary-model optimization does not safely support whole-route callbacks.");
    for (auto* child = static_cast<ortools_wasm::RoutingModelBuilder*>(secondary); child; child = child->secondary.get())
      if (child == primary) throw std::invalid_argument("Routing secondary models must not form a cycle.");
    RoutingSearchParameters parameters;
    if (!ReadRoutingSearchParameters(bytes, byte_count, paths, &parameters) || !BindRoutingWorkers(&parameters)) return 0;
    ortools_wasm::ValidateRoutingSecondarySearch(parameters, secondary->secondary != nullptr);
    const auto* a = primary->manager.get();
    const auto* b = secondary->manager.get();
    if (!a || !b || a->num_indices() != b->num_indices()) throw std::invalid_argument("Routing secondary model has a different index-manager layout.");
    for (int index = 0; index < a->num_indices(); ++index)
      if (a->IndexToNode(index) != b->IndexToNode(index)) throw std::invalid_argument("Routing secondary model has a different index-manager layout.");
    primary->SetSecondaryModel(g_models.at(secondary_handle), parameters);
    return 1;
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return 0; }
}

EMSCRIPTEN_KEEPALIVE int routing_set_primary_constrained_dimension(int model_handle, const char* name) {
  auto* handle = GetModel(model_handle);
  return handle && name && handle->SetPrimaryConstrainedDimension(name);
}

EMSCRIPTEN_KEEPALIVE int routing_cumul_optimizer_count(int model_handle, int global) {
  auto* handle = GetModel(model_handle); if (!handle) return -1;
  return global ? handle->model->GetDimensionsWithGlobalCumulOptimizers().size()
                : handle->model->GetDimensionsWithLocalCumulOptimizers().size();
}

EMSCRIPTEN_KEEPALIVE const char* routing_cumul_optimizer_dimension_name(int model_handle, int global, int index) {
  auto* handle = GetModel(model_handle); if (!handle) return "";
  const auto dimensions = global ? handle->model->GetDimensionsWithGlobalCumulOptimizers()
                                 : handle->model->GetDimensionsWithLocalCumulOptimizers();
  return index < 0 || index >= dimensions.size() ? "" : dimensions[index]->name().c_str();
}
EMSCRIPTEN_KEEPALIVE int routing_add_candidate_assignment(int model_handle) {
  auto* handle = GetModel(model_handle); if (!handle || !handle->input_assignment) return 0;
  handle->workflow.candidates.push_back(handle->input_assignment);
  return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_collected_solution_count(int model_handle) {
  auto* handle = GetModel(model_handle); return handle ? handle->workflow.collected.size() : 0;
}
EMSCRIPTEN_KEEPALIVE int routing_select_collected_solution(int model_handle, int index) {
  auto* handle = GetModel(model_handle);
  if (!handle || index < 0 || index >= handle->workflow.collected.size()) return 0;
  handle->assignment = handle->workflow.collected[index]; return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_packing_time_limit_reached(int model_handle) {
  auto* handle = GetModel(model_handle); return handle && handle->workflow.time_limit_reached;
}
EMSCRIPTEN_KEEPALIVE int64_t routing_computed_lower_bound(int model_handle) {
  auto* handle = GetModel(model_handle); return handle ? handle->workflow.computed_lower_bound : 0;
}
EMSCRIPTEN_KEEPALIVE int64_t routing_objective_lower_bound(int model_handle) {
  auto* handle = GetModel(model_handle); return handle ? handle->model->objective_lower_bound() : std::numeric_limits<int64_t>::min();
}
EMSCRIPTEN_KEEPALIVE int64_t routing_search_statistic(int model_handle, int kind) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  const auto& stats = handle->model->search_stats();
  switch (kind) {
    case 0: return stats.num_cp_sat_calls_in_lp_scheduling;
    case 1: return stats.num_glop_calls_in_lp_scheduling;
    case 2: return stats.num_min_cost_flow_calls;
    case 3: return stats.num_cp_sat_calls_in_routing;
    case 4: return stats.num_generalized_cp_sat_calls_in_routing;
    default: return 0;
  }
}

EMSCRIPTEN_KEEPALIVE int64_t routing_first_solution_statistic(int model_handle, int kind,
    const char* bytes, int byte_count, const char* field_paths) {
  auto* handle = GetModel(model_handle);
  if (!handle || handle->model->status() == operations_research::RoutingSearchStatus::ROUTING_INVALID) return -1;
  RoutingSearchParameters parameters;
  if (!ReadRoutingSearchParameters(bytes, byte_count, field_paths, &parameters)) return -1;
  return kind == 0 ? handle->model->GetNumberOfDecisionsInFirstSolution(parameters)
                   : handle->model->GetNumberOfRejectsInFirstSolution(parameters);
}

EMSCRIPTEN_KEEPALIVE void routing_close_model(int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->model->CloseModelWithParameters(DefaultRoutingSearchParameters());
}

EMSCRIPTEN_KEEPALIVE int routing_close_model_proto(int model_handle, const char* bytes, int byte_count, const char* paths) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  RoutingSearchParameters parameters;
  if (!ReadRoutingSearchParameters(bytes, byte_count, paths, &parameters) || !BindRoutingWorkers(&parameters)) return -1;
  try { ortools_wasm::ValidateRoutingSecondarySearch(parameters, handle->secondary != nullptr); }
  catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return -1; }
  handle->model->CloseModelWithParameters(parameters);
  if (handle->model->status() == operations_research::RoutingSearchStatus::ROUTING_INVALID) {
    g_routing_search_parameter_error = "Invalid Routing search parameters for model closure.";
    return -1;
  }
  return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_apply_locks(int model_handle, const int64_t* values, const int* lengths, int count, int close_routes) {
  auto* handle = GetModel(model_handle); if (!handle || count < 0 || (count > 0 && (!values || !lengths))) return 0;
  std::vector<std::vector<int64_t>> routes;
  int offset = 0;
  for (int route = 0; route < count; ++route) {
    if (lengths[route] < 0) return 0;
    routes.emplace_back(values + offset, values + offset + lengths[route]); offset += lengths[route];
  }
  return handle->model->ApplyLocksToAllVehicles(routes, close_routes != 0);
}
EMSCRIPTEN_KEEPALIVE int64_t routing_preassignment_next(int model_handle, int index) {
  auto* handle = GetModel(model_handle);
  if (!handle || index < 0 || index >= handle->model->Size()) return -1;
  auto* variable = handle->model->NextVar(index); const auto* assignment = handle->model->PreAssignment();
  return assignment->Contains(variable) && assignment->Bound(variable) ? assignment->Value(variable) : -1;
}
EMSCRIPTEN_KEEPALIVE const char* routing_transfer_assignment(int model_handle, const int64_t* next_values, int next_count,
    const int64_t* vehicle_values, int vehicle_count) {
  auto* handle = GetModel(model_handle);
  try {
    if (!handle || next_count < 0 || vehicle_count < 0 || (next_count && !next_values) || (vehicle_count && !vehicle_values))
      throw std::invalid_argument("Invalid Routing assignment transfer buffers.");
    std::vector<int64_t> next, vehicles;
    if (next_count) next.assign(next_values, next_values + next_count);
    if (vehicle_count) vehicles.assign(vehicle_values, vehicle_values + vehicle_count);
    const auto snapshot = ortools_wasm::TransferRoutingAssignment(*handle->model, *handle->manager, next, vehicles);
    g_routing_model_inspection_result = ortools_wasm::RoutingSeedSnapshotJson(snapshot);
    return g_routing_model_inspection_result.c_str();
  } catch (const std::exception& error) { g_routing_search_parameter_error = error.what(); return nullptr; }
}
EMSCRIPTEN_KEEPALIVE int routing_input_assignment_create(int model_handle, int has_objective, int64_t minimum, int64_t maximum) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  if ((has_objective != 0 && has_objective != 1) || minimum > maximum || (has_objective && !handle->model->CostVar())) return 0;
  handle->input_assignment = handle->model->solver()->MakeAssignment();
  handle->assignment = handle->input_assignment;
  if (has_objective) {
    handle->input_assignment->AddObjective(handle->model->CostVar());
    handle->input_assignment->SetObjectiveRange(minimum, maximum);
  }
  return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_input_assignment_variable(int model_handle, int kind, const char* name, int64_t index,
    int resource_group, int64_t minimum, int64_t maximum) {
  auto* handle = GetModel(model_handle); if (!handle || !handle->input_assignment) return 0;
  return ortools_wasm::SetRoutingAssignmentVariable(*handle->model, *handle->input_assignment, kind, name ? name : "", index,
      resource_group, minimum, maximum, &handle->variables);
}
EMSCRIPTEN_KEEPALIVE int routing_input_assignment_interval(int model_handle, int index, const int64_t* bounds) {
  auto* handle = GetModel(model_handle); if (!handle || !handle->input_assignment) return 0;
  return ortools_wasm::SetRoutingAssignmentInterval(*handle->input_assignment, handle->breaks, index, bounds);
}
EMSCRIPTEN_KEEPALIVE int routing_set_first_solution_hint(int model_handle) {
  auto* handle = GetModel(model_handle); if (!handle || !handle->input_assignment) return 0;
  handle->model->SetFirstSolutionHint(handle->input_assignment);
  return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_restore_assignment(int model_handle, int enable_interrupt) {
  const ResetRoutingInterruptOnExit reset;
  auto* handle = GetModel(model_handle); if (!handle || !handle->input_assignment) return 0;
  handle->assignment = SolveInterruptibly(handle->model.get(), enable_interrupt, [&] {
    return handle->model->RestoreAssignment(*handle->input_assignment);
  });
  return handle->assignment ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_read_assignment_from_routes(
    int model_handle, const int64_t* values, const int* route_lengths,
    int num_routes, int ignore_inactive_indices) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || values == nullptr || route_lengths == nullptr ||
      num_routes < 0) {
    return 0;
  }
  std::vector<std::vector<int64_t>> routes;
  routes.reserve(num_routes);
  int offset = 0;
  for (int route = 0; route < num_routes; ++route) {
    const int length = route_lengths[route];
    routes.emplace_back(values + offset, values + offset + length);
    offset += length;
  }
  handle->assignment =
      handle->model->ReadAssignmentFromRoutes(routes,
                                              ignore_inactive_indices != 0);
  return handle->assignment == nullptr ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE int routing_read_assignment_from_routes_proto(
    int model_handle, const int64_t* values, const int* route_lengths,
    int num_routes, int ignore_inactive_indices, const char* bytes,
    int byte_count, const char* field_paths, int enable_interrupt) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  RoutingSearchParameters parameters;
  if (!ReadRoutingSearchParameters(bytes, byte_count, field_paths, &parameters)) return -1;
  if (!BindRoutingWorkers(&parameters)) return -1;
  try { handle->workflow.Validate(parameters, true); }
  catch (const std::invalid_argument& error) { g_routing_search_parameter_error = error.what(); return -1; }
  handle->assignment = SolveInterruptibly(handle->model.get(), enable_interrupt, [&] {
    handle->model->CloseModelWithParameters(parameters);
    routing_read_assignment_from_routes(model_handle, values, route_lengths,
                                       num_routes, ignore_inactive_indices);
    return handle->assignment;
  });
  return handle->assignment == nullptr ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE int routing_get_automatic_first_solution_strategy(
    int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetAutomaticFirstSolutionStrategy();
}

EMSCRIPTEN_KEEPALIVE int routing_add_pickup_and_delivery(
    int model_handle, int64_t pickup, int64_t delivery) {
  auto* handle = GetModel(model_handle);
  return handle && handle->AddPickupAndDelivery(pickup, delivery);
}

EMSCRIPTEN_KEEPALIVE int routing_add_pickup_and_delivery_sets(int model_handle, int pickup_disjunction, int delivery_disjunction) {
  auto* handle = GetModel(model_handle);
  return handle && ortools_wasm::AddRoutingPickupAndDeliverySets(*handle->model, pickup_disjunction, delivery_disjunction);
}

EMSCRIPTEN_KEEPALIVE int routing_set_pickup_to_delivery_limits(int model_handle, const char* dimension_name,
    int pair_index, const int64_t* limits, int count) {
  auto* handle = GetModel(model_handle);
  if (!handle || !limits || count <= 0) return 0;
  return ortools_wasm::SetRoutingPickupToDeliveryLimits(*handle->model, dimension_name ? dimension_name : "",
      pair_index, {limits, limits + count});
}

EMSCRIPTEN_KEEPALIVE int routing_add_vehicle_equality_constraint(
    int model_handle, int64_t left_index, int64_t right_index) {
  auto* handle = GetModel(model_handle);
  return handle && handle->AddVehicleEquality(left_index, right_index);
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension_cumul_less_or_equal_constraint(
    int model_handle, const char* dimension_name, int64_t left_index,
    int64_t right_index) {
  auto* handle = GetModel(model_handle);
  return handle && dimension_name && handle->AddCumulLessOrEqual(dimension_name, left_index, right_index);
}

EMSCRIPTEN_KEEPALIVE int routing_modify_domain(int model_handle, int kind, const char* name,
    int64_t index, int action, int64_t lower, int64_t upper, const int64_t* values, int count, int resource_group) {
  auto* handle = GetModel(model_handle);
  if (!handle || !name || count < 0 || (count > 0 && !values)) return 0;
  return ortools_wasm::ModifyRoutingDomain(*handle->model, kind, name, index, action, lower, upper, CopyInt64s(values, count), resource_group, &handle->variables) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int routing_inspect_variable(int model_handle, int kind, const char* name,
    int64_t index, int has_probe, int64_t probe, int soft_mode, int64_t* output, int resource_group) {
  auto* handle = GetModel(model_handle);
  if (!handle || !name || !output || (has_probe != 0 && has_probe != 1)) return 0;
  auto* variable = ortools_wasm::RoutingVariable(*handle->model, kind, name, index, resource_group, &handle->variables);
  if (!variable) return 0;
  if (soft_mode < 0 || soft_mode > 2 || (soft_mode && kind != 1)) return 0;
  if (soft_mode) {
    const auto& dimension = handle->model->GetDimensionOrDie(name);
    output[4] = soft_mode == 1 ? dimension.GetCumulVarSoftLowerBound(index) : dimension.GetCumulVarSoftUpperBound(index);
  }
  output[0] = variable->Min(); output[1] = variable->Max();
  const uint64_t size = variable->Size(); std::memcpy(output + 2, &size, sizeof(size));
  output[3] = (variable->Bound() ? 1 : 0) | (has_probe && variable->Contains(probe) ? 2 : 0);
  return 1;
}
EMSCRIPTEN_KEEPALIVE int routing_create_linear_expression(int model_handle, const int* kinds,
    const int64_t* indices, const int64_t* coefficients, const char* const* names, int count, int64_t offset, const int* resource_groups) {
  auto* handle = GetModel(model_handle);
  if (!handle || count < 0 || (count > 0 && (!kinds || !indices || !coefficients || !names || !resource_groups))) return 0;
  std::vector<ortools_wasm::RoutingLinearTerm> terms;
  for (int i = 0; i < count; ++i) {
    if (!names[i]) return 0;
    terms.push_back({kinds[i], names[i], indices[i], coefficients[i], resource_groups[i]});
  }
  auto* expression = ortools_wasm::RoutingLinearExpression(*handle->model, terms, offset, &handle->variables);
  if (!expression) return 0;
  const int id = handle->next_expression++;
  handle->expressions.emplace(id, expression);
  return id;
}
EMSCRIPTEN_KEEPALIVE int routing_create_boolean_expression(int model_handle, int kind, int value, int comparison,
    int left, int right, const int* operands, int count) {
  auto* handle = GetModel(model_handle); if (!handle || count < 0 || (count && !operands) || (value != 0 && value != 1)) return 0;
  const auto expression = [&](int id) -> operations_research::IntExpr* {
    const auto found = handle->expressions.find(id); return found == handle->expressions.end() ? nullptr : found->second;
  };
  std::vector<operations_research::IntVar*> children;
  for (int i = 0; i < count; ++i) { auto* child = expression(operands[i]); if (!child) return 0; children.push_back(child->Var()); }
  auto* result = ortools_wasm::RoutingBooleanExpression(handle->model->solver(), kind, value, comparison, expression(left), expression(right), children);
  if (!result) return 0;
  const int id = handle->next_expression++; handle->expressions.emplace(id, result); return id;
}
EMSCRIPTEN_KEEPALIVE int routing_create_integer_expression(int model_handle, int kind, const int* operands, int count) {
  auto* handle = GetModel(model_handle); if (!handle || count < 0 || (count && !operands)) return 0;
  std::vector<operations_research::IntExpr*> children;
  for (int i = 0; i < count; ++i) {
    const auto found = handle->expressions.find(operands[i]); if (found == handle->expressions.end()) return 0;
    children.push_back(found->second);
  }
  auto* expression = ortools_wasm::RoutingIntegerExpression(handle->model->solver(), kind, children);
  if (!expression) return 0;
  const int id = handle->next_expression++; handle->expressions.emplace(id, expression); return id;
}
EMSCRIPTEN_KEEPALIVE int routing_register_integer_variable(int model_handle, int index, int expression) {
  auto* handle = GetModel(model_handle); if (!handle || index != handle->variables.integer.size()) return 0;
  const auto found = handle->expressions.find(expression); if (found == handle->expressions.end()) return 0;
  return handle->RegisterIntegerVariable(index, found->second);
}
EMSCRIPTEN_KEEPALIVE int routing_register_boolean_variable(int model_handle, int index, int expression) {
  auto* handle = GetModel(model_handle); if (!handle || index != handle->variables.boolean.size()) return 0;
  const auto found = handle->expressions.find(expression);
  if (found == handle->expressions.end() || found->second->Min() < 0 || found->second->Max() > 1) return 0;
  return handle->RegisterBooleanVariable(index, found->second);
}
EMSCRIPTEN_KEEPALIVE int routing_add_boolean_constraint(int model_handle, int expression) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  const auto found = handle->expressions.find(expression);
  if (found == handle->expressions.end() || found->second->Min() < 0 || found->second->Max() > 1) return 0;
  return handle->AddBooleanConstraint(found->second);
}
EMSCRIPTEN_KEEPALIVE int routing_add_linear_constraint(int model_handle, int left, int right, int comparison) {
  auto* handle = GetModel(model_handle);
  if (!handle || !handle->expressions.count(left) || !handle->expressions.count(right)) return 0;
  return ortools_wasm::AddRoutingLinearConstraint(*handle->model, handle->expressions.at(left), handle->expressions.at(right), comparison) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_conditional_linear_constraint(int model_handle, int left, int right,
    int comparison, const int* conditions, int count, const int* boolean_conditions, int boolean_count) {
  auto* handle = GetModel(model_handle);
  if (!handle || !handle->expressions.count(left) || !handle->expressions.count(right)
      || count < 0 || (count > 0 && !conditions)) return 0;
  std::vector<ortools_wasm::RoutingLinearCondition> guards;
  for (int i = 0; i < count; ++i) {
    const int* condition = conditions + 3 * i;
    if (!handle->expressions.count(condition[0]) || !handle->expressions.count(condition[1])) return 0;
    guards.push_back({handle->expressions.at(condition[0]), handle->expressions.at(condition[1]), condition[2]});
  }
  std::vector<operations_research::IntVar*> boolean_guards;
  if (boolean_count < 0 || (boolean_count && !boolean_conditions)) return 0;
  for (int i = 0; i < boolean_count; ++i) {
    const auto found = handle->expressions.find(boolean_conditions[i]); if (found == handle->expressions.end()) return 0;
    boolean_guards.push_back(found->second->Var());
  }
  return ortools_wasm::AddRoutingLinearConstraint(*handle->model, handle->expressions.at(left),
      handle->expressions.at(right), comparison, guards, boolean_guards) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_finalizer(
    int model_handle, int variable_kind, const char* dimension_name,
    int64_t index, int kind, int64_t target, int weighted, int64_t weight, int resource_group) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || dimension_name == nullptr || (weighted != 0 && weighted != 1)) return 0;
  return ortools_wasm::AddRoutingFinalizer(*handle->model, variable_kind, dimension_name,
      index, kind, target, weighted != 0, weight, resource_group, &handle->variables) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_set_next_values(
    int model_handle, int64_t index, const int64_t* values, int count) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || count < 0 || (count > 0 && values == nullptr)) return 0;
  return ortools_wasm::SetRoutingNextValues(
      *handle->model, index, absl::Span<const int64_t>(values, count)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_set_active_values(
    int model_handle, int64_t index, const int* values, int count) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || count < 0 || (count > 0 && values == nullptr)) return 0;
  std::vector<int64_t> domain;
  if (count > 0) domain.assign(values, values + count);
  return ortools_wasm::SetRoutingActiveValues(*handle->model, index, domain) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_value(
    int model_handle, const char* name, int kind, int vehicle, int64_t value) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return ortools_wasm::SetRoutingDimensionValue(*handle->model, name, kind, vehicle, value) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_slack_bounds(
    int model_handle, const char* name, int64_t index, int64_t lower, int64_t upper) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return ortools_wasm::SetRoutingDimensionBounds(*handle->model, name, index, lower, upper, true) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_set_vehicle_values(
    int model_handle, int64_t index, const int* values, int count) {
  auto* handle = GetModel(model_handle);
  if (!handle || count < 0 || (count > 0 && !values)) return 0;
  std::vector<int64_t> domain;
  if (count) domain.assign(values, values + count);
  return handle->SetVehicleValues(index, domain);
}

EMSCRIPTEN_KEEPALIVE int routing_set_allowed_vehicles_for_index(
    int model_handle, const int* vehicles, int count, int64_t index) {
  auto* handle = GetModel(model_handle);
  if (!handle || count < 0 || (count > 0 && !vehicles)) return 0;
  return handle->SetAllowedVehicles(index, CopyInts(vehicles, count));
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_cumul_bounds(
    int model_handle, const char* dimension_name, int64_t index, int64_t lower,
    int64_t upper) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || dimension_name == nullptr) return 0;
  return ortools_wasm::SetRoutingDimensionBounds(
      *handle->model, dimension_name, index, lower, upper, false) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_add_node_precedence(
    int model_handle, const char* dimension_name, int64_t first, int64_t second,
    int64_t offset, int performed_constraint) {
  auto* handle = GetModel(model_handle);
  return handle && dimension_name && handle->AddNodePrecedence(dimension_name, first, second, offset, performed_constraint);
}

EMSCRIPTEN_KEEPALIVE int routing_solve(int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;

  handle->assignment = handle->model->Solve();
  return handle->assignment == nullptr ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_assignment_objective_value(
    int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || handle->assignment == nullptr) return 0;
  return handle->assignment->ObjectiveValue();
}

EMSCRIPTEN_KEEPALIVE int64_t routing_start(int model_handle, int vehicle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return -1;
  return handle->model->Start(vehicle);
}

EMSCRIPTEN_KEEPALIVE int64_t routing_end(int model_handle, int vehicle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return -1;
  return handle->model->End(vehicle);
}

EMSCRIPTEN_KEEPALIVE int routing_is_end(int model_handle, int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->IsEnd(index) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_next_value(int model_handle,
                                                int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || handle->assignment == nullptr) return -1;
  return handle->assignment->Value(handle->model->NextVar(index));
}

EMSCRIPTEN_KEEPALIVE int routing_assignment_vehicle_value(int model_handle,
                                                         int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || handle->assignment == nullptr || index < 0 ||
      index >= handle->model->Size() + handle->model->vehicles()) return -1;
  return static_cast<int>(handle->assignment->Value(handle->model->VehicleVar(index)));
}

EMSCRIPTEN_KEEPALIVE int64_t routing_get_arc_cost_for_vehicle(
    int model_handle, int64_t from_index, int64_t to_index, int vehicle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetArcCostForVehicle(from_index, to_index, vehicle);
}

EMSCRIPTEN_KEEPALIVE int routing_capture_assignment_variables(int model_handle, int kind, const char* name) {
  auto* handle = GetModel(model_handle);
  return handle && name && ortools_wasm::CaptureRoutingVariables(*handle->model, kind, name, &handle->variables) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int routing_add_resource_group(int model_handle) {
  auto* handle = GetModel(model_handle);
  if (!handle) return -1;
  return handle->AddResourceGroup();
}
EMSCRIPTEN_KEEPALIVE int routing_add_resource(int model_handle, int group, const char* name,
    const int64_t* start, int start_count, const int64_t* end, int end_count) {
  auto* handle = GetModel(model_handle);
  if (!handle || !name || start_count < 0 || end_count < 0 || (start_count && !start) || (end_count && !end)) return -1;
  try {
    std::vector<int64_t> starts, ends;
    if (start_count) starts.assign(start, start + start_count);
    if (end_count) ends.assign(end, end + end_count);
    return ortools_wasm::AddRoutingResource(*handle->model, group, name, starts, ends);
  } catch (const std::exception&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_require_resource(int model_handle, int group, int vehicle) {
  auto* handle = GetModel(model_handle); if (!handle) return 0;
  try { ortools_wasm::RequireRoutingResource(*handle->model, group, vehicle); return 1; } catch (const std::exception&) { return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_allow_resources(int model_handle, int group, int vehicle, const int* resources, int count) {
  auto* handle = GetModel(model_handle); if (!handle || count <= 0 || !resources) return 0;
  try { ortools_wasm::AllowRoutingResources(*handle->model, group, vehicle, {resources, resources + count}); return 1; } catch (const std::exception&) { return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_resource_classes_count(int model_handle, int group) {
  auto* handle = GetModel(model_handle); if (!handle) return -1;
  try { return ortools_wasm::RoutingResourceGroup(*handle->model, group).GetResourceClassesCount(); } catch (const std::exception&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_resource_class_index(int model_handle, int group, int resource) {
  auto* handle = GetModel(model_handle); if (!handle) return -1;
  try { return ortools_wasm::RoutingResourceClassIndex(*handle->model, group, resource); } catch (const std::exception&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_resources_in_class(int model_handle, int group, int resource_class, int* output, int capacity) {
  auto* handle = GetModel(model_handle); if (!handle || capacity < 0 || (capacity && !output)) return -1;
  try {
    const auto& indices = ortools_wasm::RoutingResourcesInClass(*handle->model, group, resource_class);
    if (capacity == 0) return indices.size();
    if (capacity < indices.size()) return -1;
    std::copy(indices.begin(), indices.end(), output); return indices.size();
  } catch (const std::exception&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_resource_attributes(int model_handle, int group, int index, const char* name,
    int for_class, int end_domain, int64_t* output, int capacity) {
  auto* handle = GetModel(model_handle); if (!handle || !name || capacity < 0 || (capacity && !output)
      || (for_class != 0 && for_class != 1) || (end_domain != 0 && end_domain != 1)) return -1;
  try {
    const auto& attributes = ortools_wasm::RoutingResourceAttributes(*handle->model, group, index, name, for_class);
    const auto bounds = (end_domain ? attributes.end_domain() : attributes.start_domain()).FlattenedIntervals();
    if (capacity == 0) return bounds.size();
    if (capacity < bounds.size()) return -1;
    std::copy(bounds.begin(), bounds.end(), output); return bounds.size();
  } catch (const std::exception&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_resource_dimension_affected(int model_handle, int group, const char* name) {
  auto* handle = GetModel(model_handle); if (!handle || !name || !handle->model->HasDimension(name)) return -1;
  try { return ortools_wasm::RoutingResourceGroup(*handle->model, group).GetAffectedDimensionIndices().contains(handle->model->GetDimensionOrDie(name).index()); }
  catch (const std::exception&) { return -1; }
}

EMSCRIPTEN_KEEPALIVE int routing_assignment_resource_bounds(int model_handle, int group, int vehicle, int64_t* bounds) {
  auto* handle = GetModel(model_handle);
  return handle && handle->assignment && ortools_wasm::RoutingResourceAssignmentBounds(*handle->model, *handle->assignment, group, vehicle, bounds) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_assignment_variable_bounds(int model_handle, int kind, const char* name, int64_t index, int64_t* bounds) {
  auto* handle = GetModel(model_handle);
  return handle && handle->assignment && name
    && ortools_wasm::RoutingAssignmentBounds(*handle->model, *handle->assignment, kind, name, index, bounds, &handle->variables) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_assignment_dimension_cumul_value(
    int model_handle, const char* dimension_name, int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  RoutingDimension* dimension = GetDimension(handle, dimension_name);
  if (handle == nullptr || handle->assignment == nullptr ||
      dimension == nullptr) {
    return 0;
  }
  // Assignment::Value uses the minimum for unbound variables in release
  // builds. Read it without asserting that every cumul is bound.
  return handle->assignment->Min(dimension->CumulVar(index));
}

EMSCRIPTEN_KEEPALIVE int64_t routing_assignment_dimension_cumul_max(
    int model_handle, const char* dimension_name, int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  RoutingDimension* dimension = GetDimension(handle, dimension_name);
  if (handle == nullptr || handle->assignment == nullptr || dimension == nullptr) return 0;
  return handle->assignment->Max(dimension->CumulVar(index));
}

EMSCRIPTEN_KEEPALIVE int routing_set_maximum_active_vehicles(int model_handle, int maximum) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::SetRoutingMaximumActiveVehicles(*handle->model, maximum);
}

EMSCRIPTEN_KEEPALIVE int routing_add_break_interval(int model_handle, int64_t start_min, int64_t start_max, int64_t duration, int optional, const char* name) {
  auto* handle = GetModel(model_handle);
  if (!handle || !name) return -1;
  try { return ortools_wasm::AddRoutingBreakInterval(*handle->model, handle->breaks, start_min, start_max, duration, optional != 0, name); }
  catch (const std::invalid_argument&) { return -1; }
}
EMSCRIPTEN_KEEPALIVE int routing_set_break_intervals(int model_handle, const char* dimension, int vehicle,
    const int* intervals, int count, int pre_travel, int post_travel) {
  g_routing_break_error.clear();
  auto* handle = GetModel(model_handle);
  if (!handle || !dimension || count < 0 || (count > 0 && !intervals)
      || (pre_travel != -1 && handle->evaluators.find(pre_travel) == handle->evaluators.end())
      || (post_travel != -1 && handle->evaluators.find(post_travel) == handle->evaluators.end())) return 0;
  try { ortools_wasm::SetRoutingBreakIntervals(*handle->model, handle->breaks, dimension, vehicle, CopyInts(intervals, count), pre_travel, post_travel); return 1; }
  catch (const std::invalid_argument& error) { g_routing_break_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE int routing_set_break_distance_duration(int model_handle, const char* dimension, int vehicle, int64_t distance, int64_t duration) {
  g_routing_break_error.clear();
  auto* handle = GetModel(model_handle);
  if (!handle || !dimension) return 0;
  try { ortools_wasm::SetRoutingBreakDistanceDuration(*handle->model, dimension, vehicle, distance, duration); return 1; }
  catch (const std::invalid_argument& error) { g_routing_break_error = error.what(); return 0; }
}
EMSCRIPTEN_KEEPALIVE const char* routing_last_break_error() { return g_routing_break_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int routing_assignment_break_bounds(int model_handle, int index, int64_t* output) {
  auto* handle = GetModel(model_handle);
  return handle && handle->assignment && ortools_wasm::RoutingBreakAssignmentBounds(*handle->assignment, handle->breaks, index, output);
}
EMSCRIPTEN_KEEPALIVE int routing_set_fixed_vehicle_cost(int model_handle, int vehicle, int64_t cost) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::SetRoutingFixedVehicleCost(*handle->model, vehicle, cost);
}
EMSCRIPTEN_KEEPALIVE int routing_set_path_energy_costs(int model_handle, const char* force, const char* distance,
    int vehicle, int64_t threshold, int64_t below, int64_t above) {
  auto* handle = GetModel(model_handle);
  return handle && force && distance && ortools_wasm::SetRoutingPathEnergyCosts(*handle->model, force, distance, vehicle, threshold, below, above);
}
EMSCRIPTEN_KEEPALIVE int routing_add_same_activity_group(int model_handle, const int* indices, int count) {
  auto* handle = GetModel(model_handle);
  return handle && count >= 0 && (count == 0 || indices) && ortools_wasm::AddRoutingSameActivityGroup(*handle->model, CopyInts(indices, count));
}
EMSCRIPTEN_KEEPALIVE int routing_activity_groups(int model_handle, int group, int* output, int capacity) {
  auto* handle = GetModel(model_handle);
  if (!handle || capacity < 0 || (capacity && !output) || group < -1
      || group >= handle->model->GetSameActivityGroupsCount()) return -1;
  const auto& values = group == -1 ? handle->model->GetSameActivityGroups() : handle->model->GetSameActivityIndicesOfGroup(group);
  if (capacity == 0) return values.size();
  if (capacity < values.size()) return -1;
  std::copy(values.begin(), values.end(), output); return values.size();
}
EMSCRIPTEN_KEEPALIVE int routing_activity_group_count(int model_handle) {
  auto* handle = GetModel(model_handle);
  return handle ? handle->model->GetSameActivityGroupsCount() : -1;
}
EMSCRIPTEN_KEEPALIVE int routing_set_amortized_vehicle_costs(int model_handle, int vehicle, int64_t linear, int64_t quadratic) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && ortools_wasm::SetRoutingAmortizedVehicleCosts(*handle->model, vehicle, linear, quadratic);
}
EMSCRIPTEN_KEEPALIVE int routing_set_vehicle_used_when_empty(int model_handle, int vehicle, int is_used) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && (is_used == 0 || is_used == 1) &&
      ortools_wasm::SetRoutingVehicleUsedWhenEmpty(*handle->model, vehicle, is_used != 0);
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_cumul_soft_bound(
    int model_handle, const char* dimension_name, int64_t index,
    int64_t bound, int64_t coefficient, int lower) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && dimension_name != nullptr &&
      ortools_wasm::SetRoutingCumulSoftBound(*handle->model, dimension_name, index, bound, coefficient, lower != 0);
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_has_soft_span_upper_bounds(
    int model_handle, const char* dimension_name) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr) return 0;
  return dimension->HasSoftSpanUpperBounds() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_soft_span_upper_bound(
    int model_handle, const char* dimension_name, int64_t bound, int64_t cost,
    int vehicle) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && dimension_name != nullptr &&
      ortools_wasm::SetRoutingSoftSpanBound(*handle->model, dimension_name, vehicle, bound, cost, false);
}

EMSCRIPTEN_KEEPALIVE int64_t routing_dimension_get_soft_span_upper_bound_bound(
    int model_handle, const char* dimension_name, int vehicle) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || vehicle < 0 || vehicle >= handle->model->vehicles()) return 0;
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr || !dimension->HasSoftSpanUpperBounds()) return 0;
  return dimension->GetSoftSpanUpperBoundForVehicle(vehicle).bound;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_dimension_get_soft_span_upper_bound_cost(
    int model_handle, const char* dimension_name, int vehicle) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || vehicle < 0 || vehicle >= handle->model->vehicles()) return 0;
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr || !dimension->HasSoftSpanUpperBounds()) return 0;
  return dimension->GetSoftSpanUpperBoundForVehicle(vehicle).cost;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_has_quadratic_cost_soft_span_upper_bounds(
    int model_handle, const char* dimension_name) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr) return 0;
  return dimension->HasQuadraticCostSoftSpanUpperBounds() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_set_quadratic_cost_soft_span_upper_bound(
    int model_handle, const char* dimension_name, int64_t bound, int64_t cost,
    int vehicle) {
  auto* handle = GetModel(model_handle);
  return handle != nullptr && dimension_name != nullptr &&
      ortools_wasm::SetRoutingSoftSpanBound(*handle->model, dimension_name, vehicle, bound, cost, true);
}

EMSCRIPTEN_KEEPALIVE int64_t
routing_dimension_get_quadratic_cost_soft_span_upper_bound_bound(
    int model_handle, const char* dimension_name, int vehicle) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || vehicle < 0 || vehicle >= handle->model->vehicles()) return 0;
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr ||
      !dimension->HasQuadraticCostSoftSpanUpperBounds()) {
    return 0;
  }
  return dimension->GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle).bound;
}

EMSCRIPTEN_KEEPALIVE int64_t
routing_dimension_get_quadratic_cost_soft_span_upper_bound_cost(
    int model_handle, const char* dimension_name, int vehicle) {
  auto* handle = GetModel(model_handle);
  if (handle == nullptr || vehicle < 0 || vehicle >= handle->model->vehicles()) return 0;
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr ||
      !dimension->HasQuadraticCostSoftSpanUpperBounds()) {
    return 0;
  }
  return dimension->GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle).cost;
}

}  // extern "C"
