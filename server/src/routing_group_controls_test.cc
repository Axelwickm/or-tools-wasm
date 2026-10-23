#include "server/src/routing_test_helpers.h"
#include "server/src/routing_executor.h"
#include "server/src/job_scheduler.h"
#include "routing.pb.h"
#include "ortools/constraint_solver/routing.h"
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace ortools_wasm::server {
namespace {
namespace bridge = ::ortools_wasm::bridge::v1;
void Expect(bool value, const std::string& message) { if (!value) throw std::runtime_error(message); }
bridge::RoutingBridgeRequest Request(int nodes, int vehicles, int64_t cost) {
  bridge::RoutingBridgeRequest request;
  request.set_num_locations(nodes); request.set_num_vehicles(vehicles); SetRoutingFirstSolutionStrategy(&request, 3);
  for (int vehicle = 0; vehicle < vehicles; ++vehicle) { request.add_starts(0); request.add_ends(0); }
  auto* matrix = request.mutable_transit_matrix(); matrix->set_dimension(nodes);
  for (int index = 0; index < nodes * nodes; ++index) matrix->add_values(cost);
  return request;
}
void Next(bridge::RoutingBridgeRequest& request, int index, int successor) {
  auto* value = request.add_operations()->mutable_set_next_values(); value->set_index(index); value->add_values(successor);
}
SolverExecutorResult Execute(const bridge::RoutingBridgeRequest& request) {
  RoutingExecutor executor; JobScheduler scheduler({2, 8}); SolverExecutorResult execution;
  auto handle = scheduler.Submit(JobSpec{"routing", 1}, [&](JobContext& context) {
    execution = executor.Execute({1, "routing", request.SerializeAsString()}, context, [](std::string) {});
    return execution.ok ? JobResult::Succeeded() : JobResult::Failed(execution.error_message);
  });
  handle.result().get(); return execution;
}
bridge::RoutingBridgeResponse Response(const bridge::RoutingBridgeRequest& request) {
  const auto execution = Execute(request); Expect(execution.ok, execution.error_message);
  bridge::RoutingBridgeResponse response; Expect(response.ParseFromString(execution.payload), "Response parses"); return response;
}
void Group(bridge::RoutingBridgeRequest& request, const std::vector<int64_t>& indices, int64_t cost) {
  auto* value = request.add_operations()->mutable_add_soft_same_vehicle_constraint();
  for (int64_t index : indices) value->add_indices(index); value->set_cost(cost);
}
void Policy(bridge::RoutingBridgeRequest& request, int vehicle, int policy) {
  auto* value = request.add_operations()->mutable_set_pickup_delivery_policy(); value->set_vehicle(vehicle); value->set_policy(policy);
}
void Pair(bridge::RoutingBridgeRequest& request, int pickup, int delivery) {
  auto* value = request.add_operations()->mutable_add_pickup_and_delivery(); value->set_pickup(pickup); value->set_delivery(delivery);
}
void Disjunction(bridge::RoutingBridgeRequest& request, const std::vector<int64_t>& indices, int64_t penalty, int64_t maximum, int behavior) {
  auto* value = request.add_operations()->mutable_add_disjunction();
  for (int64_t index : indices) value->add_indices(index);
  value->set_penalty(penalty); value->set_max_cardinality(maximum); value->set_penalty_cost_behavior(behavior);
}
void Activity(bridge::RoutingBridgeRequest& request, int index, int value) {
  auto* operation = request.add_operations()->mutable_set_active_values(); operation->set_index(index); operation->add_values(value);
}
void AppliesSoftSameVehiclePenalties() {
  auto request = Request(3, 2, 1);
  Next(request, 0, 1); Next(request, 1, 4); Next(request, 3, 2); Next(request, 2, 5);
  Group(request, {2, 1, 2}, 7); Group(request, {}, 9); Group(request, {1, 2}, 3); Group(request, {1}, 0);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) { current.mutable_initial_assignment()->add_routes()->add_indices(1); current.mutable_initial_assignment()->add_routes()->add_indices(2); current.set_read_assignment_only(kind == 2); }
    const auto result = Response(current);
    Expect(result.has_solution() && result.objective_value() == 14, "Groups charge each extra used vehicle in normal/warm/restored solves; duplicates/empty/zero-cost groups retain native semantics");
  }
  auto together = Request(3, 2, 1); Group(together, {1, 2}, 50);
  const auto optimum = Response(together); Expect(optimum.objective_value() == 3 && optimum.vehicle_values(1) == optimum.vehicle_values(2), "Native optimizer accounts for grouped costs");
  auto optional = Request(3, 2, 1); Disjunction(optional, {1}, 1, 1, 0); Activity(optional, 1, 0); Group(optional, {1, 2}, 10);
  Expect(Response(optional).objective_value() == 3, "Dropped nodes do not count as extra used vehicles");
  auto large = Request(3, 2, 0);
  Next(large, 0, 1); Next(large, 1, 4); Next(large, 3, 2); Next(large, 2, 5); Group(large, {1, 2}, 9007199254741003LL);
  Expect(Response(large).objective_value() == 9007199254741003LL, "Group costs preserve exact int64 objectives");
}
void EnforcesPickupDeliveryPolicies() {
  auto request = Request(5, 2, 1); Pair(request, 1, 3); Pair(request, 2, 4); Policy(request, 0, 2); Policy(request, 1, 2);
  Next(request, 0, 1); Next(request, 1, 2); Next(request, 2, 3); Next(request, 3, 4); Next(request, 4, 6); Next(request, 5, 7);
  for (int kind = 0; kind < 3; ++kind) {
    auto current = request;
    if (kind > 0) { auto* route = current.mutable_initial_assignment()->add_routes(); for (int index : {1, 2, 3, 4}) route->add_indices(index); current.mutable_initial_assignment()->add_routes(); current.set_read_assignment_only(kind == 2); }
    const auto result = Response(current); Expect(result.has_solution() && result.objective_value() == 5, "FIFO allows pickup-order deliveries in normal/warm/restored routes");
  }
  Policy(request, 0, 1); Expect(!Response(request).has_solution(), "LIFO rejects a forced FIFO delivery order");
  Policy(request, 0, 0); Expect(Response(request).has_solution(), "Policy replacement restores unrestricted delivery order");
  auto stack = Request(5, 1, 1); Pair(stack, 1, 3); Pair(stack, 2, 4); Policy(stack, 0, 1);
  Next(stack, 0, 1); Next(stack, 1, 2); Next(stack, 2, 4); Next(stack, 4, 3); Next(stack, 3, 5);
  Expect(Response(stack).has_solution(), "LIFO permits reverse pickup-order deliveries");
}
void AppliesDisjunctionCardinalityAndPenaltyModes() {
  for (int behavior = 0; behavior < 2; ++behavior) {
    auto request = Request(4, 1, 0); Disjunction(request, {1, 2, 3}, 10, 2, behavior);
    for (int index : {1, 2, 3}) Activity(request, index, 0);
    auto result = Response(request); Expect(result.has_solution() && result.objective_value() == (behavior == 0 ? 10 : 20), "Penalty modes distinguish once-only and per-missing-cardinality charges");
    request.mutable_initial_assignment()->add_routes(); request.set_read_assignment_only(true);
    Expect(Response(request).objective_value() == (behavior == 0 ? 10 : 20), "Restoration preserves disjunction penalties");
  }
  auto required = Request(4, 1, 1); Disjunction(required, {1, 2, 3}, -1, 2, 0);
  Expect(Response(required).objective_value() == 3, "Negative penalties enforce exact cardinality");
  auto* route = required.mutable_initial_assignment()->add_routes(); route->add_indices(1); route->add_indices(2); required.set_read_assignment_only(true);
  Expect(Response(required).has_solution(), "Exact mandatory cardinality permits restoration");
  route->clear_indices(); route->add_indices(1); Expect(!Response(required).has_solution(), "Missing mandatory cardinality rejects restoration");
  auto shortage = Request(2, 1, 1); Disjunction(shortage, {1}, 5, 2, 1);
  Expect(Response(shortage).objective_value() == 7, "Optional cardinality above group size charges unavoidable shortfall");
}
void RejectsMalformedGroupControls() {
  for (int kind = 0; kind < 14; ++kind) {
    auto request = Request(3, 1, 1);
    if (kind < 4) Group(request, {kind == 0 ? -1 : kind == 1 ? 3 : kind == 2 ? std::numeric_limits<int64_t>::max() : 1}, kind == 3 ? -1 : 1);
    else if (kind < 8) Policy(request, kind == 4 ? -1 : kind == 5 ? 1 : 0, kind == 6 ? -1 : kind == 7 ? 3 : 0);
    else Disjunction(request, kind == 8 ? std::vector<int64_t>{0} : kind == 9 ? std::vector<int64_t>{3} : kind == 10 ? std::vector<int64_t>{} : std::vector<int64_t>{1},
      5, kind == 11 ? 0 : kind == 12 ? -1 : 1, kind == 13 ? 2 : 0);
    Expect(!Execute(request).ok, "Malformed groups, policies and disjunctions are rejected before native indexing or fatal cardinality checks");
  }
}
void InspectsNativeDisjunctionMetadata() {
  using operations_research::RoutingIndexManager;
  using operations_research::RoutingModel;
  RoutingIndexManager manager(5, 2, RoutingIndexManager::NodeIndex(0));
  RoutingModel model(manager);
  Expect(model.GetNumberOfDisjunctions() == 0 && !model.HasMandatoryDisjunctions()
    && !model.HasMaxCardinalityConstrainedDisjunctions(), "Empty metadata defaults");
  const auto first = model.AddDisjunction({2, 1, 2}, 9007199254741003LL, 2, RoutingModel::PENALIZE_PER_INACTIVE);
  Expect(first.value() == 0 && model.GetDisjunctionIndices(2).size() == 2
    && model.GetDisjunctionIndices(2)[0] == first && model.GetDisjunctionIndices(2)[1] == first
    && model.GetDisjunctionIndices(1).size() == 1 && model.GetDisjunctionIndices(4).empty()
    && model.GetDisjunctionIndices(model.Start(1)).empty(), "Node memberships preserve input duplicates, including empty start memberships");
  Expect(model.GetDisjunctionPenalty(first) == 9007199254741003LL && model.GetDisjunctionMaxCardinality(first) == 2
    && model.GetDisjunctionPenaltyCostBehavior(first) == RoutingModel::PENALIZE_PER_INACTIVE
    && model.HasMaxCardinalityConstrainedDisjunctions() && !model.HasMandatoryDisjunctions(), "Exact metadata and constrained cardinality");
  const auto second = model.AddDisjunction({2}, -2, 9007199254741003LL);
  Expect(!model.HasMandatoryDisjunctions() && model.GetDisjunctionMaxCardinality(second) == 9007199254741003LL,
    "Mandatory inspection specifically matches -1, not other negative penalties");
  const auto defaults = model.AddDisjunction({3});
  Expect(model.GetNumberOfDisjunctions() == 3 && model.HasMandatoryDisjunctions()
    && model.GetDisjunctionPenalty(defaults) == -1 && model.GetDisjunctionMaxCardinality(defaults) == 1
    && model.GetDisjunctionPenaltyCostBehavior(defaults) == RoutingModel::PENALIZE_ONCE
    && model.GetDisjunctionIndices(2).back() == second, "Native defaults and overlapping membership order");
  RoutingModel unconstrained(manager);
  unconstrained.AddDisjunction({1, 2}, 0, 2); unconstrained.AddDisjunction({1}, 0, 9007199254741003LL);
  Expect(!unconstrained.HasMaxCardinalityConstrainedDisjunctions(), "Equal or larger cardinalities do not constrain group size");
}
void VisitType(bridge::RoutingBridgeRequest& request, int64_t index, int type, int policy = 0) {
  auto* value = request.add_operations()->mutable_set_visit_type(); value->set_index(index); value->set_type(type); value->set_policy(policy);
}
void HardTypes(bridge::RoutingBridgeRequest& request, int first, int second) {
  auto* value = request.add_operations()->mutable_add_hard_type_incompatibility(); value->set_type1(first); value->set_type2(second);
}
void EnforcesHardVisitTypeRoutes() {
  auto request = Request(3, 2, 1); VisitType(request, 1, 0); VisitType(request, 2, 1);
  Expect(Response(request).objective_value() == 3, "Types alone do not require separate vehicles");
  HardTypes(request, 0, 1); const auto result = Response(request);
  Expect(result.has_solution() && result.objective_value() == 4 && result.vehicle_values(1) != result.vehicle_values(2), "Hard incompatible types require separate routes");
  for (int kind = 0; kind < 2; ++kind) {
    auto current = request; current.mutable_initial_assignment()->add_routes()->add_indices(1);
    current.mutable_initial_assignment()->add_routes()->add_indices(2); current.set_read_assignment_only(kind == 1);
    Expect(Response(current).objective_value() == 4, "Warm/restored routes retain hard incompatibilities");
  }
  request.mutable_initial_assignment()->add_routes()->add_indices(1); request.mutable_initial_assignment()->mutable_routes(0)->add_indices(2);
  request.mutable_initial_assignment()->add_routes(); request.set_read_assignment_only(true);
  Expect(!Response(request).has_solution(), "Restoration rejects incompatible visits on the same route");
  auto optional = Request(3, 1, 1); VisitType(optional, 1, 0); VisitType(optional, 2, 1); HardTypes(optional, 0, 1);
  Expect(!Response(optional).has_solution(), "Mandatory incompatible visits cannot fit one vehicle");
  Disjunction(optional, {2}, 1, 1, 0);
  Expect(Response(optional).objective_value() == 3, "Optional incompatible visits may be dropped");
}
void PreservesVisitPolicyOccurrenceSemantics() {
  for (int policy = 0; policy < 4; ++policy) {
    auto request = Request(3, 2, 1); VisitType(request, 1, 0, policy); VisitType(request, 2, 1); HardTypes(request, 0, 1);
    const auto result = Response(request);
    Expect(result.has_solution() && result.objective_value() == (policy == 1 ? 3 : 4), "All visit policies preserve native hard-type occurrences, including removal without an earlier addition");
  }
  auto self = Request(3, 2, 1); VisitType(self, 1, 0); VisitType(self, 2, 0); HardTypes(self, 0, 0);
  Expect(Response(self).objective_value() == 4, "Self-incompatible visits use separate routes");
  auto starts = Request(2, 2, 1); VisitType(starts, 0, 0); VisitType(starts, 1, 1); HardTypes(starts, 0, 1);
  Expect(Response(starts).vehicle_values(1) == 1, "Typed vehicle starts participate in hard incompatibilities");
}
void InspectsNativeVisitTypeMetadata() {
  using operations_research::RoutingIndexManager;
  using operations_research::RoutingModel;
  RoutingIndexManager manager(6, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
  Expect(model.GetVisitType(1) == -1 && model.GetVisitTypePolicy(1) == RoutingModel::TYPE_ADDED_TO_VEHICLE
    && model.GetNumberOfVisitTypes() == 0 && !model.HasHardTypeIncompatibilities(), "Untyped defaults");
  model.AddPickupAndDelivery(3, 4); model.AddPickupAndDelivery(1, 2);
  for (int node : {1, 2, 3, 4, 5}) model.SetVisitType(node, 2, node == 2 || node == 4 ? RoutingModel::ADDED_TYPE_REMOVED_FROM_VEHICLE : RoutingModel::TYPE_ADDED_TO_VEHICLE);
  model.SetVisitType(0, 3, RoutingModel::TYPE_ON_VEHICLE_UP_TO_VISIT);
  model.SetVisitType(5, 4, RoutingModel::TYPE_SIMULTANEOUSLY_ADDED_AND_REMOVED);
  model.SetVisitType(5, -1, RoutingModel::ADDED_TYPE_REMOVED_FROM_VEHICLE);
  Expect(model.GetNumberOfVisitTypes() == 5 && model.GetVisitType(5) == -1 && model.GetVisitTypePolicy(5) == RoutingModel::ADDED_TYPE_REMOVED_FROM_VEHICLE,
    "Clearing a type preserves native highest-type count and configured policy");
  model.AddHardTypeIncompatibility(2, 3); model.AddHardTypeIncompatibility(3, 2); model.AddHardTypeIncompatibility(2, 2);
  model.CloseModel();
  Expect(model.GetSingleNodesOfType(2).empty() && model.GetSingleNodesOfType(3) == std::vector<int>({0})
    && model.GetSingleNodesOfType(4).empty() && model.GetSingleNodesOfType(0).empty(), "Finalized singleton lists include starts and sparse/cleared types");
  Expect(model.GetPairIndicesOfType(2) == std::vector<int>({1, 0}), "Pair IDs are deduplicated in native node encounter order");
  const auto& types = model.GetHardTypeIncompatibilitiesOfType(2);
  Expect(types.size() == 2 && types.contains(2) && types.contains(3) && model.GetHardTypeIncompatibilitiesOfType(3).contains(2)
    && model.GetHardTypeIncompatibilitiesOfType(0).empty() && model.HasHardTypeIncompatibilities(), "Hard incompatibility sets are symmetric and idempotent");
}
void RejectsMalformedVisitTypeControls() {
  for (int kind = 0; kind < 8; ++kind) {
    auto request = Request(3, 1, 1);
    VisitType(request, kind == 0 ? -1 : kind == 1 ? 3 : kind == 2 ? std::numeric_limits<int64_t>::max() : 1,
      kind == 3 ? -2 : kind == 4 ? std::numeric_limits<int>::max() : 0, kind == 5 ? -1 : kind == 6 ? 4 : 0);
    if (kind == 7) HardTypes(request, 0, 1);
    Expect(!Execute(request).ok, "Malformed visit indices, type overflow, policies and unknown incompatibilities reject before native checks/indexing");
  }
  auto no_types = Request(3, 1, 1); HardTypes(no_types, 0, 0);
  Expect(!Execute(no_types).ok, "Incompatibilities require existing type count");
  auto negative = Request(3, 1, 1); VisitType(negative, 1, 0); HardTypes(negative, -1, 0);
  Expect(!Execute(negative).ok, "Negative incompatible types reject safely");
}
void TemporalTypes(bridge::RoutingBridgeRequest& request, int first, int second) {
  auto* value = request.add_operations()->mutable_add_temporal_type_incompatibility();
  value->set_type1(first); value->set_type2(second);
}
void EnforcesTemporalVisitOrder() {
  auto request = Request(4, 1, 1); VisitType(request, 1, 0); VisitType(request, 2, 0, 1); VisitType(request, 3, 1);
  TemporalTypes(request, 0, 1);
  Expect(Response(request).objective_value() == 4, "Optimizer finds nonoverlapping route");
  for (bool restore : {false, true}) {
    auto current = request;
    auto* route = current.mutable_initial_assignment()->add_routes();
    for (int node : {1, 2, 3}) route->add_indices(node);
    current.set_read_assignment_only(restore);
    Expect(Response(current).objective_value() == 4, "Warm/restored sequential types are feasible");
  }
  auto overlap = request; Next(overlap, 0, 1); Next(overlap, 1, 3); Next(overlap, 3, 2); Next(overlap, 2, 4);
  Expect(!Response(overlap).has_solution(), "Forced overlap is infeasible");
  HardTypes(request, 0, 1);
  Expect(!Response(request).has_solution(), "Hard rules remain independent and forbid sequential sharing");
  for (int policy = 0; policy < 4; ++policy) {
    auto typed = Request(3, 1, 1); VisitType(typed, 1, 0, policy); VisitType(typed, 2, 1); TemporalTypes(typed, 0, 1);
    Next(typed, 0, 1); Next(typed, 1, 2); Next(typed, 2, 3);
    Expect(Response(typed).has_solution() == (policy != 0), "Temporal policies allow forward ordering except persistent addition");
  }
}
void InspectsAndValidatesTemporalTypes() {
  using operations_research::RoutingIndexManager; using operations_research::RoutingModel;
  RoutingIndexManager manager(2, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
  Expect(!model.HasTemporalTypeIncompatibilities(), "Default temporal flag");
  model.SetVisitType(1, 3, RoutingModel::TYPE_ADDED_TO_VEHICLE);
  model.AddTemporalTypeIncompatibility(3, 1); model.AddTemporalTypeIncompatibility(1, 3); model.AddTemporalTypeIncompatibility(3, 3);
  model.CloseModel();
  Expect(model.HasTemporalTypeIncompatibilities() && !model.HasHardTypeIncompatibilities()
    && model.GetTemporalTypeIncompatibilitiesOfType(3).size() == 2
    && model.GetTemporalTypeIncompatibilitiesOfType(1).contains(3)
    && model.GetTemporalTypeIncompatibilitiesOfType(0).empty(), "Symmetric native sets and sparse defaults");
  for (int invalid : {-1, 4, std::numeric_limits<int>::max()}) {
    auto request = Request(2, 1, 1); VisitType(request, 1, 3); TemporalTypes(request, 0, invalid);
    Expect(!Execute(request).ok, "Invalid temporal IDs reject safely");
  }
  auto untyped = Request(2, 1, 1); TemporalTypes(untyped, 0, 0);
  Expect(!Execute(untyped).ok, "Temporal rules require defined type range");
}
void Requirement(bridge::RoutingBridgeRequest& request, int kind, int dependent, const std::vector<int>& alternatives) {
  auto* value = request.add_operations()->mutable_add_type_requirement();
  value->set_kind(static_cast<bridge::RoutingTypeRequirementKind>(kind)); value->set_dependent_type(dependent);
  for (int type : alternatives) value->add_required_type_alternatives(type);
}
void EnforcesSameVehicleTypeRequirements() {
  auto request = Request(4, 2, 1); VisitType(request, 1, 0); VisitType(request, 2, 1); VisitType(request, 3, 2);
  Requirement(request, 0, 0, {1, 2}); Requirement(request, 0, 0, {2});
  const auto solved = Response(request);
  Expect(solved.has_solution() && solved.vehicle_values(1) == solved.vehicle_values(3), "Optimizer satisfies each list on the same vehicle");
  for (int kind = 0; kind < 2; ++kind) {
    auto current = request;
    auto* first = current.mutable_initial_assignment()->add_routes(); first->add_indices(1); first->add_indices(3);
    current.mutable_initial_assignment()->add_routes()->add_indices(2); current.set_read_assignment_only(kind == 1);
    Expect(Response(current).has_solution(), "Warm and restored routes honor same-vehicle alternatives");
  }
  auto invalid = request;
  auto* first = invalid.mutable_initial_assignment()->add_routes(); first->add_indices(1); first->add_indices(2);
  invalid.mutable_initial_assignment()->add_routes()->add_indices(3); invalid.set_read_assignment_only(true);
  Expect(!Response(invalid).has_solution(), "Separate alternative lists are conjunctive");
}
void EnforcesTemporalTypeRequirements() {
  auto request = Request(6, 1, 1);
  VisitType(request, 1, 1); VisitType(request, 2, 1, 1); VisitType(request, 3, 0); VisitType(request, 4, 0, 1); VisitType(request, 5, 2);
  Requirement(request, 1, 0, {1}); Requirement(request, 2, 0, {2});
  Expect(Response(request).objective_value() == 6, "Optimizer finds route with separate addition/removal providers");
  for (const auto& order : std::vector<std::vector<int>>{{1, 3, 2, 5, 4}, {1, 2, 3, 5, 4}, {1, 3, 2, 4, 5}}) {
    auto current = request; int previous = 0;
    for (int node : order) { Next(current, previous, node); previous = node; } Next(current, previous, 6);
    Expect(Response(current).has_solution() == (order == std::vector<int>{1, 3, 2, 5, 4}), "Providers must be present at the applicable visit");
  }
}
void PreservesEmptyTypeRequirementPolicies() {
  for (int kind = 0; kind < 3; ++kind) {
    for (int policy = 0; policy < 4; ++policy) {
      auto request = Request(2, 1, 0); VisitType(request, 1, 0, policy); Requirement(request, kind, 0, {});
      const bool infeasible = kind == 0 ? policy != 1 : kind == 1 ? policy == 0 || policy == 3 : policy != 0;
      Expect(Response(request).has_solution() == !infeasible, "Empty requirements disable the native matching policies");
      if (infeasible) {
        Disjunction(request, {1}, 7, 1, 0);
        Expect(Response(request).objective_value() == 7, "Empty requirements allow optional dependent dropping");
      }
    }
  }
}
void InspectsAndValidatesTypeRequirements() {
  using operations_research::RoutingIndexManager; using operations_research::RoutingModel;
  RoutingIndexManager manager(2, 1, RoutingIndexManager::NodeIndex(0)); RoutingModel model(manager);
  model.SetVisitType(1, 4, RoutingModel::TYPE_ADDED_TO_VEHICLE);
  Expect(!model.HasTypeRegulations(), "Type assignment alone sets no regulation flag");
  model.AddSameVehicleRequiredTypeAlternatives(4, {1, 3}); model.AddSameVehicleRequiredTypeAlternatives(4, {1, 3});
  model.AddRequiredTypeAlternativesWhenAddingType(4, {2}); model.AddRequiredTypeAlternativesWhenRemovingType(4, {0, 2});
  model.CloseModel();
  Expect(model.HasTypeRegulations() && model.HasSameVehicleTypeRequirements() && model.HasTemporalTypeRequirements()
    && model.GetSameVehicleRequiredTypeAlternativesOfType(4).size() == 2
    && model.GetRequiredTypeAlternativesWhenAddingType(4).at(0).contains(2)
    && model.GetRequiredTypeAlternativesWhenRemovingType(4).at(0).size() == 2
    && model.GetSameVehicleRequiredTypeAlternativesOfType(0).empty(), "Native nested sets, repeated lists and sparse metadata");
  RoutingModel empty(manager); empty.SetVisitType(1, 0, RoutingModel::TYPE_ADDED_TO_VEHICLE);
  empty.AddSameVehicleRequiredTypeAlternatives(0, {}); empty.AddRequiredTypeAlternativesWhenAddingType(0, {}); empty.AddRequiredTypeAlternativesWhenRemovingType(0, {});
  empty.CloseModel();
  Expect(!empty.HasTypeRegulations() && !empty.HasSameVehicleTypeRequirements() && !empty.HasTemporalTypeRequirements()
    && empty.GetSameVehicleRequiredTypeAlternativesOfType(0).empty()
    && empty.GetRequiredTypeAlternativesWhenAddingType(0).empty() && empty.GetRequiredTypeAlternativesWhenRemovingType(0).empty(), "Empty lists are absent from native flags and getters");
  for (int kind : {-1, 0, 1, 2, 3}) {
    auto request = Request(2, 1, 1); VisitType(request, 1, 0);
    Requirement(request, kind, 0, {0, 1});
    Expect(!Execute(request).ok, "Unknown kinds and alternatives reject before native indexing");
  }
  for (int type : {-1, 1}) {
    auto request = Request(2, 1, 1); VisitType(request, 1, 0); Requirement(request, 0, type, {});
    Expect(!Execute(request).ok, "Invalid dependent type rejects even with empty alternatives");
    auto alternative = Request(2, 1, 1); VisitType(alternative, 1, 0); Requirement(alternative, 2, 0, {type});
    Expect(!Execute(alternative).ok, "Invalid required type rejects safely");
  }
  auto untyped = Request(2, 1, 1); Requirement(untyped, 1, 0, {});
  Expect(!Execute(untyped).ok, "Requirements need an existing type count");
}
void AppliesAndInspectsSameActivityGroups() {
  auto request = Request(4, 1, 10);
  for(int index : {1,2,3}) Disjunction(request,{index},5,1,0);
  auto add=[&](std::vector<int> indices){auto* group=request.add_operations()->mutable_add_same_activity_group(); for(int index:indices)group->add_indices(index);};
  add({1,2}); add({2,3}); add({}); add({1}); add({1,1});
  Activity(request,1,0);
  const auto solved=Response(request);
  Expect(solved.has_solution() && solved.objective_value()==15 && solved.vehicle_values(2)==-1 && solved.vehicle_values(3)==-1,
      "Overlapping activity groups propagate native drop decisions");
  auto query=request; query.set_inspect_activity_groups(true);
  const auto inspection=Response(query).activity_groups();
  Expect(inspection.groups(1)==inspection.groups(2) && inspection.groups(2)==inspection.groups(3), "Native inspection reflects transitive active-variable equality");
  const auto& indices=inspection.members(inspection.groups(1)).indices();
  Expect(indices.size()==3 && indices.Get(0)==1 && indices.Get(1)==2 && indices.Get(2)==3, "Native group members preserve routing indices");
  Activity(request,2,1); Expect(!Response(request).has_solution(), "Contradictory grouped activities are infeasible");
  for (int invalid : {-1,4,std::numeric_limits<int>::max()}) {
    auto malformed=Request(4,1,1); malformed.add_operations()->mutable_add_same_activity_group()->add_indices(invalid);
    Expect(!Execute(malformed).ok, "Invalid group indices reject before native access");
  }
}
int RunAllTests() {
  const std::vector<std::pair<std::string, void (*)()>> tests = {
    {"EnforcesSameVehicleTypeRequirements", EnforcesSameVehicleTypeRequirements},
    {"EnforcesTemporalTypeRequirements", EnforcesTemporalTypeRequirements},
    {"PreservesEmptyTypeRequirementPolicies", PreservesEmptyTypeRequirementPolicies},
    {"InspectsAndValidatesTypeRequirements", InspectsAndValidatesTypeRequirements},
    {"EnforcesTemporalVisitOrder", EnforcesTemporalVisitOrder},
    {"InspectsAndValidatesTemporalTypes", InspectsAndValidatesTemporalTypes},
    {"EnforcesHardVisitTypeRoutes", EnforcesHardVisitTypeRoutes},
    {"PreservesVisitPolicyOccurrenceSemantics", PreservesVisitPolicyOccurrenceSemantics},
    {"InspectsNativeVisitTypeMetadata", InspectsNativeVisitTypeMetadata},
    {"RejectsMalformedVisitTypeControls", RejectsMalformedVisitTypeControls},
    {"InspectsNativeDisjunctionMetadata", InspectsNativeDisjunctionMetadata},
    {"AppliesSoftSameVehiclePenalties", AppliesSoftSameVehiclePenalties},
    {"EnforcesPickupDeliveryPolicies", EnforcesPickupDeliveryPolicies},
    {"AppliesDisjunctionCardinalityAndPenaltyModes", AppliesDisjunctionCardinalityAndPenaltyModes},
    {"RejectsMalformedGroupControls", RejectsMalformedGroupControls},
    {"AppliesAndInspectsSameActivityGroups", AppliesAndInspectsSameActivityGroups},
  };
  for (const auto& [name, test] : tests) {
    try { test(); std::cout << "[PASS] " << name << '\n'; }
    catch (const std::exception& error) { std::cerr << "[FAIL] " << name << ": " << error.what() << '\n'; return EXIT_FAILURE; }
  }
  return EXIT_SUCCESS;
}
}  // namespace
}  // namespace ortools_wasm::server
int main() { return ortools_wasm::server::RunAllTests(); }
