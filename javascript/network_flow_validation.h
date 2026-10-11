#ifndef ORTOOLS_WASM_JAVASCRIPT_NETWORK_FLOW_VALIDATION_H_
#define ORTOOLS_WASM_JAVASCRIPT_NETWORK_FLOW_VALIDATION_H_

#include <cstdint>
#include <limits>
#include <string>

namespace ortools_wasm {

// Native graphs need an ID increment and a sentinel; min-cost flow adds two
// nodes, while assignment doubles its node count.
constexpr int32_t kMaxFlowNode = std::numeric_limits<int32_t>::max() - 2;
constexpr int32_t kMinCostFlowNode = std::numeric_limits<int32_t>::max() - 4;
constexpr int32_t kAssignmentNode = std::numeric_limits<int32_t>::max() / 2 - 1;

inline std::string ValidateNetworkFlowEndpoints(
    const int32_t* tails, const int32_t* heads, int count, int32_t maximum) {
  for (int arc = 0; arc < count; ++arc) {
    if (tails[arc] < 0 || heads[arc] < 0 || tails[arc] > maximum ||
        heads[arc] > maximum) {
      return "Network Flow arc endpoints must be in range 0.." +
             std::to_string(maximum) + ".";
    }
  }
  return {};
}

}  // namespace ortools_wasm

#endif  // ORTOOLS_WASM_JAVASCRIPT_NETWORK_FLOW_VALIDATION_H_
