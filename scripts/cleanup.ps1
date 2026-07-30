$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

docker compose exec api python -m app.workers.maintenance
Write-Host "Purge logique et fichiers expirés terminée. Aucun volume Docker n’a été supprimé."
