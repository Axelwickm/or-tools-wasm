#ifndef ORTOOLS_WASM_MATHOPT_MPS_CONVERSION_H_
#define ORTOOLS_WASM_MATHOPT_MPS_CONVERSION_H_
#include <string>
#include "ortools/math_opt/io/mps_converter.h"
#include "ortools/math_opt/model.pb.h"
#include "ortools/math_opt/validators/model_validator.h"
namespace ortools_wasm {
inline std::string ValidateMathOptModelBytes(const std::string& bytes) {
  operations_research::math_opt::ModelProto model;
  if (!model.ParseFromString(bytes)) return "Failed to parse MathOpt ModelProto.";
  const auto result = operations_research::math_opt::ValidateModel(model);
  return result.ok() ? std::string() : result.status().ToString();
}
struct MathOptMpsConversionResult { std::string output; std::string error; };
inline MathOptMpsConversionResult ConvertMathOptMps(const std::string& input, bool to_mps) {
  using namespace operations_research::math_opt;
  if (to_mps) {
    ModelProto model;
    if (!model.ParseFromString(input)) return {{}, "Failed to parse MathOpt ModelProto."};
    // The native MPS writer omits quadratic objectives and the intermediate
    // converter omits auxiliary objectives. Reject both instead of losing data.
    if (!model.auxiliary_objectives().empty()) return {{}, "MPS export does not support auxiliary objectives."};
    if (model.objective().quadratic_coefficients().row_ids_size() > 0) return {{}, "MPS export does not support quadratic objectives."};
    const auto converted = ModelProtoToMps(model);
    if (!converted.ok()) return {{}, converted.status().ToString()};
    return {*converted, {}};
  }
  const auto converted = MpsToModelProto(input);
  if (!converted.ok()) return {{}, converted.status().ToString()};
  return {converted->SerializeAsString(), {}};
}
}  // namespace ortools_wasm
#endif
