#ifndef ORTOOLS_WASM_ROUTING_ROUTE_CALLBACKS_H_
#define ORTOOLS_WASM_ROUTING_ROUTE_CALLBACKS_H_
#include <cstdint>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
#include "ortools/constraint_solver/routing.h"
namespace ortools_wasm {
inline std::optional<int64_t> EvaluateRoutingRouteCost(operations_research::RoutingModel& model,
    const std::vector<int64_t>& route) {
  for (int64_t index : route)
    if (index < 0 || index >= model.Size() + model.vehicles())
      throw std::invalid_argument("Invalid Routing route index.");
  return model.GetRouteCost(route);
}
inline bool RoutingPredicateCallbackResult(int64_t value) {
  if (value != 0 && value != 1) throw std::invalid_argument("Invalid Routing predicate reply.");
  return value == 1;
}
// Sibling predicates reuse the evaluator wire with one index and a 0/1 reply.
// Internal callback wire: uint32 evaluator handle followed by int64 route
// indices, all little endian. Reply: presence byte and optional int64 cost.
inline std::string RoutingRouteCallbackData(int evaluator, const std::vector<int64_t>& route) {
  std::string bytes(4 + 8 * route.size(), '\0');
  for (int j = 0; j < 4; ++j) bytes[j] = static_cast<uint32_t>(evaluator) >> (8 * j);
  for (size_t i = 0; i < route.size(); ++i)
    for (int j = 0; j < 8; ++j) bytes[4 + 8 * i + j] = static_cast<uint64_t>(route[i]) >> (8 * j);
  return bytes;
}
inline std::optional<int64_t> RoutingRouteCallbackCost(const std::string& reply) {
  if (reply.size() == 1 && reply[0] == 0) return std::nullopt;
  if (reply.size() != 9 || reply[0] != 1) throw std::invalid_argument("Invalid Routing route callback reply.");
  uint64_t bits = 0;
  for (int j = 0; j < 8; ++j) bits |= static_cast<uint64_t>(static_cast<uint8_t>(reply[1 + j])) << (8 * j);
  int64_t cost; std::memcpy(&cost, &bits, sizeof(cost));
  return cost;
}
}  // namespace ortools_wasm
#endif
