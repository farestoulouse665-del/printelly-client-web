#!/usr/bin/env sh
set -eu
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_dir"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env créé; remplacez les secrets avant la production."
fi
BACKGROUND_PROVIDER_VALUE="$(grep -E '^[[:space:]]*BACKGROUND_PROVIDER[[:space:]]*=' .env | tail -n 1 | cut -d= -f2- | tr -d '[:space:]' || true)"
BACKGROUND_PROVIDER_VALUE="${BACKGROUND_PROVIDER_VALUE:-local}"
if [ "$BACKGROUND_PROVIDER_VALUE" = "removebg" ]; then
  if ! grep -Eq '^[[:space:]]*REMOVEBG_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+' .env; then
    echo "REMOVEBG_API_KEY est absente dans .env." >&2
    exit 1
  fi
elif [ ! -f models/background-removal.onnx ]; then
  echo "Modèle absent: models/background-removal.onnx" >&2
  exit 1
fi
docker compose up -d --build
docker compose ps
echo "TransferLab: http://localhost:8080"
