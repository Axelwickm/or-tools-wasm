#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import subprocess
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

import ortools


HEADER = [
    "git_sha",
    "ortools_version",
    "implementation",
    "environment",
    "suite",
    "solver",
    "problem",
    "requested_threads",
    "run",
    "status",
    "objective",
    "execution_ms",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_config_path() -> Path:
    return repo_root() / "benchmarking" / "suites.json"


def git_sha() -> str:
    if os.environ.get("BENCH_GIT_SHA"):
        return os.environ["BENCH_GIT_SHA"]
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_root(),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


def deterministic_points(count: int) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    state = 0x5EED
    for _ in range(count):
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        x = state % 10000
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        y = state % 10000
        points.append((x, y))
    return points


def deterministic_value(index: int, modulus: int, offset = 1) -> int:
    return ((index * 1103515245 + 12345) & 0x7FFFFFFF) % modulus + offset


def solve_cp_sat(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    from ortools.sat.python import cp_model

    variables = int(problem["variables"])
    constraints = int(problem["constraints"])
    model = cp_model.CpModel()
    selected = [model.new_bool_var(f"x{i}") for i in range(variables)]

    for row in range(constraints):
        model.add(
            sum(
                deterministic_value(row * variables + col, 17, 1) * selected[col]
                for col in range(variables)
            )
            <= int(25 * variables / constraints)
        )

    model.maximize(
        sum(deterministic_value(index, 101, 1) * var for index, var in enumerate(selected))
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(problem.get("timeLimitSeconds", 5))
    solver.parameters.num_search_workers = threads
    status = solver.solve(model)
    objective = (
        str(solver.objective_value)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        else ""
    )
    return solver.status_name(status), objective


def solve_routing(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    del threads
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    points = deterministic_points(int(problem["size"]))
    manager = pywrapcp.RoutingIndexManager(len(points), 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        ax, ay = points[from_node]
        bx, by = points[to_node]
        return int(round(math.hypot(ax - bx, ay - by)))

    transit = routing.RegisterTransitCallback(distance)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.time_limit.FromSeconds(int(problem.get("timeLimitSeconds", 5)))

    assignment = routing.SolveWithParameters(params)
    if assignment is None:
        return "NO_SOLUTION", ""
    return "OK", str(assignment.ObjectiveValue())


def solve_mpsolver(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    from ortools.linear_solver import pywraplp

    variables = int(problem["variables"])
    constraints = int(problem["constraints"])
    solver = pywraplp.Solver.CreateSolver("SAT")
    if solver is None:
        return "UNAVAILABLE", ""
    solver.SetNumThreads(threads)
    solver.SetTimeLimit(int(float(problem.get("timeLimitSeconds", 5)) * 1000))

    x = [solver.BoolVar(f"x{i}") for i in range(variables)]
    for row in range(constraints):
        ct = solver.RowConstraint(-solver.infinity(), 25 * variables / constraints, f"c{row}")
        for col, var in enumerate(x):
            coeff = deterministic_value(row * variables + col, 17, 1)
            ct.SetCoefficient(var, coeff)

    objective = solver.Objective()
    for col, var in enumerate(x):
        objective.SetCoefficient(var, deterministic_value(col, 101, 1))
    objective.SetMaximization()

    status = solver.Solve()
    status_name = {
        pywraplp.Solver.OPTIMAL: "OPTIMAL",
        pywraplp.Solver.FEASIBLE: "FEASIBLE",
        pywraplp.Solver.INFEASIBLE: "INFEASIBLE",
        pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
        pywraplp.Solver.ABNORMAL: "ABNORMAL",
        pywraplp.Solver.NOT_SOLVED: "NOT_SOLVED",
    }.get(status, str(status))
    objective_value = objective.Value() if status in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE) else ""
    return status_name, str(objective_value)


def solve_mathopt(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    from ortools.math_opt.python import mathopt

    variables = int(problem["variables"])
    constraints = int(problem["constraints"])
    model = mathopt.Model(name=problem["problem"])
    x = [model.add_variable(lb=0.0, ub=1.0, name=f"x{i}") for i in range(variables)]

    for row in range(constraints):
        terms = []
        for col, var in enumerate(x):
            coeff = deterministic_value(row * variables + col, 13, 1) / 13.0
            terms.append(coeff * var)
        model.add_linear_constraint(sum(terms) <= variables * 0.38)

    model.maximize(sum(deterministic_value(col, 97, 1) * var for col, var in enumerate(x)))
    result = mathopt.solve(
        model,
        mathopt.SolverType.GLOP,
        params=mathopt.SolveParameters(
            time_limit=timedelta(seconds=float(problem.get("timeLimitSeconds", 5))),
            threads=threads,
        ),
    )
    return result.termination.reason.name, str(result.objective_value())


def solve_knapsack(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    del threads
    from ortools.algorithms.python import knapsack_solver

    items = int(problem["items"])
    dimensions = int(problem["dimensions"])
    values = [deterministic_value(i, 500, 50) for i in range(items)]
    weights = [
        [deterministic_value(d * items + i, 40, 1) for i in range(items)]
        for d in range(dimensions)
    ]
    capacities = [sum(weights[d]) // 3 for d in range(dimensions)]

    solver = knapsack_solver.KnapsackSolver(
        knapsack_solver.SolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
        problem["problem"],
    )
    solver.init(values, weights, capacities)
    objective = solver.solve()
    return "OPTIMAL" if solver.is_solution_optimal() else "FEASIBLE", str(objective)


def solve_max_flow(problem: dict[str, Any], threads: int) -> tuple[str, str]:
    del threads
    from ortools.graph.python import max_flow

    layers = int(problem["layers"])
    width = int(problem["width"])
    source = 0
    sink = layers * width + 1
    smf = max_flow.SimpleMaxFlow()

    tails: list[int] = []
    heads: list[int] = []
    capacities: list[int] = []

    def add_arc(tail: int, head: int, capacity: int) -> None:
        tails.append(tail)
        heads.append(head)
        capacities.append(capacity)

    for node in range(width):
        add_arc(source, 1 + node, deterministic_value(node, 60, 10))

    for layer in range(layers - 1):
        base = 1 + layer * width
        next_base = 1 + (layer + 1) * width
        for node in range(width):
            for offset in (0, 1, 5):
                head = next_base + ((node + offset) % width)
                add_arc(base + node, head, deterministic_value(layer * width * 3 + node * 3 + offset, 40, 5))

    last_base = 1 + (layers - 1) * width
    for node in range(width):
        add_arc(last_base + node, sink, deterministic_value(node + 1000, 60, 10))

    smf.add_arcs_with_capacity(tails, heads, capacities)
    status = smf.solve(source, sink)
    return status.name, str(smf.optimal_flow() if status == smf.OPTIMAL else "")


SOLVERS = {
    "cp_sat": solve_cp_sat,
    "routing": solve_routing,
    "mpsolver_sat": solve_mpsolver,
    "mathopt_glop": solve_mathopt,
    "knapsack": solve_knapsack,
    "max_flow": solve_max_flow,
}


def run_problem(problem: dict[str, Any], threads: int) -> tuple[str, str, float]:
    start = time.perf_counter()
    try:
        status, objective = SOLVERS[problem["solver"]](problem, threads)
    except Exception as error:
        status = f"ERROR: {error.__class__.__name__}: {error}"
        objective = ""
    elapsed_ms = (time.perf_counter() - start) * 1000
    return status, objective, elapsed_ms


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=default_config_path())
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=None)
    parser.add_argument("--warmup-runs", type=int, default=None)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    runs = args.runs or int(config.get("runs", 1))
    warmup_runs = args.warmup_runs if args.warmup_runs is not None else int(config.get("warmupRuns", 1))
    threads = [int(value) for value in config.get("threads", [1])]
    rows = []
    sha = git_sha()

    for problem in config["problems"]:
        for thread_count in threads:
            for _ in range(max(0, warmup_runs)):
                run_problem(problem, thread_count)
            for run_index in range(1, runs + 1):
                status, objective, elapsed_ms = run_problem(problem, thread_count)
                rows.append({
                    "git_sha": sha,
                    "ortools_version": ortools.__version__,
                    "implementation": "native-python",
                    "environment": "python-wheel",
                    "suite": problem["suite"],
                    "solver": problem["solver"],
                    "problem": problem["problem"],
                    "requested_threads": thread_count,
                    "run": run_index,
                    "status": status,
                    "objective": objective,
                    "execution_ms": f"{elapsed_ms:.3f}",
                })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
