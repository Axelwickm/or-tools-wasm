#ifndef ORTOOLS_WASM_MATHOPT_EXPRESSION_BOUNDS_H_
#define ORTOOLS_WASM_MATHOPT_EXPRESSION_BOUNDS_H_
#include <string>
#include "mathopt_expression_bounds.pb.h"
#include "ortools/math_opt/cpp/model.h"
#include "ortools/math_opt/labs/linear_expr_util.h"
#include "ortools/math_opt/validators/linear_expression_validator.h"

namespace ortools_wasm {
inline absl::StatusOr<bridge::v1::MathOptExpressionBoundsResponse> MathOptExpressionBounds(
    const bridge::v1::MathOptExpressionBoundsRequest& request) {
  using namespace operations_research::math_opt;
  ModelProto proto;
  if (!proto.ParseFromString(request.model_proto())) return absl::InvalidArgumentError("Failed to parse MathOpt model.");
  const auto model = Model::FromModelProto(proto);
  if (!model.ok()) return model.status();
  const auto summary = ModelSummary::Create(proto);
  if (!summary.ok()) return summary.status();
  LinearExpressionProto expression_proto;
  *expression_proto.mutable_ids() = request.variable_ids();
  *expression_proto.mutable_coefficients() = request.coefficients();
  expression_proto.set_offset(request.offset());
  const auto status = ValidateLinearExpression(expression_proto, summary->variables);
  if (!status.ok()) return status;
  LinearExpression expression(request.offset());
  for (int i = 0; i < request.variable_ids_size(); ++i)
    expression += request.coefficients(i) * (*model)->variable(request.variable_ids(i));
  bridge::v1::MathOptExpressionBoundsResponse response;
  response.set_lower_bound(LowerBound(expression));
  response.set_upper_bound(UpperBound(expression));
  return response;
}
inline std::string MathOptExpressionBoundsBytes(const std::string& bytes) {
  bridge::v1::MathOptExpressionBoundsRequest request;
  bridge::v1::MathOptExpressionBoundsResponse response;
  if (!request.ParseFromString(bytes)) response.set_error("Failed to parse MathOpt expression bounds request.");
  else {
    const auto result = MathOptExpressionBounds(request);
    if (result.ok()) response = *result;
    else response.set_error(result.status().ToString());
  }
  return response.SerializeAsString();
}
}  // namespace ortools_wasm
#endif
