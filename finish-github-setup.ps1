$ErrorActionPreference = 'Stop'
$repo = 'codeisafourletter/findhublogger'
$cloudDir = Join-Path $PSScriptRoot 'cloud'

Set-Location -LiteralPath $cloudDir
npm install
npx playwright install chromium
npm run auth

$authPath = Join-Path $cloudDir 'auth-state.json'
$authState = [Convert]::ToBase64String([IO.File]::ReadAllBytes($authPath))
$authState | gh secret set AUTH_STATE_B64 --repo $repo

Write-Host 'Google session saved to GitHub. Scheduled collection is enabled.' -ForegroundColor Green
Read-Host 'Press Enter to close'
