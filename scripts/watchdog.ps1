# VuelaClaim — vigilante local: mantiene la app viva sin parar (cultura never-stop)
# Uso: pwsh -File scripts/watchdog.ps1
$ErrorActionPreference = 'Continue'
$root = Join-Path $PSScriptRoot '..'
$log = Join-Path $root 'data\watchdog.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

function Test-App {
  try {
    $r = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 5
    return $r.ok -eq $true
  } catch { return $false }
}

function Write-Log($msg) {
  Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $msg)
}

Write-Log 'watchdog iniciado'
while ($true) {
  if (-not (Test-App)) {
    Write-Log 'app caída — relanzando'
    Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 3
    if (Test-App) { Write-Log 'relanzada OK' } else { Write-Log 'relanzamiento falló, reintento en 30 s' }
  }
  Start-Sleep -Seconds 30
}
