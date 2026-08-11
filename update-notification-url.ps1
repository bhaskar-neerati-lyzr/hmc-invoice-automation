<#
.SYNOPSIS
  Re-point the Outlook Graph subscription at a new devtunnel URL: updates
  backend/.env, deletes whatever subscription(s) currently exist, and
  creates a fresh one against the new URL.

.DESCRIPTION
  backend/.env is NOT baked into the backend image (it's in .dockerignore)
  and Compose only injects it as env vars when the container starts - so
  editing the file alone does nothing to an already-running container.
  This script always passes --notification-url explicitly to the CLI so it
  never depends on a stale value already loaded inside the container. It
  also updates the file on disk so GRAPH_NOTIFICATION_URL stays accurate
  for the next `docker compose up` and for anyone reading it directly.

.EXAMPLE
  .\update-notification-url.ps1 -TunnelUrl https://abcd1234-8000.usw2.devtunnels.ms
  .\update-notification-url.ps1 -TunnelUrl https://abcd1234-8000.usw2.devtunnels.ms/api/outlook/notify
#>
param(
    [Parameter(Mandatory)]
    [string]$TunnelUrl
)

Set-Location $PSScriptRoot

$EnvFile = "backend\.env"
if (-not (Test-Path $EnvFile)) {
    Write-Error "Missing $EnvFile"
    exit 1
}

$NotifyUrl = $TunnelUrl.TrimEnd("/")
if ($NotifyUrl -notmatch "/api/outlook/notify$") {
    $NotifyUrl = "$NotifyUrl/api/outlook/notify"
}

Write-Host "Notification URL: $NotifyUrl"

# --- 1. Keep .env in sync for future `create`/`renew` runs and as a record of truth ---
$envContent = Get-Content $EnvFile -Raw
if ($envContent -match "(?m)^GRAPH_NOTIFICATION_URL=.*$") {
    $envContent = $envContent -replace "(?m)^GRAPH_NOTIFICATION_URL=.*$", "GRAPH_NOTIFICATION_URL=$NotifyUrl"
} else {
    $envContent += "`nGRAPH_NOTIFICATION_URL=$NotifyUrl`n"
}
Set-Content -Path $EnvFile -Value $envContent -NoNewline -Encoding utf8
Write-Host "Updated $EnvFile"

# --- 2. Delete whatever subscription(s) currently exist, so stale/duplicate ---
#        registrations don't keep pointing at a dead tunnel
$existing = docker compose exec -T backend python -m outlook.subscription_cli list | ConvertFrom-Json
foreach ($sub in $existing) {
    Write-Host "Deleting stale subscription $($sub.id) ($($sub.notificationUrl))"
    docker compose exec -T backend python -m outlook.subscription_cli delete --id $sub.id
}

# --- 3. Create a fresh subscription against the new URL, passed explicitly ---
#        (never relies on the container's already-loaded env)
docker compose exec -T backend python -m outlook.subscription_cli create --notification-url $NotifyUrl
