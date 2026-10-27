# Starts database (Docker), backend API and frontend dev server, each in its own window.
# Usage: .\scripts\start.ps1 [-NoDb]
param([switch]$NoDb)
$root = Split-Path $PSScriptRoot -Parent

if (-not $NoDb) {
  docker compose -f "$root\docker-compose.yml" up -d db
  if ($LASTEXITCODE -ne 0) { throw "Could not start the database. Is Docker Desktop running? (or use -NoDb)" }
}

$env:Database__Migrate = "true"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend\src\Talab.Api'; `$env:Database__Migrate='true'; `$env:ASPNETCORE_URLS='http://localhost:5080'; dotnet run"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm install; npx ng serve --open"

Write-Host "API: http://localhost:5080/health   Web: http://localhost:4200"
