#ifndef ORTOOLS_WASM_SET_COVER_STATISTICS_H_
#define ORTOOLS_WASM_SET_COVER_STATISTICS_H_
#include <stdexcept>
#include <vector>
#include "ortools/set_cover/set_cover_model.h"
namespace ortools_wasm {
struct SetCoverStatistics {
  operations_research::SetCoverModel::Stats stats{};
  std::vector<int64_t> deciles;
};
inline SetCoverStatistics ComputeSetCoverStatistics(const operations_research::SetCoverModel& model, int kind) {
  if (kind < 0 || kind > 4) throw std::invalid_argument("Unknown Set Cover statistics query.");
  const bool rows = kind == 1 || kind == 3;
  if ((rows ? model.num_elements() : model.num_subsets()) == 0)
    throw std::invalid_argument("Set Cover statistics require a nonempty sample.");
  switch (kind) {
    case 0: return {model.ComputeCostStats(), {}};
    case 1: return {model.ComputeRowStats(), {}};
    case 2: return {model.ComputeColumnStats(), {}};
    case 3: return {{}, model.ComputeRowDeciles()};
    case 4: return {{}, model.ComputeColumnDeciles()};
  }
  throw std::invalid_argument("Unknown Set Cover statistics query.");
}
}  // namespace ortools_wasm
#endif
