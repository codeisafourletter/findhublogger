$ErrorActionPreference = 'Stop'
$repo = 'codeisafourletter/findhublogger'
$cloudDir = Join-Path $PSScriptRoot 'cloud'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this setup from an Administrator PowerShell session on the persistent cloud Windows VM.'
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"
}

function Ensure-Chrome {
  $paths = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  if ($paths.Count -gt 0) { return }

  Write-Host 'Installing Google Chrome...'
  $msi = Join-Path $env:TEMP 'google-chrome-enterprise-x64.msi'
  Invoke-WebRequest -Uri 'https://dl.google.com/chrome/install/GoogleChromeStandaloneEnterprise64.msi' -OutFile $msi
  $process = Start-Process msiexec.exe -ArgumentList @('/i', $msi, '/qn', '/norestart') -Wait -PassThru
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) { throw "Chrome installation failed with exit code $($process.ExitCode)." }
}

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $major = [int]((& node --version).Trim().TrimStart('v').Split('.')[0])
    if ($major -ge 22) { return }
  }

  Write-Host 'Installing Node.js 22...'
  $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
  $version = ($releases | Where-Object { $_.version -match '^v22\.' } | Select-Object -First 1).version
  if (!$version) { throw 'Could not determine the latest Node.js 22 release.' }
  $msi = Join-Path $env:TEMP "node-$version-x64.msi"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/node-$version-x64.msi" -OutFile $msi
  $process = Start-Process msiexec.exe -ArgumentList @('/i', $msi, '/qn', '/norestart') -Wait -PassThru
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) { throw "Node.js installation failed with exit code $($process.ExitCode)." }
  Refresh-Path
}

function Ensure-GitHubCli {
  if (Get-Command gh -ErrorAction SilentlyContinue) { return }

  Write-Host 'Installing GitHub CLI...'
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/cli/cli/releases/latest' -Headers @{ 'User-Agent' = 'findhublogger-setup' }
  $asset = $release.assets | Where-Object { $_.name -match '^gh_.*_windows_amd64\.msi$' } | Select-Object -First 1
  if (!$asset) { throw 'Could not locate the current GitHub CLI Windows installer.' }
  $msi = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msi -Headers @{ 'User-Agent' = 'findhublogger-setup' }
  $process = Start-Process msiexec.exe -ArgumentList @('/i', $msi, '/qn', '/norestart') -Wait -PassThru
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
  if ($process.ExitCode -ne 0) { throw "GitHub CLI installation failed with exit code $($process.ExitCode)." }
  Refresh-Path
}

Ensure-Chrome
Ensure-Node
Ensure-GitHubCli

& gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Authenticate GitHub CLI for runner registration...'
  & gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication failed.' }
}

Set-Location -LiteralPath $cloudDir
& npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host 'A Chrome window will open on this cloud VM for the one-time Find Hub sign-in.' -ForegroundColor Yellow
Write-Host 'Complete the Google login in that RDP session and make sure Meme is visible before returning to PowerShell.' -ForegroundColor Yellow
& node (Join-Path $cloudDir 'bootstrap-auth.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Find Hub authentication bootstrap failed.' }

$runnerSetup = Join-Path $PSScriptRoot 'setup-self-hosted-runner.ps1'
& $runnerSetup
if ($LASTEXITCODE -ne 0) { throw 'Cloud runner setup failed.' }

Write-Host 'Find Hub is configured to run entirely in the cloud.' -ForegroundColor Green
Write-Host 'The persistent Windows VM may be disconnected from RDP; the GitHub runner continues as a Windows service.' -ForegroundColor Green
Write-Host 'Do not delete/reimage the VM or its user profile unless you are prepared to repeat the Google sign-in.' -ForegroundColor Yellow
