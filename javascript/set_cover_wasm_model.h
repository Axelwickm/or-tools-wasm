#ifndef ORTOOLS_WASM_SET_COVER_WASM_MODEL_H_
#define ORTOOLS_WASM_SET_COVER_WASM_MODEL_H_
#include <cmath>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <vector>
#include "ortools/set_cover/set_cover_model.h"
namespace ortools_wasm::set_cover_wasm {
using operations_research::BaseInt;
using operations_research::SetCoverModel;
using operations_research::SubsetBoolVector;
using operations_research::SubsetIndex;
inline BaseInt NumberToBaseInt(double value, const char* field, int index) {
  if (!std::isfinite(value) || std::trunc(value) != value ||
      value < static_cast<double>(std::numeric_limits<BaseInt>::min()) ||
      value > static_cast<double>(std::numeric_limits<BaseInt>::max())) {
    std::ostringstream out;
    out << field << "[" << index << "] must be a finite int32 value.";
    throw std::invalid_argument(out.str());
  }
  return static_cast<BaseInt>(value);
}

inline void WriteBoolVector(std::ostringstream& out, const std::vector<bool>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << (values[i] ? "true" : "false");
  }
  out << "]";
}

inline void WriteJsonNumber(std::ostream& out, double value) {
  if (std::isnan(value)) out << "\"NaN\"";
  else if (std::isinf(value)) out << (value > 0 ? "\"Infinity\"" : "\"-Infinity\"");
  else out << value;
}

inline SetCoverModel BuildModel(const double* costs_data, const double* starts_data,
                         const double* elements_data, int num_subsets,
                         int num_elements_data) {
  if (!starts_data || NumberToBaseInt(starts_data[0], "starts", 0) != 0 ||
      NumberToBaseInt(starts_data[num_subsets], "starts", num_subsets) != num_elements_data)
    throw std::invalid_argument("Set Cover offsets must span the complete element array.");
  SetCoverModel model;
  for (int subset = 0; subset < num_subsets; ++subset) {
    const double cost = costs_data[subset];
    if (!std::isfinite(cost)) {
      std::ostringstream out;
      out << "costs[" << subset << "] must be finite.";
      throw std::invalid_argument(out.str());
    }
    model.AddEmptySubset(cost);
    const BaseInt start = NumberToBaseInt(starts_data[subset], "starts", subset);
    const BaseInt end =
        NumberToBaseInt(starts_data[subset + 1], "starts", subset + 1);
    if (start < 0 || end < start || end > num_elements_data) {
      throw std::invalid_argument("SetCoverModel: invalid subset start offsets.");
    }
    for (BaseInt index = start; index < end; ++index) {
      const BaseInt element = NumberToBaseInt(elements_data[index], "elements", index);
      if (element < 0 || element == std::numeric_limits<BaseInt>::max()) {
        throw std::invalid_argument("Set Cover element index is out of range.");
      }
      model.AddElementToLastSubset(element);
    }
  }
  model.CreateSparseRowView();
  return model;
}

inline SubsetBoolVector ReadSolution(const double* selected_data, int num_subsets) {
  SubsetBoolVector solution(SubsetIndex(num_subsets), false);
  for (int subset = 0; subset < num_subsets; ++subset) {
    solution[SubsetIndex(subset)] = selected_data[subset] != 0.0;
  }
  return solution;
}

}  // namespace ortools_wasm::set_cover_wasm
#endif
