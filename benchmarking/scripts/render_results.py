#!/usr/bin/env python3
"""Render benchmark CSV results into SVG charts and a README report block."""

from __future__ import annotations

import argparse
import csv
import html
import json
import statistics
from collections import defaultdict
from pathlib import Path


BENCHMARKING_DIR = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_DIR = BENCHMARKING_DIR / "results"
DEFAULT_REPORT_DIR = BENCHMARKING_DIR / "report"
DEFAULT_README = BENCHMARKING_DIR / "README.md"
SUITES_JSON = BENCHMARKING_DIR / "suites.json"

REPORT_START = "<!-- benchmark-report:start -->"
REPORT_END = "<!-- benchmark-report:end -->"

IMPLEMENTATIONS = [
    ("native-python", "Native Python"),
    ("wasm-node", "Node WASM"),
    ("wasm-deno", "Deno WASM"),
    ("wasm-bun", "Bun WASM"),
    ("web-chromium", "Chromium WASM"),
    ("web-firefox", "Firefox WASM"),
]

COLORS = {
    "native-python": "#0969da",
    "wasm-node": "#1a7f37",
    "wasm-deno": "#24292f",
    "wasm-bun": "#bf3989",
    "web-chromium": "#8250df",
    "web-firefox": "#d1242f",
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def format_ms(value: float | None) -> str:
    if value is None:
        return "-"
    if value >= 100:
        return f"{value:.1f}"
    if value >= 10:
        return f"{value:.2f}"
    return f"{value:.3f}"


def format_tick(value: float) -> str:
    if value >= 1000:
        return f"{value / 1000:g}s"
    if value >= 1:
        return f"{value:g}"
    return f"{value:.3g}"


def read_suite_order() -> tuple[dict[tuple[str, str, str], int], list[int]]:
    if not SUITES_JSON.exists():
        return {}, [1, 8]

    config = json.loads(SUITES_JSON.read_text())
    problem_order = {}
    for index, problem in enumerate(config.get("problems", [])):
        key = (problem["suite"], problem["solver"], problem["problem"])
        problem_order[key] = index
    thread_order = [int(thread) for thread in config.get("threads", [1, 8])]
    return problem_order, thread_order


def read_results(results_dir: Path) -> tuple[dict, dict, list[Path]]:
    grouped = defaultdict(lambda: defaultdict(list))
    metadata = {
        "git_shas": set(),
        "ortools_versions": defaultdict(set),
        "statuses": defaultdict(lambda: defaultdict(set)),
        "objectives": defaultdict(lambda: defaultdict(set)),
    }
    csv_files = sorted(results_dir.glob("*.csv"))

    for csv_file in csv_files:
        with csv_file.open(newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    key = (
                        row["suite"],
                        row["solver"],
                        row["problem"],
                        int(row["requested_threads"]),
                    )
                    implementation = row["implementation"]
                    execution_ms = float(row["execution_ms"])
                except (KeyError, TypeError, ValueError) as error:
                    raise ValueError(f"Invalid benchmark row in {csv_file}: {row}") from error

                grouped[key][implementation].append(execution_ms)

                git_sha = row.get("git_sha", "")
                if git_sha:
                    metadata["git_shas"].add(git_sha)

                ortools_version = row.get("ortools_version", "")
                if ortools_version:
                    metadata["ortools_versions"][implementation].add(ortools_version)

                status = row.get("status", "")
                if status:
                    metadata["statuses"][key][implementation].add(status)

                objective = row.get("objective", "")
                if objective:
                    metadata["objectives"][key][implementation].add(objective)

    medians = {
        key: {
            implementation: statistics.median(values)
            for implementation, values in implementation_values.items()
        }
        for key, implementation_values in grouped.items()
    }
    return medians, metadata, csv_files


def ordered_keys(medians: dict) -> list[tuple[str, str, str, int]]:
    problem_order, thread_order = read_suite_order()
    thread_rank = {thread: index for index, thread in enumerate(thread_order)}

    def sort_key(key: tuple[str, str, str, int]) -> tuple[int, int, str, str, str, int]:
        suite, solver, problem, threads = key
        problem_key = (suite, solver, problem)
        return (
            problem_order.get(problem_key, 10_000),
            thread_rank.get(threads, 10_000),
            suite,
            solver,
            problem,
            threads,
        )

    return sorted(medians, key=sort_key)


def present_implementations(medians: dict) -> list[tuple[str, str]]:
    present = {implementation for values in medians.values() for implementation in values}
    return [(key, label) for key, label in IMPLEMENTATIONS if key in present]


def row_label(key: tuple[str, str, str, int]) -> str:
    _suite, solver, problem, threads = key
    return f"{solver} / {problem} / requested {threads}"


def test_label(test_key: tuple[str, str, str]) -> str:
    _suite, solver, problem = test_key
    return f"{solver} / {problem}"


def group_by_test(
    keys: list[tuple[str, str, str, int]],
) -> list[tuple[tuple[str, str, str], list[tuple[str, str, str, int]]]]:
    groups: list[tuple[tuple[str, str, str], list[tuple[str, str, str, int]]]] = []
    for key in keys:
        test_key = key[:3]
        if not groups or groups[-1][0] != test_key:
            groups.append((test_key, []))
        groups[-1][1].append(key)
    return groups


def render_runtime_svg(
    medians: dict,
    keys: list[tuple[str, str, str, int]],
    output_path: Path,
) -> None:
    implementations = present_implementations(medians)
    test_groups = group_by_test(keys)
    if not any(
        medians[key].get(implementation) is not None
        for key in keys
        for implementation, _label in implementations
    ):
        output_path.write_text(empty_svg("Median Runtime", "No benchmark rows found."))
        return

    width = 1280
    left = 320
    right = 95
    top = 100
    bottom = 70
    plot_width = width - left - right
    bar_height = 12
    bar_gap = 4
    row_height = max(34, len(implementations) * (bar_height + bar_gap) + 12)
    header_height = 28
    group_gap = 8
    height = top + bottom + sum(
        header_height + len(group_keys) * row_height + group_gap
        for _test_key, group_keys in test_groups
    )

    parts = svg_header(width, height)
    parts.append(
        '<text x="24" y="34" font-size="24" font-weight="700" fill="#24292f">'
        "Median Runtime"
        "</text>"
    )
    parts.append(
        '<text x="24" y="58" font-size="13" fill="#57606a">'
        "Grouped by test. Each test is normalized to its slowest median runtime. Lower is better."
        "</text>"
    )
    parts.extend(render_legend(implementations, x=left, y=32))

    for fraction, label in [(0, "0"), (0.25, "25%"), (0.5, "50%"), (0.75, "75%"), (1, "slowest")]:
        x = left + fraction * plot_width
        parts.append(
            f'<text x="{x:.1f}" y="{height - bottom + 28}" text-anchor="middle" '
            'font-size="11" fill="#57606a">'
            f"{esc(label)}</text>"
        )

    y_cursor = top
    for group_index, (current_test_key, group_keys) in enumerate(test_groups):
        group_values = [
            value
            for key in group_keys
            for implementation, _label in implementations
            for value in [medians[key].get(implementation)]
            if value is not None and value > 0
        ]
        group_axis_max = max(group_values) if group_values else 1

        def x_for(value: float) -> float:
            return left + (value / group_axis_max) * plot_width

        group_height = header_height + len(group_keys) * row_height + group_gap
        if group_index % 2 == 1:
            parts.append(
                f'<rect x="16" y="{y_cursor - 6}" width="{width - 32}" '
                f'height="{group_height}" fill="#f6f8fa" fill-opacity="0.45" />'
            )
        parts.append(
            f'<text x="24" y="{y_cursor + 15}" font-size="13" font-weight="700" fill="#24292f">'
            f"{esc(test_label(current_test_key))}</text>"
        )
        parts.append(
            f'<text x="{width - right}" y="{y_cursor + 15}" text-anchor="end" '
            'font-size="11" fill="#57606a">'
            f"max {esc(format_ms(group_axis_max))} ms</text>"
        )
        for fraction in [0, 0.25, 0.5, 0.75, 1]:
            x = left + fraction * plot_width
            parts.append(
                f'<line x1="{x:.1f}" y1="{y_cursor + header_height - 4}" '
                f'x2="{x:.1f}" y2="{y_cursor + group_height - 4}" '
                'stroke="#d0d7de" stroke-width="1" />'
            )
        for row_index, key in enumerate(group_keys):
            y_base = y_cursor + header_height + row_index * row_height
            _suite, _solver, _problem, threads = key
            parts.append(
                f'<text x="{left - 18}" y="{y_base + 17}" text-anchor="end" '
                'font-size="12" fill="#57606a">'
                f"req {threads}</text>"
            )
            parts.append(
                f'<line x1="{left}" y1="{y_base + row_height - 2}" '
                f'x2="{width - right}" y2="{y_base + row_height - 2}" '
                'stroke="#f6f8fa" />'
            )

            for impl_index, (implementation, _label) in enumerate(implementations):
                value = medians[key].get(implementation)
                if value is None:
                    continue
                y = y_base + impl_index * (bar_height + bar_gap) + 5
                x_end = x_for(value)
                bar_width = max(0.5, x_end - left)
                color = COLORS.get(implementation, "#57606a")
                parts.append(
                    f'<rect x="{left}" y="{y}" width="{bar_width:.1f}" '
                    f'height="{bar_height}" rx="2" fill="{color}" />'
                )
                parts.append(
                    f'<text x="{x_end + 6:.1f}" y="{y + bar_height - 2}" '
                    'font-size="11" fill="#57606a">'
                    f"{esc(format_ms(value))}</text>"
                )
        parts.append(
            f'<line x1="24" y1="{y_cursor + group_height - 4}" '
            f'x2="{width - right}" y2="{y_cursor + group_height - 4}" stroke="#d8dee4" />'
        )
        y_cursor += group_height

    parts.append("</svg>\n")
    output_path.write_text("\n".join(parts))


def svg_header(width: int, height: int) -> list[str]:
    return [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img">'
        ),
        '<rect width="100%" height="100%" fill="#ffffff" />',
        '<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style>',
    ]


def render_legend(implementations: list[tuple[str, str]], x: int, y: int) -> list[str]:
    parts = []
    column_gap = 150
    row_gap = 22
    max_columns = 6
    for index, (implementation, label) in enumerate(implementations):
        cursor = x + (index % max_columns) * column_gap
        row_y = y + (index // max_columns) * row_gap
        color = COLORS.get(implementation, "#57606a")
        parts.append(
            f'<rect x="{cursor}" y="{row_y - 10}" width="12" height="12" rx="2" fill="{color}" />'
        )
        parts.append(
            f'<text x="{cursor + 18}" y="{row_y}" font-size="12" fill="#24292f">'
            f"{esc(label)}</text>"
        )
    return parts


def empty_svg(title: str, message: str) -> str:
    return "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220" '
            'viewBox="0 0 900 220" role="img">',
            '<rect width="100%" height="100%" fill="#ffffff" />',
            '<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}</style>',
            f'<text x="24" y="42" font-size="24" font-weight="700" fill="#24292f">{esc(title)}</text>',
            f'<text x="24" y="78" font-size="14" fill="#57606a">{esc(message)}</text>',
            "</svg>\n",
        ]
    )


def build_markdown_table(medians: dict, keys: list[tuple[str, str, str, int]]) -> str:
    implementations = present_implementations(medians)
    table = [
        "| "
        + " | ".join(
            [
                "Suite",
                "Solver",
                "Problem",
                "Requested threads",
                *[f"{label} ms" for _implementation, label in implementations],
            ]
        )
        + " |",
        "| "
        + " | ".join(
            [
                "---",
                "---",
                "---",
                "---:",
                *(["---:"] * len(implementations)),
            ]
        )
        + " |",
    ]
    for key in keys:
        suite, solver, problem, threads = key
        table.append(
            "| "
            + " | ".join(
                [
                    suite,
                    solver,
                    problem,
                    str(threads),
                    *[format_ms(medians[key].get(implementation)) for implementation, _label in implementations],
                ]
            )
            + " |"
        )
    return "\n".join(table)


def metadata_line(metadata: dict, csv_files: list[Path]) -> str:
    csv_names = ", ".join(f"`{path.name}`" for path in csv_files) if csv_files else "no CSV files"
    git_shas = sorted(metadata["git_shas"])
    git_text = ", ".join(f"`{sha}`" for sha in git_shas) if git_shas else "`unknown`"
    version_parts = []
    present_versions = metadata["ortools_versions"]
    for implementation, label in IMPLEMENTATIONS:
        if implementation not in present_versions:
            continue
        versions = sorted(present_versions[implementation])
        version_text = ", ".join(f"`{version}`" for version in versions)
        version_parts.append(f"{label} {version_text}")
    return (
        f"Source CSVs: {csv_names}. Git SHA: {git_text}. "
        f"OR-Tools versions: {'; '.join(version_parts)}."
    )


def build_report_section(medians: dict, metadata: dict, csv_files: list[Path]) -> str:
    keys = ordered_keys(medians)
    table = build_markdown_table(medians, keys) if keys else "_No benchmark rows found._"
    return "\n".join(
        [
            "## Latest Results",
            "",
            "Generated by `python3 benchmarking/scripts/render_results.py` from `benchmarking/results/*.csv`.",
            "Values are medians across recorded runs after the unrecorded warmup solve.",
            "",
            metadata_line(metadata, csv_files),
            "",
            "![Median benchmark runtime](report/median-runtime.svg)",
            "",
            table,
        ]
    )


def update_readme(readme_path: Path, section: str) -> None:
    block = f"{REPORT_START}\n{section}\n{REPORT_END}"
    content = readme_path.read_text()
    if REPORT_START in content and REPORT_END in content:
        before, rest = content.split(REPORT_START, 1)
        _old, after = rest.split(REPORT_END, 1)
        readme_path.write_text(before + block + after)
        return

    csv_header = "\n## CSV\n"
    if csv_header in content:
        readme_path.write_text(content.replace(csv_header, f"\n{block}\n{csv_header}", 1))
        return

    readme_path.write_text(content.rstrip() + "\n\n" + block + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--readme", type=Path, default=DEFAULT_README)
    parser.add_argument("--no-readme", action="store_true", help="Only write graph assets.")
    args = parser.parse_args()

    medians, metadata, csv_files = read_results(args.results_dir)
    keys = ordered_keys(medians)

    args.report_dir.mkdir(parents=True, exist_ok=True)
    render_runtime_svg(medians, keys, args.report_dir / "median-runtime.svg")

    if not args.no_readme:
        update_readme(args.readme, build_report_section(medians, metadata, csv_files))

    print(f"Wrote {args.report_dir / 'median-runtime.svg'}")
    if not args.no_readme:
        print(f"Updated {args.readme}")


if __name__ == "__main__":
    main()
