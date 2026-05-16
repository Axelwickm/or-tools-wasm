# Routing Test Porting Roster

This is a temporary working roster for porting upstream OR-Tools routing tests to the JavaScript/TypeScript fixture suite.

Status values:
- `todo`: not ported yet
- `ported`: TypeScript case exists
- `verified`: translated against upstream source and passing in fixture runs
- `blocked`: upstream test needs routing API surface not exported yet

## Routing API Contract

Source: `ortools/constraint_solver/python/pywraprouting_test.py`

| Status | Upstream test | Notes |
| --- | --- | --- |
| verified | `TestPyWrapRoutingIndexManager.testCtor` |  |
| verified | `TestPyWrapRoutingIndexManager.testCtorMultiDepotSame` | needs multi-depot manager constructor |
| verified | `TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff` | needs multi-depot manager constructor |
| verified | `TestPyWrapRoutingModel.testCtor` |  |
| verified | `TestPyWrapRoutingModel.testSolve` | needs `Solve()` and `status()` |
| verified | `TestPyWrapRoutingModel.testSolveMultiDepot` | needs multi-depot manager constructor, `Solve()`, `status()` |
| verified | `TestPyWrapRoutingModel.testTransitCallback` |  |
| verified | `TestPyWrapRoutingModel.testTransitLambda` |  |
| verified | `TestPyWrapRoutingModel.testTransitMatrix` | needs `RegisterTransitMatrix()` |
| verified | `TestPyWrapRoutingModel.testUnaryTransitCallback` | needs `RegisterUnaryTransitCallback()` |
| verified | `TestPyWrapRoutingModel.testUnaryTransitLambda` | needs `RegisterUnaryTransitCallback()` |
| verified | `TestPyWrapRoutingModel.testUnaryTransitVector` | needs `RegisterUnaryTransitVector()` |
| verified | `TestPyWrapRoutingModel.testTSP` |  |
| verified | `TestPyWrapRoutingModel.testVRP` | needs multi-depot manager constructor |
| verified | `TestPyWrapRoutingModel.testDimensionTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testConstantDimensionTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testVectorDimensionTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testMatrixDimensionTSP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testMatrixDimensionVRP` | needs dimensions |
| verified | `TestPyWrapRoutingModel.testDisjunctionTSP` | needs disjunctions |
| verified | `TestPyWrapRoutingModel.testDisjunctionPenaltyTSP` | needs disjunctions |
| verified | `TestPyWrapRoutingModel.testRoutingModelParameters` | needs model parameters / solver exposure |
| verified | `TestPyWrapRoutingModel.testRoutingLocalSearchFiltering` | needs solver local-search profile |
| verified | `TestPyWrapRoutingModel.testRoutingSearchParameters` | needs close/assignment-from-assignment/stat APIs |
| verified | `TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters` | needs search parameter validation |
| verified | `TestPyWrapRoutingModel.testCallback` | needs at-solution callback and cost var |
| verified | `TestPyWrapRoutingModel.testReadAssignment` | needs assignment-from-routes APIs |
| verified | `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple` | needs automatic first solution strategy getter |
| verified | `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd` | needs pickup/delivery, dimensions, solver constraints |
| verified | `TestBoundCost.testCtor` | needs `BoundCost` |
| verified | `TestRoutingDimension.testCtor` | needs dimensions |
| verified | `TestRoutingDimension.testSoftSpanUpperBound` | needs `RoutingDimension` soft span APIs |
| verified | `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound` | needs `RoutingDimension` quadratic soft span APIs |
