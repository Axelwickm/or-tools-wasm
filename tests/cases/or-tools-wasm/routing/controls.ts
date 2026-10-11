import { runNonlinearExpressions } from './controls/nonlinear_expressions.ts';
import { runBooleanExpressions } from './controls/boolean_expressions.ts';
import { runResourceInspection } from './controls/resource_inspection.ts';
import { runResourceVariables } from './controls/resource_variables.ts';
import { runResources } from './controls/resources.ts';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type * as Api from 'or-tools-wasm/routing';
import type { RoutingControlResult } from './controls/shared.ts';
import { runConditionalConstraints } from './controls/conditional_constraints.ts';
import { runTransitVehicleVariables } from './controls/transit_vehicle_variables.ts';
import { runVariableExpressions } from './controls/variable_expressions.ts';
import { runFinalizers } from './controls/finalizers.ts';
import { runTypeRequirements } from './controls/type_requirements.ts';
import { runTemporalTypes } from './controls/temporal_types.ts';
import { runVisitTypes } from './controls/visit_types.ts';
import { runGroupConstraints } from './controls/group_constraints.ts';
import { runVehicleCosts } from './controls/vehicle_costs.ts';
import { runSoftCumulBounds } from './controls/soft_cumul_bounds.ts';
import { runSlackBounds } from './controls/slack_bounds.ts';
import { runActiveDomains } from './controls/active_domains.ts';
import { runDimensionCosts } from './controls/dimension_costs.ts';
import { runSuccessorDomains } from './controls/successor_domains.ts';
import { runModelSafety } from './controls/model_safety.ts';
import { runNumerical } from './controls/numerical.ts';
import { runVehicleDomains } from './controls/vehicle_domains.ts';
import { runVehicleEligibility } from './controls/vehicle_eligibility.ts';
import { runCumulBounds } from './controls/cumul_bounds.ts';
import { runAutomaticStrategy } from './controls/automatic_strategy.ts';
import { runVehicleAssignments } from './controls/vehicle_assignments.ts';
import { runDepotIndices } from './controls/depot_indices.ts';
import { runDimensionConstruction } from './controls/dimension_construction.ts';
import { runDimensionEvaluators } from './controls/dimension_evaluators.ts';
import { runAssignmentRanges } from './controls/assignment_ranges.ts';
import { runConstraintsCosts } from './controls/constraints_costs.ts';
import { runProgressCancellation } from './controls/progress_cancellation.ts';

export async function runRoutingControlCases(api: typeof Api) {
  const results: RoutingControlResult[] = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    for (const run of [
      runResources,
      runResourceVariables,
      runResourceInspection,
      runBooleanExpressions,
      runNonlinearExpressions,
      runConditionalConstraints,
      runTransitVehicleVariables,
      runVariableExpressions,
      runFinalizers,
      runVisitTypes,
      runTemporalTypes,
      runTypeRequirements,
      runGroupConstraints,
      runVehicleCosts,
      runSoftCumulBounds,
      runSlackBounds,
      runActiveDomains,
      runDimensionCosts,
      runSuccessorDomains,
      runModelSafety,
      runNumerical,
      runVehicleDomains,
      runVehicleEligibility,
      runCumulBounds,
      runAutomaticStrategy,
      runVehicleAssignments,
      runDepotIndices,
      runDimensionConstruction,
      runDimensionEvaluators,
      runAssignmentRanges,
      runConstraintsCosts,
      runProgressCancellation,
    ]) results.push(...await run({ api, mode, executor }));
  }
  return results;
}
