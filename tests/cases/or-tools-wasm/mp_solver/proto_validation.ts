import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';

type Api = {
  MPSolver: {
    solveModelRequest(request: Record<string, unknown>, options: unknown):
      Promise<{ response: Record<string, unknown> }>;
  };
};

export async function runMpSolverProtoValidationCases(api: Api) {
  const request = {
    solverType: 'GLOP_LINEAR_PROGRAMMING',
    model: {
      variable: [{ lowerBound: 0, upperBound: 10, objectiveCoefficient: 1 }],
      constraint: [{ lowerBound: 3, upperBound: 3, varIndex: [0], coefficient: [1] }],
    },
  };
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const solved = await api.MPSolver.solveModelRequest(request, { executor });
    if (solved.response.status !== 'MPSOLVER_OPTIMAL' || solved.response.objectiveValue !== 3) {
      throw new Error(`Valid native model failed (${mode}): ${JSON.stringify(solved.response)}`);
    }
    const snake = await api.MPSolver.solveModelRequest({
      solver_type: 'GLOP_LINEAR_PROGRAMMING',
      model: {
        variable: [{ lower_bound: 0, upper_bound: 10, objective_coefficient: 1 }],
        constraint: [{ lower_bound: 3, upper_bound: 3, var_index: [0], coefficient: [1] }],
      },
    }, { executor });
    if (snake.response.status !== 'MPSOLVER_OPTIMAL' || snake.response.objectiveValue !== 3) {
      throw new Error(`Native protobuf aliases changed the model (${mode})`);
    }
    for (const invalid of [
      { ...request, model: { variable: request.model.variable, constraints: request.model.constraint } },
      { ...request, model: { ...request.model,
        variable: [{ ...request.model.variable[0], lower_bound: 4 }] } },
      { ...request, model: { ...request.model,
        constraint: [{ ...request.model.constraint[0], varIndex: [4294967296] }] } },
      { ...request, model: { ...request.model, generalConstraint: [{ indicatorConstraint: {
        varIndex: 0, varValue: 1, constraint: {
          lowerBound: 0, upperBound: 0, varIndex: [0], coefficient: [1], droppedConstraint: true,
        },
      } }] } },
    ]) {
      let rejected = false;
      try {
        await api.MPSolver.solveModelRequest(invalid, { executor });
      } catch (error) {
        rejected = /Unknown protobuf field|Duplicate protobuf field|int32/.test(String(error));
        if (!rejected) throw error;
      }
      if (!rejected) throw new Error(`Invalid raw model silently changed (${mode})`);
    }
    // Solver-specific settings must not allocate beyond the job's thread budget.
    for (const [solverType, parameters] of [
      ['SAT_INTEGER_PROGRAMMING', 'num_workers: 1000000'],
      ['SAT_INTEGER_PROGRAMMING', 'num_search_workers: 1000000'],
      ['PDLP_LINEAR_PROGRAMMING', 'num_threads: 1000000'],
    ]) {
      for (const ignore of [false, true]) {
        let rejected = false;
        try {
          const result = await api.MPSolver.solveModelRequest({
            ...request, solverType, solverSpecificParameters: parameters,
            ignoreSolverSpecificParametersFailure: ignore,
          }, { executor, numThreads: 1 });
          rejected = result.response.status === 'MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS'
            && /reserved numThreads budget/.test(String(result.response.statusStr));
        } catch (error) {
          rejected = /reserved numThreads budget/.test(String(error));
          if (!rejected) throw error;
        }
        if (!rejected) throw new Error(`Backend escaped its thread budget (${mode}, ${parameters})`);
      }
    }
    const automaticSat = await api.MPSolver.solveModelRequest({
      ...request, solverType: 'SAT_INTEGER_PROGRAMMING',
      solverSpecificParameters: 'num_workers: 0 enumerate_all_solutions: true mip_presolve_level: 0 cp_model_presolve: false',
    }, { executor, numThreads: 1 });
    if (automaticSat.response.status !== 'MPSOLVER_OPTIMAL'
      || automaticSat.response.objectiveValue !== 3) {
      throw new Error(`Automatic SAT workers did not honor sequential enumeration (${mode})`);
    }
    const inferred = await api.MPSolver.solveModelRequest({
      ...request, solverType: 'SAT_INTEGER_PROGRAMMING',
      solverSpecificParameters: 'num_workers: 2',
    }, { executor });
    if (inferred.response.status !== 'MPSOLVER_OPTIMAL' || inferred.response.objectiveValue !== 3) {
      throw new Error(`Parameter-only native worker request was not admitted (${mode})`);
    }
    // A second native solve after each rejection proves no poisoned runtime state.
    const reused = await api.MPSolver.solveModelRequest(request, { executor });
    if (reused.response.status !== 'MPSOLVER_OPTIMAL' || reused.response.objectiveValue !== 3) {
      throw new Error(`Rejected parameters poisoned a subsequent solve (${mode})`);
    }
    results.push({
      id: 'mp_solver.proto.validation', name: 'MPSolver raw model validation', solver: 'mp-solver',
      source: 'javascript/lib/mp_solver/api.ts', tags: ['contract', 'model-validation'],
      mode, ok: true as const,
    });
  }
  return results;
}
