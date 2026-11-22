// Native regression reproduction: exit 1 means cumul-dependent transit was ignored.
// Upstream capability probe; not a passing regression or Python parity claim.
#include <iostream>
#include "ortools/constraint_solver/routing.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "ortools/util/piecewise_linear_function.h"
int main(int, char**) {
  using namespace operations_research;
  RoutingIndexManager manager(3, 1, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  int calls = 0;
  FloatSlopePiecewiseLinearFunction function({0, 100}, {10, 10});
  const int fixed = model.RegisterTransitCallback([](int64_t, int64_t) { return 1; });
  const int dependent = model.RegisterCumulDependentTransitCallback([&](int64_t, int64_t) { ++calls; return &function; });
  model.SetArcCostEvaluatorOfAllVehicles(fixed);
  model.AddDimensionWithCumulDependentVehicleTransitAndCapacity({fixed}, {dependent}, 0, {100}, true, "time");
  auto parameters = DefaultRoutingSearchParameters();
  parameters.set_first_solution_strategy(FirstSolutionStrategy::PATH_CHEAPEST_ARC);
  const auto* answer = model.SolveWithParameters(parameters);
  if (!answer) return 2;
  const auto value = answer->Value(model.GetDimensionOrDie("time").CumulVar(model.End(0)));
  std::cout << "expected_end_cumul=33 actual_end_cumul=" << value << " callback_calls=" << calls << '\n';
  return value == 33 && calls > 0 ? 0 : 1;
}
