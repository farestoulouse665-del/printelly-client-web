#!/usr/bin/env sh
set -eu
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_dir"
docker compose --profile gpu down
echo "Services arrêtés; les volumes sont conservés."
