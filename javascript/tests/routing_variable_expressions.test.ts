import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { RoutingOperation, RoutingModelOperation } from '../lib/routing/protocol.ts';

test('routing domains and expressions preserve ownership, exact wire fields and solve snapshots', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-expressions-', import.meta.url)));
  const requests: RoutingOperation[] = [];
  (globalThis as Record<string, unknown>).__routingDomainRequests = requests;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { contents: `export * from './routing/api.ts'; export * from './routing/expressions.ts'; export {routingProtocol} from './routing/protocol.ts';`,
      resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'native-domain-stub', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectRoutingExecutor {
          execute(operation) { globalThis.__routingDomainRequests.push(operation);
            const domain = operation.request.domainQueries?.length;
            return { result: Promise.resolve(domain ? {type:'solve', status:0, solution:null,
              domainResults:[{min:0n,max:10n,size:11n,bound:false,contains:false}]} : {type:'solve', status:1,
              automaticFirstSolutionStrategy:3, localSearchProfile:'native profile', solution:{status:1,objectiveValue:4n,
                nextValues:[1,2,2],starts:[0],ends:[2],dimensionCumulValues:{time:[0n,1n,2n]}}}) }; }
        }` }));
      } }] });
    const {RoutingModel, RoutingIndexManager, RoutingLinearExpr, RoutingBoolExpr, Assignment, routingProtocol} = await import(outfile);
    const model = new RoutingModel(new RoutingIndexManager(2, 1, 0));
    model.addConstantDimensionWithSlack(1, 10, 5, true, 'time');
    const time = model.getDimensionOrDie('time'), variable = time.cumulVar(1);
    const foreign = new RoutingModel(new RoutingIndexManager(2, 1, 0)); foreign.addConstantDimension(1, 10, true, 'time');
    const other = foreign.getDimensionOrDie('time').cumulVar(1);
    assert.throws(() => variable.add(other), /different Routing models/);
    assert.throws(() => variable.eq(other), /different Routing models/);
    assert.throws(() => model.addConstraints(other.mul(0).eq(0)), /different Routing model/);
    assert.throws(() => variable.add((1n << 63n) - 1n).add(1), /int64/);
    assert.throws(() => variable.mul((1n << 63n) - 1n).mul(2), /int64/);
    assert.throws(() => variable.setRange(3, 2), /lower bound/);
    assert.throws(() => variable.removeInterval(3, 2), /lower bound/);
    assert.throws(() => variable.removeValue(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
    assert.throws(() => model.setVariableRange(other, 0, 1), /different Routing model/);
    const valid = variable.add(2).eq(5);
    assert.throws(() => model.addConstraints(valid, {}), /unsupported constraint/);
    model.addConstraints(variable.mul(2).add(time.slackVar(0)).sub(1).le(10), RoutingLinearExpr.from(1).lt(2));
    const bool = model.reify(model.activeVar(1).eq(1));
    assert.throws(() => { bool.index = 99; }, TypeError);
    assert.throws(() => model.reify(other.eq(1)), /different Routing model/);
    assert.throws(() => RoutingBoolExpr.or(bool, foreign.activeVar(1)), /different Routing models/);
    assert.throws(() => model.reify(variable.eq(1).onlyEnforceIf(bool)), /unconditional linear comparisons/);
    assert.throws(() => RoutingBoolExpr.and(), /at least one operand/);
    const predicate = RoutingBoolExpr.from(bool).not().or(false);
    assert.ok(Object.isFrozen(predicate) && Object.isFrozen(predicate.node.operands));
    model.addConstraints(variable.eq(1).onlyEnforceIf(predicate), RoutingBoolExpr.or(bool, true));
    const product = model.product(variable, time.slackVar(0));
    const minimum = model.min(product, 3), absolute = model.abs(minimum.sub(1));
    assert.throws(() => { product.index = 99; }, TypeError);
    assert.throws(() => model.max(), /at least one operand/);
    assert.throws(() => model.product(variable, other), /different Routing model/);
    assert.throws(() => model.abs(other), /different Routing model/);
    const nonlinearSnapshot = new Assignment(model, {status:1,objectiveValue:0n,nextValues:[],starts:[],ends:[],dimensionCumulValues:{},
      assignmentVariables:[{variable:{kind:12,dimensionName:'',index:0},min:-10n,max:10n},{variable:{kind:11,dimensionName:'',index:0},min:1n,max:1n}]});
    assert.equal(nonlinearSnapshot.min(product), -10n); assert.equal(nonlinearSnapshot.max(product), 10n);
    assert.throws(() => nonlinearSnapshot.value(product), /not bound/); assert.equal(nonlinearSnapshot.value(bool), 1);
    const booleanSnapshot = new Assignment(model, {status:1,objectiveValue:0n,nextValues:[],starts:[],ends:[],dimensionCumulValues:{},
      assignmentVariables:[{variable:{kind:11,dimensionName:'',index:0},min:0n,max:1n}]});
    assert.equal(booleanSnapshot.min(bool), 0); assert.equal(booleanSnapshot.max(bool), 1);
    assert.throws(() => booleanSnapshot.value(bool), /not bound/);
    const exact = 9_007_199_254_741_003n;
    variable.removeValues([exact, -exact]);
    const assignment = await model.solveWithParameters({}, {executor:'direct'});
    const request = requests[requests.length - 1];
    const decoded: RoutingOperation = routingProtocol.decodeRequest(routingProtocol.encodeRequest(request));
    assert.equal(decoded.request.operations.filter((operation: RoutingModelOperation) => operation.type === 'addLinearConstraint').length, 3);
    assert.deepEqual(decoded.request.operations.filter(operation => operation.type === 'addBooleanVariable' || operation.type === 'addBooleanConstraint' || operation.type === 'addIntegerExpression'),
      request.request.operations.filter(operation => operation.type === 'addBooleanVariable' || operation.type === 'addBooleanConstraint' || operation.type === 'addIntegerExpression'));
    const removal = decoded.request.operations[decoded.request.operations.length - 1];
    assert.equal(removal.type, 'modifyDomain');
    if (removal.type !== 'modifyDomain') throw new Error('Expected a domain removal operation.');
    assert.deepEqual(removal.values, [exact, -exact]);
    assert.equal(await variable.contains(0, {executor:'direct'}), false);
    assert.equal(await variable.size({executor:'direct'}), 11n);
    await assert.rejects(variable.value({executor:'direct'}), /not bound/);
    assert.equal(model.status(), 1);
    assert.equal(assignment.automaticFirstSolutionStrategy, 3);
    assert.equal(assignment.objectiveValue(), 4n);
    assert.equal(assignment.value(variable), 1n);
    assert.equal(model.nextVar(1), 1);
    assert.equal(assignment.value(model.nextVarHandle(1)), 2);
    const queried = routingProtocol.decodeRequest(routingProtocol.encodeRequest(requests[requests.length - 1]));
    assert.equal(queried.request.domainQueries[0].variable.index, 1);
    const result = routingProtocol.decodeResult(routingProtocol.encodeResult({type:'solve',status:0,solution:null,
      domainResults:[{min:0n,max:(1n<<63n)-1n,size:1n<<63n,bound:false,contains:false}]}));
    assert.equal(result.domainResults[0].size, 1n << 63n);
    assert.equal(result.domainResults[0].contains, false);
    const base = variable.ge(exact);
    const guard = time.slackVar(0).le(exact).onlyEnforceIf();
    const conditional = base.onlyEnforceIf(guard).onlyEnforceIf(model.activeVar(1).eq(1));
    assert.equal(base.conditions, undefined);
    assert.equal(conditional.conditions.length, 2);
    assert.ok(Object.isFrozen(conditional.conditions));
    assert.throws(() => base.onlyEnforceIf(other.eq(1)), /different Routing models/);
    assert.throws(() => base.onlyEnforceIf(conditional), /unconditional linear comparisons/);
    assert.throws(() => base.onlyEnforceIf({}), /unconditional linear comparisons/);
    assert.throws(() => model.addConstraints({ ...conditional, conditions: [other.eq(1)] }), /different Routing model/);
    assert.throws(() => model.addConstraints({ ...conditional, conditions: [conditional] }), /unconditional linear comparisons/);
    model.addConstraints(conditional);
    await model.solveWithParameters({}, {executor:'direct'});
    const conditionalRequest = requests[requests.length - 1];
    const conditionalRoundTrip = routingProtocol.decodeRequest(routingProtocol.encodeRequest(conditionalRequest));
    const comparisons = conditionalRoundTrip.request.operations.filter((operation: RoutingModelOperation) => operation.type === 'addLinearConstraint');
    assert.equal(comparisons.length, 4, 'Rejected guards never record partially validated operations');
    assert.deepEqual(comparisons.at(-1), conditionalRequest.request.operations.filter((operation: RoutingModelOperation) => operation.type === 'addLinearConstraint').slice(-1)[0]);
    assert.ok(comparisons.at(-1).conditions);
    assert.equal(comparisons.at(-1).conditions[0].right.offset, exact);

    const nativeSnapshot = {status:1,objectiveValue:4n,nextValues:[1,2,2],starts:[0],ends:[2],
      dimensionCumulValues:{time:[0n,1n,2n]},assignmentVariables:[
        {variable:{kind:2,dimensionName:'time',index:0},min:-exact,max:exact},
        {variable:{kind:6,dimensionName:'time',index:0},min:1n,max:exact},
        {variable:{kind:7,dimensionName:'time',index:0},min:1n,max:1n},
        {variable:{kind:8,dimensionName:'',index:0},min:1n,max:1n},
        {variable:{kind:9,dimensionName:'',index:0},min:1n,max:1n}]};
    const roundTrip = routingProtocol.decodeResult(routingProtocol.encodeResult({type:'solve',status:1,solution:nativeSnapshot}));
    assert.deepEqual(roundTrip.solution.assignmentVariables, nativeSnapshot.assignmentVariables);
    const captured = new Assignment(model, roundTrip.solution);
    const slack = time.slackVar(0), transit = time.transitVar(0), fixed = time.fixedTransitVar(0), active = model.activeVehicleVar(0);
    assert.equal(captured.value(slack), -exact);
    assert.equal(captured.min(slack), -exact);
    assert.equal(captured.max(slack), exact);
    assert.equal(captured.max(transit), exact);
    assert.equal(captured.value(fixed), 1n);
    assert.equal(captured.value(active), 1);
    assert.equal(captured.max(active), 1);
    const considered = model.vehicleRouteConsideredVar(0);
    assert.equal(captured.value(considered), 1);
    assert.equal(captured.min(considered), 1);
    assert.equal(captured.max(considered), 1);
    roundTrip.solution.assignmentVariables[0].max = 0n;
    assert.equal(captured.max(slack), exact);
    for (const read of ['value','min','max']) {
      assert.throws(() => captured[read](foreign.activeVehicleVar(0)), /different Routing model/);
      assert.throws(() => captured[read](foreign.vehicleRouteConsideredVar(0)), /different Routing model/);
      assert.throws(() => assignment[read](slack), /no captured native bounds/);
      assert.throws(() => captured[read](time.slackVar(1)), /no captured native bounds/);
    }

  } finally { delete (globalThis as Record<string, unknown>).__routingDomainRequests; await rm(directory, {recursive:true,force:true}); }
});
