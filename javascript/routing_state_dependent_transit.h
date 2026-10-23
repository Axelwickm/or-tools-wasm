#ifndef ORTOOLS_WASM_ROUTING_STATE_DEPENDENT_TRANSIT_H_
#define ORTOOLS_WASM_ROUTING_STATE_DEPENDENT_TRANSIT_H_
#include <cstdint>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
#include "absl/container/inlined_vector.h"
#include "ortools/constraint_solver/routing.h"
#include "ortools/util/piecewise_linear_function.h"
#include "javascript/routing_dimension_construction.h"

namespace ortools_wasm {
struct RoutingPiecewiseLinearFunction {
  std::vector<int64_t> x, y;
};
struct RoutingStateDependentMatrix {
  int64_t domain_start, domain_end;
  std::vector<RoutingPiecewiseLinearFunction> functions;
};
using RoutingStateDependentDomains = std::unordered_map<int, std::pair<int64_t, int64_t>>;

inline int RegisterRoutingStateDependentTransitMatrix(operations_research::RoutingModel& model,
    RoutingStateDependentMatrix matrix, RoutingStateDependentDomains& domains) {
  const int dimension = model.Size() + model.vehicles();
  if (matrix.domain_start < 0 || matrix.domain_start >= matrix.domain_end
      || matrix.domain_end > std::numeric_limits<int32_t>::max()
      || matrix.functions.size() != size_t(dimension) * dimension)
    throw std::invalid_argument("Invalid Routing state-dependent domain or index matrix.");
  auto functions = std::make_shared<std::vector<operations_research::FloatSlopePiecewiseLinearFunction>>();
  functions->reserve(matrix.functions.size());
  for (const auto& function : matrix.functions) {
    if (function.x.size() < 2 || function.x.size() != function.y.size()
        || function.x.front() > matrix.domain_start || function.x.back() < matrix.domain_end - 1)
      throw std::invalid_argument("Routing transit anchors must cover the entire cumul domain.");
    for (size_t i = 0; i < function.x.size(); ++i) {
      // Native interpolation uses double arithmetic and signed integer differences.
      // Keep the anchors in its exact integer range and avoid undefined casts/overflow.
      constexpr int64_t kMaxExactDoubleInteger = 9007199254740991LL;
      if (function.x[i] < 0 || function.x[i] > std::numeric_limits<int32_t>::max()
          || function.y[i] < -kMaxExactDoubleInteger || function.y[i] > kMaxExactDoubleInteger
          || (i > 0 && function.x[i - 1] >= function.x[i]))
        throw std::invalid_argument("Routing transit anchors require increasing nonnegative int32 x and safe-integer y values.");
    }
    functions->emplace_back(absl::InlinedVector<int64_t, 8>(function.x.begin(), function.x.end()),
        absl::InlinedVector<int64_t, 8>(function.y.begin(), function.y.end()));
  }
  const int64_t start = matrix.domain_start, end = matrix.domain_end;
  const int evaluator = model.RegisterStateDependentTransitCallback(
      [functions = std::move(functions), dimension, start, end](int64_t from, int64_t to) {
        const auto& function = (*functions)[size_t(from) * dimension + to];
        return operations_research::RoutingModel::MakeStateDependentTransit(
            [&function](int64_t cumul) { return function.ComputeConvexValue(cumul); }, start, end);
      });
  domains.emplace(evaluator, std::make_pair(start, end));
  return evaluator;
}

inline bool AddRoutingDependentDimension(operations_research::RoutingModel& model,
    const std::vector<int>& fixed_evaluators, const std::vector<int>& dependent_evaluators,
    const RoutingStateDependentDomains& domains, const std::string* base_name, int64_t slack,
    const std::vector<int64_t>& capacities, bool fixed_start, const std::string& name) {
  if (!IsRoutingVehicleDimensionValid(model.vehicles(), fixed_evaluators.size(), capacities, slack)
      || dependent_evaluators.size() != model.vehicles())
    throw std::invalid_argument("Routing dependent dimension requires one evaluator and capacity per vehicle.");
  const auto* base = base_name ? model.GetMutableDimension(*base_name) : nullptr;
  if (base_name && !base) throw std::invalid_argument("Routing base dimension does not exist.");
  for (int vehicle = 0; vehicle < model.vehicles(); ++vehicle) {
    const auto found = domains.find(dependent_evaluators[vehicle]);
    if (found == domains.end()) throw std::invalid_argument("Routing state-dependent evaluator does not exist.");
    const auto [start, end] = found->second;
    if (!base && (start > 0 || *std::max_element(capacities.begin(), capacities.end()) >= end))
      throw std::invalid_argument("Routing self-dependent domain must cover zero through vehicle capacity.");
    if (base) for (int i = 0; i < model.Size() + model.vehicles(); ++i) {
      const auto* cumul = base->CumulVar(i);
      if (cumul->Min() < start || cumul->Max() >= end)
        throw std::invalid_argument("Routing state-dependent domain must cover every base cumul bound.");
    }
  }
  return model.AddDimensionDependentDimensionWithVehicleCapacity(fixed_evaluators, dependent_evaluators,
      base, slack, capacities, fixed_start, name);
}
}  // namespace ortools_wasm
#endif
