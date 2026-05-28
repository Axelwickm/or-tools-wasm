FROM python:3.12-slim

WORKDIR /bench

COPY Version.txt /repo/Version.txt
COPY benchmarking /bench/benchmarking

RUN set -eux; \
  major="$(sed -n 's/^OR_TOOLS_MAJOR=//p' /repo/Version.txt)"; \
  minor="$(sed -n 's/^OR_TOOLS_MINOR=//p' /repo/Version.txt)"; \
  pip install --no-cache-dir "ortools==${major}.${minor}.*"

ENTRYPOINT ["python", "/bench/benchmarking/runners/python/run.py"]
