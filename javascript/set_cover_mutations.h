#ifndef ORTOOLS_WASM_SET_COVER_MUTATIONS_H_
#define ORTOOLS_WASM_SET_COVER_MUTATIONS_H_

#include <stdexcept>
#include <vector>

#include "absl/types/span.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"

namespace ortools_wasm {

enum class SetCoverMutation { kClearRandom, kClearMostCovered, kUpdateSelection };

struct SetCoverMutationResult {
  std::vector<operations_research::SubsetIndex> focus;
  bool changed = false;
  std::vector<operations_research::SubsetIndex> newly_removable;
  std::vector<operations_research::SubsetIndex> newly_non_removable;
};

inline SetCoverMutationResult MutateSetCover(
    operations_research::SetCoverInvariant& invariant, SetCoverMutation operation,
    int count, absl::Span<const operations_research::SubsetIndex> focus,
    bool has_focus, int subset, bool selected) {
  using operations_research::SetCoverInvariant;
  using operations_research::SubsetIndex;
  const int size = invariant.model()->num_subsets();
  if (count < 0) throw std::invalid_argument("Set Cover perturbation count must be nonnegative.");
  for (const auto index : focus) {
    if (index.value() < 0 || index.value() >= size) throw std::invalid_argument("Invalid Set Cover focus index.");
  }
  SetCoverMutationResult result;
  if (operation == SetCoverMutation::kUpdateSelection) {
    if (subset < 0 || subset >= size) throw std::invalid_argument("Invalid Set Cover subset index.");
    invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kRedundancy);
    invariant.ClearRemovabilityInformation();
    result.changed = selected ? invariant.Select(SubsetIndex(subset), SetCoverInvariant::ConsistencyLevel::kRedundancy)
                              : invariant.Deselect(SubsetIndex(subset), SetCoverInvariant::ConsistencyLevel::kRedundancy);
    result.newly_removable = invariant.newly_removable_subsets();
    result.newly_non_removable = invariant.newly_non_removable_subsets();
  } else if (operation == SetCoverMutation::kClearRandom) {
    result.focus = has_focus ? operations_research::ClearRandomSubsets(focus, count, &invariant)
                             : operations_research::ClearRandomSubsets(count, &invariant);
  } else if (operation == SetCoverMutation::kClearMostCovered) {
    result.focus = has_focus ? operations_research::ClearMostCoveredElements(focus, count, &invariant)
                             : operations_research::ClearMostCoveredElements(count, &invariant);
  } else {
    throw std::invalid_argument("Invalid Set Cover mutation.");
  }
  return result;
}

}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_SET_COVER_MUTATIONS_H_
