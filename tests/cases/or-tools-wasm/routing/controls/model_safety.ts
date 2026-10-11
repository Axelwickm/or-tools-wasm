import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runModelSafety({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const manager = new api.RoutingIndexManager(4, 1, 0);
  manager.starts[0] = 1;
  manager.ends[0] = 2;
  assert(manager.starts[0] === 0 && manager.ends[0] === 0, 'Depot snapshots must preserve manager mappings');
  const model = new api.RoutingModel(manager);
  const matrix: number[][] = Array.from({ length: 4 }, (_, from) => Array.from({ length: 4 }, (_, to) => from === to ? 0 : 2));
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitMatrix(matrix));
  matrix[1].fill(100);
  const demands = [0, 1, 2, 0];
  const evaluator = model.registerUnaryTransitVector(demands);
  demands[1] = 100;
  let rejected = false;
  try { model.addDimension(evaluator, 0, NaN, true, 'load'); } catch { rejected = true; }
  assert(rejected && model.addDimension(evaluator, 0, 10, true, 'load'), 'A failed dimension addition must permit a valid retry');
  const optional = [3];
  model.addDisjunction(optional, 10);
  optional[0] = 1;
  const dropped = model.vehicleVar(3);
  assert(!Reflect.set(dropped, 'index', 1), 'Vehicle identity must remain immutable');
  dropped.setValue(-1);
  const cumul = model.getDimensionOrDie('load').cumulVar(model.end(0));
  assert(!Reflect.set(cumul, 'index', 1) && !Reflect.set(cumul, 'dimensionName', 'other'), 'Cumul identity must remain immutable');
  const equality = model.vehicleVar(1).eq(dropped);
  rejected = false;
  try { model.addConstraints(equality, {} as never); } catch { rejected = true; }
  assert(rejected, 'Unsupported constraint batches must fail atomically');
  const foreign = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  foreign.addConstantDimension(1, 10, true, 'load');
  rejected = false;
  try { model.addConstraints(cumul.le(foreign.getDimensionOrDie('load').cumulVar(1))); } catch { rejected = true; }
  assert(rejected, 'Foreign cumul handles must be rejected');
  const assignment = await model.solveWithParameters({ solutionLimit: 1n }, { executor });
  assert(assignment && assignment.objectiveValue() === 16n && assignment.value(cumul) === 3n,
    'Rejected operations and caller mutations must preserve the solved model');
  return [{ id: 'routing.correctness.model_safety', name: 'Atomic model operations and immutable input snapshots',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];
}
