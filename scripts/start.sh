#!/usr/bin/env sh
set -eu
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_dir"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env créé; remplacez les secrets avant la production."
fi
if [ ! -f models/background-removal.onnx ]; then
  echo "Modèle absent: models/background-removal.onnx" >&2
  exit 1
fi
docker compose up -d --build
docker compose ps
echo "PRINTELLY Background Studio: http://localhost:8080"
