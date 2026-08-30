type MathOptConcurrencyApi = {
  MathOpt: {
    Model(name?: string): {
      addVariable(options?: { lowerBound?: number; upperBound?: number; name?: string }): unknown;
      maximize(terms: Array<{ variable: unknown; coefficient: number }>): void;
    };
    solve(model: unknown, options: { executor: 'direct'; solverType: 'GLOP' }): Promise<unknown>;
  };
};

type PdlpConcurrencyApi = {
  Pdlp: {
    QuadraticProgram: new (input?: object) => unknown;
    validateQuadraticProgramDimensions(
      model: unknown,
      options: { executor: 'direct' },
    ): Promise<void>;
  };
};

export type SolverConcurrencyResult = {
  id: 'mathopt_pdlp.executor.concurrency';
  name: 'MathOpt and PDLP reject unsafe local concurrency';
  ok: true;
};

async function expectBusy(promise: Promise<unknown>, label: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof Error) || caught.name !== 'SolverExecutorBusyError') {
    throw new Error(`${label}: expected SolverExecutorBusyError, got ${String(caught)}`);
  }
}

export async function runSolverConcurrencyCase(
  mathOptApi: MathOptConcurrencyApi,
  pdlpApi: PdlpConcurrencyApi,
): Promise<SolverConcurrencyResult> {
  const model = mathOptApi.MathOpt.Model('direct_concurrency');
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  model.maximize([{ variable: x, coefficient: 1 }]);
  const mathOptSolve = mathOptApi.MathOpt.solve(model, {
    executor: 'direct',
    solverType: 'GLOP',
  });
  await expectBusy(
    mathOptApi.MathOpt.solve(model, { executor: 'direct', solverType: 'GLOP' }),
    'concurrent MathOpt solve',
  );
  await mathOptSolve;
  await mathOptApi.MathOpt.solve(model, { executor: 'direct', solverType: 'GLOP' });

  const qp = new pdlpApi.Pdlp.QuadraticProgram();
  const pdlpValidation = pdlpApi.Pdlp.validateQuadraticProgramDimensions(
    qp,
    { executor: 'direct' },
  );
  await expectBusy(
    pdlpApi.Pdlp.validateQuadraticProgramDimensions(qp, { executor: 'direct' }),
    'concurrent PDLP operation',
  );
  await pdlpValidation;
  await pdlpApi.Pdlp.validateQuadraticProgramDimensions(qp, { executor: 'direct' });

  return {
    id: 'mathopt_pdlp.executor.concurrency',
    name: 'MathOpt and PDLP reject unsafe local concurrency',
    ok: true,
  };
}
