#ifndef ORTOOLS_WASM_CP_SAT_MODEL_EXPORT_H_
#define ORTOOLS_WASM_CP_SAT_MODEL_EXPORT_H_
#include <string>
#include "google/protobuf/text_format.h"
#include "ortools/sat/cp_model.pb.h"
namespace ortools_wasm {
struct CpSatModelTextResult { std::string text; std::string error; };
inline CpSatModelTextResult ExportCpSatModelText(const std::string& bytes) {
  operations_research::sat::CpModelProto model;
  if (!model.ParseFromString(bytes)) return {{}, "Failed to parse CpModelProto."};
  // Like native model file export, allow invalid models for diagnostics.
  std::string text;
  if (!google::protobuf::TextFormat::PrintToString(model, &text)) {
    return {{}, "Failed to format CpModelProto as text."};
  }
  return {text, {}};
}
}  // namespace ortools_wasm
#endif
