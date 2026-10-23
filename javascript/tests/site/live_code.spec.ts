import { expect, test, type Page } from '@playwright/test';
import { transform } from 'esbuild';
import ts from '@typescript/typescript6';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promisify } from 'node:util';

const code = (page: Page) => page.locator('.code-samples code').first();
async function open(page: Page, name: string) {
  await page.goto(`/${name}.html`);
  await expect(code(page)).not.toHaveText('');
  for (const summary of await page.locator('.advanced-settings > summary').all()) await summary.click();
}
async function syntax(page: Page) {
  const result = await transform((await code(page).textContent())!, { loader: 'ts', target: 'es2022' });
  expect(result.warnings).toEqual([]);
  await expect(code(page)).toHaveAttribute('data-highlighted', 'true');
}

test('routing code includes only selected native features', async ({ page }) => {
  await open(page, 'routing_simple');
  const features = {
    'driver-break': 'addBreakInterval', 'peak-traffic': 'registerStateDependentTransitCallback',
    'alternative-pickup': 'addPickupAndDeliverySets', 'grouped-stops': 'addSameActivityGroup',
    'ordered-stops': 'addOrderedActivityGroup', 'precedence-stops': 'addNodePrecedence',
    'excluded-stops': 'ignoreDisjunctionsAlreadyForcedToZero', 'tiered-lateness': 'setCumulVarPiecewiseLinearCost',
    'route-cost': 'addRouteConstraint', 'energy-cost': 'setPathEnergyCostOfVehicle',
    'secondary-model': 'setSecondaryModel', 'generic-tabu': 'GENERIC_TABU_SEARCH',
    'iterated-local-search': 'useIteratedLocalSearch', 'replan': 'applyLocksToAllVehicles',
    'transfer-route': 'transferAssignmentFrom', 'pack-schedule': 'packCumulsOfOptimizerDimensionsFromAssignment',
    'native-inspection': 'getCostClassesCount',
  };
  for (const [id, native] of Object.entries(features)) {
    await page.locator('#scenario').selectOption('basic');
    if (id === 'secondary-model') await page.locator('#first-solution-strategy').selectOption('9');
    await expect(code(page)).not.toContainText(native);
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(native);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).not.toContainText(native);
  }
  await page.locator('#scenario').selectOption('traffic');
  await expect(code(page)).toContainText('registerStateDependentTransitCallback');
  await page.locator('#scenario').selectOption('breaks');
  await expect(code(page)).toContainText('addBreakInterval');
  await expect(code(page)).not.toContainText('registerStateDependentTransitCallback');
});

test('MathOpt code follows callbacks, model type, and serialized workflows', async ({ page }) => {
  await open(page, 'mathopt_basic');
  await page.locator('#solver').selectOption('GSCIP');
  for (const [id, native] of Object.entries({
    'lazy-constraint': 'isLazy: true', 'stop-after-solution': 'terminate: true',
    'improve-point': 'moveVariablesToTheirBestFeasibleValue',
    'live-logs': 'messageCallback:', 'raw-proto': 'MathOpt.solveProto',
  })) {
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(native);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).not.toContainText(native);
  }
  await page.locator('#raw-proto').check();
  await page.locator('#raw-incremental').check();
  await expect(code(page)).toContainText('ProtoIncrementalSolver');
  await syntax(page);
  await page.locator('#raw-proto').uncheck();
  await expect(code(page)).not.toContainText('ProtoIncrementalSolver');
  for (const [setting, native] of Object.entries({ sos1: 'addSos1Constraint', sos2: 'addSos2Constraint',
    robust: 'addRobustConstraint', indicatorMip: 'formulateIndicatorConstraintAsMip' })) {
    await page.locator('#choice-constraint').selectOption(setting);
    await expect(code(page)).toContainText(native);
    await syntax(page);
  }
  await page.locator('#solver').selectOption('GLOP');
  await expect(code(page)).toContainText('SolverType.GLOP');
  await expect(code(page)).not.toContainText('formulateIndicatorConstraintAsMip');
});

test('MathOpt clears lazy capacity when switching to SOS2 and its code solves the same model', async ({ page }, info) => {
  await open(page, 'mathopt_basic');
  await page.locator('#solver').selectOption('GSCIP');
  await page.locator('#worker-count').fill('1');
  await page.locator('#solver-executor').selectOption('direct');
  await page.locator('#lazy-constraint').check();
  await page.locator('#choice-constraint').selectOption('sos2');
  await expect(page.locator('#lazy-constraint')).not.toBeChecked();
  await expect(page.locator('#lazy-constraint')).toBeHidden();
  await expect(code(page)).not.toContainText('isLazy: true');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Objective: 3', { timeout: 60_000 });
  if (info.project.name === 'chromium') {
    const logs = await executeCode(page);
    expect(logs.some(args => args[0] === 3)).toBe(true);
  }
  await page.locator('#choice-constraint').selectOption('linear');
  await expect(page.locator('#lazy-constraint')).toBeVisible();
  await expect(page.locator('#lazy-constraint')).not.toBeChecked();
});

test('MPSolver code follows warm starts, callbacks, clamping and updates', async ({ page }) => {
  await open(page, 'mp_simple_lp');
  for (const [id, native] of Object.entries({ 'warm-start': 'startingBasis', 'clamp-sample': 'clampSolutionWithinBounds', 'incremental': 'IncrementalSolver' })) {
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(native);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).not.toContainText(native);
  }
  await page.locator('#solver').selectOption('SCIP');
  await page.locator('#lazy-limit').check();
  await expect(code(page)).toContainText('lazyConstraints:');
  await page.locator('#solver').selectOption('GLOP');
  await expect(code(page)).not.toContainText('lazyConstraints:');
});

test('Set Cover code follows comparisons and search settings', async ({ page }) => {
  await open(page, 'set_cover_simple');
  for (const [id, native] of Object.entries({ 'cft-comparison': 'SetCover.solveCft', 'mip-comparison': 'SetCover.solveMip' })) {
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(native);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).not.toContainText(native);
  }
  for (const [method, native] of Object.entries({ guided: 'new GuidedTabuSearch', lazy: 'new LazySteepestSearch', restart: 'clearMostCoveredElements' })) {
    await page.locator('#search-method').selectOption(method);
    await expect(code(page)).toContainText(native);
    await syntax(page);
  }
});

test('dispatch code follows resource and delivery restrictions', async ({ page }) => {
  await open(page, 'routing_dispatch');
  for (const [id, native] of Object.entries({ 'use-resources': 'addResourceGroup', 'delivery-choice': 'RoutingBoolExpr.or', 'delivery-order': 'onlyEnforceIf' })) {
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(native);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).not.toContainText(native);
  }
});

for (const [name, id, enabled, disabled] of [
  ['network_flow_min_cost_flow', 'price-scaling', 'setPriceScaling(true)', 'setPriceScaling(false)'],
  ['pdlp_import', 'relax-integers', 'relaxIntegerVariables: true', 'relaxIntegerVariables: false'],
  ['model_playground', 'solution-events', 'solution: true', 'solution: false'],
  ['model_playground', 'bound-events', 'bestBound: true', 'bestBound: false'],
  ['model_playground', 'log-events', 'log: true', 'log: false'],
  ['steel_mill_slab', 'break-symmetries', ", problem, true)", ", problem, false)"],
]) {
  test(`${name} code follows ${id}`, async ({ page }) => {
    await open(page, name);
    await page.locator(`#${id}`).check();
    await expect(code(page)).toContainText(enabled);
    await syntax(page);
    await page.locator(`#${id}`).uncheck();
    await expect(code(page)).toContainText(disabled);
    await syntax(page);
  });
}

// Use a completion file: a zero exit status alone does not verify completion or results.
async function executeCode(page: Page): Promise<unknown[][]> {
  const directory = await mkdtemp(fileURLToPath(new URL('../../build/live-sample-', import.meta.url)));
  try {
    const file = join(directory, 'sample.ts'), output = join(directory, 'result.json');
    await writeFile(file, `import { writeFileSync as saveSampleResult } from 'node:fs';
const sampleLogs: unknown[][] = [];
console.log = (...args) => { sampleLogs.push(args); };
const sampleKeepAlive = setInterval(() => {}, 1000);
${await code(page).textContent()}
saveSampleResult(${JSON.stringify(output)}, JSON.stringify(sampleLogs, (_, value) => typeof value === 'bigint' ? value.toString() : value));
clearInterval(sampleKeepAlive);
`);
    await promisify(execFile)(process.execPath, ['--experimental-strip-types', file], { timeout: 30_000 });
    return JSON.parse(await readFile(output, 'utf8')) as unknown[][];
  } finally { await rm(directory, { recursive: true, force: true }); }
}

for (const [name, checks, selections] of [
  ['routing_simple', ['peak-traffic'], {}],
  ['routing_simple', ['driver-break', 'route-cost'], {}],
  ['mathopt_basic', ['lazy-constraint'], { '#solver': 'GSCIP' }],
  ['mathopt_basic', ['raw-proto'], { '#solver': 'GSCIP', '#choice-constraint': 'robust' }],
  ['mp_simple_lp', ['warm-start', 'incremental', 'clamp-sample'], {}],
  ['set_cover_simple', ['cft-comparison'], { '#search-method': 'guided' }],
] as Array<[string, string[], Record<string, string>]>) {
  test(`${name}: displayed code executes with ${checks.join(', ')}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Native sample execution is shared between browsers.');
    test.setTimeout(60_000);
    await open(page, name);
    await page.locator('#solver-executor').selectOption('direct');
    for (const [selector, setting] of Object.entries(selections)) await page.locator(selector).selectOption(setting);
    for (const input of await page.locator('#workers, #worker-count').all()) if (await input.isVisible()) await input.fill('1');
    for (const id of checks) await page.locator(`#${id}`).check();
    const logs = await executeCode(page);
    if (name === 'routing_simple') expect(logs.some(args => args.length === 2 && Number(args[1]) > 0)).toBe(true);
    if (name === 'mathopt_basic' && checks.includes('lazy-constraint')) expect(logs.some(args => args[0] === 2)).toBe(true);
    if (name === 'mathopt_basic' && checks.includes('raw-proto')) {
      expect(logs.some(args => (args[0] as { solutions?: Array<{ primalSolution?: { objectiveValue?: number } }> })
        ?.solutions?.[0]?.primalSolution?.objectiveValue === 1)).toBe(true);
    }
    if (name === 'mp_simple_lp') expect(logs).toContainEqual([1, 0, 1]);
    if (name === 'set_cover_simple') expect(logs.some(args => args.length === 2 && Number(args[0]) > 0 && args[1] === 0)).toBe(true);
  });
}

test('steel mill exposes the model construction used by the live sample', async ({ page }) => {
  await open(page, 'steel_mill_slab');
  await page.locator('#model-construction > summary').click();
  await expect(page.locator('#model-construction code')).toContainText('export const buildModel');
});

test('live code includes the selected server endpoint without copying credentials', async ({ page }) => {
  await open(page, 'mathopt_basic');
  await page.locator('#solver-executor').selectOption('server');
  await page.locator('.server-endpoint-input').fill('http://localhost:8088');
  await page.locator('.server-auth-input').fill('test-secret-token');
  await expect(code(page)).toContainText("type: 'server'");
  await expect(code(page)).toContainText('http://localhost:8088');
  await expect(code(page)).toContainText('<your server token>');
  await expect(code(page)).not.toContainText('test-secret-token');
  await syntax(page);
});

test('price scaling off is emitted once without an overriding true setting', async ({ page }) => {
  await open(page, 'network_flow_min_cost_flow');
  await page.locator('#price-scaling').uncheck();
  const text = (await code(page).textContent())!;
  expect(text.match(/setPriceScaling\(/g)).toHaveLength(1);
  expect(text).toContain('setPriceScaling(false)');
  expect(text).not.toContain('setPriceScaling(true)');
});

test('ILS and generic tabu share one time limit in valid TypeScript', async ({ page }) => {
  await open(page, 'routing_simple');
  await page.locator('#generic-tabu').check();
  await page.locator('#iterated-local-search').check();
  expect(((await code(page).textContent())!).match(/timeLimit:/g)).toHaveLength(1);
  await syntax(page);
});

for (const format of ['builder', 'orlibScp', 'orlibRail', 'fimi']) {
  test(`Set Cover ${format} code reproduces the displayed model and cost`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Native execution is shared between browsers.');
    test.setTimeout(60_000);
    await open(page, 'set_cover_simple');
    await page.locator('#solver-executor').selectOption('direct');
    await page.locator('#model-format').selectOption(format);
    await page.locator('#run').click();
    await expect(page.locator('#solution-output')).toContainText('Uncovered count: 0');
    const cost = Number(await page.locator('#solution-output .summary-value').textContent());
    const logs = await executeCode(page);
    expect(logs).toContainEqual([cost, 0]);
    if (format === 'builder') expect(cost).toBe(20);
  });
}

for (const restricted of [false, true]) {
  test(`Dispatch code runs with the current inputs (restrictions: ${restricted})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Native execution is shared between browsers.');
    test.setTimeout(60_000);
    await open(page, 'routing_dispatch');
    await page.locator('#solver-executor').selectOption('direct');
    for (const [selector, amount] of Object.entries({ '#vehicle-count': '2', '#delivery-count': '6', '#distance-cap': '10000' })) {
      await page.locator(selector).fill(amount);
      await page.locator(selector).dispatchEvent('change');
    }
    if (restricted) {
      for (const id of ['use-resources', 'delivery-choice', 'delivery-order']) await page.locator(`#${id}`).check();
      await page.locator('#resource-slots').fill('1');
    }
    await syntax(page);
    await page.locator('#run').click();
    await expect(page.locator('#status')).toContainText(/Objective: \d+/, { timeout: 60_000 });
    const objective = (await page.locator('#status').textContent())!.match(/Objective: (\d+)/)![1];
    const logs = await executeCode(page);
    expect(logs.some(args => args.length === 2 && String(args[1]) === objective)).toBe(true);
  });
}

test('combined Routing and Dispatch samples pass strict TypeScript checking', async ({ page }) => {
  const directory = await mkdtemp(fileURLToPath(new URL('../../build/live-types-', import.meta.url)));
  const files: string[] = [];
  try {
    for (const name of ['routing_simple', 'routing_dispatch', 'set_cover_simple']) {
      await open(page, name);
      if (name === 'routing_simple') {
        await page.locator('#generic-tabu').check();
        await page.locator('#iterated-local-search').check();
      }
      if (name === 'routing_dispatch') {
        for (const id of ['use-resources', 'delivery-choice', 'delivery-order']) await page.locator(`#${id}`).check();
      }
      const file = join(directory, `${name}.ts`);
      await writeFile(file, (await code(page).textContent())!);
      files.push(file);
    }
    const program = ts.createProgram(files, {
      strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: ['node'], typeRoots: [fileURLToPath(new URL('../../node_modules/@types/', import.meta.url))],
    });
    expect(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
