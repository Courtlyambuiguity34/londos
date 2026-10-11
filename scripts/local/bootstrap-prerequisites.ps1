[CmdletBinding()]
param(
  [ValidateSet("preview", "local", "full", "server")]
  [string]$Mode = "local",
  [switch]$DockerInstallOnly
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ErrorLog = Join-Path $Root ".local\logs\windows-install-error.log"

function Test-Administrator {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
  return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-DockerReady {
  try {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Wait-Docker {
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if (Test-DockerReady) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Add-DockerCandidateRoot {
  param(
    [System.Collections.Generic.List[string]]$Roots,
    [AllowNull()][string]$Value
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  $Candidate = [Environment]::ExpandEnvironmentVariables($Value.Trim().Trim('"'))
  $Candidate = $Candidate -replace ',\d+$', ''
  if ([string]::IsNullOrWhiteSpace($Candidate)) { return }
  if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
    $Candidate = Split-Path -Parent $Candidate
  }
  try { $Candidate = [IO.Path]::GetFullPath($Candidate) } catch { return }
  if (-not $Roots.Contains($Candidate)) { $null = $Roots.Add($Candidate) }
}

function Find-DockerInstallation {
  $Roots = New-Object 'System.Collections.Generic.List[string]'
  Add-DockerCandidateRoot $Roots $env:LONDOS_DOCKER_DESKTOP_DIR

  $DockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($DockerCommand) {
    Add-DockerCandidateRoot $Roots $DockerCommand.Source
    $CommandParent = Split-Path -Parent $DockerCommand.Source
    Add-DockerCandidateRoot $Roots (Split-Path -Parent $CommandParent)
    Add-DockerCandidateRoot $Roots (Split-Path -Parent (Split-Path -Parent $CommandParent))
  }

  $RegistryPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Docker Desktop.exe',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Docker Desktop.exe'
  )
  foreach ($RegistryPath in $RegistryPaths) {
    foreach ($Record in @(Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue)) {
      if ($RegistryPath -like '*\Uninstall\*' -and $Record.DisplayName -ne 'Docker Desktop') {
        continue
      }
      Add-DockerCandidateRoot $Roots $Record.InstallLocation
      Add-DockerCandidateRoot $Roots $Record.DisplayIcon
      Add-DockerCandidateRoot $Roots $Record.'(default)'
    }
  }

  Add-DockerCandidateRoot $Roots (Join-Path $env:ProgramFiles 'Docker\Docker')
  if (${env:ProgramFiles(x86)}) {
    Add-DockerCandidateRoot $Roots (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker')
  }
  if ($env:LOCALAPPDATA) {
    Add-DockerCandidateRoot $Roots (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker')
    Add-DockerCandidateRoot $Roots (Join-Path $env:LOCALAPPDATA 'Docker')
  }

  $Cli = if ($DockerCommand) { $DockerCommand.Source } else { $null }
  $Desktop = $null
  foreach ($Root in $Roots) {
    if (-not $Cli) {
      foreach ($Path in @(
        (Join-Path $Root 'docker.exe'),
        (Join-Path $Root 'resources\bin\docker.exe'),
        (Join-Path $Root 'Docker\resources\bin\docker.exe')
      )) {
        if (Test-Path -LiteralPath $Path -PathType Leaf) { $Cli = $Path; break }
      }
    }
    if (-not $Desktop) {
      foreach ($Path in @(
        (Join-Path $Root 'Docker Desktop.exe'),
        (Join-Path $Root 'Docker\Docker Desktop.exe')
      )) {
        if (Test-Path -LiteralPath $Path -PathType Leaf) { $Desktop = $Path; break }
      }
    }
  }
  return [PSCustomObject]@{ Cli = $Cli; Desktop = $Desktop }
}

function Find-Winget {
  $Command = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($Command) { return $Command.Source }
  if ($env:LOCALAPPDATA) {
    $Alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
    if (Test-Path -LiteralPath $Alias -PathType Leaf) { return $Alias }
  }
  $Package = Get-AppxPackage -Name Microsoft.DesktopAppInstaller -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending | Select-Object -First 1
  if ($Package) {
    $Executable = Join-Path $Package.InstallLocation 'winget.exe'
    if (Test-Path -LiteralPath $Executable -PathType Leaf) { return $Executable }
  }
  return $null
}

function Install-DockerDesktop {
  if (-not (Test-Administrator)) {
    throw "The Docker-only installer must run with administrator permission."
  }
  $Winget = Find-Winget
  if (-not $Winget) {
    throw "Windows Package Manager (winget) is unavailable in the elevated account. Run INSTALL-WINDOWS.bat from the Windows account that owns App Installer, or install Docker Desktop manually."
  }
  Write-Host "Installing Docker Desktop through Windows Package Manager..."
  & $Winget install --exact --id Docker.DockerDesktop --source winget `
    --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop installation failed with exit code $LASTEXITCODE."
  }
}

function Request-DockerDesktopInstall {
  if (Test-Administrator) {
    Write-Host "The installer is already running with administrator permission."
    Install-DockerDesktop
    return
  }
  Write-Host "Docker Desktop is not installed. Windows will now show an Administrator permission (UAC) prompt."
  Write-Host "Approve only if the program shown is Windows PowerShell and this Londos installer path is correct."
  $Arguments = @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $PSCommandPath),
    '-Mode', $Mode,
    '-DockerInstallOnly'
  )
  try {
    $Process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $Arguments `
      -Wait -PassThru
  } catch {
    throw "Administrator permission was cancelled or could not be requested. Docker Desktop was not installed."
  }
  if ($Process.ExitCode -ne 0) {
    throw "The administrator Docker installation step failed with exit code $($Process.ExitCode). See $ErrorLog."
  }
}

function Ensure-Docker {
  if (Test-DockerReady) { return }
  $Docker = Find-DockerInstallation
  if (-not $Docker.Cli -and -not $Docker.Desktop) {
    Request-DockerDesktopInstall
    $Docker = Find-DockerInstallation
    if (-not $Docker.Cli -and -not $Docker.Desktop) {
      throw "Docker Desktop installation completed but its files were not found. Restart Windows if requested, or set LONDOS_DOCKER_DESKTOP_DIR to the installed folder and rerun."
    }
  } else {
    Write-Host "Using the existing Docker Desktop installation."
  }
  if ($Docker.Cli) {
    $DockerBin = Split-Path -Parent $Docker.Cli
    if (($env:Path -split ';') -notcontains $DockerBin) { $env:Path = "$DockerBin;$env:Path" }
  }
  if ($Docker.Desktop) {
    Write-Host "Starting Docker Desktop from its detected installation."
    Start-Process -FilePath $Docker.Desktop | Out-Null
  } elseif (-not (Test-DockerReady)) {
    throw "Docker was found but Docker Desktop could not be started. Start it manually or set LONDOS_DOCKER_DESKTOP_DIR to its installation folder."
  }
  Write-Host "Waiting for Docker Desktop to become ready..."
  if (-not (Wait-Docker)) {
    throw "Docker Desktop is installed but not ready. Start it, complete its first-run screen, and rerun this installer."
  }
}

function Invoke-LondosInstall {
  if ($DockerInstallOnly) {
    Install-DockerDesktop
    return
  }
  if ($Mode -in @("local", "full")) { Ensure-Docker }
  & (Join-Path $PSScriptRoot "run-with-node.ps1") -Bootstrap install $Mode
  if ($LASTEXITCODE -ne 0) { throw "The Londos installation step failed with exit code $LASTEXITCODE." }
}

if (Test-Path -LiteralPath $ErrorLog) { Remove-Item -LiteralPath $ErrorLog -Force }
try {
  Invoke-LondosInstall
  exit 0
} catch {
  $Directory = Split-Path -Parent $ErrorLog
  New-Item -ItemType Directory -Force -Path $Directory | Out-Null
  $Summary = @(
    "Londos Windows installer failure",
    "Time: $([DateTimeOffset]::Now.ToString('o'))",
    "Mode: $Mode",
    "Docker-only elevated step: $DockerInstallOnly",
    "Message: $($_.Exception.Message)"
  )
  if (-not $DockerInstallOnly -and (Test-Path -LiteralPath $ErrorLog)) {
    Add-Content -LiteralPath $ErrorLog -Value @("", "Parent installer context:", $Summary[-1]) `
      -Encoding UTF8
  } else {
    Set-Content -LiteralPath $ErrorLog -Value $Summary -Encoding UTF8
  }
  Write-Host ""
  Write-Host "Londos installation stopped safely: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Error summary: $ErrorLog"
  exit 1
}
