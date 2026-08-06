<#
.SYNOPSIS
  Bring the app up/down via docker compose, translating the ENABLE_UI_FLAG
  flag in .env into Compose's --profile ui (see docker-compose.yml's
  frontend service, which only starts when that profile is active).

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

$EnableUiLine = Get-Content $EnvFile | Where-Object { $_ -match '^ENABLE_UI_FLAG=' } | Select-Object -Last 1
$EnableUi = "false"
if ($EnableUiLine) {
    $EnableUi = ($EnableUiLine -split "=", 2)[1].Trim()
}

$ComposeFiles = @("-f", "docker-compose.yml")
if ($Dev) {
    $ComposeFiles += @("-f", "docker-compose.dev.yml")
}

$ProfileArgs = @()
if ($EnableUi -eq "true") {
    $ProfileArgs = @("--profile", "ui")
}

switch ($Action) {
    "up"    { docker compose @ComposeFiles @ProfileArgs up -d --build }
    "down"  { docker compose @ComposeFiles @ProfileArgs down }
    "logs"  { docker compose @ComposeFiles @ProfileArgs logs -f }
}
