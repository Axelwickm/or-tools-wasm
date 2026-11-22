"""Reproduce the native gap using an existing Emscripten build and Node.js. Exit 1 is expected."""
from pathlib import Path
import shlex
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
build = root / "build"
flags = (build / "CMakeFiles/routing_runtime_node.dir/flags.make").read_text()
includes = shlex.split(next(
    line.split(" = ", 1)[1] for line in flags.splitlines()
    if line.startswith("CXX_INCLUDES =")
))
link = shlex.split((build / "CMakeFiles/routing_runtime_node.dir/link.txt").read_text())
libraries = [argument for argument in link if argument.endswith(".a")]
with tempfile.TemporaryDirectory(prefix="routing-cumul-") as directory:
    output = str(Path(directory) / "probe.cjs")
    command = [
        link[0], "-DOR_PROTO_DLL=", "-O1", "-std=c++17", "-pthread",
        "-msimd128", "-fexceptions", "-sDISABLE_EXCEPTION_CATCHING=0",
        "-sALLOW_MEMORY_GROWTH=1", "-sEXIT_RUNTIME=1", "-sENVIRONMENT=node",
        "-sPTHREAD_POOL_SIZE=0", *includes,
        str(root / "tests/reproductions/routing_cumul_dependent.cc"),
        *libraries, "-o", output,
    ]
    subprocess.run(command, cwd=build, check=True)
    result = subprocess.run(["node", output])
raise SystemExit(result.returncode)
