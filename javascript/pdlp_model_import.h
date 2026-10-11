#ifndef ORTOOLS_WASM_PDLP_MODEL_IMPORT_H_
#define ORTOOLS_WASM_PDLP_MODEL_IMPORT_H_
#include <string>
#include "google/protobuf/text_format.h"
#include "google/protobuf/util/json_util.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/linear_solver/model_validator.h"
#include "ortools/lp_data/mps_reader.h"
#include "ortools/pdlp/quadratic_program.h"
namespace ortools_wasm {
inline absl::StatusOr<operations_research::pdlp::QuadraticProgram> ReadPdlpQuadraticProgram(
    const std::string& input, int format, bool relax_integer_variables, bool include_names) {
  operations_research::MPModelProto model;
  switch (format) {
    case 0:
      if (!model.ParseFromString(input)) return absl::InvalidArgumentError("Failed to parse PDLP MPModelProto bytes.");
      break;
    case 1: {
      auto parsed = operations_research::glop::MpsDataToMPModelProto(input);
      if (!parsed.ok()) return parsed.status();
      model = std::move(*parsed);
      break;
    }
    case 2:
      if (!google::protobuf::TextFormat::ParseFromString(input, &model)) return absl::InvalidArgumentError("Failed to parse PDLP MPModelProto textproto.");
      break;
    case 3: {
      const auto parsed = google::protobuf::util::JsonStringToMessage(input, &model);
      if (!parsed.ok()) return absl::InvalidArgumentError(parsed.ToString());
      break;
    }
    default: return absl::InvalidArgumentError("Unknown PDLP model import format.");
  }
  // The converter assumes consistent constraint index/coefficient arrays.
  // Validate with the native model validator before it accesses those arrays.
  const auto error = operations_research::FindErrorInMPModelProto(model);
  if (!error.empty()) return absl::InvalidArgumentError(error);
  return operations_research::pdlp::QpFromMpModelProto(model, relax_integer_variables, include_names);
}
}  // namespace ortools_wasm
#endif
