$ErrorActionPreference = 'Stop'

$repo = 'codeisafourletter/findhublogger'
$repoUrl = "https://github.com/$repo"
$runnerRoot = 'C:\actions-runner-findhub'
$runnerName = "findhub-cloud-$env:COMPUTERNAME"
$windowsAccount = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this setup from an Administrator PowerShell session on the persistent cloud Windows VM.'
}

if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) was not found.'
}
& gh auth status
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run gh auth login first.'
}

New-Item -ItemType Directory -Force -Path $runnerRoot | Out-Null
$configCmd = Join-Path $runnerRoot 'config.cmd'

if (!(Test-Path -LiteralPath $configCmd)) {
  Write-Host 'Downloading the latest GitHub Actions runner for Windows x64...'
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers @{ 'User-Agent' = 'findhublogger-setup' }
  $asset = $release.assets | Where-Object { $_.name -match '^actions-runner-win-x64-.*\.zip$' } | Select-Object -First 1
  if (!$asset) { throw 'Could not find a Windows x64 GitHub Actions runner release.' }

  $zipPath = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers @{ 'User-Agent' = 'findhublogger-setup' }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $runnerRoot -Force
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}

$runnerConfig = Join-Path $runnerRoot '.runner'
if (!(Test-Path -LiteralPath $runnerConfig)) {
  Write-Host "Registering this persistent cloud VM as '$runnerName'..."
  Write-Host "The runner service will use $windowsAccount so Chrome can reuse that account's persistent Find Hub profile." -ForegroundColor Yellow

  $securePassword = Read-Host "Windows password for $windowsAccount (used only to install the runner service)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = $null
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) { throw 'Windows account password is required.' }

    $token = (& gh api --method POST "repos/$repo/actions/runners/registration-token" --jq '.token').Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
      throw 'Could not obtain a GitHub runner registration token.'
    }

    Push-Location $runnerRoot
    try {
      & $configCmd --url $repoUrl --token $token --name $runnerName --labels findhub,cloud --work '_work' --unattended --replace --runasservice --windowslogonaccount $windowsAccount --windowslogonpassword $plainPassword
      if ($LASTEXITCODE -ne 0) { throw 'GitHub Actions runner registration failed.' }
    }
    finally {
      Pop-Location
    }
  }
  finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $plainPassword = $null
    $securePassword = $null
  }
}

$service = Get-Service 'actions.runner.*' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*.$runnerName.service" } | Select-Object -First 1
if (!$service) {
  $service = Get-Service 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (!$service) { throw 'Runner registration completed but the Windows service was not found.' }

Set-Service -Name $service.Name -StartupType Automatic
if ($service.Status -ne 'Running') { Start-Service -Name $service.Name }

Write-Host "Cloud runner '$runnerName' is configured as an automatic Windows service." -ForegroundColor Green
Write-Host "Runner service account: $windowsAccount"
Write-Host "Runner files: $runnerRoot"
Write-Host 'The VM can remain unattended; it does not require an active RDP session after setup.'
