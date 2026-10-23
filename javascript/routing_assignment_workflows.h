#ifndef ORTOOLS_WASM_ROUTING_ASSIGNMENT_WORKFLOWS_H_
#define ORTOOLS_WASM_ROUTING_ASSIGNMENT_WORKFLOWS_H_

#include <cmath>
#include <memory>
#include <stdexcept>
#include <vector>
#include "absl/time/time.h"
#include "ortools/constraint_solver/routing.h"

namespace ortools_wasm {
// Bridge action values match RoutingAssignmentAction in bridge-types/routing.proto.
struct RoutingAssignmentWorkflow {
  int action = 0;
  double packing_duration_seconds = 0;
  bool check_solution_in_cp = true;
  bool time_limit_reached = false;
  bool call_at_solution_monitors = false;
  bool assignment_feasible = false;
  int64_t computed_lower_bound = 0;
  std::vector<const operations_research::Assignment*> candidates;
  std::vector<const operations_research::Assignment*> collected;
  // Compaction returns caller-owned memory, unlike solve/packing results.
  std::unique_ptr<operations_research::Assignment> compacted;

  void Validate(const operations_research::RoutingSearchParameters& parameters,
                bool has_initial_assignment) const {
    if (!candidates.empty() && action != 5) throw std::invalid_argument("Routing starting candidates require the multiple-start operation.");
    if (action < 0 || action > 7) throw std::invalid_argument("Unknown Routing assignment action.");
    if (parameters.use_iterated_local_search() &&
        (has_initial_assignment || action != 0 || parameters.number_of_solutions_to_collect() > 1))
      throw std::invalid_argument("Native Routing ILS does not support initial assignments, assignment operations or collected solutions.");
    if (action == 1 && std::isnan(packing_duration_seconds))
      throw std::invalid_argument("Routing packing duration must not be NaN.");
    if (action == 4 && parameters.local_search_metaheuristic() != operations_research::LocalSearchMetaheuristic::GREEDY_DESCENT &&
        parameters.local_search_metaheuristic() != operations_research::LocalSearchMetaheuristic::AUTOMATIC)
      throw std::invalid_argument("Native Routing fast solving requires GREEDY_DESCENT or AUTOMATIC.");
    if (((action >= 1 && action <= 4) || action == 7) && !has_initial_assignment)
      throw std::invalid_argument("Routing assignment operation requires an initial assignment.");
  }

  const operations_research::Assignment* Run(operations_research::RoutingModel& model,
      const operations_research::Assignment* initial,
      const operations_research::RoutingSearchParameters& parameters) {
    using operations_research::RoutingSearchStatus;
    collected.clear();
    time_limit_reached = false;
    auto* solutions = parameters.number_of_solutions_to_collect() > 1 ? &collected : nullptr;
    switch (action) {
      case 0:
        if (parameters.use_iterated_local_search()) return model.SolveWithIteratedLocalSearch(parameters);
        return initial ? model.SolveFromAssignmentWithParameters(initial, parameters, solutions)
                       : model.SolveWithParameters(parameters, solutions);
      case 1:
        return model.PackCumulsOfOptimizerDimensionsFromAssignment(initial,
            absl::Seconds(packing_duration_seconds), &time_limit_reached);
      case 2:
      case 3:
        compacted.reset(action == 2 ? model.CompactAssignment(*initial) : model.CompactAndCheckAssignment(*initial));
        return compacted.get();
      case 4: {
        // A transferred route seed can produce a route-only unchecked result,
        // with no vehicle/schedule values for the complete-result serializer.
        if (!initial->HasObjective() || !initial->ObjectiveBound())
          throw std::invalid_argument("Fast Routing solving requires a restored assignment with a bound objective.");
        const auto* result = model.FastSolveFromAssignmentWithParameters(initial, parameters, check_solution_in_cp);
        // A failed native CP check can leave a non-null candidate. Never expose
        // that candidate as a checked solution; preserve the native failure status.
        return check_solution_in_cp && model.status() != RoutingSearchStatus::ROUTING_SUCCESS ? nullptr : result;
      }
      case 5:
        return model.SolveFromAssignmentsWithParameters(candidates, parameters, solutions);
      case 6:
        computed_lower_bound = model.ComputeLowerBound();
        return nullptr;
      case 7:
        assignment_feasible = model.CheckIfAssignmentIsFeasible(*initial, call_at_solution_monitors);
        return nullptr;
      default: throw std::invalid_argument("Unknown Routing assignment action.");
    }
  }
};
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_ROUTING_ASSIGNMENT_WORKFLOWS_H_
