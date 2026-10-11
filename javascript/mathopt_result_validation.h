#ifndef ORTOOLS_WASM_MATHOPT_RESULT_VALIDATION_H_
#define ORTOOLS_WASM_MATHOPT_RESULT_VALIDATION_H_
#include <string>
#include "ortools/math_opt/rpc.pb.h"
#include "ortools/math_opt/validators/model_validator.h"
#include "ortools/math_opt/validators/model_parameters_validator.h"
#include "ortools/math_opt/validators/result_validator.h"
#include "ortools/math_opt/validators/sparse_vector_validator.h"
namespace ortools_wasm {
struct MathOptResultValidation { std::string result; std::string error; };
inline MathOptResultValidation ValidateMathOptResultBytes(const std::string& request_bytes, const std::string& result_bytes) {
  using namespace operations_research::math_opt;
  SolveRequest request;
  SolveResultProto result;
  if (!request.ParseFromString(request_bytes) || !request.has_model()) return {{}, "Failed to parse MathOpt result validation model."};
  if (!result.ParseFromString(result_bytes)) return {{}, "Failed to parse MathOpt SolveResultProto."};
  const auto model = ValidateModel(request.model());
  if (!model.ok()) return {{}, model.status().ToString()};
  const auto parameters = ValidateModelSolveParameters(request.model_parameters(), *model);
  if (!parameters.ok()) return {{}, parameters.ToString()};
  // ValidateResult currently omits quadratic_dual_values. Use the same native
  // sparse-vector/ID validators as its other solution vectors.
  for (const auto& solution : result.solutions()) {
    const auto& values = solution.dual_solution().quadratic_dual_values();
    const auto sparse = CheckIdsAndValues(MakeView(values),
      {.allow_positive_infinity = false, .allow_negative_infinity = false});
    if (!sparse.ok()) return {{}, sparse.ToString()};
    const auto ids = CheckIdsSubset(values.ids(), model->quadratic_constraints, "quadratic dual values", "model IDs");
    if (!ids.ok()) return {{}, ids.ToString()};
  }
  const auto validation = ValidateResult(result, request.model_parameters(), *model);
  if (!validation.ok()) return {{}, validation.ToString()};
  return {result.SerializeAsString(), {}};
}
}  // namespace ortools_wasm
#endif
