#ifndef ORTOOLS_WASM_SET_COVER_LAGRANGIAN_H_
#define ORTOOLS_WASM_SET_COVER_LAGRANGIAN_H_
#include <cmath>
#include <stdexcept>
#include "ortools/set_cover/set_cover_lagrangian.h"
namespace ortools_wasm {
inline auto ComputeSetCoverLagrangianBound(operations_research::SetCoverModel& model, double upper_bound) {
  if (!std::isfinite(upper_bound) || upper_bound < 0)
    throw std::invalid_argument("Set Cover upper bound must be finite and non-negative.");
  for (const double cost : model.subset_costs())
    if (cost < 0) throw std::invalid_argument("Set Cover Lagrangian bounds require non-negative costs.");
  if (model.num_elements() == 0 || model.num_subsets() == 0)
    throw std::invalid_argument("Set Cover Lagrangian bounds require a nonempty model.");
  for (const auto element : model.ElementRange())
    if (model.rows()[element].empty())
      throw std::invalid_argument("Set Cover Lagrangian bounds require a coverable model.");
  operations_research::SetCoverInvariant invariant(&model);
  operations_research::SetCoverLagrangian lagrangian(&invariant);
  lagrangian.UseNumThreads(1);
  return lagrangian.ComputeLowerBound(model.subset_costs(), upper_bound);
}
}  // namespace ortools_wasm
#endif
