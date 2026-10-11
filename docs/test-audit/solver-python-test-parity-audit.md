# Solver Python Test Parity Audit

This ledger tracks selected upstream assertions and dated contract expansions.
Section entries identify assertion-level parity separately from broader native
contracts. Historical exclusions must be reconsidered when the API expands;
they do not establish that every gap is filled or that native patches preserve
unmodified upstream behavior.
The 2026-10-10 follow-up ownership/API cleanup is recorded in
[the gap ledger](../../tests/GAPS.MD#further-api-ownership-cleanup-2026-10-10).
Its shared regressions and Routing helper removal do not change Python
assertion-port counts.
The subsequent [wide lifecycle/API cleanup](../../tests/GAPS.MD#wide-lifecycle-and-api-cleanup-2026-10-10)
reclassifies seven Set Cover cases and the RCPSP parser case as binding variants
where helper assertions are excluded.

Parity is tracked on two axes:

- Behavioral parity: the TS/WASM fixture builds and solves the same kind of model as upstream and checks the same user-visible result assertions.
- API-surface parity: the TS/WASM fixture proves that the corresponding Python public object, option, parameter, or proto mapping is constructible, serializable, and passable through the public TypeScript API. API-surface parity does not imply that every parameter has a deterministic solver-behavior assertion.

Legend and classification guide:

- ✅ Implemented: there is a current TS/WASM parity fixture that directly covers this upstream Python test or a close public-API equivalent.
- 🔎 Double-checked: appended after a status once the upstream Python test body has been compared with our TS/WASM parity implementation.
- ⚠️ Checked mismatch: appended when a current TS/WASM case exists in the same area, but it does not match the upstream Python test behavior closely enough to count as parity.
- 🟨 Placeholder/API gap: our fixtures already acknowledge this test, but it is skipped/TODO because an exposed solver surface is missing a supporting API, such as MathOpt filters or IncrementalSolver.
- ➖ Backend-blocked: the upstream test depends on a solver backend we do not currently link or expose, such as Gurobi.
- 🔴 Relevant missing: the test appears relevant to a solver/API surface we do expose or claim, but no matching parity fixture was found. These are the likely follow-up candidates.
- ⚪ Not applicable: the test is in a solver-family Python file, but it targets Python-only conveniences, internal wrappers, export/update-tracker helpers, or APIs outside the current TypeScript/WASM contract.
- 🧪 Backend coverage note: a runtime/backend check exists, but it is not counted as full upstream Python test parity until the corresponding upstream Python tests have been compared assertion-by-assertion.

Decision rule: this is a contract relevance pass, not a promise that every Python test should be ported line-for-line. When a test mixes solver behavior with Python-only syntax, it is marked by the part that determines whether a useful TS/WASM parity test should exist.

Shared fixture case IDs are the stable link between this audit and the runtime suites. Current ID prefixes are `cp_sat.*`, `cp_sat_high_level.*`, `routing.*`, `mp_solver.*`, `knapsack.*`, `network_flow.*`, `set_cover.*`, `rcpsp.*`, `mathopt.*`, and `pdlp.*`. Runtime context such as direct vs worker bridge and thread count is reported separately from the case ID.

The non-parity group `tests/cases/or-tools-wasm/solve_results.ts` covers the
TypeScript result contracts: independent answers after model edits, infeasible
result access, and observable MP parameter forwarding using GLPK primal tolerance.
They also check MathOpt answer isolation from exposed result data and Routing
assignment rejection of variables from another model.
Knapsack input limits and Network Flow recovery after invalid arc insertion
are also checked in this non-parity group.
These cases use the existing direct/worker/server modes and are registered in
the Node, Bun, Deno, and browser fixtures; they are not counted as Python parity.

MP and MathOpt case/mode completeness is checked against case definitions,
independently of observed results. This does not change parity classifications.

## Native patch provenance and scope correction (2026-10-08)

The runtime/release gate used our patched OR-Tools 9.15 snapshot. It establishes
cross-runtime behavior for that snapshot; it does not establish equivalence to
unmodified upstream. The [binding scope audit](../../tests/GAPS.MD#binding-scope-and-non-coding-audit-2026-10-08)
inventories all 24 changed native source/patch files and records proposed dispositions.
Future feature work is limited to MathOpt frontend/native exposure and RCPSP models.
The initial documentation-only audit did not alter implementation or test classifications.
Subsequent cleanup progress and its verification are recorded in `tests/GAPS.MD`.

The initial scope review identified these areas for focused comparison with the
unmodified pinned sources; current dispositions are tracked in the gap ledger:

- Set Cover cost accounting and safety fixes. Added timeout enforcement and changed
  greedy success semantics have now been removed; time setters retain the pinned
  upstream's unenforced behavior. Cost/copy regressions cover an isolated scalar
  repair, with a focused stock/tree/scalar performance comparison in the gap ledger.
- Network Flow overflow checks/statuses and PDLP rejection of nonfinite assembled
  input. Some observable behavior comes from local native guards; PDLP can return
  `INVALID_PROBLEM` where previous native paths returned `NUMERICAL_ERROR`.
- SCIP IIS integrality cleanup and new access hooks. MathOpt's C++ field-width patch
  has been removed: exact counters remain in protobuf transport, with native duration
  conversion. All 23 focused native MathOpt tests and affected packed Node/Bun/Deno
  contracts pass across direct/worker/server, alongside all eight affected Vite
  development/static Chromium/Firefox profiles.

Keep the existing crash/wrong-result reproductions during cleanup. Preserve ✅
classifications for the specific upstream assertions already compared; any affected
claim must be checked against its actual inputs and assertions before upgrading or
downgrading it. MPSolver LP/MPS exports and constraint activities now use shared
native queries. Native tests compare exact formatting and compensated activities,
and independently parse/solve the exported models. The packed Node/Bun/Deno and
four Vite Chromium/Firefox profiles pass across direct/worker/server; shared
contracts also distinguish constructed free rows from native proto normalization.
Tests of the old handwritten exporter are superseded by these native comparisons.

Public API simplification (2026-10-10) is verified against package SHA1
`d5c14faa6655edead3eb134019795072864c408f`: affected Node/Bun/Deno suites,
all ten browser/bundler profiles for Routing/MPSolver/Set Cover, 43 unit test-file
entries and all 172 site checks pass.
Routing assertion ports now use typed `addConstraints()`, native callback event
values and per-answer profiling/automatic strategy metadata. The checked native
values and model inputs remain the same; removed partial facades and duplicate
constraint shapes are not retained as compatibility shims. Set Cover inspection
ownership and MPSolver generated proto types are binding contracts, not new
Python assertion ports. See the
[current gate](../../tests/GAPS.MD#public-api-simplification-and-verification-2026-10-10).

Follow-up result ownership cleanup (2026-10-09) is verified against package SHA1
`93870a49ad304e858a1efad50c19d65b2b1271e3`: complete Node/Bun/Deno assertions,
all ten browser profiles, 206 native checks, 43 unit test-file entries and
172 site checks pass. See the
[current gate](../../tests/GAPS.MD#result-ownership-cleanup-and-final-verification-2026-10-09).
Shared MPSolver cases cover independent result diagnostics/native solution
validation, imported integer rounding, facade compatibility and both
retained-session facades; MathOpt cases cover owned records, exact backend
counter defaults and pre-aborted session reuse. These are binding regressions,
not additional Python ports.
The earlier final scope evidence below applies to its recorded artifact.

Final scope verification (2026-10-09): the agreed cleanup and MathOpt/RCPSP
frontend exposure are complete. Frozen package SHA1
`6c68ddc1a6cc8a56968080c9a59893cf943303a8` passes complete Node/Bun/Deno suites,
all ten browser profiles, 43 unit test-file entries and 172 site checks;
the fresh production image passes 205 native checks. See the
[final gate](../../tests/GAPS.MD#binding-scope-completion-and-final-verification-2026-10-09)
for artifact/source provenance and backend limits. Objective/import/tracker
coverage notes now reflect the exposed APIs without claiming additional Python
assertion ports. Historical passes remain evidence for their tested snapshots.

## ortools/sat/python/cp_model_helper_test.py
- CpModelHelperTest
  - ✅ 🔎 CpModelHelperTest.test_simple_solve
  - ✅ 🔎 CpModelHelperTest.test_simple_solve_with_core
  - ✅ 🔎 CpModelHelperTest.test_simple_solve_with_proto_api
  - ✅ 🔎 CpModelHelperTest.test_solution_callback
  - ✅ 🔎 CpModelHelperTest.test_best_bound_callback
  - ✅ 🔎 CpModelHelperTest.test_model_stats
  - ⚪ 🔎 CpModelHelperTest.test_int_lin_expr - its public name/domain mutation behavior is covered by `tests/cases/or-tools-wasm/cp_sat/mutation.ts`; full helper-class/string/operator parity remains outside current TS contract: exercises Python internal `cmh.IntVar`/`cmh.LinearExpr` class identity, unary/infix operator overloads, and exact helper string formatting; public high-level expression behavior is covered by `CpModelTest.test_str`, `test_repr`, `test_sum_parsing`, and simplification cases
  - ⚪ 🔎 CpModelHelperTest.test_float_lin_expr - outside current TS contract: exercises Python internal `cmh.IntVar`/`cmh.LinearExpr` class identity, float unary/infix operator overloads, and exact helper string formatting; public high-level float expression behavior is covered by `CpModelTest.test_str`, `test_repr`, `test_sum_parsing`, and `test_weighted_sum_parsing`
- CpModelBuilderTest
  - ⚪ 🔎 CpModelBuilderTest.test_basic - outside current solver parity contract: exercises Python generated proto builder mutation semantics, not CP-SAT solve/model behavior
- SatParametersBuilderTest
  - ⚪ 🔎 SatParametersBuilderTest.test_basic_api - outside current solver parity contract: exercises Python generated SatParameters builder mutation semantics, not CP-SAT solve/model behavior

## ortools/sat/python/cp_model_test.py
- CpModelTest
  - ⚪ 🔎 CpModelTest.test_is_boolean - outside current TS contract: Python NumPy boolean scalar recognition has no native JS value equivalent
  - ✅ 🔎 CpModelTest.test_create_integer_variable
  - ✅ 🔎 CpModelTest.test_hash_int_var
  - ✅ 🔎 CpModelTest.test_literal
  - ✅ 🔎 CpModelTest.test_negation
  - ✅ 🔎 CpModelTest.test_issue4654
  - ✅ 🔎 CpModelTest.test_equality_overload
  - ✅ 🔎 CpModelTest.test_linear
  - ✅ 🔎 CpModelTest.test_none_argument
  - ✅ 🔎 CpModelTest.test_empty_linear_constraint
  - ✅ 🔎 CpModelTest.test_linear_non_equal
  - ✅ 🔎 CpModelTest.test_eq
  - ✅ 🔎 CpModelTest.test_large_constants
  - ✅ 🔎 CpModelTest.testGe
  - ✅ 🔎 CpModelTest.test_gt
  - ✅ 🔎 CpModelTest.test_le
  - ✅ 🔎 CpModelTest.test_lt
  - ✅ 🔎 CpModelTest.test_eq_var
  - ✅ 🔎 CpModelTest.test_ge_var
  - ✅ 🔎 CpModelTest.test_gt_var
  - ✅ 🔎 CpModelTest.test_le_var
  - ✅ 🔎 CpModelTest.test_lt_var
  - ✅ 🔎 CpModelTest.test_linear_non_equal_with_constant
  - ✅ 🔎 CpModelTest.test_linear_with_enforcement
  - ✅ 🔎 CpModelTest.test_names
  - ✅ 🔎 CpModelTest.test_natural_api_minimize
  - ✅ 🔎 CpModelTest.test_natural_api_maximize_float
  - ✅ 🔎 CpModelTest.test_natural_api_maximize_complex
  - ✅ 🔎 CpModelTest.test_natural_api_maximize
  - ✅ 🔎 CpModelTest.test_minimize_constant
  - ✅ 🔎 CpModelTest.test_maximize_constant
  - ✅ 🔎 CpModelTest.test_add_true
  - ✅ 🔎 CpModelTest.test_add_false
  - ✅ 🔎 CpModelTest.test_sum
  - ⚪ 🔎 CpModelTest.test_sum_parsing - current partial parity case covers public high-level sum flattening, integer/float offset behavior, affine/constant/SumArray expression repr, strings, and invalid operands; remaining upstream assertions check Python NumPy scalar handling and internal IntAffine/FloatAffine class identity/fields
  - ⚪ 🔎 CpModelTest.test_weighted_sum_parsing - current partial parity case covers public high-level `weightedSum` flattening and constant expression repr; remaining upstream assertions distinguish integer-valued float coefficients and Python NumPy scalar handling, which JS numbers cannot represent
  - ✅ 🔎 CpModelTest.test_sum_with_api
  - ✅ 🔎 CpModelTest.test_weighted_sum
  - ✅ 🔎 CpModelTest.test_all_different
  - ✅ 🔎 CpModelTest.test_all_different_gen
  - ✅ 🔎 CpModelTest.test_all_different_list
  - ✅ 🔎 CpModelTest.test_element
  - ✅ 🔎 CpModelTest.test_fixed_element
  - ✅ 🔎 CpModelTest.test_affine_element
  - ✅ 🔎 CpModelTest.testCircuit
  - ✅ 🔎 CpModelTest.test_multiple_circuit
  - ✅ 🔎 CpModelTest.test_allowed_assignments
  - ✅ 🔎 CpModelTest.test_forbidden_assignments
  - ✅ 🔎 CpModelTest.test_automaton
  - ✅ 🔎 CpModelTest.test_inverse
  - ✅ 🔎 CpModelTest.test_max_equality
  - ✅ 🔎 CpModelTest.test_max_equality_list
  - ✅ 🔎 CpModelTest.test_max_equality_tuple
  - ✅ 🔎 CpModelTest.test_max_equality_generator
  - ✅ 🔎 CpModelTest.test_max_equality_args
  - ✅ 🔎 CpModelTest.test_max_equality_with_constant
  - ✅ 🔎 CpModelTest.test_min_equality
  - ✅ 🔎 CpModelTest.test_min_equality_list
  - ✅ 🔎 CpModelTest.test_min_equality_tuple
  - ✅ 🔎 CpModelTest.test_min_equality_generator
  - ✅ 🔎 CpModelTest.test_min_equality_args
  - ✅ 🔎 CpModelTest.test_min_equality_with_constant
  - ⚪ 🔎 CpModelTest.test_abs - current partial parity case covers canonical `addAbsEquality()` proto behavior; Python's `abs()` operator hook is intentionally outside the TypeScript API
  - ✅ 🔎 CpModelTest.test_issue4568
  - ⚪ 🔎 CpModelTest.test_division - current partial parity case covers canonical `addDivisionEquality()` proto behavior; Python's division operator hook is intentionally outside the TypeScript API
  - ⚪ 🔎 CpModelTest.testModulo - current partial parity case covers canonical `addModuloEquality()` proto behavior; Python's modulo operator hook is intentionally outside the TypeScript API
  - ✅ 🔎 CpModelTest.test_multiplication_equality
  - ✅ 🔎 CpModelTest.test_multiplication_equality_generator
  - ✅ 🔎 CpModelTest.test_implication
  - ✅ 🔎 CpModelTest.test_bool_or
  - ✅ 🔎 CpModelTest.test_bool_or_list_or_get
  - ✅ 🔎 CpModelTest.test_at_least_one
  - ✅ 🔎 CpModelTest.test_at_most_one
  - ✅ 🔎 CpModelTest.test_exactly_one
  - ✅ 🔎 CpModelTest.test_bool_and
  - ✅ 🔎 CpModelTest.test_bool_x_or
  - ✅ 🔎 CpModelTest.test_map_domain
  - ✅ 🔎 CpModelTest.test_interval
  - ✅ 🔎 CpModelTest.test_rebuild_from_linear_expression_proto — public reconstruction now covers upstream variable identity, coefficients, offsets, interval expressions and Boolean-negation assertions using bounded-expression inspection
  - ✅ 🔎 CpModelTest.test_absent_interval
  - ✅ 🔎 CpModelTest.test_optional_interval
  - ✅ 🔎 CpModelTest.test_no_overlap
  - ✅ 🔎 CpModelTest.test_no_overlap2d
  - ✅ 🔎 CpModelTest.test_cumulative
  - ⚪ 🔎 CpModelTest.test_get_or_make_index_from_constant - outside the TypeScript contract: this directly tests Python's internal constant-index cache; public constant creation and deduplication behavior is exercised through canonical model constraints
  - ✅ 🔎 CpModelTest.test_str
  - ✅ 🔎 CpModelTest.test_repr
  - ⚪ 🔎 CpModelTest.test_integer_expression_errors - current partial parity case covers canonical multiplication/type and integer-bound validation with JavaScript `RangeError`; Python-only `ArithmeticError` and division, modulo, power, shift, and bitwise hooks are intentionally outside the TypeScript API
  - ✅ 🔎 CpModelTest.test_model_errors
  - ⚪ 🔎 CpModelTest.test_solver_errors - current partial parity case covers canonical pre-solve result errors with JavaScript `Error` and invalid operands with `TypeError`; unlike Python's `response_proto`, the TypeScript `response` property is `null` before solve
  - ✅ 🔎 CpModelTest.test_has_objective_minimize
  - ✅ 🔎 CpModelTest.test_has_objective_maximize
  - ✅ 🔎 CpModelTest.test_search_for_all_solutions
  - ✅ 🔎 CpModelTest.test_solve_with_solution_callback
  - ⚪ 🔎 CpModelTest.test_solve_with_float_value_in_callback - intentionally outside the TypeScript contract: this only exercises Python's separate `float_value()` alias; canonical callback `value()` returns `bigint` for integer expressions and `number` for floating-point expressions
  - ✅ 🔎 CpModelTest.test_best_bound_callback
  - ✅ 🔎 CpModelTest.test_value
  - ⚪ 🔎 CpModelTest.test_float_value - intentionally outside the TypeScript contract: this only exercises Python's separate `float_value()` alias; canonical `value()` covers both integer and floating-point expressions
  - ✅ 🔎 CpModelTest.test_boolean_value
  - ✅ 🔎 CpModelTest.test_unsupported_operators
  - ⚪ 🔎 CpModelTest.test_is_literal_true_false - outside the TypeScript contract: this tests Python-internal literal classification helpers and NumPy/bitwise representations; public Boolean literals and negation are covered through canonical model and solve cases
  - ✅ 🔎 CpModelTest.test_solve_minimize_with_solution_callback
  - ✅ 🔎 CpModelTest.test_solution_value
  - ✅ 🔎 CpModelTest.test_solution_hinting
  - ✅ 🔎 CpModelTest.test_solution_hinting_with_booleans
  - ✅ 🔎 CpModelTest.test_assumptions
  - ✅ 🔎 CpModelTest.test_stats
  - ✅ 🔎 CpModelTest.test_search_strategy
  - ✅ 🔎 CpModelTest.test_model_and_response_stats — high-level model statistics are awaited and both reports now use the native formatters; shared statistics contracts additionally check report contents and executor parity
  - ✅ 🔎 CpModelTest.test_validate_model
  - ✅ 🔎 CpModelTest.test_validate_model_with_overflow
  - ⚪ 🔎 CpModelTest.test_copy_model - current partial parity case covers high-level clone independence, canonical proto-index accessors, `isBoolean()`, detached `modelProto` snapshots, and standard JavaScript `RangeError`/`TypeError`; remaining upstream assertions check Python copy.copy/deepcopy object graph behavior
  - ✅ 🔎 CpModelTest.test_custom_log
  - ✅ 🔎 CpModelTest.test_log_to_response
  - ✅ 🔎 CpModelTest.test_issue2762
  - ✅ 🔎 CpModelTest.test_model_error
  - ⚪ 🔎 CpModelTest.test_int_var_series - outside current TS contract: Python pandas `Series` variable factories and pandas vectorized solver values
  - ⚪ 🔎 CpModelTest.test_bool_var_series - outside current TS contract: Python pandas `Series` variable factories and pandas vectorized solver boolean values
  - ⚪ 🔎 CpModelTest.test_fixed_size_interval_var_series - outside current TS contract: Python pandas `Series` interval factories; scalar optional fixed-size interval construction is covered by `CpModelTest.test_interval`
  - ⚪ 🔎 CpModelTest.test_interval_var_series - outside current TS contract: Python pandas `Series` interval factories
  - ✅ 🔎 CpModelTest.test_compare_with_none
  - ⚪ 🔎 CpModelTest.test_small_series - outside current TS contract: pandas `Series.sum`/`Series.dot` preserving Python expression identity and exact string formatting
  - ⚪ 🔎 CpModelTest.test_issue4376_sat_model - outside current TS contract for parity audit: long-running Python performance regression model with timing assertion, not a deterministic API assertion
  - ⚪ 🔎 CpModelTest.test_issue4376_minimize_model - outside current TS contract for parity audit: long-running Python performance regression model with best-bound timing/quality assertion, not a deterministic API assertion
  - ✅ 🔎 CpModelTest.test_issue4434
  - ✅ 🔎 CpModelTest.test_raise_python_exception_in_callback
  - ⚪ 🔎 CpModelTest.test_in_place_sum_modifications - current partial parity case covers public expression immutability and flattened expression behavior; remaining upstream assertions inspect Python internal `cmh.SumArray` class identity plus `int_offset`, `double_offset`, and `num_exprs`
  - ✅ 🔎 CpModelTest.test_large_sum
  - ⚪ 🔎 CpModelTest.test_large_iadd - upstream specifically stress-tests Python `+=` in-place accumulation over 300000 Boolean vars, which has no direct JS operator equivalent
  - ✅ 🔎 CpModelTest.test_complex_iadd
  - ⚪ 🔎 CpModelTest.test_large_isub - upstream specifically stress-tests Python `-=` in-place accumulation over 300000 Boolean vars, which has no direct JS operator equivalent
  - ✅ 🔎 CpModelTest.test_complex_isub
  - ✅ 🔎 CpModelTest.test_radd
  - ✅ 🔎 CpModelTest.test_simplification1
  - ✅ 🔎 CpModelTest.test_simplification2
  - ✅ 🔎 CpModelTest.test_simplification3
  - ✅ 🔎 CpModelTest.test_simplification4
  - ✅ 🔎 CpModelTest.test_simplification5
  - ✅ 🔎 CpModelTest.test_simplification6
  - ✅ 🔎 CpModelTest.test_simplification7
  - ✅ 🔎 CpModelTest.test_simplification8
  - ✅ 🔎 CpModelTest.test_simplification9
  - ✅ 🔎 CpModelTest.test_simplification10
  - ✅ 🔎 CpModelTest.test_issue4759
  - ⚪ 🔎 CpModelTest.test_pre_pep8 - intentionally outside the TypeScript contract: this upstream test only verifies deprecated Python PascalCase aliases such as `NewIntVar`, `AddBoolOr`, and `Maximize`; or-tools-wasm exposes only the canonical camelCase TypeScript API

### First-party CP-SAT high-level contracts

These cases cover public TypeScript behavior that has no direct upstream
`cp_model_test.py` parity case. They live outside the Python parity suite in
`tests/cases/or-tools-wasm/cp_sat/high_level_contract.ts`:

- `cp_sat.high_level.reservoir` - reservoir proto construction, active events, argument validation, and native solves; upstream Python exposes reservoir builders but has no corresponding `cp_model_test.py` case
- `cp_sat.high_level.typescript_helpers` - `addEquality()`, public Boolean-variable classification, proto-index lookup, and detached model snapshots
- `cp_sat.high_level.solver_results` - canonical response, timing, propagation, count, objective-bound, and log accessors before and after a successful solve
- `cp_sat.high_level.expression_surface` - canonical expression proto normalization, Boolean literals, interval expression reconstruction, and native solving without exported Python-internal helper wrappers

Routing resource contract (2026-10-07): `routing.resources.native_assignment` exercises
native resource groups, exclusivity, endpoint domains, eligibility, warm/restored routes,
unused vehicles, large-integer transport with explicitly selected CP-only scheduling,
snapshots and recovery. This covers the native C++ API; Python's routing.swig explicitly
ignores AddResourceGroup/GetResourceGroups and has no runnable creation parity test.

Routing resource-variable contract (2026-10-07): `routing.resources.variable_handles`
checks two groups, domains, expressions, conditional comparisons, finalizers,
ordinary/warm/restored snapshots and ownership. This is additional native C++ contract
coverage; the audited Python tests have no named ResourceVar regression.

Routing resource-inspection contract (2026-10-07): `routing.resources.native_inspection`
checks native normalized attributes, class membership, variable-domain/eligibility
class splits, exact values, detached snapshots and query validation/recovery. This
covers the native ResourceGroup API ignored by Python SWIG, not a new Python-test
parity claim.

Routing Boolean contract (2026-10-07): `routing.correctness.boolean_expressions`
checks native AND/OR/NOT, all six reified comparisons with exact int64 values,
mixed guards, optional-stop feasibility, registered domain/arithmetic/finalizer use,
warm/restored snapshots and validation. This is native CP contract coverage rather
than a claim that the broader pywrapcp test suite has been converted.

Routing nonlinear contract (2026-10-07): `routing.correctness.nonlinear_expressions`
checks native product/absolute/extrema factories, nesting, signs/squares, exact
constants, domains, mixed Boolean/integer registries, guarded constraints and
warm/restored snapshots. This is native primitive coverage; legacy Python helper
and iterator parity is outside the user-approved scope.

The shared `routing.correctness.unbound_nonlinear_assignments` regression checks
real native ranges for all four factories, rejects `value()` on unbound results,
and verifies that binding operands in a later solve leaves the old assignment
snapshot unchanged. This supplements the constructed-assignment unit test.

## ortools/constraint_solver/python/pywraprouting_test.py
- TestPyWrapRoutingIndexManager
  - ✅ 🔎 TestPyWrapRoutingIndexManager.testCtor
  - ✅ 🔎 TestPyWrapRoutingIndexManager.testCtorMultiDepotSame
  - ✅ 🔎 TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff
- TestPyWrapRoutingModel
  - ✅ 🔎 TestPyWrapRoutingModel.testCtor
  - ✅ 🔎 TestPyWrapRoutingModel.testSolve
  - ✅ 🔎 TestPyWrapRoutingModel.testSolveMultiDepot
  - ✅ 🔎 TestPyWrapRoutingModel.testTransitCallback
  - ✅ 🔎 TestPyWrapRoutingModel.testTransitLambda
  - ✅ 🔎 TestPyWrapRoutingModel.testTransitMatrix
  - ✅ 🔎 TestPyWrapRoutingModel.testUnaryTransitCallback
  - ✅ 🔎 TestPyWrapRoutingModel.testUnaryTransitLambda
  - ✅ 🔎 TestPyWrapRoutingModel.testUnaryTransitVector
  - ✅ 🔎 TestPyWrapRoutingModel.testTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testVRP
  - ✅ 🔎 TestPyWrapRoutingModel.testDimensionTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP
  - ✅ 🔎 TestPyWrapRoutingModel.testConstantDimensionTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testVectorDimensionTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testMatrixDimensionTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testMatrixDimensionVRP
  - ✅ 🔎 TestPyWrapRoutingModel.testDisjunctionTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testDisjunctionPenaltyTSP
  - ✅ 🔎 TestPyWrapRoutingModel.testRoutingModelParameters
  - ✅ 🔎 TestPyWrapRoutingModel.testRoutingLocalSearchFiltering
  - ⚪ 🔎 TestPyWrapRoutingModel.testRoutingSearchParameters - intentionally excluded: its explicit model-closing and first-solution decision/reject statistics contract is outside the per-solve TypeScript API; pass search parameters to solve instead
  - ⚪ 🔎 TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters - standalone validation is not exposed; the bridge validates local-search operators and native parameter combinations during execution, including WASM
  - ✅ 🔎 TestPyWrapRoutingModel.testCallback
  - ✅ 🔎 TestPyWrapRoutingModel.testReadAssignment
  - ✅ 🔎 TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple
  - ✅ 🔎 TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd
- TestBoundCost
  - ✅ 🔎 TestBoundCost.testCtor
- TestRoutingDimension
  - ✅ 🔎 TestRoutingDimension.testCtor
  - ✅ 🔎 TestRoutingDimension.testSoftSpanUpperBound
  - ✅ 🔎 TestRoutingDimension.testQuadraticCostSoftSpanUpperBound

## ortools/linear_solver/python/pywraplp_test.py

- Retained MPSolver sessions (2026-10-08): shared `or-tools-wasm/mp_solver/incremental.ts` contracts cover ordered native edits, snapshots, abort/observer failure, concurrency/close, backend reuse/reset and SCIP solution enumeration. Upstream Python tests do not assert retained native object identity or positive NextSolution behavior; these cases are native contracts, not additional Python assertion parity. Native tests assert identical solver/variable pointers across updates and later server jobs. Controlled unit tests reject runtime replacement and stale cleanup. All 15 new cases pass per Node/Bun/Deno across direct/worker/server; all 42 unit files, 178 native checks, 124 installed Node MPSolver regression results, four packaged Vite Chromium/Firefox profiles and nine example checks pass. Verification evidence is recorded in `tests/GAPS.MD`.
- Native solution verification: existing valid-solution `VerifySolution` assertions now await the native operation through their selected executor. Shared `or-tools-wasm/mp_solver/solution_verification.ts` adds native-contract coverage for all ten built backends, invalid objectives/bounds/rows, negative tolerance, accurate sums, continuous integrality semantics, snapshot isolation and cancellation/recovery. These extensions are not additional Python parity claims. Native server tests assert the real `logErrors` side effect with an Abseil log sink.
- MPSolver backend coverage
  - 🧪 CLP backend LP coverage - CLP now runs through the same shared TS/WASM MPSolver public API cases as GLOP for `pywraplp_test.py/test_external_api`, `lp_test.py/RunLinearExampleCppStyleAPI`, `lp_api_test.py/test_proto`, and `lp_test.py/testSolveFromProto`; this verifies `CreateSolver("CLP")`, `SupportsProblemType(CLP_LINEAR_PROGRAMMING)`, parse/check support, solve status, objective/value checks, reduced costs, duals, basis status, activities, solver version, and proto solve paths. This is backend parity coverage, not a separate upstream Python `test_clp` because upstream has no explicit Python CLP test body.
  - 🧪 GLPK backend LP/MIP coverage - GLPK runs through the same shared TS/WASM MPSolver public API LP cases as GLOP/CLP for `pywraplp_test.py/test_external_api`, `lp_test.py/RunLinearExampleCppStyleAPI`, `lp_api_test.py/test_proto`, and `lp_test.py/testSolveFromProto`; this verifies `CreateSolver("GLPK_LP")`, `SupportsProblemType(GLPK_LINEAR_PROGRAMMING)`, parse/check support, solve status, objective/value checks, reduced costs, duals, basis status, activities, solver version, and proto solve paths. GLPK also runs direct MIP solve cases for `CreateSolver("GLPK")`, `SupportsProblemType(GLPK_MIXED_INTEGER_PROGRAMMING)`, and the `simple_mip_program.py` model. This is backend parity coverage, not a separate upstream Python `test_glpk` because upstream has no explicit Python GLPK solve test body.
  - ✅ 🔎 SCIP backend MIP coverage - SCIP now runs shared TS/WASM MPSolver public API MIP cases for `CreateSolver("SCIP")`, `SupportsProblemType(SCIP_MIXED_INTEGER_PROGRAMMING)`, parse/check support, solve status, objective/value checks, `VerifySolution()`, and the `simple_mip_program.py` model. This matches the SCIP branch of upstream `lp_test.py/testApi`; upstream only defines `SCIP_MIXED_INTEGER_PROGRAMMING`, so the Python-only natural expression LP helper branch is not reached for SCIP.
  - ✅ 🔎 CBC backend MIP coverage - CBC now runs shared TS/WASM MPSolver public API MIP cases for `CreateSolver("CBC")`, `SupportsProblemType(CBC_MIXED_INTEGER_PROGRAMMING)`, parse/check support, direct and worker-bridge solve status, objective/value checks, `VerifySolution()`, and the `simple_mip_program.py` model.
  - ✅ 🔎 BOP backend MIP coverage - BOP now runs shared TS/WASM MPSolver public API cases for `CreateSolver("BOP")`, `SupportsProblemType(BOP_INTEGER_PROGRAMMING)`, parse/check support, direct solve status, worker-bridge proto solve status, objective/value checks, `VerifySolution()`, a binary project-selection model, and a bounded non-binary integer production model.
  - ✅ 🔎 Knapsack backend MIP coverage - Knapsack now runs shared TS/WASM MPSolver public API cases for `CreateSolver("KNAPSACK")`, `SupportsProblemType(KNAPSACK_MIXED_INTEGER_PROGRAMMING)`, parse/check support, direct solve status, worker-bridge proto solve status, objective/value checks, `VerifySolution()`, and the `knapsack_solver_test.py/testSolveOneDimension` model.
- PyWrapLp
  - ✅ 🔎 PyWrapLp.test_proto
  - 🧪 PyWrapLp.test_external_api — native LP assertions remain; the constant-false one-shot NextSolution helper is no longer exposed.

## ortools/algorithms/python/knapsack_solver_test.py
- PyWrapAlgorithmsKnapsackSolverTest
  - ✅ 🔎 PyWrapAlgorithmsKnapsackSolverTest.testSolveOneDimension
  - ✅ 🔎 PyWrapAlgorithmsKnapsackSolverTest.testSolveTwoDimensions
  - ✅ 🔎 PyWrapAlgorithmsKnapsackSolverTest.testSolveBigOneDimension

Knapsack native contracts (2026-10-08): shared numerical cases cover exact int64 totals, nonnegative/overflow boundaries, zero weights, empty instances, atomic initialization, result snapshots, unavailable backend recovery and CP-SAT worker budgets. A shared concurrency case verifies Knapsack and MPSolver use their shared runtime safely. These extend native contract coverage, not upstream Python assertion parity. All 15 new results pass per Node/Bun/Deno across direct/worker/server; 42 unit files, 182 native checks, 33 installed Node Knapsack results, four packaged Vite browser profiles and all 63 site solve scenarios pass. Evidence is in `tests/GAPS.MD`.


## ortools/set_cover/python/set_cover_test.py

Set Cover trace/limit native contracts (2026-10-08): shared `or-tools-wasm/set_cover/trace_limits.ts` cases verify native first-occurrence compression, initial deselection/final selection, empty traces, unchanged selection, ordinary native solve order, snapshots/abort/observers and constructor-versus-search iteration semantics. These are native contracts beyond upstream Python coverage, not new Python assertion parity. All nine results pass per Node/Bun/Deno across direct/worker/server; 42 unit files, 179 native checks, 64 installed Node Set Cover results, four packaged Vite browser profiles and five example checks pass. Evidence is in `tests/GAPS.MD`.

- Native guided tabu tuning: `set_cover.native.guided_tabu_tuning` covers defaults, four correctly named setters/getters, explicit zeros, captured inputs, generator isolation, cover preservation, unsafe-input rejection and cancellation/recovery across executors. Native server tests read settings from the actual search generator. This extends the native contract; upstream Python has no runnable guided-tabu tuning test, and its Lagrangian getter/setter names are swapped.
- Persistent guided native contract: four shared guided-session cases cover repeated calls, native initialization, executor binding, mutation/stale-result handling, observer failures, close and runtime replacement. Native tests retain the exact generator/invariant pointers across calls and separate server job threads. These extend native contract coverage; upstream Python has no repeated guided-search lifecycle tests. All 54 shared Set Cover cases pass per Node/Bun/Deno through direct/worker/server, plus four packaged Vite Chromium/Firefox profiles and five example checks. Native object retention passes in the 176-check server suite. Latest evidence is recorded in tests/GAPS.MD.

Native statistics/decile regression (2026-10-07): `set_cover.native.statistics_deciles`
checks cost/row/column distributions, zero-excluding native standard deviation, IQR,
ten-entry native deciles, model snapshots, empty-sample/invalid-ID errors and nonfinite transport.
This is additional native contract coverage, not a converted Python assertion.
`set_cover.cc:251` binds `compute_column_deciles` to `ComputeRowDeciles`; the wrapper
intentionally calls the actual native column method and documents that difference.

- SetCoverTest
  - ✅ 🔎 SetCoverTest.test_save_reload
  - 🧪 🔎 SetCoverTest.test_save_reload_twice — binding variant; native consistency assertions excluded
  - 🧪 🔎 SetCoverTest.test_initial_values — binding variant; native consistency assertions excluded
  - ✅ 🔎 SetCoverTest.test_infeasible
  - ✅ 🔎 SetCoverTest.test_knights_cover_creation
  - 🧪 🔎 SetCoverTest.test_knights_cover_greedy — binding variant; native consistency assertions excluded
  - 🧪 🔎 SetCoverTest.test_knights_cover_degree — binding variant; native consistency assertions excluded
  - 🧪 🔎 SetCoverTest.test_knights_cover_gls — binding variant; native consistency assertions excluded
  - 🧪 🔎 SetCoverTest.test_knights_cover_random — binding variant; native consistency assertions excluded
  - 🧪 🔎 SetCoverTest.test_knights_cover_trivial — binding variant; native consistency assertions excluded
  - ⚪ 🔎 TODO-only upstream cases - `KnightsCoverGreedyAndTabu`, `KnightsCoverGreedyRandomClear`, `KnightsCoverElementDegreeRandomClear`, `KnightsCoverRandomClearMip`, and `KnightsCoverMip` are comments in upstream `set_cover_test.py`, not runnable Python tests.

## ortools/scheduling/python/rcpsp_test.py
- RcpspTest
  - 🧪 🔎 RcpspTest.testParseAndAccess — binding variant: `RcpspProblem.fromPsplib(text)` uses the same `j301_1.sm` input and retains resource/task count assertions. Native filesystem parsing and the parser boolean return are excluded.
- Representative CP-SAT-backed RCPSP coverage
  - 🧪 Variant contracts (2026-10-09): consumer/producer reservoirs and investment capacity/cost/deadline models follow the upstream example and proto semantics, including active recipe events and time-zero bounds excluding zero. Thirty shared model/numerical results pass in Node/Bun/Deno and four Vite browser profiles across direct/worker/server; ten site checks pass. These are model contracts, not new Python assertion ports. Evidence is in `tests/GAPS.MD`.
  - 🧪 Worker-bridge coverage note - shared TS/WASM fixtures also solve a small renewable-resource project schedule through the public `RcpspModelBuilder`, verify generated CP-SAT constraints, direct and worker-bridge solve status, makespan `8`, and selected activity starts/ends. This is not included in upstream Python test totals because upstream `rcpsp_test.py` only tests parser access.

## ortools/graph/python and ortools/graph/samples

Network Flow numerical native contracts (2026-10-08): shared cases cover endpoint rejection before mutation, supply-total/cost-scaling range statuses, exact signed int64 results, failed-result access, snapshots, empty graphs and native source/sink behavior. These extend native contract coverage, not upstream Python sample parity. All 12 new results pass per Node/Bun/Deno across direct/worker/server. The final package passes 42 unit files, 186 native checks, 154 installed Node Network Flow/Routing tests, four Vite browser profiles per solver and 33 related example checks. Routing resource controls are included because they use the native min-cost routine. Evidence is in `tests/GAPS.MD`.

- Python graph wrapper tests
  - ⚪ 🔎 No upstream Python `*_test.py` files were found for `ortools/graph/python/max_flow.cc`, `min_cost_flow.cc`, or `linear_sum_assignment.cc`; parity coverage is based on the Python samples plus the exposed Python wrapper method/status surface.
- Representative Python sample parity
  - ✅ 🔎 `ortools/graph/samples/simple_max_flow_program.py` - shared TS/WASM Network Flow fixture uses `SimpleMaxFlow.addArcsWithCapacity`, checks graph accessors, solves source `0` to sink `4`, verifies the result's `OPTIMAL` status, `optimalFlow == 60`, per-arc flow length/accessors, capacity bounds, source/sink conservation, and min-cut source/sink membership.
  - ✅ 🔎 `ortools/graph/samples/simple_min_cost_flow_program.py` - shared TS/WASM Network Flow fixture uses `SimpleMinCostFlow.addArcsWithCapacityAndUnitCost` and `setNodesSupplies`, checks graph/supply/cost accessors, verifies the result's `OPTIMAL` status, `optimalCost == 150`, `maximumFlow == 20`, per-arc flow length/accessors, capacity bounds, and recomputed cost.
  - ✅ 🔎 `ortools/graph/samples/assignment_linear_sum_assignment.py` - shared TS/WASM Network Flow fixture uses `SimpleLinearSumAssignment.addArcsWithCost`, checks accessors, verifies the result's `OPTIMAL` status, `optimalCost == 265`, and the expected worker-to-task mates/costs.
  - 🧪 Worker-bridge coverage note - the same three graph sample cases run in direct and worker-bridge modes across the shared fixture suites. These sample entries are not included in the upstream Python test totals because upstream does not provide Python graph test files for these wrappers.

## ortools/linear_solver/python/lp_test.py
- PyWrapLpTest
  - ✅ 🔎 PyWrapLpTest.testApi
  - ✅ 🔎 PyWrapLpTest.testSetHint
  - ✅ 🔎 PyWrapLpTest.testBopInfeasible - shared TS/WASM fixture constructs the same BOP model, enables output, solves, and checks the upstream-observed status `0`; upstream prints this status rather than asserting it.
  - ✅ 🔎 PyWrapLpTest.testLoadSolutionFromProto
  - ✅ 🔎 PyWrapLpTest.testSolveFromProto
  - ✅ 🔎 PyWrapLpTest.testExportToMps

## ortools/linear_solver/python/lp_api_test.py
- ⚪ 🔎 test_sum_no_brackets - outside current TS contract: upstream only exercises a local Python generator/list summation helper and does not touch OR-Tools solver APIs
- ✅ 🔎 test_proto

MathOpt native result interoperability (2026-10-08): public typed codecs delegate to native model/solution/result converters for all six solution/ray/basis and four metadata families. Shared cases check exact large IDs/counters, auxiliary objectives, quadratic duals, optional zero/absence, native rejection/recovery and snapshots; an actual native SolveResult import checks quadratic dual names after model mutation. These are native contract extensions, not newly ported Python assertions. All 15 results pass per Node/Bun/Deno across direct/worker/server, with 42 unit files, 189 native checks, 813 installed Node MathOpt case results, four packaged browser profiles and ten example checks. Evidence is in tests/GAPS.MD. Historical entries about unexposed Python parser classes track individual Python assertion parity; equivalent native proto workflows are now available through the two converter methods.

## ortools/math_opt/python/parameters_test.py
API-surface parity: this section tracks Python parameter/proto mapping tests separately from solve behavior. Backend-specific parameter wrappers are accepted as parity when the TS API encodes the same upstream proto field path or exposes a raw serialized-proto escape hatch for unsupported details.

- GlpkParameters
  - ✅ 🔎 GlpkParameters.test_to_proto_round_trip - `compute_unbound_rays_if_possible` true, false, and unset are represented by `MathOpt.GlpkParameters` / `GlpkParameters` and passed into `SolveParametersProto.glpk`
- GurobiParameters
  - ⚪ 🔎 GurobiParameters.test_to_proto_round_trip - outside current TS/WASM contract: Gurobi is not linked or exposed; raw unknown solver-specific proto parsing helpers are not part of the public MathOpt API
  - ⚪ 🔎 GurobiParameters.test_parse_proto_fails_repeated_key - outside current TS/WASM contract: Gurobi is not linked or exposed; Python parser validation for duplicate Gurobi keys has no exposed TS equivalent
- ProtoRoundTrip
  - ✅ 🔎 ProtoRoundTrip.test_solver_type_round_trip - `MathOpt.SolverType.GLPK` is exposed and encoded as `SOLVER_TYPE_GLPK`
  - ✅ 🔎 ProtoRoundTrip.test_lp_algorithm_round_trip - `MathOpt.LPAlgorithm` values are exposed and encoded through `SolveParametersProto.lp_algorithm`; Python-only parse helpers for `None`/UNSPECIFIED are outside the TS contract
  - ✅ 🔎 ProtoRoundTrip.test_emphasis_round_trip - `MathOpt.Emphasis` values are exposed and encoded through `SolveParametersProto` emphasis fields; Python-only parse helpers for `None`/UNSPECIFIED are outside the TS contract
- SolveParametersTest
  - ✅ 🔎 SolveParametersTest.test_common_to_proto - `MathOpt.encodeSolveRequest()` encodes upstream `SolveParametersProto` common fields for time limit, iteration/node/solution/objective/bound/gap limits, output, threads, random seed, LP algorithm, presolve, cuts, heuristics, scaling, and solution pool size
  - ✅ 🔎 SolveParametersTest.test_to_proto_with_none - empty `SolveParameters` / solve options encode without setting optional solve-parameter fields
  - ✅ 🔎 SolveParametersTest.test_to_proto_no_specifics - common solve parameters encode without solver-specific parameter submessages when no backend-specific options are supplied
  - ✅ 🔎 SolveParametersTest backend specifics/gscip - `MathOpt.GScipParameters` encodes emphasis, meta parameters, raw SCIP parameter maps, output controls, solution count, and objective limit into `SolveParametersProto.gscip`
  - ✅ 🔎 SolveParametersTest backend specifics/glop - `MathOpt.GlopParameters` encodes representative upstream `glop.GlopParameters` fields into `SolveParametersProto.glop`; raw proto bytes remain available for advanced fields
  - ✅ 🔎 SolveParametersTest backend specifics/cp_sat - `MathOpt.solve(..., { cpSat })` encodes common `SatParameters` fields into `SolveParametersProto.cp_sat`; raw proto bytes remain available for full generated SatParameters coverage
  - ✅ 🔎 SolveParametersTest backend specifics/pdlp - `MathOpt.PdlpParameters` encodes representative `PrimalDualHybridGradientParams` fields into `SolveParametersProto.pdlp`; raw proto bytes remain available for advanced fields
  - ✅ 🔎 SolveParametersTest.test_to_proto_with_specifics/glpk - `MathOpt.solve(..., { glpk: new GlpkParameters(...) })` encodes the GLPK-specific solve parameters
  - ✅ 🔎 ModelSolveParameters proto mappings - `MathOpt.ModelSolveParameters`, `MathOpt.SparseVectorFilter`, and `MathOpt.SolutionHint` encode model-specific solve filters, solution hints, branching priorities, and lazy linear constraints into `SolveRequest.model_parameters`; raw proto bytes remain available for unsupported model parameter details
  - ✅ 🔎 GLPK threading guard - MathOpt GLPK rejects `threads > 1`; upstream native GLPK tests only allow `threads=1` and reject cross-thread GLPK use

## ortools/linear_solver/python/model_builder_test.py
- ModelBuilderTest
  - ⚪ ModelBuilderTest.test_minimal_linear_example - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_import_from_mps_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_import_from_mps_file - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_import_from_lp_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_import_from_lp_file - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_highs_log_callback_receives_logs_when_enabled - outside current TS contract: Python linear_solver model_builder/helper API and HiGHS backend are not exposed
  - ⚪ ModelBuilderTest.test_class_api - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_large_iadd - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_complex_iadd - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_large_isub - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_complex_sub - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_variables - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_duplicate_variables - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_add_term - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_issue_3614 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_create_false_ct - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderTest.test_create_true_ct - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- InternalHelperTest
  - ⚪ InternalHelperTest.test_anonymous_variables - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ InternalHelperTest.test_anonymous_constraints - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- LinearBaseTest
  - ⚪ LinearBaseTest.test_str - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- LinearBaseErrorsTest
  - ⚪ LinearBaseErrorsTest.test_unknown_linear_type - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ LinearBaseErrorsTest.test_division_by_zero - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ LinearBaseErrorsTest.test_boolean_expression - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- BoundedLinearBaseTest
  - ⚪ BoundedLinearBaseTest.test_str - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ BoundedLinearBaseTest.test_doublesided_bounded_expressions - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ BoundedLinearBaseTest.test_free_bounded_expressions - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ BoundedLinearBaseTest.test_var_eq_var_as_bool - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- BoundedLinearBaseErrorsTest
  - ⚪ BoundedLinearBaseErrorsTest.test_single_var_bounded_linear_expression_as_bool - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ BoundedLinearBaseErrorsTest.test_bounded_linear_expression_as_bool - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderErrorsTest
  - ⚪ ModelBuilderErrorsTest.test_new_var_series_errors - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderErrorsTest.test_add_linear_constraints_errors - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderVariablesTest
  - ⚪ ModelBuilderVariablesTest.test_new_var_series - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderVariablesTest.test_get_variable_lower_bounds - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderVariablesTest.test_get_variable_upper_bounds - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderLinearConstraintsTest
  - ⚪ ModelBuilderLinearConstraintsTest.test_get_linear_constraints - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderLinearConstraintsTest.test_get_linear_constraints_empty - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderLinearConstraintsTest.test_get_linear_constraint_lower_bounds - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderLinearConstraintsTest.test_get_linear_constraint_upper_bounds - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderLinearConstraintsTest.test_get_linear_constraint_expressions - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderObjectiveTest
  - ⚪ ModelBuilderObjectiveTest.test_set_objective - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderObjectiveTest.test_set_new_objective - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderObjectiveTest.test_minimize - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderObjectiveTest.test_maximize - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderProtoTest
  - ⚪ ModelBuilderProtoTest.test_export_to_proto - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- SolverTest
  - ⚪ SolverTest.test_solve_status - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ SolverTest.test_get_variable_values - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ SolverTest.test_get_objective_value - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
- ModelBuilderExamplesTest
  - ⚪ ModelBuilderExamplesTest.test_simple_problem - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.test_graph_k_color - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.test_knapsack_problem - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.test_max_flow_problem - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.test_add_enforced - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testInPlaceSumModifications - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testLargeSum - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification1 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification2 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification3 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification4 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification5 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification6 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification7 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification8 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification9 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification10 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification11 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ ModelBuilderExamplesTest.testSimplification12 - outside current TS contract: Python linear_solver model_builder/helper API is not exposed

## ortools/linear_solver/python/model_builder_helper_test.py
- PywrapModelBuilderHelperTest
  - ⚪ PywrapModelBuilderHelperTest.test_export_model_proto_to_mps_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_export_model_proto_to_lp_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_import_from_mps_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_import_from_mps_file - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_import_from_lp_string - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_solve_with_glop - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_solve_with_glop_direct - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_solve_with_pdlp - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_interrupt_solve - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_build_model - outside current TS contract: Python linear_solver model_builder/helper API is not exposed
  - ⚪ PywrapModelBuilderHelperTest.test_set_coefficient - outside current TS contract: Python linear_solver model_builder/helper API is not exposed

## ortools/math_opt/python/model_test.py
- ModelTest
  - ✅ 🔎 ModelTest.test_name
  - ✅ 🔎 ModelTest.test_name_empty
  - ✅ 🔎 ModelTest.test_add_and_read_variables
  - ✅ 🔎 ModelTest.test_add_integer_variable
  - ✅ 🔎 ModelTest.test_add_binary_variable
  - ✅ 🔎 ModelTest.test_update_variable
  - ✅ 🔎 ModelTest.test_read_deleted_variable
  - ✅ 🔎 ModelTest.test_update_deleted_variable
  - ✅ 🔎 ModelTest.test_add_and_read_linear_constraints
  - ✅ 🔎 ModelTest.test_linear_constraint_as_bounded_expression
  - ✅ 🔎 ModelTest.test_update_linear_constraint
  - ✅ 🔎 ModelTest.test_read_deleted_linear_constraint
  - ✅ 🔎 ModelTest.test_update_deleted_linear_constraint
  - ✅ 🔎 ModelTest.test_linear_constraint_matrix
  - ✅ 🔎 ModelTest.test_linear_constraint_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_bounded_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_upper_bounded_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_lower_bounded_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_number_eq_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_expression_eq_expression
  - ✅ 🔎 ModelTest.test_linear_constraint_variable_eq_variable
  - ⚪ 🔎 ModelTest.test_linear_constraint_errors - outside current TS contract: most assertions validate Python operator-overload error paths, chained comparisons, and keyword conflicts that TypeScript cannot express directly; `ModelTest/test_linear_constraint_errors_direct_api` covers the public TS helper error subset for unsupported options, unsupported expressions, and infinite expression offsets
  - ✅ 🔎 ModelTest.test_linear_constraint_matrix_with_variable_deletion
  - ✅ 🔎 ModelTest.test_linear_constraint_matrix_with_linear_constraint_deletion
  - ✅ 🔎 ModelTest.test_linear_constraint_matrix_wrong_model
  - 🧪 ModelTest.test_export — covered by shared import/export/tracker contracts; individual Python assertions are not ported.
  - 🧪 ModelTest.test_from_model_proto — covered by shared import/export/tracker contracts; individual Python assertions are not ported.
  - 🧪 ModelTest.test_update_tracker_simple — covered by shared import/export/tracker contracts; individual Python assertions are not ported.
  - 🧪 ModelTest.test_two_update_trackers — covered by shared import/export/tracker contracts; individual Python assertions are not ported.
  - 🧪 ModelTest.test_remove_tracker — covered by shared import/export/tracker contracts; individual Python assertions are not ported.
- WrongAttributeTest
  - ⚪ WrongAttributeTest.test_variable - outside current TS contract: Python internal/export/update-tracker/wrong-attribute behavior
  - ⚪ WrongAttributeTest.test_linear_constraint - outside current TS contract: Python internal/export/update-tracker/wrong-attribute behavior
  - ⚪ WrongAttributeTest.test_objective - outside current TS contract: Python internal/export/update-tracker/wrong-attribute behavior
  - ⚪ WrongAttributeTest.test_aux_objective - outside current TS contract: Python internal/export/update-tracker/wrong-attribute behavior
  - ⚪ WrongAttributeTest.test_model - outside current TS contract: Python internal/export/update-tracker/wrong-attribute behavior

## ortools/math_opt/python/model_objective_test.py

Current contract (2026-10-09): primary/linear auxiliary objective handles,
priorities, expression operations and model/update serialization are exposed.
Seven newly marked cases are assertion-level ports. Other objective entries
record native contract coverage without claiming an individual Python port.
Native/controlled/shared contracts cover exact priorities, parameter encoding,
deletions, ownership and backend rejection separately. Python hashing, elemental
constructors and parameter-parser helper objects remain outside this facade.
- ModelSetObjectiveTest
  - ✅ 🔎 ModelSetObjectiveTest.test_maximize
  - ✅ 🔎 ModelSetObjectiveTest.test_maximize_linear_obj
  - ✅ 🔎 ModelSetObjectiveTest.test_maximize_linear_obj_type_error_quadratic
  - ✅ 🔎 ModelSetObjectiveTest.test_maximize_quadratic_objective
  - ✅ 🔎 ModelSetObjectiveTest.test_minimize
  - ✅ 🔎 ModelSetObjectiveTest.test_minimize_linear_obj
  - ✅ 🔎 ModelSetObjectiveTest.test_minimize_linear_obj_type_error_quadratic
  - ✅ 🔎 ModelSetObjectiveTest.test_minimize_quadratic_objective
  - ✅ 🔎 ModelSetObjectiveTest.test_set_objective
  - ✅ 🔎 ModelSetObjectiveTest.test_set_objective_linear_obj
  - ✅ 🔎 ModelSetObjectiveTest.test_set_objective_linear_obj_type_error_quadratic
  - ✅ 🔎 ModelSetObjectiveTest.test_set_objective_quadratic_objective
- ModelAuxObjTest
  - ✅ 🔎 ModelAuxObjTest.test_add_aux_obj_with_expr — shared `or-tools-wasm/mathopt/objectives.ts` ports every upstream assertion through the public API.
  - ✅ 🔎 ModelAuxObjTest.test_add_aux_obj_with_maximize — shared `or-tools-wasm/mathopt/objectives.ts` ports every upstream assertion through the public API.
  - ✅ 🔎 ModelAuxObjTest.test_add_aux_obj_with_minimize — shared `or-tools-wasm/mathopt/objectives.ts` ports every upstream assertion through the public API.
- ModelObjectiveExportProtoIntegrationTest
  - 🧪 ModelObjectiveExportProtoIntegrationTest.test_export_model_with_objective — covered by shared objective serialization contracts; individual Python assertions are not ported.
  - 🧪 ModelObjectiveExportProtoIntegrationTest.test_export_model_update_with_objective — covered by shared objective serialization contracts; individual Python assertions are not ported.
  - 🧪 ModelObjectiveExportProtoIntegrationTest.test_export_model_with_auxiliary_objective — covered by shared objective serialization contracts; individual Python assertions are not ported.
  - 🧪 ModelObjectiveExportProtoIntegrationTest.test_export_model_update_with_aux_obj_update — covered by shared objective serialization contracts; individual Python assertions are not ported.

## ortools/math_opt/python/objectives_test.py

The objective facade and seven assertion-level additions are described above.
The coverage notes below do not count as additional assertion-level Python ports.
- LinearObjectiveTest
  - 🧪 LinearObjectiveTest.test_same_model — covered by shared objective contracts; individual Python assertions are not ported.
  - ✅ 🔎 LinearObjectiveTest.test_name
  - 🧪 LinearObjectiveTest.test_maximize — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_offset — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_priority — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_linear_coefficients_basic — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_linear_coefficients_restore_to_zero — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_clear — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_as_linear_expression — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_add_linear — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_add — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_add_linear_rejects_quadratic — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_set_to_linear — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_set_to_linear_rejects_quadratic — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_set_to_expression — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_get_linear_coef_of_deleted_variable — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_set_linear_coef_of_deleted_variable — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_get_quadratic_coef_of_deleted_variable — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_delete_variable_terms_removed — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_objective_wrong_model_linear — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 LinearObjectiveTest.test_objective_wrong_model_get_quadratic — covered by shared objective contracts; individual Python assertions are not ported.
- PrimaryObjectiveTest
  - 🧪 PrimaryObjectiveTest.test_eq — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_quadratic_coefficients_basic — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_quadratic_coefficients_restore_to_zero — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_clear — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_as_linear_expression_fails — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_as_quadratic_expression — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_add_quadratic — general `add` accepts quadratic expressions; the duplicate method is not exposed and individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_add — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_set_to_quadratic_expression — general `setToExpression` accepts quadratic expressions; the duplicate method is not exposed and individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_set_to_expression — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_set_quadratic_coef_of_deleted_variable — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_delete_variable_quad_terms_removed — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 PrimaryObjectiveTest.test_objective_wrong_model_set_quadratic — covered by shared objective contracts; individual Python assertions are not ported.
- AuxiliaryObjectiveTest
  - 🧪 AuxiliaryObjectiveTest.test_invalid_id_type — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 AuxiliaryObjectiveTest.test_eq — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 AuxiliaryObjectiveTest.test_id — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 AuxiliaryObjectiveTest.test_get_quadratic_coefficients_is_zero — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 AuxiliaryObjectiveTest.test_set_quadratic_coefficients_is_error — covered by shared objective contracts; individual Python assertions are not ported.
  - 🧪 AuxiliaryObjectiveTest.test_as_quadratic_expression_with_linear_no_crash — covered by shared objective contracts; individual Python assertions are not ported.
  - ⚪ AuxiliaryObjectiveTest.test_add_quadratic_errors — duplicate Python method spelling is outside the smaller TypeScript surface; general `add`/`setToExpression` error assertions remain covered.
  - ✅ 🔎 AuxiliaryObjectiveTest.test_add_is_error_if_quad — shared `or-tools-wasm/mathopt/objectives.ts` ports every upstream assertion through the public API.
  - ⚪ AuxiliaryObjectiveTest.test_set_to_quadratic_expression_error — duplicate Python method spelling is outside the smaller TypeScript surface; general `add`/`setToExpression` error assertions remain covered.
  - ✅ 🔎 AuxiliaryObjectiveTest.test_set_to_expression_error_when_quadratic — shared `or-tools-wasm/mathopt/objectives.ts` ports every upstream assertion through the public API.
  - 🧪 AuxiliaryObjectiveTest.test_clear_auxiliary_objective_preserves_others — covered by shared objective contracts; individual Python assertions are not ported.

## ortools/math_opt/python/model_element_test.py
- ModelElementTest
  - ✅ 🔎 ModelElementTest.test_no_elements
  - ✅ 🔎 ModelElementTest.test_add_element
  - 🧪 ModelElementTest.test_get_invalid_element — binding variant: missing IDs return undefined; unchecked synthetic handles are not exposed.
  - ✅ 🔎 ModelElementTest.test_delete_element
  - ⚪ ModelElementTest.test_delete_invalid_element_error — unchecked invalid handles are outside the TypeScript contract.
  - ✅ 🔎 ModelElementTest.test_delete_element_twice_error
  - ✅ 🔎 ModelElementTest.test_delete_element_wrong_model_error
  - 🧪 ModelElementTest.test_get_deleted_element_error — binding variant: deleted IDs return undefined; existing deleted handles still reject access.
  - ✅ 🔎 ModelElementTest.test_ensure_next_id_with_effect
  - ✅ 🔎 ModelElementTest.test_ensure_next_id_no_effect

## ortools/math_opt/python/linear_expression_test.py
- BoundedLinearExprTest
  - ✅ 🔎 BoundedLinearExprTest.test_eq_float
  - ✅ 🔎 BoundedLinearExprTest.test_eq_float_explicit
  - ✅ 🔎 BoundedLinearExprTest.test_eq_expr
  - ✅ 🔎 BoundedLinearExprTest.test_eq_expr_explicit
  - ⚪ 🔎 BoundedLinearExprTest.test_var_eq_var - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprTest.test_var_eq_var_explicit - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprTest.test_var_neq_var - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprTest.test_var_neq_var_explicit - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ✅ 🔎 BoundedLinearExprTest.test_var_dict
  - ✅ 🔎 BoundedLinearExprTest.test_leq_float
  - ✅ 🔎 BoundedLinearExprTest.test_leq_float_rev
  - ✅ 🔎 BoundedLinearExprTest.test_geq_float
  - ✅ 🔎 BoundedLinearExprTest.test_geq_float_rev
  - ✅ 🔎 BoundedLinearExprTest.test_geq_leq_float
  - ✅ 🔎 BoundedLinearExprTest.test_geq_leq_float_rev
  - ✅ 🔎 BoundedLinearExprTest.test_leq_geq_float
  - ✅ 🔎 BoundedLinearExprTest.test_leq_geq_float_rev
  - ✅ 🔎 BoundedLinearExprTest.test_leq_expr
  - ✅ 🔎 BoundedLinearExprTest.test_geq_expr
- BoundedLinearExprErrorTest
  - ⚪ BoundedLinearExprErrorTest.test_ne — unsupported Python inequality operator; no always-throwing TypeScript helper.
  - ✅ 🔎 BoundedLinearExprErrorTest.test_eq
  - ⚪ 🔎 BoundedLinearExprErrorTest.test_float_le_expr_le_float - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprErrorTest.test_float_ge_expr_ge_float - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprErrorTest.test_expr_le_expr_le_float - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ⚪ 🔎 BoundedLinearExprErrorTest.test_expr_ge_expr_ge_float - outside the TypeScript contract: Python equality/Boolean operator coercion
  - ✅ 🔎 BoundedLinearExprErrorTest.test_lower_bounded_expr_leq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_float
  - ✅ 🔎 BoundedLinearExprErrorTest.test_upper_bounded_expr_geq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_float
  - ✅ 🔎 BoundedLinearExprErrorTest.test_bounded_expr_leq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_bounded_expr_leq_float
  - ✅ 🔎 BoundedLinearExprErrorTest.test_bounded_expr_geq_expr
  - ✅ 🔎 BoundedLinearExprErrorTest.test_bounded_expr_geq_float
- BoundedQuadraticExpressionTest
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_eq_float
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_float_eq_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_eq_lin
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_lin_eq_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_eq_str_raises_error
  - ⚪ BoundedQuadraticExpressionTest.test_quad_ne_raises_error — unsupported Python inequality operator; no always-throwing TypeScript helper.
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_le_float
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_float_ge_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_le_lin
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_lin_ge_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_le_str_raises_error
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_ge_float
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_float_le_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_ge_lin
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_lin_le_quad
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_quad_ge_str_raises_error
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_ge_twice
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_ge_twice_fails_when_ambiguous
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_no_quad_ge_bounded_expr
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_le_twice
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_le_twice_fails_when_ambiguous
  - ✅ 🔎 BoundedQuadraticExpressionTest.test_no_quad_le_bounded_expr
- LinearStrAndReprTest
  - ✅ 🔎 LinearStrAndReprTest.test_sorting_ok
  - ✅ 🔎 LinearStrAndReprTest.test_simple_expressions
  - ✅ 🔎 LinearStrAndReprTest.test_sum_expressions
- QuadraticStrAndReprTest
  - ✅ 🔎 QuadraticStrAndReprTest.test_sorting_ok
  - ✅ 🔎 QuadraticStrAndReprTest.test_simple_expressions
  - ✅ 🔎 QuadraticStrAndReprTest.test_sum_expressions
- LinearNumberOpTestsParameters
  - ✅ 🔎 LinearNumberOpTestsParameters.test_suffix
- LinearNumberOpTests
  - ✅ 🔎 LinearNumberOpTests.test_mult
  - ✅ 🔎 LinearNumberOpTests.test_div
  - ✅ 🔎 LinearNumberOpTests.test_add
  - ✅ 🔎 LinearNumberOpTests.test_sub
- QuadraticTermKey
  - ✅ 🔎 QuadraticTermKey.test_var_dict
- QuadraticNumberOpTestsParameters
  - ✅ 🔎 QuadraticNumberOpTestsParameters.test_suffix
- QuadraticNumberOpTests
  - ✅ 🔎 QuadraticNumberOpTests.test_mult
  - ✅ 🔎 QuadraticNumberOpTests.test_div
  - ✅ 🔎 QuadraticNumberOpTests.test_add
  - ✅ 🔎 QuadraticNumberOpTests.test_sub
- LinearLinearAddSubTestParams
  - ✅ 🔎 LinearLinearAddSubTestParams.test_suffix
- LinearLinearAddSubTest
  - ✅ 🔎 LinearLinearAddSubTest.test_add_and_sub
- LinearQuadraticAddSubTestParams
  - ✅ 🔎 LinearQuadraticAddSubTestParams.test_suffix
- LinearQuadraticAddSubTest
  - ✅ 🔎 LinearQuadraticAddSubTest.test_add_and_sub
- LinearLinearMulTest
  - ✅ 🔎 LinearLinearMulTest.test_var_var
  - ✅ 🔎 LinearLinearMulTest.test_term_term
  - ✅ 🔎 LinearLinearMulTest.test_expr_expr
  - ✅ 🔎 LinearLinearMulTest.test_sum_sum
  - ✅ 🔎 LinearLinearMulTest.test_prod_prod
  - ✅ 🔎 LinearLinearMulTest.test_var_term
  - ✅ 🔎 LinearLinearMulTest.test_var_expr
  - ✅ 🔎 LinearLinearMulTest.test_var_sum
  - ✅ 🔎 LinearLinearMulTest.test_var_prod
  - ✅ 🔎 LinearLinearMulTest.test_term_expr
  - ✅ 🔎 LinearLinearMulTest.test_term_sum
  - ✅ 🔎 LinearLinearMulTest.test_term_prod
  - ✅ 🔎 LinearLinearMulTest.test_expr_sum
  - ✅ 🔎 LinearLinearMulTest.test_expr_prod
  - ✅ 🔎 LinearLinearMulTest.test_sum_prod
- NegateTest
  - ✅ 🔎 NegateTest.test_negate_var
  - ✅ 🔎 NegateTest.test_negate_linear_term
  - ✅ 🔎 NegateTest.test_negate_linear_expression
  - ✅ 🔎 NegateTest.test_negate_linear_sum
  - ✅ 🔎 NegateTest.test_negate_ast_product
  - ✅ 🔎 NegateTest.test_negate_quadratic_term
  - ✅ 🔎 NegateTest.test_negate_quadratic_expression
  - ✅ 🔎 NegateTest.test_negate_quadratic_sum
  - ✅ 🔎 NegateTest.test_negate_linear_linear_product
  - ✅ 🔎 NegateTest.test_negate_quadratic_product
- UnsupportedProductOperandTestParams
  - ✅ 🔎 UnsupportedProductOperandTestParams.test_suffix
- UnsupportedProductOperandTest
  - ✅ 🔎 UnsupportedProductOperandTest.test_mult
  - ✅ 🔎 UnsupportedProductOperandTest.test_div
- UnsupportedAdditionOperandTestParams
  - ✅ 🔎 UnsupportedAdditionOperandTestParams.test_suffix
- UnsupportedAdditionOperandTest
  - ✅ 🔎 UnsupportedAdditionOperandTest.test_add
  - ✅ 🔎 UnsupportedAdditionOperandTest.test_sub
- UnsupportedInitializationTest
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_sum_not_tuple
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_sum_not_linear_in_tuple
  - ✅ 🔎 UnsupportedInitializationTest.test_quadratic_sum_not_tuple
  - ✅ 🔎 UnsupportedInitializationTest.test_quadratic_sum_not_linear_in_tuple
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_product_not_scalar
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_product_not_linear
  - ✅ 🔎 UnsupportedInitializationTest.test_quadratic_product_not_scalar
  - ✅ 🔎 UnsupportedInitializationTest.test_quadratic_product_not_quadratic
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_linear_product_first_not_linear
  - ✅ 🔎 UnsupportedInitializationTest.test_linear_linear_product_second_not_linear
- SumTest
  - ✅ 🔎 SumTest.test_sum_vars
  - ✅ 🔎 SumTest.test_sum_linear_terms
  - ✅ 🔎 SumTest.test_sum_quadratic_terms
  - ✅ 🔎 SumTest.test_sum_linear_expression
  - ✅ 🔎 SumTest.test_sum_quadratic_expression
  - ✅ 🔎 SumTest.test_generator_sum_vars
  - ✅ 🔎 SumTest.test_generator_sum_terms
  - ✅ 🔎 SumTest.test_generator_sum_quadratic_terms
  - ✅ 🔎 SumTest.test_generator_sum_expression
  - ✅ 🔎 SumTest.test_generator_quadratic_sum_expression
- AstTest
  - ✅ 🔎 AstTest.test_simple_linear_ast
  - ✅ 🔎 AstTest.test_simple_quadratic_ast
  - ✅ 🔎 AstTest.test_linear_sum_ast
  - ✅ 🔎 AstTest.test_quadratic_sum_ast
- LinearExpressionTest
  - ✅ 🔎 LinearExpressionTest.test_init_to_zero
  - ✅ 🔎 LinearExpressionTest.test_terms_read_only
  - ✅ 🔎 LinearExpressionTest.test_no_copy_of_linear_expression
  - ✅ 🔎 LinearExpressionTest.test_number_as_flat_linear_expression
  - ✅ 🔎 LinearExpressionTest.test_evaluate
- QuadraticExpressionTest
  - ✅ 🔎 QuadraticExpressionTest.test_terms_read_only
  - ✅ 🔎 QuadraticExpressionTest.test_no_copy_of_quadratic_expression
  - ✅ 🔎 QuadraticExpressionTest.test_number_as_flat_quadratic_expression
  - ✅ 🔎 QuadraticExpressionTest.test_evaluate

## ortools/math_opt/python/expressions_test.py

Expression construction cleanup (2026-10-10): constructors accept explicit term
iterables/offsets; scalar, handle and existing-expression assertions use the
canonical `asFlatLinearExpression`/`asFlatQuadraticExpression` converters.
Arithmetic, conversion identity and malformed iterable assertions remain.
Additional shared binding regressions cover complete constructor arguments,
equivalent handle merging, a single-pass sum and direct map lookup without key
scans. They do not claim parity for numeric-keyed maps or removed constructor
overloads.

- FastSumTest
  - ✅ 🔎 FastSumTest.test_variables
  - ✅ 🔎 FastSumTest.test_numbers
  - ✅ 🔎 FastSumTest.test_heterogeneous_linear
  - ✅ 🔎 FastSumTest.test_heterogeneous_quad
  - ✅ 🔎 FastSumTest.test_all_quad
- EvaluateExpressionTest
  - ✅ 🔎 EvaluateExpressionTest.test_scalar_expression
  - ✅ 🔎 EvaluateExpressionTest.test_linear
  - ✅ 🔎 EvaluateExpressionTest.test_quadratic

## ortools/math_opt/python/bounded_expressions_test.py
- BoundedExpressionTest
  - 🧪 🔎 BoundedExpressionTest.test_bounded_expression_read - field/string binding assertions retained; Python repr/Boolean assertions are outside the TypeScript contract
  - 🧪 🔎 BoundedExpressionTest.test_lower_bounded_expression_read - field/string binding assertions retained; Python repr/Boolean assertions are outside the TypeScript contract
  - 🧪 🔎 BoundedExpressionTest.test_upper_bounded_expression_read - field/string binding assertions retained; Python repr/Boolean assertions are outside the TypeScript contract
  - ✅ 🔎 BoundedExpressionTest.test_lower_bounded_to_bounded
  - ✅ 🔎 BoundedExpressionTest.test_upper_bounded_to_bounded

MathOpt native callback contract (2026-10-07): shared cases
`mathopt.controls.native_callbacks` and `mathopt.controls.callback_validation`
cover native CP-SAT/SCIP incumbent events and filters, termination before
optimality, detached callback data, ordinary/incremental lifecycle, original
handler exceptions and reuse, CP-SAT one/four-thread profiles, unsupported events
and incomplete registration. `mathopt.controls.concurrent_server_callbacks`
adds six simultaneous server solves. Transport regressions cover browser
connection capacity, callback polling latency with default/custom status
intervals, callback POST/body deadlines, worker crash/exit/timeout cleanup and releasing acknowledged
server payloads while preserving event cursors. Server cleanup deadlines preserve
terminal results/failures across streaming and polling. This is native contract coverage; the Python
callback parser/helpers and generated-constraint tests are not claimed complete.

MathOpt generated callback results (2026-10-07): shared native cases
`mathopt.controls.solution_lazy`, `mathopt.controls.node_cut` and
`mathopt.controls.node_lazy` verify SCIP generated constraints, including LP
strengthening before branching and ordinary/incremental reuse. Native rejection
cases cover registration permissions, mismatched vector lengths, invalid bounds,
SCIP's unimplemented suggested solutions and CP-SAT's unsupported lazy/node
registration. All 45 new cases pass in each of Node, Bun and Deno across
direct/worker/server, and in all four Vite development/static Chromium/Firefox
MathOpt profiles. Codec regressions preserve exact nested int64 IDs,
infinite bounds, cut/lazy flags and native result bytes. The example's lazy
capacity callback is verified in Chromium. These tests use native C++ callback
contracts as their reference; Python callback helper/parser parity and unavailable
Gurobi behavior are not claimed complete.

MathOpt incremental runtime ownership (2026-10-07): public API regressions cover
dormant handles after worker/direct runtime replacement, stale solves and model
updates, stale close without a failed solve first, retirement before creation
commits, worker reference cleanup and continued replacement-session reuse and
deletion. These lifecycle tests pass in Node, Bun and Deno. Real native GLOP
reproductions in Node additionally verify both worker restart and direct module
replacement with reused handles and distinct objectives (1 versus 9), followed
by model updates to objective 12. This is package lifecycle coverage, not a new
Python parity claim.

MathOpt raw-proto one-shot solving (2026-10-08): `mathopt.raw.valid_solve`
and `mathopt.raw.validation` convert the `without_solver` assertions from
`ortools/math_opt/core/python/solver_test.py::PybindSolverTest.test_valid_solve`
and `test_invalid_input_throws_error`. Three additional native contracts cover
exact int64 IDs, snapshots, native SOS1 constraints, filters, callback/logging
controls and interruption. They do not claim raw incremental creation/update,
solver-count diagnostics or all core Python tests. All 15 raw cases pass per
Node/Bun/Deno through direct/worker/server; the installed Node MathOpt suite
passes 814 results, four packaged Vite Chromium/Firefox profiles pass, and nine
MathOpt example checks pass. Latest evidence is recorded in tests/GAPS.MD.

MathOpt raw incremental sessions (2026-10-08): six shared native contracts cover
explicit update/solve, native false/errors, snapshots/exact IDs, close/concurrency,
callbacks/messages/interruption and runtime ownership. The bound-update case
mirrors `core/python/solver_test.py::test_incremental_solver_update` behavior but
uses current termination objective bounds instead of the deprecated SolveStats
fields asserted upstream, so it is not marked full Python assertion parity.
Controlled worker/direct lifecycle tests now exercise both raw and editable
facades, including replacement during creation and stale cleanup. Native server
checks verify standalone updates without full-model solve requests, native false
for CP-SAT/PDLP and close after either outcome. Diagnostic global solver-count
parity remains excluded. All 18 new cases pass in each of Node/Bun/Deno across
direct/worker/server. All 177 native checks, 41 unit test-file entries and 814
installed-package Node MathOpt results pass, along with four packaged Vite
Chromium/Firefox profiles and ten MathOpt example checks. Latest evidence is in
tests/GAPS.MD.

MathOpt live messages (2026-10-08): shared `mathopt.controls.live_messages` cases
verify native batches before terminal status, ordered asynchronous log events,
final-result log equality without replay, and explicit output suppression for
GLOP, GLPK, SCIP, CP-SAT and PDLP. Lifecycle cases retain original exceptions,
reject promise-returning synchronous handlers, preserve incremental reuse and
reject close from inside a message callback. All 45 cases pass in each of
Node/Bun/Deno across direct/worker/server and all four Vite development/static
Chromium/Firefox MathOpt profiles; native executor regressions verify
streaming/output flags. Server GLPK incremental creation explicitly rejects its
native environment's thread lifetime instead of creating dangling solver state.
This is native contract/lifecycle coverage; Python helper parity is not expanded.

## ortools/math_opt/python/solve_test.py
- SolveTest
  - ✅ 🔎 SolveTest.test_solve_error
  - ✅ 🔎 SolveTest.test_lp_solve
  - 🧪 GSCIP backend MIP coverage - GSCIP now runs shared TS/WASM MathOpt solve cases in direct and worker modes with `threads: 1` and `threads: 4`, checking optimal termination, objective value, and variable values. This is backend coverage, not full parity for the GSCIP-specific upstream tests below.
  - ✅ 🔎 SolveTest.test_indicator - TS `MathOptModel.addIndicatorConstraint()` builds the upstream indicator model, solves with GSCIP, and checks optimal termination, objective value, and variable values
  - ✅ 🔎 SolveTest.test_filters - `MathOpt.ModelSolveParameters` and sparse vector filters solve the upstream GLOP model while checking filtered primal values, dual values, and reduced costs
  - ✅ 🔎 SolveTest.test_message_callback - `MathOpt.solve(..., { messageCallback })` delivers GSCIP solver messages, retains them on the result, and verifies the upstream "problem is solved" log assertion
  - ✅ 🔎 SolveTest.test_solve_interrupter - `MathOpt.SolveInterrupter` can be interrupted before solve, passed to GSCIP, and returns `NO_SOLUTION_FOUND` with `LIMIT_INTERRUPTED`
  - ✅ 🔎 SolveTest.test_solve_duplicated_names - duplicate variable names are rejected by GSCIP through `MathOpt.solve()`
  - ✅ 🔎 SolveTest.test_solve_remove_names - `MathOpt.solve(..., { removeNames: true })` omits names from `ModelProto` and solves the duplicate-name model
  - ✅ 🔎 SolveTest.test_incremental_solve_remove_names - `MathOpt.IncrementalSolver` accepts `removeNames`/`remove_names` and duplicate variable names do not fail initialization
  - 🧪 SolveTest.test_incremental_solve_init_error — native initialization rejects duplicate names on the first awaited solve; synchronous Python constructor error timing is not preserved.
  - ✅ 🔎 SolveTest.test_incremental_solve_error - invalid initial variable bounds are surfaced by `IncrementalSolver.solve()`
  - ✅ 🔎 SolveTest.test_incremental_solve_error_on_reject - CP-SAT rejected-update fallback first solves the original model, then duplicate names added before the second solve are rejected
  - ✅ 🔎 SolveTest.test_incremental_lp - GLOP `MathOpt.IncrementalSolver` updates a variable upper bound and resolves with upstream objective/value assertions
  - ✅ 🔎 SolveTest.test_incremental_mip - GSCIP `MathOpt.IncrementalSolver` updates a linear constraint upper bound and resolves with upstream objective/value assertions
  - ✅ 🔎 SolveTest.test_incremental_mip_with_message_cb - GSCIP incremental MIP solve captures message callbacks, excludes the incremental marker on the first solve, includes it after the model update, and checks upstream objective/value assertions
  - ✅ 🔎 SolveTest.test_incremental_solve_interrupter - `MathOpt.IncrementalSolver.solve()` accepts a pre-interrupted `SolveInterrupter` and returns `NO_SOLUTION_FOUND` with `LIMIT_INTERRUPTED`
  - ✅ 🔎 SolveTest.test_incremental_solve_rejected - CP-SAT rejected-update fallback recreates the full model and solves the updated upper-bound model with upstream objective/value assertions
  - ✅ 🔎 SolveTest.test_multiple_incremental_lps - repeated GLOP incremental upper-bound updates over `[2.0, 3.0, 4.0, 5.0]` match upstream objective/value assertions
  - ⚪ 🔎 SolveTest.test_incremental_solver_delete - outside current TS contract: Python destructor/debug solver-count behavior has no deterministic JavaScript equivalent; explicit `close()` lifecycle parity is covered below
  - ✅ 🔎 SolveTest.test_incremental_solver_close - `MathOpt.IncrementalSolver.close()` releases the native handle and solve-after-close rejects
  - ✅ 🔎 SolveTest.test_incremental_solver_close_twice - `MathOpt.IncrementalSolver.close()` is idempotent
  - ⚪ 🔎 SolveTest.test_incremental_solver_context_manager - outside current TS contract: Python `with` context-manager behavior has no direct TS equivalent; explicit `close()` lifecycle parity is covered above
  - ⚪ 🔎 SolveTest.test_incremental_solver_context_manager_exception - outside current TS contract: Python `with` exception propagation has no direct TS equivalent

## ortools/math_opt/python/result_test.py
- TerminationTest
  - ⚪ TerminationTest.test_termination_unspecified - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ TerminationTest.test_termination_limit_but_not_limit_reason - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ TerminationTest.test_termination_limit_reason_but_no_limit - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ TerminationTest.test_termination_ok_proto_round_trip - outside current TS contract: Python result parser/proto object API is not exposed
- ParseProblemStatus
  - ⚪ ParseProblemStatus.test_problem_status_round_trip - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ ParseProblemStatus.test_problem_status_unspecified_primal_status - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ ParseProblemStatus.test_problem_status_unspecified_dual_status - outside current TS contract: Python result parser/proto object API is not exposed
- ParseObjectiveBounds
  - ⚪ ParseObjectiveBounds.test_objective_bounds_round_trip - outside current TS contract: Python result parser/proto object API is not exposed
- ParseSolveStats
  - ⚪ ParseSolveStats.test_problem_status_round_trip - outside current TS contract: Python result parser/proto object API is not exposed
- SolveResultAuxiliaryFunctionsTest
  - 🧪 SolveResult helper method coverage - `MathOptSolveResult` now exposes Python-style `solve_time()`, `objective_value()`, `variable_values()`, `best_objective_bound()`, primal/dual feasibility predicates, dual values, reduced costs, primal ray values for an unbounded GLPK solve, dual ray values/reduced costs for an infeasible GLOP solve, missing-ray errors, basis status accessors, and `bounded()` on real solve results while preserving existing property and raw-response access; constructed-result parser/proto-object-only negative cases remain below
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_solve_time
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_best_objective_bound
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_primal_solution_has_feasible
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_feasible - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_primal - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_solution - outside current TS contract: Python result parser/proto object API is not exposed
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_dual_solution_has_feasible
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_feasible - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_dual_in_best_solution - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_solution - outside current TS contract: Python result parser/proto object API is not exposed
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_primal_ray_has_ray
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_primal_ray_no_ray
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_dual_ray_has_ray
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_dual_ray_no_ray
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_basis_has_basis
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_basis_no_basis_in_best_solution - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_basis_no_solution - outside current TS contract: Python result parser/proto object API is not exposed
  - ✅ 🔎 SolveResultAuxiliaryFunctionsTest.test_bounded
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_not_bounded_primal_infeasible - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultAuxiliaryFunctionsTest.test_not_bounded_dual_infeasible - outside current TS contract: Python result parser/proto object API is not exposed
- SolveResultTest
  - ⚪ SolveResultTest.test_solve_result_gscip_output - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_osqp_output - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_pdlp_output - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_multiple_solver_specific_outputs_error - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_from_proto_missing_bounds_in_termination - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_from_proto_missing_status_in_termination - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_from_proto_double_infeasible_multiple_rays - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solve_result_from_feasible_multiple_solutions - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_to_proto_round_trip - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_solution_validation - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_primal_ray_validation - outside current TS contract: Python result parser/proto object API is not exposed
  - ⚪ SolveResultTest.test_dual_ray_validation - outside current TS contract: Python result parser/proto object API is not exposed

## ortools/pdlp/python/pdlp_test.py
- QuadraticProgramTest
  - ✅ 🔎 QuadraticProgramTest.test_validate_quadratic_program_dimensions_for_empty_qp
  - ✅ 🔎 QuadraticProgramTest.test_converts_from_tiny_mpmodel_lp
  - ✅ 🔎 QuadraticProgramTest.test_converts_from_tiny_mpmodel_qp
  - ✅ 🔎 QuadraticProgramTest.test_build_lp
  - ✅ 🔎 QuadraticProgramTest.test_build_qp
- PrimalDualHybridGradientTest
  - ✅ 🔎 PrimalDualHybridGradientTest.test_iteration_limit
  - ✅ 🔎 PrimalDualHybridGradientTest.test_solution
  - ✅ 🔎 PrimalDualHybridGradientTest.test_solution_2
  - ✅ 🔎 PrimalDualHybridGradientTest.test_starting_point

## ortools/math_opt/io/python/mps_converter_test.py
- MPSConverterTest
  - ✅ 🔎 MPSConverterTest.test_convert_empty_mps_to_model_proto — name-only native MPS import is checked in the shared MathOpt MPS contract.
  - ✅ 🔎 MPSConverterTest.test_convert_simple_mps_to_model — shared contract compares complete canonical imported ModelProto bytes with the expected upstream model and checks names, IDs, bounds, integrality, matrix and objective data.
  - ✅ 🔎 MPSConverterTest.test_convert_model_proto_to_mps — shared contract compares full MPS text exactly with the vendored upstream fixture.

## CP-SAT model export contract

The upstream `cp_model_test.py` and helper tests do not assert `export_to_file`
or `write_model_to_file`; no Python test is marked parity-complete for this
addition. Shared `cp_sat/model_export.ts` checks exact native text, int64 bounds,
escaping/enums, retained modeling data, invalid-model diagnostic export, input
snapshots, pre-abort/recovery and usable binary exports across direct/worker/server.
The native server test additionally parses text back into a complete ModelProto
and compares serialized model bytes, including an invalid-domain model.

MPSolver native message contracts (2026-10-08): shared cases exercise native backend log hooks, ordering/quiet output, raw-proto and retained solves, observer failure recovery and guarded close. All 67 logging results pass per Node/Bun/Deno across direct/worker/server, along with 191 native checks, 42 unit files, four packaged browser profiles and 25 related site checks. Retained SCIP enumeration with logging also passes. Python does not expose these per-solve hooks, so this is native contract coverage rather than an upstream assertion-parity claim. See `tests/GAPS.MD`.

CP-SAT proto workflow contracts (2026-10-08): typed individual proto snapshots and copy/edit/rebuild are covered by nine native results per Node/Bun/Deno across direct/worker/server, the 1,097-test installed Node fixture, four packaged browser profiles and five magic-square checks. Integer/floating canonical expression inspection and constructor cache reconstruction use the existing API; separate Python flat/cache helper classes remain excluded. These are explicit snapshot adaptations, so live Python protobuf/helper-class parity is not marked complete. Evidence is in `tests/GAPS.MD`.

MPSolver native IIS contracts (2026-10-08): five shared contracts produce 15 passing results per Node/Bun/Deno across direct/worker/server, covering native source mappings, bounds/integer domains, input ownership, retained-state preservation, limits and cancellation/recovery. All 196 native checks, 42 unit files, four packaged browser profiles and 28 related site checks pass. Native regressions independently solve the integer-domain subsystem and prove interruption during the copied-search setup window. The baseline Python SWIG entry has no corresponding implementation or upstream test; no Python assertion parity is claimed. See `tests/GAPS.MD`.

Set Cover / RCPSP / PDLP numerical contracts (2026-10-08): 27 shared native results pass per Node/Bun/Deno across direct/worker/server, covering atomic model inputs, captured arrays, large columns, native cost rounding/overflow recovery, resource aggregation and native sparse/nonfinite PDLP validation. All 201 native checks, 42 unit files, affected installed Node fixtures, 20 packaged browser profiles and 15 related site checks pass. These are adversarial native contracts, not additional upstream Python assertion-parity claims. See `tests/GAPS.MD`.

MPSolver / CP-SAT / MathOpt / Routing numerical contracts (2026-10-08): 18 shared results pass per Node/Bun/Deno across direct/worker/server, covering submitted model/parameter ownership, exact map-domain complements, large expression/result payloads and native Routing int64 rejection/recovery. Complete installed runtime suites, all ten full Vite/webpack/Rollup browser profiles, 42 unit files and 166 site checks pass. Native validators and existing domain primitives remain authoritative; these are additional native contracts, not upstream assertion-parity claims. Final production/bundler verification is recorded in `tests/GAPS.MD`.

Runtime/release gate before scope correction (2026-10-08): all 28 WASM targets and 14 binary pairs verify; complete Node/Bun/Deno and all ten Vite/webpack/Rollup browser profiles pass. The fresh production image passes all 201 native checks and the installed Node client suite again; 42 unit files, 166 site checks and documentation checks pass. This release gate does not upgrade deferred Python-only/backend-dependent parity claims or establish unmodified-native equivalence. Scope cleanup and MathOpt/RCPSP feature work remain. Evidence and the exact packed artifact are in `tests/GAPS.MD`.

MathOpt API cleanup (2026-10-10): eight Python equality/Boolean protocol cases
are outside the TypeScript contract. The fake `VarEqVar`/Boolean helpers were
removed; identity uses `equals()` and constraints use `MathOpt.eq()`.
Bounded-expression read cases retain their field/string assertions without
claiming Python truthiness parity. Sparse-map mutation checks verify immutability
without requiring Python or JavaScript engine-specific exception wording.
Result cases read native IDs and retain primal/dual/ray/basis assertions;
removing duplicate name-map comparisons does not add assertion ports.

API reduction (2026-10-10): result-first Knapsack/Network Flow jobs capture
independent inputs; shared native contracts cover concurrent mutation, preserved
answers and pre-abort behavior across executors. MathOpt's synthetic unchecked
handles and public objective-storage getter/setter were removed. Duplicate-name
validation is native, including incremental initialization. Routing parameter
transport uses only protobuf overrides and field masks. These are binding
simplifications; removed helper assertions are not counted as Python ports.
