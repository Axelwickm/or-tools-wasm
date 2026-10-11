#include "server/src/set_cover_executor.h"

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
#include "javascript/set_cover_guided_session.h"

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

void NativeCostUpdatesRecoverFromRoundingAndOverflow() {
  namespace native = ::operations_research;
  for (const auto& costs : {std::vector<double>{1e20, 1},
      std::vector<double>{1e20, 1, 5e5}, std::vector<double>{1e308, 1e308, 1e308}}) {
    native::SetCoverModel model;
    for (const double cost : costs) { model.AddEmptySubset(cost); model.AddElementToLastSubset(0); }
    model.CreateSparseRowView(); native::SetCoverInvariant invariant(&model);
    native::SubsetBoolVector selected(native::SubsetIndex(costs.size()), true);
    invariant.LoadSolution(selected);
    native::SteepestSearch search(&invariant); search.SetMaxIterations(costs.size() - 1);
    search.NextSolution();
    int remaining = 0;
    for (const auto subset : model.SubsetRange()) if (invariant.is_selected()[subset]) {
      ++remaining;
      Expect(invariant.cost() == model.subset_costs()[subset], "Native cost equals the remaining leaf after cancellation");
    }
    Expect(remaining == 1 && invariant.CheckConsistency(native::SetCoverInvariant::ConsistencyLevel::kRedundancy),
           "Native scalar cache recovers from cancellation/overflow without corrupting coverage");
    invariant.Clear(); invariant.LoadSolution(selected);
    Expect(invariant.CheckConsistency(native::SetCoverInvariant::ConsistencyLevel::kCostAndCoverage),
           "Clear and bulk load reconstruct matching native sums");
  }
}

void PreservesScalarCostStateAcrossLoadsAndCopies() {
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
  for (int pass = 0; pass < 20; ++pass) {
    invariant.Select(native::SubsetIndex(0), level);
    invariant.Deselect(native::SubsetIndex(0), level);
    Expect(invariant.cost() == 500001 && invariant.CheckConsistency(level),
           "Repeated large updates retain the smaller selected costs");
  }
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

int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
      {"NativeBooleanFocusKeepsIndicesAndLifetime", NativeBooleanFocusKeepsIndicesAndLifetime},
      {"PreservesScalarCostStateAcrossLoadsAndCopies", PreservesScalarCostStateAcrossLoadsAndCopies},
      {"NativeCostUpdatesRecoverFromRoundingAndOverflow", NativeCostUpdatesRecoverFromRoundingAndOverflow},
      {"PreservesNonfiniteNativeCosts", PreservesNonfiniteNativeCosts},
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
