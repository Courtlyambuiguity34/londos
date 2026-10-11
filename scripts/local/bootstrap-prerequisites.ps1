[CmdletBinding()]
param(
  [ValidateSet("preview", "local", "full", "server")]
  [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ErrorLog = Join-Path $Root ".local\logs\windows-install-error.log"

function Invoke-LondosInstall {
  if ($Mode -in @("local", "full")) {
    Write-Host "Preparing native PostgreSQL for the default Windows local mode..."
    & (Join-Path $PSScriptRoot "native-postgres.ps1") -Action install
  } elseif ($Mode -eq "server") {
    Write-Host "Hosted server mode selected. Native PostgreSQL and Docker will not be installed."
  }
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
    "Message: $($_.Exception.Message)"
  )
  Set-Content -LiteralPath $ErrorLog -Value $Summary -Encoding UTF8
  Write-Host ""
  Write-Host "Londos installation stopped safely: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Error summary: $ErrorLog"
  exit 1
}
