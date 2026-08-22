$ErrorActionPreference = 'Stop'

$repo = 'codeisafourletter/findhublogger'
$repoUrl = "https://github.com/$repo"
$runnerRoot = Join-Path $env:USERPROFILE 'actions-runner-findhub'
$runnerName = "findhub-$env:COMPUTERNAME"
$startupDir = [Environment]::GetFolderPath('Startup')
$startupLink = Join-Path $startupDir 'Find Hub GitHub Runner.lnk'

if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) was not found.'
}
& gh auth status
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run gh auth login first.'
}

New-Item -ItemType Directory -Force -Path $runnerRoot | Out-Null
$configCmd = Join-Path $runnerRoot 'config.cmd'
$runCmd = Join-Path $runnerRoot 'run.cmd'

if (!(Test-Path -LiteralPath $configCmd) -or !(Test-Path -LiteralPath $runCmd)) {
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
  Write-Host 'Registering this computer as the Find Hub self-hosted runner...'
  $token = (& gh api --method POST "repos/$repo/actions/runners/registration-token" --jq '.token').Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
    throw 'Could not obtain a GitHub runner registration token.'
  }

  Push-Location $runnerRoot
  try {
    & $configCmd --url $repoUrl --token $token --name $runnerName --labels findhub --work '_work' --unattended --replace
    if ($LASTEXITCODE -ne 0) { throw 'GitHub Actions runner registration failed.' }
  }
  finally {
    Pop-Location
  }
}

# Start the runner automatically whenever this Windows user signs in. Running it
# under the same user is intentional: Google session binding and the Find Hub
# Chrome profile are tied to this machine/user context.
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($startupLink)
$shortcut.TargetPath = $env:ComSpec
$shortcut.Arguments = "/c `"`"$runCmd`"`""
$shortcut.WorkingDirectory = $runnerRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start the Find Hub GitHub Actions self-hosted runner'
$shortcut.Save()

$alreadyRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($runnerRoot) -and ($_.CommandLine.Contains('Runner.Listener') -or $_.CommandLine.Contains('run.cmd'))
}
if (!$alreadyRunning) {
  Start-Process -FilePath $runCmd -WorkingDirectory $runnerRoot -WindowStyle Minimized
}

Write-Host "Self-hosted runner '$runnerName' is configured with label 'findhub'." -ForegroundColor Green
Write-Host "Runner files: $runnerRoot"
Write-Host 'It will start again when this Windows user signs in.'
