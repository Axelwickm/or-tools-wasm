#ifndef ORTOOLS_WASM_SET_COVER_GUIDED_TABU_H_
#define ORTOOLS_WASM_SET_COVER_GUIDED_TABU_H_

#include <cmath>
#include <optional>
#include <stdexcept>

#include "ortools/set_cover/set_cover_heuristics.h"

namespace ortools_wasm {
struct GuidedTabuParameters {
  std::optional<double> lagrangian_factor;
  std::optional<double> epsilon;
  std::optional<double> penalty_factor;
  std::optional<int> tabu_list_size;
};

inline void ConfigureGuidedTabuSearch(
    operations_research::GuidedTabuSearch* generator,
    const GuidedTabuParameters& parameters) {
  for (const auto value : {parameters.lagrangian_factor, parameters.epsilon,
                           parameters.penalty_factor}) {
    if (value && !std::isfinite(*value)) {
      throw std::invalid_argument("SetCover: guided tabu parameters must be finite.");
    }
  }
  // A zero-sized native tabu list cannot accept a search move.
  if (parameters.tabu_list_size && *parameters.tabu_list_size <= 0) {
    throw std::invalid_argument("SetCover: tabu list size must be a positive int32.");
  }
  if (parameters.lagrangian_factor) generator->SetLagrangianFactor(*parameters.lagrangian_factor);
  if (parameters.epsilon) generator->SetEpsilon(*parameters.epsilon);
  if (parameters.penalty_factor) generator->SetPenaltyFactor(*parameters.penalty_factor);
  if (parameters.tabu_list_size) generator->SetTabuListSize(*parameters.tabu_list_size);
}

inline GuidedTabuParameters ReadGuidedTabuParameters(
    const operations_research::GuidedTabuSearch& generator) {
  return {generator.GetLagrangianFactor(), generator.GetEpsilon(),
          generator.GetPenaltyFactor(), generator.GetTabuListSize()};
}
}  // namespace ortools_wasm
#endif
