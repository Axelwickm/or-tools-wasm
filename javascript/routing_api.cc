// Minimal C API surface for routing over WASM.
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "ortools/constraint_solver/routing_parameters.pb.h"

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

struct RoutingModelHandle {
  int manager_handle = 0;
  std::unique_ptr<RoutingModel> model;
  const Assignment* assignment = nullptr;
  std::vector<std::vector<int64_t>> transit_matrices;
};

int g_next_manager_handle = 1;
int g_next_model_handle = 1;
std::unordered_map<int, std::unique_ptr<RoutingIndexManager>> g_managers;
std::unordered_map<int, RoutingModelHandle> g_models;

RoutingIndexManager* GetManager(int handle) {
  const auto it = g_managers.find(handle);
  return it == g_managers.end() ? nullptr : it->second.get();
}

RoutingModelHandle* GetModel(int handle) {
  const auto it = g_models.find(handle);
  return it == g_models.end() ? nullptr : &it->second;
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

RoutingSearchParameters BuildSearchParameters(int first_solution_strategy,
                                              int solution_limit) {
  RoutingSearchParameters parameters = DefaultRoutingSearchParameters();
  if (first_solution_strategy > 0) {
    parameters.set_first_solution_strategy(
        static_cast<FirstSolutionStrategy::Value>(first_solution_strategy));
  }
  if (solution_limit > 0) {
    parameters.set_solution_limit(solution_limit);
  }
  return parameters;
}

EM_JS(int64_t, CallRoutingTransitCallback,
      (int callback_id, int64_t from_index, int64_t to_index), {
  const callbacks = Module.__routingTransitCallbacks;
  const callback = callbacks && callbacks.get(callback_id);
  if (typeof callback !== 'function') {
    throw new Error(`Routing transit callback ${callback_id} is not registered.`);
  }
  return BigInt(callback(Number(from_index), Number(to_index)));
});

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int routing_create_index_manager(int num_locations,
                                                      int num_vehicles,
                                                      int depot) {
  const int handle = g_next_manager_handle++;
  g_managers.emplace(
      handle, std::make_unique<RoutingIndexManager>(
                  num_locations, num_vehicles, RoutingNodeIndex(depot)));
  return handle;
}

EMSCRIPTEN_KEEPALIVE int routing_create_index_manager_starts_ends(
    int num_locations, int num_vehicles, const int* starts, const int* ends) {
  if (starts == nullptr || ends == nullptr || num_vehicles <= 0) return 0;
  std::vector<RoutingNodeIndex> start_nodes;
  std::vector<RoutingNodeIndex> end_nodes;
  start_nodes.reserve(num_vehicles);
  end_nodes.reserve(num_vehicles);
  for (int i = 0; i < num_vehicles; ++i) {
    start_nodes.push_back(RoutingNodeIndex(starts[i]));
    end_nodes.push_back(RoutingNodeIndex(ends[i]));
  }

  const int handle = g_next_manager_handle++;
  g_managers.emplace(handle, std::make_unique<RoutingIndexManager>(
                                 num_locations, num_vehicles, start_nodes,
                                 end_nodes));
  return handle;
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

EMSCRIPTEN_KEEPALIVE int routing_create_model(int manager_handle) {
  RoutingIndexManager* manager = GetManager(manager_handle);
  if (manager == nullptr) return 0;

  const int handle = g_next_model_handle++;
  RoutingModelHandle model_handle;
  model_handle.manager_handle = manager_handle;
  model_handle.model = std::make_unique<RoutingModel>(*manager);
  g_models.emplace(handle, std::move(model_handle));
  return handle;
}

EMSCRIPTEN_KEEPALIVE void routing_delete_model(int model_handle) {
  g_models.erase(model_handle);
}

EMSCRIPTEN_KEEPALIVE int routing_register_matrix_transit_callback(
    int model_handle, const int64_t* values, int value_count, int dimension) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || values == nullptr || dimension <= 0 ||
      value_count != dimension * dimension) {
    return -1;
  }

  handle->transit_matrices.emplace_back(values, values + value_count);
  const int matrix_index = handle->transit_matrices.size() - 1;
  return handle->model->RegisterTransitCallback(
      [handle, matrix_index, dimension](int64_t from_index, int64_t to_index) {
        const std::vector<int64_t>& matrix =
            handle->transit_matrices[matrix_index];
        if (from_index < 0 || to_index < 0 || from_index >= dimension ||
            to_index >= dimension) {
          return int64_t{0};
        }
        return matrix[from_index * dimension + to_index];
      });
}

EMSCRIPTEN_KEEPALIVE int routing_register_transit_callback(int model_handle,
                                                           int callback_id) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return -1;
  return handle->model->RegisterTransitCallback(
      [callback_id](int64_t from_index, int64_t to_index) {
        return CallRoutingTransitCallback(callback_id, from_index, to_index);
      });
}

EMSCRIPTEN_KEEPALIVE int routing_add_dimension(int model_handle,
                                               int evaluator_index,
                                               int64_t slack_max,
                                               int64_t capacity,
                                               int fix_start_cumul_to_zero,
                                               const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return 0;
  return handle->model
             ->AddDimension(evaluator_index, slack_max, capacity,
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
  return handle->model
             ->AddDimensionWithVehicleCapacity(
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
  return handle->model
             ->AddDimensionWithVehicleTransits(
                 CopyInts(evaluator_indices, evaluator_count), slack_max, capacity,
                 fix_start_cumul_to_zero != 0, name)
         ? 1
         : 0;
}

EMSCRIPTEN_KEEPALIVE int routing_add_constant_dimension(
    int model_handle, int64_t value, int64_t capacity,
    int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->model->AddConstantDimension(
      value, capacity, fix_start_cumul_to_zero != 0, name);
  return created ? evaluator_index : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_add_vector_dimension(
    int model_handle, const int64_t* values, int value_count, int64_t capacity,
    int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->model->AddVectorDimension(
      CopyInt64s(values, value_count), capacity, fix_start_cumul_to_zero != 0,
      name);
  return created ? evaluator_index : -1;
}

EMSCRIPTEN_KEEPALIVE int routing_add_matrix_dimension(
    int model_handle, const int64_t* values, int value_count, int dimension,
    int64_t capacity, int fix_start_cumul_to_zero, const char* name) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || name == nullptr) return -1;
  const auto [evaluator_index, created] = handle->model->AddMatrixDimension(
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

EMSCRIPTEN_KEEPALIVE int routing_add_disjunction(int model_handle,
                                                 const int64_t* indices,
                                                 int index_count,
                                                 int64_t penalty,
                                                 int has_penalty) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || indices == nullptr || index_count <= 0) return -1;
  const std::vector<int64_t> values(indices, indices + index_count);
  if (has_penalty) {
    return handle->model->AddDisjunction(values, penalty).value();
  }
  return handle->model->AddDisjunction(values).value();
}

EMSCRIPTEN_KEEPALIVE void routing_set_arc_cost_evaluator_of_all_vehicles(
    int model_handle, int evaluator_index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->model->SetArcCostEvaluatorOfAllVehicles(evaluator_index);
}

EMSCRIPTEN_KEEPALIVE int routing_status(int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->status();
}

EMSCRIPTEN_KEEPALIVE int routing_solve_with_parameters_ext(
    int model_handle, int first_solution_strategy, int solution_limit);

EMSCRIPTEN_KEEPALIVE int routing_solve_with_parameters(
    int model_handle, int first_solution_strategy) {
  return routing_solve_with_parameters_ext(model_handle, first_solution_strategy,
                                           0);
}

EMSCRIPTEN_KEEPALIVE int routing_solve_with_parameters_ext(
    int model_handle, int first_solution_strategy, int solution_limit) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;

  RoutingSearchParameters parameters =
      BuildSearchParameters(first_solution_strategy, solution_limit);
  handle->assignment = handle->model->SolveWithParameters(parameters);
  return handle->assignment == nullptr ? 0 : 1;
}

EMSCRIPTEN_KEEPALIVE void routing_close_model_with_parameters(
    int model_handle, int first_solution_strategy, int solution_limit) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->model->CloseModelWithParameters(
      BuildSearchParameters(first_solution_strategy, solution_limit));
}

EMSCRIPTEN_KEEPALIVE int64_t routing_get_number_of_decisions_in_first_solution(
    int model_handle, int first_solution_strategy, int solution_limit) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetNumberOfDecisionsInFirstSolution(
      BuildSearchParameters(first_solution_strategy, solution_limit));
}

EMSCRIPTEN_KEEPALIVE int64_t routing_get_number_of_rejects_in_first_solution(
    int model_handle, int first_solution_strategy, int solution_limit) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetNumberOfRejectsInFirstSolution(
      BuildSearchParameters(first_solution_strategy, solution_limit));
}

EMSCRIPTEN_KEEPALIVE int routing_solve_from_assignment_with_parameters(
    int model_handle, int first_solution_strategy, int solution_limit) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr || handle->assignment == nullptr) return 0;
  RoutingSearchParameters parameters =
      BuildSearchParameters(first_solution_strategy, solution_limit);
  handle->assignment = handle->model->SolveFromAssignmentWithParameters(
      handle->assignment, parameters);
  return handle->assignment == nullptr ? 0 : 1;
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

EMSCRIPTEN_KEEPALIVE int routing_get_automatic_first_solution_strategy(
    int model_handle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetAutomaticFirstSolutionStrategy();
}

EMSCRIPTEN_KEEPALIVE void routing_add_pickup_and_delivery(
    int model_handle, int64_t pickup, int64_t delivery) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return;
  handle->model->AddPickupAndDelivery(pickup, delivery);
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

EMSCRIPTEN_KEEPALIVE int64_t routing_get_arc_cost_for_vehicle(
    int model_handle, int64_t from_index, int64_t to_index, int vehicle) {
  RoutingModelHandle* handle = GetModel(model_handle);
  if (handle == nullptr) return 0;
  return handle->model->GetArcCostForVehicle(from_index, to_index, vehicle);
}

EMSCRIPTEN_KEEPALIVE int64_t routing_assignment_dimension_cumul_value(
    int model_handle, const char* dimension_name, int64_t index) {
  RoutingModelHandle* handle = GetModel(model_handle);
  RoutingDimension* dimension = GetDimension(handle, dimension_name);
  if (handle == nullptr || handle->assignment == nullptr ||
      dimension == nullptr) {
    return 0;
  }
  return handle->assignment->Value(dimension->CumulVar(index));
}

EMSCRIPTEN_KEEPALIVE int routing_dimension_has_soft_span_upper_bounds(
    int model_handle, const char* dimension_name) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr) return 0;
  return dimension->HasSoftSpanUpperBounds() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void routing_dimension_set_soft_span_upper_bound(
    int model_handle, const char* dimension_name, int64_t bound, int64_t cost,
    int vehicle) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr) return;
  dimension->SetSoftSpanUpperBoundForVehicle(BoundCost(bound, cost), vehicle);
}

EMSCRIPTEN_KEEPALIVE int64_t routing_dimension_get_soft_span_upper_bound_bound(
    int model_handle, const char* dimension_name, int vehicle) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr || !dimension->HasSoftSpanUpperBounds()) return 0;
  return dimension->GetSoftSpanUpperBoundForVehicle(vehicle).bound;
}

EMSCRIPTEN_KEEPALIVE int64_t routing_dimension_get_soft_span_upper_bound_cost(
    int model_handle, const char* dimension_name, int vehicle) {
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

EMSCRIPTEN_KEEPALIVE void routing_dimension_set_quadratic_cost_soft_span_upper_bound(
    int model_handle, const char* dimension_name, int64_t bound, int64_t cost,
    int vehicle) {
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr) return;
  dimension->SetQuadraticCostSoftSpanUpperBoundForVehicle(BoundCost(bound, cost), vehicle);
}

EMSCRIPTEN_KEEPALIVE int64_t
routing_dimension_get_quadratic_cost_soft_span_upper_bound_bound(
    int model_handle, const char* dimension_name, int vehicle) {
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
  RoutingDimension* dimension = GetDimension(GetModel(model_handle), dimension_name);
  if (dimension == nullptr ||
      !dimension->HasQuadraticCostSoftSpanUpperBounds()) {
    return 0;
  }
  return dimension->GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle).cost;
}

}  // extern "C"
