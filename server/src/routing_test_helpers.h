#ifndef ORTOOLS_WASM_SERVER_ROUTING_TEST_HELPERS_H_
#define ORTOOLS_WASM_SERVER_ROUTING_TEST_HELPERS_H_

#include <algorithm>
#include <stdexcept>

#include "routing.pb.h"
#include "ortools/constraint_solver/routing_parameters.pb.h"

namespace ortools_wasm::server {
inline void SetRoutingFirstSolutionStrategy(bridge::v1::RoutingBridgeRequest* request, int strategy) {
  operations_research::RoutingSearchParameters parameters;
  if (!parameters.ParseFromString(request->search_parameters_proto())) {
    throw std::runtime_error("Invalid test Routing search parameters");
  }
  parameters.set_first_solution_strategy(static_cast<operations_research::FirstSolutionStrategy::Value>(strategy));
  request->set_search_parameters_proto(parameters.SerializeAsString());
  const auto& fields = request->search_parameter_fields();
  if (std::find(fields.begin(), fields.end(), "first_solution_strategy") == fields.end()) {
    request->add_search_parameter_fields("first_solution_strategy");
  }
}
}  // namespace ortools_wasm::server
#endif
