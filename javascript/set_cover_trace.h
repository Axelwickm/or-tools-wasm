#ifndef ORTOOLS_WASM_SET_COVER_TRACE_H_
#define ORTOOLS_WASM_SET_COVER_TRACE_H_

#include <stdexcept>
#include <vector>
#include "ortools/set_cover/set_cover_invariant.h"

namespace ortools_wasm {

// CompressTrace depends only on the subset count and decisions. A zero-cost,
// empty-column model lets the native invariant hold that trace without needing
// or modifying the caller's model, selection, costs or coverage.
inline std::vector<operations_research::SetCoverDecision> CompressSetCoverTrace(
    int num_subsets, const std::vector<operations_research::SetCoverDecision>& trace) {
  if (num_subsets < 0) throw std::invalid_argument("Set Cover subset count must be non-negative.");
  for (const auto& decision : trace) {
    if (decision.subset().value() < 0 || decision.subset().value() >= num_subsets)
      throw std::invalid_argument("Invalid Set Cover trace subset index.");
  }
  operations_research::SetCoverModel model;
  for (int i = 0; i < num_subsets; ++i) model.AddEmptySubset(0);
  model.CreateSparseRowView();
  operations_research::SetCoverInvariant invariant(&model);
  invariant.LoadTraceAndCoverage(trace, operations_research::ElementToIntVector(operations_research::ElementIndex(0), 0));
  invariant.CompressTrace();
  return invariant.trace();
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_SET_COVER_TRACE_H_
