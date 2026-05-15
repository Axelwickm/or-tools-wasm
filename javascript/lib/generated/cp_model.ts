/* eslint-disable @typescript-eslint/naming-convention */
/*
 * AUTO-GENERATED FILE.
 *
 * Source: ortools/sat/cp_model.proto
 * Generator: scripts/generate_sat_parameters_types.mjs
 */

export type ProtoInt64 = number | string | { low: number; high: number; unsigned?: boolean };

/**
 * The order in which the variables (resp. affine expression) above should be
 * considered. Note that only variables that are not already fixed are
 * considered.
 * TODO(user): extend as needed.
 */
export enum DecisionStrategyProto_VariableSelectionStrategy {
  CHOOSE_FIRST = 0,
  CHOOSE_LOWEST_MIN = 1,
  CHOOSE_HIGHEST_MAX = 2,
  CHOOSE_MIN_DOMAIN_SIZE = 3,
  CHOOSE_MAX_DOMAIN_SIZE = 4,
}
export type DecisionStrategyProto_VariableSelectionStrategy_Name = 'CHOOSE_FIRST' | 'CHOOSE_LOWEST_MIN' | 'CHOOSE_HIGHEST_MAX' | 'CHOOSE_MIN_DOMAIN_SIZE' | 'CHOOSE_MAX_DOMAIN_SIZE';

/**
 * Once a variable (resp. affine expression) has been chosen, this enum
 * describe what decision is taken on its domain.
 * TODO(user): extend as needed.
 */
export enum DecisionStrategyProto_DomainReductionStrategy {
  SELECT_MIN_VALUE = 0,
  SELECT_MAX_VALUE = 1,
  SELECT_LOWER_HALF = 2,
  SELECT_UPPER_HALF = 3,
  SELECT_MEDIAN_VALUE = 4,
  SELECT_RANDOM_HALF = 5,
}
export type DecisionStrategyProto_DomainReductionStrategy_Name = 'SELECT_MIN_VALUE' | 'SELECT_MAX_VALUE' | 'SELECT_LOWER_HALF' | 'SELECT_UPPER_HALF' | 'SELECT_MEDIAN_VALUE' | 'SELECT_RANDOM_HALF';

/**
 * The status returned by a solver trying to solve a CpModelProto.
 */
export enum CpSolverStatus {
  /**
   * The status of the model is still unknown. A search limit has been reached
   * before any of the statuses below could be determined.
   */
  UNKNOWN = 0,
  /**
   * The given CpModelProto didn't pass the validation step. You can get a
   * detailed error by calling ValidateCpModel(model_proto).
   */
  MODEL_INVALID = 1,
  /**
   * A feasible solution has been found. But the search was stopped before we
   * could prove optimality or before we enumerated all solutions of a
   * feasibility problem (if asked).
   */
  FEASIBLE = 2,
  /**
   * The problem has been proven infeasible.
   */
  INFEASIBLE = 3,
  /**
   * An optimal feasible solution has been found.
   * More generally, this status represent a success. So we also return OPTIMAL
   * if we find a solution for a pure feasibility problem or if a gap limit has
   * been specified and we return a solution within this limit. In the case
   * where we need to return all the feasible solution, this status will only be
   * returned if we enumerated all of them; If we stopped before, we will return
   * FEASIBLE.
   */
  OPTIMAL = 4,
}
export type CpSolverStatus_Name = 'UNKNOWN' | 'MODEL_INVALID' | 'FEASIBLE' | 'INFEASIBLE' | 'OPTIMAL';

/**
 * An integer variable.
 * It will be referred to by an int32 corresponding to its index in a
 * CpModelProto variables field.
 * Depending on the context, a reference to a variable whose domain is in [0, 1]
 * can also be seen as a Boolean that will be true if the variable value is 1
 * and false if it is 0. When used in this context, the field name will always
 * contain the word "literal".
 * Negative reference (advanced usage): to simplify the creation of a model and
 * for efficiency reasons, all the "literal" or "variable" fields can also
 * contain a negative index. A negative index i will refer to the negation of
 * the integer variable at index -i -1 or to NOT the literal at the same index.
 * Ex: A variable index 4 will refer to the integer variable model.variables(4)
 * and an index of -5 will refer to the negation of the same variable. A literal
 * index 4 will refer to the logical fact that model.variable(4) == 1 and a
 * literal index of -5 will refer to the logical fact model.variable(4) == 0.
 */
export type IntegerVariableProto = {
  /**
   * For debug/logging only. Can be empty.
   */
  name?: string;
  /**
   * The variable domain given as a sorted list of n disjoint intervals
   * [min, max] and encoded as [min_0, max_0,  ..., min_{n-1}, max_{n-1}].
   * The most common example being just [min, max].
   * If min == max, then this is a constant variable.
   * We have:
   * - domain_size() is always even.
   * - min == domain.front();
   * - max == domain.back();
   * - for all i < n   :      min_i <= max_i
   * - for all i < n-1 :  max_i + 1 < min_{i+1}.
   * Note that we check at validation that a variable domain is small enough so
   * that we don't run into integer overflow in our algorithms. Because of that,
   * you cannot just have "unbounded" variable like [0, kint64max] and should
   * try to specify tighter domains.
   */
  domain?: Array<ProtoInt64>;
};

/**
 * Argument of the constraints of the form OP(literals).
 */
export type BoolArgumentProto = {
  literals?: Array<number>;
};

/**
 * Some constraints supports linear expression instead of just using a reference
 * to a variable. This is especially useful during presolve to reduce the model
 * size.
 */
export type LinearExpressionProto = {
  vars?: Array<number>;
  coeffs?: Array<ProtoInt64>;
  offset?: ProtoInt64;
};

export type LinearArgumentProto = {
  target?: LinearExpressionProto;
  exprs?: Array<LinearExpressionProto>;
};

/**
 * All expressions must take different values.
 */
export type AllDifferentConstraintProto = {
  exprs?: Array<LinearExpressionProto>;
};

/**
 * The linear sum vars[i] * coeffs[i] must fall in the given domain. The domain
 * has the same format as the one in IntegerVariableProto.
 * Note that the validation code currently checks using the domain of the
 * involved variables that the sum can always be computed without integer
 * overflow and throws an error otherwise.
 */
export type LinearConstraintProto = {
  vars?: Array<number>;
  coeffs?: Array<ProtoInt64>;
  /**
   * Same size as vars.
   */
  domain?: Array<ProtoInt64>;
};

/**
 * The constraint linear_target = exprs[linear_index].
 * This enforces that index takes one of the value in [0, vars_size()).
 */
export type ElementConstraintProto = {
  index?: number;
  /**
   * Legacy field.
   */
  target?: number;
  /**
   * Legacy field.
   */
  vars?: Array<number>;
  /**
   * Legacy field.
   */
  linearIndex?: LinearExpressionProto;
  linearTarget?: LinearExpressionProto;
  exprs?: Array<LinearExpressionProto>;
};

/**
 * This is not really a constraint. It is there so it can be referred by other
 * constraints using this "interval" concept.
 * IMPORTANT: For now, this constraint do not enforce any relations on the
 * components, and it is up to the client to add in the model:
 * - enforcement => start + size == end.
 * - enforcement => size >= 0  // Only needed if size is not already >= 0.
 */
export type IntervalConstraintProto = {
  start?: LinearExpressionProto;
  end?: LinearExpressionProto;
  size?: LinearExpressionProto;
};

/**
 * All the intervals (index of IntervalConstraintProto) must be disjoint. More
 * formally, there must exist a sequence so that for each consecutive intervals,
 * we have end_i <= start_{i+1}. In particular, intervals of size zero do matter
 * for this constraint. This is also known as a disjunctive constraint in
 * scheduling.
 */
export type NoOverlapConstraintProto = {
  intervals?: Array<number>;
};

/**
 * The boxes defined by [start_x, end_x) * [start_y, end_y) cannot overlap.
 * Furthermore, one box is optional if at least one of the x or y interval is
 * optional.
 * Note that the case of boxes of size zero is special. The following cases
 * violate the constraint:
 * - a point box inside a box with a non zero area
 * - a line box overlapping a box with a non zero area
 * - one vertical line box crossing an horizontal line box.
 */
export type NoOverlap2DConstraintProto = {
  xIntervals?: Array<number>;
  yIntervals?: Array<number>;
};

/**
 * The sum of the demands of the intervals at each interval point cannot exceed
 * a capacity. Note that intervals are interpreted as [start, end) and as
 * such intervals like [2,3) and [3,4) do not overlap for the point of view of
 * this constraint. Moreover, intervals of size zero are ignored.
 * All demands must not contain any negative value in their domains. This is
 * checked at validation. Even if there are no intervals, this constraint
 * implicit enforces capacity >= 0. In other words, a negative capacity is
 * considered valid but always infeasible.
 */
export type CumulativeConstraintProto = {
  capacity?: LinearExpressionProto;
  intervals?: Array<number>;
  demands?: Array<LinearExpressionProto>;
};

/**
 * Maintain a reservoir level within bounds. The water level starts at 0, and at
 * any time, it must be within [min_level, max_level].
 * If the variable active_literals[i] is true, and if the expression
 * time_exprs[i] is assigned a value t, then the current level changes by
 * level_changes[i] at the time t. Therefore, at any time t:
 * sum(level_changes[i] * active_literals[i] if time_exprs[i] <= t)
 * in [min_level, max_level]
 * Note that min level must be <= 0, and the max level must be >= 0. Please use
 * fixed level_changes to simulate initial state.
 * The array of boolean variables 'actives', if defined, indicates which actions
 * are actually performed. If this array is not defined, then it is assumed that
 * all actions will be performed.
 */
export type ReservoirConstraintProto = {
  minLevel?: ProtoInt64;
  maxLevel?: ProtoInt64;
  timeExprs?: Array<LinearExpressionProto>;
  levelChanges?: Array<LinearExpressionProto>;
  activeLiterals?: Array<number>;
};

/**
 * The circuit constraint is defined on a graph where the arc presence are
 * controlled by literals. Each arc is given by an index in the
 * tails/heads/literals lists that must have the same size.
 * For now, we ignore node indices with no incident arc. All the other nodes
 * must have exactly one incoming and one outgoing selected arc (i.e. literal at
 * true). All the selected arcs that are not self-loops must form a single
 * circuit. Note that multi-arcs are allowed, but only one of them will be true
 * at the same time. Multi-self loop are disallowed though.
 */
export type CircuitConstraintProto = {
  tails?: Array<number>;
  heads?: Array<number>;
  literals?: Array<number>;
};

/**
 * A set of linear expressions associated with the nodes.
 */
export type RoutesConstraintProto_NodeExpressions = {
  /**
   * The i-th element is the linear expression associated with the i-th node.
   */
  exprs?: Array<LinearExpressionProto>;
};

/**
 * The "VRP" (Vehicle Routing Problem) constraint.
 * The direct graph where arc #i (from tails[i] to head[i]) is present iff
 * literals[i] is true must satisfy this set of properties:
 * - #incoming arcs == 1 except for node 0.
 * - #outgoing arcs == 1 except for node 0.
 * - for node zero, #incoming arcs == #outgoing arcs.
 * - There are no duplicate arcs.
 * - Self-arcs are allowed except for node 0.
 * - There is no cycle in this graph, except through node 0.
 * Note: Currently this constraint expects all the nodes in [0, num_nodes) to
 * have at least one incident arc. The model will be considered invalid if it
 * is not the case. You can add self-arc fixed to one to ignore some nodes if
 * needed.
 * TODO(user): It is probably possible to generalize this constraint to a
 * no-cycle in a general graph, or a no-cycle with sum incoming <= 1 and sum
 * outgoing <= 1 (more efficient implementation). On the other hand, having this
 * specific constraint allow us to add specific "cuts" to a VRP problem.
 */
export type RoutesConstraintProto = {
  tails?: Array<number>;
  heads?: Array<number>;
  literals?: Array<number>;
  /**
   * DEPRECATED. These fields are no longer used. The solver ignores them.
   */
  demands?: Array<number>;
  capacity?: ProtoInt64;
  /**
   * Expressions associated with the nodes of the graph, such as the load of the
   * vehicle arriving at a node, or the time at which a vehicle arrives at a
   * node. Expressions with the same "dimension" (such as "load" or "time") must
   * be listed together.
   * This field is optional. If it is set, the linear constraints of size 1 or 2
   * between the variables in these expressions will be used to derive cuts for
   * this constraint. If it is not set, the solver will try to automatically
   * derive it, from the linear constraints of size 1 or 2 in the model (this
   * can fail in complex cases).
   */
  dimensions?: Array<RoutesConstraintProto_NodeExpressions>;
};

/**
 * The values of the n-tuple formed by the given expression can only be one of
 * the listed n-tuples in values. The n-tuples are encoded in a flattened way:
 * [tuple0_v0, tuple0_v1, ..., tuple0_v{n-1}, tuple1_v0, ...].
 * Corner cases:
 * - If all `vars`, `values` and `exprs` are empty, the constraint is trivially
 * true, irrespective of the value of `negated`.
 * - If `values` is empty but either vars or exprs is not, the constraint is
 * trivially false if `negated` is false, and trivially true if `negated` is
 * true.
 * - If `vars` and `exprs` are empty but `values` is not, the model is invalid.
 */
export type TableConstraintProto = {
  vars?: Array<number>;
  /**
   * Legacy field.
   */
  values?: Array<ProtoInt64>;
  exprs?: Array<LinearExpressionProto>;
  /**
   * If true, the meaning is "negated", that is we forbid any of the given
   * tuple from a feasible assignment.
   */
  negated?: boolean;
};

/**
 * The two arrays of variable each represent a function, the second is the
 * inverse of the first: f_direct[i] == j <=> f_inverse[j] == i.
 */
export type InverseConstraintProto = {
  fDirect?: Array<number>;
  fInverse?: Array<number>;
};

/**
 * This constraint forces a sequence of expressions to be accepted by an
 * automaton.
 */
export type AutomatonConstraintProto = {
  /**
   * A state is identified by a non-negative number. It is preferable to keep
   * all the states dense in says [0, num_states). The automaton starts at
   * starting_state and must finish in any of the final states.
   */
  startingState?: ProtoInt64;
  finalStates?: Array<ProtoInt64>;
  /**
   * List of transitions (all 3 vectors have the same size). Both tail and head
   * are states, label is any variable value. No two outgoing transitions from
   * the same state can have the same label.
   */
  transitionTail?: Array<ProtoInt64>;
  transitionHead?: Array<ProtoInt64>;
  transitionLabel?: Array<ProtoInt64>;
  /**
   * Legacy field.
   */
  vars?: Array<number>;
  /**
   * The sequence of expressions. The automaton is ran for exprs_size() "steps"
   * and the value of exprs[i] corresponds to the transition label at step i.
   */
  exprs?: Array<LinearExpressionProto>;
};

/**
 * A list of variables, without any semantics.
 */
export type ListOfVariablesProto = {
  vars?: Array<number>;
};

/**
 * Next id: 31
 */
export type ConstraintProto = {
  /**
   * For debug/logging only. Can be empty.
   */
  name?: string;
  /**
   * The constraint will be enforced iff all literals listed here are true. If
   * this is empty, then the constraint will always be enforced. An enforced
   * constraint must be satisfied, and an un-enforced one will simply be
   * ignored.
   * This is also called half-reification. To have an equivalence between a
   * literal and a constraint (full reification), one must add both a constraint
   * (controlled by a literal l) and its negation (controlled by the negation of
   * l).
   * Important: as of September 2025, some constraints might be less efficient
   * with enforcement than without: circuit, routes, no_overlap, no_overlap_2d,
   * and cumulative. If performance is not great, consider using a model without
   * these constraints enforced.
   */
  enforcementLiteral?: Array<number>;
  /**
   * The bool_or constraint forces at least one literal to be true.
   */
  boolOr?: BoolArgumentProto;
  /**
   * The bool_and constraint forces all of the literals to be true.
   * This is a "redundant" constraint in the sense that this can easily be
   * encoded with many bool_or or at_most_one. It is just more space efficient
   * and handled slightly differently internally.
   */
  boolAnd?: BoolArgumentProto;
  /**
   * The at_most_one constraint enforces that no more than one literal is
   * true at the same time.
   * Note that an at most one constraint of length n could be encoded with n
   * bool_and constraint with n-1 term on the right hand side. So in a sense,
   * this constraint contribute directly to the "implication-graph" or the
   * 2-SAT part of the model.
   */
  atMostOne?: BoolArgumentProto;
  /**
   * The exactly_one constraint force exactly one literal to true and no more.
   * Anytime a bool_or (it could have been called at_least_one) is included
   * into an at_most_one, then the bool_or is actually an exactly one
   * constraint, and the extra literal in the at_most_one can be set to false.
   * So in this sense, this constraint is not really needed. it is just here
   * for a better description of the problem structure and to facilitate some
   * algorithm.
   */
  exactlyOne?: BoolArgumentProto;
  /**
   * The bool_xor constraint forces an odd number of the literals to be true.
   */
  boolXor?: BoolArgumentProto;
  /**
   * The int_div constraint forces the target to equal exprs[0] / exprs[1].
   * The division is "rounded" towards zero, so we can have for instance
   * (2 = 12 / 5) or (-3 = -10 / 3). If you only want exact integer division,
   * then you should use instead of t = a / b, the int_prod constraint
   * a = b * t.
   * If 0 belongs to the domain of exprs[1], then the model is deemed invalid.
   */
  intDiv?: LinearArgumentProto;
  /**
   * The int_mod constraint forces the target to equal exprs[0] % exprs[1].
   * The domain of exprs[1] must be strictly positive. The sign of the target
   * is the same as the sign of exprs[0].
   */
  intMod?: LinearArgumentProto;
  /**
   * The int_prod constraint forces the target to equal the product of all
   * variables. By convention, because we can just remove term equal to one,
   * the empty product forces the target to be one.
   * Note that the solver checks for potential integer overflow. So the
   * product of the maximum absolute value of all the terms (using the initial
   * domain) should fit on an int64. Otherwise the model will be declared
   * invalid.
   */
  intProd?: LinearArgumentProto;
  /**
   * The lin_max constraint forces the target to equal the maximum of all
   * linear expressions.
   * Note that this can model a minimum simply by negating all expressions.
   */
  linMax?: LinearArgumentProto;
  /**
   * The linear constraint enforces a linear inequality among the variables,
   * such as 0 <= x + 2y <= 10.
   */
  linear?: LinearConstraintProto;
  /**
   * The all_diff constraint forces all variables to take different values.
   */
  allDiff?: AllDifferentConstraintProto;
  /**
   * The element constraint forces the variable with the given index
   * to be equal to the target.
   */
  element?: ElementConstraintProto;
  /**
   * The circuit constraint takes a graph and forces the arcs present
   * (with arc presence indicated by a literal) to form a unique cycle.
   */
  circuit?: CircuitConstraintProto;
  /**
   * The routes constraint implements the vehicle routing problem.
   */
  routes?: RoutesConstraintProto;
  /**
   * The table constraint enforces what values a tuple of variables may
   * take.
   */
  table?: TableConstraintProto;
  /**
   * The automaton constraint forces a sequence of variables to be accepted
   * by an automaton.
   */
  automaton?: AutomatonConstraintProto;
  /**
   * The inverse constraint forces two arrays to be inverses of each other:
   * the values of one are the indices of the other, and vice versa.
   */
  inverse?: InverseConstraintProto;
  /**
   * The reservoir constraint forces the sum of a set of active demands
   * to always be between a specified minimum and maximum value during
   * specific times.
   */
  reservoir?: ReservoirConstraintProto;
  /**
   * Constraints on intervals.
   * The first constraint defines what an "interval" is and the other
   * constraints use references to it. All the intervals that have an
   * enforcement_literal set to false are ignored by these constraints.
   * TODO(user): Explain what happen for intervals of size zero. Some
   * constraints ignore them; others do take them into account.
   * The interval constraint takes a start, end, and size, and forces
   * start + size == end.
   */
  interval?: IntervalConstraintProto;
  /**
   * The no_overlap constraint prevents a set of intervals from
   * overlapping; in scheduling, this is called a disjunctive
   * constraint.
   */
  noOverlap?: NoOverlapConstraintProto;
  /**
   * The no_overlap_2d constraint prevents a set of boxes from overlapping.
   */
  noOverlap2d?: NoOverlap2DConstraintProto;
  /**
   * The cumulative constraint ensures that for any integer point, the sum
   * of the demands of the intervals containing that point does not exceed
   * the capacity.
   */
  cumulative?: CumulativeConstraintProto;
  /**
   * This constraint is not meant to be used and will be rejected by the
   * solver. It is meant to mark variable when testing the presolve code.
   */
  dummyConstraint?: ListOfVariablesProto;
};

/**
 * Optimization objective.
 */
export type CpObjectiveProto = {
  /**
   * The linear terms of the objective to minimize.
   * For a maximization problem, one can negate all coefficients in the
   * objective and set scaling_factor to -1.
   */
  vars?: Array<number>;
  coeffs?: Array<ProtoInt64>;
  /**
   * The displayed objective is always:
   * scaling_factor * (sum(coefficients[i] * objective_vars[i]) + offset).
   * This is needed to have a consistent objective after presolve or when
   * scaling a double problem to express it with integers.
   * Note that if scaling_factor is zero, then it is assumed to be 1, so that by
   * default these fields have no effect.
   */
  offset?: number;
  scalingFactor?: number;
  /**
   * If non-empty, only look for an objective value in the given domain.
   * Note that this does not depend on the offset or scaling factor, it is a
   * domain on the sum of the objective terms only.
   */
  domain?: Array<ProtoInt64>;
  /**
   * Internal field. Do not set. When we scale a FloatObjectiveProto to a
   * integer version, we set this to true if the scaling was exact (i.e. all
   * original coeff were integer for instance).
   * TODO(user): Put the error bounds we computed instead?
   */
  scalingWasExact?: boolean;
  /**
   * Internal fields to recover a bound on the original integer objective from
   * the presolved one. Basically, initially the integer objective fit on an
   * int64 and is in [Initial_lb, Initial_ub]. During presolve, we might change
   * the linear expression to have a new domain [Presolved_lb, Presolved_ub]
   * that will also always fit on an int64.
   * The two domain will always be linked with an affine transformation between
   * the two of the form:
   * old = (new + before_offset) * integer_scaling_factor + after_offset.
   * Note that we use both offsets to always be able to do the computation while
   * staying in the int64 domain. In particular, the after_offset will always
   * be in (-integer_scaling_factor, integer_scaling_factor).
   */
  integerBeforeOffset?: ProtoInt64;
  integerAfterOffset?: ProtoInt64;
  integerScalingFactor?: ProtoInt64;
};

/**
 * A linear floating point objective: sum coeffs[i] * vars[i] + offset.
 * Note that the variable can only still take integer value.
 */
export type FloatObjectiveProto = {
  vars?: Array<number>;
  coeffs?: Array<number>;
  offset?: number;
  /**
   * The optimization direction. The default is to minimize
   */
  maximize?: boolean;
};

/**
 * Define the strategy to follow when the solver needs to take a new decision.
 * Note that this strategy is only defined on a subset of variables.
 */
export type DecisionStrategyProto = {
  /**
   * The variables to be considered for the next decision. The order matter and
   * is always used as a tie-breaker after the variable selection strategy
   * criteria defined below.
   */
  variables?: Array<number>;
  /**
   * If this is set, then the variables field must be empty.
   * We currently only support affine expression.
   * Note that this is needed so that if a variable has an affine
   * representative, we can properly transform a DecisionStrategyProto through
   * presolve.
   */
  exprs?: Array<LinearExpressionProto>;
  variableSelectionStrategy?: DecisionStrategyProto_VariableSelectionStrategy | DecisionStrategyProto_VariableSelectionStrategy_Name;
  domainReductionStrategy?: DecisionStrategyProto_DomainReductionStrategy | DecisionStrategyProto_DomainReductionStrategy_Name;
};

/**
 * This message encodes a partial (or full) assignment of the variables of a
 * CpModelProto. The variable indices should be unique and valid variable
 * indices.
 */
export type PartialVariableAssignment = {
  vars?: Array<number>;
  values?: Array<ProtoInt64>;
};

/**
 * A permutation of integers encoded as a list of cycles, hence the "sparse"
 * format. The image of an element cycle[i] is cycle[(i + 1) % cycle_length].
 */
export type SparsePermutationProto = {
  /**
   * Each cycle is listed one after the other in the support field.
   * The size of each cycle is given (in order) in the cycle_sizes field.
   */
  support?: Array<number>;
  cycleSizes?: Array<number>;
};

/**
 * A dense matrix of numbers encoded in a flat way, row by row.
 * That is matrix[i][j] = entries[i * num_cols + j];
 */
export type DenseMatrixProto = {
  numRows?: number;
  numCols?: number;
  entries?: Array<number>;
};

/**
 * EXPERIMENTAL. For now, this is meant to be used by the solver and not filled
 * by clients.
 * Hold symmetry information about the set of feasible solutions. If we permute
 * the variable values of any feasible solution using one of the permutation
 * described here, we should always get another feasible solution.
 * We usually also enforce that the objective of the new solution is the same.
 * The group of permutations encoded here is usually computed from the encoding
 * of the model, so it is not meant to be a complete representation of the
 * feasible solution symmetries, just a valid subgroup.
 */
export type SymmetryProto = {
  /**
   * A list of variable indices permutations that leave the feasible space of
   * solution invariant. Usually, we only encode a set of generators of the
   * group.
   */
  permutations?: Array<SparsePermutationProto>;
  /**
   * An orbitope is a special symmetry structure of the solution space. If the
   * variable indices are arranged in a matrix (with no duplicates), then any
   * permutation of the columns will be a valid permutation of the feasible
   * space.
   * This arise quite often. The typical example is a graph coloring problem
   * where for each node i, you have j booleans to indicate its color. If the
   * variables color_of_i_is_j are arranged in a matrix[i][j], then any columns
   * permutations leave the problem invariant.
   */
  orbitopes?: Array<DenseMatrixProto>;
};

/**
 * A constraint programming problem.
 */
export type CpModelProto = {
  /**
   * For debug/logging only. Can be empty.
   */
  name?: string;
  /**
   * The associated Protos should be referred by their index in these fields.
   */
  variables?: Array<IntegerVariableProto>;
  constraints?: Array<ConstraintProto>;
  /**
   * The objective to minimize. Can be empty for pure decision problems.
   */
  objective?: CpObjectiveProto;
  /**
   * Advanced usage.
   * It is invalid to have both an objective and a floating point objective.
   * The objective of the model, in floating point format. The solver will
   * automatically scale this to integer during expansion and thus convert it to
   * a normal CpObjectiveProto. See the mip* parameters to control how this is
   * scaled. In most situation the precision will be good enough, but you can
   * see the logs to see what are the precision guaranteed when this is
   * converted to a fixed point representation.
   * Note that even if the precision is bad, the returned objective_value and
   * best_objective_bound will be computed correctly. So at the end of the solve
   * you can check the gap if you only want precise optimal.
   */
  floatingPointObjective?: FloatObjectiveProto;
  /**
   * Defines the strategy that the solver should follow when the
   * search_branching parameter is set to FIXED_SEARCH. Note that this strategy
   * is also used as a heuristic when we are not in fixed search.
   * Advanced Usage: if not all variables appears and the parameter
   * "instantiate_all_variables" is set to false, then the solver will not try
   * to instantiate the variables that do not appear. Thus, at the end of the
   * search, not all variables may be fixed. Currently, we will set them to
   * their lower bound in the solution.
   */
  searchStrategy?: Array<DecisionStrategyProto>;
  /**
   * Solution hint.
   * If a feasible or almost-feasible solution to the problem is already known,
   * it may be helpful to pass it to the solver so that it can be used. The
   * solver will try to use this information to create its initial feasible
   * solution.
   * Note that it may not always be faster to give a hint like this to the
   * solver. There is also no guarantee that the solver will use this hint or
   * try to return a solution "close" to this assignment in case of multiple
   * optimal solutions.
   */
  solutionHint?: PartialVariableAssignment;
  /**
   * A list of literals. The model will be solved assuming all these literals
   * are true. Compared to just fixing the domain of these literals, using this
   * mechanism is slower but allows in case the model is INFEASIBLE to get a
   * potentially small subset of them that can be used to explain the
   * infeasibility.
   * Think (IIS), except when you are only concerned by the provided
   * assumptions. This is powerful as it allows to group a set of logically
   * related constraint under only one enforcement literal which can potentially
   * give you a good and interpretable explanation for infeasiblity.
   * Such infeasibility explanation will be available in the
   * sufficient_assumptions_for_infeasibility response field.
   */
  assumptions?: Array<number>;
  /**
   * For now, this is not meant to be filled by a client writing a model, but
   * by our preprocessing step.
   * Information about the symmetries of the feasible solution space.
   * These usually leaves the objective invariant.
   */
  symmetry?: SymmetryProto;
};

/**
 * Just a message used to store dense solution.
 * This is used by the additional_solutions field.
 */
export type CpSolverSolution = {
  values?: Array<ProtoInt64>;
};

/**
 * The response returned by a solver trying to solve a CpModelProto.
 * Next id: 32
 */
export type CpSolverResponse = {
  /**
   * The status of the solve.
   */
  status?: CpSolverStatus | CpSolverStatus_Name;
  /**
   * A feasible solution to the given problem. Depending on the returned status
   * it may be optimal or just feasible. This is in one-to-one correspondence
   * with a CpModelProto::variables repeated field and list the values of all
   * the variables.
   */
  solution?: Array<ProtoInt64>;
  /**
   * Only make sense for an optimization problem. The objective value of the
   * returned solution if it is non-empty. If there is no solution, then for a
   * minimization problem, this will be an upper-bound of the objective of any
   * feasible solution, and a lower-bound for a maximization problem.
   */
  objectiveValue?: number;
  /**
   * Only make sense for an optimization problem. A proven lower-bound on the
   * objective for a minimization problem, or a proven upper-bound for a
   * maximization problem.
   */
  bestObjectiveBound?: number;
  /**
   * If the parameter fill_additional_solutions_in_response is set, then we
   * copy all the solutions from our internal solution pool here.
   * Note that the one returned in the solution field will likely appear here
   * too. Do not rely on the solutions order as it depends on our internal
   * representation (after postsolve).
   */
  additionalSolutions?: Array<CpSolverSolution>;
  /**
   * Advanced usage.
   * If the option fill_tightened_domains_in_response is set, then this field
   * will be a copy of the CpModelProto.variables where each domain has been
   * reduced using the information the solver was able to derive. Note that this
   * is only filled with the info derived during a normal search and we do not
   * have any dedicated algorithm to improve it.
   * Warning: if you didn't set keep_all_feasible_solutions_in_presolve, then
   * these domains might exclude valid feasible solution. Otherwise for a
   * feasibility problem, all feasible solution should be there.
   * Warning: For an optimization problem, these will correspond to valid bounds
   * for the problem of finding an improving solution to the best one found so
   * far. It might be better to solve a feasibility version if one just want to
   * explore the feasible region.
   */
  tightenedVariables?: Array<IntegerVariableProto>;
  /**
   * A subset of the model "assumptions" field. This will only be filled if the
   * status is INFEASIBLE. This subset of assumption will be enough to still get
   * an infeasible problem.
   * This is related to what is called the irreducible inconsistent subsystem or
   * IIS. Except one is only concerned by the provided assumptions. There is
   * also no guarantee that we return an irreducible (aka minimal subset).
   * However, this is based on SAT explanation and there is a good chance it is
   * not too large.
   * If you really want a minimal subset, a possible way to get one is by
   * changing your model to minimize the number of assumptions at false, but
   * this is likely an harder problem to solve.
   * Important: Currently, this is minimized only in single-thread and if the
   * problem is not an optimization problem, otherwise, it will always include
   * all the assumptions.
   * TODO(user): Allows for returning multiple core at once.
   */
  sufficientAssumptionsForInfeasibility?: Array<number>;
  /**
   * Contains the integer objective optimized internally. This is only filled if
   * the problem had a floating point objective, and on the final response, not
   * the ones given to callbacks.
   */
  integerObjective?: CpObjectiveProto;
  /**
   * Advanced usage.
   * A lower bound on the integer expression of the objective. This is either a
   * bound on the expression in the returned integer_objective or on the integer
   * expression of the original objective if the problem already has an integer
   * objective.
   * TODO(user): This should be renamed integer_objective_lower_bound.
   */
  innerObjectiveLowerBound?: ProtoInt64;
  /**
   * Some statistics about the solve.
   * Important: in multithread, this correspond the statistics of the first
   * subsolver. Which is usually the one with the user defined parameters. Or
   * the default-search if none are specified.
   */
  numIntegers?: ProtoInt64;
  numBooleans?: ProtoInt64;
  numFixedBooleans?: ProtoInt64;
  numConflicts?: ProtoInt64;
  numBranches?: ProtoInt64;
  numBinaryPropagations?: ProtoInt64;
  numIntegerPropagations?: ProtoInt64;
  numRestarts?: ProtoInt64;
  numLpIterations?: ProtoInt64;
  /**
   * The time counted from the beginning of the Solve() call.
   */
  wallTime?: number;
  userTime?: number;
  deterministicTime?: number;
  /**
   * The integral of log(1 + absolute_objective_gap) over time.
   */
  gapIntegral?: number;
  /**
   * Additional information about how the solution was found. It also stores
   * model or parameters errors that caused the model to be invalid.
   */
  solutionInfo?: string;
  /**
   * The solve log will be filled if the parameter log_to_response is set to
   * true.
   */
  solveLog?: string;
};
