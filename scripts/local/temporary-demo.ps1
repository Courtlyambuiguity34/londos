[CmdletBinding()]
param(
  [string]$VisitorEmail
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$CloudflaredVersion = "2026.10.0"
$CloudflaredSha256 = "86AEE4017B26625CEE8484C113558F48EFFA4CD47F7AA05FCF425604E5D2B23C"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/$CloudflaredVersion/cloudflared-windows-amd64.exe"
$RuntimeDirectory = Join-Path $Root "core\runtime\cloudflared-$CloudflaredVersion"
$CloudflaredPath = Join-Path $RuntimeDirectory "cloudflared.exe"
$PreviewBatch = Join-Path $Root "START-PREVIEW-WINDOWS.bat"
$ReadinessUrl = "http://127.0.0.1:3000/api/ready"

function Get-Readiness {
  try {
    return Invoke-RestMethod -Uri $ReadinessUrl -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-SafeFixturePreview($State) {
  return $State -and $State.ready -eq $true -and $State.mode -eq "fixture-preview" -and `
    $State.database -eq $false -and $State.authentication -eq $false -and `
    $State.worker -eq "not-configured"
}

function Assert-VisitorEmail([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "A visitor email address is required." }
  try { $Parsed = [System.Net.Mail.MailAddress]::new($Value.Trim()) } catch {
    throw "Enter one valid visitor email address."
  }
  if ($Parsed.Address -ne $Value.Trim()) { throw "Enter one valid visitor email address." }
  return $Parsed.Address
}

function Test-VerifiedCloudflared {
  if (-not (Test-Path -LiteralPath $CloudflaredPath -PathType Leaf)) { return $false }
  $Actual = (Get-FileHash -LiteralPath $CloudflaredPath -Algorithm SHA256).Hash.ToUpperInvariant()
  return $Actual -eq $CloudflaredSha256
}

function Install-VerifiedCloudflared {
  if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -notmatch "AMD64") {
    throw "The pinned temporary-link runtime supports 64-bit Intel/AMD Windows only."
  }
  if (Test-VerifiedCloudflared) {
    Write-Host "Using the cached, checksum-verified Cloudflare Tunnel runtime."
    return
  }
  if (Test-Path -LiteralPath $CloudflaredPath) {
    Write-Host "The cached Cloudflare Tunnel runtime failed verification and will be replaced."
    Remove-Item -LiteralPath $CloudflaredPath -Force
  }
  New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null
  $DownloadPath = "$CloudflaredPath.download-$PID"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host "Downloading the pinned Cloudflare Tunnel runtime from its official GitHub release..."
    Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $DownloadPath
    $Actual = (Get-FileHash -LiteralPath $DownloadPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($Actual -ne $CloudflaredSha256) {
      throw "The Cloudflare Tunnel download failed checksum verification."
    }
    Move-Item -LiteralPath $DownloadPath -Destination $CloudflaredPath -Force
  } finally {
    if (Test-Path -LiteralPath $DownloadPath) { Remove-Item -LiteralPath $DownloadPath -Force }
  }
}

if ($env:OS -ne "Windows_NT") { throw "Use this launcher on Windows." }
if (-not (Test-Path -LiteralPath $PreviewBatch -PathType Leaf)) { throw "START-PREVIEW-WINDOWS.bat is missing." }
if (-not $VisitorEmail) { $VisitorEmail = Read-Host "Email address allowed to open this temporary demo" }
$VisitorEmail = Assert-VisitorEmail $VisitorEmail

$Readiness = Get-Readiness
if ($Readiness -and -not (Test-SafeFixturePreview $Readiness)) {
  throw "Port 3000 is serving the full Londos core. Stop that launcher before sharing a fixture-only demo."
}
if (-not $Readiness) {
  Write-Host "Starting the fictional, database-free Londos preview in a separate window..."
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", ('"{0}"' -f $PreviewBatch)) -WorkingDirectory $Root | Out-Null
  $Deadline = [DateTimeOffset]::Now.AddMinutes(2)
  do {
    Start-Sleep -Seconds 2
    $Readiness = Get-Readiness
  } while (-not $Readiness -and [DateTimeOffset]::Now -lt $Deadline)
}
if (-not (Test-SafeFixturePreview $Readiness)) {
  throw "The safe fixture preview did not become ready within two minutes. Read its launcher window."
}

Install-VerifiedCloudflared
Write-Host ""
Write-Host "Cloudflare will print a random https://...trycloudflare.com address below." -ForegroundColor Cyan
Write-Host "Send that address only to $VisitorEmail; Cloudflare will require that email to authenticate."
Write-Host "Keep this window and the preview window open. Press Ctrl+C here to close the public link."
Write-Host "This testing link has no uptime guarantee and never exposes the local database or private roles."
Write-Host ""
& $CloudflaredPath tunnel --url "http://127.0.0.1:3000" --allowed-mail $VisitorEmail
if ($LASTEXITCODE -ne 0) { throw "Cloudflare Tunnel stopped with exit code $LASTEXITCODE." }
exit 0
