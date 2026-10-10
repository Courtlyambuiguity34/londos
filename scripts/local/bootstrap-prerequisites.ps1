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

function Ensure-Docker {
  if (Test-DockerReady) { return }
  $Docker = Get-Command docker.exe -ErrorAction SilentlyContinue
  if (-not $Docker) {
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $Winget) {
      throw "Automatic Docker Desktop installation needs Windows Package Manager (winget). Install Docker Desktop, then rerun."
    }
    Write-Host "Installing Docker Desktop through Windows Package Manager; Windows may request approval..."
    & $Winget.Source install --exact --id Docker.DockerDesktop --source winget `
      --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop installation failed with exit code $LASTEXITCODE." }
    $DockerBin = Join-Path $env:ProgramFiles "Docker\Docker\resources\bin"
    if (Test-Path -LiteralPath $DockerBin) { $env:Path = "$DockerBin;$env:Path" }
  }
  $Desktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path -LiteralPath $Desktop) {
    Start-Process -FilePath $Desktop | Out-Null
  }
  Write-Host "Waiting for Docker Desktop to become ready..."
  if (-not (Wait-Docker)) {
    throw "Docker Desktop is installed but not ready. Start it, complete its first-run screen, and rerun this installer."
  }
}

if ($Mode -in @("local", "full")) { Ensure-Docker }
& (Join-Path $PSScriptRoot "run-with-node.ps1") -Bootstrap install $Mode
exit $LASTEXITCODE
