// Minimal C API surface for OR-Tools set-cover algorithms over WASM.
#include <cmath>
#include <cstdint>
#include <exception>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/set_cover/base_types.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"
#include "ortools/set_cover/set_cover_model.h"

namespace {

using operations_research::BaseInt;
using operations_research::ElementDegreeSolutionGenerator;
using operations_research::GreedySolutionGenerator;
using operations_research::GuidedLocalSearch;
using operations_research::GuidedTabuSearch;
using operations_research::LazyElementDegreeSolutionGenerator;
using operations_research::RandomSolutionGenerator;
using operations_research::SetCoverInvariant;
using operations_research::SetCoverModel;
using operations_research::SteepestSearch;
using operations_research::SubsetBoolVector;
using operations_research::SubsetIndex;
using operations_research::TrivialSolutionGenerator;

std::string g_set_cover_string_result;

const char* StoreString(std::string value) {
  g_set_cover_string_result = std::move(value);
  return g_set_cover_string_result.c_str();
}

std::string JsonEscape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char ch : value) {
    if (ch == '\\' || ch == '"') {
      escaped.push_back('\\');
      escaped.push_back(ch);
    } else if (ch == '\n') {
      escaped += "\\n";
    } else if (ch == '\r') {
      escaped += "\\r";
    } else if (ch == '\t') {
      escaped += "\\t";
    } else {
      escaped.push_back(ch);
    }
  }
  return escaped;
}

const char* ErrorResult(const std::string& message) {
  std::ostringstream out;
  out << "{\"ok\":false,\"error\":\"" << JsonEscape(message) << "\"}";
  return StoreString(out.str());
}

BaseInt NumberToBaseInt(double value, const char* field, int index) {
  if (!std::isfinite(value) || std::trunc(value) != value ||
      value < static_cast<double>(std::numeric_limits<BaseInt>::min()) ||
      value > static_cast<double>(std::numeric_limits<BaseInt>::max())) {
    std::ostringstream out;
    out << field << "[" << index << "] must be a finite int32 value.";
    throw std::invalid_argument(out.str());
  }
  return static_cast<BaseInt>(value);
}

void WriteBoolVector(std::ostringstream& out, const std::vector<bool>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << (values[i] ? "true" : "false");
  }
  out << "]";
}

template <typename T>
void WriteVector(std::ostringstream& out, const std::vector<T>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << values[i];
  }
  out << "]";
}

SetCoverModel BuildModel(const double* costs_data, const double* starts_data,
                         const double* elements_data, int num_subsets,
                         int num_elements_data) {
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
      model.AddElementToLastSubset(
          NumberToBaseInt(elements_data[index], "elements", index));
    }
  }
  model.CreateSparseRowView();
  return model;
}

SubsetBoolVector ReadSolution(const double* selected_data, int num_subsets) {
  SubsetBoolVector solution(SubsetIndex(num_subsets), false);
  for (int subset = 0; subset < num_subsets; ++subset) {
    solution[SubsetIndex(subset)] = selected_data[subset] != 0.0;
  }
  return solution;
}

SubsetBoolVector ReadFocus(const double* focus_data, int num_subsets) {
  SubsetBoolVector focus(SubsetIndex(num_subsets), true);
  if (focus_data == nullptr) return focus;
  for (int subset = 0; subset < num_subsets; ++subset) {
    focus[SubsetIndex(subset)] = focus_data[subset] != 0.0;
  }
  return focus;
}

std::vector<SubsetIndex> ReadFocusIndices(const double* focus_data,
                                          int num_subsets) {
  std::vector<SubsetIndex> focus;
  focus.reserve(num_subsets);
  for (int subset = 0; subset < num_subsets; ++subset) {
    if (focus_data == nullptr || focus_data[subset] != 0.0) {
      focus.push_back(SubsetIndex(subset));
    }
  }
  return focus;
}

template <typename Generator>
bool RunBoolFocusGenerator(Generator* generator, const double* focus_data,
                           const SubsetBoolVector& focus) {
  return focus_data == nullptr ? generator->NextSolution()
                               : generator->NextSolution(focus);
}

template <typename Generator>
bool RunListFocusGenerator(Generator* generator, const double* focus_data,
                           const std::vector<SubsetIndex>& focus) {
  return focus_data == nullptr ? generator->NextSolution()
                               : generator->NextSolution(focus);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* set_cover_next_solution_serialized(
    const double* costs_data, const double* starts_data,
    const double* elements_data, int num_subsets, int num_elements_data,
    const double* selected_data, const double* focus_data, int operation,
    double max_iterations) {
  if (num_subsets < 0 || num_elements_data < 0 ||
      (num_subsets > 0 &&
       (costs_data == nullptr || starts_data == nullptr ||
        selected_data == nullptr)) ||
      (num_elements_data > 0 && elements_data == nullptr)) {
    return ErrorResult("SetCover: invalid input pointers or dimensions.");
  }

  try {
    SetCoverModel model =
        BuildModel(costs_data, starts_data, elements_data, num_subsets,
                   num_elements_data);
    SetCoverInvariant invariant(&model);
    invariant.LoadSolution(ReadSolution(selected_data, num_subsets));
    const SubsetBoolVector focus = ReadFocus(focus_data, num_subsets);
    const std::vector<SubsetIndex> focus_indices =
        ReadFocusIndices(focus_data, num_subsets);
    const int64_t max_iters =
        std::isfinite(max_iterations) && max_iterations >= 0.0
            ? static_cast<int64_t>(max_iterations)
            : std::numeric_limits<int64_t>::max();

    bool next = false;
    switch (operation) {
      case 0: {
        TrivialSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 1: {
        GreedySolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 2: {
        ElementDegreeSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 3: {
        LazyElementDegreeSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 4: {
        RandomSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 5: {
        SteepestSearch generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 6: {
        GuidedLocalSearch generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 7: {
        GuidedTabuSearch generator(&invariant);
        generator.SetMaxIterations(max_iters);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      default:
        throw std::invalid_argument("SetCover: unknown solution operation.");
    }

    std::ostringstream out;
    out << "{\"ok\":true,\"nextSolution\":" << (next ? "true" : "false")
        << ",\"cost\":" << invariant.cost()
        << ",\"numUncoveredElements\":" << invariant.num_uncovered_elements()
        << ",\"selected\":";
    WriteBoolVector(out, invariant.is_selected().get());
    out << ",\"coverage\":";
    WriteVector(out, invariant.coverage().get());
    out << ",\"numFreeElements\":";
    WriteVector(out, invariant.num_free_elements().get());
    out << ",\"numCoverageLe1Elements\":";
    WriteVector(out, invariant.num_coverage_le_1_elements().get());
    out << ",\"isRedundant\":";
    WriteBoolVector(out, invariant.is_redundant().get());
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SetCover: unknown native error.");
  }
}

}  // extern "C"
