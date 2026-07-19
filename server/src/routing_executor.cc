#include "server/src/routing_executor.h"

#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_index_manager.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "routing.pb.h"

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::Assignment;
using ::operations_research::DefaultRoutingSearchParameters;
using ::operations_research::FirstSolutionStrategy;
using ::operations_research::RoutingIndexManager;
using ::operations_research::RoutingModel;
using ::operations_research::RoutingSearchParameters;

SolverExecutorResult Error(std::string message) {
  return SolverExecutorResult{false, {}, std::move(message),
                              SolverExecutionFailureKind::kInvalidRequest};
}

std::vector<int64_t> Values(const google::protobuf::RepeatedField<int64_t>& values) {
  return {values.begin(), values.end()};
}

bool Matrix(const bridge::RoutingMatrix& input,
            std::vector<std::vector<int64_t>>* output) {
  const int dimension = input.dimension();
  if (dimension <= 0 || input.values_size() != dimension * dimension) return false;
  output->assign(dimension, std::vector<int64_t>(dimension));
  for (int row = 0; row < dimension; ++row) {
    for (int column = 0; column < dimension; ++column) {
      (*output)[row][column] = input.values(row * dimension + column);
    }
  }
  return true;
}

int RegisterMatrix(RoutingModel* model, const bridge::RoutingMatrix& input) {
  std::vector<std::vector<int64_t>> matrix;
  if (!Matrix(input, &matrix)) throw std::invalid_argument("Routing matrix dimensions do not match its values.");
  return model->RegisterTransitMatrix(std::move(matrix));
}

void ApplyOperation(RoutingModel* model, const bridge::RoutingModelOperation& operation) {
  switch (operation.operation_case()) {
    case bridge::RoutingModelOperation::kAddDimension: {
      const auto& value = operation.add_dimension();
      if (!model->AddDimension(RegisterMatrix(model, value.transit_matrix()), value.slack_max(),
                               value.capacity(), value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleCapacity: {
      const auto& value = operation.add_dimension_with_vehicle_capacity();
      if (!model->AddDimensionWithVehicleCapacity(
              RegisterMatrix(model, value.transit_matrix()), value.slack_max(), Values(value.capacities()),
              value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDimensionWithVehicleTransits: {
      const auto& value = operation.add_dimension_with_vehicle_transits();
      std::vector<int> evaluators;
      evaluators.reserve(value.transit_matrices_size());
      for (const auto& matrix : value.transit_matrices()) evaluators.push_back(RegisterMatrix(model, matrix));
      if (!model->AddDimensionWithVehicleTransits(evaluators, value.slack_max(), value.capacity(),
                                                  value.fix_start_cumul_to_zero(), value.name())) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddConstantDimension: {
      const auto& value = operation.add_constant_dimension();
      if (!model->AddConstantDimension(value.value(), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddVectorDimension: {
      const auto& value = operation.add_vector_dimension();
      if (!model->AddVectorDimension(Values(value.values()), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddMatrixDimension: {
      const auto& value = operation.add_matrix_dimension();
      std::vector<std::vector<int64_t>> matrix;
      if (!Matrix(value.matrix(), &matrix)) throw std::invalid_argument("Routing dimension matrix is invalid.");
      if (!model->AddMatrixDimension(std::move(matrix), value.capacity(), value.fix_start_cumul_to_zero(), value.name()).second) {
        throw std::invalid_argument("Routing dimension already exists: " + value.name());
      }
      return;
    }
    case bridge::RoutingModelOperation::kAddDisjunction: {
      const auto& value = operation.add_disjunction();
      const auto indices = Values(value.indices());
      if (indices.empty()) throw std::invalid_argument("Routing disjunction cannot be empty.");
      if (value.has_penalty()) model->AddDisjunction(indices, value.penalty());
      else model->AddDisjunction(indices);
      return;
    }
    case bridge::RoutingModelOperation::kAddPickupAndDelivery:
      model->AddPickupAndDelivery(operation.add_pickup_and_delivery().pickup(),
                                  operation.add_pickup_and_delivery().delivery());
      return;
    case bridge::RoutingModelOperation::OPERATION_NOT_SET:
      throw std::invalid_argument("Routing model operation is empty.");
  }
}

SolverExecutorResult Serialize(const bridge::RoutingBridgeResponse& response) {
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize Routing response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

}  // namespace

std::string RoutingExecutor::solver() const { return "routing"; }

int RoutingExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                      int client_requested_threads,
                                      int server_total_threads) const {
  bridge::RoutingBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) throw std::invalid_argument("Failed to parse Routing bridge request.");
  if (client_requested_threads != 0 && client_requested_threads != 1) throw std::invalid_argument("Routing jobs require exactly one thread.");
  if (server_total_threads < 1) throw std::invalid_argument("Server has no Routing capacity.");
  return 1;
}

SolverExecutorResult RoutingExecutor::Execute(const SolverExecutorRequest& request,
                                              const JobContext& context,
                                              const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::RoutingBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse Routing bridge request.");
  if (parsed.num_locations() <= 0 || parsed.num_vehicles() <= 0 ||
      parsed.starts_size() != parsed.num_vehicles() || parsed.ends_size() != parsed.num_vehicles() ||
      !parsed.has_transit_matrix()) return Error("Routing request dimensions are invalid.");
  if (context.cancellation_requested()) {
    auto result = Error("Routing solve was cancelled before it started.");
    result.failure_kind = SolverExecutionFailureKind::kCancelled;
    return result;
  }

  try {
    std::vector<RoutingIndexManager::NodeIndex> starts;
    std::vector<RoutingIndexManager::NodeIndex> ends;
    for (int value : parsed.starts()) starts.push_back(RoutingIndexManager::NodeIndex(value));
    for (int value : parsed.ends()) ends.push_back(RoutingIndexManager::NodeIndex(value));
    RoutingIndexManager manager(parsed.num_locations(), parsed.num_vehicles(), starts, ends);
    RoutingModel model(manager);
    model.SetArcCostEvaluatorOfAllVehicles(RegisterMatrix(&model, parsed.transit_matrix()));
    for (const auto& operation : parsed.operations()) ApplyOperation(&model, operation);

    auto cancellation = context.OnCancellation([&model] { model.solver()->FinishCurrentSearch(); });
    RoutingSearchParameters parameters = DefaultRoutingSearchParameters();
    if (parsed.first_solution_strategy() > 0) {
      parameters.set_first_solution_strategy(static_cast<FirstSolutionStrategy::Value>(parsed.first_solution_strategy()));
    }
    if (parsed.solution_limit() > 0) parameters.set_solution_limit(parsed.solution_limit());
    const Assignment* assignment = model.SolveWithParameters(parameters);
    if (context.cancellation_requested()) {
      auto result = Error("Routing solve was cancelled.");
      result.failure_kind = SolverExecutionFailureKind::kCancelled;
      return result;
    }

    bridge::RoutingBridgeResponse response;
    response.set_status(model.status());
    if (assignment == nullptr) return Serialize(response);
    response.set_has_solution(true);
    response.set_objective_value(assignment->ObjectiveValue());
    for (int index = 0; index < manager.num_indices(); ++index) response.add_next_values(index);
    for (int vehicle = 0; vehicle < parsed.num_vehicles(); ++vehicle) {
      int64_t index = model.Start(vehicle);
      response.add_starts(index);
      while (!model.IsEnd(index)) {
        const int64_t next = assignment->Value(model.NextVar(index));
        response.set_next_values(index, next);
        index = next;
      }
      response.add_ends(index);
    }
    for (const std::string& name : parsed.dimension_names()) {
      if (!model.HasDimension(name)) return Error("Routing response requested an unknown dimension: " + name);
      auto* values = response.add_dimensions();
      values->set_name(name);
      const auto& dimension = model.GetDimensionOrDie(name);
      for (int index = 0; index < manager.num_indices(); ++index) values->add_cumul_values(assignment->Value(dimension.CumulVar(index)));
    }
    return Serialize(response);
  } catch (const std::invalid_argument& error) {
    return Error(error.what());
  } catch (const std::exception& error) {
    return SolverExecutorResult{false, {}, error.what(), SolverExecutionFailureKind::kInternal};
  }
}

}  // namespace ortools_wasm::server
