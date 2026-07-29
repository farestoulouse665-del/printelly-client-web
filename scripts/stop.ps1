$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

docker compose --profile gpu down
Write-Host "Services arrêtés. Les volumes PostgreSQL, Redis et fichiers sont conservés."
