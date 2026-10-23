#ifndef ORTOOLS_WASM_MATHOPT_MODEL_TRANSFORM_H_
#define ORTOOLS_WASM_MATHOPT_MODEL_TRANSFORM_H_
#include <string>
#include "absl/status/statusor.h"
#include "mathopt_model_transform.pb.h"
#include "ortools/math_opt/cpp/model.h"
#include "ortools/math_opt/labs/general_constraint_to_mip.h"
#include "ortools/math_opt/labs/dualizer.h"
#include "ortools/math_opt/validators/linear_expression_validator.h"

namespace ortools_wasm {
inline absl::StatusOr<operations_research::math_opt::ModelProto> FormulateMathOptIndicatorAsMip(
    const std::string& bytes, int64_t indicator_id) {
  using namespace operations_research::math_opt;
  ModelProto proto;
  if (!proto.ParseFromString(bytes)) return absl::InvalidArgumentError("Failed to parse MathOpt model.");
  const auto model = Model::FromModelProto(proto);
  if (!model.ok()) return model.status();
  if (!(*model)->has_indicator_constraint(indicator_id))
    return absl::InvalidArgumentError("Unknown MathOpt indicator constraint ID.");
  const auto status = FormulateIndicatorConstraintAsMip(**model, (*model)->indicator_constraint(indicator_id));
  if (!status.ok()) return status;
  return (*model)->ExportModel();
}
inline absl::StatusOr<operations_research::math_opt::ModelProto> AddMathOptRobustConstraint(
    const bridge::v1::MathOptRobustConstraintRequest& request) {
  using namespace operations_research::math_opt;
  ModelProto main_proto, uncertainty_proto;
  if (!main_proto.ParseFromString(request.model_proto()) ||
      !uncertainty_proto.ParseFromString(request.uncertainty_model_proto()))
    return absl::InvalidArgumentError("Failed to parse MathOpt model.");
  const auto main = Model::FromModelProto(main_proto);
  if (!main.ok()) return main.status();
  const auto uncertainty = Model::FromModelProto(uncertainty_proto);
  if (!uncertainty.ok()) return uncertainty.status();
  // The native dualizer assumes an LP and otherwise silently ignores unsupported
  // constraint families and integrality. Enforce its documented precondition.
  for (const bool integer : uncertainty_proto.variables().integers())
    if (integer) return absl::InvalidArgumentError("MathOpt uncertainty model must be an LP.");
  if (!uncertainty_proto.quadratic_constraints().empty() ||
      !uncertainty_proto.second_order_cone_constraints().empty() ||
      !uncertainty_proto.sos1_constraints().empty() || !uncertainty_proto.sos2_constraints().empty() ||
      !uncertainty_proto.indicator_constraints().empty() ||
      uncertainty_proto.objective().quadratic_coefficients().coefficients_size() != 0)
    return absl::InvalidArgumentError("MathOpt uncertainty model must be an LP.");
  for (const auto& [id, objective] : uncertainty_proto.auxiliary_objectives())
    if (objective.quadratic_coefficients().coefficients_size() != 0)
      return absl::InvalidArgumentError("MathOpt uncertainty model must be an LP.");
  if (!(*main)->has_variable(request.rhs_id()))
    return absl::InvalidArgumentError("Unknown MathOpt robust constraint RHS variable ID.");
  const auto summary = ModelSummary::Create(uncertainty_proto);
  if (!summary.ok()) return summary.status();
  std::vector<std::pair<LinearExpression, Variable>> coefficients;
  for (const auto& input : request.uncertain_coefficients()) {
    if (!(*main)->has_variable(input.variable_id()))
      return absl::InvalidArgumentError("Unknown MathOpt robust constraint variable ID.");
    LinearExpressionProto proto;
    *proto.mutable_ids() = input.uncertainty_variable_ids();
    *proto.mutable_coefficients() = input.coefficients();
    proto.set_offset(input.offset());
    const auto status = ValidateLinearExpression(proto, summary->variables);
    if (!status.ok()) return status;
    LinearExpression expression(input.offset());
    for (int i = 0; i < proto.ids_size(); ++i)
      expression += proto.coefficients(i) * (*uncertainty)->variable(proto.ids(i));
    coefficients.emplace_back(std::move(expression), (*main)->variable(input.variable_id()));
  }
  AddRobustConstraint(**uncertainty, (*main)->variable(request.rhs_id()), coefficients, **main);
  return (*main)->ExportModel();
}
}  // namespace ortools_wasm
#endif
