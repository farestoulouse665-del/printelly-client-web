#!/usr/bin/env sh
set -eu
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_dir"
docker compose exec api python -m app.workers.maintenance
echo "Purge des données expirées terminée; aucun volume n’a été supprimé."
