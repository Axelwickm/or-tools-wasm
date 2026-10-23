import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function unsupported(action: () => unknown) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && /second.order cone|unsupported|not support/i.test(error.message),
      `Expected native cone capability error, received ${String(error)}`);
    return;
  }
  throw new Error('GSCIP must retain upstream rejection of cone execution');
}

export const mathOptConeCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.cones.representation_and_native_capability',
  name: 'Cone models preserve affine data while native backend support remains unchanged', solver: 'mathopt',
  tags: ['native-contract', 'serialization', 'capabilities'],
  async run({ mathopt: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
    const model = api.MathOpt.Model('cone representation');
    const x = model.addVariable({ lowerBound: 3, upperBound: 3 }), radius = model.addVariable({ lowerBound: 0, upperBound: 10 });
    const inputs = [x, 4], naming = { name: 'ball' };
    const cone = model.addSecondOrderConeConstraint(inputs, radius, naming);
    inputs.length = 0; naming.name = 'changed';
    assert(cone.name === 'ball' && cone.argumentsToNorm().length === 2, 'Cone inputs and options are owned');
    const imported = await api.MathOptModel.fromModelProto(model.encodeModelProto(), execution);
    const restored = imported.getSecondOrderConeConstraint(cone.id)!;
    assert(restored.name === 'ball' && restored.argumentsToNorm().length === 2
      && restored.upperBound.terms.has(imported.getVariable(radius.id)!), 'Cone expressions round-trip with imported handles');
    const nameless = await api.MathOptModel.fromModelProto(model.encodeModelProto({ removeNames: true }), execution);
    assert(nameless.getSecondOrderConeConstraint(cone.id)?.name === '', 'Name removal includes cones');
    await unsupported(() => api.MathOpt.solve(model, { ...execution, solverType: 'GSCIP' }));
    await unsupported(() => api.MathOpt.solveProto(model.encodeModelProto(), { ...execution, solverType: 'GSCIP' }));
    const updating = api.MathOpt.Model('native update capability');
    const bound = updating.addVariable({ lowerBound: 0, upperBound: 10 });
    const session = new api.MathOpt.IncrementalSolver(updating, 'GSCIP', execution);
    try {
      await session.solve();
      updating.addSecondOrderConeConstraint([3, 4], bound);
      await unsupported(() => session.solve());
    } finally { await session.close(); }
    model.deleteVariable(x);
    assert(cone.argumentsToNorm()[0].terms.size === 0, 'Variable deletion updates cone representation');
    model.deleteSecondOrderConeConstraint(cone);
    assert(!model.hasSecondOrderConeConstraint(cone.id), 'Cone deletion removes its handle');
    return {};
  },
}];
