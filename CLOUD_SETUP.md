# Cloud deployment

`findhublogger` must use a persistent browser identity. Standard GitHub-hosted runners are intentionally disposable, so the production collector runs on a persistent cloud Windows VM registered as a GitHub Actions self-hosted runner.

## VM requirements

Use a normal persistent VM, not a spot/preemptible/ephemeral instance.

Recommended baseline:

- Windows Server 2022 x64
- 2 vCPU or more
- 4 GB RAM or more
- 30 GB persistent system disk or more
- outbound HTTPS access to GitHub, Google, Node.js, and the configured sheet endpoint
- RDP access for the one-time Google sign-in
- automatic restart after host maintenance/reboot

The VM does not need to remain connected to an RDP client after setup.

## Why a persistent VM is required

The old workflow copied Playwright browser storage from one device into a new GitHub-hosted VM. Live diagnostics showed that the cookies/secrets were present but Google still rendered `Sign in` on the hosted runner.

The repaired design keeps the Chrome profile at:

`%USERPROFILE%\.findhublogger\chrome-auth-profile`

The GitHub runner service is deliberately configured to run under the same Windows account that created that Chrome profile.

## One-time setup

1. Create the persistent Windows VM and RDP into it.
2. Clone this repository on the VM.
3. Open **PowerShell as Administrator** in the repository root.
4. Run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\finish-github-setup.ps1
   ```

5. The script installs missing prerequisites, authenticates GitHub CLI if needed, and opens Chrome.
6. Complete the Google sign-in in the Chrome window and confirm the target person is visible in Find Hub.
7. Return to PowerShell and press Enter when prompted.
8. Enter the current Windows account password when the runner setup asks for it. This is used by Windows to install the GitHub Actions runner as a service under that same account.

After setup, RDP can be disconnected. The GitHub Actions runner remains active as an automatic Windows service.

## What must remain persistent

Do not delete/reimage the VM or remove the Windows user profile. If the browser profile is lost or Google invalidates the session, RDP into the VM and run:

```powershell
cd <repo>\cloud
npm run auth
```

Then complete Google sign-in again.

## GitHub Actions

Pull requests run syntax/installation validation on GitHub-hosted runners. Scheduled and manually dispatched production collection jobs require the persistent runner labels:

`self-hosted`, `Windows`, `X64`, `findhub`

If that cloud VM is offline, scheduled collection cannot run until the runner returns online.
