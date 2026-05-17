// Minimal C API surface for PDLP over WASM.
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <limits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <emscripten/emscripten.h>

#include "Eigen/SparseCore"
#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/pdlp/primal_dual_hybrid_gradient.h"
#include "ortools/pdlp/quadratic_program.h"
#include "ortools/pdlp/solvers.pb.h"

namespace {

using operations_research::MPModelProto;
using operations_research::pdlp::IsLinearProgram;
using operations_research::pdlp::PrimalAndDualSolution;
using operations_research::pdlp::PrimalDualHybridGradient;
using operations_research::pdlp::PrimalDualHybridGradientParams;
using operations_research::pdlp::QpFromMpModelProto;
using operations_research::pdlp::QpToMpModelProto;
using operations_research::pdlp::QuadraticProgram;
using operations_research::pdlp::SolverResult;
using operations_research::pdlp::SetEigenMatrixFromTriplets;
using operations_research::pdlp::ValidateQuadraticProgramDimensions;

class Reader {
 public:
  Reader(const uint8_t* data, size_t size) : data_(data), size_(size) {}

  bool ok() const { return ok_; }

  uint8_t ReadU8() {
    if (!Ensure(1)) return 0;
    return data_[offset_++];
  }

  uint32_t ReadU32() {
    if (!Ensure(sizeof(uint32_t))) return 0;
    uint32_t value;
    std::memcpy(&value, data_ + offset_, sizeof(value));
    offset_ += sizeof(value);
    return value;
  }

  double ReadDouble() {
    if (!Ensure(sizeof(double))) return 0.0;
    double value;
    std::memcpy(&value, data_ + offset_, sizeof(value));
    offset_ += sizeof(value);
    return value;
  }

  std::string ReadString() {
    const uint32_t size = ReadU32();
    if (!Ensure(size)) return std::string();
    std::string value(reinterpret_cast<const char*>(data_ + offset_), size);
    offset_ += size;
    return value;
  }

  std::vector<double> ReadDoubles() {
    const uint32_t size = ReadU32();
    std::vector<double> values(size);
    for (double& value : values) value = ReadDouble();
    return values;
  }

  std::vector<std::string> ReadStrings() {
    const uint32_t size = ReadU32();
    std::vector<std::string> values;
    values.reserve(size);
    for (uint32_t i = 0; i < size; ++i) values.push_back(ReadString());
    return values;
  }

 private:
  bool Ensure(size_t bytes) {
    if (!ok_ || offset_ + bytes > size_) {
      ok_ = false;
      return false;
    }
    return true;
  }

  const uint8_t* data_;
  size_t size_;
  size_t offset_ = 0;
  bool ok_ = true;
};

class Writer {
 public:
  void U8(uint8_t value) { data_.push_back(value); }

  void U32(uint32_t value) {
    const char* bytes = reinterpret_cast<const char*>(&value);
    data_.append(bytes, sizeof(value));
  }

  void Double(double value) {
    const char* bytes = reinterpret_cast<const char*>(&value);
    data_.append(bytes, sizeof(value));
  }

  void String(const std::string& value) {
    U32(static_cast<uint32_t>(value.size()));
    data_.append(value);
  }

  void Doubles(const Eigen::VectorXd& values) {
    U32(static_cast<uint32_t>(values.size()));
    for (int i = 0; i < values.size(); ++i) Double(values[i]);
  }

  void Doubles(const std::vector<double>& values) {
    U32(static_cast<uint32_t>(values.size()));
    for (double value : values) Double(value);
  }

  void Strings(const std::vector<std::string>& values) {
    U32(static_cast<uint32_t>(values.size()));
    for (const std::string& value : values) String(value);
  }

  uint8_t* Copy(size_t* out_len) const {
    if (out_len == nullptr) return nullptr;
    *out_len = data_.size();
    if (data_.empty()) return nullptr;
    auto* buffer = static_cast<uint8_t*>(std::malloc(data_.size()));
    if (buffer == nullptr) {
      *out_len = 0;
      return nullptr;
    }
    std::memcpy(buffer, data_.data(), data_.size());
    return buffer;
  }

 private:
  std::string data_;
};

uint8_t* CopyStringToBuffer(const std::string& value, size_t* out_len) {
  if (out_len == nullptr) return nullptr;
  *out_len = value.size();
  if (value.empty()) return nullptr;
  auto* buffer = static_cast<uint8_t*>(std::malloc(value.size()));
  if (buffer == nullptr) {
    *out_len = 0;
    return nullptr;
  }
  std::memcpy(buffer, value.data(), value.size());
  return buffer;
}

uint8_t* CopyProtoToBuffer(const google::protobuf::MessageLite& message,
                           size_t* out_len) {
  std::string data;
  if (!message.SerializeToString(&data)) {
    if (out_len != nullptr) *out_len = 0;
    return nullptr;
  }
  return CopyStringToBuffer(data, out_len);
}

Eigen::VectorXd ToEigenVector(const std::vector<double>& values) {
  Eigen::VectorXd vector(values.size());
  for (int i = 0; i < vector.size(); ++i) vector[i] = values[i];
  return vector;
}

std::vector<double> ToStdVector(const Eigen::VectorXd& values) {
  std::vector<double> vector(values.size());
  for (int i = 0; i < values.size(); ++i) vector[i] = values[i];
  return vector;
}

bool DecodeQuadraticProgram(Reader* reader, QuadraticProgram* qp) {
  if (qp == nullptr) return false;
  const uint32_t num_variables = reader->ReadU32();
  const uint32_t num_constraints = reader->ReadU32();
  qp->ResizeAndInitialize(num_variables, num_constraints);
  const std::string problem_name = reader->ReadString();
  if (!problem_name.empty()) qp->problem_name = problem_name;
  qp->objective_offset = reader->ReadDouble();
  qp->objective_scaling_factor = reader->ReadDouble();
  qp->objective_vector = ToEigenVector(reader->ReadDoubles());

  if (reader->ReadU8() != 0) {
    qp->objective_matrix.emplace();
    qp->objective_matrix->diagonal() = ToEigenVector(reader->ReadDoubles());
  } else {
    qp->objective_matrix.reset();
  }

  qp->constraint_lower_bounds = ToEigenVector(reader->ReadDoubles());
  qp->constraint_upper_bounds = ToEigenVector(reader->ReadDoubles());
  qp->variable_lower_bounds = ToEigenVector(reader->ReadDoubles());
  qp->variable_upper_bounds = ToEigenVector(reader->ReadDoubles());
  std::vector<std::string> variable_names = reader->ReadStrings();
  std::vector<std::string> constraint_names = reader->ReadStrings();
  if (!variable_names.empty()) qp->variable_names = std::move(variable_names);
  if (!constraint_names.empty()) {
    qp->constraint_names = std::move(constraint_names);
  }

  const uint32_t entry_count = reader->ReadU32();
  std::vector<Eigen::Triplet<double, int64_t>> entries;
  entries.reserve(entry_count);
  for (uint32_t i = 0; i < entry_count; ++i) {
    const uint32_t row = reader->ReadU32();
    const uint32_t col = reader->ReadU32();
    const double value = reader->ReadDouble();
    entries.emplace_back(row, col, value);
  }
  qp->constraint_matrix.resize(num_constraints, num_variables);
  SetEigenMatrixFromTriplets(std::move(entries), qp->constraint_matrix);
  return reader->ok();
}

uint8_t* EncodeQuadraticProgram(const QuadraticProgram& qp, size_t* out_len) {
  Writer writer;
  writer.U32(static_cast<uint32_t>(qp.objective_vector.size()));
  writer.U32(static_cast<uint32_t>(qp.constraint_lower_bounds.size()));
  writer.String(qp.problem_name.value_or(""));
  writer.Double(qp.objective_offset);
  writer.Double(qp.objective_scaling_factor);
  writer.Doubles(qp.objective_vector);
  if (qp.objective_matrix.has_value()) {
    writer.U8(1);
    writer.Doubles(qp.objective_matrix->diagonal());
  } else {
    writer.U8(0);
  }
  writer.Doubles(qp.constraint_lower_bounds);
  writer.Doubles(qp.constraint_upper_bounds);
  writer.Doubles(qp.variable_lower_bounds);
  writer.Doubles(qp.variable_upper_bounds);
  writer.Strings(qp.variable_names.value_or(std::vector<std::string>()));
  writer.Strings(qp.constraint_names.value_or(std::vector<std::string>()));

  writer.U32(static_cast<uint32_t>(qp.constraint_matrix.nonZeros()));
  for (int col = 0; col < qp.constraint_matrix.outerSize(); ++col) {
    for (Eigen::SparseMatrix<double, Eigen::ColMajor, int64_t>::InnerIterator it(
             qp.constraint_matrix, col);
         it; ++it) {
      writer.U32(static_cast<uint32_t>(it.row()));
      writer.U32(static_cast<uint32_t>(it.col()));
      writer.Double(it.value());
    }
  }
  return writer.Copy(out_len);
}

PrimalDualHybridGradientParams DecodeParams(Reader* reader) {
  PrimalDualHybridGradientParams params;
  if (reader->ReadU8()) {
    params.mutable_termination_criteria()->set_iteration_limit(reader->ReadU32());
  }
  if (reader->ReadU8()) {
    params.set_termination_check_frequency(reader->ReadU32());
  }
  if (reader->ReadU8()) {
    params.mutable_termination_criteria()
        ->mutable_simple_optimality_criteria()
        ->set_eps_optimal_relative(reader->ReadDouble());
  }
  if (reader->ReadU8()) {
    params.mutable_termination_criteria()
        ->mutable_simple_optimality_criteria()
        ->set_eps_optimal_absolute(reader->ReadDouble());
  }
  if (reader->ReadU8()) {
    params.set_l_inf_ruiz_iterations(reader->ReadU32());
  }
  if (reader->ReadU8()) {
    params.set_l2_norm_rescaling(reader->ReadU8() != 0);
  }
  return params;
}

std::optional<PrimalAndDualSolution> DecodeInitialSolution(Reader* reader) {
  if (reader->ReadU8() == 0) return std::nullopt;
  PrimalAndDualSolution solution;
  solution.primal_solution = ToEigenVector(reader->ReadDoubles());
  solution.dual_solution = ToEigenVector(reader->ReadDoubles());
  return solution;
}

uint8_t* EncodeSolverResult(const SolverResult& result, size_t* out_len) {
  Writer writer;
  writer.U8(1);
  writer.Doubles(result.primal_solution);
  writer.Doubles(result.dual_solution);
  writer.Doubles(result.reduced_costs);
  writer.U32(static_cast<uint32_t>(result.solve_log.termination_reason()));
  writer.U32(static_cast<uint32_t>(result.solve_log.iteration_count()));
  return writer.Copy(out_len);
}

uint8_t* EncodeSolverError(const std::string& message, size_t* out_len) {
  Writer writer;
  writer.U8(0);
  writer.String(message);
  return writer.Copy(out_len);
}

}  // namespace

extern "C" {

#ifndef ORTOOLS_WASM_NO_LOCAL_FREE_BUFFER
EMSCRIPTEN_KEEPALIVE void free_buffer(uint8_t* ptr) { std::free(ptr); }
#endif

EMSCRIPTEN_KEEPALIVE
uint8_t* pdlp_validate_quadratic_program(const uint8_t* qp_data, size_t qp_len,
                                         size_t* out_len) {
  Reader reader(qp_data, qp_len);
  QuadraticProgram qp;
  if (!DecodeQuadraticProgram(&reader, &qp)) {
    return CopyStringToBuffer("Could not parse QuadraticProgram.", out_len);
  }
  const absl::Status status = ValidateQuadraticProgramDimensions(qp);
  if (status.ok()) return CopyStringToBuffer("", out_len);
  return CopyStringToBuffer(std::string(status.message()), out_len);
}

EMSCRIPTEN_KEEPALIVE
int pdlp_is_linear_program(const uint8_t* qp_data, size_t qp_len) {
  Reader reader(qp_data, qp_len);
  QuadraticProgram qp;
  if (!DecodeQuadraticProgram(&reader, &qp)) return 0;
  return IsLinearProgram(qp) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* pdlp_qp_from_mpmodel_proto(const uint8_t* proto_data, size_t proto_len,
                                    int relax_integer_variables,
                                    int include_names, size_t* out_len) {
  MPModelProto proto;
  if (!proto.ParseFromArray(proto_data, static_cast<int>(proto_len))) {
    return CopyStringToBuffer("", out_len);
  }
  absl::StatusOr<QuadraticProgram> qp = QpFromMpModelProto(
      proto, relax_integer_variables != 0, include_names != 0);
  if (!qp.ok()) return CopyStringToBuffer("", out_len);
  return EncodeQuadraticProgram(*qp, out_len);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* pdlp_qp_to_mpmodel_proto(const uint8_t* qp_data, size_t qp_len,
                                  size_t* out_len) {
  Reader reader(qp_data, qp_len);
  QuadraticProgram qp;
  if (!DecodeQuadraticProgram(&reader, &qp)) {
    return CopyStringToBuffer("", out_len);
  }
  absl::StatusOr<MPModelProto> proto = QpToMpModelProto(qp);
  if (!proto.ok()) return CopyStringToBuffer("", out_len);
  return CopyProtoToBuffer(*proto, out_len);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* pdlp_primal_dual_hybrid_gradient(const uint8_t* request_data,
                                          size_t request_len,
                                          size_t* out_len) {
  try {
    Reader reader(request_data, request_len);
    QuadraticProgram qp;
    const bool parsed_qp = DecodeQuadraticProgram(&reader, &qp);
    PrimalDualHybridGradientParams params = DecodeParams(&reader);
    std::optional<PrimalAndDualSolution> initial_solution =
        DecodeInitialSolution(&reader);
    if (!reader.ok() || !parsed_qp) {
      return CopyStringToBuffer("", out_len);
    }
    SolverResult result = PrimalDualHybridGradient(
        std::move(qp), std::move(params), std::move(initial_solution));
    return EncodeSolverResult(result, out_len);
  } catch (const std::exception& e) {
    return EncodeSolverError(e.what(), out_len);
  } catch (...) {
    return EncodeSolverError("Unknown PDLP solve failure.", out_len);
  }
}

}  // extern "C"
