import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runResourceInspection({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const model = new api.RoutingModel(new api.RoutingIndexManager(2, 2, 0));
  model.addConstantDimension(1, (1n << 63n) - 1n, false, 'time');
  model.addConstantDimension(1, 100, false, 'other');
  const group = model.addResourceGroup();
  const bounds: [number, number][] = [[5, 7], [0, 3], [3, 5]];
  for (let resource = 0; resource < 2; ++resource) group.addResource({ startDomain: bounds, endDomain: [[10, 12], [20, 22]] }, 'time');
  group.addResource({ startDomain: [[8, 9]], endDomain: [[10, 12]] }, 'time');
  const exact = 9007199254740993n;
  group.addResource({ startDomain: [[exact, exact + 10n]], endDomain: [[exact + 20n, exact + 30n]] }, 'time');
  for (const vehicle of [0, 1]) group.notifyVehicleRequiresAResource(vehicle);
  bounds[0][0] = 99;
  const initial = await group.inspect({ executor });
  assert(initial.affectedDimensions.join(',') === 'time' && initial.classes.length === 3 && initial.resources.length === 4,
    'Native resource classes and affected dimensions');
  assert(initial.resources.map(resource => resource.classIndex).join(',') === '0,0,1,2'
    && initial.classes[0].resourceIndices.join(',') === '0,1', 'Native class membership follows normalized attributes');
  const time = initial.resources[0].dimensionAttributes.find(value => value.dimensionName === 'time')!;
  assert(time.startDomain.length === 1 && time.startDomain[0][0] === 0n && time.startDomain[0][1] === 7n
    && time.endDomain.length === 2 && time.endDomain[1][0] === 20n, 'Native interval normalization and holes are preserved');
  const other = initial.resources[0].dimensionAttributes.find(value => value.dimensionName === 'other')!;
  assert(other.startDomain[0][0] === -(1n << 63n) && other.endDomain[0][1] === (1n << 63n) - 1n,
    'Unaffected dimensions expose native default attributes');
  assert(initial.resources[3].dimensionAttributes.find(value => value.dimensionName === 'time')?.startDomain[0][0] === exact,
    'Native attributes retain exact int64 values');
  assert(await group.getResourceClassesCount({ executor }) === 3 && await group.getResourceClassIndex(1, { executor }) === 0
    && (await group.getResourceIndicesInClass(0, { executor })).join(',') === '0,1'
    && (await group.getResourceIndicesPerClass({ executor }))[2][0] === 3, 'Awaited native class getters');
  assert((await group.getResources({ executor })).length === 4 && (await group.getResource(2, { executor })).classIndex === 1
    && (await group.getDimensionAttributesForClass('time', 0, { executor })).startDomain[0][1] === 7n,
    'Awaited resource and class attribute getters');
  model.resourceVar(0, group).setValues([0, 2, 3]);
  const restricted = await group.inspect({ executor });
  assert(restricted.classes.length === 4 && restricted.resources[0].classIndex !== restricted.resources[1].classIndex
    && initial.classes.length === 3, 'Native resource classes account for variable domains and old snapshots remain detached');
  const eligibility = model.addResourceGroup();
  eligibility.addResource({}, 'time'); eligibility.addResource({}, 'time'); eligibility.notifyVehicleRequiresAResource(0);
  assert(await eligibility.getResourceClassesCount({ executor }) === 1, 'Identical native resources initially share a class');
  eligibility.setAllowedResourcesForVehicle(0, [0]);
  assert(await eligibility.getResourceClassesCount({ executor }) === 2, 'Native resource classes account for explicit eligibility');
  restricted.classes[0].resourceIndices.push(99); time.startDomain[0][1] = 99n;
  assert((await group.getResource(0, { executor })).dimensionAttributes.find(value => value.dimensionName === 'time')?.startDomain[0][1] === 7n,
    'Mutating inspection results cannot modify registered resources');
  const empty = model.addResourceGroup();
  assert((await empty.inspect({ executor })).resources.length === 0 && await empty.getResourceClassesCount({ executor }) === 0,
    'Empty groups return empty native resource/class snapshots');
  for (const invalid of [() => group.getResource(4, { executor }), () => group.getResourceIndicesInClass(4, { executor }),
    () => group.getDimensionAttributesForClass('missing', 0, { executor })]) {
    let rejected = false; try { await invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid resource, class and dimension inspection reject');
  }
  const controller = new AbortController(); controller.abort();
  let cancelled = false; try { await group.inspect({ executor, signal: controller.signal }); } catch (error) { cancelled = (error as Error).name === 'AbortError'; }
  assert(cancelled && (await group.inspect({ executor })).classes.length === 4, 'Inspection cancellation and recovery');
  const solved = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  solved.addConstantDimension(1, 100, false, 'time');
  const solvedGroup = solved.addResourceGroup();
  solvedGroup.addResource({ startDomain: [[0, 0]], endDomain: [[2, 2]] }, 'time'); solvedGroup.notifyVehicleRequiresAResource(0);
  const assignment = await solved.solveWithParameters({}, { executor });
  assert(assignment, 'Resource inspection state-preservation fixture solves');
  const status = solved.status();
  assert((await solvedGroup.inspect({ executor })).classes.length === 1 && solved.status() === status
    && assignment.value(solved.resourceVar(0, solvedGroup)) === 0, 'Inspection preserves completed solve state and assignments');
  return [{ id: 'routing.resources.native_inspection' , name: 'Native resource attributes, classes, eligibility and inspection snapshots',
    solver: 'routing', source: 'ortools/constraint_solver/routing.h:ResourceGroup', tags: ['contract', 'resources'], mode, ok: true }];
}
