$ErrorActionPreference = 'Stop'
$repo = 'codeisafourletter/findhublogger'
$cloudDir = Join-Path $PSScriptRoot 'cloud'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$node = Join-Path $runtimeRoot 'node\bin\node.exe'
$pnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'

if (!(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath $pnpm)) {
  throw 'Codex bundled Node runtime was not found.'
}
$env:PATH = "$(Split-Path -Parent $node);$(Join-Path $runtimeRoot 'bin\override');$(Join-Path $runtimeRoot 'bin\fallback');$env:PATH"

Set-Location -LiteralPath $cloudDir
& $pnpm install
& $pnpm exec playwright install chromium
& $node (Join-Path $cloudDir 'bootstrap-auth.mjs')

$authPath = Join-Path $cloudDir 'auth-state.json'
$authState = [Convert]::ToBase64String([IO.File]::ReadAllBytes($authPath))
$authState | gh secret set AUTH_STATE_B64 --repo $repo

Write-Host 'Google session saved to GitHub. Scheduled collection is enabled.' -ForegroundColor Green
Read-Host 'Press Enter to close'
