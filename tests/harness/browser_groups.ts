export const browserFixtureGroups = [
  'cp-sat',
  'cp-sat-worker-lifecycle',
  'routing',
  'mp-solver',
  'knapsack',
  'network-flow',
  'set-cover',
  'rcpsp',
  'mathopt',
  'pdlp',
] as const;

export type BrowserFixtureGroup = typeof browserFixtureGroups[number];

export default browserFixtureGroups;
