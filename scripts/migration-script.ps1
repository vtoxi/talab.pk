# Writes an idempotent SQL script (safe to run on any database, new or old) for each provider into artifacts/.
# Use it when the app is not allowed to change its own schema (Database:Migrate = false): give the file to your DBA, or run it with sqlcmd / psql.
# Usage: .\scripts\migration-script.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = "$root\artifacts"
New-Item -ItemType Directory -Force $out | Out-Null
Push-Location "$root\backend"
dotnet build -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build failed" }

$env:ASPNETCORE_ENVIRONMENT = "Development"
foreach ($p in "Postgres", "SqlServer") {
  $env:Database__Provider = $p
  $env:ConnectionStrings__Default = if ($p -eq "Postgres") { "Host=localhost;Database=talab;Username=talab;Password=talab" } else { "Server=localhost;Database=Talab;Trusted_Connection=True;TrustServerCertificate=True" }
  dotnet ef migrations script --idempotent -p "src/Talab.Migrations.$p" -s src/Talab.Api --no-build --configuration Release -o "$out\migrate-$($p.ToLower()).sql"
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Script for $p failed" }
  Write-Host "wrote $out\migrate-$($p.ToLower()).sql"
}
Pop-Location
