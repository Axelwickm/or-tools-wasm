import type * as Api from 'or-tools-wasm/mp-solver';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMpSolverNumericalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const request = { solverType: 'GLOP_LINEAR_PROGRAMMING', model: { maximize: true,
      variable: [{ lowerBound: 0, upperBound: 2, objectiveCoefficient: 1 }] } } satisfies Api.MPSolverModelRequest;
    const options = { ...execution, numThreads: 1 };
    const pending = api.MPSolver.solveModelRequest(request, options);
    request.model.variable[0].upperBound = 5;
    options.numThreads = 1_000_000;
    assert((await pending).response.objectiveValue === 2, 'Raw solves capture the model and execution options before awaiting');
    const encoding = api.MPSolver.createModelRequest(request, execution);
    request.model.variable[0].upperBound = 10;
    const bytes = await encoding;
    const binary = api.MPSolver.solveModelRequest(bytes, execution);
    bytes.fill(255);
    const solved = await binary;
    assert(solved.response.objectiveValue === 5, 'Raw encoding and binary solves own their inputs');
    solved.bytes.fill(255);
    assert(solved.response.variableValue instanceof Array && solved.response.variableValue[0] === 5,
      'Decoded solutions are independent of returned binary storage');
    results.push({ id: 'mp_solver.numerical.raw_input_ownership', solver: 'mp-solver', mode,
      source: 'ortools/linear_solver/linear_solver.proto', tags: ['native-contract', 'ownership'], ok: true as const });

    const response = { status: 'MPSOLVER_OPTIMAL', objectiveValue: 0, variableValue: [3],
      solveInfo: { solveWallTimeSeconds: 0 } } satisfies Api.MPSolverSolutionResponse;
    const responseEncoding = api.MPSolver.createSolutionResponse(response, execution);
    response.variableValue[0] = 9; response.objectiveValue = 9;
    const responseBytes = await responseEncoding;
    const decoding = api.MPSolver.decodeSolutionResponse(responseBytes, execution);
    responseBytes.fill(255);
    const decoded = await decoding;
    assert(decoded.objectiveValue === 0 && (decoded.variableValue as number[])[0] === 3,
      'Solution codecs capture inputs and preserve a present zero objective');
    const parameters = new api.MPSolverParameters();
    parameters.setIntegerParam(api.MPSolverParameters.PRESOLVE, api.MPSolverParameters.PRESOLVE_ON);
    const parameterSolve = api.MPSolver.solveModelRequest(request, { ...execution, parameters });
    parameters.setIntegerParam(api.MPSolverParameters.PRESOLVE, 99);
    assert((await parameterSolve).response.objectiveValue === 10, 'Raw solves capture native parameter maps before awaiting');
    const solver = new api.MPSolver('captured', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addNumVariable(0, 2, 'x'); solver.objective().setCoefficient(x, 1); solver.objective().setMaximization();
    const oneShotParameters = new api.MPSolverParameters();
    oneShotParameters.setIntegerParam(api.MPSolverParameters.PRESOLVE, api.MPSolverParameters.PRESOLVE_ON);
    const oneShotOptions = { ...execution, parameters: oneShotParameters, loadSolution: true };
    const oneShot = solver.solveWithProto(oneShotOptions);
    oneShotOptions.loadSolution = false;
    oneShotParameters.setIntegerParam(api.MPSolverParameters.PRESOLVE, 99);
    assert((await oneShot).loaded && x.solutionValue() === 2,
      'Instance proto solves capture load options and parameter maps before serialization');
    const recovered = await api.MPSolver.solveModelRequest(request, execution);
    assert(recovered.response.objectiveValue === 10, 'Captured codecs and parameters leave subsequent solves usable');
    results.push({ id: 'mp_solver.numerical.response_parameter_ownership', solver: 'mp-solver', mode,
      source: 'ortools/linear_solver/linear_solver.proto', tags: ['native-contract', 'ownership'], ok: true as const });
  }
  return results;
}
