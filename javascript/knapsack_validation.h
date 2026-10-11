#ifndef ORTOOLS_WASM_KNAPSACK_VALIDATION_H_
#define ORTOOLS_WASM_KNAPSACK_VALIDATION_H_

#include <cstdint>
#include <limits>
#include <vector>

#include "ortools/algorithms/knapsack_solver.h"
#include "ortools/linear_solver/linear_solver.h"

namespace ortools_wasm {

inline const char* ValidateKnapsackWorkers(int type, int workers) {
  if (workers < 1) return "Knapsack numWorkers must be positive.";
  if (workers > 1 && type != operations_research::KnapsackSolver::KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER) {
    return "Only CP-SAT Knapsack supports multiple workers.";
  }
  return nullptr;
}

// Validate before construction/Init: upstream uses fatal CHECKs for these limits.
// Shared by WASM and the server; callers may bypass the TypeScript API.
inline const char* ValidateKnapsackShape(int type, int items, int dimensions) {
  using operations_research::KnapsackSolver;
  using operations_research::MPSolver;
  if (items < 0 || dimensions <= 0) return "Knapsack requires non-negative item count and at least one weight dimension.";
  // The native MIP adapter constructs MPSolver directly, which fatally checks
  // that its interface is linked. Query native support before reaching it.
  switch (type) {
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER:
      if (!MPSolver::SupportsProblemType(MPSolver::CBC_MIXED_INTEGER_PROGRAMMING)) return "Knapsack CBC backend is not available.";
      break;
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER:
      if (!MPSolver::SupportsProblemType(MPSolver::SCIP_MIXED_INTEGER_PROGRAMMING)) return "Knapsack SCIP backend is not available.";
      break;
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER:
      if (!MPSolver::SupportsProblemType(MPSolver::XPRESS_MIXED_INTEGER_PROGRAMMING)) return "Knapsack XPRESS backend is not available.";
      break;
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER:
      if (!MPSolver::SupportsProblemType(MPSolver::CPLEX_MIXED_INTEGER_PROGRAMMING)) return "Knapsack CPLEX backend is not available.";
      break;
  }
  switch (type) {
    case KnapsackSolver::KNAPSACK_BRUTE_FORCE_SOLVER:
      if (items > 30) return "This Knapsack solver supports at most 30 items.";
      break;
    case KnapsackSolver::KNAPSACK_64ITEMS_SOLVER:
      if (items > 64) return "This Knapsack solver supports at most 64 items.";
      break;
    case KnapsackSolver::KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER:
    case KnapsackSolver::KNAPSACK_DIVIDE_AND_CONQUER_SOLVER:
      break;
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER:
    case KnapsackSolver::KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER:
      return nullptr;
    default:
      return "Unknown Knapsack solver type.";
  }
  return dimensions == 1 ? nullptr : "This Knapsack solver requires exactly one weight dimension.";
}

// Native reduction/search sums use unchecked signed int64 arithmetic; negative
// weights also become array indices in the dynamic-programming algorithms.
inline const char* ValidateKnapsackInput(
    int type, const std::vector<int64_t>& profits,
    const std::vector<std::vector<int64_t>>& weights,
    const std::vector<int64_t>& capacities, bool use_reduction) {
  using operations_research::KnapsackSolver;
  constexpr int64_t maximum = std::numeric_limits<int64_t>::max();
  const auto valid_sum = [](const std::vector<int64_t>& values) {
    int64_t sum = 0;
    for (const int64_t value : values) {
      if (value < 0 || value > maximum - sum) return false;
      sum += value;
    }
    return true;
  };
  if (!valid_sum(profits)) return "Knapsack profits must be nonnegative and their sum must fit int64.";
  for (const auto& dimension : weights) {
    if (!valid_sum(dimension)) return "Knapsack weights must be nonnegative and each dimension's sum must fit int64.";
  }
  for (const int64_t capacity : capacities) {
    if (capacity < 0) return "Knapsack capacities must be nonnegative.";
    if ((type == KnapsackSolver::KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER ||
         type == KnapsackSolver::KNAPSACK_DIVIDE_AND_CONQUER_SOLVER) && capacity == maximum) {
      return "This Knapsack solver requires capacity below INT64_MAX (capacity + 1 must fit int64).";
    }
  }
  if (type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER) {
    for (const int64_t profit : profits) {
      if (profit == maximum) return "Branch-and-bound Knapsack requires profits below INT64_MAX (profit + 1 must fit int64).";
    }
  }
  // MIP and CP-SAT Knapsack adapters return a double objective as int64_t.
  if (type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER ||
      type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER ||
      type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER ||
      type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER ||
      type == KnapsackSolver::KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER) {
    int64_t total = 0;
    for (const int64_t profit : profits) total += profit;
    if (static_cast<double>(total) >= 9223372036854775808.0) {
      return "This Knapsack backend's floating-point objective must remain below 2^63.";
    }
  }
  if (type == KnapsackSolver::KNAPSACK_64ITEMS_SOLVER && profits.empty() && !use_reduction) {
    return "The 64-item Knapsack solver requires reduction for an empty problem.";
  }
  return nullptr;
}

}  // namespace ortools_wasm
#endif
