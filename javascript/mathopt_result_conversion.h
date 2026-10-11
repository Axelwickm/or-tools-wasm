#ifndef ORTOOLS_WASM_MATHOPT_RESULT_CONVERSION_H_
#define ORTOOLS_WASM_MATHOPT_RESULT_CONVERSION_H_

#include <string>
#include "absl/status/statusor.h"
#include "google/protobuf/message_lite.h"
#include "ortools/math_opt/cpp/model.h"
#include "ortools/math_opt/cpp/solution.h"
#include "ortools/math_opt/cpp/solve_result.h"

namespace ortools_wasm {

struct MathOptProtoConversion { std::string result; std::string error; };

inline MathOptProtoConversion SerializeMathOptConvertedProto(
    const google::protobuf::MessageLite& proto) {
  return {proto.SerializeAsString(), {}};
}

template <typename Proto>
MathOptProtoConversion SerializeMathOptConvertedProto(
    const absl::StatusOr<Proto>& proto) {
  if (!proto.ok()) return {{}, proto.status().ToString()};
  return SerializeMathOptConvertedProto(*proto);
}

template <typename Proto, typename Parser>
MathOptProtoConversion ConvertMathOptProto(const std::string& bytes,
                                         Parser parse) {
  Proto proto;
  if (!proto.ParseFromString(bytes)) return {{}, "Failed to parse MathOpt result proto."};
  const auto value = parse(proto);
  if (!value.ok()) return {{}, value.status().ToString()};
  return SerializeMathOptConvertedProto(value->Proto());
}

inline MathOptProtoConversion ConvertMathOptResultProto(
    int kind, const std::string& model_bytes, const std::string& input_bytes) {
  using namespace operations_research::math_opt;
  if (kind >= 1 && kind <= 6) {
    ModelProto proto;
    if (!proto.ParseFromString(model_bytes)) return {{}, "Failed to parse MathOpt model proto."};
    const auto model = Model::FromModelProto(proto);
    if (!model.ok()) return {{}, model.status().ToString()};
    const auto storage = (*model)->storage();
    switch (kind) {
      case 1: return ConvertMathOptProto<PrimalSolutionProto>(input_bytes,
          [&](const auto& value) { return PrimalSolution::FromProto(storage, value); });
      case 2: return ConvertMathOptProto<DualSolutionProto>(input_bytes,
          [&](const auto& value) { return DualSolution::FromProto(storage, value); });
      case 3: return ConvertMathOptProto<BasisProto>(input_bytes,
          [&](const auto& value) { return Basis::FromProto(storage, value); });
      case 4: return ConvertMathOptProto<PrimalRayProto>(input_bytes,
          [&](const auto& value) { return PrimalRay::FromProto(storage, value); });
      case 5: return ConvertMathOptProto<DualRayProto>(input_bytes,
          [&](const auto& value) { return DualRay::FromProto(storage, value); });
      case 6: return ConvertMathOptProto<SolutionProto>(input_bytes,
          [&](const auto& value) { return Solution::FromProto(storage, value); });
    }
  }
  switch (kind) {
    case 7: return ConvertMathOptProto<ProblemStatusProto>(input_bytes,
        [](const auto& value) { return ProblemStatus::FromProto(value); });
    case 8: {
      ObjectiveBoundsProto proto;
      if (!proto.ParseFromString(input_bytes)) return {{}, "Failed to parse MathOpt objective bounds proto."};
      return SerializeMathOptConvertedProto(ObjectiveBounds::FromProto(proto).Proto());
    }
    case 9: {
      SolveStatsProto input;
      if (!input.ParseFromString(input_bytes)) return {{}, "Failed to parse MathOpt result proto."};
      // The native C++ convenience type has int counters, while the wire fields
      // are int64. Use its duration conversion without narrowing wire counters.
      SolveStatsProto duration_input;
      *duration_input.mutable_solve_time() = input.solve_time();
      const auto value = SolveStats::FromProto(duration_input);
      if (!value.ok()) return {{}, value.status().ToString()};
      auto output = value->Proto();
      if (!output.ok()) return {{}, output.status().ToString()};
      output->set_simplex_iterations(input.simplex_iterations());
      output->set_barrier_iterations(input.barrier_iterations());
      output->set_first_order_iterations(input.first_order_iterations());
      output->set_node_count(input.node_count());
      return SerializeMathOptConvertedProto(*output);
    }
    case 10: return ConvertMathOptProto<TerminationProto>(input_bytes,
        [](const auto& value) { return Termination::FromProto(value); });
    default: return {{}, "Unknown MathOpt result proto kind."};
  }
}

}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MATHOPT_RESULT_CONVERSION_H_
