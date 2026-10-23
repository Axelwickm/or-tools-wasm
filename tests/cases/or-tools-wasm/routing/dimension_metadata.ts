import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
async function rejects(action: () => unknown | Promise<unknown>) {
  try { await action(); } catch (error) { assert(error instanceof Error, String(error)); return; }
  throw new Error('Expected invalid Routing inspection to reject');
}

export const routingDimensionMetadataCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.dimension.pair_limits', name: 'Native ride-limit inspection preserves alternatives and unset int64 sentinels', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetPickupToDeliveryLimitForPair', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(7, 2, 0)), options = execution(mode);
    model.addConstantDimension(1, 100, true, 'time');
    const pair = model.addPickupAndDeliverySets(model.addDisjunction([1, 2]), model.addDisjunction([3, 4]));
    const unsetPair = model.addPickupAndDelivery(5, 6), time = model.getDimensionOrDie('time');
    const max = (1n << 63n) - 1n, exact = 9007199254740993n;
    assert(await time.getPickupToDeliveryLimitForPair(pair, 0, 0, options) === max, 'Unconfigured pair retains the native sentinel');
    time.setPickupToDeliveryLimitFunctionForPair((pickup, delivery) => exact + BigInt(10 * pickup + delivery), pair);
    for (let pickup = 0; pickup < 2; ++pickup) for (let delivery = 0; delivery < 2; ++delivery)
      assert(await time.getPickupToDeliveryLimitForPair(pair, pickup, delivery, options) === exact + BigInt(10 * pickup + delivery), 'Alternative positions and exact limits');
    assert(await time.getPickupToDeliveryLimitForPair(unsetPair, 0, 0, options) === max, 'Another pair is still unset');
    assert(await time.getPickupToDeliveryLimitForPair(100, 0, 0, options) === max, 'Native missing-pair behavior remains unset');
    await rejects(() => time.getPickupToDeliveryLimitForPair(pair, 2, 0, options));
    await rejects(() => time.getPickupToDeliveryLimitForPair(pair, 0, 2, options));
    await rejects(() => time.getPickupToDeliveryLimitForPair(-1, 0, 0, options));
    time.setPickupToDeliveryLimitFunctionForPair(() => 7, pair);
    assert(await time.getPickupToDeliveryLimitForPair(pair, 1, 1, options) === 7n, 'Later queries use the current native configuration');
    return {};
  },
}, {
  id: 'routing.dimension.precedence_records', name: 'Native precedence records preserve indices, enums, offsets and snapshot ownership', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetNodePrecedences', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(6, 2, 0)), options = execution(mode);
    model.addConstantDimension(1, (1n << 63n) - 1n, false, 'time');
    const time = model.getDimensionOrDie('time'), first = model.start(1), second = 2, exact = -9007199254740993n;
    assert((await time.getNodePrecedences(options)).length === 0, 'Empty native record list');
    for (const constraint of [api.RoutingPrecedencePerformedConstraint.FIRST_AND_SECOND_INDEPENDENT,
      api.RoutingPrecedencePerformedConstraint.SECOND_IMPLIES_FIRST, api.RoutingPrecedencePerformedConstraint.FIRST_IMPLIES_SECOND,
      api.RoutingPrecedencePerformedConstraint.FIRST_AND_SECOND_EQUAL]) time.addNodePrecedence(first, second, exact, constraint);
    const pending = time.getNodePrecedences(options);
    time.addNodePrecedence(1, 3, 2);
    const records = await pending;
    assert(records.length === 4, 'Query snapshots configuration before awaiting');
    records.forEach((record, i) => assert(record.first === first && record.second === second && record.offset === exact
      && record.performedConstraint === i, 'Insertion order, routing indices, enum and exact offset'));
    records[0].offset = 42n; records.length = 0;
    const next = await time.getNodePrecedences(options);
    assert(next.length === 5 && next[0].offset === exact && next[4].offset === 2n, 'Returned records are independent');
    return {};
  },
}, {
  id: 'routing.dimension.transit_signs', name: 'Native transit-sign queries preserve metadata rather than infer positivity', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetTransitEvaluatorSign', tags: ['native-contract', 'validation'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0)), options = execution(mode);
    model.addConstantDimension(1, 100, false, 'positive');
    model.addConstantDimension(-1, 100, false, 'negative');
    const positive = model.registerTransitCallback(() => 1), negative = model.registerTransitCallback(() => -1);
    model.addDimensionWithVehicleTransits([positive, negative], 0, 100, false, 'unknown');
    for (const [name, sign, isPositive] of [
      ['positive', api.RoutingTransitEvaluatorSign.POSITIVE_OR_ZERO, true],
      ['negative', api.RoutingTransitEvaluatorSign.NEGATIVE_OR_ZERO, false],
      ['unknown', api.RoutingTransitEvaluatorSign.UNKNOWN, false],
    ] as const) {
      const dimension = model.getDimensionOrDie(name);
      for (let vehicle = 0; vehicle < 2; ++vehicle) {
        assert(await dimension.getTransitEvaluatorSign(vehicle, options) === sign, 'Native registered sign');
        assert(await dimension.areVehicleTransitsPositive(vehicle, options) === isPositive, 'Native positive flag');
      }
    }
    const time = model.getDimensionOrDie('positive');
    for (const vehicle of [-1, 2, 0.5]) {
      await rejects(() => time.getTransitEvaluatorSign(vehicle, options));
      await rejects(() => time.areVehicleTransitsPositive(vehicle, options));
    }
    const controller = new AbortController(); controller.abort();
    await rejects(() => time.getNodePrecedences({ ...options, signal: controller.signal }));
    assert(await time.areVehicleTransitsPositive(0, options), 'Executor recovers after invalid and cancelled queries');
    return {};
  },
}];
