#ifndef ORTOOLS_WASM_MATHOPT_FEASIBILITY_H_
#define ORTOOLS_WASM_MATHOPT_FEASIBILITY_H_
#include <string>
#include "absl/status/statusor.h"
#include "mathopt_feasibility.pb.h"
#include "ortools/math_opt/cpp/model.h"
#include "ortools/math_opt/cpp/sparse_containers.h"
#include "ortools/math_opt/labs/solution_feasibility_checker.h"

namespace ortools_wasm {
inline absl::StatusOr<bridge::v1::MathOptFeasibilityResponse> CheckMathOptFeasibility(
    const bridge::v1::MathOptFeasibilityRequest& request) {
  using namespace operations_research::math_opt;
  ModelProto proto;
  if (!proto.ParseFromString(request.model_proto())) return absl::InvalidArgumentError("Failed to parse MathOpt model.");
  const auto model = Model::FromModelProto(proto);
  if (!model.ok()) return model.status();
  SparseDoubleVectorProto sparse;
  *sparse.mutable_ids() = request.variable_ids();
  *sparse.mutable_values() = request.variable_values();
  const auto values = VariableValuesFromProto((*model)->storage(), sparse);
  if (!values.ok()) return values.status();
  FeasibilityCheckerOptions options;
  if (request.has_absolute_constraint_tolerance()) options.absolute_constraint_tolerance = request.absolute_constraint_tolerance();
  if (request.has_integrality_tolerance()) options.integrality_tolerance = request.integrality_tolerance();
  if (request.has_nonzero_tolerance()) options.nonzero_tolerance = request.nonzero_tolerance();
  const auto violations = CheckPrimalSolutionFeasibility(**model, *values, options);
  if (!violations.ok()) return violations.status();
  const auto descriptions = ViolatedConstraintsAsStrings(**model, *violations, *values);
  if (!descriptions.ok()) return descriptions.status();
  bridge::v1::MathOptFeasibilityResponse response;
  response.set_feasible(violations->empty());
  response.set_violated_constraints_proto(violations->Proto().SerializeAsString());
  for (const auto& description : *descriptions) response.add_descriptions(description);
  return response;
}
inline std::string CheckMathOptFeasibilityBytes(const std::string& bytes) {
  bridge::v1::MathOptFeasibilityRequest request;
  bridge::v1::MathOptFeasibilityResponse response;
  if (!request.ParseFromString(bytes)) response.set_error("Failed to parse MathOpt feasibility request.");
  else {
    const auto result = CheckMathOptFeasibility(request);
    if (result.ok()) response = *result;
    else response.set_error(result.status().ToString());
  }
  return response.SerializeAsString();
}
}  // namespace ortools_wasm
#endif
