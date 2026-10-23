#include "server/src/set_cover_executor.h"

#include <atomic>
#include <chrono>
#include <future>
#include <random>
#include <thread>
#include <cstdlib>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#include "server/src/job_scheduler.h"
#include "set_cover.pb.h"
#include "ortools/set_cover/set_cover_heuristics.h"
#include "ortools/set_cover/set_cover_invariant.h"
#include "ortools/set_cover/set_cover_model.h"
#include "ortools/set_cover/set_cover_lagrangian.h"
#include "ortools/set_cover/set_cover_mip.h"
#include "ortools/set_cover/set_cover_cft.h"
#include "javascript/set_cover_guided_session.h"
#include "javascript/set_cover_formats.h"
#include "javascript/set_cover_mip.h"
#include <filesystem>

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;

void Expect(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
}

SolverExecutorRequest Request() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  for (double cost : {1, 1, 1}) request.add_costs(cost);
  for (int start : {0, 2, 4, 5}) request.add_starts(start);
  for (int element : {0, 1, 1, 2, 2}) request.add_elements(element);
  for (int i = 0; i < 3; ++i) request.add_selected(false);
  request.set_max_iterations(100);
  return SolverExecutorRequest{1, "set-cover", request.SerializeAsString()};
}

SolverExecutorResult Execute(const SolverExecutorRequest& request, SetCoverExecutor* supplied = nullptr) {
  SetCoverExecutor owned;
  auto& executor = supplied ? *supplied : owned;
  JobScheduler scheduler({2, 8});
  SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"set-cover", 1}, [&](JobContext& context) {
    execution = executor.Execute(request, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get();
  return execution;
}

void PreservesNativeMipAndRelaxationContracts() {
  for (bool relaxation : {false, true}) for (int scenario = 0; scenario < 5; ++scenario) {
    bridge::SetCoverBridgeRequest request;
    request.set_operation(bridge::SET_COVER_OPERATION_MIP);
    request.set_lp_relaxation(relaxation);
    request.set_time_limit_seconds(0);
    operations_research::SetCoverModel model;
    for (int i = 0; i < 3; ++i) { request.add_costs(1); model.AddEmptySubset(1); request.add_selected(scenario == 1 || (scenario == 3 && i == 2)); }
    for (int start : {0, 2, 4, 6}) request.add_starts(start);
    int position = 0;
    for (int element : {0, 1, 1, 2, 0, 2}) { request.add_elements(element); model.AddElementToSubset(element, position++ / 2); }
    model.CreateSparseRowView();
    operations_research::SetCoverInvariant invariant(&model);
    operations_research::SubsetBoolVector selection(operations_research::SubsetIndex(3), false);
    for (int i = 0; i < 3; ++i) selection[operations_research::SubsetIndex(i)] = request.selected(i);
    invariant.LoadSolution(selection);
    invariant.Recompute(operations_research::SetCoverInvariant::ConsistencyLevel::kCostAndCoverage);
    operations_research::SetCoverMip native(&invariant);
    native.UseMipSolver(relaxation ? operations_research::SetCoverMipSolver::GLOP : operations_research::SetCoverMipSolver::SCIP);
    native.UseIntegers(!relaxation); native.SetTimeLimitInSeconds(0);
    std::vector<operations_research::SubsetIndex> focus;
    if (scenario >= 2) { request.set_has_focus(true); if (scenario != 4) { request.add_focus_indices(0); focus.push_back(operations_research::SubsetIndex(0)); } }
    const bool next = scenario >= 2 ? native.NextSolution(focus) : native.NextSolution();
    invariant.Recompute(operations_research::SetCoverInvariant::ConsistencyLevel::kFreeAndUncovered);
    const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::SetCoverBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "Decode MIP response");
    Expect(response.mip().subproblem_status() == native.solve_status() && response.next_solution() == next, "Native subproblem status and Boolean");
    Expect(response.cost() == invariant.cost() && response.num_uncovered_elements() == invariant.num_uncovered_elements(), "Native cover accounting");
    for (int i = 0; i < 3; ++i) Expect(response.selected(i) == invariant.is_selected()[operations_research::SubsetIndex(i)], "Native selection snapshot");
    Expect(response.mip().has_objective_value() == !invariant.is_cost_consistent(), "Native relaxation presence");
    if (!invariant.is_cost_consistent()) Expect(response.mip().objective_value() == invariant.CostOrLowerBound(), "Native focused objective");
    if (scenario == 0) Expect(relaxation ? response.mip().objective_value() == 1.5 : response.cost() == 2, "Triangle integer versus relaxation result");
    if (scenario == 1 && !relaxation) Expect(response.cost() == 3, "Native optimal subproblem retains redundant seeds");
    if (scenario == 2 && !relaxation) Expect(response.num_uncovered_elements() == 1, "Native focused success need not cover the full model");
    request.set_time_limit_seconds(std::numeric_limits<double>::infinity());
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Reject unsafe native time conversion");
    request.set_time_limit_seconds(0); request.set_has_focus(true); request.clear_focus_indices(); request.add_focus_indices(0); request.add_focus_indices(0);
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Reject duplicate focus before native variable overwrite");
  }
}

void ComputesNativeLagrangianBound() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_LAGRANGIAN_BOUND);
  request.set_upper_bound(2);
  operations_research::SetCoverModel model;
  for (double cost : {1, 1, 1}) { request.add_costs(cost); model.AddEmptySubset(cost); }
  for (int start : {0, 2, 4, 6}) request.add_starts(start);
  int position = 0;
  for (int element : {0, 1, 1, 2, 0, 2}) {
    request.add_elements(element);
    model.AddElementToSubset(element, position++ / 2);
  }
  model.CreateSparseRowView();
  operations_research::SetCoverInvariant invariant(&model);
  operations_research::SetCoverLagrangian native(&invariant);
  native.UseNumThreads(1);
  const auto [bound, reduced, multipliers] = native.ComputeLowerBound(model.subset_costs(), 2);
  const auto call = [&] { return Execute({1, "set-cover", request.SerializeAsString()}); };
  auto execution = call(); Expect(execution.ok, execution.error_message);
  bridge::SetCoverBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Decode Lagrangian response");
  const auto& result = response.lagrangian_bound();
  Expect(result.lower_bound() == bound && std::abs(bound - 1.5) < 1e-9, "Native triangle lower bound");
  Expect(result.reduced_costs_size() == 3 && result.multipliers_size() == 3, "Native vector dimensions");
  for (int i = 0; i < 3; ++i) {
    Expect(result.reduced_costs(i) == reduced[operations_research::SubsetIndex(i)], "Native reduced cost");
    Expect(result.multipliers(i) == multipliers[operations_research::ElementIndex(i)], "Native multiplier");
  }
  request.set_upper_bound(std::numeric_limits<double>::infinity()); Expect(!call().ok, "Reject nonfinite upper bound");
  request.set_upper_bound(2); request.set_costs(0, -1); Expect(!call().ok, "Reject negative costs");
  request.set_costs(0, 1); Expect(call().ok, "Recovery after invalid inputs");
}

void RetainsNativeGuidedGeneratorsAndRejectsClosedHandles() {
  operations_research::SetCoverModel model;
  for (int i = 0; i < 3; ++i) { model.AddEmptySubset(i + 1); model.AddElementToLastSubset(0); }
  model.CreateSparseRowView();
  operations_research::SubsetBoolVector cover(operations_research::SubsetIndex(3), true);
  for (bool tabu : {false, true}) {
    ortools_wasm::SetCoverGuidedSessions registry;
    const auto handle = registry.Create(model, cover, tabu, {});
    auto session = registry.Find(handle);
    auto* local_generator = session->local.get(); auto* tabu_generator = session->tabu.get();
    for (int i = 0; i < 3; ++i) {
      session->Next({}, false, 2, std::numeric_limits<double>::infinity(), {});
      Expect(registry.Find(handle).get() == session.get() && session->local.get() == local_generator && session->tabu.get() == tabu_generator, "Repeated jobs retain the same native invariant and guided generator");
      Expect(session->invariant.num_uncovered_elements() == 0, "Continued native search remains feasible");
    }
    session->Initialize(cover, {});
    Expect(session->local.get() == local_generator && session->tabu.get() == tabu_generator, "Initialize calls the existing native generator");
    registry.Delete(handle); registry.Delete(handle);
    Expect(session->closed, "Deletion closes in-flight shared references before freeing the registry entry");
    bool rejected = false; try { registry.Find(handle); } catch (const std::runtime_error&) { rejected = true; }
    Expect(rejected, "Closed handle cannot be resolved");
    rejected = false; try { session->Next({}, false, 0, 0, {}); } catch (const std::runtime_error&) { rejected = true; }
    Expect(rejected, "Retained references cannot operate after close");
  }

  SetCoverExecutor executor;
  bridge::SetCoverBridgeRequest request; request.ParseFromString(Request().payload);
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_CREATE);
  request.set_session_algorithm(bridge::SET_COVER_OPERATION_GUIDED_TABU);
  for (int i = 0; i < request.selected_size(); ++i) request.set_selected(i, true);
  request.mutable_guided_tabu_parameters()->set_tabu_list_size(5);
  auto execution = Execute({1, "set-cover", request.SerializeAsString()}, &executor);
  bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.session_handle() != 0, "Server returns an opaque native session handle");
  const auto handle = response.session_handle();
  request.Clear(); request.set_operation(bridge::SET_COVER_OPERATION_SESSION_NEXT); request.set_session_handle(handle); request.set_max_iterations(0);
  for (int i = 0; i < 2; ++i) {
    execution = Execute({1, "set-cover", request.SerializeAsString()}, &executor);
    Expect(execution.ok && response.ParseFromString(execution.payload), "Session survives separate server job threads");
    Expect(response.num_uncovered_elements() == 0 && response.guided_tabu_parameters().tabu_list_size() == 5 && response.has_trace(), "Continuation retains native settings and returns native trace");
  }
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_DELETE);
  Expect(Execute({1, "set-cover", request.SerializeAsString()}, &executor).ok, "Server closes session");
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_NEXT);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}, &executor).ok, "Server rejects deleted handles");
  request.set_session_handle(handle + 1);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}, &executor).ok, "Server rejects unknown handles");
}

bridge::SetCoverBridgeRequest MutationRequest() {
  bridge::SetCoverBridgeRequest request;
  for (double cost : {2, 3, 5}) request.add_costs(cost);
  for (int start : {0, 1, 2, 3}) request.add_starts(start);
  for (int element : {0, 0, 1}) request.add_elements(element);
  for (bool selected : {true, true, true}) request.add_selected(selected);
  return request;
}

void PerturbsUsingNativeFocusAndIntersectionSemantics() {
  // Native-only reproduction: the iterator used to skip all intersections
  // when the seed was subset zero, and skip later entries after seeing itself.
  operations_research::SetCoverModel native_model;
  for (int element : {0, 0, 1}) { native_model.AddEmptySubset(1); native_model.AddElementToLastSubset(element); }
  native_model.CreateSparseRowView();
  for (int seed : {0, 1}) {
    operations_research::SetCoverInvariant native_invariant(&native_model);
    native_invariant.LoadSolution(operations_research::SubsetBoolVector(operations_research::SubsetIndex(3), true));
    const std::vector<operations_research::SubsetIndex> focus = {operations_research::SubsetIndex(seed)};
    const auto sampled = operations_research::ClearRandomSubsets(focus, 1, &native_invariant);
    Expect(sampled == focus && !native_invariant.is_selected()[operations_research::SubsetIndex(0)] &&
        !native_invariant.is_selected()[operations_research::SubsetIndex(1)] && native_invariant.is_selected()[operations_research::SubsetIndex(2)],
        "Native-only random clearing visits intersections on either side of its seed index");
  }
  auto request = MutationRequest();
  request.set_has_focus(true); request.add_focus_indices(0); request.set_perturbation_count(1);
  request.set_operation(bridge::SET_COVER_OPERATION_CLEAR_RANDOM_SUBSETS);
  auto execution = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload), execution.error_message);
  Expect(response.perturbation_focus_size() == 1 && response.perturbation_focus(0) == 0 &&
      !response.selected(0) && !response.selected(1) && response.selected(2), "Random native perturbation also clears intersecting subsets outside focus");
  Expect(response.has_trace() && response.trace().decisions_size() == 5, "Native mutation trace includes both intersecting removals");
  request.set_operation(bridge::SET_COVER_OPERATION_CLEAR_MOST_COVERED_ELEMENTS);
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && !response.selected(0) && response.selected(1) && response.selected(2),
      "Most-covered native perturbation clears only the sampled focus subset");
  request.clear_focus_indices();
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.perturbation_focus_size() == 0 && response.selected(0), "Empty explicit focus differs from global focus");
  request.set_has_focus(false); request.set_perturbation_count(100);
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.perturbation_focus_size() == 2 &&
      !response.selected(0) && !response.selected(1) && response.selected(2), "Global native perturbation caps samples at eligible subsets");
  request.set_perturbation_count(-1);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Negative sample count rejects before native CHECK");
  request.set_perturbation_count(1); request.set_has_focus(true); request.add_focus_indices(3);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Invalid focus index rejects before native indexing");
}

void ReturnsNativeIncrementalRemovabilityWithoutRetainingResults() {
  auto request = MutationRequest();
  request.set_selected(1, false);
  request.set_operation(bridge::SET_COVER_OPERATION_UPDATE_SELECTION); request.set_subset_index(1); request.set_subset_selected(true);
  auto execution = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload), execution.error_message);
  const auto& delta = response.removability();
  Expect(response.has_removability() && delta.changed() && delta.newly_removable_subsets_size() == 3 &&
      delta.newly_removable_subsets(0) == 0 && delta.newly_removable_subsets(1) == 1 && delta.newly_removable_subsets(2) == 1 &&
      delta.newly_non_removable_subsets_size() == 0, "Native selection notifications retain the newly selected subset's repeated entry");
  request.set_selected(1, true); request.set_subset_selected(false);
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.removability().changed() &&
      response.removability().newly_removable_subsets_size() == 0 && response.removability().newly_non_removable_subsets_size() == 1 &&
      response.removability().newly_non_removable_subsets(0) == 0, "Native deselection reports the remaining selected subset that becomes essential");
  request.set_selected(1, false);
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && !response.removability().changed() &&
      response.removability().newly_non_removable_subsets_size() == 0, "No-op mutation returns fresh empty notifications");
  request.set_subset_index(3);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Invalid update subset rejects");
}

void SolvesAndSerializesResult() {
  for (const auto operation : {bridge::SET_COVER_OPERATION_GREEDY,
      bridge::SET_COVER_OPERATION_TRIVIAL, bridge::SET_COVER_OPERATION_RANDOM,
      bridge::SET_COVER_OPERATION_ELEMENT_DEGREE, bridge::SET_COVER_OPERATION_LAZY_ELEMENT_DEGREE}) {
    bridge::SetCoverBridgeRequest request;
    request.ParseFromString(Request().payload);
    request.set_operation(operation);
    const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::SetCoverBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "Set Cover response parses");
    Expect(response.next_solution(), "Set Cover finds a solution");
    Expect(response.num_uncovered_elements() == 0, "Returned coverage metadata matches the solution");
    Expect(response.selected_size() == 3, "Set Cover returns one selection per subset");
    for (int coverage : response.coverage()) Expect(coverage > 0, "Returned solution covers every element");
    for (int free : response.num_free_elements()) Expect(free == 0, "Returned free-element metadata is current");
  }
}

void ReadsAndAppliesNativeGuidedTabuParameters() {
  operations_research::SetCoverModel model;
  operations_research::SetCoverInvariant invariant(&model);
  operations_research::GuidedTabuSearch native(&invariant);
  auto execute = [](const bridge::SetCoverBridgeRequest& request) {
    const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::SetCoverBridgeResponse response;
    Expect(response.ParseFromString(execution.payload) && response.has_guided_tabu_parameters(), "Effective native tuning is returned");
    return response;
  };
  bridge::SetCoverBridgeRequest query;
  query.set_operation(bridge::SET_COVER_OPERATION_GUIDED_TABU_PARAMETERS);
  const auto defaults = execute(query).guided_tabu_parameters();
  Expect(defaults.lagrangian_factor() == native.GetLagrangianFactor() && defaults.epsilon() == native.GetEpsilon() &&
      defaults.penalty_factor() == native.GetPenaltyFactor() && defaults.tabu_list_size() == native.GetTabuListSize(), "Defaults come from native getters without any model or search");
  query.mutable_guided_tabu_parameters()->set_epsilon(0);
  const auto partial = execute(query).guided_tabu_parameters();
  Expect(partial.epsilon() == 0 && partial.penalty_factor() == defaults.penalty_factor(), "Explicit zero survives and unspecified settings retain native defaults");
  auto* tuning = query.mutable_guided_tabu_parameters();
  tuning->set_lagrangian_factor(7.25); tuning->set_penalty_factor(0.625); tuning->set_tabu_list_size(5);
  const auto configured = execute(query).guided_tabu_parameters();
  Expect(configured.lagrangian_factor() == 7.25 && configured.epsilon() == 0 && configured.penalty_factor() == 0.625 && configured.tabu_list_size() == 5, "All four correctly named setters reach native getters");
  bridge::SetCoverBridgeRequest search;
  search.ParseFromString(Request().payload);
  search.set_operation(bridge::SET_COVER_OPERATION_GUIDED_TABU);
  search.set_max_iterations(0);
  for (int i = 0; i < search.selected_size(); ++i) search.set_selected(i, true);
  *search.mutable_guided_tabu_parameters() = *tuning;
  const auto searched = execute(search);
  Expect(searched.guided_tabu_parameters().SerializeAsString() == configured.SerializeAsString(), "The actual search generator receives the configured native parameters");
  Expect(searched.num_uncovered_elements() == 0 && searched.cost() == 3, "Zero iterations preserve the feasible starting cover");
  query.clear_guided_tabu_parameters();
  Expect(execute(query).guided_tabu_parameters().SerializeAsString() == defaults.SerializeAsString(), "Temporary generator tuning does not leak between requests");
  for (int size : {0, -1}) {
    query.mutable_guided_tabu_parameters()->set_tabu_list_size(size);
    Expect(!Execute({1, "set-cover", query.SerializeAsString()}).ok, "Unsafe native tabu-list sizes reject");
  }
  query.clear_guided_tabu_parameters();
  query.mutable_guided_tabu_parameters()->set_epsilon(std::numeric_limits<double>::quiet_NaN());
  Expect(!Execute({1, "set-cover", query.SerializeAsString()}).ok, "Nonfinite tuning rejects");
  search.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  Expect(!Execute({1, "set-cover", search.SerializeAsString()}).ok, "Tuning cannot silently apply to another algorithm");
}

void ReservesOneThread() {
  SetCoverExecutor executor;
  Expect(executor.RequestedThreads(Request(), 1, 8) == 1, "Set Cover reserves one thread");
  bool rejected = false;
  try {
    executor.RequestedThreads(Request(), 2, 8);
  } catch (const std::invalid_argument&) {
    rejected = true;
  }
  Expect(rejected, "Set Cover rejects multi-thread reservations");
}

void RejectsMismatchedDimensions() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  request.add_costs(1);
  const auto result = Execute(SolverExecutorRequest{1, "set-cover", request.SerializeAsString()});
  Expect(!result.ok, "Mismatched dimensions produce execution failure");
}

void RejectsInvalidIterationLimits() {
  for (double limit : {-1.0, 0.5, -std::numeric_limits<double>::infinity(),
                       std::numeric_limits<double>::quiet_NaN(), 9223372036854775808.0}) {
    bridge::SetCoverBridgeRequest request;
    Expect(request.ParseFromString(Request().payload), "Request parses");
    request.set_max_iterations(limit);
    const auto result = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(!result.ok, "Invalid iteration budget must be rejected before cast/search");
  }
}

void PreservesNativeTimeLimitSemantics() {
  // OR-Tools 9.15 stores this setting but does not enforce it. The bridge must
  // not turn it into its own search deadline or short-circuit native work.
  for (const auto operation : {bridge::SET_COVER_OPERATION_TRIVIAL,
      bridge::SET_COVER_OPERATION_GREEDY, bridge::SET_COVER_OPERATION_RANDOM,
      bridge::SET_COVER_OPERATION_ELEMENT_DEGREE, bridge::SET_COVER_OPERATION_LAZY_ELEMENT_DEGREE,
      bridge::SET_COVER_OPERATION_STEEPEST, bridge::SET_COVER_OPERATION_GUIDED_LOCAL,
      bridge::SET_COVER_OPERATION_GUIDED_TABU}) {
    for (double limit : {0.0, 1e-300}) {
      bridge::SetCoverBridgeRequest request;
      Expect(request.ParseFromString(Request().payload), "Limited request parses");
      request.set_operation(operation);
      request.set_time_limit_seconds(limit);
      request.set_max_iterations(3);
      if (operation == bridge::SET_COVER_OPERATION_STEEPEST ||
          operation == bridge::SET_COVER_OPERATION_GUIDED_LOCAL ||
          operation == bridge::SET_COVER_OPERATION_GUIDED_TABU) {
        for (int i = 0; i < request.selected_size(); ++i) request.set_selected(i, true);
      }
      const auto result = Execute({1, "set-cover", request.SerializeAsString()});
      bridge::SetCoverBridgeResponse response;
      Expect(result.ok && response.ParseFromString(result.payload), "Native result parses");
      Expect(response.next_solution() && response.num_uncovered_elements() == 0,
             "Native heuristic runs despite the unenforced time setting");
    }
  }
}

void RejectsInvalidTimeLimits() {
  for (double limit : {-1.0, -std::numeric_limits<double>::infinity(),
      std::numeric_limits<double>::quiet_NaN()}) {
    bridge::SetCoverBridgeRequest request;
    request.ParseFromString(Request().payload);
    request.set_time_limit_seconds(limit);
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok,
           "Invalid time budget rejects before search");
  }
}

void HandlesInfeasibleGreedyModel() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_GREEDY);
  request.add_costs(1);
  request.add_starts(0);
  request.add_starts(1);
  request.add_elements(1);
  request.add_selected(false);
  request.set_max_iterations(100);
  const auto result = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload), "Infeasible greedy result parses");
  Expect(response.next_solution() && response.num_uncovered_elements() == 1,
         "Queue safety preserves native success semantics independently of feasibility");
}

void InspectsNativeInvariantWithoutSearching() {
  bridge::SetCoverBridgeRequest request;
  request.ParseFromString(Request().payload);
  request.set_operation(bridge::SET_COVER_OPERATION_INSPECT);
  request.set_selected(0, true); request.set_selected(2, true);
  request.set_has_focus(true);
  request.add_focus_indices(0); request.add_focus_indices(0); request.add_focus_indices(1);
  const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok, execution.error_message);
  bridge::SetCoverBridgeResponse response;
  Expect(response.ParseFromString(execution.payload), "Native inspection response parses");
  Expect(!response.next_solution() && response.cost() == 2, "Inspection leaves selection unchanged and returns native cost");
  Expect(response.computed_redundancy(1) && !response.computed_redundancy(0), "Native redundancy respects selected versus unselected subsets");
  Expect(response.cost_lower_bound() == 1 && response.focus_coverage(0) == 2 && response.focus_coverage(1) == 2 && response.focus_coverage(2) == 0, "Native export and focus coverage are returned");
}

void ComputesNativeStatisticsAndDeciles() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_STATISTICS);
  for (double cost : {0, 0, 2, 4}) request.add_costs(cost);
  for (int start : {0, 0, 1, 3, 7}) request.add_starts(start);
  for (int element : {0, 0, 1, 0, 1, 2, 3}) request.add_elements(element);
  for (int kind = 0; kind < 5; ++kind) {
    request.set_statistics_kind(kind);
    const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(execution.ok, execution.error_message);
    bridge::SetCoverBridgeResponse response;
    Expect(response.ParseFromString(execution.payload), "Statistics response parses");
    if (kind == 0) {
      const auto& stats = response.statistics();
      Expect(stats.min() == 0 && stats.max() == 4 && stats.median() == 2 && stats.mean() == 1.5 && stats.stddev() == 1 && stats.iqr() == 4,
             "Native statistics preserve zero exclusion in stddev and interquartile range");
    }
    if (kind >= 3) {
      Expect(response.deciles_size() == 10 && response.deciles(0) == 0, "Native deciles retain ten entries and zero origin");
      Expect(response.deciles(1) == (kind == 3 ? 1 : 0), "Column deciles use columns, not Python's accidental row binding");
    }
  }
  request.set_statistics_kind(1);
  request.set_elements(0, -1);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Negative imported element IDs reject");
  request.set_elements(0, std::numeric_limits<int>::max());
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Element count overflow rejects");
  request.clear_costs(); request.clear_elements(); request.clear_starts(); request.add_starts(0);
  for (int kind = 0; kind < 5; ++kind) {
    request.set_statistics_kind(kind);
    const auto error = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(!error.ok && !error.error_message.empty(), "Empty statistics reject without native undefined behavior");
  }
}

void CompressesTraceUsingNativeOrder() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_COMPRESS_TRACE); request.set_num_subsets(3);
  for (const auto& [subset, selected] : std::vector<std::pair<int, bool>>{{2, false}, {1, true}, {2, true}, {0, true}, {1, false}, {1, true}, {0, false}}) {
    auto* item = request.mutable_trace()->add_decisions(); item->set_subset(subset); item->set_selected(selected);
  }
  const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload), "Native trace compression responds");
  Expect(response.trace().decisions_size() == 2 && response.trace().decisions(0).subset() == 2 && response.trace().decisions(1).subset() == 1,
    "Native trace preserves first surviving occurrence order, including a deselection occurrence");
  for (const auto& item : response.trace().decisions()) Expect(item.selected(), "Compressed native trace only selects final surviving subsets");
  request.mutable_trace()->clear_decisions();
  const auto empty = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(empty.ok && response.ParseFromString(empty.payload) && response.has_trace() && response.trace().decisions_size() == 0,
    "Empty native trace retains explicit presence");
  auto* invalid = request.mutable_trace()->add_decisions(); invalid->set_subset(3); invalid->set_selected(true);
  Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Malformed trace IDs reject before native indexing");
}

void PreservesNonfiniteNativeCosts() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_INSPECT);
  for (double cost : {1e308, 1e308}) request.add_costs(cost);
  for (int offset : {0, 1, 2}) request.add_starts(offset);
  for (int element : {0, 1}) request.add_elements(element);
  request.add_selected(true); request.add_selected(true);
  const auto result = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload), "Overflowing native cost is returned");
  Expect(response.cost() == std::numeric_limits<double>::infinity() &&
         response.num_uncovered_elements() == 0, "Native double overflow preserves coverage and diagnostic values");
  request.set_costs(0, 2); request.set_costs(1, 3);
  const auto recovery = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(recovery.ok && response.ParseFromString(recovery.payload) && response.cost() == 5,
         "Finite queries recover without retained overflowing state");
}

void RejectsIncompleteElementOffsets() {
  for (const auto first : {true, false}) {
    bridge::SetCoverBridgeRequest request; request.ParseFromString(Request().payload);
    request.set_starts(first ? 0 : request.starts_size() - 1, first ? 1 : request.elements_size() - 1);
    const auto result = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(!result.ok && result.error_message.find("complete element array") != std::string::npos,
           "Unused leading or trailing elements are not silently dropped");
  }
  Expect(Execute(Request()).ok, "Canonical native offsets recover after malformed requests");
}


void PreservesLoadedCostAndCopyIndependence() {
  namespace native = ::operations_research;
  native::SetCoverModel model;
  for (double cost : {1e20, 1.0, 5e5}) {
    model.AddEmptySubset(cost); model.AddElementToLastSubset(0);
  }
  model.CreateSparseRowView();
  native::SetCoverInvariant invariant(&model);
  native::SubsetBoolVector selected(native::SubsetIndex(3), true);
  invariant.LoadSolution(selected);
  auto copy = invariant;
  selected[native::SubsetIndex(0)] = false;
  invariant.LoadSolution(selected);
  Expect(invariant.cost() == 500001 && copy.cost() == 1e20 + 500001,
         "Bulk replacement recovers the residual and retains native copy independence");
  const auto level = native::SetCoverInvariant::ConsistencyLevel::kCostAndCoverage;
  copy = invariant;
  copy.Deselect(native::SubsetIndex(2), level);
  Expect(copy.cost() == 1 && invariant.cost() == 500001,
         "Native copy assignment preserves independent scalar/vector state");
}

void NativeBooleanFocusKeepsIndicesAndLifetime() {
  namespace native = ::operations_research;
  native::SetCoverModel model;
  for (const double cost : {1, 2, 3}) { model.AddEmptySubset(cost); model.AddElementToLastSubset(0); }
  model.CreateSparseRowView(); native::SetCoverInvariant invariant(&model);
  native::SubsetBoolVector focus(native::SubsetIndex(3), false);
  focus[native::SubsetIndex(2)] = true;
  native::TrivialSolutionGenerator generator(&invariant);
  Expect(generator.NextSolution(focus) && invariant.cost() == 3 &&
         !invariant.is_selected()[native::SubsetIndex(0)] && invariant.is_selected()[native::SubsetIndex(2)],
         "Native Boolean focus owns the temporary list through dispatch and advances its source indices");
}

void LazySteepestSearchPreservesFocusedIndices() {
  operations_research::SetCoverModel model;
  for (int i = 0; i < 2; ++i) { model.AddEmptySubset(i ? 1 : 10); model.AddElementToLastSubset(0); }
  model.ComputeFeasibility();
  operations_research::SetCoverInvariant invariant(&model);
  invariant.LoadSolution(operations_research::SubsetBoolVector(operations_research::SubsetIndex(2), true));
  operations_research::SubsetBoolVector focus(operations_research::SubsetIndex(2), false); focus[operations_research::SubsetIndex(1)] = true;
  operations_research::LazySteepestSearch search(&invariant);
  Expect(search.NextSolution(focus) && invariant.is_selected()[operations_research::SubsetIndex(0)]
      && !invariant.is_selected()[operations_research::SubsetIndex(1)], "Focused cost positions must retain their original subset IDs");
  bridge::SetCoverBridgeRequest request; request.set_operation(bridge::SET_COVER_OPERATION_LAZY_STEEPEST);
  request.add_costs(10); request.add_costs(1); request.add_starts(0); request.add_starts(1); request.add_starts(2);
  request.add_elements(0); request.add_elements(0); request.add_selected(true); request.add_selected(true);
  request.set_has_focus(true); request.add_focus(false); request.add_focus(true);
  const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
  bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.selected(0) && !response.selected(1),
      "Server dispatch forwards native lazy steepest focus correctly");
}


void NativeFormatsRoundTripAndCleanUpErrors() {
  const auto temporary_count = [] {
    int count = 0;
    for (const auto& file : std::filesystem::directory_iterator("/tmp"))
      if (file.path().filename().string().find("ortools-cover-") == 0) ++count;
    return count;
  };
  const int before = temporary_count();
  auto model = ortools_wasm::ReadSetCoverText("2 2\n0.10000000000000002 2\n1 1\n2 1 2", 0);
  for (int format : {0, 1}) {
    const auto restored = ortools_wasm::ReadSetCoverText(ortools_wasm::WriteSetCoverText(model, format), format);
    Expect(restored.ExportModelAsProto().SerializeAsString() == model.ExportModelAsProto().SerializeAsString(), "Native formats preserve exact double costs and incidence");
  }
  auto fimi = ortools_wasm::ReadSetCoverText("10 11 11\n11 12\n12", 2);
  Expect(fimi.num_elements() == 3 && fimi.num_subsets() == 3 && fimi.num_nonzeros() == 5, "Native FIMI normalizes labels and removes duplicates");
  for (const auto& invalid : std::vector<std::pair<int, std::string>>{{0, "2 1\n1\n1 1\n0"}, {0, "2 1\n1\n0\n0"}, {1, "2 1\n1 1 1"}, {1, "2 1\n1 0"}, {0, ""}, {0, "1 1\nwat\n1 1"}, {0, "1 1\n1\n1"}, {0, "1 1\n1\n1 2"}, {0, "1 1\ninf\n1 1"}, {1, "1 1\n1 1 0"}, {2, "one"}, {2, "-1"}}) {
    bridge::SetCoverBridgeRequest request; request.set_operation(bridge::SET_COVER_OPERATION_READ_MODEL); request.set_format(invalid.first); request.set_input(invalid.second);
    const auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(!execution.ok, "Invalid native input returns an error instead of terminating the server");
    Expect(temporary_count() == before, "Private temporary files are released on parser exceptions");
  }
  bridge::SetCoverBridgeRequest request; request.set_operation(bridge::SET_COVER_OPERATION_READ_MODEL); request.set_input("1 1\n1\n1 1");
  auto execution = Execute({1, "set-cover", request.SerializeAsString()}); bridge::SetCoverBridgeResponse response;
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_model_proto_json(), "Server returns native model JSON after parser errors");
  request.ParseFromString(Request().payload); request.set_operation(bridge::SET_COVER_OPERATION_WRITE_MODEL); request.set_format(1);
  execution = Execute({1, "set-cover", request.SerializeAsString()});
  Expect(execution.ok && response.ParseFromString(execution.payload) && response.has_text(), "Server exports native rail text");
  request.set_format(2); Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Missing native FIMI writer is not emulated");
  Expect(temporary_count() == before, "All native format operations release temporary files");
}


// Exercise the actual executor with a hard, bounded MIP so a missing native
// cancellation handler fails without leaving an unlimited test job behind.
void CancelsRunningMipAndReleasesCapacity() {
  bridge::SetCoverBridgeRequest request;
  request.set_operation(bridge::SET_COVER_OPERATION_MIP);
  request.set_time_limit_seconds(10);
  request.add_starts(0);
  std::mt19937 random(42);
  for (int subset = 0; subset < 2000; ++subset) {
    request.add_costs(1 + random() % 100);
    request.add_selected(false);
    std::vector<bool> seen(1000, false);
    for (int entry = 0; entry < 50;) {
      const int element = random() % 1000;
      if (seen[element]) continue;
      seen[element] = true;
      request.add_elements(element);
      ++entry;
    }
    request.add_starts(request.elements_size());
  }
  SetCoverExecutor executor;
  JobScheduler scheduler({1, 8});
  SolverExecutorResult execution;
  std::promise<void> started;
  auto handle = scheduler.Submit(JobSpec{"set-cover", 1}, [&](JobContext& context) {
    started.set_value();
    execution = executor.Execute({1, "set-cover", request.SerializeAsString()}, context, [](std::string) {});
    if (execution.failure_kind == SolverExecutionFailureKind::kCancelled) return JobResult::Cancelled();
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  started.get_future().get();
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  Expect(handle.Cancel(), "Running Set Cover MIP cancellation is accepted");
  Expect(handle.result().wait_for(std::chrono::seconds(3)) == std::future_status::ready,
      "Native MIP stops promptly instead of consuming its entire solve budget");
  Expect(handle.result().get().state == JobState::kCancelled && !execution.ok &&
      execution.failure_kind == SolverExecutionFailureKind::kCancelled, "Cancellation is reported instead of a partial solution");
  auto next = scheduler.Submit(JobSpec{"set-cover", 1}, [&](JobContext& context) {
    const auto result = executor.Execute(Request(), context, [](std::string) {});
    return result.ok ? JobResult::Succeeded() : JobResult::Failed(result.error_message);
  });
  Expect(next.result().wait_for(std::chrono::seconds(3)) == std::future_status::ready &&
      next.result().get().state == JobState::kSucceeded, "Cancellation releases scheduler capacity for the next solve");
}

// Synchronize at native search output to prove the integration hook can stop
// a solve already inside MPSolver, including guard teardown before destruction.
void InterruptsInternalMipDuringNativeSolve() {
  using namespace operations_research;
  SetCoverModel model;
  for (int subset = 0; subset < 3; ++subset) {
    model.AddEmptySubset(1);
    model.AddElementToLastSubset(subset);
    model.AddElementToLastSubset((subset + 1) % 3);
  }
  model.CreateSparseRowView();
  SetCoverInvariant invariant(&model);
  JobScheduler scheduler({1, 8});
  std::promise<void> searching, release;
  const auto released = release.get_future().share();
  std::atomic<bool> signalled{false}, interrupted{false};
  auto handle = scheduler.Submit(JobSpec{"set-cover", 1}, [&](JobContext& context) {
    ortools_wasm::RunSetCoverMip(invariant, false, {}, false, 5, [&](MPSolver& solver) {
      auto cancellation = context.OnCancellation([&solver, &interrupted] { interrupted = solver.InterruptSolve(); });
      Expect(solver.SetMessageCallback([&](const std::string&) {
        if (!signalled.exchange(true)) {
          searching.set_value();
          released.wait();
        }
      }), "SCIP supports native message callbacks");
      solver.EnableOutput();
      return solver.Solve();
    });
    return JobResult::Succeeded();
  });
  const bool reached_search = searching.get_future().wait_for(std::chrono::seconds(3)) == std::future_status::ready;
  // Always release the callback before throwing so test failures cannot deadlock.
  if (reached_search) handle.Cancel();
  release.set_value();
  Expect(reached_search, "Internal MPSolver enters native search");
  Expect(handle.result().wait_for(std::chrono::seconds(3)) == std::future_status::ready,
      "Interrupted internal MPSolver finishes");
  Expect(handle.result().get().state == JobState::kCancelled && interrupted,
      "Scoped server cancellation reaches the internal solver");
}

void ReturnsNativeSearchTimingAndSessionCounters() {
  auto result = Execute(Request()); bridge::SetCoverBridgeResponse response;
  Expect(result.ok && response.ParseFromString(result.payload) && response.has_run_time_seconds() && response.has_run_time_microseconds(), "One-shot generator timing is returned");
  Expect(response.run_time_seconds() >= 0 && response.run_time_microseconds() >= 0 && response.run_time_seconds() * 1e6 - response.run_time_microseconds() < 1.01, "Native microsecond truncation is preserved");
  SetCoverExecutor executor; bridge::SetCoverBridgeRequest request; request.ParseFromString(Request().payload);
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_CREATE); request.set_session_algorithm(bridge::SET_COVER_OPERATION_GUIDED_LOCAL);
  for (int i = 0; i < request.selected_size(); ++i) request.set_selected(i, true);
  result = Execute({1, "set-cover", request.SerializeAsString()}, &executor);
  Expect(result.ok && response.ParseFromString(result.payload), "Guided session is created"); const auto handle = response.session_handle();
  request.Clear(); request.set_operation(bridge::SET_COVER_OPERATION_SESSION_NEXT); request.set_session_handle(handle); request.set_max_iterations(2);
  result = Execute({1, "set-cover", request.SerializeAsString()}, &executor);
  Expect(result.ok && response.ParseFromString(result.payload), "Guided search runs"); const double before = response.run_time_seconds();
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_STATISTICS);
  result = Execute({1, "set-cover", request.SerializeAsString()}, &executor);
  Expect(result.ok && response.ParseFromString(result.payload) && response.run_time_seconds() == before && response.selected_size() == 0, "Timing reads the native counter without serializing solution state or running search");
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_DELETE); Expect(Execute({1, "set-cover", request.SerializeAsString()}, &executor).ok, "Session closes");
  request.set_operation(bridge::SET_COVER_OPERATION_SESSION_STATISTICS); Expect(!Execute({1, "set-cover", request.SerializeAsString()}, &executor).ok, "Closed session timing is unavailable");
}

void PreservesNativeCftPrimalDualState() {
  using namespace operations_research;
  for (double scale : {1.0, 0.1, 0.0}) {
    SetCoverModel model;
    bridge::SetCoverBridgeRequest request;
    request.set_operation(bridge::SET_COVER_OPERATION_CFT);
    request.add_starts(0);
    // An expensive leading duplicate must retain its full-model position.
    const std::vector<std::vector<int>> columns = {{0, 1}, {0, 1}, {1, 2}, {0, 2}};
    for (const auto& column : columns) {
      const double cost = request.costs_size() == 0 ? 10.0 : scale;
      model.AddEmptySubset(cost); request.add_costs(cost);
      for (int element : column) { model.AddElementToLastSubset(element); request.add_elements(element); }
      request.add_starts(request.elements_size());
    }
    model.CreateSparseRowView();
    scp::SubModel submodel(&model);
    const auto native = scp::RunCftHeuristic(submodel);
    auto execution = Execute({1, "set-cover", request.SerializeAsString()});
    bridge::SetCoverBridgeResponse response;
    Expect(execution.ok && response.ParseFromString(execution.payload), "CFT bridge succeeds: " + execution.error_message);
    Expect(response.cost() == native.solution.cost() && response.num_uncovered_elements() == 0, "Native cover snapshot");
    Expect(response.selected_size() == 4 && !response.selected(0), "Full-model subset IDs");
    for (auto subset : native.solution.subsets()) Expect(response.selected(subset.value()), "Native selected subset");
    const auto& dual = response.cft_dual();
    Expect(response.has_cft_dual() && dual.lower_bound() == native.dual_state.lower_bound(), "Native dual bound");
    Expect(dual.multipliers_size() == 3 && dual.reduced_costs_size() == 4, "Full-model dual dimensions");
    for (int i = 0; i < 3; ++i) Expect(dual.multipliers(i) == native.dual_state.multipliers()[ElementIndex(i)], "Native multiplier");
    for (int j = 0; j < 4; ++j) Expect(dual.reduced_costs(j) == native.dual_state.reduced_costs()[SubsetIndex(j)], "Native reduced cost");
    for (int j = 0; j < 4; ++j) request.add_selected(true);
    scp::SubModel seeded_model(&model);
    const auto seeded_native = scp::RunCftHeuristic(seeded_model,
        scp::Solution(seeded_model, {SubsetIndex(0), SubsetIndex(1), SubsetIndex(2), SubsetIndex(3)}));
    execution = Execute({1, "set-cover", request.SerializeAsString()});
    Expect(execution.ok && response.ParseFromString(execution.payload), "Seeded CFT bridge succeeds");
    Expect(response.cost() == seeded_native.solution.cost() && response.num_uncovered_elements() == 0,
        "Native initial-cover overload is preserved");
    for (auto subset : seeded_native.solution.subsets()) Expect(response.selected(subset.value()), "Native seeded selection");
    for (int j = 0; j < 4; ++j) request.set_selected(j, false);
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Explicit empty cover rejects safely");
    request.set_selected(0, true);
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Incomplete cover rejects safely");
    request.mutable_selected()->RemoveLast();
    Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Malformed seed dimensions reject safely");
    request.clear_selected();
    request.set_costs(1, -1); Expect(!Execute({1, "set-cover", request.SerializeAsString()}).ok, "Reject negative costs safely");
  }
  bridge::SetCoverBridgeRequest empty; empty.set_operation(bridge::SET_COVER_OPERATION_CFT); empty.add_starts(0);
  Expect(!Execute({1, "set-cover", empty.SerializeAsString()}).ok, "Reject empty native CFT model");
  empty.add_costs(1); empty.add_starts(0);
  Expect(!Execute({1, "set-cover", empty.SerializeAsString()}).ok, "Reject empty subsets before native search");
  empty.set_starts(1, 1); empty.add_elements(1);
  Expect(!Execute({1, "set-cover", empty.SerializeAsString()}).ok, "Reject uncovered element before native search");
}

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"CancelsRunningMipAndReleasesCapacity", CancelsRunningMipAndReleasesCapacity},
      {"InterruptsInternalMipDuringNativeSolve", InterruptsInternalMipDuringNativeSolve},
      {"PreservesNativeCftPrimalDualState", PreservesNativeCftPrimalDualState},
      {"ReturnsNativeSearchTimingAndSessionCounters", ReturnsNativeSearchTimingAndSessionCounters},
      {"NativeFormatsRoundTripAndCleanUpErrors", NativeFormatsRoundTripAndCleanUpErrors},
      {"LazySteepestSearchPreservesFocusedIndices", LazySteepestSearchPreservesFocusedIndices},
      {"PerturbsUsingNativeFocusAndIntersectionSemantics", PerturbsUsingNativeFocusAndIntersectionSemantics},
      {"ReturnsNativeIncrementalRemovabilityWithoutRetainingResults", ReturnsNativeIncrementalRemovabilityWithoutRetainingResults},
      {"NativeBooleanFocusKeepsIndicesAndLifetime", NativeBooleanFocusKeepsIndicesAndLifetime},
      {"PreservesLoadedCostAndCopyIndependence", PreservesLoadedCostAndCopyIndependence},
      {"PreservesNonfiniteNativeCosts", PreservesNonfiniteNativeCosts},
      {"PreservesNativeMipAndRelaxationContracts", PreservesNativeMipAndRelaxationContracts},
      {"ComputesNativeLagrangianBound", ComputesNativeLagrangianBound},
      {"RejectsIncompleteElementOffsets", RejectsIncompleteElementOffsets},
      {"CompressesTraceUsingNativeOrder", CompressesTraceUsingNativeOrder},
      {"RetainsNativeGuidedGeneratorsAndRejectsClosedHandles", RetainsNativeGuidedGeneratorsAndRejectsClosedHandles},
      {"ReadsAndAppliesNativeGuidedTabuParameters", ReadsAndAppliesNativeGuidedTabuParameters},
      {"ComputesNativeStatisticsAndDeciles", ComputesNativeStatisticsAndDeciles},
      {"InspectsNativeInvariantWithoutSearching", InspectsNativeInvariantWithoutSearching},
      {"RejectsInvalidIterationLimits", RejectsInvalidIterationLimits},
      {"PreservesNativeTimeLimitSemantics", PreservesNativeTimeLimitSemantics},
      {"RejectsInvalidTimeLimits", RejectsInvalidTimeLimits},
      {"HandlesInfeasibleGreedyModel", HandlesInfeasibleGreedyModel},
      {"SolvesAndSerializesResult", SolvesAndSerializesResult},
      {"ReservesOneThread", ReservesOneThread},
      {"RejectsMismatchedDimensions", RejectsMismatchedDimensions},
  };
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
      return EXIT_FAILURE;
    }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
