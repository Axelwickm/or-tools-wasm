import type { CpSatCase } from '../../../cpsat_types.ts';
import { pythonApiContractCases } from './python_api_contract.ts';

export const cpSatCases: CpSatCase[] = pythonApiContractCases.map((testCase) => ({
  ...testCase,
  name: testCase.name.startsWith('CP-SAT: ') ? testCase.name : `CP-SAT: ${testCase.name}`,
}));
