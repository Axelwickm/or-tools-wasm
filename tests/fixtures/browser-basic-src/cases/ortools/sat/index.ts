import type { CpSatCase } from '../../../cpsat_types.ts';
import { pythonApiContractCases } from './python_api_contract.ts';
export { cpSatHighLevelParityCases, runCpSatHighLevelParityCases } from './python_high_level_parity.ts';

export const cpSatCases: CpSatCase[] = pythonApiContractCases.map((testCase) => ({
  ...testCase,
  id: `cp_sat.${testCase.name
    .replace(/^CP-SAT:\s*/, '')
    .replaceAll('/', '.')
    .replaceAll(/[^a-zA-Z0-9_.]+/g, '_')
    .toLowerCase()}`,
  name: testCase.name.startsWith('CP-SAT: ') ? testCase.name : `CP-SAT: ${testCase.name}`,
  solver: 'cp-sat',
  upstream: testCase.name,
  tags: ['python-parity'],
}));
