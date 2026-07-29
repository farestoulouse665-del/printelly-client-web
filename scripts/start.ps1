param(
    [switch]$Gpu
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

if (-not (Test-Path -LiteralPath ".env")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "Fichier .env créé. Remplacez les secrets et le SHA-256 avant la production."
}
if (-not (Test-Path -LiteralPath "models/background-removal.onnx")) {
    throw "Modèle absent: models/background-removal.onnx. Consultez la section Modèle local du README."
}

docker version | Out-Null
if ($Gpu) {
    $env:RQ_QUEUE_NAME = "background-removal-gpu"
    docker compose --profile gpu up -d --build --scale worker=0
} else {
    $env:RQ_QUEUE_NAME = "background-removal"
    docker compose up -d --build
}
docker compose ps
Write-Host "TransferLab: http://localhost:8080"
