# VuelaClaim — enganchar el repo a la cuenta GitHub ismatv1512 (-ui) en un comando
# Uso:  pwsh -File scripts/link-1512.ps1
#
# PASO HUMANO (solo una vez): autenticar la cuenta. Elige UNA de las dos vías:
#   A) Navegador (recomendado):  gh auth login --hostname github.com --git-protocol https --web
#      → te da un código de 8 dígitos → lo pegas en https://github.com/login/device
#   B) Si ya tienes un PAT de ismatv1512:  $env:GH_TOKEN='<pat>'; gh auth login --with-token
#
# Este script comprueba la sesión, crea el repo y empuja main + etiqueta.
$ErrorActionPreference = 'Continue'
$user = 'ismatv1512-ui'
$repo = 'reclama261'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '== 1/4 Comprobando sesión de GitHub =='
$status = (gh auth status 2>&1 | Out-String)
if ($status -match "$user.*invalid|The token in keyring is invalid") {
  Write-Host "El token de $user está inválido. Haz el PASO HUMANO descrito arriba y vuelve a ejecutar este script."
  Write-Host '   gh auth login --hostname github.com --git-protocol https --web'
  exit 2
}

Write-Host '== 2/4 Cambiando a la cuenta y asegurando git =='
gh auth switch --user $user 2>&1 | Out-Host
gh auth setup-git 2>&1 | Out-Host

Write-Host '== 3/4 Creando repo y añadiendo remoto gh1512 =='
$exists = gh repo view "$user/$repo" 2>$null
if (-not $exists) { gh repo create "$user/$repo" --public --description 'VuelaClaim - mesa de reclamaciones aereas EU261/APPR' 2>&1 | Out-Host }
git remote remove gh1512 2>$null
git remote add gh1512 "https://github.com/$user/$repo.git"

Write-Host '== 4/4 Empujando =='
git push gh1512 main 2>&1 | Out-Host
git push gh1512 --tags 2>&1 | Out-Host
Write-Host "Listo: https://github.com/$user/$repo"
