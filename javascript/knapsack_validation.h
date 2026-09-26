#ifndef ORTOOLS_WASM_KNAPSACK_VALIDATION_H_
#define ORTOOLS_WASM_KNAPSACK_VALIDATION_H_

#include "ortools/algorithms/knapsack_solver.h"

namespace ortools_wasm {

// Validate before construction/Init: upstream uses fatal CHECKs for these limits.
// Shared by WASM and the server; callers may bypass the TypeScript API.
inline const char* ValidateKnapsackShape(int type, int items, int dimensions) {
  using operations_research::KnapsackSolver;
  if (items <= 0 || dimensions <= 0) return "Knapsack profits and weights must not be empty.";
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

}  // namespace ortools_wasm
#endif
