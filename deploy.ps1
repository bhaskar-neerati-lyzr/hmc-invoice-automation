<#
.SYNOPSIS
  Bring the app up/down via docker compose.

.EXAMPLE
  .\deploy.ps1
  .\deploy.ps1 -Dev
  .\deploy.ps1 -Action down
#>
param(
    [ValidateSet("up", "down", "logs")]
    [string]$Action = "up",
    [switch]$Dev
)

Set-Location $PSScriptRoot

$EnvFile = ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Error "Missing $EnvFile - copy .env.example to .env and fill it in first (and backend/.env.example to backend/.env)."
    exit 1
}

$ComposeFiles = @("-f", "docker-compose.yml")
if ($Dev) {
    $ComposeFiles += @("-f", "docker-compose.dev.yml")
}

switch ($Action) {
    "up"    { docker compose @ComposeFiles up -d --build }
    "down"  { docker compose @ComposeFiles down }
    "logs"  { docker compose @ComposeFiles logs -f }
}
