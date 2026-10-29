# Publishes the API and RUNS THE PUBLISHED FILES in Production mode, the way IIS would, against a throw-away database.
# Proves the artifact you will deploy starts, applies its migrations, refuses unsafe settings and behaves like production.
# Default: SQL Server LocalDB. Other databases: pass -Provider and -ConnectionString for an EMPTY test database.
# Usage: .\scripts\verify-publish.ps1 [-Provider SqlServer|Postgres] [-ConnectionString "..."]
param(
  [ValidateSet("SqlServer", "Postgres")] [string]$Provider = "SqlServer",
  [string]$ConnectionString = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path $env:TEMP "talab-verify-publish-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$pub = "$work\publish"; $store = "$work\data"
$port = 5195; $base = "http://localhost:$port"
$failed = 0; $dropDb = $null

function Check($name, [scriptblock]$test) {
  try { $ok = [bool](& $test) } catch { $ok = $false; Write-Host "   $($_.Exception.Message)" -ForegroundColor DarkGray }
  Write-Host ("{0}  {1}" -f ($(if ($ok) { "PASS" } else { "FAIL" })), $name) -ForegroundColor $(if ($ok) { "Green" } else { "Red" })
  if (-not $ok) { $script:failed++ }
}
function Status($url, $method = "GET", $body = $null) {
  try { $r = Invoke-WebRequest $url -Method $method -UseBasicParsing -ContentType "application/json" -Body $body; return @{ Code = [int]$r.StatusCode; Headers = $r.Headers; Body = $r.Content } }
  catch { $r = $_.Exception.Response; if ($null -eq $r) { throw }; return @{ Code = [int]$r.StatusCode; Headers = $r.Headers; Body = "" } }
}
function Start-Api([hashtable]$settings, [string]$log) {
  foreach ($k in $settings.Keys) { Set-Item "Env:$k" $settings[$k] }
  $p = Start-Process dotnet -ArgumentList "Talab.Api.dll" -WorkingDirectory $pub -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  foreach ($k in $settings.Keys) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  return $p
}

if (-not $ConnectionString) {
  if ($Provider -ne "SqlServer") { throw "Pass -ConnectionString for Postgres (an empty test database)." }
  $dbName = "TalabVerify_$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $ConnectionString = "Server=(localdb)\MSSQLLocalDB;Database=$dbName;Trusted_Connection=True;TrustServerCertificate=True"
  $dropDb = $dbName
}

New-Item -ItemType Directory -Force $work, $store | Out-Null
$api = $null
try {
  Write-Host "Publishing to $pub ..."
  dotnet publish "$root\backend\src\Talab.Api" -c Release -o $pub --nologo -v q
  if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

  $good = @{
    ASPNETCORE_ENVIRONMENT = "Production"; ASPNETCORE_URLS = $base
    Database__Provider = $Provider; Database__Migrate = "true"; ConnectionStrings__Default = $ConnectionString
    Jwt__Key = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    Google__ClientId = "verify.apps.googleusercontent.com"; Admin__Emails__0 = "verify@example.com"
    Cors__Origins__0 = "https://talab.example.com"; App__BaseUrl = "https://talab.example.com"; Storage__Path = $store
  }

  # 1. unsafe settings must stop it, with a readable reason
  $bad = $good.Clone(); $bad.Remove("Jwt__Key"); $bad["Auth__DevLogin"] = "true"
  $p = Start-Api $bad "$work\bad.log"
  $exited = $p.WaitForExit(40000)
  $out = (Get-Content "$work\bad.log", "$work\bad.log.err" -Raw -ErrorAction SilentlyContinue) -join "`n"
  Check "Refuses to start with unsafe settings and says why" { $exited -and $p.ExitCode -ne 0 -and $out -match "cannot start" -and $out -match "Jwt:Key" -and $out -match "DevLogin" }
  if (-not $exited) { $p.Kill() }

  # 2. good settings: starts, applies migrations, is ready
  $api = Start-Api $good "$work\api.log"
  $ready = $false
  for ($i = 0; $i -lt 40 -and -not $ready; $i++) { Start-Sleep -Seconds 2; try { $ready = (Status "$base/health/ready").Code -eq 200 } catch { } }
  if (-not $ready) { Write-Host (Get-Content "$work\api.log", "$work\api.log.err" -Tail 25 -ErrorAction SilentlyContinue | Out-String) }
  Check "Starts, applies its migrations and reports ready (/health/ready)" { $ready }

  if ($ready) {
    Check "Dev sign-in does not exist in production" { (Status "$base/api/auth/dev" "POST" '{"email":"a@b.pk","name":"x"}').Code -eq 404 }
    Check "Private API data needs a login and is never cached" { $r = Status "$base/api/notifications"; $r.Code -eq 401 -and ($r.Headers["Cache-Control"] -match "no-store") }
    Check "Admin API refuses an anonymous caller" { (Status "$base/api/admin/stats").Code -eq 401 }
    Check "Live connection endpoint exists and needs a login" { (Status "$base/hubs/app/negotiate?negotiateVersion=1" "POST").Code -eq 401 }
    Check "A bad Google token is refused, not accepted" { (Status "$base/api/auth/google" "POST" '{"idToken":"bad"}').Code -eq 409 }
    Check "Sign-in is rate limited (429 after the limit)" { $codes = 1..14 | ForEach-Object { (Status "$base/api/auth/google" "POST" '{"idToken":"bad"}').Code }; $codes -contains 429 }
    Check "JSON logs in production" { (Get-Content "$work\api.log" -TotalCount 5 -ErrorAction SilentlyContinue) -match '^\{' }
  }
}
finally {
  if ($api -and -not $api.HasExited) { $api.Kill() }
  Start-Sleep -Seconds 1
  if ($dropDb -and (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    sqlcmd -S "(localdb)\MSSQLLocalDB" -Q "ALTER DATABASE [$dropDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$dropDb]" 2>$null | Out-Null
  }
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failed) { Write-Host "`n$failed check(s) failed." -ForegroundColor Red; exit 1 }
Write-Host "`nThe published build behaves like production." -ForegroundColor Green
