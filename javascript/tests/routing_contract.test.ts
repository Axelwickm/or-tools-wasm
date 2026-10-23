import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { routingParametersDescriptor } from '../lib/generated/routing_schemas.ts';

test('routing preparation keeps solve and inspection budgets with their captured parameters and callbacks', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-inspection-budget-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: { contents: `export * from './routing/api.ts';`, resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'capture-inspection-budget', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectRoutingExecutor {
          execute(operation, options) {
            globalThis.__routingInspectionBudget = { operation, resources: options.resources, callback: options.onCallback };
            return { result: Promise.resolve({type:'solve', status:0, solution:null, routeCost:7n,
              modelInspection:{value:0n, dimensionIndices:[]},
              cumulOptimizers:{globalDimensions:['time'], localDimensions:['time']}}) };
          }
        }` }));
      } }],
    });
    const { RoutingModel, RoutingIndexManager } = await import(outfile);
    const parametersType = protobuf.Root.fromJSON(routingParametersDescriptor)
      .lookupType('operations_research.RoutingSearchParameters');
    const capturedWorkers = (request: { searchParametersProto: Uint8Array }) =>
      parametersType.toObject(parametersType.decode(request.searchParametersProto)).satParameters?.numWorkers;
    const submittedRequest = () => (globalThis as Record<string, any>).__routingInspectionBudget;
    const assertBudget = (workers: number | undefined, secondaryWorkers: number | undefined, expected: number | undefined) => {
      const submitted = submittedRequest();
      assert.deepEqual(submitted.resources, expected === undefined ? undefined : { threads: expected },
        `Primary workers ${workers}, secondary workers ${secondaryWorkers}`);
      assert.equal(capturedWorkers(submitted.operation.request), workers);
      assert.equal(submitted.operation.request.searchParameterFields.includes('satParameters.numWorkers'), workers !== undefined);
      if (secondaryWorkers !== undefined) assert.equal(capturedWorkers(submitted.operation.request.secondaryModel), secondaryWorkers);
    };
    for (const [workers, secondaryWorkers, expected] of [
      [undefined, undefined, 1], [2, undefined, 2], [0, undefined, undefined],
      [undefined, 3, 3], [2, 3, 3], [3, 2, 3], [0, 3, undefined], [2, 0, undefined],
    ]) {
      const model = new RoutingModel(new RoutingIndexManager(3, 1, 0));
      model.addConstantDimension(1, 10, true, 'time');
      if (secondaryWorkers !== undefined) model.setSecondaryModel(
        new RoutingModel(new RoutingIndexManager(3, 1, 0)), { satParameters: { numWorkers: secondaryWorkers } });
      assert.equal(await model.areRoutesInterdependent(
        workers === undefined ? {} : { satParameters: { numWorkers: workers } }, { executor: 'direct' }), false);
      assertBudget(workers, secondaryWorkers, expected);
      const options = { executor: 'direct', ...(workers === undefined ? {} : { satParameters: { numWorkers: workers } }) };
      for (const inspect of [
        () => model.hasGlobalCumulOptimizer('time', options),
        () => model.hasLocalCumulOptimizer('time', options),
        () => model.getDimensionsWithGlobalCumulOptimizers(options),
        () => model.getDimensionsWithLocalCumulOptimizers(options),
      ]) {
        const result = await inspect();
        assert.ok(result === true || result[0].name === 'time');
        const submitted = submittedRequest();
        assert.equal(submitted.operation.request.inspectCumulOptimizers, true);
        assertBudget(workers, secondaryWorkers, expected);
      }
      await model.solve(options);
      assertBudget(workers, secondaryWorkers, expected);
      await model.solveWithParameters(workers === undefined ? {} : { satParameters: { numWorkers: workers } }, { executor: 'direct' });
      assertBudget(workers, secondaryWorkers, expected);
    }

    for (const workers of [2, 0]) for (const solve of [false, true]) {
      const model = new RoutingModel(new RoutingIndexManager(3, 1, 0));
      const secondaryParameters = { satParameters: { numWorkers: 3 } };
      model.setSecondaryModel(new RoutingModel(new RoutingIndexManager(3, 1, 0)), secondaryParameters);
      const parameters = { satParameters: { numWorkers: workers } };
      const pending = solve ? model.solveWithParameters(parameters, { executor: 'direct' })
        : model.areRoutesInterdependent(parameters, { executor: 'direct' });
      parameters.satParameters.numWorkers = 7;
      secondaryParameters.satParameters.numWorkers = 8;
      model.setSecondaryModel(null);
      await pending;
      assertBudget(workers, 3, workers === 0 ? undefined : 3);
      await model.areRoutesInterdependent(parameters, { executor: 'direct' });
      assertBudget(7, undefined, 7);
      assert.equal(submittedRequest().operation.request.secondaryModel, undefined);
    }

    for (const workers of [2, 0]) {
      const model = new RoutingModel(new RoutingIndexManager(3, 1, 0));
      await model.areRoutesInterdependent({ sat_parameters: { num_workers: workers } }, { executor: 'direct' });
      assertBudget(workers, undefined, workers || undefined);
    }

    const duringPreparation = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    const parameters = { satParameters: { numWorkers: 2 } };
    duringPreparation.setSecondaryModel(new RoutingModel(new RoutingIndexManager(3, 1, 0)), { satParameters: { numWorkers: 3 } });
    duringPreparation.setArcCostEvaluatorOfAllVehicles(duringPreparation.registerTransitCallback(() => {
      parameters.satParameters.numWorkers = 7;
      duringPreparation.setSecondaryModel(null);
      return 1;
    }));
    await duringPreparation.areRoutesInterdependent(parameters, { executor: 'direct' });
    assertBudget(2, 3, 3);

    const primary = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    const secondary = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    for (const workers of [4, 0]) {
      secondary.setSecondaryModel(new RoutingModel(new RoutingIndexManager(3, 1, 0)), { satParameters: { numWorkers: workers } });
      primary.setSecondaryModel(secondary, { satParameters: { numWorkers: 2 } });
      await primary.solveWithParameters({}, { executor: 'direct' });
      assertBudget(undefined, 2, workers || undefined);
      assert.equal(capturedWorkers(submittedRequest().operation.request.secondaryModel.secondaryModel), workers);
    }

    const callbacksModel = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    callbacksModel.addRouteConstraint(() => 7);
    const pending = callbacksModel.getRouteCost([0, 1], { executor: 'direct' });
    callbacksModel.addRouteConstraint(() => 9);
    assert.equal(await pending, 7n);
    const captured = submittedRequest();
    assert.equal(captured.operation.request.operations.filter((op: { type: string }) => op.type === 'addRouteConstraint').length, 1);
    const payload = new Uint8Array(4);
    assert.equal(new DataView(captured.callback(payload).buffer).getBigInt64(1, true), 7n);
    new DataView(payload.buffer).setUint32(0, 1, true);
    assert.throws(() => captured.callback(payload), /Unknown Routing route evaluator/);
  } finally {
    delete (globalThis as Record<string, unknown>).__routingInspectionBudget;
    await rm(directory, { recursive: true, force: true });
  }
});

test('routing disjunction IDs, unsupported constraints and vehicle-specific arc costs', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-contract-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export * from './routing/api.ts'; export { routingProtocol, RoutingVariableKind, RoutingDomainAction, RoutingFinalizerKind } from './routing/protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'no-native-execution', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectRoutingExecutor { execute(operation) { globalThis.__routingInspection = operation; return { result: Promise.resolve({type:'solve', status:0, solution:null, locksApplied:true, preAssignment:{0:1}, arcCosts:[777n], domainResults:[{min:0n,max:10n,size:11n,bound:false,softBound:999n}]}) }; } }` }));
      } }],
    });
    const { Assignment, RoutingModel, RoutingIndexManager, routingProtocol, RoutingVariableKind, RoutingDomainAction, RoutingFinalizerKind } = await import(outfile);
    assert.throws(() => new Assignment(new RoutingModel(new RoutingIndexManager(2, 1, 0))), /require a native solution/);
    assert.deepEqual(
      routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 3, solution: null, localSearchProfile: '' })),
      { type: 'solve', status: 3, solution: null, localSearchProfile: '' },
    );
    for (const value of [null, 0n, 9007199254740993n]) {
      const statistics = { numCpSatCallsInLpScheduling: 0n, numGlopCallsInLpScheduling: 0n,
        numMinCostFlowCalls: 0n, numCpSatCallsInRouting: 0n, numGeneralizedCpSatCallsInRouting: 0n,
        numDecisionsInFirstSolution: value, numRejectsInFirstSolution: value };
      const decoded = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 3,
        solution: null, searchStatistics: statistics }));
      assert.deepEqual(decoded.searchStatistics, statistics);
    }
    for (const strategy of [0, 3, 4, 8]) {
      const metadata = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 3,
        solution: null, automaticFirstSolutionStrategy: strategy }));
      assert.equal(metadata.automaticFirstSolutionStrategy, strategy);
    }
    assert.deepEqual(routingProtocol.decodeEvent(routingProtocol.encodeEvent({ type: 'searchEntered' })), { type: 'searchEntered' });
    const exact = 9_007_199_254_741_003n;
    const boundOperations = [
      { type: 'addPickupAndDeliverySets', pickupDisjunction: 0, deliveryDisjunction: 1 },
      { type: 'setPickupToDeliveryLimits', dimensionName: 'time', pairIndex: 1, limits: [exact, -(1n << 63n), (1n << 63n) - 1n] },
      { type: 'addDependentDimension', transitMatrices: [new BigInt64Array([0n, 1n, 1n, 0n])], unaryTransits: [true],
        dependentMatrices: [{ domainStart: 0n, domainEnd: 101n,
          functions: Array.from({ length: 4 }, () => ({ x: [0n, 100n], y: [1n, 2n] })) }],
        baseDimension: 'clock', slackMax: 0n, capacities: [100n], fixStartCumulToZero: true, name: 'dependent' },
      { type: 'setVisitType', index: 1, visitType: 0, policy: 0 },
      { type: 'setVisitType', index: 0, visitType: -1, policy: 3 },
      { type: 'addHardTypeIncompatibility', type1: 0, type2: 2 },
      { type: 'addTemporalTypeIncompatibility', type1: 0, type2: 2 },
      { type: 'addTypeRequirement', kind: 0, dependentType: 2, requiredTypeAlternatives: [0, 1] },
      { type: 'addTypeRequirement', kind: 1, dependentType: 2, requiredTypeAlternatives: [] },
      { type: 'addTypeRequirement', kind: 2, dependentType: 2, requiredTypeAlternatives: [0] },
      { type: 'addDimensionWithVehicleTransitAndCapacity', transitMatrices: [new BigInt64Array([0n, exact, 2n, 0n])],
        slackMax: exact, capacities: [exact], fixStartCumulToZero: true, name: 'combined' },
      { type: 'addConstantDimension', value: 1n, capacity: exact, slackMax: exact, fixStartCumulToZero: false, name: 'waiting' },
      { type: 'addConstantDimension', value: 1n, capacity: exact, slackMax: 0n, fixStartCumulToZero: true, name: 'zero_wait' },
      { type: 'addConstantDimension', value: 1n, capacity: exact, fixStartCumulToZero: true, name: 'legacy' },
      { type: 'addSoftSameVehicleConstraint', indices: [2, 1, 2], cost: exact },
      { type: 'setPickupDeliveryPolicy', policy: 0, vehicle: 0 },
      { type: 'setPickupDeliveryPolicy', policy: 2, vehicle: 1 },
      { type: 'addDisjunction', indices: [1], penalty: undefined, maxCardinality: exact, penaltyCostBehavior: 1 },
      { type: 'addDisjunction', indices: [1], penalty: 0n, maxCardinality: 1n, penaltyCostBehavior: 0 },
      { type: 'setSweepArranger', points: [{x:0,y:-1},{x:2147483647,y:0}] },
      { type: 'addOrderedActivityGroup', disjunctions: [1,0] },
      { type: 'ignoreDisjunctionsAlreadyForcedToZero' },
      { type: 'setTabuVars', variables: null },
      { type: 'setTabuVars', variables: [] },
      { type: 'setTabuVars', variables: [{ kind: 1, dimensionName: 'time', index: 0 }, { kind: 10, dimensionName: '', index: 1, resourceGroup: 2 }] },
      { type: 'setMaximumActiveVehicles', maximum: 0 },
      { type: 'setFixedVehicleCost', cost: exact, vehicle: 0 },
      { type: 'setAmortizedVehicleCosts', linear: exact, quadratic: 0n, vehicle: 0 },
      { type: 'setVehicleUsedWhenEmpty', isUsed: false, vehicle: 0 },
      { type: 'setCumulSoftBound', dimensionName: 'time', index: 0, bound: -exact, coefficient: exact, lower: false },
      { type: 'setCumulSoftBound', dimensionName: 'time', index: 1, bound: exact, coefficient: 0n, lower: true },
      { type: 'setSlackBounds', dimensionName: 'time', index: 0, lower: -exact, upper: exact },
      { type: 'setSlackBounds', dimensionName: 'time', index: 1, lower: -(1n << 63n), upper: (1n << 63n) - 1n },
      { type: 'setActiveValues', index: 1, values: [1, 0, 1] },
      { type: 'setActiveValues', index: 0, values: [] },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanUpperBound', value: exact, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanCost', value: exact, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'slackCost', value: exact, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'globalSpanCost', value: exact, vehicle: undefined },
      { type: 'setNextValues', index: 1, values: [2, 3, 2] },
      { type: 'setNextValues', index: 1, values: [] },
      { type: 'setNextValues', index: 0, values: [] },
      { type: 'setNextValues', index: 0, values: [2_147_483_647] },
      { type: 'setVehicleValues', index: 1, values: [-1, 0, 0] },
      { type: 'setVehicleValues', index: 0, values: [] },
      { type: 'setAllowedVehiclesForIndex', vehicles: [0, 0], index: 1 },
      { type: 'setAllowedVehiclesForIndex', vehicles: [], index: 0 },
      { type: 'setCumulBounds', dimensionName: 'time', index: 1, lower: -exact, upper: exact },
      { type: 'setCumulBounds', dimensionName: 'time', index: 0, lower: -(1n << 63n), upper: (1n << 63n) - 1n },
      { type: 'addBreakInterval', index: 0, startMin: exact, startMax: exact + 1n, duration: 2n, optional: true, name: 'rest' },
      { type: 'setBreakIntervals', dimensionName: 'time', intervals: [0], vehicle: 0, preTravel: [0n, 1n, 1n, 0n], postTravel: undefined },
      { type: 'setBreakIntervals', dimensionName: 'time', intervals: [0], vehicle: 0, preTravel: [0n, 1n, 1n, 0n], postTravel: undefined, preTravelHandle: 3, postTravelHandle: -1 },
      { type: 'addForbiddenIntervals', dimensionName: 'time', index: 1n, intervals: [{ start: exact, end: exact + 1n }] },
      { type: 'setPiecewiseCost', dimensionName: 'time', index: 1n, segments: [{ pointX: 0n, pointY: exact, slope: 2n, otherPointX: exact }] },
      { type: 'addRouteConstraint', evaluator: 0, costsAreHomogeneousAcrossVehicles: true },
      { type: 'setBreakDistanceDuration', dimensionName: 'time', distance: exact, duration: 2n, vehicle: 0 },
      { type: 'setPathEnergyCosts', force: 'load', distance: 'distance', threshold: exact, costBelow: 2n, costAbove: 3n, vehicle: 0 },
      { type: 'addSameActivityGroup', indices: [1, 1] },
      { type: 'addNodePrecedence', dimensionName: 'time', first: 0, second: 1, offset: exact, performedConstraint: 3 },
      { type: 'addNodePrecedence', dimensionName: 'time', first: 0, second: 1, offset: -exact, performedConstraint: 0 },
      { type: 'addDimension', transitMatrix: new BigInt64Array([1n, 1n, 2n, 2n]), unaryTransit: true,
        slackMax: 0n, capacity: exact, fixStartCumulToZero: true, name: 'unary' },
      { type: 'addDimensionWithVehicleTransitAndCapacity', transitMatrices: [new BigInt64Array([1n, 1n, 2n, 2n])], unaryTransits: [true],
        slackMax: 0n, capacities: [exact], fixStartCumulToZero: true, name: 'unary_per_vehicle' },
    ];
    const wire = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: {
      numLocations: 2, numVehicles: 1, starts: [0], ends: [0], searchParametersProto: new Uint8Array(),
      transitMatrix: new BigInt64Array(4), transitMatrixDimension: 2, dimensionNames: ['time'], operations: boundOperations,
      modelQuery: { kind: 7, index: 1n, otherIndex: 0n, vehicleOrClass: 0, defaultValue: -exact },
    } }));
    assert.deepEqual(wire.request.operations, boundOperations);
    const assignmentTransfer = { nextValues: [1, 2], vehicleValues: [-1, 0, 0] };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: {
      ...wire.request, assignmentTransfer,
    } })).request.assignmentTransfer, assignmentTransfer);
    const assignmentSeed = { variables: [{ variable: { kind: 3, index: 0, dimensionName: '' }, min: 1n, max: 1n }],
      intervals: [], objectiveMin: -(1n << 63n), objectiveMax: (1n << 63n) - 1n };
    assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null,
      assignmentSeed })).assignmentSeed, assignmentSeed);
    const seedRequest = { ...wire.request, initialAssignment: { routes: [], ignoreInactiveIndices: false, snapshot: assignmentSeed } };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: seedRequest })).request.initialAssignment, seedRequest.initialAssignment);
    const dimensionQuery = { dimensionName: 'time', kind: 9, index: 0n, otherIndex: 0n, vehicleOrClass: 0,
      lower: 0n, upper: 0n, pairIndex: 2, pickupAlternativeIndex: 1, deliveryAlternativeIndex: 3 };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: {
      ...wire.request, dimensionQuery,
    } })).request.dimensionQuery, dimensionQuery);
    const dimensionInspection = { value: (1n << 63n) - 1n, intervals: [], hasPiecewiseLinearCost: false, costSegments: [],
      nodePrecedences: [{ first: 2n, second: 3n, offset: -exact, performedConstraint: 3 }] };
    assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null,
      dimensionInspection })).dimensionInspection, dimensionInspection);
    assert.deepEqual(wire.request.modelQuery, { kind: 7, index: 1n, otherIndex: 0n, vehicleOrClass: 0, defaultValue: -exact, predicateEvaluator: 0, thirdIndex: 0n });
    const siblingQuery = { kind: 27, index: 1n, otherIndex: 0n, vehicleOrClass: 0, defaultValue: 0n, predicateEvaluator: 7, thirdIndex: 0n };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: { ...wire.request, modelQuery: siblingQuery } })).request.modelQuery, siblingQuery);
    for (const kind of [29, 30]) {
      const modelQuery = { kind, index: 0n, otherIndex: 0n, thirdIndex: 0n, vehicleOrClass: 0, defaultValue: 0n, predicateEvaluator: 0 };
      const request = { ...wire.request, modelQuery, searchParametersProto: new Uint8Array([8, 1]), searchParameterFields: ['localSearchMetaheuristic'] };
      const decoded = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request })).request;
      assert.deepEqual(decoded.modelQuery, modelQuery);
      assert.deepEqual(decoded.searchParametersProto, request.searchParametersProto);
      assert.deepEqual(decoded.searchParameterFields, request.searchParameterFields);
    }
    const arcQuery = { kind: 28, index: 0n, otherIndex: 1n, thirdIndex: exact, vehicleOrClass: 0, defaultValue: 0n, predicateEvaluator: 0 };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: { ...wire.request, modelQuery: arcQuery } })).request.modelQuery, arcQuery);
    const slackRequest = { ...wire.request, dimensionQuery: { ...dimensionQuery, kind: 13 },
      initialAssignment: { routes: [], ignoreInactiveIndices: false, snapshot: assignmentSeed } };
    const slackDecoded = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: slackRequest })).request;
    assert.deepEqual(slackDecoded.dimensionQuery, slackRequest.dimensionQuery);
    assert.deepEqual(slackDecoded.initialAssignment, slackRequest.initialAssignment);
    for (const value of [undefined, 0n, exact]) {
      const modelInspection = { value, dimensionIndices: [0, 2], indices: [1, 0], groups: [[0, 1], [], [2]], precedenceGroups: [[], [[0], [1]], [[2, 3]]] };
      assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null, modelInspection })).modelInspection, modelInspection);
    }
    for (const routeCost of [undefined, null, 0n, exact, -exact]) {
      const result = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null, routeCost }));
      assert.equal(result.routeCost, routeCost);
    }
    for (const routeCostQuery of [[], [0, 1, 1, 2]]) {
      const request = { ...wire.request, routeCostQuery };
      assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request })).request.routeCostQuery, routeCostQuery);
    }
    const activityGroups = { groups: [0, 1, 1], members: [[0], [1, 2]] };
    assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null, activityGroups })).activityGroups, activityGroups);
    const breakResult = { status: 1, objectiveValue: 0n, nextValues: [1, 2, 2], starts: [0], ends: [2], dimensionCumulValues: {},
      breakAssignments: [{ index: 0, performedMin: 1n, performedMax: 1n, startMin: exact, startMax: exact + 1n, endMin: exact + 2n, endMax: exact + 3n },
        { index: 1, performedMin: 0n, performedMax: 0n, startMin: undefined, startMax: undefined, endMin: undefined, endMax: undefined }] };
    assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 1, solution: breakResult })).solution.breakAssignments, breakResult.breakAssignments);
    const snapshot = { variables: [{ variable: { kind: RoutingVariableKind.ROUTING_VARIABLE_CUMUL, dimensionName: 'time', index: 1 }, min: exact, max: exact + 10n }],
      intervals: breakResult.breakAssignments, objectiveValue: exact };
    const reuseRequest = { ...wire.request, routeLocks: { routes: [[1]], closeRoutes: false }, inspectPreAssignment: true,
      firstSolutionHint: snapshot, initialAssignment: { routes: [], ignoreInactiveIndices: false, snapshot } };
    assert.deepEqual(routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', request: reuseRequest })).request, reuseRequest);
    for (const locksApplied of [true, false]) {
      const reply = { type: 'solve', status: 0, solution: null, localSearchProfile: '', locksApplied, preAssignment: { 0: 1, 1: 2 } };
      assert.deepEqual(routingProtocol.decodeResult(routingProtocol.encodeResult(reply)), reply);
    }
    const resourceModel = new RoutingModel(new RoutingIndexManager(2, 1, 0));
    resourceModel.addConstantDimension(1, exact + 10n, false, 'time');
    const resourceGroup = resourceModel.addResourceGroup();
    assert.throws(() => { resourceGroup.index = 99; }, TypeError);
    assert.throws(() => resourceGroup.getResourcesMarkedAllowedForVehicle(-1));
    resourceGroup.addResource({ startDomain: [[exact, exact]], endDomain: [[exact + 2n, exact + 2n]] }, 'time');
    resourceGroup.notifyVehicleRequiresAResource(0); resourceGroup.setAllowedResourcesForVehicle(0, [0, 0]);
    assert.deepEqual(resourceGroup.getResourcesMarkedAllowedForVehicle(0), [0]);
    await resourceModel.solve({ executor: 'direct' });
    const groupData = (globalThis as Record<string, any>).__routingInspection.request.resourceGroups[0];
    const resourceWire = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ ...wire, request: { ...wire.request, resourceGroups: [groupData] } }));
    assert.deepEqual(resourceWire.request.resourceGroups, [groupData]);
    const inspectionWire = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ ...resourceWire,
      request: { ...resourceWire.request, resourceInspectionGroup: 0 } }));
    assert.equal(inspectionWire.request.resourceInspectionGroup, 0);
    const attributes = { dimensionName: 'time', startDomain: [exact, exact + 1n], endDomain: [exact + 2n, exact + 3n] };
    const inspection = { affectedDimensions: ['time'], resources: [{ classIndex: 0, dimensionAttributes: [attributes] }],
      classes: [{ resourceIndices: [0], dimensionAttributes: [attributes] }] };
    const inspected = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 0, solution: null, resourceInspection: inspection }));
    assert.deepEqual(inspected.resourceInspection, inspection);
    inspected.resourceInspection.resources[0].dimensionAttributes[0].startDomain[0] = 0n;
    assert.equal(inspection.resources[0].dimensionAttributes[0].startDomain[0], exact);
    resourceModel.addResourceGroup();
    const resourceVariable = resourceModel.resourceVar(0, 1);
    assert.throws(() => { resourceVariable.resourceGroup = 0; }, TypeError);
    const reference = { kind: RoutingVariableKind.ROUTING_VARIABLE_RESOURCE, dimensionName: '', index: 0, resourceGroup: 1 };
    const variableOperations = [
      { type: 'modifyDomain', variable: reference, action: RoutingDomainAction.ROUTING_DOMAIN_VALUES, lower: 0n, upper: 0n, values: [0n, 2n] },
      { type: 'addFinalizer', variableKind: reference.kind, dimensionName: '', index: 0, resourceGroup: 1,
        kind: RoutingFinalizerKind.ROUTING_FINALIZER_TARGET, target: 2n },
    ];
    const variableWire = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ ...wire, request: { ...wire.request, operations: variableOperations } }));
    assert.deepEqual(variableWire.request.operations, variableOperations);
    const resourceResult = { status: 1, objectiveValue: 0n, nextValues: [1, 2, 2], starts: [0], ends: [2], dimensionCumulValues: {},
      resourceAssignments: [{ mins: [0n], maxs: [0n] }] };
    const resourceDecoded = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 1, solution: resourceResult }));
    const resourceAssignment = new Assignment(resourceModel, resourceDecoded.solution);
    resourceDecoded.solution.resourceAssignments[0].mins[0] = -1n;
    assert.equal(resourceAssignment.resourceIndex(0, resourceGroup), 0);
    assert.equal(resourceAssignment.value(resourceModel.resourceVar(0, 0)), 0);
    assert.equal(resourceAssignment.min(resourceModel.resourceVar(0, 0)), 0);
    assert.equal(resourceAssignment.max(resourceModel.resourceVar(0, 0)), 0);
    assert.throws(() => resourceAssignment.value(resourceVariable), /no captured native bounds/);
    assert.throws(() => resourceAssignment.resourceIndex(1, resourceGroup));

    const atomic = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    const evaluator = atomic.registerTransitCallback(() => 1);
    for (const [name, create] of [
      ['plain', (capacity: number) => atomic.addDimension(evaluator, 0, capacity, true, 'plain')],
      ['capacity', (capacity: number) => atomic.addDimensionWithVehicleCapacity(evaluator, 0, [capacity], true, 'capacity')],
      ['transits', (capacity: number) => atomic.addDimensionWithVehicleTransits([evaluator], 0, capacity, true, 'transits')],
    ] as const) {
      assert.throws(() => create(NaN));
      assert.throws(() => atomic.getDimensionOrDie(name), /unknown dimension/);
      assert.equal(create(10), true);
    }
    const immutableVehicle = atomic.vehicleVar(1);
    const immutableCumul = atomic.getDimensionOrDie('plain').cumulVar(1);
    assert.throws(() => { immutableVehicle.index = 2; }, TypeError);
    assert.throws(() => { immutableCumul.dimensionName = 'capacity'; }, TypeError);
    assert.throws(() => atomic.getDimensionOrDie('plain').cumulVar(99));
    const foreign = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    foreign.addConstantDimension(1, 10, true, 'plain');
    assert.throws(() => atomic.addConstraints(immutableCumul.le(foreign.getDimensionOrDie('plain').cumulVar(1))), /different Routing model/);
    assert.throws(() => atomic.addConstraints(immutableVehicle.eq({ ...immutableVehicle, index: 99 })));
    assert.throws(() => atomic.addConstraints(immutableCumul.le({ ...immutableCumul, index: NaN })));
    for (const index of [-1, 3, 100]) {
      assert.throws(() => atomic.addDisjunction([index], 10));
      assert.throws(() => atomic.addPickupAndDelivery(1, index));
    }
    assert.throws(() => atomic.addDisjunction([], 10));
    const nativeInspection = new RoutingModel(new RoutingIndexManager(2, 1, 0));
    const pairModel = new RoutingModel(new RoutingIndexManager(7, 1, 0));
    pairModel.addConstantDimension(1, exact, true, 'time');
    const pickupSet = pairModel.addDisjunction([1, 2]), deliverySet = pairModel.addDisjunction([3, 4]);
    assert.equal(pairModel.addPickupAndDeliverySets(pickupSet, deliverySet), 0);
    assert.equal(pairModel.addPickupAndDelivery(5, 6), 1);
    const pairTime = pairModel.getDimensionOrDie('time');
    assert.equal(pairTime.hasPickupToDeliveryLimits(), false);
    pairTime.setPickupToDeliveryLimitFunctionForPair((pickup: number, delivery: number) => exact + BigInt(10 * pickup + delivery), 0);
    pairTime.setPickupToDeliveryLimitFunctionForPair(() => exact, 1);
    await pairModel.solve({ executor: 'direct' });
    const limitOperations = (globalThis as Record<string, any>).__routingInspection.request.operations.filter((op: any) => op.type === 'setPickupToDeliveryLimits');
    assert.deepEqual(limitOperations, [
      { type: 'setPickupToDeliveryLimits', dimensionName: 'time', pairIndex: 0, limits: [exact, exact + 1n, exact + 10n, exact + 11n] },
      { type: 'setPickupToDeliveryLimits', dimensionName: 'time', pairIndex: 1, limits: [exact] },
    ]);
    assert.equal(pairTime.hasPickupToDeliveryLimits(), true);
    assert.throws(() => pairTime.setPickupToDeliveryLimitFunctionForPair(() => 1, 2));
    nativeInspection.setArcCostEvaluatorOfAllVehicles(nativeInspection.registerTransitCallback(() => 5));
    assert.equal(await nativeInspection.getArcCostForVehicle(0, 1, 0, {executor:'direct'}), 777n);
    assert.deepEqual(((globalThis as Record<string, unknown>).__routingInspection as {request:{arcCostQueries:unknown}}).request.arcCostQueries, [{fromIndex:0n,toIndex:1n,vehicle:0}]);
    nativeInspection.addConstantDimension(1, 10, true, 'time');
    assert.equal(await nativeInspection.getDimensionOrDie('time').getCumulVarSoftUpperBound(1, {executor:'direct'}), 999n);
    const mutableManager = new RoutingIndexManager(3, 1, 0);
    mutableManager.starts[0] = 1;
    mutableManager.ends[0] = 2;
    assert.deepEqual(mutableManager.starts, [0]);
    assert.deepEqual(mutableManager.ends, [0]);
    const routing = new RoutingModel(new RoutingIndexManager(4, 1, 0));
    routing.addConstantDimension(1, 10, true, 'distance');
    assert.equal(routing.addDisjunction([1], 10), 0);
    routing.addConstantDimension(1, 10, true, 'time');
    assert.equal(routing.addDisjunction([2], 10), 1);
    const nativeAnswer = { status: 1, objectiveValue: 3n, nextValues: [1, 2, 3, 4, 4], vehicleValues: [0, 0, -1, 0, 0],
      starts: [0], ends: [4], dimensionCumulValues: { distance: [0n, 1n, 2n, 3n, 4n] },
      dimensionCumulMins: { distance: [0n, 1n, 2n, 3n, 4n] },
      dimensionCumulMaxs: { distance: [0n, 6n, 7n, 8n, 9n] } };
    const roundtrip = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 1, solution: nativeAnswer }));
    assert.deepEqual(roundtrip.solution, nativeAnswer);
    const assignment = new Assignment(routing, roundtrip.solution);
    routing.setFirstSolutionHint(assignment);
    const locks = [[2, 1]];
    const pendingLocks = routing.applyLocksToAllVehicles(locks, false, { executor: 'direct' });
    locks[0].length = 0;
    assert.equal(await pendingLocks, true);
    const reuse = (globalThis as Record<string, any>).__routingInspection.request;
    assert.deepEqual(reuse.routeLocks.routes, [[2, 1]]);
    assert.equal(reuse.firstSolutionHint.variables.find((v: any) => v.variable.kind === RoutingVariableKind.ROUTING_VARIABLE_CUMUL && v.variable.index === 1).max, 6n);
    const preassignment = await routing.inspectPreAssignment({ executor: 'direct' });
    preassignment.nextValues.clear();
    assert.equal((await routing.inspectPreAssignment({ executor: 'direct' })).nextValues.get(0), 1);
    assert.throws(() => new RoutingModel(new RoutingIndexManager(4, 1, 0)).setFirstSolutionHint(assignment), /another model/);
    routing.setFirstSolutionHint(null);
    await routing.inspectPreAssignment({ executor: 'direct' });
    assert.equal((globalThis as Record<string, any>).__routingInspection.request.firstSolutionHint, undefined);
    assert.equal(assignment.value(routing.vehicleVar(2)), -1);
    assert.equal(assignment.min(routing.vehicleVar(2)), -1);
    assert.equal(assignment.max(routing.vehicleVar(2)), -1);
    nativeAnswer.vehicleValues[2] = 1;
    assert.equal(assignment.value(routing.vehicleVar(2)), -1);
    assert.throws(() => assignment.value(new RoutingModel(new RoutingIndexManager(4, 1, 0)).vehicleVar(1)), /different Routing model/);
    const activeAssignment = new Assignment(routing, { ...roundtrip.solution, nextValues: [1, 2, 2, 4, 4] });
    assert.equal(activeAssignment.value(routing.activeVar(2)), 0);
    assert.equal(activeAssignment.min(routing.activeVar(2)), 0);
    assert.equal(activeAssignment.max(routing.activeVar(2)), 0);
    assert.equal(activeAssignment.value(routing.activeVar(1)), 1);
    assert.throws(() => activeAssignment.value(new RoutingModel(new RoutingIndexManager(4, 1, 0)).activeVar(1)), /different Routing model/);
    assert.throws(() => activeAssignment.value({ ...routing.activeVar(1), index: 99 }), /no active value/);
    assert.throws(() => activeAssignment.value({ kind: 'routingSlackVar', model: routing, index: 1, dimensionName: 'distance' }), /no captured native bounds/);
    const oldAssignment = new Assignment(routing, { ...roundtrip.solution, vehicleValues: undefined });
    assert.throws(() => oldAssignment.value(routing.vehicleVar(2)), /no vehicle value/);
    const cumul = routing.getDimensionOrDie('distance').cumulVar(1);
    assert.equal(assignment.min(cumul), 1n);
    assert.equal(assignment.max(cumul), 6n);
    nativeAnswer.dimensionCumulMaxs.distance[1] = 99n;
    assert.equal(assignment.max(cumul), 6n);
    assert.throws(() => assignment.max({ ...cumul, index: 99 }), /no maximum/);
    const legacy = routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 1,
      solution: { ...nativeAnswer, dimensionCumulMins: undefined, dimensionCumulMaxs: undefined } }));
    const legacyAssignment = new Assignment(routing, legacy.solution);
    assert.equal(legacyAssignment.min(cumul), 1n);
    assert.throws(() => legacyAssignment.max(cumul), /no maximum/);
    assert.throws(() => assignment.min({ ...cumul, model: new RoutingModel(new RoutingIndexManager(4, 1, 0)) }), /different Routing model/);
    for (const constraint of [undefined, null, {}, { type: 'unknown' }]) {
      assert.throws(() => routing.addConstraints(constraint), /unsupported constraint/i);
    }
    const manager = new RoutingIndexManager(3, 2, 0);
    const costs = new RoutingModel(manager);
    const common = costs.registerTransitCallback(() => 10n);
    let samples = 0;
    const cheap = costs.registerTransitCallback((from: number, to: number) => { ++samples; return BigInt(from + to + 1); });
    costs.setArcCostEvaluatorOfAllVehicles(common);
    costs.setArcCostEvaluatorOfVehicle(cheap, 1);
    await assert.rejects(costs.getArcCostForVehicle(1, 2, 2), /vehicle/i);
    assert.throws(() => costs.setArcCostEvaluatorOfVehicle(cheap, -1), /vehicle/i);
    assert.throws(() => costs.setArcCostEvaluatorOfVehicle(99, 0), /evaluator/i);
    await assert.rejects(costs.getArcCostForVehicle(99, 1, 0), /index/i);
    costs.setArcCostEvaluatorOfVehicle(cheap, 0);
    await costs.getArcCostForVehicle(1, 2, 0);
    const submitted = (globalThis as Record<string, unknown>).__routingInspection as import('../lib/routing/protocol.js').RoutingOperation;
    const groups = submitted.request.operations.filter(operation => operation.type === 'setArcCostEvaluatorOfVehicles');
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].vehicles, [1, 0]);
    assert.equal(samples, manager.getNumberOfIndices() ** 2);
    const decodedCosts = routingProtocol.decodeRequest(routingProtocol.encodeRequest(submitted));
    assert.deepEqual(decodedCosts.request.operations, submitted.request.operations, 'Grouped evaluator survives the worker/server bridge');
    costs.setArcCostEvaluatorOfAllVehicles(common);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('routing solve options are combined and assignments keep their own values', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-result-', import.meta.url)));
  const responses: unknown[] = [];
  const operations: unknown[] = [];
  (globalThis as Record<string, unknown>).__routingResultTest = { responses, operations };
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/routing/api.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'routing-answer', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectRoutingExecutor {
            execute(operation) {
              const test = globalThis.__routingResultTest;
              test.operations.push(operation);
              return { result: Promise.resolve(test.responses.shift()) };
            }
          }
        ` }));
      } }],
    });
    const { RoutingModel, RoutingIndexManager, FirstSolutionStrategy } = await import(outfile);
    const routing = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    assert.equal('getAutomaticFirstSolutionStrategy' in routing, false);
    routing.setArcCostEvaluatorOfAllVehicles(routing.registerTransitCallback(() => 1));
    const answer = (objectiveValue: bigint, nextValue: number) => ({
      status: 1, objectiveValue, nextValues: [nextValue, 2, 3, 3],
      dimensionCumulValues: {}, starts: [0], ends: [3],
    });
    responses.push(
      { type: 'solve', status: 1, solution: answer(3n, 1), automaticFirstSolutionStrategy: 4 },
      { type: 'solve', status: 1, solution: answer(9n, 2), automaticFirstSolutionStrategy: 3 },
      { type: 'solve', status: 3, solution: null, localSearchProfile: '', automaticFirstSolutionStrategy: 8 },
    );
    const active = routing.solve({ executor: 'direct', firstSolutionStrategy: FirstSolutionStrategy.PATH_CHEAPEST_ARC });
    routing.addConstantDimension(1, 10, true, 'added-after-submission');
    assert.deepEqual((operations[0] as { request: { operations: unknown[] } }).request.operations, []);
    const firstResult = await active;
    assert.equal(firstResult.automaticFirstSolutionStrategy, FirstSolutionStrategy.PATH_MOST_CONSTRAINED_ARC);
    const secondResult = await routing.solve({ executor: 'direct' });
    assert.equal(secondResult.automaticFirstSolutionStrategy, FirstSolutionStrategy.PATH_CHEAPEST_ARC);
    assert.equal((operations[1] as { request: { operations: unknown[] } }).request.operations.length, 1);
    const first = firstResult.assignment;
    const second = secondResult.assignment;
    assert.ok((operations[0] as { request: { searchParametersProto: Uint8Array } }).request.searchParametersProto.length > 0);
    assert.equal('firstSolutionStrategy' in (operations[0] as { request: object }).request, false);
    assert.equal(firstResult.status, 1);
    assert.equal(firstResult.hasSolution, true);
    assert.equal(secondResult.status, 1);
    assert(first);
    assert(second);
    assert.equal(first.objectiveValue(), 3n);
    assert.equal(first.value(0), 1);
    assert.equal(second.objectiveValue(), 9n);
    assert.equal(second.value(0), 2);
    assert.throws(() => first.value(99), /no value/);
    const failed = await routing.solve({ executor: 'direct' });
    assert.equal(failed.status, 3);
    assert.equal(failed.hasSolution, false);
    assert.equal(failed.assignment, null);
    assert.equal(failed.automaticFirstSolutionStrategy, FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION);
    assert.equal(failed.localSearchProfile, '');
    assert.equal(firstResult.automaticFirstSolutionStrategy, FirstSolutionStrategy.PATH_MOST_CONSTRAINED_ARC);
    assert.equal(firstResult.status, 1);
    assert.equal(first.objectiveValue(), 3n);
    responses.push({ type: 'solve', status: 1, solution: answer(17n, 1) });
    const routes = [[1, 2]];
    const reading = routing.readAssignmentFromRoutes(routes, false, { executor: 'direct' });
    routes[0].push(0);
    const restored = await reading;
    assert(restored);
    assert.equal(restored.objectiveValue(), 17n);
    const readRequest = (operations[3] as { request: { readAssignmentOnly: boolean; initialAssignment: { routes: number[][] } } }).request;
    assert.equal(readRequest.readAssignmentOnly, true);
    assert.deepEqual(readRequest.initialAssignment.routes, [[1, 2]]);
    responses.push({ type: 'solve', status: 3, solution: null });
    assert.equal(await routing.readAssignmentFromRoutes([[1, 2]], false, { executor: 'direct' }), null);
    assert.equal(routing.status(), 3);
    assert.equal(restored.automaticFirstSolutionStrategy, null);
    const bounds = routing.getDimensionOrDie('added-after-submission');
    const variable = bounds.cumulVar(1);
    assert.deepEqual(Object.keys(variable), ['kind', 'model', 'dimensionName', 'index']);
    const exact = 9_007_199_254_741_003n;
    variable.setMin(exact);
    bounds.cumulVar(1).setMax(exact + 2n);
    variable.setRange(-10, 10n);
    for (const invalid of [() => variable.setRange(2, 1), () => variable.setMin(NaN),
      () => variable.setMax(1n << 63n), () => variable.setMin(Number.MAX_SAFE_INTEGER + 1),
      () => bounds.cumulVar(99).setRange(0, 1)]) assert.throws(invalid);
    responses.push({ type: 'solve', status: 3, solution: null });
    await routing.solve({ executor: 'direct' });
    const recorded = (operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations;
    assert.deepEqual(recorded.slice(1), [
      { type: 'setCumulBounds', dimensionName: 'added-after-submission', index: 1, lower: exact, upper: (1n << 63n) - 1n },
      { type: 'setCumulBounds', dimensionName: 'added-after-submission', index: 1, lower: -(1n << 63n), upper: exact + 2n },
      { type: 'setCumulBounds', dimensionName: 'added-after-submission', index: 1, lower: -10n, upper: 10n },
    ]);
    const allowedVehicles = [0, 0];
    routing.setAllowedVehiclesForIndex(allowedVehicles, 1);
    allowedVehicles.push(99);
    routing.setAllowedVehiclesForIndex([], 2);
    for (const invalid of [() => routing.setAllowedVehiclesForIndex([-1], 1),
      () => routing.setAllowedVehiclesForIndex([0, 1], 1), () => routing.setAllowedVehiclesForIndex([NaN], 1),
      () => routing.setAllowedVehiclesForIndex(new Array(1), 1), () => routing.setAllowedVehiclesForIndex([], 4)]) {
      assert.throws(invalid);
    }
    responses.push({ type: 'solve', status: 3, solution: null });
    await routing.solve({ executor: 'direct' });
    const eligibilityOperations = (operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations;
    assert.deepEqual(eligibilityOperations.slice(4), [
      { type: 'setAllowedVehiclesForIndex', vehicles: [0, 0], index: 1 },
      { type: 'setAllowedVehiclesForIndex', vehicles: [], index: 2 },
    ]);
    const vehicle = routing.vehicleVar(1);
    assert.deepEqual(Object.keys(vehicle), ['kind', 'model', 'index']);
    const domainValues = [0, -1, 0];
    vehicle.setValues(domainValues);
    domainValues.push(99);
    routing.vehicleVar(1).setValue(0);
    vehicle.setValues([]);
    for (const invalid of [() => vehicle.setValue(-2), () => vehicle.setValue(1),
      () => vehicle.setValue(NaN), () => vehicle.setValue(0.5),
      () => vehicle.setValues([0, 1]), () => vehicle.setValues(new Array(1))]) assert.throws(invalid);
    responses.push({ type: 'solve', status: 3, solution: null });
    await routing.solve({ executor: 'direct' });
    const domainOperations = (operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations;
    assert.deepEqual(domainOperations.slice(6), [
      { type: 'setVehicleValues', index: 1, values: [0, -1, 0] },
      { type: 'setVehicleValues', index: 1, values: [0] },
      { type: 'setVehicleValues', index: 1, values: [] },
    ]);

    const batch = new RoutingModel(new RoutingIndexManager(3, 2, 0));
    batch.addDimension(batch.registerTransitCallback(() => 1), 10, 30, true, 'time');
    const batchTime = batch.getDimensionOrDie('time'), slack = batchTime.slackVar(1), batchActive = batch.activeVar(1);
    assert.deepEqual(Object.keys(slack), ['kind', 'model', 'dimensionName', 'index']);
    assert.deepEqual(Object.keys(batchActive), ['kind', 'model', 'index']);
    assert.throws(() => { slack.index = 2; }, TypeError);
    assert.throws(() => { batchActive.index = 2; }, TypeError);
    slack.setMin(exact);
    batchTime.slackVar(1).setMax(exact + 1n);
    slack.setRange(-exact, exact);
    batchTime.setCumulVarRange(2, 3, 4);
    const flags = [1, 0, 1];
    batchActive.setValues(flags);
    flags.push(99);
    batchActive.setValue(0);
    batchActive.setValues([]);
    batchTime.setSpanUpperBoundForVehicle(20, 0);
    batchTime.setSpanCostCoefficientForAllVehicles(2);
    batchTime.setSlackCostCoefficientForAllVehicles(3);
    batchTime.setGlobalSpanCostCoefficient(exact);
    for (const invalid of [() => batchTime.slackVar(batch.end(0)), () => batch.activeVar(batch.end(0)),
      () => slack.setRange(2, 1), () => slack.setMin(NaN), () => slack.setMax(1n << 63n),
      () => batchActive.setValue(-1), () => batchActive.setValues([0, 2]), () => batchActive.setValues(new Array(1)),
      () => batchTime.setSpanUpperBoundForVehicle(-1, 0), () => batchTime.setSpanCostCoefficientForVehicle(2, undefined),
      () => batchTime.setSlackCostCoefficientForVehicle(2, 2), () => batchTime.setSlackCostCoefficientForAllVehicles(-1),
      () => batchTime.setGlobalSpanCostCoefficient(Number.MAX_SAFE_INTEGER + 1)]) assert.throws(invalid);
    responses.push({ type: 'solve', status: 3, solution: null });
    await batch.solve({ executor: 'direct' });
    const batchOperations = (operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations;
    assert.deepEqual(batchOperations.slice(1), [
      { type: 'setSlackBounds', dimensionName: 'time', index: 1, lower: exact, upper: (1n << 63n) - 1n },
      { type: 'setSlackBounds', dimensionName: 'time', index: 1, lower: -(1n << 63n), upper: exact + 1n },
      { type: 'setSlackBounds', dimensionName: 'time', index: 1, lower: -exact, upper: exact },
      { type: 'setCumulBounds', dimensionName: 'time', index: 2, lower: 3n, upper: 4n },
      { type: 'setActiveValues', index: 1, values: [1, 0, 1] },
      { type: 'setActiveValues', index: 1, values: [0] },
      { type: 'setActiveValues', index: 1, values: [] },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanUpperBound', value: 20n, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanCost', value: 2n, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanCost', value: 2n, vehicle: 1 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'slackCost', value: 3n, vehicle: 0 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'slackCost', value: 3n, vehicle: 1 },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'globalSpanCost', value: exact, vehicle: undefined },
    ]);

    const softModel = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    softModel.addDimension(softModel.registerTransitCallback(() => 1), 10, 20, true, 'time');
    const soft = softModel.getDimensionOrDie('time');
    soft.setCumulVarRange(1, 3, 9);
    soft.setCumulVarSoftUpperBound(1, -exact, exact);
    soft.setCumulVarSoftLowerBound(softModel.end(0), exact, 0);
    soft.setSpanCostCoefficientForVehicle(exact, 0);
    assert.equal(soft.getCumulVarSoftUpperBoundCoefficient(1), exact);
    assert.equal(soft.getCumulVarSoftLowerBoundCoefficient(softModel.end(0)), 0n);
    assert.equal(soft.hasCumulVarSoftLowerBound(softModel.end(0)), true);
    assert.equal(soft.getSpanCostCoefficientForVehicle(0), exact);
    for (const invalid of [() => soft.setCumulVarSoftUpperBound(1, 5, -1),
      () => soft.setCumulVarSoftLowerBound(4, 5, 1), () => soft.setCumulVarSoftUpperBound(1, NaN, 2),
      () => soft.setSoftSpanUpperBoundForVehicle({ bound: 1n, cost: -1n }, 0),
      () => soft.setQuadraticCostSoftSpanUpperBoundForVehicle({ bound: 1n, cost: 1n }, 1)]) assert.throws(invalid);
    assert.equal(soft.getCumulVarSoftUpperBoundCoefficient(1), exact);
    assert.equal(soft.hasSoftSpanUpperBounds(), false);
    assert.equal(soft.hasQuadraticCostSoftSpanUpperBounds(), false);
    responses.push({ type: 'solve', status: 3, solution: null });
    await softModel.solve({ executor: 'direct' });
    assert.deepEqual((operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations.slice(2), [
      { type: 'setCumulSoftBound', dimensionName: 'time', index: 1, bound: -exact, coefficient: exact, lower: false },
      { type: 'setCumulSoftBound', dimensionName: 'time', index: 3, bound: exact, coefficient: 0n, lower: true },
      { type: 'setDimensionValue', dimensionName: 'time', setting: 'spanCost', value: exact, vehicle: 0 },
    ]);

    const partial = new RoutingModel(new RoutingIndexManager(3, 2, 0));
    partial.addConstantDimension(1, 10, true, 'time');
    const partialTime = partial.getDimensionOrDie('time');
    assert.throws(() => partialTime.getSoftSpanUpperBoundForVehicle(0), /No soft span/);
    assert.throws(() => partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(0), /No quadratic soft span/);
    assert.throws(() => partialTime.getSoftSpanUpperBoundForVehicle(2), RangeError);
    partialTime.setSoftSpanUpperBoundForVehicle({ bound: 0n, cost: 0n }, 0);
    assert.equal(partialTime.hasSoftSpanUpperBounds(), true);
    assert.equal(partialTime.getSoftSpanUpperBoundForVehicle(0).bound, 0n);
    assert.equal(partialTime.getSoftSpanUpperBoundForVehicle(0).cost, 0n);
    assert.equal(partialTime.hasQuadraticCostSoftSpanUpperBounds(), false);
    assert.throws(() => partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(1), /No quadratic soft span/);
    const defaultSpan = partialTime.getSoftSpanUpperBoundForVehicle(1);
    assert.equal(defaultSpan.bound, (1n << 63n) - 1n);
    assert.equal(defaultSpan.cost, 0n);
    partialTime.setQuadraticCostSoftSpanUpperBoundForVehicle({ bound: exact, cost: exact }, 1);
    assert.equal(partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(1).bound, exact);
    assert.equal(partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(1).cost, exact);
    const defaultQuadratic = partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(0);
    assert.equal(defaultQuadratic.bound, (1n << 63n) - 1n);
    assert.equal(defaultQuadratic.cost, 0n);
    Reflect.set(defaultQuadratic, 'bound', 0n);
    assert.equal(partialTime.getQuadraticCostSoftSpanUpperBoundForVehicle(0).bound, (1n << 63n) - 1n);
    partialTime.setSoftSpanUpperBoundForVehicle({ bound: 2n, cost: 3n }, 1);
    assert.equal(defaultSpan.bound, (1n << 63n) - 1n);
    const fleet = new RoutingModel(new RoutingIndexManager(3, 2, 0));
    assert.equal(fleet.getMaximumNumberOfActiveVehicles(), 2);
    assert.equal(fleet.getFixedCostOfVehicle(0), 0n);
    assert.equal(fleet.isVehicleUsedWhenEmpty(1), false);
    fleet.setMaximumNumberOfActiveVehicles(0); fleet.setMaximumNumberOfActiveVehicles(4);
    fleet.setFixedCostOfAllVehicles(exact); fleet.setFixedCostOfVehicle(3, 1);
    fleet.setAmortizedCostFactorsOfAllVehicles(4, 2); fleet.setAmortizedCostFactorsOfVehicle(8, 1, 1);
    fleet.setVehicleUsedWhenEmpty(true, 1); fleet.setVehicleUsedWhenEmpty(false, 1);
    const fleetLinear = fleet.getAmortizedLinearCostFactorOfVehicles(); fleetLinear[0] = 99n;
    assert.deepEqual(fleet.getAmortizedLinearCostFactorOfVehicles(), [4n, 8n]);
    assert.deepEqual(fleet.getAmortizedQuadraticCostFactorOfVehicles(), [2n, 1n]);
    for (const invalid of [() => fleet.setMaximumNumberOfActiveVehicles(-1), () => fleet.setMaximumNumberOfActiveVehicles(2 ** 31),
      () => fleet.setFixedCostOfAllVehicles(-1), () => fleet.setFixedCostOfVehicle(1, 2),
      () => fleet.setAmortizedCostFactorsOfAllVehicles(1, -1), () => fleet.setAmortizedCostFactorsOfAllVehicles((1n << 63n) - 1n, 1n),
      () => fleet.setVehicleUsedWhenEmpty(1, 0), () => fleet.isVehicleUsedWhenEmpty(-1), () => fleet.getFixedCostOfVehicle(2)]) assert.throws(invalid);
    assert.equal(fleet.getMaximumNumberOfActiveVehicles(), 4);
    assert.equal(fleet.getFixedCostOfVehicle(0), exact);
    assert.deepEqual(fleet.getAmortizedLinearCostFactorOfVehicles(), [4n, 8n]);
    responses.push({ type: 'solve', status: 3, solution: null }); await fleet.solve({ executor: 'direct' });
    assert.deepEqual((operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations, [
      { type: 'setMaximumActiveVehicles', maximum: 0 }, { type: 'setMaximumActiveVehicles', maximum: 4 },
      { type: 'setFixedVehicleCost', cost: exact, vehicle: 0 }, { type: 'setFixedVehicleCost', cost: exact, vehicle: 1 },
      { type: 'setFixedVehicleCost', cost: 3n, vehicle: 1 },
      { type: 'setAmortizedVehicleCosts', linear: 4n, quadratic: 2n, vehicle: 0 },
      { type: 'setAmortizedVehicleCosts', linear: 4n, quadratic: 2n, vehicle: 1 },
      { type: 'setAmortizedVehicleCosts', linear: 8n, quadratic: 1n, vehicle: 1 },
      { type: 'setVehicleUsedWhenEmpty', isUsed: true, vehicle: 1 }, { type: 'setVehicleUsedWhenEmpty', isUsed: false, vehicle: 1 },
    ]);

    const grouped = new RoutingModel(new RoutingIndexManager(3, 2, 0));
    const groupIndices = [2, 1, 2]; grouped.addSoftSameVehicleConstraint(groupIndices, exact); groupIndices[0] = 99;
    grouped.addSoftSameVehicleConstraint([], 3);
    assert.equal(grouped.getNumberOfSoftSameVehicleConstraints(), 1);
    assert.equal(grouped.getSoftSameVehicleCost(0), exact);
    assert.deepEqual(grouped.getSoftSameVehicleIndices(0), [2, 1, 2]);
    grouped.getSoftSameVehicleIndices(0).push(99);
    assert.deepEqual(grouped.getSoftSameVehicleIndices(0), [2, 1, 2]);
    assert.equal(grouped.getPickupAndDeliveryPolicyOfVehicle(0), 0);
    grouped.setPickupAndDeliveryPolicyOfAllVehicles(2); grouped.setPickupAndDeliveryPolicyOfVehicle(1, 0);
    assert.equal(grouped.getPickupAndDeliveryPolicyOfVehicle(0), 1);
    assert.equal(grouped.getPickupAndDeliveryPolicyOfVehicle(1), 2);
    assert.equal(grouped.addDisjunction([1, 2], undefined, 2, 1), 0);
    for (const invalid of [() => grouped.addSoftSameVehicleConstraint([1], -1), () => grouped.addSoftSameVehicleConstraint([1, 6], 1),
      () => grouped.getSoftSameVehicleCost(1), () => grouped.setPickupAndDeliveryPolicyOfAllVehicles(3),
      () => grouped.setPickupAndDeliveryPolicyOfVehicle(0, 2), () => grouped.addDisjunction([1], 1, 0),
      () => grouped.addDisjunction([1], 1, 1, 2), () => grouped.addDisjunction([0], 1)]) assert.throws(invalid);
    assert.equal(grouped.getNumberOfSoftSameVehicleConstraints(), 1);
    assert.equal(grouped.getPickupAndDeliveryPolicyOfVehicle(0), 1);
    assert.equal(grouped.addDisjunction([2], 3), 1);
    responses.push({ type: 'solve', status: 3, solution: null }); await grouped.solve({ executor: 'direct' });
    assert.deepEqual((operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations, [
      { type: 'addSoftSameVehicleConstraint', indices: [2, 1, 2], cost: exact },
      { type: 'setPickupDeliveryPolicy', policy: 2, vehicle: 0 }, { type: 'setPickupDeliveryPolicy', policy: 2, vehicle: 1 },
      { type: 'setPickupDeliveryPolicy', policy: 1, vehicle: 0 },
      { type: 'addDisjunction', indices: [1, 2], penalty: undefined, maxCardinality: 2n, penaltyCostBehavior: 1 },
      { type: 'addDisjunction', indices: [2], penalty: 3n },
    ]);

    const successors = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    assert.equal(successors.nextVar(1), 1);
    const nextValues = [2, successors.end(0), 2];
    successors.setNextValues(1, nextValues);
    nextValues[0] = 99;
    successors.setNextValue(1, 2);
    successors.setNextValues(1, []);
    for (const invalid of [() => successors.setNextValues(successors.end(0), [1]),
      () => successors.setNextValue(-1, 1), () => successors.setNextValue(1, 4),
      () => successors.setNextValue(1, -1), () => successors.setNextValues(1, [2, NaN]),
      () => successors.setNextValues(1, new Array(1))]) assert.throws(invalid);
    responses.push({ type: 'solve', status: 3, solution: null });
    await successors.solve({ executor: 'direct' });
    assert.deepEqual((operations[operations.length - 1] as { request: { operations: unknown[] } }).request.operations, [
      { type: 'setNextValues', index: 1, values: [2, 3, 2] },
      { type: 'setNextValues', index: 1, values: [2] },
      { type: 'setNextValues', index: 1, values: [] },
    ]);

    const snapshots = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    const matrix = [[0, 7, 8], [7, 0, 9], [8, 9, 0]];
    const matrixEvaluator = snapshots.registerTransitMatrix(matrix);
    const vector = [0, 4, 5];
    const vectorEvaluator = snapshots.registerUnaryTransitVector(vector);
    matrix[1][2] = 100;
    vector[1] = 100;
    snapshots.setArcCostEvaluatorOfAllVehicles(matrixEvaluator);
    snapshots.addDimension(vectorEvaluator, 0, 100, true, 'snapshot');
    const indices = [1];
    snapshots.addDisjunction(indices, 10);
    indices[0] = 2;
    const equality = snapshots.vehicleVar(1).eq(snapshots.vehicleVar(2));
    assert.throws(() => snapshots.addConstraints(equality, {}), /unsupported constraint/);
    responses.push({ type: 'solve', status: 3, solution: null });
    await snapshots.solve({ executor: 'direct' });
    const captured = (operations[operations.length - 1] as { request: { operations: { type: string; transitMatrix?: BigInt64Array }[] } }).request.operations;
    assert.equal(captured.length, 2, 'Rejected constraint batches must record nothing');
    assert.deepEqual(captured[1], { type: 'addDisjunction', indices: [1], penalty: 10n });
    assert.equal(captured[0].transitMatrix?.[6], 4n);

  } finally {
    delete (globalThis as Record<string, unknown>).__routingResultTest;
    await rm(directory, { recursive: true, force: true });
  }
});
