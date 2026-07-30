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
$backgroundProvider = "local"
$providerLine = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^\s*BACKGROUND_PROVIDER\s*=" } | Select-Object -Last 1
if ($providerLine) {
    $backgroundProvider = ($providerLine -split "=", 2)[1].Trim().ToLowerInvariant()
}
if ($backgroundProvider -eq "removebg") {
    $apiKeyLine = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^\s*REMOVEBG_API_KEY\s*=\s*\S+" } | Select-Object -Last 1
    if (-not $apiKeyLine) {
        throw "REMOVEBG_API_KEY est absente dans .env."
    }
} elseif ($backgroundProvider -eq "photoroom") {
    $apiKeyLine = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^\s*PHOTOROOM_API_KEY\s*=\s*\S+" } | Select-Object -Last 1
    if (-not $apiKeyLine) {
        throw "PHOTOROOM_API_KEY est absente dans .env."
    }
} elseif ($backgroundProvider -eq "local") {
    if (-not (Test-Path -LiteralPath "models/background-removal.onnx")) {
        throw "Modèle absent: models/background-removal.onnx. Consultez la section Modèle local du README."
    }
} else {
    throw "BACKGROUND_PROVIDER doit valoir local, removebg ou photoroom."
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
