import { basicContractCases } from './basic_contract.ts';
import { dimensionDisjunctionContractCases } from './dimension_disjunction_contract.ts';
import { searchDimensionMiscContractCases } from './search_dimension_misc_contract.ts';
import { transitContractCases } from './transit_contract.ts';

export const routingContractCases = [
  ...basicContractCases,
  ...transitContractCases,
  ...dimensionDisjunctionContractCases,
  ...searchDimensionMiscContractCases,
];
