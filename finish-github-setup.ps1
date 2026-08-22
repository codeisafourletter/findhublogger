$ErrorActionPreference = 'Stop'
$repo = 'codeisafourletter/findhublogger'
$cloudDir = Join-Path $PSScriptRoot 'cloud'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$node = Join-Path $runtimeRoot 'node\bin\node.exe'
$pnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'

function Require-Value([string]$name, [string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$name is required."
  }
  return $value.Trim()
}

function Read-SecretText([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) was not found.'
}
& gh auth status
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run gh auth login first.'
}

if (!(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath $pnpm)) {
  throw 'Codex bundled Node runtime was not found.'
}
$env:PATH = "$(Split-Path -Parent $node);$(Join-Path $runtimeRoot 'bin\override');$(Join-Path $runtimeRoot 'bin\fallback');$env:PATH"

$sheetEndpoint = $env:SHEET_ENDPOINT
if ([string]::IsNullOrWhiteSpace($sheetEndpoint)) {
  $sheetEndpoint = Read-Host 'Paste the existing SHEET_ENDPOINT URL'
}
$sheetEndpoint = Require-Value 'SHEET_ENDPOINT' $sheetEndpoint

$sheetSecret = $env:SHEET_SECRET
if ([string]::IsNullOrWhiteSpace($sheetSecret)) {
  $sheetSecret = Read-SecretText 'Enter the existing SHEET_SECRET'
}
$sheetSecret = Require-Value 'SHEET_SECRET' $sheetSecret

Set-Location -LiteralPath $cloudDir
& $pnpm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $node (Join-Path $cloudDir 'bootstrap-auth.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Google authentication bootstrap failed.' }

$authPath = Join-Path $cloudDir 'auth-state.json'
if (!(Test-Path -LiteralPath $authPath)) {
  throw 'Authentication state was not created.'
}
$authState = [Convert]::ToBase64String([IO.File]::ReadAllBytes($authPath))

$authState | gh secret set AUTH_STATE_B64 --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Failed to set AUTH_STATE_B64.' }
$sheetEndpoint | gh secret set SHEET_ENDPOINT --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Failed to set SHEET_ENDPOINT.' }
$sheetSecret | gh secret set SHEET_SECRET --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Failed to set SHEET_SECRET.' }

Write-Host 'Google session and all required GitHub secrets are configured.' -ForegroundColor Green
Read-Host 'Press Enter to close'
