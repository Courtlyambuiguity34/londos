[CmdletBinding()]
param(
  [ValidateSet("preview", "local", "full", "server")]
  [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

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
  if (-not $Roots.Contains($Candidate)) { $Roots.Add($Candidate) }
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

function Ensure-Docker {
  if (Test-DockerReady) { return }
  $Docker = Find-DockerInstallation
  if (-not $Docker.Cli -and -not $Docker.Desktop) {
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $Winget) {
      throw "Automatic Docker Desktop installation needs Windows Package Manager (winget). Install Docker Desktop, then rerun."
    }
    Write-Host "Installing Docker Desktop through Windows Package Manager; Windows may request approval..."
    & $Winget.Source install --exact --id Docker.DockerDesktop --source winget `
      --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop installation failed with exit code $LASTEXITCODE." }
    $Docker = Find-DockerInstallation
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

if ($Mode -in @("local", "full")) { Ensure-Docker }
& (Join-Path $PSScriptRoot "run-with-node.ps1") -Bootstrap install $Mode
exit $LASTEXITCODE
