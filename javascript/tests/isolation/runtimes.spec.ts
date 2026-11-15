import { test, expect } from '@playwright/test';
const runtimes = ['cp-sat', 'routing', 'mp-solver', 'mathopt', 'pdlp', 'network-flow', 'set-cover'];
for (const isolated of [false, true]) for (const flavor of ['jspi', 'asyncify']) for (const solver of runtimes) {
  test(`${solver} ${flavor} ${isolated ? 'isolated' : 'without headers'}`, async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 }));
    await page.goto(`http://127.0.0.1:${isolated ? 4187 : 4186}/${flavor}/`);
    if (flavor === 'jspi') test.skip(!await page.evaluate(() => typeof (WebAssembly as any).promising === 'function'), 'Browser does not implement JSPI');
    const wasmRequests: string[] = [];
    page.on('request', request => { if (request.url().endsWith('.wasm')) wasmRequests.push(request.url()); });
    const warnings: string[] = [];
    page.on('console', msg => { if (msg.type() === 'warning' && msg.text().includes('one solver thread')) warnings.push(msg.text()); });
    const result = await page.evaluate(async ({ solver, flavor }) => {
      const api = await import(`/${flavor}/browser/${solver}.js`);
      api.setCloudNoticeEnabled(false);
      const solve = async (executor: string) => {
        const options = { executor };
        switch (solver) {
          case 'cp-sat': {
            const model = new api.CpModel();
            const x = model.newIntVar(3, 10, 'x'); model.minimize(x);
            const answer = await api.CpSat.solve(model, { ...options, numWorkers: 1 });
            return Number(answer.value(x));
          }
          case 'routing': {
            const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
            model.setArcCostEvaluatorOfAllVehicles(model.registerTransitMatrix([[0,1,1],[1,0,1],[1,1,0]]));
            return Number((await model.solve(options)).assignment.objectiveValue());
          }
          case 'mp-solver': {
            const model = api.MPSolver.createSolver('GLOP');
            const x = model.addNumVariable(3,10,'x'); model.objective().setCoefficient(x,1); model.objective().setMinimization();
            await model.solve(options); return model.objective().value();
          }
          case 'mathopt': {
            const model = api.MathOpt.Model(); const x = model.addVariable({lowerBound:3,upperBound:10}); model.minimize(x);
            return (await api.MathOpt.solve(model, {...options, solverType:'GLOP'})).value(x);
          }
          case 'pdlp': {
            const result = await api.Pdlp.solve({ objectiveVector:[1],variableLowerBounds:[3],variableUpperBounds:[10],
              constraintLowerBounds:[0],constraintUpperBounds:[20],
              constraintMatrix:{numRows:1,numColumns:1,entries:[{row:0,column:0,value:1}]} }, {...options,numThreads:1});
            return result.primalSolution[0];
          }
          case 'network-flow': {
            const model = new api.SimpleMaxFlow(); model.addArcWithCapacity(0,1,3);
            return Number((await model.solve({...options,source:0,sink:1})).optimalFlow);
          }
          case 'set-cover': {
            const model = new api.SetCoverModel(); model.addEmptySubset(3); model.addElementToLastSubset(0);
            return (await api.SetCover.solve(model,options)).cost;
          }
        }
      };
      return { isolated: crossOriginIsolated, auto: await solve('auto'), direct: await solve('direct'), worker: await solve('worker') };
    }, { solver, flavor });
    expect(result.isolated).toBe(isolated);
    expect(wasmRequests.length).toBeGreaterThan(0);
    for (const url of wasmRequests) expect(url.includes('_asyncify.wasm')).toBe(flavor === 'asyncify');
    for (const value of [result.auto, result.direct, result.worker]) expect(value).toBeCloseTo(3, 4);
    expect(warnings.length).toBe(isolated ? 0 : 1);
  });
}

for (const flavor of ['jspi', 'asyncify']) {
  test(`fallback warning suppression, callbacks and limits ${flavor}`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:4186/${flavor}/`);
    if (flavor === 'jspi') test.skip(!await page.evaluate(() => typeof (WebAssembly as any).promising === 'function'), 'Browser does not implement JSPI');
    const warnings: string[] = [];
    page.on('console', message => { if (message.type() === 'warning' && message.text().includes('one solver thread')) warnings.push(message.text()); });
    const results = await page.evaluate(async flavor => {
      const root = await import(`/${flavor}/browser/index.js`);
      root.setSingleThreadWarningEnabled(false);
      root.setCloudNoticeEnabled(false);
      const cp = await import(`/${flavor}/browser/cp-sat.js`);
      const model = new cp.CpModel(); const x = model.newIntVar(3,10,'x'); model.minimize(x);
      const defaultResult = await cp.CpSat.solve(model);
      const solver = new cp.CpSolver();
      const invalid = await solver.solve(model, {numWorkers: 2});
      const routing = await import(`/${flavor}/browser/routing.js`);
      const route = new routing.RoutingModel(new routing.RoutingIndexManager(3,1,0));
      let callbacks = 0;
      route.setArcCostEvaluatorOfAllVehicles(route.registerTransitCallback(() => { callbacks++; return 1; }));
      const answer = await route.solve();
      let interruption = '';
      try { await route.solve({signal: new AbortController().signal}); }
      catch (error) { interruption = String(error); }
      // The failed operation must not poison the runtime or retained model.
      const recovered = await route.solve();
      return {value: Number(defaultResult.value(x)), invalid, callbacks, objective: Number(answer.assignment.objectiveValue()), interruption,
        recovered: Number(recovered.assignment.objectiveValue())};
    }, flavor);
    expect(results.value).toBe(3);
    expect(results.invalid).toBe('MODEL_INVALID');
    expect(results.callbacks).toBeGreaterThan(0);
    expect(results.objective).toBe(3);
    expect(results.interruption).toContain('Native interruption requires COOP/COEP');
    expect(results.recovered).toBe(3);
    expect(warnings).toEqual([]);
  });
}
