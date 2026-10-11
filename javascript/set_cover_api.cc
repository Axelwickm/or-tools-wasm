// Minimal C API surface for OR-Tools set-cover algorithms over WASM.
#include <cmath>
#include <cstdint>
#include <exception>
#include <iomanip>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/set_cover/base_types.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"
#include "ortools/set_cover/set_cover_model.h"
#include "set_cover_statistics.h"
#include "set_cover_guided_tabu.h"
#include "set_cover_guided_session.h"
#include "set_cover_trace.h"

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
ortools_wasm::SetCoverGuidedSessions g_guided_sessions;

uint64_t SessionHandle(uint32_t low, uint32_t high) {
  return static_cast<uint64_t>(low) | (static_cast<uint64_t>(high) << 32);
}

ortools_wasm::GuidedTabuParameters GuidedTabuParametersFromArgs(
    int mask, double lagrangian, double epsilon, double penalty, int tabu_size) {
  if (mask < 0 || mask > 15) throw std::invalid_argument("Invalid guided tabu parameter mask.");
  ortools_wasm::GuidedTabuParameters parameters;
  if (mask & 1) parameters.lagrangian_factor = lagrangian;
  if (mask & 2) parameters.epsilon = epsilon;
  if (mask & 4) parameters.penalty_factor = penalty;
  if (mask & 8) parameters.tabu_list_size = tabu_size;
  return parameters;
}

void WriteGuidedTabuParameters(std::ostream& out, const ortools_wasm::GuidedTabuParameters& parameters) {
  out << "{\"lagrangianFactor\":" << *parameters.lagrangian_factor
      << ",\"epsilon\":" << *parameters.epsilon
      << ",\"penaltyFactor\":" << *parameters.penalty_factor
      << ",\"tabuListSize\":" << *parameters.tabu_list_size << '}';
}

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

void WriteJsonNumber(std::ostream& out, double value) {
  if (std::isnan(value)) out << "\"NaN\"";
  else if (std::isinf(value)) out << (value > 0 ? "\"Infinity\"" : "\"-Infinity\"");
  else out << value;
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

const char* SessionResult(ortools_wasm::SetCoverGuidedSession& session, bool next = false, uint64_t handle = 0) {
  auto& invariant = session.invariant;
  invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kRedundancy);
  const auto exported = invariant.ExportSolutionAsProto();
  std::ostringstream out; out << std::setprecision(17) << "{\"ok\":true,\"nextSolution\":" << (next ? "true" : "false")
      << ",\"cost\":";
  WriteJsonNumber(out, invariant.cost());
  out << ",\"numUncoveredElements\":" << invariant.num_uncovered_elements()
      << ",\"costLowerBound\":";
  WriteJsonNumber(out, exported.cost_lower_bound());
  out << ",\"selected\":";
  WriteBoolVector(out, invariant.is_selected().get());
  out << ",\"coverage\":"; WriteVector(out, invariant.coverage().get());
  out << ",\"numFreeElements\":"; WriteVector(out, invariant.num_free_elements().get());
  out << ",\"numCoverageLe1Elements\":"; WriteVector(out, invariant.num_coverage_le_1_elements().get());
  out << ",\"isRedundant\":"; WriteBoolVector(out, invariant.is_redundant().get());
  out << ",\"trace\":[";
  bool first = true;
  for (const auto& decision : invariant.trace()) {
    if (!first) out << ','; first = false;
    out << "{\"subset\":" << decision.subset().value() << ",\"selected\":" << (decision.decision() ? "true" : "false") << '}';
  }
  out << ']';
  if (handle) out << ",\"sessionHandle\":\"" << handle << '\"';
  if (session.tabu) { out << ",\"guidedTabuParameters\":"; WriteGuidedTabuParameters(out, ortools_wasm::ReadGuidedTabuParameters(*session.tabu)); }
  out << '}'; return StoreString(out.str());
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* set_cover_compress_trace(int num_subsets, const double* decisions, int count) {
  try {
    if (count < 0 || (count > 0 && !decisions)) throw std::invalid_argument("Invalid Set Cover trace dimensions.");
    std::vector<operations_research::SetCoverDecision> trace;
    for (int i = 0; i < count; ++i) {
      const int subset = NumberToBaseInt(decisions[2 * i], "trace", i);
      const double selected = decisions[2 * i + 1];
      if (selected != 0 && selected != 1) throw std::invalid_argument("Invalid Set Cover trace decision.");
      trace.emplace_back(SubsetIndex(subset), selected != 0);
    }
    const auto compressed = ortools_wasm::CompressSetCoverTrace(num_subsets, trace);
    std::ostringstream out;
    out << "{\"ok\":true,\"trace\":[";
    for (size_t i = 0; i < compressed.size(); ++i) {
      if (i) out << ',';
      out << "{\"subset\":" << compressed[i].subset().value() << ",\"selected\":true}";
    }
    out << "]}";
    g_set_cover_string_result = out.str();
    return g_set_cover_string_result.c_str();
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_guided_tabu_parameters(
    int mask, double lagrangian, double epsilon, double penalty, int tabu_size,
    uint32_t handle_low = 0, uint32_t handle_high = 0) {
  try {
    const auto parameters = GuidedTabuParametersFromArgs(mask, lagrangian, epsilon, penalty, tabu_size);
    if (const auto handle = SessionHandle(handle_low, handle_high); handle != 0) {
      const auto session = g_guided_sessions.Find(handle);
      std::lock_guard lock(session->mutex);
      session->RequireOpen();
      if (!session->tabu) throw std::invalid_argument("Guided tabu parameters require guided tabu search.");
      session->Configure(parameters);
      std::ostringstream out; out << std::setprecision(17) << "{\"ok\":true,\"guidedTabuParameters\":";
      WriteGuidedTabuParameters(out, ortools_wasm::ReadGuidedTabuParameters(*session->tabu));
      out << '}'; return StoreString(out.str());
    }
    SetCoverModel model;
    SetCoverInvariant invariant(&model);
    GuidedTabuSearch generator(&invariant);
    ortools_wasm::ConfigureGuidedTabuSearch(&generator, parameters);
    std::ostringstream out; out << std::setprecision(17) << "{\"ok\":true,\"guidedTabuParameters\":";
    WriteGuidedTabuParameters(out, ortools_wasm::ReadGuidedTabuParameters(generator));
    out << '}'; return StoreString(out.str());
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_session_create(
    const double* costs, const double* starts, const double* elements,
    int num_subsets, int num_elements, const double* selected, int algorithm,
    int mask, double lagrangian, double epsilon, double penalty, int tabu_size) {
  try {
    if (num_subsets <= 0 || num_elements < 0 || !costs || !starts || !selected || (num_elements && !elements)) throw std::invalid_argument("Invalid Set Cover session input buffers.");
    if (algorithm != 6 && algorithm != 7) throw std::invalid_argument("Set Cover sessions require guided local or guided tabu search.");
    const auto handle = g_guided_sessions.Create(BuildModel(costs, starts, elements, num_subsets, num_elements),
        ReadSolution(selected, num_subsets), algorithm == 7, GuidedTabuParametersFromArgs(mask, lagrangian, epsilon, penalty, tabu_size));
    const auto session = g_guided_sessions.Find(handle);
    std::lock_guard lock(session->mutex);
    return SessionResult(*session, false, handle);
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_session_initialize(uint32_t low, uint32_t high,
    const double* selected, int count, int mask, double lagrangian, double epsilon, double penalty, int tabu_size) {
  try {
    if (count < 0 || (count && !selected)) throw std::invalid_argument("Invalid Set Cover session solution buffer.");
    const auto session = g_guided_sessions.Find(SessionHandle(low, high));
    std::lock_guard lock(session->mutex);
    session->Initialize(ReadSolution(selected, count), GuidedTabuParametersFromArgs(mask, lagrangian, epsilon, penalty, tabu_size));
    return SessionResult(*session);
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_session_next(uint32_t low, uint32_t high,
    const double* focus, int count, int has_focus, double max_iterations, double time_limit,
    int mask, double lagrangian, double epsilon, double penalty, int tabu_size) {
  try {
    if (count < 0 || (count && !focus)) throw std::invalid_argument("Invalid Set Cover session focus buffer.");
    const auto session = g_guided_sessions.Find(SessionHandle(low, high));
    std::lock_guard lock(session->mutex);
    if (has_focus && count != session->model.num_subsets()) throw std::invalid_argument("Set Cover session focus dimensions do not match.");
    const auto indices = has_focus ? ReadFocusIndices(focus, count) : std::vector<SubsetIndex>();
    const bool next = session->Next(indices, has_focus != 0, max_iterations, time_limit,
        GuidedTabuParametersFromArgs(mask, lagrangian, epsilon, penalty, tabu_size));
    return SessionResult(*session, next);
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_session_delete(uint32_t low, uint32_t high) {
  g_guided_sessions.Delete(SessionHandle(low, high));
  return StoreString("{\"ok\":true}");
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_statistics(const double* costs, const double* starts,
    const double* elements, int num_subsets, int num_elements_data, int kind) {
  try {
    if (num_subsets < 0 || num_elements_data < 0 || (num_subsets && (!costs || !starts)) || (num_elements_data && !elements))
      return ErrorResult("Invalid Set Cover statistics buffers.");
    const auto model = BuildModel(costs, starts, elements, num_subsets, num_elements_data);
    const auto result = ortools_wasm::ComputeSetCoverStatistics(model, kind);
    std::ostringstream out; out << std::setprecision(17) << "{\"ok\":true,";
    if (kind < 3) {
      out << "\"statistics\":{\"min\":"; WriteJsonNumber(out, result.stats.min);
      out << ",\"max\":"; WriteJsonNumber(out, result.stats.max);
      out << ",\"median\":"; WriteJsonNumber(out, result.stats.median);
      out << ",\"mean\":"; WriteJsonNumber(out, result.stats.mean);
      out << ",\"stddev\":"; WriteJsonNumber(out, result.stats.stddev);
      out << ",\"iqr\":"; WriteJsonNumber(out, result.stats.iqr); out << "}";
    } else {
      out << "\"deciles\":[";
      for (size_t i = 0; i < result.deciles.size(); ++i) { if (i) out << ','; out << result.deciles[i]; }
      out << ']';
    }
    out << '}'; return StoreString(out.str());
  } catch (const std::exception& error) { return ErrorResult(error.what()); }
}


EMSCRIPTEN_KEEPALIVE const char* set_cover_next_solution_with_limits(
    const double* costs_data, const double* starts_data,
    const double* elements_data, int num_subsets, int num_elements_data,
    const double* selected_data, const double* focus_data, int operation,
    double max_iterations, double time_limit_seconds, int focus_count = -1,
    int parameter_mask = 0, double lagrangian = 0, double epsilon = 0,
    double penalty = 0, int tabu_size = 0) {
  if (std::isnan(time_limit_seconds) || time_limit_seconds < 0) {
    return ErrorResult("SetCover: time limit must be non-negative seconds or positive infinity.");
  }
  if (num_subsets < 0 || num_elements_data < 0 ||
      (num_subsets > 0 &&
       (costs_data == nullptr || starts_data == nullptr ||
        selected_data == nullptr)) ||
      (num_elements_data > 0 && elements_data == nullptr)) {
    return ErrorResult("SetCover: invalid input pointers or dimensions.");
  }

  if (max_iterations != std::numeric_limits<double>::infinity() &&
      (!std::isfinite(max_iterations) || max_iterations < 0 ||
       std::trunc(max_iterations) != max_iterations ||
       max_iterations >= 9223372036854775808.0)) {
    return ErrorResult("SetCover: max iterations must be a non-negative int64 or positive infinity.");
  }
  try {
    if (parameter_mask != 0 && operation != 7) throw std::invalid_argument("Guided tabu parameters require guided tabu search.");
    SetCoverModel model =
        BuildModel(costs_data, starts_data, elements_data, num_subsets,
                   num_elements_data);
    SetCoverInvariant invariant(&model);
    invariant.LoadSolution(ReadSolution(selected_data, num_subsets));
    const SubsetBoolVector focus = operation == 8 ? SubsetBoolVector(SubsetIndex(num_subsets), true) : ReadFocus(focus_data, num_subsets);
    std::vector<SubsetIndex> focus_indices;
    if (operation == 8 && focus_count >= 0) {
      if (focus_count && !focus_data) throw std::invalid_argument("Missing Set Cover focus indices.");
      for (int i = 0; i < focus_count; ++i) {
        const int index = NumberToBaseInt(focus_data[i], "focus", i);
        if (index < 0 || index >= num_subsets) throw std::invalid_argument("Invalid Set Cover focus index.");
        focus_indices.push_back(SubsetIndex(index));
      }
    } else focus_indices = ReadFocusIndices(focus_data, num_subsets);
    const int64_t max_iters =
        std::isfinite(max_iterations) && max_iterations >= 0.0
            ? static_cast<int64_t>(max_iterations)
            : std::numeric_limits<int64_t>::max();

    bool next = false;
    std::optional<ortools_wasm::GuidedTabuParameters> effective_parameters;
    switch (operation) {
      case 8: break;
      case 0: {
        TrivialSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 1: {
        GreedySolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 2: {
        ElementDegreeSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 3: {
        LazyElementDegreeSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 4: {
        RandomSolutionGenerator generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 5: {
        SteepestSearch generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunBoolFocusGenerator(&generator, focus_data, focus);
        break;
      }
      case 6: {
        GuidedLocalSearch generator(&invariant);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      case 7: {
        GuidedTabuSearch generator(&invariant);
        ortools_wasm::ConfigureGuidedTabuSearch(&generator,
            GuidedTabuParametersFromArgs(parameter_mask, lagrangian, epsilon, penalty, tabu_size));
        effective_parameters = ortools_wasm::ReadGuidedTabuParameters(generator);
        generator.SetMaxIterations(max_iters);
        generator.SetTimeLimitInSeconds(time_limit_seconds);
        next = RunListFocusGenerator(&generator, focus_data, focus_indices);
        break;
      }
      default:
        throw std::invalid_argument("SetCover: unknown solution operation.");
    }

    invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kCostAndCoverage);
    std::vector<bool> computed_redundancy;
    for (const auto subset : model.SubsetRange()) computed_redundancy.push_back(invariant.ComputeIsRedundant(subset));
    invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kRedundancy);
    const auto focus_coverage = invariant.ComputeCoverageInFocus(focus_indices);
    const auto exported = invariant.ExportSolutionAsProto();

    std::ostringstream out;
    out.precision(std::numeric_limits<double>::max_digits10);
    out << "{\"ok\":true,\"nextSolution\":" << (next ? "true" : "false")
        << ",\"cost\":";
    WriteJsonNumber(out, invariant.cost());
    out << ",\"numUncoveredElements\":" << invariant.num_uncovered_elements()
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
    out << ",\"costLowerBound\":";
    WriteJsonNumber(out, exported.cost_lower_bound());
    out << ",\"computedRedundancy\":"; WriteBoolVector(out, computed_redundancy);
    out << ",\"focusCoverage\":"; WriteVector(out, focus_coverage.get());
    out << ",\"trace\":[";
    for (size_t i = 0; i < invariant.trace().size(); ++i) {
      if (i) out << ',';
      const auto& decision = invariant.trace()[i];
      out << "{\"subset\":" << decision.subset().value()
          << ",\"selected\":" << (decision.decision() ? "true" : "false") << '}';
    }
    out << ']';
    if (effective_parameters) { out << ",\"guidedTabuParameters\":"; WriteGuidedTabuParameters(out, *effective_parameters); }
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SetCover: unknown native error.");
  }
}

EMSCRIPTEN_KEEPALIVE const char* set_cover_next_solution_serialized(
    const double* costs_data, const double* starts_data,
    const double* elements_data, int num_subsets, int num_elements_data,
    const double* selected_data, const double* focus_data, int operation,
    double max_iterations) {
  return set_cover_next_solution_with_limits(costs_data, starts_data, elements_data,
      num_subsets, num_elements_data, selected_data, focus_data, operation,
      max_iterations, std::numeric_limits<double>::infinity());
}

}  // extern "C"
