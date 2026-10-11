#ifndef ORTOOLS_WASM_ROUTING_INDEX_VALIDATION_H_
#define ORTOOLS_WASM_ROUTING_INDEX_VALIDATION_H_

#include <cstdint>
#include "ortools/constraint_solver/routing.h"

namespace ortools_wasm {
// Vehicle and cumul variables include terminal indices; visits do not.
inline bool IsRoutingIndexValid(const operations_research::RoutingModel& model,
                                int64_t index, bool include_ends = true) {
  return index >= 0 && index < model.Size() + (include_ends ? model.vehicles() : 0);
}
}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_ROUTING_INDEX_VALIDATION_H_
