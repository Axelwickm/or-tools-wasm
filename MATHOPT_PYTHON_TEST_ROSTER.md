# MathOpt Python API Test Roster

Status values:
- pending: not ported yet
- ported: implemented in TypeScript fixtures
- blocked: requires API/runtime support not present yet
- verified: port was double-checked against upstream behavior

| Status | Upstream test | TS artifact | Notes |
|---|---|---|---|
| pending | ortools/math_opt/core/python/solver_test.py:99 PybindSolverTest.test_valid_solve |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:112 PybindSolverTest.test_invalid_input_throws_error |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:128 PybindSolverTest.test_solve_interrupter_interrupts_solve |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:145 PybindSolverTest.test_message_callback_is_invoked |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:163 PybindSolverTest.test_user_callback_is_invoked |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:198 PybindSolverTest.test_solution_hint_is_used |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:223 PybindSolverTest.test_debug_num_solver |  |  |
| pending | ortools/math_opt/core/python/solver_test.py:234 PybindSolverTest.test_incremental_solver_update |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:50 BindingsTest.test_init_names_not_set |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:55 BindingsTest.test_init_names_set |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:60 BindingsTest.test_element_operations |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:92 BindingsTest.test_ensure_next_element_id_at_least |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:97 BindingsTest.test_name_handling |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:113 BindingsTest.test_delete_with_duplicates_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:119 BindingsTest.test_element_operations_bad_shape |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:127 BindingsTest.test_bad_element_type_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:132 BindingsTest.test_attr0 |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:158 BindingsTest.test_attr1 |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:208 BindingsTest.test_attr2 |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:248 BindingsTest.test_attr2_symmetric |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:269 BindingsTest.test_attr1_element_valued |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:279 BindingsTest.test_clear_attr0 |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:286 BindingsTest.test_clear_attr1 |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:294 BindingsTest.test_attr0_bad_attr_id_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:306 BindingsTest.test_attr1_bad_element_id_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:311 BindingsTest.test_set_attr_with_duplicates_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:323 BindingsTest.test_set_attr_with_nonexistent_raises |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:335 BindingsTest.test_slice_attr1_success |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:353 BindingsTest.test_slice_attr1_invalid_key_index |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:361 BindingsTest.test_slice_attr1_invalid_element_index |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:369 BindingsTest.test_slice_attr2_success |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:419 BindingsTest.test_clone |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:436 BindingsTest.test_clone_with_rename |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:445 BindingsTest.test_export_model |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:464 BindingsTest.test_from_model_proto |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:486 BindingsTest.test_from_model_proto_empty |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:494 BindingsTest.test_repr |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:504 BindingsTest.test_add_and_delete_diffs |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:510 BindingsTest.test_export_model_update_has_update |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:535 BindingsTest.test_export_model_update_empty |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:541 BindingsTest.test_advance_diff |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:549 BindingsTest.test_delete_diff_twice_error |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:556 BindingsTest.test_delete_diff_never_created_error |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:561 BindingsTest.test_export_model_update_diff_never_created |  |  |
| pending | ortools/math_opt/elemental/python/elemental_test.py:566 BindingsTest.test_advance_diff_never_created |  |  |
| pending | ortools/math_opt/elemental/python/enums_test.py:21 EnumsTest.test_element_type_enums |  |  |
| pending | ortools/math_opt/elemental/python/enums_test.py:24 EnumsTest.test_attr_enums |  |  |
| pending | ortools/math_opt/io/python/mps_converter_test.py:58 MPSConverterTest.test_convert_empty_mps_to_model_proto |  |  |
| pending | ortools/math_opt/io/python/mps_converter_test.py:63 MPSConverterTest.test_convert_simple_mps_to_model |  |  |
| pending | ortools/math_opt/io/python/mps_converter_test.py:69 MPSConverterTest.test_convert_model_proto_to_mps |  |  |
| ported | ortools/math_opt/python/bounded_expressions_test.py:25 BoundedExpressionTest.test_bounded_expression_read | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/bounded_expressions_test.py:37 BoundedExpressionTest.test_lower_bounded_expression_read | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/bounded_expressions_test.py:49 BoundedExpressionTest.test_upper_bounded_expression_read | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/bounded_expressions_test.py:61 BoundedExpressionTest.test_lower_bounded_to_bounded | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/bounded_expressions_test.py:71 BoundedExpressionTest.test_upper_bounded_to_bounded | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/callback_test.py:29 CallbackDataTest.test_parse_callback_data_no_solution |  |  |
| pending | ortools/math_opt/python/callback_test.py:59 CallbackDataTest.test_parse_callback_data_with_solution |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:31 ModelSubsetBoundsTest.test_empty |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:36 ModelSubsetBoundsTest.test_proto |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:43 ModelSubsetBoundsTest.test_proto_round_trip_lower |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:52 ModelSubsetBoundsTest.test_proto_round_trip_upper |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:64 ModelSubsetTest.test_empty |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:77 ModelSubsetTest.test_to_proto |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:98 ModelSubsetTest.test_proto_round_trip_empty |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:108 ModelSubsetTest.test_proto_round_trip_full |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:132 ModelSubsetTest.test_parse_proto_quadratic_constraint_unsupported |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:139 ModelSubsetTest.test_parse_proto_second_order_cone_unsupported |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:149 ModelSubsetTest.test_parse_proto_sos1_unsupported |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:155 ModelSubsetTest.test_parse_proto_sos2_unsupported |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:161 ModelSubsetTest.test_parse_proto_indicator_unsupported |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:172 ComputeInfeasibleSubsystemResultTest.test_to_proto_round_trip |  |  |
| pending | ortools/math_opt/python/compute_infeasible_subsystem_result_test.py:187 ComputeInfeasibleSubsystemResultTest.test_to_proto_round_trip_empty |  |  |
| pending | ortools/math_opt/python/errors_test.py:24 StatusProtoToExceptionTest.test_ok |  |  |
| pending | ortools/math_opt/python/errors_test.py:31 StatusProtoToExceptionTest.test_invalid_argument |  |  |
| pending | ortools/math_opt/python/errors_test.py:40 StatusProtoToExceptionTest.test_failed_precondition |  |  |
| pending | ortools/math_opt/python/errors_test.py:50 StatusProtoToExceptionTest.test_unimplemented |  |  |
| pending | ortools/math_opt/python/errors_test.py:59 StatusProtoToExceptionTest.test_internal |  |  |
| pending | ortools/math_opt/python/errors_test.py:68 StatusProtoToExceptionTest.test_unexpected_code |  |  |
| pending | ortools/math_opt/python/errors_test.py:79 StatusProtoToExceptionTest.test_unknown_code |  |  |
| ported | ortools/math_opt/python/expressions_test.py:28 FastSumTest.test_variables | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:40 FastSumTest.test_numbers | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:48 FastSumTest.test_heterogeneous_linear | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:58 FastSumTest.test_heterogeneous_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:71 FastSumTest.test_all_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:87 EvaluateExpressionTest.test_scalar_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:94 EvaluateExpressionTest.test_linear | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/expressions_test.py:104 EvaluateExpressionTest.test_quadratic | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/indicator_constraints_test.py:32 IndicatorConstraintsTest.test_getters_empty |  |  |
| pending | ortools/math_opt/python/indicator_constraints_test.py:48 IndicatorConstraintsTest.test_getters_nonempty |  |  |
| pending | ortools/math_opt/python/indicator_constraints_test.py:75 IndicatorConstraintsTest.test_create_by_attrs |  |  |
| pending | ortools/math_opt/python/indicator_constraints_test.py:95 IndicatorConstraintsTest.test_get_coefficient_wrong_model |  |  |
| pending | ortools/math_opt/python/indicator_constraints_test.py:103 IndicatorConstraintsTest.test_eq |  |  |
| pending | ortools/math_opt/python/indicator_constraints_test.py:118 IndicatorConstraintsTest.test_hash_no_crash |  |  |
| pending | ortools/math_opt/python/init_arguments_test.py:24 GurobiISVKeyTest.test_proto_conversions |  |  |
| pending | ortools/math_opt/python/init_arguments_test.py:39 StreamableGurobiInitArgumentsTest.test_proto_conversions_isv_key_set |  |  |
| pending | ortools/math_opt/python/init_arguments_test.py:56 StreamableGurobiInitArgumentsTest.test_proto_conversions_isv_key_not_set |  |  |
| pending | ortools/math_opt/python/init_arguments_test.py:70 StreamableSolverInitArgumentsTest.test_proto_conversions_gurobi_set |  |  |
| pending | ortools/math_opt/python/init_arguments_test.py:91 StreamableSolverInitArgumentsTest.test_proto_conversions_gurobi_not_set |  |  |
| ported | ortools/math_opt/python/linear_expression_test.py:43 BoundedLinearExprTest.test_eq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:56 BoundedLinearExprTest.test_eq_float_explicit | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:68 BoundedLinearExprTest.test_eq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:106 BoundedLinearExprTest.test_eq_expr_explicit | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:143 BoundedLinearExprTest.test_var_eq_var | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:164 BoundedLinearExprTest.test_var_eq_var_explicit | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:183 BoundedLinearExprTest.test_var_neq_var | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:199 BoundedLinearExprTest.test_var_neq_var_explicit | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:217 BoundedLinearExprTest.test_var_dict | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:228 BoundedLinearExprTest.test_leq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:239 BoundedLinearExprTest.test_leq_float_rev | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:250 BoundedLinearExprTest.test_geq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:261 BoundedLinearExprTest.test_geq_float_rev | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:272 BoundedLinearExprTest.test_geq_leq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:284 BoundedLinearExprTest.test_geq_leq_float_rev | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:296 BoundedLinearExprTest.test_leq_geq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:308 BoundedLinearExprTest.test_leq_geq_float_rev | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:320 BoundedLinearExprTest.test_leq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:333 BoundedLinearExprTest.test_geq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:349 BoundedLinearExprErrorTest.test_ne | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:380 BoundedLinearExprErrorTest.test_eq | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:398 BoundedLinearExprErrorTest.test_float_le_expr_le_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:411 BoundedLinearExprErrorTest.test_float_ge_expr_ge_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:424 BoundedLinearExprErrorTest.test_expr_le_expr_le_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:437 BoundedLinearExprErrorTest.test_expr_ge_expr_ge_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:450 BoundedLinearExprErrorTest.test_lower_bounded_expr_leq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:469 BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:487 BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:504 BoundedLinearExprErrorTest.test_upper_bounded_expr_geq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:523 BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:541 BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:558 BoundedLinearExprErrorTest.test_bounded_expr_leq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:573 BoundedLinearExprErrorTest.test_bounded_expr_leq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:588 BoundedLinearExprErrorTest.test_bounded_expr_geq_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:603 BoundedLinearExprErrorTest.test_bounded_expr_geq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:699 BoundedQuadraticExpressionTest.test_quad_eq_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:705 BoundedQuadraticExpressionTest.test_float_eq_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:711 BoundedQuadraticExpressionTest.test_quad_eq_lin | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:719 BoundedQuadraticExpressionTest.test_lin_eq_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:727 BoundedQuadraticExpressionTest.test_quad_eq_str_raises_error | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:733 BoundedQuadraticExpressionTest.test_quad_ne_raises_error | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:739 BoundedQuadraticExpressionTest.test_quad_le_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:745 BoundedQuadraticExpressionTest.test_float_ge_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:751 BoundedQuadraticExpressionTest.test_quad_le_lin | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:759 BoundedQuadraticExpressionTest.test_lin_ge_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:767 BoundedQuadraticExpressionTest.test_quad_le_str_raises_error | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:773 BoundedQuadraticExpressionTest.test_quad_ge_float | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:779 BoundedQuadraticExpressionTest.test_float_le_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:785 BoundedQuadraticExpressionTest.test_quad_ge_lin | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:793 BoundedQuadraticExpressionTest.test_lin_le_quad | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:801 BoundedQuadraticExpressionTest.test_quad_ge_str_raises_error | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:807 BoundedQuadraticExpressionTest.test_ge_twice | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:819 BoundedQuadraticExpressionTest.test_ge_twice_fails_when_ambiguous | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:825 BoundedQuadraticExpressionTest.test_no_quad_ge_bounded_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:831 BoundedQuadraticExpressionTest.test_le_twice | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:843 BoundedQuadraticExpressionTest.test_le_twice_fails_when_ambiguous | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:849 BoundedQuadraticExpressionTest.test_no_quad_le_bounded_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:859 LinearStrAndReprTest.test_sorting_ok | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:872 LinearStrAndReprTest.test_simple_expressions | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:923 LinearStrAndReprTest.test_sum_expressions | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:952 QuadraticStrAndReprTest.test_sorting_ok | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:971 QuadraticStrAndReprTest.test_simple_expressions | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1031 QuadraticStrAndReprTest.test_sum_expressions | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1068 LinearNumberOpTestsParameters.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1095 LinearNumberOpTests.test_mult | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1152 LinearNumberOpTests.test_div | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1221 LinearNumberOpTests.test_add | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1273 LinearNumberOpTests.test_sub | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1326 QuadraticTermKey.test_var_dict | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1348 QuadraticNumberOpTestsParameters.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1376 QuadraticNumberOpTests.test_mult | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1442 QuadraticNumberOpTests.test_div | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1522 QuadraticNumberOpTests.test_add | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1583 QuadraticNumberOpTests.test_sub | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1649 LinearLinearAddSubTestParams.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1676 LinearLinearAddSubTest.test_add_and_sub | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1755 LinearQuadraticAddSubTestParams.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1795 LinearQuadraticAddSubTest.test_add_and_sub | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1960 LinearLinearMulTest.test_var_var | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1976 LinearLinearMulTest.test_term_term | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:1992 LinearLinearMulTest.test_expr_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2019 LinearLinearMulTest.test_sum_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2046 LinearLinearMulTest.test_prod_prod | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2071 LinearLinearMulTest.test_var_term | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2088 LinearLinearMulTest.test_var_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2108 LinearLinearMulTest.test_var_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2128 LinearLinearMulTest.test_var_prod | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2145 LinearLinearMulTest.test_term_expr | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2166 LinearLinearMulTest.test_term_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2187 LinearLinearMulTest.test_term_prod | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2205 LinearLinearMulTest.test_expr_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2232 LinearLinearMulTest.test_expr_prod | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2253 LinearLinearMulTest.test_sum_prod | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2277 NegateTest.test_negate_var | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2286 NegateTest.test_negate_linear_term | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2296 NegateTest.test_negate_linear_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2307 NegateTest.test_negate_linear_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2318 NegateTest.test_negate_ast_product | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2328 NegateTest.test_negate_quadratic_term | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2340 NegateTest.test_negate_quadratic_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2353 NegateTest.test_negate_quadratic_sum | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2366 NegateTest.test_negate_linear_linear_product | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2378 NegateTest.test_negate_quadratic_product | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2395 UnsupportedProductOperandTestParams.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2474 UnsupportedProductOperandTest.test_mult | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2496 UnsupportedProductOperandTest.test_div | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2521 UnsupportedAdditionOperandTestParams.test_suffix | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2549 UnsupportedAdditionOperandTest.test_add | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2585 UnsupportedAdditionOperandTest.test_sub | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2624 UnsupportedInitializationTest.test_linear_sum_not_tuple | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2630 UnsupportedInitializationTest.test_linear_sum_not_linear_in_tuple | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2638 UnsupportedInitializationTest.test_quadratic_sum_not_tuple | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2644 UnsupportedInitializationTest.test_quadratic_sum_not_linear_in_tuple | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2650 UnsupportedInitializationTest.test_linear_product_not_scalar | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2660 UnsupportedInitializationTest.test_linear_product_not_linear | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2668 UnsupportedInitializationTest.test_quadratic_product_not_scalar | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2678 UnsupportedInitializationTest.test_quadratic_product_not_quadratic | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2686 UnsupportedInitializationTest.test_linear_linear_product_first_not_linear | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2697 UnsupportedInitializationTest.test_linear_linear_product_second_not_linear | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2712 SumTest.test_sum_vars | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2726 SumTest.test_sum_linear_terms | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2740 SumTest.test_sum_quadratic_terms | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2757 SumTest.test_sum_linear_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2771 SumTest.test_sum_quadratic_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2803 SumTest.test_generator_sum_vars | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2814 SumTest.test_generator_sum_terms | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2825 SumTest.test_generator_sum_quadratic_terms | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2844 SumTest.test_generator_sum_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2855 SumTest.test_generator_quadratic_sum_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2892 AstTest.test_simple_linear_ast | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2904 AstTest.test_simple_quadratic_ast | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2926 AstTest.test_linear_sum_ast | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2947 AstTest.test_quadratic_sum_ast | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2985 LinearExpressionTest.test_init_to_zero | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2990 LinearExpressionTest.test_terms_read_only | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:2998 LinearExpressionTest.test_no_copy_of_linear_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3005 LinearExpressionTest.test_number_as_flat_linear_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3010 LinearExpressionTest.test_evaluate | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3022 QuadraticExpressionTest.test_terms_read_only | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3033 QuadraticExpressionTest.test_no_copy_of_quadratic_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3040 QuadraticExpressionTest.test_number_as_flat_quadratic_expression | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/linear_expression_test.py:3046 QuadraticExpressionTest.test_evaluate | tests/fixtures/browser-basic-src/mathopt_expression_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/mathopt_test.py:98 MathoptTest.test_imports |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:26 PrinterMessageCallbackTest.test_no_prefix |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:45 PrinterMessageCallbackTest.test_with_prefix |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:58 LogMessagesTest.test_defaults |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:63 LogMessagesTest.test_prefix |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:70 LogMessagesTest.test_warning |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:77 LogMessagesTest.test_records_path |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:93 VLogMessagesTest.test_defaults |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:98 VLogMessagesTest.test_prefix |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:105 VLogMessagesTest.test_records_path |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:116 ListMessageCallbackTest.test_empty |  |  |
| pending | ortools/math_opt/python/message_callback_test.py:124 ListMessageCallbackTest.test_not_empty |  |  |
| pending | ortools/math_opt/python/model_element_test.py:137 ModelElementTest.test_no_elements |  |  |
| pending | ortools/math_opt/python/model_element_test.py:144 ModelElementTest.test_add_element |  |  |
| pending | ortools/math_opt/python/model_element_test.py:161 ModelElementTest.test_get_invalid_element |  |  |
| pending | ortools/math_opt/python/model_element_test.py:173 ModelElementTest.test_delete_element |  |  |
| pending | ortools/math_opt/python/model_element_test.py:192 ModelElementTest.test_delete_invalid_element_error |  |  |
| pending | ortools/math_opt/python/model_element_test.py:198 ModelElementTest.test_delete_element_twice_error |  |  |
| pending | ortools/math_opt/python/model_element_test.py:205 ModelElementTest.test_delete_element_wrong_model_error |  |  |
| pending | ortools/math_opt/python/model_element_test.py:215 ModelElementTest.test_get_deleted_element_error |  |  |
| pending | ortools/math_opt/python/model_element_test.py:226 ModelElementTest.test_ensure_next_id_with_effect |  |  |
| pending | ortools/math_opt/python/model_element_test.py:250 ModelElementTest.test_ensure_next_id_no_effect |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:44 ModelSetObjectiveTest.test_maximize |  |  |
| ported | ortools/math_opt/python/model_objective_test.py:58 ModelSetObjectiveTest.test_maximize_linear_obj | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/model_objective_test.py:72 ModelSetObjectiveTest.test_maximize_linear_obj_type_error_quadratic |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:79 ModelSetObjectiveTest.test_maximize_quadratic_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:93 ModelSetObjectiveTest.test_minimize |  |  |
| ported | ortools/math_opt/python/model_objective_test.py:108 ModelSetObjectiveTest.test_minimize_linear_obj | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/model_objective_test.py:123 ModelSetObjectiveTest.test_minimize_linear_obj_type_error_quadratic |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:130 ModelSetObjectiveTest.test_minimize_quadratic_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:145 ModelSetObjectiveTest.test_set_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:159 ModelSetObjectiveTest.test_set_objective_linear_obj |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:174 ModelSetObjectiveTest.test_set_objective_linear_obj_type_error_quadratic |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:181 ModelSetObjectiveTest.test_set_objective_quadratic_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:198 ModelAuxObjTest.test_add_aux_obj_with_expr |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:209 ModelAuxObjTest.test_add_aux_obj_with_maximize |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:220 ModelAuxObjTest.test_add_aux_obj_with_minimize |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:251 ModelObjectiveExportProtoIntegrationTest.test_export_model_with_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:272 ModelObjectiveExportProtoIntegrationTest.test_export_model_update_with_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:288 ModelObjectiveExportProtoIntegrationTest.test_export_model_with_auxiliary_objective |  |  |
| pending | ortools/math_opt/python/model_objective_test.py:311 ModelObjectiveExportProtoIntegrationTest.test_export_model_update_with_aux_obj_update |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:31 ModelParametersTest.test_solution_hint_round_trip |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:45 ModelParametersTest.test_objective_parameters_empty_round_trip |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:51 ModelParametersTest.test_objective_parameters_full_round_trip |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:65 ModelParametersTest.test_model_parameters_to_proto_no_basis |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:123 ModelParametersTest.test_model_parameters_to_proto_with_basis |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:137 ModelParametersTest.test_model_parameters_to_proto_with_objective_params |  |  |
| pending | ortools/math_opt/python/model_parameters_test.py:171 ModelParametersTest.test_model_parameters_to_proto_with_lazy_constraints |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:47 ModelQuadraticConstraintTest.test_add_quadratic_constraint_expr_with_offset |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:59 ModelQuadraticConstraintTest.test_add_quadratic_constraint_expr_with_offset_unbounded |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:68 ModelQuadraticConstraintTest.test_add_quadratic_constraint_upper_bounded_expr |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:81 ModelQuadraticConstraintTest.test_add_quadratic_constraint_lower_bounded_expr |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:91 ModelQuadraticConstraintTest.test_add_quadratic_constraint_bounded_expr |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:101 ModelQuadraticConstraintTest.test_add_quadratic_no_variables_error |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:106 ModelQuadraticConstraintTest.test_add_quadratic_bad_double_inequality |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:112 ModelQuadraticConstraintTest.test_all_linear_terms |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:125 ModelQuadraticConstraintTest.test_all_quadratic_terms |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:138 ModelQuadraticConstraintTest.test_quadratic_terms_empty |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:174 ModelQuadraticConstraintExportProtoIntegrationTest.test_export_model |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:185 ModelQuadraticConstraintExportProtoIntegrationTest.test_export_model_update_add_constraint |  |  |
| pending | ortools/math_opt/python/model_quadratic_constraint_test.py:201 ModelQuadraticConstraintExportProtoIntegrationTest.test_export_model_update_delete_constraint |  |  |
| ported | ortools/math_opt/python/model_test.py:30 ModelTest.test_name | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/model_test.py:34 ModelTest.test_name_empty | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/model_test.py:38 ModelTest.test_add_and_read_variables | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/model_test.py:62 ModelTest.test_add_integer_variable | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/model_test.py:73 ModelTest.test_add_binary_variable | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/model_test.py:82 ModelTest.test_update_variable |  |  |
| pending | ortools/math_opt/python/model_test.py:92 ModelTest.test_read_deleted_variable |  |  |
| pending | ortools/math_opt/python/model_test.py:99 ModelTest.test_update_deleted_variable |  |  |
| ported | ortools/math_opt/python/model_test.py:106 ModelTest.test_add_and_read_linear_constraints | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/model_test.py:128 ModelTest.test_linear_constraint_as_bounded_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:140 ModelTest.test_update_linear_constraint |  |  |
| pending | ortools/math_opt/python/model_test.py:148 ModelTest.test_read_deleted_linear_constraint |  |  |
| pending | ortools/math_opt/python/model_test.py:155 ModelTest.test_update_deleted_linear_constraint |  |  |
| pending | ortools/math_opt/python/model_test.py:162 ModelTest.test_linear_constraint_matrix |  |  |
| pending | ortools/math_opt/python/model_test.py:217 ModelTest.test_linear_constraint_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:250 ModelTest.test_linear_constraint_bounded_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:263 ModelTest.test_linear_constraint_upper_bounded_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:276 ModelTest.test_linear_constraint_lower_bounded_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:289 ModelTest.test_linear_constraint_number_eq_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:302 ModelTest.test_linear_constraint_expression_eq_expression |  |  |
| pending | ortools/math_opt/python/model_test.py:315 ModelTest.test_linear_constraint_variable_eq_variable |  |  |
| pending | ortools/math_opt/python/model_test.py:328 ModelTest.test_linear_constraint_errors |  |  |
| pending | ortools/math_opt/python/model_test.py:402 ModelTest.test_linear_constraint_matrix_with_variable_deletion |  |  |
| pending | ortools/math_opt/python/model_test.py:429 ModelTest.test_linear_constraint_matrix_with_linear_constraint_deletion |  |  |
| pending | ortools/math_opt/python/model_test.py:456 ModelTest.test_linear_constraint_matrix_wrong_model |  |  |
| pending | ortools/math_opt/python/model_test.py:470 ModelTest.test_export |  |  |
| pending | ortools/math_opt/python/model_test.py:521 ModelTest.test_from_model_proto |  |  |
| pending | ortools/math_opt/python/model_test.py:573 ModelTest.test_update_tracker_simple |  |  |
| pending | ortools/math_opt/python/model_test.py:590 ModelTest.test_two_update_trackers |  |  |
| pending | ortools/math_opt/python/model_test.py:615 ModelTest.test_remove_tracker |  |  |
| pending | ortools/math_opt/python/model_test.py:649 WrongAttributeTest.test_variable |  |  |
| pending | ortools/math_opt/python/model_test.py:655 WrongAttributeTest.test_linear_constraint |  |  |
| pending | ortools/math_opt/python/model_test.py:661 WrongAttributeTest.test_objective |  |  |
| pending | ortools/math_opt/python/model_test.py:666 WrongAttributeTest.test_aux_objective |  |  |
| pending | ortools/math_opt/python/model_test.py:672 WrongAttributeTest.test_model |  |  |
| pending | ortools/math_opt/python/normalize_test.py:32 MathOptProtoAssertionsTest.test_removes_empty_message |  |  |
| pending | ortools/math_opt/python/normalize_test.py:41 MathOptProtoAssertionsTest.test_keeps_nonempty_message |  |  |
| pending | ortools/math_opt/python/normalize_test.py:51 MathOptProtoAssertionsTest.test_keeps_optional_scalar_at_default_message |  |  |
| pending | ortools/math_opt/python/normalize_test.py:63 MathOptProtoAssertionsTest.test_recursive_cleanup |  |  |
| pending | ortools/math_opt/python/normalize_test.py:70 MathOptProtoAssertionsTest.test_duration_no_cleanup |  |  |
| pending | ortools/math_opt/python/normalize_test.py:78 MathOptProtoAssertionsTest.test_repeated_scalar_no_cleanup |  |  |
| pending | ortools/math_opt/python/normalize_test.py:88 MathOptProtoAssertionsTest.test_reaches_into_map |  |  |
| pending | ortools/math_opt/python/normalize_test.py:98 MathOptProtoAssertionsTest.test_reaches_into_vector |  |  |
| pending | ortools/math_opt/python/normalize_test.py:108 MathOptProtoAssertionsTest.test_oneof_is_not_cleared |  |  |
| pending | ortools/math_opt/python/normalize_test.py:118 MathOptProtoAssertionsTest.test_reaches_into_oneof |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:27 NormalizedLinearInequalityTest.test_init_all_present |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:37 NormalizedLinearInequalityTest.test_init_all_missing |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:45 NormalizedLinearInequalityTest.test_init_offset_only |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:53 NormalizedLinearInequalityTest.test_init_infinite_offset_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:59 NormalizedLinearInequalityTest.test_init_expr_wrong_type_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:65 NormalizedLinearInequalityTest.test_as_normalized_inequality_from_parts |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:75 NormalizedLinearInequalityTest.test_as_normalized_inequality_from_none |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:81 NormalizedLinearInequalityTest.test_as_normalized_inequality_from_var_eq_var |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:91 NormalizedLinearInequalityTest.test_as_normalized_inequality_from_upper_bounded_expr |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:102 NormalizedLinearInequalityTest.test_as_normalized_inequality_from_lower_bounded_expr |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:113 NormalizedLinearInequalityTest.test_lb_and_bounded_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:119 NormalizedLinearInequalityTest.test_ub_and_bounded_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:125 NormalizedLinearInequalityTest.test_expr_and_bounded_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:131 NormalizedLinearInequalityTest.test_bounded_expr_bad_type_raise_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:135 NormalizedLinearInequalityTest.test_bounded_expr_inner_expr_bad_type_raise_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:156 NormalizedQuadraticInequalityTest.test_init_all_present |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:167 NormalizedQuadraticInequalityTest.test_init_all_missing |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:176 NormalizedQuadraticInequalityTest.test_init_offset_only |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:185 NormalizedQuadraticInequalityTest.test_init_infinite_offset_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:191 NormalizedQuadraticInequalityTest.test_init_expr_wrong_type_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:197 NormalizedQuadraticInequalityTest.test_as_normalized_inequality_from_parts |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:208 NormalizedQuadraticInequalityTest.test_as_normalized_inequality_from_none |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:215 NormalizedQuadraticInequalityTest.test_as_normalized_inequality_from_var_eq_var |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:226 NormalizedQuadraticInequalityTest.test_as_normalized_inequality_from_upper_bounded_expr |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:238 NormalizedQuadraticInequalityTest.test_as_normalized_inequality_from_lower_bounded_expr |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:250 NormalizedQuadraticInequalityTest.test_lb_and_boundex_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:256 NormalizedQuadraticInequalityTest.test_ub_and_boundex_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:262 NormalizedQuadraticInequalityTest.test_expr_and_boundex_expr_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:270 NormalizedQuadraticInequalityTest.test_bounded_expr_bad_type_raise_error |  |  |
| pending | ortools/math_opt/python/normalized_inequality_test.py:274 NormalizedQuadraticInequalityTest.test_bounded_expr_inner_expr_bad_type_raise_error |  |  |
| pending | ortools/math_opt/python/objectives_test.py:66 LinearObjectiveTest.test_same_model |  |  |
| ported | ortools/math_opt/python/objectives_test.py:70 LinearObjectiveTest.test_name | tests/fixtures/browser-basic-src/mathopt_model_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/objectives_test.py:74 LinearObjectiveTest.test_maximize |  |  |
| pending | ortools/math_opt/python/objectives_test.py:80 LinearObjectiveTest.test_offset |  |  |
| pending | ortools/math_opt/python/objectives_test.py:86 LinearObjectiveTest.test_priority |  |  |
| pending | ortools/math_opt/python/objectives_test.py:92 LinearObjectiveTest.test_linear_coefficients_basic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:111 LinearObjectiveTest.test_linear_coefficients_restore_to_zero |  |  |
| pending | ortools/math_opt/python/objectives_test.py:122 LinearObjectiveTest.test_clear |  |  |
| pending | ortools/math_opt/python/objectives_test.py:135 LinearObjectiveTest.test_as_linear_expression |  |  |
| pending | ortools/math_opt/python/objectives_test.py:146 LinearObjectiveTest.test_add_linear |  |  |
| pending | ortools/math_opt/python/objectives_test.py:158 LinearObjectiveTest.test_add |  |  |
| pending | ortools/math_opt/python/objectives_test.py:169 LinearObjectiveTest.test_add_linear_rejects_quadratic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:175 LinearObjectiveTest.test_set_to_linear |  |  |
| pending | ortools/math_opt/python/objectives_test.py:187 LinearObjectiveTest.test_set_to_linear_rejects_quadratic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:193 LinearObjectiveTest.test_set_to_expression |  |  |
| pending | ortools/math_opt/python/objectives_test.py:204 LinearObjectiveTest.test_get_linear_coef_of_deleted_variable |  |  |
| pending | ortools/math_opt/python/objectives_test.py:213 LinearObjectiveTest.test_set_linear_coef_of_deleted_variable |  |  |
| pending | ortools/math_opt/python/objectives_test.py:222 LinearObjectiveTest.test_get_quadratic_coef_of_deleted_variable |  |  |
| pending | ortools/math_opt/python/objectives_test.py:235 LinearObjectiveTest.test_delete_variable_terms_removed |  |  |
| pending | ortools/math_opt/python/objectives_test.py:246 LinearObjectiveTest.test_objective_wrong_model_linear |  |  |
| pending | ortools/math_opt/python/objectives_test.py:256 LinearObjectiveTest.test_objective_wrong_model_get_quadratic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:269 PrimaryObjectiveTest.test_eq |  |  |
| pending | ortools/math_opt/python/objectives_test.py:276 PrimaryObjectiveTest.test_quadratic_coefficients_basic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:302 PrimaryObjectiveTest.test_quadratic_coefficients_restore_to_zero |  |  |
| pending | ortools/math_opt/python/objectives_test.py:314 PrimaryObjectiveTest.test_clear |  |  |
| pending | ortools/math_opt/python/objectives_test.py:325 PrimaryObjectiveTest.test_as_linear_expression_fails |  |  |
| pending | ortools/math_opt/python/objectives_test.py:334 PrimaryObjectiveTest.test_as_quadratic_expression |  |  |
| pending | ortools/math_opt/python/objectives_test.py:356 PrimaryObjectiveTest.test_add_quadratic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:373 PrimaryObjectiveTest.test_add |  |  |
| pending | ortools/math_opt/python/objectives_test.py:385 PrimaryObjectiveTest.test_set_to_quadratic_expression |  |  |
| pending | ortools/math_opt/python/objectives_test.py:402 PrimaryObjectiveTest.test_set_to_expression |  |  |
| pending | ortools/math_opt/python/objectives_test.py:414 PrimaryObjectiveTest.test_set_quadratic_coef_of_deleted_variable |  |  |
| pending | ortools/math_opt/python/objectives_test.py:427 PrimaryObjectiveTest.test_delete_variable_quad_terms_removed |  |  |
| pending | ortools/math_opt/python/objectives_test.py:440 PrimaryObjectiveTest.test_objective_wrong_model_set_quadratic |  |  |
| pending | ortools/math_opt/python/objectives_test.py:453 AuxiliaryObjectiveTest.test_invalid_id_type |  |  |
| pending | ortools/math_opt/python/objectives_test.py:458 AuxiliaryObjectiveTest.test_eq |  |  |
| pending | ortools/math_opt/python/objectives_test.py:471 AuxiliaryObjectiveTest.test_id |  |  |
| pending | ortools/math_opt/python/objectives_test.py:479 AuxiliaryObjectiveTest.test_get_quadratic_coefficients_is_zero |  |  |
| pending | ortools/math_opt/python/objectives_test.py:487 AuxiliaryObjectiveTest.test_set_quadratic_coefficients_is_error |  |  |
| pending | ortools/math_opt/python/objectives_test.py:495 AuxiliaryObjectiveTest.test_as_quadratic_expression_with_linear_no_crash |  |  |
| pending | ortools/math_opt/python/objectives_test.py:508 AuxiliaryObjectiveTest.test_add_quadratic_errors |  |  |
| pending | ortools/math_opt/python/objectives_test.py:516 AuxiliaryObjectiveTest.test_add_is_error_if_quad |  |  |
| pending | ortools/math_opt/python/objectives_test.py:524 AuxiliaryObjectiveTest.test_set_to_quadratic_expression_error |  |  |
| pending | ortools/math_opt/python/objectives_test.py:532 AuxiliaryObjectiveTest.test_set_to_expression_error_when_quadratic |  |  |
| pending | ortools/math_opt/python/parameters_test.py:35 GurobiParameters.test_to_proto |  |  |
| pending | ortools/math_opt/python/parameters_test.py:50 GlpkParameters.test_to_proto |  |  |
| pending | ortools/math_opt/python/parameters_test.py:77 ProtoRoundTrip.test_solver_type_round_trip |  |  |
| pending | ortools/math_opt/python/parameters_test.py:95 ProtoRoundTrip.test_lp_algorithm_round_trip |  |  |
| pending | ortools/math_opt/python/parameters_test.py:113 ProtoRoundTrip.test_emphasis_round_trip |  |  |
| pending | ortools/math_opt/python/parameters_test.py:131 SolveParametersTest.test_common_to_proto |  |  |
| pending | ortools/math_opt/python/parameters_test.py:174 SolveParametersTest.test_to_proto_with_none |  |  |
| pending | ortools/math_opt/python/parameters_test.py:212 SolveParametersTest.test_to_proto_with_specifics |  |  |
| pending | ortools/math_opt/python/parameters_test.py:226 SolveParametersTest.test_to_proto_no_specifics |  |  |
| pending | ortools/math_opt/python/quadratic_constraints_test.py:23 QuadraticConstraintsTest.test_empty_constraint |  |  |
| pending | ortools/math_opt/python/quadratic_constraints_test.py:36 QuadraticConstraintsTest.test_full_constraint |  |  |
| pending | ortools/math_opt/python/quadratic_constraints_test.py:63 QuadraticConstraintsTest.test_eq |  |  |
| pending | ortools/math_opt/python/quadratic_constraints_test.py:75 QuadraticConstraintsTest.test_str |  |  |
| pending | ortools/math_opt/python/quadratic_constraints_test.py:81 QuadraticConstraintsTest.test_get_coefficient_variable_wrong_model |  |  |
| pending | ortools/math_opt/python/result_test.py:33 TerminationTest.test_termination_unspecified |  |  |
| pending | ortools/math_opt/python/result_test.py:40 TerminationTest.test_termination_limit_but_not_limit_reason |  |  |
| pending | ortools/math_opt/python/result_test.py:50 TerminationTest.test_termination_limit_reason_but_no_limit |  |  |
| pending | ortools/math_opt/python/result_test.py:60 TerminationTest.test_termination_ok_proto_round_trip |  |  |
| pending | ortools/math_opt/python/result_test.py:96 ParseProblemStatus.test_problem_status_round_trip |  |  |
| pending | ortools/math_opt/python/result_test.py:112 ParseProblemStatus.test_problem_status_unspecified_primal_status |  |  |
| pending | ortools/math_opt/python/result_test.py:123 ParseProblemStatus.test_problem_status_unspecified_dual_status |  |  |
| pending | ortools/math_opt/python/result_test.py:135 ParseObjectiveBounds.test_objective_bounds_round_trip |  |  |
| pending | ortools/math_opt/python/result_test.py:148 ParseSolveStats.test_problem_status_round_trip |  |  |
| pending | ortools/math_opt/python/result_test.py:170 SolveResultAuxiliaryFunctionsTest.test_solve_time |  |  |
| pending | ortools/math_opt/python/result_test.py:176 SolveResultAuxiliaryFunctionsTest.test_best_objective_bound |  |  |
| pending | ortools/math_opt/python/result_test.py:184 SolveResultAuxiliaryFunctionsTest.test_primal_solution_has_feasible |  |  |
| pending | ortools/math_opt/python/result_test.py:214 SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_feasible |  |  |
| pending | ortools/math_opt/python/result_test.py:235 SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_primal |  |  |
| pending | ortools/math_opt/python/result_test.py:256 SolveResultAuxiliaryFunctionsTest.test_primal_solution_no_solution |  |  |
| pending | ortools/math_opt/python/result_test.py:264 SolveResultAuxiliaryFunctionsTest.test_dual_solution_has_feasible |  |  |
| pending | ortools/math_opt/python/result_test.py:310 SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_feasible |  |  |
| pending | ortools/math_opt/python/result_test.py:333 SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_dual_in_best_solution |  |  |
| pending | ortools/math_opt/python/result_test.py:367 SolveResultAuxiliaryFunctionsTest.test_dual_solution_no_solution |  |  |
| pending | ortools/math_opt/python/result_test.py:375 SolveResultAuxiliaryFunctionsTest.test_primal_ray_has_ray |  |  |
| pending | ortools/math_opt/python/result_test.py:396 SolveResultAuxiliaryFunctionsTest.test_primal_ray_no_ray |  |  |
| pending | ortools/math_opt/python/result_test.py:402 SolveResultAuxiliaryFunctionsTest.test_dual_ray_has_ray |  |  |
| pending | ortools/math_opt/python/result_test.py:443 SolveResultAuxiliaryFunctionsTest.test_dual_ray_no_ray |  |  |
| pending | ortools/math_opt/python/result_test.py:451 SolveResultAuxiliaryFunctionsTest.test_basis_has_basis |  |  |
| pending | ortools/math_opt/python/result_test.py:519 SolveResultAuxiliaryFunctionsTest.test_basis_no_basis_in_best_solution |  |  |
| pending | ortools/math_opt/python/result_test.py:551 SolveResultAuxiliaryFunctionsTest.test_basis_no_solution |  |  |
| pending | ortools/math_opt/python/result_test.py:559 SolveResultAuxiliaryFunctionsTest.test_bounded |  |  |
| pending | ortools/math_opt/python/result_test.py:576 SolveResultAuxiliaryFunctionsTest.test_not_bounded_primal_infeasible |  |  |
| pending | ortools/math_opt/python/result_test.py:593 SolveResultAuxiliaryFunctionsTest.test_not_bounded_dual_infeasible |  |  |
| pending | ortools/math_opt/python/result_test.py:650 SolveResultTest.test_solve_result_gscip_output |  |  |
| pending | ortools/math_opt/python/result_test.py:669 SolveResultTest.test_solve_result_osqp_output |  |  |
| pending | ortools/math_opt/python/result_test.py:690 SolveResultTest.test_solve_result_pdlp_output |  |  |
| pending | ortools/math_opt/python/result_test.py:716 SolveResultTest.test_multiple_solver_specific_outputs_error |  |  |
| pending | ortools/math_opt/python/result_test.py:725 SolveResultTest.test_solve_result_from_proto_missing_bounds_in_termination |  |  |
| pending | ortools/math_opt/python/result_test.py:749 SolveResultTest.test_solve_result_from_proto_missing_status_in_termination |  |  |
| pending | ortools/math_opt/python/result_test.py:779 SolveResultTest.test_solve_result_from_proto_double_infeasible_multiple_rays |  |  |
| pending | ortools/math_opt/python/result_test.py:871 SolveResultTest.test_solve_result_from_feasible_multiple_solutions |  |  |
| pending | ortools/math_opt/python/result_test.py:1078 SolveResultTest.test_to_proto_round_trip |  |  |
| pending | ortools/math_opt/python/result_test.py:1150 SolveResultTest.test_solution_validation |  |  |
| pending | ortools/math_opt/python/result_test.py:1181 SolveResultTest.test_primal_ray_validation |  |  |
| pending | ortools/math_opt/python/result_test.py:1206 SolveResultTest.test_dual_ray_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:25 SolutionStatusTest.test_optional_status_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:37 ParsePrimalSolutionTest.test_empty_primal_solution_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:52 ParsePrimalSolutionTest.test_primal_solution_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:72 ParsePrimalSolutionTest.test_primal_solution_unspecified_feasibility |  |  |
| pending | ortools/math_opt/python/solution_test.py:83 ParsePrimalSolutionTest.test_id_validation_variables |  |  |
| pending | ortools/math_opt/python/solution_test.py:97 ParsePrimalSolutionTest.test_id_validation_auxiliary_objectives |  |  |
| pending | ortools/math_opt/python/solution_test.py:113 PrimalRayTest.test_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:130 PrimalRayTest.test_id_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:144 ParseDualSolutionTest.test_empty_primal_solution_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:159 ParseDualSolutionTest.test_no_obj |  |  |
| pending | ortools/math_opt/python/solution_test.py:183 ParseDualSolutionTest.test_with_obj |  |  |
| pending | ortools/math_opt/python/solution_test.py:197 ParseDualSolutionTest.test_dual_solution_unspecified_feasibility |  |  |
| pending | ortools/math_opt/python/solution_test.py:208 ParseDualSolutionTest.test_id_validation_reduced_costs |  |  |
| pending | ortools/math_opt/python/solution_test.py:222 ParseDualSolutionTest.test_id_validation_dual_values |  |  |
| pending | ortools/math_opt/python/solution_test.py:236 ParseDualSolutionTest.test_id_validation_quadratic_dual_values |  |  |
| pending | ortools/math_opt/python/solution_test.py:253 DualRayTest.test_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:279 DualRayTest.test_id_validation_reduced_costs |  |  |
| pending | ortools/math_opt/python/solution_test.py:290 DualRayTest.test_id_validation_dual_values |  |  |
| pending | ortools/math_opt/python/solution_test.py:304 BasisTest.test_empty_basis_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:315 BasisTest.test_basis_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:351 BasisTest.test_constraint_status_unspecified |  |  |
| pending | ortools/math_opt/python/solution_test.py:372 BasisTest.test_variable_status_unspecified |  |  |
| pending | ortools/math_opt/python/solution_test.py:393 BasisTest.test_basic_dual_feasibility_unspecified |  |  |
| pending | ortools/math_opt/python/solution_test.py:399 BasisTest.test_variable_id_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:414 BasisTest.test_linear_constraint_id_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:432 ParseSolutionTest.test_solution_proto_round_trip |  |  |
| pending | ortools/math_opt/python/solution_test.py:472 ParseSolutionTest.test_basis_id_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:492 ParseSolutionTest.test_primal_solution_id_validation |  |  |
| pending | ortools/math_opt/python/solution_test.py:511 ParseSolutionTest.test_dual_solution_id_validation |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:51 SolveTest.test_callback |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:88 SolveTest.test_hierarchical_objectives |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:123 SolveTest.test_quadratic_dual |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:140 SolveTest.test_quadratic_dual_filter |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:169 SolveTest.test_compute_infeasible_subsystem_infeasible |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:189 SolveTest.test_solve_valid_isv_success |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:207 SolveTest.test_solve_wrong_isv_error |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:220 SolveTest.test_incremental_solver_valid_isv_success |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:239 SolveTest.test_incremental_solver_wrong_isv_error |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:252 SolveTest.test_compute_infeasible_subsystem_valid_isv_success |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:265 SolveTest.test_compute_infeasible_subsystem_wrong_isv_error |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:278 SolveTest.test_compute_infeasible_subsystem_duplicated_names |  |  |
| pending | ortools/math_opt/python/solve_gurobi_test.py:288 SolveTest.test_compute_infeasible_subsystem_remove_names |  |  |
| ported | ortools/math_opt/python/solve_test.py:72 SolveTest.test_solve_error | tests/fixtures/browser-basic-src/mathopt_solve_result_contract.ts | Initial TS port; validation pending |
| ported | ortools/math_opt/python/solve_test.py:78 SolveTest.test_lp_solve | tests/fixtures/browser-basic-src/mathopt_solve_result_contract.ts | Initial TS port; validation pending |
| pending | ortools/math_opt/python/solve_test.py:139 SolveTest.test_indicator |  |  |
| pending | ortools/math_opt/python/solve_test.py:162 SolveTest.test_filters |  |  |
| pending | ortools/math_opt/python/solve_test.py:217 SolveTest.test_message_callback |  |  |
| pending | ortools/math_opt/python/solve_test.py:237 SolveTest.test_solve_interrupter |  |  |
| pending | ortools/math_opt/python/solve_test.py:262 SolveTest.test_solve_duplicated_names |  |  |
| pending | ortools/math_opt/python/solve_test.py:273 SolveTest.test_solve_remove_names |  |  |
| pending | ortools/math_opt/python/solve_test.py:286 SolveTest.test_incremental_solve_remove_names |  |  |
| pending | ortools/math_opt/python/solve_test.py:298 SolveTest.test_incremental_solve_init_error |  |  |
| pending | ortools/math_opt/python/solve_test.py:305 SolveTest.test_incremental_solve_error |  |  |
| pending | ortools/math_opt/python/solve_test.py:312 SolveTest.test_incremental_solve_error_on_reject |  |  |
| pending | ortools/math_opt/python/solve_test.py:342 SolveTest.test_incremental_lp |  |  |
| pending | ortools/math_opt/python/solve_test.py:376 SolveTest.test_incremental_mip |  |  |
| pending | ortools/math_opt/python/solve_test.py:416 SolveTest.test_incremental_mip_with_message_cb |  |  |
| pending | ortools/math_opt/python/solve_test.py:470 SolveTest.test_incremental_solve_interrupter |  |  |
| pending | ortools/math_opt/python/solve_test.py:497 SolveTest.test_incremental_solve_rejected |  |  |
| pending | ortools/math_opt/python/solve_test.py:542 SolveTest.test_multiple_incremental_lps |  |  |
| pending | ortools/math_opt/python/solve_test.py:568 SolveTest.test_incremental_solver_delete |  |  |
| pending | ortools/math_opt/python/solve_test.py:576 SolveTest.test_incremental_solver_close |  |  |
| pending | ortools/math_opt/python/solve_test.py:586 SolveTest.test_incremental_solver_close_twice |  |  |
| pending | ortools/math_opt/python/solve_test.py:595 SolveTest.test_incremental_solver_context_manager |  |  |
| pending | ortools/math_opt/python/solve_test.py:615 SolveTest.test_incremental_solver_context_manager_exception |  |  |
| pending | ortools/math_opt/python/solver_resources_test.py:25 SolverResourcesTest.test_to_proto_empty |  |  |
| pending | ortools/math_opt/python/solver_resources_test.py:31 SolverResourcesTest.test_to_proto_with_cpu |  |  |
| pending | ortools/math_opt/python/solver_resources_test.py:37 SolverResourcesTest.test_to_proto_with_ram |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:32 SparseDoubleVectorTest.test_to_proto_empty |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:38 SparseDoubleVectorTest.test_to_proto_vars |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:50 SparseDoubleVectorTest.test_to_proto_lin_cons |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:116 ParseVariableMapTest.test_parse_map |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:129 ParseVariableMapTest.test_parse_map_empty |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:136 ParseVariableMapTest.test_parse_var_map_bad_var |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:148 SparseInt32VectorTest.test_to_proto_empty |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:154 SparseInt32VectorTest.test_to_proto_vars |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:164 SparseInt32VectorTest.test_to_proto_lin_cons |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:176 SparseVectorFilterTest.test_is_none |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:185 SparseVectorFilterTest.test_ids_is_empty |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:194 SparseVectorFilterTest.test_ids_are_lin_cons |  |  |
| pending | ortools/math_opt/python/sparse_containers_test.py:208 SparseVectorFilterTest.test_ids_are_vars |  |  |
| pending | ortools/math_opt/python/statistics_test.py:24 RangeTest.test_merge_optional_ranges |  |  |
| pending | ortools/math_opt/python/statistics_test.py:40 RangeTest.test_absolute_finite_non_zeros_range |  |  |
| pending | ortools/math_opt/python/statistics_test.py:55 ModelRangesTest.test_printing |  |  |
| pending | ortools/math_opt/python/statistics_test.py:134 ComputeModelRangesTest.test_empty |  |  |
| pending | ortools/math_opt/python/statistics_test.py:146 ComputeModelRangesTest.test_only_zero_and_infinite_values |  |  |
| pending | ortools/math_opt/python/statistics_test.py:165 ComputeModelRangesTest.test_mixed_values |  |  |
| pending | ortools/math_opt/python/testing/compare_proto_test.py:27 MathOptProtoAssertionsTest.test_assertions_match_but_not_equal |  |  |
| pending | ortools/math_opt/python/testing/compare_proto_test.py:45 MathOptProtoAssertionsTest.test_do_not_match |  |  |
| pending | ortools/math_opt/python/testing/proto_matcher_test.py:34 MathOptProtoAssertionsTest.test_mock_eq |  |  |
| pending | ortools/math_opt/python/testing/proto_matcher_test.py:52 MathOptProtoAssertionsTest.test_mock_function_when_equal |  |  |
