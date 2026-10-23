#include "server/src/set_cover_executor.h"

#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "ortools/set_cover/base_types.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"
#include "ortools/set_cover/set_cover_model.h"
#include "set_cover.pb.h"
#include "javascript/set_cover_statistics.h"
#include "javascript/set_cover_lagrangian.h"
#include "javascript/set_cover_cft.h"
#include "javascript/set_cover_mip.h"
#include "javascript/set_cover_guided_tabu.h"
#include "javascript/set_cover_guided_session.h"
#include "javascript/set_cover_trace.h"
#include "javascript/set_cover_mutations.h"
#include "javascript/set_cover_formats.h"

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

ortools_wasm::GuidedTabuParameters GuidedTabuParametersFromProto(
    const bridge::SetCoverGuidedTabuParameters& input) {
  ortools_wasm::GuidedTabuParameters parameters;
  if (input.has_lagrangian_factor()) parameters.lagrangian_factor = input.lagrangian_factor();
  if (input.has_epsilon()) parameters.epsilon = input.epsilon();
  if (input.has_penalty_factor()) parameters.penalty_factor = input.penalty_factor();
  if (input.has_tabu_list_size()) parameters.tabu_list_size = input.tabu_list_size();
  return parameters;
}

void WriteGuidedTabuParameters(const ortools_wasm::GuidedTabuParameters& parameters,
                               bridge::SetCoverBridgeResponse* response) {
  auto* output = response->mutable_guided_tabu_parameters();
  output->set_lagrangian_factor(*parameters.lagrangian_factor);
  output->set_epsilon(*parameters.epsilon);
  output->set_penalty_factor(*parameters.penalty_factor);
  output->set_tabu_list_size(*parameters.tabu_list_size);
}

template <typename Generator, typename Focus>
bool Next(Generator* generator, bool has_focus, const Focus& focus) {
  return has_focus ? generator->NextSolution(focus) : generator->NextSolution();
}

SetCoverModel BuildModel(const bridge::SetCoverBridgeRequest& request) {
  if (request.starts_size() != request.costs_size() + 1) throw std::invalid_argument("Set Cover request dimensions are inconsistent.");
  if (request.starts(0) != 0 || request.starts(request.costs_size()) != request.elements_size())
    throw std::invalid_argument("Set Cover offsets must span the complete element array.");
  SetCoverModel model;
  for (int subset = 0; subset < request.costs_size(); ++subset) {
    if (!std::isfinite(request.costs(subset))) throw std::invalid_argument("Set Cover costs must be finite.");
    const int start = request.starts(subset);
    const int end = request.starts(subset + 1);
    if (start < 0 || end < start || end > request.elements_size()) {
      throw std::invalid_argument("Set Cover subset offsets are invalid.");
    }
    model.AddEmptySubset(request.costs(subset));
    for (int index = start; index < end; ++index) {
      if (request.elements(index) < 0 || request.elements(index) == std::numeric_limits<BaseInt>::max()) throw std::invalid_argument("Set Cover element index is out of range.");
      model.AddElementToLastSubset(request.elements(index));
    }
  }
  model.CreateSparseRowView();
  return model;
}

SolverExecutorResult SessionResponse(ortools_wasm::SetCoverGuidedSession& session, bool next = false, uint64_t handle = 0) {
  auto& invariant = session.invariant;
  invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kRedundancy);
  const auto exported = invariant.ExportSolutionAsProto();
  bridge::SetCoverBridgeResponse response;
  response.set_session_handle(handle);
  const auto timing = session.RunTime();
  response.set_run_time_seconds(timing.first); response.set_run_time_microseconds(timing.second);
  response.set_next_solution(next);
  response.set_cost(invariant.cost());
  response.set_num_uncovered_elements(invariant.num_uncovered_elements());
  response.set_cost_lower_bound(exported.cost_lower_bound());
  for (bool value : invariant.is_selected().get()) response.add_selected(value);
  for (int value : invariant.coverage().get()) response.add_coverage(value);
  for (int value : invariant.num_free_elements().get()) response.add_num_free_elements(value);
  for (int value : invariant.num_coverage_le_1_elements().get()) response.add_num_coverage_le_1_elements(value);
  for (bool value : invariant.is_redundant().get()) response.add_is_redundant(value);
  auto* trace = response.mutable_trace();
  for (const auto& decision : invariant.trace()) {
    auto* item = trace->add_decisions(); item->set_subset(decision.subset().value()); item->set_selected(decision.decision());
  }
  if (session.tabu) WriteGuidedTabuParameters(ortools_wasm::ReadGuidedTabuParameters(*session.tabu), &response);
  return SolverExecutorResult{true, response.SerializeAsString(), {}};
}

SolverExecutorResult SessionOperation(const bridge::SetCoverBridgeRequest& request,
                                     ortools_wasm::SetCoverGuidedSessions& sessions) {
  if (request.operation() == bridge::SET_COVER_OPERATION_SESSION_CREATE) {
    if (request.session_algorithm() != bridge::SET_COVER_OPERATION_GUIDED_LOCAL && request.session_algorithm() != bridge::SET_COVER_OPERATION_GUIDED_TABU) {
      return Error("Set Cover sessions require guided local or guided tabu search.");
    }
    SubsetBoolVector selected(SubsetIndex(request.selected_size()), false);
    for (int i = 0; i < request.selected_size(); ++i) selected[SubsetIndex(i)] = request.selected(i);
    const auto handle = sessions.Create(BuildModel(request), selected,
        request.session_algorithm() == bridge::SET_COVER_OPERATION_GUIDED_TABU, GuidedTabuParametersFromProto(request.guided_tabu_parameters()));
    const auto session = sessions.Find(handle);
    std::lock_guard lock(session->mutex);
    return SessionResponse(*session, false, handle);
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_SESSION_DELETE) {
    sessions.Delete(request.session_handle());
    return SolverExecutorResult{true, bridge::SetCoverBridgeResponse().SerializeAsString(), {}};
  }
  const auto session = sessions.Find(request.session_handle());
  std::lock_guard lock(session->mutex);
  session->RequireOpen();
  const auto parameters = GuidedTabuParametersFromProto(request.guided_tabu_parameters());
  if (request.operation() == bridge::SET_COVER_OPERATION_GUIDED_TABU_PARAMETERS) {
    if (!session->tabu) return Error("Guided tabu parameters require guided tabu search.");
    session->Configure(parameters);
    bridge::SetCoverBridgeResponse response;
    WriteGuidedTabuParameters(ortools_wasm::ReadGuidedTabuParameters(*session->tabu), &response);
    return SolverExecutorResult{true, response.SerializeAsString(), {}};
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_SESSION_STATISTICS) {
    const auto timing = session->RunTime(); bridge::SetCoverBridgeResponse response;
    response.set_run_time_seconds(timing.first); response.set_run_time_microseconds(timing.second);
    return SolverExecutorResult{true, response.SerializeAsString(), {}};
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_SESSION_INITIALIZE) {
    SubsetBoolVector selected(SubsetIndex(request.selected_size()), false);
    for (int i = 0; i < request.selected_size(); ++i) selected[SubsetIndex(i)] = request.selected(i);
    session->Initialize(selected, parameters);
    return SessionResponse(*session);
  }
  if (request.has_focus() && request.focus_size() != session->model.num_subsets()) return Error("Set Cover session focus dimensions do not match.");
  std::vector<SubsetIndex> focus;
  if (request.has_focus()) for (int i = 0; i < request.focus_size(); ++i) if (request.focus(i)) focus.push_back(SubsetIndex(i));
  const bool next = session->Next(focus, request.has_focus(), request.max_iterations(),
      request.has_time_limit_seconds() ? request.time_limit_seconds() : std::numeric_limits<double>::infinity(), parameters);
  return SessionResponse(*session, next);
}

SolverExecutorResult Solve(const bridge::SetCoverBridgeRequest& request) {
  if (request.has_guided_tabu_parameters() &&
      request.operation() != bridge::SET_COVER_OPERATION_GUIDED_TABU &&
      request.operation() != bridge::SET_COVER_OPERATION_GUIDED_TABU_PARAMETERS) {
    return Error("Guided tabu parameters require guided tabu search.");
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_GUIDED_TABU_PARAMETERS) {
    SetCoverModel model;
    SetCoverInvariant invariant(&model);
    GuidedTabuSearch generator(&invariant);
    ortools_wasm::ConfigureGuidedTabuSearch(&generator, GuidedTabuParametersFromProto(request.guided_tabu_parameters()));
    bridge::SetCoverBridgeResponse response;
    WriteGuidedTabuParameters(ortools_wasm::ReadGuidedTabuParameters(generator), &response);
    return SolverExecutorResult{true, response.SerializeAsString(), {}};
  }
  if ((request.operation() != bridge::SET_COVER_OPERATION_STATISTICS && request.operation() != bridge::SET_COVER_OPERATION_LAGRANGIAN_BOUND && request.operation() != bridge::SET_COVER_OPERATION_CFT && request.costs_size() != request.selected_size()) ||
      request.starts_size() != request.costs_size() + 1 ||
      (request.operation() != bridge::SET_COVER_OPERATION_INSPECT && request.has_focus() && request.focus_size() != request.costs_size())) {
    return Error("Set Cover request dimensions are inconsistent.");
  }
  if (request.max_iterations() != std::numeric_limits<double>::infinity() &&
      (!std::isfinite(request.max_iterations()) || request.max_iterations() < 0 ||
       std::trunc(request.max_iterations()) != request.max_iterations() ||
       request.max_iterations() >= 9223372036854775808.0)) {
    return Error("SetCover: max iterations must be a non-negative int64 or positive infinity.");
  }


  const double time_limit = request.has_time_limit_seconds()
      ? request.time_limit_seconds() : std::numeric_limits<double>::infinity();
  if (std::isnan(time_limit) || time_limit < 0) {
    return Error("SetCover: time limit must be non-negative seconds or positive infinity.");
  }

  auto model = BuildModel(request);
  if (request.operation() == bridge::SET_COVER_OPERATION_CFT) {
    if (request.selected_size() != 0 && request.selected_size() != model.num_subsets())
      return Error("Set Cover CFT initial selection dimensions do not match.");
    SubsetBoolVector initial(model.num_subsets(), false);
    for (int i = 0; i < request.selected_size(); ++i) initial[SubsetIndex(i)] = request.selected(i);
    const auto result = ortools_wasm::RunSetCoverCft(model, request.selected_size() == 0 ? nullptr : &initial);
    bridge::SetCoverBridgeResponse response;
    response.set_cost(result.state.solution.cost());
    response.set_num_uncovered_elements(result.uncovered);
    for (bool value : result.selected) response.add_selected(value);
    auto* dual = response.mutable_cft_dual();
    dual->set_lower_bound(result.state.dual_state.lower_bound());
    for (double value : result.state.dual_state.reduced_costs()) dual->add_reduced_costs(value);
    for (double value : result.state.dual_state.multipliers()) dual->add_multipliers(value);
    return SolverExecutorResult{true, response.SerializeAsString(), {}};
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_LAGRANGIAN_BOUND) {
    const auto [bound, reduced, multipliers] = ortools_wasm::ComputeSetCoverLagrangianBound(model, request.upper_bound());
    bridge::SetCoverBridgeResponse response;
    auto* result = response.mutable_lagrangian_bound();
    result->set_lower_bound(bound);
    for (double value : reduced) result->add_reduced_costs(value);
    for (double value : multipliers) result->add_multipliers(value);
    return SolverExecutorResult{true, response.SerializeAsString(), {}};
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_STATISTICS) {
    try {
      const auto result = ortools_wasm::ComputeSetCoverStatistics(model, request.statistics_kind());
      bridge::SetCoverBridgeResponse response;
      if (request.statistics_kind() < 3) {
        auto* stats = response.mutable_statistics();
        stats->set_min(result.stats.min); stats->set_max(result.stats.max); stats->set_median(result.stats.median);
        stats->set_mean(result.stats.mean); stats->set_stddev(result.stats.stddev); stats->set_iqr(result.stats.iqr);
      } else for (const auto value : result.deciles) response.add_deciles(value);
      return SolverExecutorResult{true, response.SerializeAsString(), {}};
    } catch (const std::exception& error) { return Error(error.what()); }
  }
  SetCoverInvariant invariant(&model);
  SubsetBoolVector selected(SubsetIndex(request.selected_size()), false);
  SubsetBoolVector focus(SubsetIndex(request.focus_size()), false);
  std::vector<SubsetIndex> focus_indices;
  for (int subset = 0; subset < request.selected_size(); ++subset) {
    selected[SubsetIndex(subset)] = request.selected(subset);
    if (request.operation() != bridge::SET_COVER_OPERATION_INSPECT && request.has_focus() && request.focus(subset)) {
      focus[SubsetIndex(subset)] = true;
      focus_indices.push_back(SubsetIndex(subset));
    }
  }
  if (request.operation() == bridge::SET_COVER_OPERATION_INSPECT && request.has_focus()) {
    for (int index : request.focus_indices()) {
      if (index < 0 || index >= request.costs_size()) return Error("Invalid Set Cover focus index.");
      focus_indices.push_back(SubsetIndex(index));
    }
  }
  invariant.LoadSolution(selected);
  const int64_t max_iterations = std::isinf(request.max_iterations())
                                     ? std::numeric_limits<int64_t>::max()
                                     : static_cast<int64_t>(request.max_iterations());
  if (max_iterations < 0 || std::trunc(request.max_iterations()) != request.max_iterations()) {
    return Error("Set Cover max iterations must be a non-negative integer or infinity.");
  }

  bool next_solution = false;
  std::optional<std::pair<double, double>> timing;
  std::optional<ortools_wasm::GuidedTabuParameters> effective_parameters;
  switch (request.operation()) {
    case bridge::SET_COVER_OPERATION_INSPECT: break;
    case bridge::SET_COVER_OPERATION_TRIVIAL: {
      TrivialSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_GREEDY: {
      GreedySolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_ELEMENT_DEGREE: {
      ElementDegreeSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_LAZY_ELEMENT_DEGREE: {
      LazyElementDegreeSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_RANDOM: {
      RandomSolutionGenerator generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_STEEPEST: {
      SteepestSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_LAZY_STEEPEST: {
      operations_research::LazySteepestSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_GUIDED_LOCAL: {
      GuidedLocalSearch generator(&invariant);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    case bridge::SET_COVER_OPERATION_GUIDED_TABU: {
      GuidedTabuSearch generator(&invariant);
      ortools_wasm::ConfigureGuidedTabuSearch(&generator, GuidedTabuParametersFromProto(request.guided_tabu_parameters()));
      effective_parameters = ortools_wasm::ReadGuidedTabuParameters(generator);
      generator.SetMaxIterations(max_iterations);
      generator.SetTimeLimitInSeconds(time_limit);
      next_solution = Next(&generator, request.has_focus(), focus_indices);
      timing = {generator.run_time_in_seconds(), generator.run_time_in_microseconds()};
      break;
    }
    default:
      return Error("Set Cover request has no valid operation.");
  }

  invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kCostAndCoverage);
  std::vector<bool> computed_redundancy;
  for (const auto subset : model.SubsetRange()) computed_redundancy.push_back(invariant.ComputeIsRedundant(subset));
  invariant.Recompute(SetCoverInvariant::ConsistencyLevel::kRedundancy);
  if (!request.has_focus()) for (const auto subset : model.SubsetRange()) focus_indices.push_back(subset);
  const auto focus_coverage = invariant.ComputeCoverageInFocus(focus_indices);
  const auto exported = invariant.ExportSolutionAsProto();

  bridge::SetCoverBridgeResponse response;
  if (effective_parameters) WriteGuidedTabuParameters(*effective_parameters, &response);
  response.set_next_solution(next_solution);
  if (timing) { response.set_run_time_seconds(timing->first); response.set_run_time_microseconds(timing->second); }
  response.set_cost_lower_bound(exported.cost_lower_bound());
  for (bool value : computed_redundancy) response.add_computed_redundancy(value);
  for (int value : focus_coverage.get()) response.add_focus_coverage(value);
  response.set_cost(invariant.cost());
  response.set_num_uncovered_elements(invariant.num_uncovered_elements());
  for (bool value : invariant.is_selected().get()) response.add_selected(value);
  for (int value : invariant.coverage().get()) response.add_coverage(value);
  for (int value : invariant.num_free_elements().get()) response.add_num_free_elements(value);
  for (int value : invariant.num_coverage_le_1_elements().get()) {
    response.add_num_coverage_le_1_elements(value);
  }
  for (bool value : invariant.is_redundant().get()) response.add_is_redundant(value);
  auto* trace = response.mutable_trace();
  for (const auto& decision : invariant.trace()) {
    auto* item = trace->add_decisions(); item->set_subset(decision.subset().value()); item->set_selected(decision.decision());
  }
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize Set Cover response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

SolverExecutorResult Mutate(const bridge::SetCoverBridgeRequest& request) {
  if (request.selected_size() != request.costs_size()) return Error("Set Cover selection dimensions do not match.");
  auto model = BuildModel(request);
  SetCoverInvariant invariant(&model);
  SubsetBoolVector selected(SubsetIndex(request.selected_size()), false);
  for (int i = 0; i < request.selected_size(); ++i) selected[SubsetIndex(i)] = request.selected(i);
  invariant.LoadSolution(selected);
  std::vector<SubsetIndex> focus;
  for (int index : request.focus_indices()) focus.push_back(SubsetIndex(index));
  const auto operation = request.operation() == bridge::SET_COVER_OPERATION_CLEAR_RANDOM_SUBSETS ? ortools_wasm::SetCoverMutation::kClearRandom :
    request.operation() == bridge::SET_COVER_OPERATION_CLEAR_MOST_COVERED_ELEMENTS ? ortools_wasm::SetCoverMutation::kClearMostCovered : ortools_wasm::SetCoverMutation::kUpdateSelection;
  const auto result = ortools_wasm::MutateSetCover(invariant, operation, request.perturbation_count(), focus,
      request.has_focus(), request.subset_index(), request.subset_selected());
  bridge::SetCoverBridgeResponse response;
  for (bool value : invariant.is_selected().get()) response.add_selected(value);
  for (const auto& decision : invariant.trace()) {
    auto* item = response.mutable_trace()->add_decisions();
    item->set_subset(decision.subset().value()); item->set_selected(decision.decision());
  }
  // An empty native trace still belongs to this mutation result.
  response.mutable_trace();
  if (operation == ortools_wasm::SetCoverMutation::kUpdateSelection) {
    auto* output = response.mutable_removability(); output->set_changed(result.changed);
    for (const auto index : result.newly_removable) output->add_newly_removable_subsets(index.value());
    for (const auto index : result.newly_non_removable) output->add_newly_non_removable_subsets(index.value());
  } else for (const auto index : result.focus) response.add_perturbation_focus(index.value());
  return SolverExecutorResult{true, response.SerializeAsString(), {}};
}

}  // namespace

std::string SetCoverExecutor::solver() const { return "set-cover"; }

SetCoverExecutor::SetCoverExecutor(SessionLimits limits) : sessions_(std::make_unique<ortools_wasm::SetCoverGuidedSessions>(limits)) {}
void SetCoverExecutor::ExpireIdleSessions() { sessions_->ExpireIdle(); }
SetCoverExecutor::~SetCoverExecutor() = default;

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
  try {
    if (parsed.operation() == bridge::SET_COVER_OPERATION_MIP) {
      if (parsed.selected_size() != parsed.costs_size()) return Error("Set Cover MIP selection dimensions do not match.");
      auto model = BuildModel(parsed);
      SetCoverInvariant invariant(&model);
      SubsetBoolVector selected(SubsetIndex(parsed.selected_size()), false);
      for (int i = 0; i < parsed.selected_size(); ++i) selected[SubsetIndex(i)] = parsed.selected(i);
      invariant.LoadSolution(selected);
      std::vector<SubsetIndex> focus;
      for (int index : parsed.focus_indices()) focus.push_back(SubsetIndex(index));
      const auto result = ortools_wasm::RunSetCoverMip(invariant, parsed.lp_relaxation(), focus,
          parsed.has_focus(), parsed.has_time_limit_seconds() ? parsed.time_limit_seconds() : 0,
          [&context](operations_research::MPSolver& solver) {
            auto cancellation = context.OnCancellation([&solver] { solver.InterruptSolve(); });
            if (context.cancellation_requested()) return operations_research::MPSolver::NOT_SOLVED;
            return solver.Solve();
          });
      if (context.cancellation_requested()) {
        auto cancelled = Error("Set Cover MIP solve was cancelled.");
        cancelled.failure_kind = SolverExecutionFailureKind::kCancelled;
        return cancelled;
      }
      bridge::SetCoverBridgeResponse response;
      response.set_next_solution(result.next_solution);
      response.set_cost(invariant.cost()); response.set_num_uncovered_elements(invariant.num_uncovered_elements());
      for (bool value : invariant.is_selected().get()) response.add_selected(value);
      response.set_run_time_seconds(result.run_time_seconds); response.set_run_time_microseconds(result.run_time_microseconds);
      auto* mip = response.mutable_mip(); mip->set_subproblem_status(result.subproblem_status);
      if (result.objective_value) mip->set_objective_value(*result.objective_value);
      return SolverExecutorResult{true, response.SerializeAsString(), {}};
    }
    if (parsed.operation() == bridge::SET_COVER_OPERATION_READ_MODEL) {
      const auto model = ortools_wasm::ReadSetCoverText(parsed.input(), parsed.format());
      bridge::SetCoverBridgeResponse response; response.set_model_proto_json(ortools_wasm::SetCoverModelJson(model));
      return SolverExecutorResult{true, response.SerializeAsString(), {}};
    }
    if (parsed.operation() == bridge::SET_COVER_OPERATION_WRITE_MODEL) {
      const auto model = BuildModel(parsed);
      bridge::SetCoverBridgeResponse response; response.set_text(ortools_wasm::WriteSetCoverText(model, parsed.format()));
      return SolverExecutorResult{true, response.SerializeAsString(), {}};
    }
    if (parsed.operation() == bridge::SET_COVER_OPERATION_CLEAR_RANDOM_SUBSETS ||
        parsed.operation() == bridge::SET_COVER_OPERATION_CLEAR_MOST_COVERED_ELEMENTS || parsed.operation() == bridge::SET_COVER_OPERATION_UPDATE_SELECTION) {
      return Mutate(parsed);
    }
    if (parsed.operation() == bridge::SET_COVER_OPERATION_COMPRESS_TRACE) {
      std::vector<operations_research::SetCoverDecision> trace;
      for (const auto& item : parsed.trace().decisions()) trace.emplace_back(SubsetIndex(item.subset()), item.selected());
      const auto compressed = ortools_wasm::CompressSetCoverTrace(parsed.num_subsets(), trace);
      bridge::SetCoverBridgeResponse response;
      auto* output = response.mutable_trace();
      for (const auto& decision : compressed) {
        auto* item = output->add_decisions(); item->set_subset(decision.subset().value()); item->set_selected(decision.decision());
      }
      return SolverExecutorResult{true, response.SerializeAsString(), {}};
    }
    if (parsed.operation() == bridge::SET_COVER_OPERATION_SESSION_CREATE || parsed.operation() == bridge::SET_COVER_OPERATION_SESSION_NEXT ||
        parsed.operation() == bridge::SET_COVER_OPERATION_SESSION_STATISTICS || parsed.operation() == bridge::SET_COVER_OPERATION_SESSION_INITIALIZE || parsed.operation() == bridge::SET_COVER_OPERATION_SESSION_DELETE ||
        (parsed.operation() == bridge::SET_COVER_OPERATION_GUIDED_TABU_PARAMETERS && parsed.session_handle() != 0)) {
      return SessionOperation(parsed, *sessions_);
    }
    return Solve(parsed);
  }
  catch (const std::exception& error) { return Error(error.what()); }
}

}  // namespace ortools_wasm::server
