# VuelaClaim — CI local sin cuota (Windows/PowerShell): tests + recibo hash-verificado
# Uso: pwsh -File scripts/ci.ps1 [-Soak]
param([switch]$Soak)
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

$sha = (git rev-parse --short HEAD 2>$null); if (-not $sha) { $sha = 'no-git' }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Write-Host "== VuelaClaim CI @ $sha ($stamp) =="

$out = Join-Path $env:TEMP "vuelaclaim-ci-$([guid]::NewGuid().ToString('N').Substring(0,8)).txt"
npm test 2>&1 | Tee-Object -FilePath $out | Out-Null
$rc = $LASTEXITCODE
$content = Get-Content $out -Raw

$pass = ([regex]::Matches($content, '(?m)^# pass (\d+)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1)
$fail = ([regex]::Matches($content, '(?m)^# fail (\d+)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1)
if (-not $pass) { $pass = ([regex]::Matches($content, '(?m)^✔')).Count }
if (-not $fail) { $fail = 0 }

$soakLine = ''
if ($Soak) {
  $soakLine = (node deploy/soak.mjs http://127.0.0.1:8787 4 5 2>&1 | Select-Object -Last 1)
}

$hash = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
$dir = Join-Path (Get-Location) 'data\receipts'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$receipt = Join-Path $dir ("CI-$sha-" + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '.json')
@{
  app = 'VuelaClaim'; commit = $sha; timestamp = $stamp
  passed = [int]$pass; failed = [int]$fail; exitCode = $rc
  soak = $soakLine; outputSha256 = $hash
} | ConvertTo-Json | Set-Content -Path $receipt -Encoding UTF8

Write-Host "Recibo: $receipt"
if ($rc -eq 0) { Write-Host 'CI OK' } else { Write-Host 'CI FALLO'; exit $rc }
