#ifndef ORTOOLS_WASM_CP_SAT_SOLUTION_CHECK_H_
#define ORTOOLS_WASM_CP_SAT_SOLUTION_CHECK_H_

#include <cstdint>
#include <string>
#include "absl/types/span.h"
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/cp_model_checker.h"

namespace ortools_wasm {
struct CpSatSolutionCheckResult { bool feasible; std::string error; };

inline CpSatSolutionCheckResult CheckCpSatSolution(
    const std::string& bytes, absl::Span<const int64_t> values) {
  operations_research::sat::CpModelProto model;
  if (!model.ParseFromString(bytes)) return {false, "Failed to parse CpModelProto."};
  const auto error = operations_research::sat::ValidateCpModel(model);
  if (!error.empty()) return {false, error};
  return {operations_research::sat::SolutionIsFeasible(model, values), {}};
}
}  // namespace ortools_wasm
#endif
