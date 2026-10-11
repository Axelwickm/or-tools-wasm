import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runDepotIndices({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const depotCases = [
    { starts: [2, 2], ends: [0, 0], nodes: [1, 2, 3, 2, 0, 0], startIndices: [1, 3], endIndices: [4, 5], routes: [[1], [3]] },
    { starts: [2, 2], ends: [0, 1], nodes: [2, 3, 2, 0, 1], startIndices: [0, 2], endIndices: [3, 4], routes: [[3], []] },
    { starts: [2, 0], ends: [0, 2], nodes: [0, 1, 2, 3, 0, 2], startIndices: [2, 0], endIndices: [4, 5], routes: [[1], [3]] },
    { starts: [1, 2], ends: [0, 0], nodes: [1, 2, 3, 0, 0], startIndices: [0, 1], endIndices: [3, 4], routes: [[3], []] },
  ];
  for (const fixture of depotCases) {
    const manager = new api.RoutingIndexManager(4, 2, fixture.starts, fixture.ends);
    assert(manager.getNumberOfIndices() === fixture.nodes.length, 'End-only depots must not add ordinary indices');
    fixture.nodes.forEach((node, index) => assert(manager.indexToNode(index) === node, 'Index-to-node mapping must match native order'));
    for (let node = 0; node < 4; ++node) {
      const expected = fixture.ends.includes(node) && !fixture.starts.includes(node) ? -1 : fixture.nodes.indexOf(node);
      assert(manager.nodeToIndex(node) === expected, 'End-only nodes must map to -1; starts use their first index');
    }
    const model = new api.RoutingModel(manager);
    const transit = model.registerTransitCallback((from, to) => from * 10 + to + 1);
    model.setArcCostEvaluatorOfAllVehicles(transit);
    model.addDimension(transit, 0, 1000, true, 'indexed');
    const [vector] = model.addVectorDimension([1, 2, 3, 4], 1000, true, 'nodes');
    model.addDimension(vector, 0, 1000, true, 'copied');
    const routes = fixture.routes.map(route => route.map(node => manager.nodeToIndex(node)));
    let objective = 0n;
    const assignment = await model.readAssignmentFromRoutes(routes, false, { executor });
    assert(assignment, `Distinct-depot routes must restore natively (${mode})`);
    for (let vehicle = 0; vehicle < 2; ++vehicle) {
      const start = fixture.startIndices[vehicle], end = fixture.endIndices[vehicle];
      assert(manager.getStartIndex(vehicle) === start && model.start(vehicle) === start, 'Native and public starts must agree');
      assert(manager.getEndIndex(vehicle) === end && model.end(vehicle) === end && model.isEnd(end), 'Native and public ends must agree');
      const path = [start, ...routes[vehicle], end];
      let indexed = 0n, nodes = 0n;
      for (let position = 0; position < path.length - 1; ++position) {
        const from = path[position], to = path[position + 1];
        assert(assignment.value(model.nextVar(from)) === to, 'Restoration must preserve the requested routing indices');
        indexed += BigInt(from * 10 + to + 1);
        nodes += BigInt(manager.indexToNode(from) + 1);
      }
      if (routes[vehicle].length) objective += indexed;
      assert(assignment.value(model.getDimensionOrDie('indexed').cumulVar(end)) === indexed,
        'Sampled callbacks must keep native routing-index semantics');
      for (const name of ['nodes', 'copied']) assert(assignment.value(model.getDimensionOrDie(name).cumulVar(end)) === nodes,
        'Native node vectors and reused evaluators must agree on end-only depots');
    }
    assert(assignment.objectiveValue() === objective, 'Native objective must match index-specific route costs');
    const warmed = await model.solveFromAssignmentWithParameters(assignment, {}, { executor });
    assert(warmed, 'Distinct-depot assignments must remain valid warm starts');
    assert(assignment.objectiveValue() === objective, 'Warm optimization must preserve the original assignment snapshot');
  }
  for (const construct of [() => new api.RoutingIndexManager(4, 1, 4),
    () => new api.RoutingIndexManager(4, 1, [4], [0]), () => new api.RoutingIndexManager(4, 1, [0], [4])]) {
    let rejected = false;
    try { construct(); } catch { rejected = true; }
    assert(rejected, 'Out-of-range depots must fail before native construction');
  }
  results.push({ id: 'routing.correctness.end_only_depot_indices',
    name: 'End-only and overlapping depot indices match native mappings', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
