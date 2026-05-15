import type { CpSatCase } from '../../../cpsat_types.ts';
import { pythonApiContractCases } from './python_api_contract.ts';

export const cpSatCases: CpSatCase[] = [
  ...pythonApiContractCases,
];
