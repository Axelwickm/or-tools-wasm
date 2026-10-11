#ifndef ORTOOLS_WASM_ROUTING_SEARCH_PARAMETERS_H_
#define ORTOOLS_WASM_ROUTING_SEARCH_PARAMETERS_H_
#include <string>
#include <vector>
#include "google/protobuf/descriptor.h"
#include "google/protobuf/message.h"
#include "ortools/constraint_solver/routing_parameters.h"
#include "ortools/constraint_solver/routing_parameters.pb.h"
#include "ortools/util/optional_boolean.pb.h"

namespace ortools_wasm {
// Copy exactly the supplied field, including absent/default-valued proto3 scalars.
// Descending through an empty source message must not skip nested zero overrides.
inline void CopyRoutingParameterField(const google::protobuf::Message& source,
    google::protobuf::Message* target, const google::protobuf::FieldDescriptor* field) {
  const auto* from = source.GetReflection();
  const auto* to = target->GetReflection();
  if (field->is_repeated()) to->ClearField(target, field);
  const int count = field->is_repeated() ? from->FieldSize(source, field) : 1;
  for (int index = 0; index < count; ++index) {
    switch (field->cpp_type()) {
#define ROUTING_COPY_SCALAR(TYPE, KIND) \
      case google::protobuf::FieldDescriptor::CPPTYPE_##KIND: \
        if (field->is_repeated()) to->Add##TYPE(target, field, from->GetRepeated##TYPE(source, field, index)); \
        else to->Set##TYPE(target, field, from->Get##TYPE(source, field)); \
        break;
      ROUTING_COPY_SCALAR(Int32, INT32)
      ROUTING_COPY_SCALAR(Int64, INT64)
      ROUTING_COPY_SCALAR(UInt32, UINT32)
      ROUTING_COPY_SCALAR(UInt64, UINT64)
      ROUTING_COPY_SCALAR(Double, DOUBLE)
      ROUTING_COPY_SCALAR(Float, FLOAT)
      ROUTING_COPY_SCALAR(Bool, BOOL)
      ROUTING_COPY_SCALAR(String, STRING)
#undef ROUTING_COPY_SCALAR
      case google::protobuf::FieldDescriptor::CPPTYPE_ENUM:
        if (field->is_repeated()) to->AddEnumValue(target, field, from->GetRepeatedEnumValue(source, field, index));
        else to->SetEnumValue(target, field, from->GetEnumValue(source, field));
        break;
      case google::protobuf::FieldDescriptor::CPPTYPE_MESSAGE:
        if (field->is_repeated()) to->AddMessage(target, field)->CopyFrom(from->GetRepeatedMessage(source, field, index));
        else to->MutableMessage(target, field)->MergeFrom(from->GetMessage(source, field));
        break;
    }
  }
}

inline bool ApplyRoutingParameterPatch(const google::protobuf::Message& patch,
    const std::vector<std::string>& paths, google::protobuf::Message* parameters,
    std::string* error) {
  for (const auto& path : paths) {
    if (path.empty()) { *error = "Empty routing search parameter path."; return false; }
    const google::protobuf::Message* source = &patch;
    google::protobuf::Message* target = parameters;
    size_t begin = 0;
    while (begin < path.size()) {
      const size_t end = path.find('.', begin);
      const std::string part = path.substr(begin, end == std::string::npos ? end : end - begin);
      const auto* descriptor = source->GetDescriptor();
      const google::protobuf::FieldDescriptor* field = descriptor->FindFieldByName(part);
      if (!field) for (int i = 0; i < descriptor->field_count(); ++i) {
        if (descriptor->field(i)->json_name() == part) { field = descriptor->field(i); break; }
      }
      if (!field) { *error = "Unknown routing search parameter: " + path; return false; }
      if (end == std::string::npos) {
        CopyRoutingParameterField(*source, target, field);
        break;
      }
      if (field->is_repeated() || field->cpp_type() != google::protobuf::FieldDescriptor::CPPTYPE_MESSAGE) {
        *error = "Invalid routing search parameter path: " + path; return false;
      }
      source = &source->GetReflection()->GetMessage(*source, field);
      target = target->GetReflection()->MutableMessage(target, field);
      begin = end + 1;
      if (begin == path.size()) { *error = "Invalid routing search parameter path: " + path; return false; }
    }
  }
  return true;
}

inline bool ParseRoutingModelParameters(const std::string& bytes,
    const std::vector<std::string>& paths,
    operations_research::RoutingModelParameters* parameters, std::string* error) {
  operations_research::RoutingModelParameters patch;
  if (!patch.ParseFromString(bytes)) { *error = "Failed to parse RoutingModelParameters."; return false; }
  *parameters = operations_research::DefaultRoutingModelParameters();
  if (!ApplyRoutingParameterPatch(patch, paths, parameters, error)) return false;
  const auto& solver = parameters->solver_parameters();
  if (parameters->max_callback_cache_size() < 0 || solver.array_split_size() <= 0 ||
      solver.trail_block_size() <= 0 ||
      !operations_research::ConstraintSolverParameters_TrailCompression_IsValid(solver.compress_trail())) {
    *error = "Invalid RoutingModelParameters: cache size must be nonnegative, block sizes positive, and trail compression valid.";
    return false;
  }
  return true;
}

inline bool ParseRoutingSearchParameters(const std::string& bytes,
    const std::vector<std::string>& paths,
    operations_research::RoutingSearchParameters* parameters, std::string* error) {
  operations_research::RoutingSearchParameters patch;
  if (!patch.ParseFromString(bytes)) { *error = "Failed to parse RoutingSearchParameters."; return false; }
  *parameters = operations_research::DefaultRoutingSearchParameters();
  if (!ApplyRoutingParameterPatch(patch, paths, parameters, error)) return false;
  // Upstream skips this reflection check under __wasm__/__ANDROID__. Our bridge
  // uses full protobuf reflection, so preserve Python/native validation there too.
  const auto& operators = parameters->local_search_operators();
  const auto* descriptor = operators.GetDescriptor();
  const auto* reflection = operators.GetReflection();
  for (int index = 0; index < descriptor->field_count(); ++index) {
    const auto* field = descriptor->field(index);
    if (field->type() != google::protobuf::FieldDescriptor::TYPE_ENUM ||
        field->enum_type() != operations_research::OptionalBoolean_descriptor()) {
      *error = "Routing local search operator is not an OptionalBoolean: " + std::string(field->name());
      return false;
    }
    const int value = reflection->GetEnumValue(operators, field);
    if (!operations_research::OptionalBoolean_IsValid(value) || value == 0) {
      *error = "local_search_neighborhood_operator." + std::string(field->name()) +
          " should be set to BOOL_TRUE or BOOL_FALSE instead of " +
          std::string(operations_research::OptionalBoolean_Name(
              static_cast<operations_research::OptionalBoolean>(value))) +
          " (value: " + std::to_string(value) + ")";
      return false;
    }
  }
  if (parameters->sat_parameters().num_search_workers() != 0) {
    *error = "Routing CP-SAT num_search_workers is not supported; use num_workers."; return false;
  }
  if (parameters->sat_parameters().num_workers() < 0) {
    *error = "Routing CP-SAT num_workers must be nonnegative."; return false;
  }
  *error = operations_research::FindErrorInRoutingSearchParameters(*parameters);
  return error->empty();
}
}  // namespace ortools_wasm
#endif
