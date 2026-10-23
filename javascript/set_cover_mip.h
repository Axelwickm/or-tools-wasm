#ifndef ORTOOLS_WASM_SET_COVER_MIP_H_
#define ORTOOLS_WASM_SET_COVER_MIP_H_

#include <cmath>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>
#include "ortools/set_cover/set_cover_mip.h"

namespace ortools_wasm {
struct SetCoverMipResult {
  bool next_solution;
  int subproblem_status;
  std::optional<double> objective_value;
  double run_time_seconds;
  double run_time_microseconds;
};

inline SetCoverMipResult RunSetCoverMip(
    operations_research::SetCoverInvariant& invariant, bool relaxation,
    absl::Span<const operations_research::SubsetIndex> focus, bool has_focus,
    double time_limit_seconds,
    operations_research::SetCoverMip::SolveFunction solve = {}) {
  if (!std::isfinite(time_limit_seconds) || time_limit_seconds < 0 ||
      time_limit_seconds * 1000 >= 9223372036854775808.0)
    throw std::invalid_argument("Set Cover MIP time limit must be finite non-negative seconds representable as int64 milliseconds.");
  const auto backend = relaxation ? operations_research::MPSolver::GLOP_LINEAR_PROGRAMMING
                                  : operations_research::MPSolver::SCIP_MIXED_INTEGER_PROGRAMMING;
  if (!operations_research::MPSolver::SupportsProblemType(backend))
    throw std::invalid_argument("Requested native Set Cover MIP backend is unavailable in this build.");
  const auto& model = *invariant.model();
  std::vector<bool> seen(model.num_subsets(), false);
  for (const auto index : focus) {
    if (index.value() < 0 || index.value() >= model.num_subsets() || seen[index.value()])
      throw std::invalid_argument("Set Cover MIP focus must contain distinct valid subset indices.");
    seen[index.value()] = true;
  }
  invariant.Recompute(operations_research::SetCoverInvariant::ConsistencyLevel::kCostAndCoverage);
  operations_research::SetCoverMip generator(&invariant);
  generator.UseMipSolver(relaxation ? operations_research::SetCoverMipSolver::GLOP : operations_research::SetCoverMipSolver::SCIP);
  generator.UseIntegers(!relaxation);
  generator.UseSolveFunction(std::move(solve));
  // Native MPSolver uses zero milliseconds for an unlimited solve. Do not pass
  // the generator's default infinity through its floating-to-int64 conversion.
  generator.SetTimeLimitInSeconds(time_limit_seconds);
  const bool next = has_focus ? generator.NextSolution(focus) : generator.NextSolution();
  invariant.Recompute(operations_research::SetCoverInvariant::ConsistencyLevel::kFreeAndUncovered);
  return {next, static_cast<int>(generator.solve_status()),
    invariant.is_cost_consistent() ? std::nullopt : std::optional<double>(invariant.CostOrLowerBound()),
    generator.run_time_in_seconds(), static_cast<double>(generator.run_time_in_microseconds())};
}
}  // namespace ortools_wasm
#endif
