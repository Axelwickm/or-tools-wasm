// Mode 1 is fastest but exceeds the nonrenewable project budget. Mode 2
// should be selected; mode 3 distinguishes preservation from last-row wins.
export const multimodePsplib = `file with basedata : parser-regression.bas
initial value random generator : 17
projects : 1
jobs (incl. supersource/sink ): 4
horizon : 30
RESOURCES
 - renewable : 1 R
 - nonrenewable : 1 N
 - doubly constrained : 0 D
PRECEDENCE RELATIONS:
jobnr. #modes #successors successors
1 1 1 2
2 3 1 3
3 1 1 4
4 1 0
REQUESTS/DURATIONS:
jobnr. mode duration R 1 N 1
--------------------------------
1 1 0 0 0
2 1 1 1 3
  2 4 1 1
  3 9 1 1
3 1 2 1 2
4 1 0 0 0
RESOURCEAVAILABILITIES:
 R 1 N 1
 1 3
********************************`;

export const repeatedJobPsplib = multimodePsplib.replace('  2 4 1 1', '2 2 4 1 1').replace('  3 9 1 1', '2 3 9 1 1');

export const invalidPsplibCases: Array<[string, string]> = [
  ['doubly constrained resources', multimodePsplib.replace('constrained : 0', 'constrained : 1')],
  ['missing mode', multimodePsplib.replace('  3 9 1 1\n', '')],
  ['duplicate mode', multimodePsplib.replace('  3 9 1 1', '  2 9 1 1')],
  ['unknown mode', multimodePsplib.replace('  3 9 1 1', '  4 9 1 1')],
  ['missing precedence', multimodePsplib.replace('4 1 0\n', '')],
  ['incorrect successors', multimodePsplib.replace('1 1 1 2', '1 1 2 2')],
  ['unknown successor', multimodePsplib.replace('1 1 1 2', '1 1 1 5')],
  ['duplicate precedence', multimodePsplib.replace('4 1 0\n', '4 1 0\n4 1 0\n')],
  ['missing resource demand', multimodePsplib.replace('3 1 2 1 2', '3 1 2 1')],
  ['extra resource demand', multimodePsplib.replace('3 1 2 1 2', '3 1 2 1 2 3')],
  ['negative demand', multimodePsplib.replace('3 1 2 1 2', '3 1 2 1 -2')],
  ['fractional duration', multimodePsplib.replace('3 1 2 1 2', '3 1 2.5 1 2')],
  ['unsafe integer', multimodePsplib.replace('horizon : 30', 'horizon : 9007199254740993')],
  ['missing capacities', multimodePsplib.replace('\n 1 3\n', '')],
  ['negative capacity', multimodePsplib.replace('\n 1 3\n', '\n 1 -3\n')],
  ['missing capacity', multimodePsplib.replace('\n 1 3\n', '\n 1\n')],
  ['multiple projects', multimodePsplib.replace('projects : 1', 'projects : 2')],
  ['reordered resource columns', multimodePsplib.replace(' R 1 N 1\n', ' N 1 R 1\n')],
  ['unsupported format', '4 1 0\n1 2 3'],
];
