import { runCases } from './cases.ts';
for (const solver of ['cp-sat', 'routing']) console.log(solver, await runCases(solver));
