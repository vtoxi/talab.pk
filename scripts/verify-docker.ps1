# Builds and starts the whole stack in Docker with throw-away secrets, checks it works like production, then removes it.
# This is the check that proves the images build, the Postgres migrations apply, and the containers wire together.
# Needs Docker running. Usage: .\scripts\verify-docker.ps1 [-Keep]   (-Keep leaves the stack running for you to look at)
param([switch]$Keep)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$project = "talab-verify"
$port = 18081
$envFile = "$root\.env.verify"
$failed = 0

function Check($name, [scriptblock]$test) {
  try { $ok = & $test } catch { $ok = $false; Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkGray }
  Write-Host ("{0}  {1}" -f ($(if ($ok) { "PASS" } else { "FAIL" })), $name) -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
  if (-not $ok) { $script:failed++ }
}

$dockerUp = $false
try { $null = docker info --format '{{.ServerVersion}}' 2>&1; $dockerUp = ($LASTEXITCODE -eq 0) } catch { }
if (-not $dockerUp) { Write-Host "Docker is not running (or not answering). Start or restart Docker Desktop and try again." -ForegroundColor Red; exit 2 }

@"
PUBLIC_URL=http://localhost:$port
WEB_PORT=$port
DB_PASSWORD=$([guid]::NewGuid().ToString('N'))
JWT_KEY=$([guid]::NewGuid().ToString('N'))$([guid]::NewGuid().ToString('N'))
GOOGLE_CLIENT_ID=verify-client.apps.googleusercontent.com
ADMIN_EMAIL=verify@example.com
TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
TILE_MAX_ZOOM=18
"@ | Set-Content $envFile -Encoding UTF8

try {
  Push-Location $root
  docker compose -p $project --env-file $envFile up -d --build --wait --wait-timeout 240
  if ($LASTEXITCODE -ne 0) { docker compose -p $project --env-file $envFile logs --tail 60; throw "The stack did not become healthy" }

  $base = "http://localhost:$port"
  Check "Site answers and serves the app" { (Invoke-WebRequest "$base/" -UseBasicParsing).Content -match "<app-root" }
  Check "Refreshing a deep link still opens the app (SPA fallback)" { (Invoke-WebRequest "$base/owner" -UseBasicParsing).Content -match "<app-root" }
  Check "config.json is generated from the environment" {
    $c = (Invoke-WebRequest "$base/config.json" -UseBasicParsing).Content | ConvertFrom-Json
    $c.googleClientId -eq "verify-client.apps.googleusercontent.com" -and $c.tileUrl -eq "https://tiles.example.com/{z}/{x}/{y}.png" -and $c.tileMaxZoom -eq 18
  }
  Check "config.json is never cached" { (Invoke-WebRequest "$base/config.json" -UseBasicParsing).Headers["Cache-Control"] -match "no-store" }
  Check "API and database are ready, migrations applied (/healthz)" { (Invoke-WebRequest "$base/healthz" -UseBasicParsing).Content -match "ready" }
  Check "Dev sign-in does not exist in production" {
    try { Invoke-WebRequest "$base/api/auth/dev" -Method Post -ContentType "application/json" -Body '{"email":"a@b.pk","name":"x"}' -UseBasicParsing | Out-Null; $false }
    catch { $_.Exception.Response.StatusCode.value__ -eq 404 }
  }
  Check "Private API data needs a login (401) and is not cacheable" {
    try { Invoke-WebRequest "$base/api/notifications" -UseBasicParsing | Out-Null; $false }
    catch { $r = $_.Exception.Response; $r.StatusCode.value__ -eq 401 -and ($r.Headers["Cache-Control"] -match "no-store") }
  }
  Check "Admin API refuses an anonymous caller" {
    try { Invoke-WebRequest "$base/api/admin/stats" -UseBasicParsing | Out-Null; $false } catch { $_.Exception.Response.StatusCode.value__ -eq 401 }
  }
  Check "Live connection endpoint is reachable (SignalR negotiate needs a login, so 401 is right)" {
    try { Invoke-WebRequest "$base/hubs/app/negotiate?negotiateVersion=1" -Method Post -UseBasicParsing | Out-Null; $false } catch { $_.Exception.Response.StatusCode.value__ -eq 401 }
  }
  Check "Containers run as non-root" {
    $u = docker compose -p $project --env-file $envFile exec -T api id -u
    [int]$u -ne 0
  }
}
finally {
  Pop-Location
  if (-not $Keep) {
    docker compose -p $project --env-file $envFile down -v --remove-orphans | Out-Null
    Remove-Item $envFile -ErrorAction SilentlyContinue
  } else { Write-Host "`nStack left running at http://localhost:$port (remove with: docker compose -p $project --env-file .env.verify down -v)" }
}

if ($failed) { Write-Host "`n$failed check(s) failed." -ForegroundColor Red; exit 1 }
Write-Host "`nDocker stack verified." -ForegroundColor Green
