import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export const routingParameterValidationCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.parameters.python_standalone_validation',
  name: 'Python standalone search-parameter validation', solver: 'routing',
  source: 'ortools/constraint_solver/python/pywraprouting_test.py:TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters',
  tags: ['python-parity'],
  async run({ routing: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    // TEMP: parity — exact upstream setup and diagnostic substring assertion.
    const parameters = api.defaultRoutingSearchParameters();
    parameters.localSearchOperators = { ...parameters.localSearchOperators, useCross: api.BOOL_UNSPECIFIED };
    assert((await api.findErrorInRoutingSearchParameters(parameters, options)).includes('cross'), 'Native diagnostic names cross');
    return {};
  },
}, {
  id: 'routing.parameters.standalone_validation_contract',
  name: 'Standalone validation preserves defaults, zero overrides and request ownership', solver: 'routing',
  tags: ['native-contract', 'ownership'],
  async run({ routing: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    assert(await api.findErrorInRoutingSearchParameters({}, options) === '', 'Defaults are valid');
    assert(await api.findErrorInRoutingSearchParameters({ localSearchOperators: { useCross: api.BOOL_FALSE } }, options) === '', 'Explicit false is valid');
    assert((await api.findErrorInRoutingSearchParameters({ solutionLimit: 0 }, options)).includes('solution_limit'), 'Zero reaches native validator');
    assert((await api.findErrorInRoutingSearchParameters({ satParameters: { numWorkers: -1 } }, options)).includes('num_workers'), 'Thread error is a diagnostic');
    const parameters = { solutionLimit: 0 };
    const pending = api.findErrorInRoutingSearchParameters(parameters, options);
    parameters.solutionLimit = 1;
    assert((await pending).includes('solution_limit'), 'Input captured before asynchronous execution');
    assert(await api.findErrorInRoutingSearchParameters(parameters, options) === '', 'Healthy request after invalid request');
    let cancelled = false;
    try { await api.findErrorInRoutingSearchParameters({}, { ...options, signal: AbortSignal.abort() }); } catch (error) {
      cancelled = error instanceof Error && error.name === 'AbortError';
    }
    assert(cancelled, 'Pre-aborted request rejects');
    return {};
  },
}];
