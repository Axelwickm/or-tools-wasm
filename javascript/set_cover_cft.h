#ifndef ORTOOLS_WASM_SET_COVER_CFT_H_
#define ORTOOLS_WASM_SET_COVER_CFT_H_
#include <cmath>
#include <stdexcept>
#include <utility>
#include <vector>
#include "ortools/set_cover/set_cover_cft.h"
#include "ortools/set_cover/set_cover_invariant.h"
namespace ortools_wasm {
struct SetCoverCftSnapshot {
  operations_research::scp::PrimalDualState state;
  operations_research::SubsetBoolVector selected;
  int uncovered;
};
inline SetCoverCftSnapshot RunSetCoverCft(operations_research::SetCoverModel& model,
    const operations_research::SubsetBoolVector* initial_selection = nullptr) {
  using namespace operations_research;
  if (model.num_elements() == 0 || model.num_subsets() == 0)
    throw std::invalid_argument("Set Cover CFT requires a nonempty model.");
  for (double cost : model.subset_costs())
    if (!std::isfinite(cost) || cost < 0)
      throw std::invalid_argument("Set Cover CFT requires finite non-negative costs.");
  for (const auto subset : model.SubsetRange())
    if (model.columns()[subset].empty())
      throw std::invalid_argument("Set Cover CFT requires nonempty subsets.");
  for (const auto element : model.ElementRange())
    if (model.rows()[element].empty())
      throw std::invalid_argument("Set Cover CFT requires a coverable model.");
  // Identity submodel: the first dual state and returned subset IDs refer to
  // the entire input model, even after native column fixing during search.
  scp::SubModel submodel(&model);
  scp::Solution initial_solution;
  if (initial_selection) {
    if (initial_selection->size() != model.num_subsets())
      throw std::invalid_argument("Set Cover CFT initial selection dimensions do not match.");
    SetCoverInvariant initial(&model);
    initial.LoadSolution(*initial_selection);
    initial.Recompute(SetCoverInvariant::ConsistencyLevel::kFreeAndUncovered);
    if (initial.num_uncovered_elements() != 0)
      throw std::invalid_argument("Set Cover CFT initial selection must be a complete cover.");
    std::vector<SubsetIndex> subsets;
    for (auto subset : model.SubsetRange()) if ((*initial_selection)[subset]) subsets.push_back(subset);
    initial_solution = scp::Solution(submodel, subsets);
  }
  auto state = scp::RunCftHeuristic(submodel, initial_solution);
  SubsetBoolVector selected(model.num_subsets(), false);
  for (const auto subset : state.solution.subsets()) selected[SubsetIndex(subset.value())] = true;
  SetCoverInvariant invariant(&model);
  invariant.LoadSolution(selected);
  invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kFreeAndUncovered);
  return {std::move(state), std::move(selected), invariant.num_uncovered_elements()};
}
}  // namespace ortools_wasm
#endif
