# Deploys the backend (Web Deploy / MSDeploy) and the frontend (FTP).
# Usage: .\scripts\deploy.ps1 [-Backend] [-Frontend] [-SkipChecks] [-DryRun]      (no switch = both)
#   -DryRun  does everything except talk to your servers: builds, writes config.json, and shows what it WOULD upload and in what order.
# Settings come from scripts\deploy.config.ps1 (copy deploy.config.example.ps1; never commit it).
param([switch]$Backend, [switch]$Frontend, [switch]$SkipChecks, [switch]$DryRun)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\deploy.config.ps1"
if (-not ($Backend -or $Frontend)) { $Backend = $true; $Frontend = $true }
if ($DryRun) { Write-Host "DRY RUN: nothing will be sent to your servers." -ForegroundColor Yellow }

if (-not $SkipChecks) {
  Write-Host "== Preflight checks (use -SkipChecks to skip) =="
  & "$PSScriptRoot\preflight.ps1" -SkipFrontend:(-not $Frontend)
  if ($LASTEXITCODE -ne 0) { throw "Preflight failed. Nothing was deployed." }
}

function Wait-Ready($url) {
  Write-Host "Waiting for $url ..."
  for ($i = 1; $i -le 20; $i++) {
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10; if ($r.StatusCode -eq 200) { Write-Host "  ready: $($r.Content)"; return } }
    catch { Start-Sleep -Seconds 3 }
  }
  throw "The API did not become ready at $url. Check the server log; the previous files may need restoring."
}

if ($Backend) {
  if ($DryRun) {
    Write-Host "== Backend: publish to a temp folder (would deploy to site '$($WebDeploy.SiteName)') =="
    $tmp = Join-Path $env:TEMP "talab-dryrun-api"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    dotnet publish "$root\backend\src\Talab.Api" -c Release -o $tmp --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Backend publish failed" }
    Write-Host "Published $((Get-ChildItem $tmp -Recurse -File).Count) files to $tmp"
  }
  else {
    Write-Host "== Backend: web publish =="
    # the app is taken offline while files are replaced (no locked DLLs). Uploads and keys live in Storage__Path, outside the site folder.
    dotnet publish "$root\backend\src\Talab.Api" -c Release `
      -p:PublishProfile=Production `
      -p:WebPublishMethod=MSDeploy `
      -p:MSDeployServiceURL=$WebDeploy.ServiceUrl `
      -p:DeployIisAppPath=$WebDeploy.SiteName `
      -p:UserName=$WebDeploy.User `
      -p:Password=$WebDeploy.Password `
      -p:EnableMSDeployAppOffline=true `
      -p:AllowUntrustedCertificate=$($WebDeploy.AllowUntrustedCertificate -eq $true)
    if ($LASTEXITCODE -ne 0) { throw "Backend publish failed" }
    if ($Api.BaseUrl) { Wait-Ready ($Api.BaseUrl.TrimEnd('/') + "/health/ready") }
  }
}

if ($Frontend) {
  Write-Host "== Frontend: build =="
  Push-Location "$root\frontend"
  npm ci
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed. If it says EPERM, a running 'ng serve' or an editor is holding files in frontend
ode_modules: close it and try again." }
  npx ng build --configuration production
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Frontend build failed" }
  Pop-Location

  $src = "$root\frontend\dist\talab-web\browser"

  # the same build runs everywhere: its settings are written here, from deploy.config.ps1
  [ordered]@{
    apiUrl          = if ($Frontend_.ApiUrl) { $Frontend_.ApiUrl.TrimEnd('/') } else { "" }
    googleClientId  = $Frontend_.GoogleClientId
    tileUrl         = $Frontend_.TileUrl
    tileAttribution = $Frontend_.TileAttribution
    tileMaxZoom     = [int]$Frontend_.TileMaxZoom
  } | ConvertTo-Json | Set-Content "$src\config.json" -Encoding UTF8
  Write-Host "config.json written for $($Frontend_.ApiUrl)"

  # new script files first, then settings, then index.html LAST: visitors never get a page that points at files not uploaded yet
  $files = Get-ChildItem $src -Recurse -File -Force
  $ordered = @($files | Where-Object { $_.Name -notin 'index.html', 'config.json' }) + @($files | Where-Object { $_.Name -eq 'config.json' }) + @($files | Where-Object { $_.Name -eq 'index.html' })

  if ($DryRun) {
    Write-Host "== Frontend: would upload $($ordered.Count) files to $($Ftp.Url), in this order =="
    $show = $ordered | Select-Object -First 3
    foreach ($f in $show) { Write-Host "  1. $($f.FullName.Substring($src.Length + 1))" }
    Write-Host "  ... ($($ordered.Count - 5) more) ..."
    foreach ($f in ($ordered | Select-Object -Last 2)) { Write-Host "  last: $($f.FullName.Substring($src.Length + 1))" }
    Write-Host "config.json that would go live:"; Get-Content "$src\config.json" | ForEach-Object { Write-Host "  $_" }
    Write-Host "SPA fallback files present: web.config=$(Test-Path "$src\web.config")  .htaccess=$(Test-Path "$src\.htaccess")"
  }
  else {
    Write-Host "== Frontend: FTP upload =="
    $cred = New-Object System.Net.NetworkCredential($Ftp.User, $Ftp.Password)
    $base = $Ftp.Url.TrimEnd('/')

    function Invoke-Ftp($method, $url, $file) {
      $req = [System.Net.FtpWebRequest]::Create($url)
      $req.Method = $method; $req.Credentials = $cred; $req.UseBinary = $true; $req.EnableSsl = $Ftp.Tls
      if ($file) { $bytes = [IO.File]::ReadAllBytes($file); $req.ContentLength = $bytes.Length; $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close() }
      $req.GetResponse().Close()
    }

    Get-ChildItem $src -Recurse -Directory | ForEach-Object {
      $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
      try { Invoke-Ftp ([System.Net.WebRequestMethods+Ftp]::MakeDirectory) "$base/$rel" $null } catch { }  # exists
    }
    foreach ($f in $ordered) {
      $rel = $f.FullName.Substring($src.Length + 1).Replace('\', '/')
      Write-Host "  $rel"
      Invoke-Ftp ([System.Net.WebRequestMethods+Ftp]::UploadFile) "$base/$rel" $f.FullName
    }

    if ($Frontend_.SiteUrl) {
      $live = (Invoke-WebRequest -Uri ($Frontend_.SiteUrl.TrimEnd('/') + "/config.json") -UseBasicParsing).Content | ConvertFrom-Json
      if ($live.googleClientId -ne $Frontend_.GoogleClientId) { throw "The live config.json does not match what was uploaded. Check the FTP path." }
      Write-Host "Live site is serving the new config.json"
    }
  }
}
Write-Host $(if ($DryRun) { "Dry run finished. Nothing was sent." } else { "Done." })
