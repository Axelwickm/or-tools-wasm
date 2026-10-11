import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runFinalizers({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const create = (slack = 10, capacity: number | bigint = 30, fixedStart = true) => {
    const model = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    model.addConstantDimensionWithSlack(1, capacity, slack, fixedStart, 'time');
    model.setNextValue(model.start(0), 1); model.setNextValue(1, model.end(0));
    return { model, time: model.getDimensionOrDie('time') };
  };
  for (const weighted of [false, true]) for (const kind of ['min', 'max', 'target'] as const) {
    const { model, time } = create();
    const variable = time.cumulVar(1);
    if (kind === 'min') {
      if (weighted) model.addWeightedVariableMinimizedByFinalizer(variable, 0);
      else model.addVariableMinimizedByFinalizer(variable);
    } else if (kind === 'max') {
      if (weighted) model.addWeightedVariableMaximizedByFinalizer(variable, 0);
      else model.addVariableMaximizedByFinalizer(variable);
    } else {
      if (weighted) model.addWeightedVariableTargetToFinalizer(variable, 8, 0);
      else model.addVariableTargetToFinalizer(variable, 8);
    }
    const expected = kind === 'min' ? 1n : kind === 'max' ? 11n : 8n;
    const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
      assert(assignment && assignment.min(variable) === expected && assignment.max(variable) === expected,
        'Finalizers must bind secondary native cumuls to their minimum, maximum or target');
      assert(assignment.objectiveValue() === 0n, 'Finalizer priority must not become a route objective coefficient');
      return assignment;
    };
    const solution = check(await model.solveWithParameters({}, { executor }));
    check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }));
    check(await model.readAssignmentFromRoutes([[1]], false, { executor }));
  }
  for (const prioritizeStart of [false, true]) {
    const { model, time } = create(0, 10, false);
    model.addWeightedVariableMaximizedByFinalizer(time.cumulVar(model.start(0)), prioritizeStart ? 9 : 1);
    model.addWeightedVariableMinimizedByFinalizer(time.cumulVar(model.end(0)), prioritizeStart ? 1 : 9);
    const assignment = await model.solveWithParameters({}, { executor });
    assert(assignment && assignment.value(time.cumulVar(model.start(0))) === (prioritizeStart ? 8n : 0n)
      && assignment.value(time.cumulVar(model.end(0))) === (prioritizeStart ? 10n : 2n),
      'Higher priority wins competing departure/arrival finalizers');
  }
  for (const target of [-5n, 8n, 100n]) {
    const { model, time } = create();
    model.addVariableTargetToFinalizer(time.cumulVar(1), target);
    const assignment = await model.solveWithParameters({}, { executor });
    const expected = target < 1n ? 1n : target > 11n ? 11n : target;
    assert(assignment && assignment.value(time.cumulVar(1)) === expected, 'Out-of-domain targets select the closest feasible value');
  }
  const exact = 9_007_199_254_741_003n;
  const { model: large, time: largeTime } = create(0, exact + 10n, false);
  large.addWeightedVariableTargetToFinalizer(largeTime.cumulVar(large.start(0)), exact, exact);
  const exactSolution = await large.solveWithParameters({}, { executor });
  assert(exactSolution && exactSolution.value(largeTime.cumulVar(large.start(0))) === exact,
    'Finalizer targets and weights must preserve exact signed int64 values');
  const { model: handles, time: handleTime } = create();
  handles.addVariableTargetToFinalizer(handleTime.slackVar(handles.start(0)), 7);
  handles.addVariableMinimizedByFinalizer(handles.nextVar(1));
  handles.addVariableMaximizedByFinalizer(handles.vehicleVar(handles.end(0)));
  handles.addVariableTargetToFinalizer(handles.activeVar(1), 1);
  const handleSolution = await handles.solveWithParameters({}, { executor });
  assert(handleSolution && handleSolution.min(handleTime.cumulVar(1)) === 8n,
    'Slack, successor, terminal vehicle and active handles resolve to their native variables');
  return [{ id: 'routing.correctness.finalizers', name: 'Native minimum/maximum/target finalizers and weighted priorities',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];
}
