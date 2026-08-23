# MathOpt Python Samples to Port (Browser Basic)

## Selected examples (in order of increasing complexity)

1. `ortools/math_opt/samples/python/linear_programming.py`
2. `ortools/math_opt/samples/python/basic_example.py`
3. `ortools/math_opt/samples/python/integer_programming.py`
4. `ortools/math_opt/samples/python/time_indexed_scheduling.py`

## 1) `linear_programming.py`

- **Original model**
  - Variables: `x0, x1, x2 >= 0`
  - Objective: `max 10*x0 + 6*x1 + 4*x2`
  - Constraints:
    - `10*x0 + 4*x1 + 5*x2 <= 600`
    - `2*x0 + 2*x1 + 6*x2 <= 300`
    - `x0 + x1 + x2 <= 100`
- **Solver dependency**
  - `mathopt.SolverType.GLOP` (LP)
- **Expected result**
  - Optimal objective: `2200/3 ≈ 733.3333333333`
  - One optimum point: `x0 = 100/3`, `x1 = 200/3`, `x2 = 0`
- **Porting notes**
  - This is the baseline for parity; confirms the current browser LP path can reproduce a known optimum.
  - No extra high-level MathOpt features required beyond current fixture-level LP solve surface.

## 2) `basic_example.py`

- **Original model**
  - Variables: `x ∈ {0,1}` (binary), `y ∈ [0, 2.5]`
  - Objective: `max 2.0*x + y`
  - Constraint: `x + y <= 1.5`
- **Solver dependency**
  - `mathopt.SolverType.GSCIP`
- **Expected result**
  - Optimal/feasible objective around `2.5`
  - Solution used in docs: `x = 1`, `y = 0.5`
- **Porting notes**
  - GSCIP is now linked/exposed and covered by the shared fixture runner in direct and worker modes.
  - Sample uses `add_binary_variable(...)`; the high-level TS MathOpt API now also exposes binary/integer variable helpers, so this can be ported directly.

## 3) `integer_programming.py`

- **Original model**
  - Variables: `x, y` integer, `x >= 0`, `y >= 0`
  - Objective: `max x + 10*y`
  - Constraints:
    - `x + 7*y <= 17.5`
    - `x <= 3.5`
- **Solver dependency**
  - `mathopt.SolverType.GSCIP`
- **Expected result**
  - Optimal/feasible objective: `23`
  - Integer optimum: `x = 3`, `y = 2`
- **Porting notes**
  - GSCIP is now available in the browser solver set and has a direct shared fixture smoke test for this model shape.
  - Sample accepts `TerminationReason.OPTIMAL` or `FEASIBLE`; browser harness should preserve this tolerance pattern when rendering expected outcomes.
  - Integer variable support is required (already represented via integer flags), but parity checks and result interpretation should align with integer semantics.

## 4) `time_indexed_scheduling.py`

- **Original model**
  - Data:
    - Jobs `i = 1..n`, processing times `p_i`, release dates `r_i`, time horizon `T = max(r_i) + Σp_i`
  - Variables: `x[i][t] ∈ {0,1}`, where `x[i][t]=1` iff job `i` starts at time `t`, `t=0..T-1`
  - Objective:
    - `min Σ_i Σ_t (t + p_i) * x[i][t]`
  - Constraints:
    - `Σ_t x[i][t] = 1` for each job `i` (exactly one start time)
    - `Σ_i Σ_{s=t-p_i+1}^t x[i][s] <= 1` for each time `t` (no overlap)
    - `x[i][t] = 0` for each `t < r_i` (release times)
    - `x[i][t] ∈ {0,1}`
- **Solver dependency**
  - `mathopt.SolverType.GSCIP`
- **Expected result**
  - With `_USE_TEST_DATA=True`, the sample states an optimal schedule:
    - Job 1 at time `1`, job 2 at time `2`, job 0 at time `7`
    - Objective `sum completion times = 26`
- **Porting notes**
  - GSCIP is now available in the browser fixture.
  - The TypeScript MathOpt API now supports mutable variable bounds through `upperBound` / `upper_bound`, so the release-time restrictions can be represented directly.
  - Larger, two-dimensional binary variable matrices plus time-indexed overlap constraints remain useful as a real complexity step after small MIP examples.

## Rationale

- This sequence starts from a stable LP, then introduces binary/integer domains, then scales to a full binary-time-indexed MIP.
- It gives a practical roadmap for browser parity work:
  1. verify core LP path,
  2. close integer/binary semantics,
  3. establish solver-coverage parity,
  4. validate larger structured IP models.
