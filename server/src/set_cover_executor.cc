#include "server/src/set_cover_executor.h"

#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "ortools/set_cover/base_types.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"
#include "ortools/set_cover/set_cover_model.h"
#include "set_cover.pb.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::BaseInt;
using ::operations_research::ElementDegreeSolutionGenerator;
using ::operations_research::GreedySolutionGenerator;
using ::operations_research::GuidedLocalSearch;
using ::operations_research::GuidedTabuSearch;
using ::operations_research::LazyElementDegreeSolutionGenerator;
using ::operations_research::RandomSolutionGenerator;
using ::operations_research::SetCoverInvariant;
using ::operations_research::SetCoverModel;
using ::operations_research::SteepestSearch;
using ::operations_research::SubsetBoolVector;
using ::operations_research::SubsetIndex;
using ::operations_research::TrivialSolutionGenerator;

SolverExecutorResult Error(std::string message) {
  SolverExecutorResult result;
  result.ok = false;
  result.error_message = std::move(message);
  result.failure_kind = SolverExecutionFailureKind::kInvalidRequest;
  return result;
}

template <typename Generator, typename Focus>
bool Next(Generator* generator, bool has_focus, const Focus& focus) {
  return has_focus ? generator->NextSolution(focus) : generator->NextSolution();
}

SolverExecutorResult Solve(const bridge::SetCoverBridgeRequest& request) {
  if (request.costs_size() != request.selected_size() ||
      request.starts_size() != request.costs_size() + 1 ||
      (request.has_focus() && request.focus_size() != request.costs_size())) {
    return Error("Set Cover request dimensions are inconsistent.");
  }
  if (!std::isfinite(request.max_iterations()) &&
      !std::isinf(request.max_iterations())) {
    return Error("Set Cover max iterations must be finite or infinity.");
  }

  SetCoverModel model;
  for (int subset = 0; subset < request.costs_size(); ++subset) {
    if (!std::isfinite(request.costs(subset))) return Error("Set Cover costs must be finite.");
    const int start = request.starts(subset);
    const int end = request.starts(subset + 1);
    if (start < 0 || end < start || end > request.elements_size()) {
      return Error("Set Cover subset offsets are invalid.");
    }
    model.AddEmptySubset(request.costs(subset));
    for (int index = start; index < end; ++index) {
      if (request.elements(index) < 0) return Error("Set Cover elements must be non-negative.");
      model.AddElementToLastSubset(request.elements(index));
    }
  }
  model.CreateSparseRowView();
  SetCoverInvariant invariant(&model);
  SubsetBoolVector selected(SubsetIndex(request.selected_size()), false);
  SubsetBoolVector focus(SubsetIndex(request.focus_size()), false);
  std::vector<SubsetIndex> focus_indices;
  for (int subset = 0; subset < request.selected_size(); ++subset) {
    selected[SubsetIndex(subset)] = request.selected(subset);
    if (request.has_focus() && request.focus(subset)) {
      focus[SubsetIndex(subset)] = true;
      focus_indices.push_back(SubsetIndex(subset));
    }
  }
  invariant.LoadSolution(selected);
  const int64_t max_iterations = std::isinf(request.max_iterations())
                                     ? std::numeric_limits<int64_t>::max()
                                     : static_cast<int64_t>(request.max_iterations());
  if (max_iterations < 0 || std::trunc(request.max_iterations()) != request.max_iterations()) {
    return Error("Set Cover max iterations must be a non-negative integer or infinity.");
  }

  bool next_solution;
  switch (request.operation()) {
    case bridge::SET_COVER_OPERATION_TRIVIAL: {
      TrivialSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      break;
    }
    case bridge::SET_COVER_OPERATION_GREEDY: {
      GreedySolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      break;
    }
    case bridge::SET_COVER_OPERATION_ELEMENT_DEGREE: {
      ElementDegreeSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus);
      break;
    }
    case bridge::SET_COVER_OPERATION_LAZY_ELEMENT_DEGREE: {
      LazyElementDegreeSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus);
      break;
    }
    case bridge::SET_COVER_OPERATION_RANDOM: {
      RandomSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      break;
    }
    case bridge::SET_COVER_OPERATION_STEEPEST: {
      SteepestSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus);
      break;
    }
    case bridge::SET_COVER_OPERATION_GUIDED_LOCAL: {
      GuidedLocalSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      break;
    }
    case bridge::SET_COVER_OPERATION_GUIDED_TABU: {
      GuidedTabuSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      break;
    }
    default:
      return Error("Set Cover request has no valid operation.");
  }

  bridge::SetCoverBridgeResponse response;
  response.set_next_solution(next_solution);
  response.set_cost(invariant.cost());
  response.set_num_uncovered_elements(invariant.num_uncovered_elements());
  for (bool value : invariant.is_selected().get()) response.add_selected(value);
  for (int value : invariant.coverage().get()) response.add_coverage(value);
  for (int value : invariant.num_free_elements().get()) response.add_num_free_elements(value);
  for (int value : invariant.num_coverage_le_1_elements().get()) {
    response.add_num_coverage_le_1_elements(value);
  }
  for (bool value : invariant.is_redundant().get()) response.add_is_redundant(value);
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize Set Cover response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

}  // namespace

std::string SetCoverExecutor::solver() const { return "set-cover"; }

int SetCoverExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                       int client_requested_threads,
                                       int server_total_threads) const {
  bridge::SetCoverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) {
    throw std::invalid_argument("Failed to parse Set Cover bridge request.");
  }
  if (client_requested_threads != 0 && client_requested_threads != 1) {
    throw std::invalid_argument("Set Cover jobs require exactly one thread.");
  }
  if (server_total_threads < 1) throw std::invalid_argument("Server has no Set Cover capacity.");
  return 1;
}

SolverExecutorResult SetCoverExecutor::Execute(const SolverExecutorRequest& request,
                                               const JobContext& context,
                                               const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::SetCoverBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) return Error("Failed to parse Set Cover bridge request.");
  if (context.cancellation_requested()) {
    auto result = Error("Set Cover solve was cancelled before it started.");
    result.failure_kind = SolverExecutionFailureKind::kCancelled;
    return result;
  }
  return Solve(parsed);
}

}  // namespace ortools_wasm::server
