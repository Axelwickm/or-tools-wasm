#!/usr/bin/env bash
set -euo pipefail

[[ "${GITHUB_EVENT_NAME:-}" == push && "${GITHUB_REF:-}" == refs/heads/stable ]] || {
  echo 'Only pushes to stable can publish.' >&2
  exit 1
}

version=$(node -p "require('./javascript/package.json').version")
tag="v${version}"
git fetch --no-tags origin \
  '+refs/heads/stable:refs/remotes/origin/stable' \
  "refs/tags/${tag}:refs/tags/${tag}"

commit=$(git rev-parse HEAD)
[[ "$commit" == "$(git rev-parse origin/stable)" && \
   "$commit" == "$(git rev-parse "${tag}^{commit}")" ]] || {
  echo "Publication requires ${tag} and stable to point to this commit." >&2
  exit 1
}
