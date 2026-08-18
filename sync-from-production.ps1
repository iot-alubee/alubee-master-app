# Copy latest web app files from Production/ (local dev) into this folder (Cloud Run).
# Run from anywhere:
#   powershell -File "cloud-run-prod\sync-from-production.ps1"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "Production"
$dst = $PSScriptRoot

if (-not (Test-Path (Join-Path $src "package.json"))) {
  throw "Production folder not found at $src"
}

Write-Host "Syncing Production -> cloud-run-prod"

function Sync-Dir($name) {
  $from = Join-Path $src $name
  $to = Join-Path $dst $name
  if (-not (Test-Path $from)) { throw "Missing $from" }
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  robocopy $from $to /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $name (exit $LASTEXITCODE)" }
}

Sync-Dir "src"
Sync-Dir "public"
if (Test-Path (Join-Path $src "scripts")) {
  Sync-Dir "scripts"
}

Copy-Item (Join-Path $src "package.json") (Join-Path $dst "package.json") -Force
Copy-Item (Join-Path $src "package-lock.json") (Join-Path $dst "package-lock.json") -Force

Write-Host "Done. Deploy from cloud-run-prod with: gcloud builds submit --config cloudbuild.yaml"
