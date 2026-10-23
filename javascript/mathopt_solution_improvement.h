#ifndef ORTOOLS_WASM_MATHOPT_SOLUTION_IMPROVEMENT_H_
#define ORTOOLS_WASM_MATHOPT_SOLUTION_IMPROVEMENT_H_
#include <string>
#include <vector>
#include "mathopt_solution_improvement.pb.h"
#include "ortools/math_opt/cpp/model.h"
#include "ortools/math_opt/cpp/sparse_containers.h"
#include "ortools/math_opt/labs/solution_improvement.h"

namespace ortools_wasm {
inline absl::StatusOr<operations_research::math_opt::SparseDoubleVectorProto> ImproveMathOptSolution(
    const bridge::v1::MathOptSolutionImprovementRequest& request) {
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
  std::vector<Variable> selected;
  for (const int64_t id : request.selected_variable_ids()) {
    if (!(*model)->has_variable(id)) return absl::InvalidArgumentError("Unknown MathOpt improvement variable ID.");
    selected.push_back((*model)->variable(id));
  }
  MoveVariablesToTheirBestFeasibleValueOptions options;
  if (request.has_integrality_tolerance()) options.integrality_tolerance = request.integrality_tolerance();
  const auto result = MoveVariablesToTheirBestFeasibleValue(**model, *values, selected, options);
  if (!result.ok()) return result.status();
  return VariableValuesToProto(*result);
}
inline std::string ImproveMathOptSolutionBytes(const std::string& bytes) {
  bridge::v1::MathOptSolutionImprovementRequest request;
  bridge::v1::MathOptSolutionImprovementResponse response;
  if (!request.ParseFromString(bytes)) response.set_error("Failed to parse MathOpt solution improvement request.");
  else {
    const auto result = ImproveMathOptSolution(request);
    if (result.ok()) response.set_variable_values_proto(result->SerializeAsString());
    else response.set_error(result.status().ToString());
  }
  return response.SerializeAsString();
}
}  // namespace ortools_wasm
#endif
