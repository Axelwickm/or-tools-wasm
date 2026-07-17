#include "server/src/knapsack_executor.h"

#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "knapsack.pb.h"
#include "ortools/algorithms/knapsack_solver.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::KnapsackSolver;

SolverExecutorResult Error(std::string message) {
  SolverExecutorResult result;
  result.ok = false;
  result.error_message = std::move(message);
  result.failure_kind = SolverExecutionFailureKind::kInvalidRequest;
  return result;
}

bool ToInt64(double value, int64_t* result) {
  constexpr double kMaxSafeInteger = 9007199254740991.0;
  if (!std::isfinite(value) || std::trunc(value) != value ||
      value < -kMaxSafeInteger || value > kMaxSafeInteger) {
    return false;
  }
  *result = static_cast<int64_t>(value);
  return true;
}

template <typename Repeated>
bool CopyIntegers(const Repeated& values, std::vector<int64_t>* result) {
  result->reserve(values.size());
  for (double value : values) {
    int64_t integer;
    if (!ToInt64(value, &integer)) return false;
    result->push_back(integer);
  }
  return true;
}

bool KnownSolverType(int solver_type) {
  switch (solver_type) {
    case KnapsackSolver::KNAPSACK_BRUTE_FORCE_SOLVER:
    case KnapsackSolver::KNAPSACK_64ITEMS_SOLVER:
    case KnapsackSolver::KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_DIVIDE_AND_CONQUER_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER:
      return true;
    default:
      return false;
  }
}

SolverExecutorResult Solve(const bridge::KnapsackBridgeRequest& request,
                           const JobContext& context) {
  if (!KnownSolverType(request.solver_type())) return Error("Unknown Knapsack solver type.");
  if (request.profits().empty() || request.weights().empty()) {
    return Error("Knapsack profits and weights must not be empty.");
  }
  if (request.weights_size() != request.capacities_size()) {
    return Error("Knapsack weights dimensions must match capacities.");
  }
  if (!std::isfinite(request.time_limit_seconds()) || request.time_limit_seconds() < 0) {
    return Error("Knapsack time limit must be finite and non-negative.");
  }

  std::vector<int64_t> profits;
  if (!CopyIntegers(request.profits(), &profits)) return Error("Knapsack profits must be integers.");
  std::vector<int64_t> capacities;
  if (!CopyIntegers(request.capacities(), &capacities)) return Error("Knapsack capacities must be integers.");
  std::vector<std::vector<int64_t>> weights;
  weights.reserve(request.weights_size());
  for (const auto& dimension : request.weights()) {
    if (dimension.values_size() != profits.size()) {
      return Error("Each Knapsack weight dimension must match the number of profits.");
    }
    std::vector<int64_t> values;
    if (!CopyIntegers(dimension.values(), &values)) return Error("Knapsack weights must be integers.");
    weights.push_back(std::move(values));
  }
  if (context.cancellation_requested()) {
    SolverExecutorResult result = Error("Knapsack solve was cancelled before it started.");
    result.failure_kind = SolverExecutionFailureKind::kCancelled;
    return result;
  }

  KnapsackSolver solver(
      static_cast<KnapsackSolver::SolverType>(request.solver_type()), request.name());
  solver.set_use_reduction(request.use_reduction());
  if (request.time_limit_seconds() > 0) solver.set_time_limit(request.time_limit_seconds());
  solver.Init(profits, weights, capacities);
  const int64_t profit = solver.Solve();

  bridge::KnapsackBridgeResponse response;
  response.set_profit(static_cast<double>(profit));
  response.set_optimal(solver.IsSolutionOptimal());
  for (int item = 0; item < profits.size(); ++item) {
    response.add_contains(solver.BestSolutionContains(item));
  }
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize Knapsack response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

}  // namespace

std::string KnapsackExecutor::solver() const { return "knapsack"; }

int KnapsackExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                       int client_requested_threads,
                                       int server_total_threads) const {
  bridge::KnapsackBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) {
    throw std::invalid_argument("Failed to parse Knapsack bridge request.");
  }
  if (client_requested_threads != 0 && client_requested_threads != 1) {
    throw std::invalid_argument("Knapsack jobs require exactly one thread.");
  }
  if (server_total_threads < 1) throw std::invalid_argument("Server has no Knapsack capacity.");
  return 1;
}

SolverExecutorResult KnapsackExecutor::Execute(const SolverExecutorRequest& request,
                                               const JobContext& context,
                                               const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::KnapsackBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse Knapsack bridge request.");
  return Solve(parsed, context);
}

}  // namespace ortools_wasm::server
