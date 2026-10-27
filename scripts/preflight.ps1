# Checks everything that can be checked before a deploy. Exits non-zero if anything fails.
# Usage: .\scripts\preflight.ps1 [-SkipFrontend]
param([switch]$SkipFrontend)
$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
$results = New-Object System.Collections.Generic.List[object]

function Step($name, [scriptblock]$body) {
  Write-Host "`n== $name" -ForegroundColor Cyan
  try { $out = & $body; $ok = ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) -and ($out -ne $false) }
  catch { Write-Host $_.Exception.Message -ForegroundColor Red; $ok = $false }
  $results.Add([pscustomobject]@{ Check = $name; Passed = $ok })
  if (-not $ok) { Write-Host "FAILED: $name" -ForegroundColor Red }
}

Push-Location "$root\backend"

Step "Backend builds (Release)" { dotnet build -c Release --nologo -v q }

Step "No known vulnerable packages" {
  $scan = dotnet list package --vulnerable --include-transitive 2>&1 | Out-String
  if ($scan -match "has the following vulnerable packages") { Write-Host $scan; return $false }
  $global:LASTEXITCODE = 0
}

Step "Unit tests" { dotnet test -c Release --no-build --nologo -v q }

# the model and each provider's migrations must agree, or the first deploy would miss a change
foreach ($p in @(
    @{ Name = "Postgres";  Cs = "Host=localhost;Database=talab;Username=talab;Password=talab" },
    @{ Name = "SqlServer"; Cs = "Server=localhost;Database=Talab;Trusted_Connection=True;TrustServerCertificate=True" })) {
  Step "$($p.Name) migrations match the model" {
    $env:ASPNETCORE_ENVIRONMENT = "Development"; $env:Database__Provider = $p.Name; $env:ConnectionStrings__Default = $p.Cs
    dotnet ef migrations has-pending-model-changes -p "src/Talab.Migrations.$($p.Name)" -s src/Talab.Api --no-build --configuration Release
  }
}
Remove-Item Env:\Database__Provider, Env:\ConnectionStrings__Default -ErrorAction SilentlyContinue
Pop-Location

if (-not $SkipFrontend) {
  Push-Location "$root\frontend"
  Step "Frontend production build" { npx ng build --configuration production }
  Step "No untranslated Urdu strings" {
    if (Get-Command python -ErrorAction SilentlyContinue) { python scripts/check-i18n.py } else { Write-Host "python not found, skipped" -ForegroundColor Yellow; $global:LASTEXITCODE = 0 }
  }
  Pop-Location
}

# deploy settings, if this machine has them
$cfg = "$PSScriptRoot\deploy.config.ps1"
if (Test-Path $cfg) {
  Step "Deploy settings look sane" {
    . $cfg
    $bad = @()
    if ($WebDeploy.ServiceUrl -notmatch '^https://') { $bad += "WebDeploy.ServiceUrl should be https" }
    if ($Frontend_.ApiUrl -and $Frontend_.ApiUrl -notmatch '^https://') { $bad += "Frontend.ApiUrl should be https" }
    if (-not $Frontend_.GoogleClientId) { $bad += "Frontend.GoogleClientId is empty (nobody could sign in)" }
    if ($Frontend_.TileUrl -match 'tile\.openstreetmap\.org') { $bad += "Frontend.TileUrl is the public OpenStreetMap server (not allowed for real traffic)" }
    if ($Ftp.Password -eq '...' -or $WebDeploy.Password -eq '...') { $bad += "deploy.config.ps1 still has placeholder passwords" }
    $bad | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    $bad.Count -eq 0
  }
}

Write-Host "`n========== Preflight summary ==========" -ForegroundColor Cyan
$results | ForEach-Object { "{0}  {1}" -f ($(if ($_.Passed) { "PASS" } else { "FAIL" })), $_.Check } | ForEach-Object {
  Write-Host $_ -ForegroundColor $(if ($_ -like "PASS*") { "Green" } else { "Red" }) }
$failed = @($results | Where-Object { -not $_.Passed }).Count
if ($failed) { Write-Host "`n$failed check(s) failed. Fix them before deploying." -ForegroundColor Red; exit 1 }
Write-Host "`nAll checks passed." -ForegroundColor Green
