#ifndef ORTOOLS_WASM_ROUTING_SUCCESSOR_DOMAINS_H_
#define ORTOOLS_WASM_ROUTING_SUCCESSOR_DOMAINS_H_

#include <cstdint>
#include "absl/types/span.h"
#include "javascript/routing_variable_domains.h"

namespace ortools_wasm {
inline bool SetRoutingNextValues(operations_research::RoutingModel& model,
                                 int64_t index, absl::Span<const int64_t> values) {
  if (!IsRoutingIndexValid(model, index, false)) return false;
  for (int64_t value : values) {
    if (!IsRoutingIndexValid(model, value)) return false;
  }
  IntersectRoutingValues(model, *model.NextVar(index), values);
  return true;
}
}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_ROUTING_SUCCESSOR_DOMAINS_H_
